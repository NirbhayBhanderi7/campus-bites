'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DEFAULT_DATABASE_PATH = path.join(ROOT, 'data', 'campusbites.sqlite');
const SESSION_COOKIE = 'campusbites_session';
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;
const PASSWORD_SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const ORDER_STATUSES = new Set(['Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled']);
const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp'
};

function openDatabase(databasePath) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    const database = new DatabaseSync(databasePath);
    database.exec(`
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            student_id TEXT UNIQUE COLLATE NOCASE,
            email TEXT NOT NULL COLLATE NOCASE UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('student', 'admin')),
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            canteen_name TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled')),
            total REAL NOT NULL,
            payload TEXT NOT NULL,
            placed_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
        CREATE INDEX IF NOT EXISTS orders_user_placed_idx ON orders(user_id, placed_at);
        CREATE INDEX IF NOT EXISTS orders_placed_idx ON orders(placed_at);
    `);
    database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
    return database;
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const derivedKey = crypto.scryptSync(password, salt, 64, PASSWORD_SCRYPT_OPTIONS);
    return 'scrypt$' + salt.toString('hex') + '$' + derivedKey.toString('hex');
}

function verifyPassword(password, storedHash) {
    if (typeof password !== 'string' || password.length > PASSWORD_MAX_LENGTH) return false;
    const parts = String(storedHash || '').split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    if (salt.length !== 16 || expected.length !== 64) return false;
    const actual = crypto.scryptSync(password, salt, 64, PASSWORD_SCRYPT_OPTIONS);
    return crypto.timingSafeEqual(actual, expected);
}

function validatePassword(password) {
    return typeof password === 'string' &&
        password.length >= PASSWORD_MIN_LENGTH &&
        password.length <= PASSWORD_MAX_LENGTH;
}

function createAccount(database, account) {
    const id = crypto.randomUUID();
    const name = String(account.name || '').trim();
    const email = String(account.email || '').trim().toLowerCase();
    const studentId = account.role === 'student' ? String(account.studentId || '').trim() : null;
    const password = account.password;
    if (!name || name.length > 100) throw new Error('Enter a name between 1 and 100 characters.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter a valid email address.');
    if (!validatePassword(password)) throw new Error('Password must be 10 to 128 characters long.');
    if (account.role === 'student' && (!studentId || studentId.length > 40)) {
        throw new Error('Enter a student ID between 1 and 40 characters.');
    }

    database.prepare(`
        INSERT INTO users (id, name, student_id, email, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, studentId, email, hashPassword(password), account.role, new Date().toISOString());

    return database.prepare('SELECT id, name, student_id, email, role FROM users WHERE id = ?').get(id);
}

function publicUser(user) {
    return {
        id: user.id,
        name: user.name,
        studentId: user.student_id || '',
        email: user.email,
        role: user.role
    };
}

function sendJson(response, statusCode, value, headers) {
    const body = JSON.stringify(value);
    response.writeHead(statusCode, Object.assign({
        'Cache-Control': 'no-store',
        'Content-Length': Buffer.byteLength(body),
        'Content-Type': 'application/json; charset=utf-8'
    }, headers || {}));
    response.end(body);
}

function sendError(response, statusCode, message) {
    sendJson(response, statusCode, { error: message });
}

function parseCookies(header) {
    const cookies = {};
    String(header || '').split(';').forEach(function (part) {
        const separator = part.indexOf('=');
        if (separator < 0) return;
        const name = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();
        if (name) cookies[name] = value;
    });
    return cookies;
}

function parseJsonBody(request) {
    return new Promise(function (resolve, reject) {
        let body = '';
        let tooLarge = false;
        request.setEncoding('utf8');
        request.on('data', function (chunk) {
            if (tooLarge) return;
            body += chunk;
            if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
                tooLarge = true;
                reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
            }
        });
        request.on('end', function () {
            if (!body) {
                resolve({});
                return;
            }
            try {
                const value = JSON.parse(body);
                if (!value || Array.isArray(value) || typeof value !== 'object') {
                    reject(Object.assign(new Error('Request body must be a JSON object.'), { statusCode: 400 }));
                    return;
                }
                resolve(value);
            } catch (error) {
                reject(Object.assign(new Error('Request body contains invalid JSON.'), { statusCode: 400 }));
            }
        });
        request.on('error', reject);
    });
}

function sessionCookie(token, maxAgeSeconds) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return SESSION_COOKIE + '=' + (token || '') + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' +
        maxAgeSeconds + secure;
}

function createSession(database, response, userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS).toISOString();
    database.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
        .run(crypto.createHash('sha256').update(token).digest('hex'), userId, expiresAt);
    response.setHeader('Set-Cookie', sessionCookie(token, SESSION_LIFETIME_MS / 1000));
}

function clearSession(database, request, response) {
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    if (token) {
        database.prepare('DELETE FROM sessions WHERE token_hash = ?')
            .run(crypto.createHash('sha256').update(token).digest('hex'));
    }
    response.setHeader('Set-Cookie', sessionCookie('', 0));
}

function getUser(database, request) {
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const session = database.prepare(`
        SELECT users.id, users.name, users.student_id, users.email, users.role, sessions.expires_at
        FROM sessions JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ?
    `).get(tokenHash);
    if (!session) return null;
    if (session.expires_at <= new Date().toISOString()) {
        database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
        return null;
    }
    return session;
}

function requireRole(database, request, response, role) {
    const user = getUser(database, request);
    if (!user) {
        sendError(response, 401, 'Please sign in to continue.');
        return null;
    }
    if (user.role !== role) {
        sendError(response, 403, 'You do not have permission to perform this action.');
        return null;
    }
    return user;
}

function checkRequestOrigin(request, response) {
    const origin = request.headers.origin;
    if (!origin) return true;
    try {
        const originUrl = new URL(origin);
        if (originUrl.host === request.headers.host) return true;
    } catch (error) {
        sendError(response, 403, 'Request origin is not allowed.');
        return false;
    }
    sendError(response, 403, 'Request origin is not allowed.');
    return false;
}

function cleanOrderItems(value) {
    if (!Array.isArray(value) || !value.length || value.length > 30) {
        throw new Error('An order must contain between 1 and 30 items.');
    }
    let totalCents = 0;
    const items = value.map(function (item) {
        if (!item || typeof item !== 'object') throw new Error('An order item is invalid.');
        const name = String(item.name || '').trim();
        const description = String(item.description || '').trim().slice(0, 500);
        const price = Number(item.price);
        const quantity = Number(item.quantity);
        if (!name || name.length > 120 || !Number.isFinite(price) || price <= 0 || price > 100000) {
            throw new Error('An order item has invalid name or price data.');
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
            throw new Error('Item quantities must be whole numbers between 1 and 20.');
        }
        const itemCents = Math.round(price * 100);
        totalCents += itemCents * quantity;
        if (totalCents > 100000000) throw new Error('Order total is over the allowed limit.');
        const clean = {
            id: String(item.id || '').slice(0, 160),
            name: name,
            description: description,
            price: itemCents / 100,
            quantity: quantity
        };
        if (typeof item.image === 'string' && /^[a-zA-Z0-9._-]{1,120}$/.test(item.image)) {
            clean.image = item.image;
        }
        if (typeof item.imageData === 'string' && item.imageData.length <= 1400000 &&
            /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(item.imageData)) {
            clean.imageData = item.imageData;
        }
        return clean;
    });
    return { items: items, total: totalCents / 100 };
}

function serializeOrder(row, student) {
    const order = JSON.parse(row.payload);
    order.id = row.id;
    order.status = row.status;
    order.total = row.total;
    order.placedAt = row.placed_at;
    if (student) {
        order.studentName = student.name;
        order.studentEmail = student.email;
        order.studentId = student.student_id || '';
    }
    return order;
}

function createApplication(options) {
    const settings = options || {};
    const database = openDatabase(settings.databasePath || DEFAULT_DATABASE_PATH);
    const staticRoot = settings.staticRoot || ROOT;
    const loginAttempts = new Map();

    async function handleApi(request, response, url) {
        const method = request.method;
        const pathname = url.pathname;
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !checkRequestOrigin(request, response)) return;

        if (method === 'GET' && pathname === '/api/health') {
            sendJson(response, 200, { status: 'ok' });
            return;
        }

        if (method === 'POST' && pathname === '/api/auth/register') {
            const body = await parseJsonBody(request);
            try {
                const user = createAccount(database, {
                    name: body.name,
                    studentId: body.studentId,
                    email: body.email,
                    password: body.password,
                    role: 'student'
                });
                createSession(database, response, user.id);
                sendJson(response, 201, { user: publicUser(user) });
            } catch (error) {
                if (error.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE') {
                    sendError(response, 409, 'An account already uses that email or student ID.');
                    return;
                }
                sendError(response, 400, error.message);
            }
            return;
        }

        if (method === 'POST' && pathname === '/api/auth/login') {
            const body = await parseJsonBody(request);
            const identifier = String(body.identifier || body.email || '').trim().toLowerCase();
            const role = body.role === 'admin' ? 'admin' : 'student';
            const attemptKey = String(request.socket.remoteAddress || 'local') + ':' + identifier + ':' + role;
            const now = Date.now();
            const attempts = loginAttempts.get(attemptKey) || { count: 0, resetAt: now + 15 * 60 * 1000 };
            if (attempts.resetAt <= now) {
                attempts.count = 0;
                attempts.resetAt = now + 15 * 60 * 1000;
            }
            if (attempts.count >= 10) {
                sendError(response, 429, 'Too many sign-in attempts. Wait 15 minutes and try again.');
                return;
            }
            attempts.count += 1;
            loginAttempts.set(attemptKey, attempts);
            const user = database.prepare(`
                SELECT * FROM users
                WHERE (email = ? OR student_id = ?) AND role = ?
            `).get(identifier, identifier, role);
            if (!user || !verifyPassword(String(body.password || ''), user.password_hash)) {
                sendError(response, 401, 'Email or password is incorrect.');
                return;
            }
            loginAttempts.delete(attemptKey);
            createSession(database, response, user.id);
            sendJson(response, 200, { user: publicUser(user) });
            return;
        }

        if (method === 'GET' && pathname === '/api/auth/me') {
            const user = getUser(database, request);
            if (!user) {
                sendError(response, 401, 'Please sign in to continue.');
                return;
            }
            sendJson(response, 200, { user: publicUser(user) });
            return;
        }

        if (method === 'PATCH' && pathname === '/api/auth/profile') {
            const user = requireRole(database, request, response, 'student');
            if (!user) return;
            const body = await parseJsonBody(request);
            const name = String(body.name || '').trim();
            const studentId = String(body.studentId || '').trim();
            const email = String(body.email || '').trim().toLowerCase();
            if (!name || name.length > 100 || !studentId || studentId.length > 40 ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
                sendError(response, 400, 'Enter a valid name, student ID, and email address.');
                return;
            }
            try {
                database.prepare('UPDATE users SET name = ?, student_id = ?, email = ? WHERE id = ?')
                    .run(name, studentId, email, user.id);
            } catch (error) {
                if (error.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE') {
                    sendError(response, 409, 'That email or student ID is already in use.');
                    return;
                }
                throw error;
            }
            const updatedUser = database.prepare(
                'SELECT id, name, student_id, email, role FROM users WHERE id = ?'
            ).get(user.id);
            sendJson(response, 200, { user: publicUser(updatedUser) });
            return;
        }

        if (method === 'POST' && pathname === '/api/auth/logout') {
            clearSession(database, request, response);
            sendJson(response, 200, { status: 'signed out' });
            return;
        }

        if (method === 'GET' && pathname === '/api/orders') {
            const user = requireRole(database, request, response, 'student');
            if (!user) return;
            const rows = database.prepare(`
                SELECT id, status, total, payload, placed_at
                FROM orders WHERE user_id = ? ORDER BY placed_at DESC
            `).all(user.id);
            sendJson(response, 200, { orders: rows.map(function (row) { return serializeOrder(row); }) });
            return;
        }

        if (method === 'POST' && pathname === '/api/orders') {
            const user = requireRole(database, request, response, 'student');
            if (!user) return;
            const body = await parseJsonBody(request);
            let cleaned;
            try {
                cleaned = cleanOrderItems(body.items);
            } catch (error) {
                sendError(response, 400, error.message);
                return;
            }
            const canteenName = String(body.canteenName || '').trim().slice(0, 120);
            if (!canteenName) {
                sendError(response, 400, 'Select a canteen before placing an order.');
                return;
            }
            const fulfillment = body.fulfillment === 'pickup' ? 'pickup' : '';
            if (!fulfillment) {
                sendError(response, 400, 'Choose a supported fulfillment method.');
                return;
            }
            const order = {
                items: cleaned.items,
                subtotal: cleaned.total,
                tax: 0,
                discount: 0,
                total: cleaned.total,
                canteenName: canteenName,
                note: String(body.note || '').trim().slice(0, 500),
                fulfillment: fulfillment
            };
            const id = 'CB-' + crypto.randomUUID().slice(0, 8).toUpperCase();
            const placedAt = new Date().toISOString();
            database.prepare(`
                INSERT INTO orders (id, user_id, canteen_name, status, total, payload, placed_at)
                VALUES (?, ?, ?, 'Pending', ?, ?, ?)
            `).run(id, user.id, canteenName, cleaned.total, JSON.stringify(order), placedAt);
            const saved = database.prepare('SELECT id, status, total, payload, placed_at FROM orders WHERE id = ?').get(id);
            sendJson(response, 201, { order: serializeOrder(saved) });
            return;
        }

        if (method === 'GET' && pathname === '/api/admin/orders') {
            if (!requireRole(database, request, response, 'admin')) return;
            const rows = database.prepare(`
                SELECT orders.id, orders.status, orders.total, orders.payload, orders.placed_at,
                    users.name, users.email, users.student_id
                FROM orders JOIN users ON users.id = orders.user_id
                ORDER BY orders.placed_at DESC
            `).all();
            sendJson(response, 200, {
                orders: rows.map(function (row) {
                    return serializeOrder(row, { name: row.name, email: row.email, student_id: row.student_id });
                })
            });
            return;
        }

        if (method === 'GET' && pathname === '/api/admin/summary') {
            if (!requireRole(database, request, response, 'admin')) return;
            const today = new Date().toISOString().slice(0, 10) + '%';
            const summary = database.prepare(`
                SELECT COUNT(*) AS order_count,
                    COALESCE(SUM(total), 0) AS order_value,
                    SUM(CASE WHEN status NOT IN ('Completed', 'Cancelled') THEN 1 ELSE 0 END) AS active_orders,
                    SUM(CASE WHEN placed_at LIKE ? THEN 1 ELSE 0 END) AS orders_today
                FROM orders
            `).get(today);
            const students = database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'student'").get();
            sendJson(response, 200, {
                orderCount: summary.order_count,
                orderValue: Number(summary.order_value),
                activeOrders: Number(summary.active_orders || 0),
                ordersToday: Number(summary.orders_today || 0),
                studentCount: students.count
            });
            return;
        }

        const statusMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
        if (method === 'PATCH' && statusMatch) {
            if (!requireRole(database, request, response, 'admin')) return;
            const body = await parseJsonBody(request);
            const status = String(body.status || '');
            if (!ORDER_STATUSES.has(status)) {
                sendError(response, 400, 'Choose a valid order status.');
                return;
            }
            const id = decodeURIComponent(statusMatch[1]);
            const result = database.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
            if (!result.changes) {
                sendError(response, 404, 'Order not found.');
                return;
            }
            const row = database.prepare('SELECT id, status, total, payload, placed_at FROM orders WHERE id = ?').get(id);
            sendJson(response, 200, { order: serializeOrder(row) });
            return;
        }

        sendError(response, 404, 'API endpoint not found.');
    }

    async function handle(request, response) {
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('X-Frame-Options', 'DENY');
        response.setHeader('Referrer-Policy', 'same-origin');

        let url;
        try {
            url = new URL(request.url, 'http://' + (request.headers.host || '127.0.0.1'));
        } catch (error) {
            sendError(response, 400, 'Invalid request URL.');
            return;
        }

        if (url.pathname.startsWith('/api/')) {
            try {
                await handleApi(request, response, url);
            } catch (error) {
                if (response.headersSent) {
                    response.destroy(error);
                    return;
                }
                if (error.statusCode) {
                    sendError(response, error.statusCode, error.message);
                    return;
                }
                console.error('CampusBites API error:', error);
                sendError(response, 500, 'The request could not be completed.');
            }
            return;
        }

        if (request.method !== 'GET' && request.method !== 'HEAD') {
            sendError(response, 405, 'Method not allowed.');
            return;
        }

        let filePathName;
        try {
            filePathName = decodeURIComponent(url.pathname);
        } catch (error) {
            sendError(response, 400, 'Invalid page path.');
            return;
        }
        if (/^\/Student_Pages\/[^/]+\.html$/i.test(filePathName)) {
            const user = getUser(database, request);
            if (!user || user.role !== 'student') {
                response.writeHead(302, { Location: '/Home-Pages/Login.html', 'Cache-Control': 'no-store' });
                response.end();
                return;
            }
        }
        if (/^\/Admin_Pages\/[^/]+\.html$/i.test(filePathName) &&
            !/^\/Admin_Pages\/admin_login\.html$/i.test(filePathName)) {
            const user = getUser(database, request);
            if (!user || user.role !== 'admin') {
                response.writeHead(302, { Location: '/Admin_Pages/admin_login.html', 'Cache-Control': 'no-store' });
                response.end();
                return;
            }
        }

        const relative = filePathName.replace(/^[/\\]+/, '') || 'index.html';
        const allowed = relative === 'index.html' ||
            /^(Home-Pages|Student_Pages|Admin_Pages|shared)[/\\]/i.test(relative);
        if (!allowed) {
            sendError(response, 404, 'Page not found.');
            return;
        }
        const filePath = path.resolve(staticRoot, relative);
        if (filePath !== staticRoot && !filePath.startsWith(staticRoot + path.sep)) {
            sendError(response, 404, 'Page not found.');
            return;
        }
        let fileStat;
        try {
            fileStat = fs.statSync(filePath);
        } catch (error) {
            sendError(response, 404, 'Page not found.');
            return;
        }
        if (!fileStat.isFile()) {
            sendError(response, 404, 'Page not found.');
            return;
        }
        const headers = {
            'Cache-Control': path.extname(filePath).toLowerCase() === '.html' ? 'no-store' : 'public, max-age=300',
            'Content-Length': fileStat.size,
            'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
        };
        response.writeHead(200, headers);
        if (request.method === 'HEAD') {
            response.end();
            return;
        }
        const stream = fs.createReadStream(filePath);
        stream.on('error', function (error) {
            console.error('Could not serve a static file:', error);
            if (!response.headersSent) sendError(response, 500, 'The page could not be served.');
            else response.destroy(error);
        });
        stream.pipe(response);
    }

    const server = http.createServer(function (request, response) {
        handle(request, response).catch(function (error) {
            console.error('CampusBites server error:', error);
            if (!response.headersSent) sendError(response, 500, 'The request could not be completed.');
            else response.destroy(error);
        });
    });
    return { server: server, database: database };
}

async function promptText(readline, message) {
    return (await readline.question(message)).trim();
}

function promptSecret(message) {
    return new Promise(function (resolve, reject) {
        const input = process.stdin;
        if (!input.isTTY || typeof input.setRawMode !== 'function') {
            reject(new Error('Run the admin setup command in an interactive terminal.'));
            return;
        }
        let value = '';
        process.stdout.write(message);
        input.setRawMode(true);
        input.resume();
        input.setEncoding('utf8');
        function finish(error) {
            input.removeListener('data', onData);
            input.setRawMode(false);
            process.stdout.write('\n');
            if (error) reject(error);
            else resolve(value);
        }
        function onData(character) {
            if (character === '\u0003') {
                finish(new Error('Admin setup cancelled.'));
            } else if (character === '\r' || character === '\n') {
                finish();
            } else if (character === '\u007f' || character === '\b') {
                value = value.slice(0, -1);
            } else if (character >= ' ') {
                value += character;
            }
        }
        input.on('data', onData);
    });
}

async function createAdminFromTerminal(database) {
    const readline = require('node:readline/promises');
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        const name = await promptText(prompt, 'Admin display name: ');
        const email = await promptText(prompt, 'Admin email: ');
        prompt.close();
        const password = await promptSecret('Admin password (10+ characters; input hidden): ');
        const confirmation = await promptSecret('Confirm password: ');
        if (password !== confirmation) throw new Error('The passwords did not match.');
        const user = createAccount(database, { name: name, email: email, password: password, role: 'admin' });
        console.log('Admin account created for ' + user.email + '. No password was printed or stored in source.');
    } finally {
        prompt.close();
    }
}

if (require.main === module) {
    const command = process.argv[2];
    if (command === 'create-admin') {
        const database = openDatabase(process.env.CAMPUSBITES_DB || DEFAULT_DATABASE_PATH);
        createAdminFromTerminal(database).then(function () {
            database.close();
        }).catch(function (error) {
            console.error(error.message);
            database.close();
            process.exitCode = 1;
        });
    } else {
        const port = Number(process.env.PORT || 3000);
        const application = createApplication();
        application.server.once('error', function (error) {
            application.database.close();
            if (error.code === 'EADDRINUSE') {
                console.error('Port ' + port + ' is already in use. CampusBites may already be running at http://127.0.0.1:' + port + '. Open that address instead of starting another server.');
            } else {
                console.error('CampusBites could not start on port ' + port + ': ' + error.message);
            }
            process.exitCode = 1;
        });
        application.server.listen(port, '127.0.0.1', function () {
            console.log('CampusBites running at http://127.0.0.1:' + port);
            console.log('Student signup is available. Create an admin with: npm run create-admin');
        });
        process.on('SIGINT', function () {
            application.database.close();
            application.server.close(function () {
                process.exit(0);
            });
        });
        process.on('SIGTERM', function () {
            application.database.close();
            application.server.close(function () {
                process.exit(0);
            });
        });
    }
}

module.exports = {
    createAccount: createAccount,
    createApplication: createApplication,
    hashPassword: hashPassword,
    openDatabase: openDatabase,
    verifyPassword: verifyPassword
};
