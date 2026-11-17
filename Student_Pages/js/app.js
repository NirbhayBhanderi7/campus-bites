(function () {
    'use strict';

    const keys = {
        cart: 'campusBites.cart',
        order: 'campusBites.activeOrder',
        orders: 'campusBites.orders',
        profile: 'campusBites.profile',
        messages: 'campusBites.messages',
        canteens: 'campusBites.adminCanteens',
        menu: 'campusBites.adminMenu'
    };

    function read(key, fallback) {
        const value = localStorage.getItem(key);
        if (value === null) return fallback;

        try {
            return JSON.parse(value);
        } catch (error) {
            console.error('Could not read CampusBites browser data.', error);
            return fallback;
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.error('Could not save CampusBites browser data.', error);
            window.alert('This browser could not save the data. Free some browser storage and try again.');
            throw error;
        }
    }

    async function apiRequest(endpoint, options) {
        const requestOptions = Object.assign({ credentials: 'same-origin' }, options || {});
        let response;
        try {
            response = await fetch(endpoint, requestOptions);
        } catch (error) {
            console.error('CampusBites server is unavailable.', error);
            throw new Error('Start the CampusBites server with npm start, then open http://127.0.0.1:3000.');
        }
        const text = await response.text();
        let payload = {};
        if (text) {
            try {
                payload = JSON.parse(text);
            } catch (error) {
                throw new Error('The CampusBites API is unavailable here. Run npm start and open http://127.0.0.1:3000.');
            }
        }
        if (!response.ok) throw new Error(payload.error || 'The request could not be completed.');
        return payload;
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, function (character) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[character];
        });
    }

    function money(value) {
        return '₹' + Number(value).toFixed(2);
    }

    function imagePath(fileName) {
        const imageRoot = window.location.pathname.indexOf('/Home-Pages/') !== -1 ?
            '../Student_Pages/images/' : 'images/';
        return imageRoot + encodeURIComponent(fileName);
    }

    function getCart() {
        const cart = read(keys.cart, []);
        if (!Array.isArray(cart)) return [];
        const currentCart = cart.filter(function (item) {
            return item.id !== '1' && item.id !== '2';
        });
        if (currentCart.length !== cart.length) write(keys.cart, currentCart);
        return currentCart;
    }

    function getCanteens() {
        const canteens = read(keys.canteens, []);
        return Array.isArray(canteens) ? canteens : [];
    }

    function getMenuItems() {
        const items = read(keys.menu, []);
        return Array.isArray(items) ? items : [];
    }

    function cartCount(cart) {
        return cart.reduce(function (total, item) {
            return total + item.quantity;
        }, 0);
    }

    function updateCartBadges(cart) {
        document.querySelectorAll('.cart-btn, #cart-button').forEach(function (badge) {
            badge.setAttribute('data-count', String(cartCount(cart)));
        });
    }

    function addToCart(item) {
        const cart = getCart();
        const id = item.canteen + ':' + item.name;
        const current = cart.find(function (entry) {
            return entry.id === id;
        });

        if (current) {
            current.quantity += 1;
        } else {
            cart.push({
                id: id,
                name: item.name,
                price: Number(item.price),
                image: item.image,
                imageData: item.imageData,
                description: item.description,
                canteen: item.canteen,
                canteenName: item.canteenName,
                quantity: 1
            });
        }

        write(keys.cart, cart);
        updateCartBadges(cart);
        return cart;
    }

    window.CampusBites = {
        addToCart: addToCart,
        getCart: getCart,
        updateCartBadges: updateCartBadges
    };

    function showToast(message) {
        let toast = document.getElementById('appToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'appToast';
            toast.setAttribute('role', 'status');
            toast.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:10000;padding:12px 18px;border-radius:10px;background:#26382d;color:white;font:500 14px Poppins, sans-serif;box-shadow:0 8px 24px #0003;opacity:0;transform:translateY(8px);transition:all .2s';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
        window.clearTimeout(toast.hideTimer);
        toast.hideTimer = window.setTimeout(function () {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(8px)';
        }, 2600);
    }

    function initializeCanteensPage() {
        const search = document.getElementById('searchInput');
        const grid = document.querySelector('.canteens-grid');
        if (!grid) return;
        const canteens = getCanteens().filter(function (canteen) {
            return canteen.active;
        });
        grid.innerHTML = '';
        canteens.forEach(function (canteen) {
            const card = document.createElement('article');
            card.className = 'canteen-card';
            card.dataset.status = 'open';
            card.dataset.rating = '';
            const imageSrc = canteen.imageData || (canteen.image ? imagePath(canteen.image) : '');
            const image = imageSrc ?
                '<img src="' + imageSrc + '" alt="' + escapeHtml(canteen.name) + '">' : '';
            card.innerHTML = '<div class="card-image">' + image +
                '<span class="status-badge open"><span class="status-dot"></span> Available</span></div>' +
                '<div class="card-info"><h3></h3><span class="card-location"></span></div>';
            card.querySelector('h3').textContent = canteen.name;
            card.querySelector('.card-location').textContent = canteen.location || '';
            grid.appendChild(card);
        });
        if (!canteens.length) {
            grid.innerHTML = '<p class="empty-state">No canteens have been added yet.</p>';
        }
        if (!search) return;
        const cards = Array.from(grid.querySelectorAll('.canteen-card'));
        const filters = Array.from(document.querySelectorAll('.filter-btn'));
        let activeFilter = 'all';

        function applyFilters() {
            const query = search.value.trim().toLowerCase();
            cards.forEach(function (card) {
                const text = card.textContent.toLowerCase();
                const visibleBySearch = text.includes(query);
                const visibleByFilter = activeFilter === 'all' ||
                    (activeFilter === 'open' && card.dataset.status === 'open');
                card.hidden = !(visibleBySearch && visibleByFilter);
            });
        }

        search.addEventListener('input', applyFilters);
        cards.forEach(function (card, index) {
            card.setAttribute('role', 'link');
            card.tabIndex = 0;
            function openMenu() {
                window.location.href = '../Student_Pages/Canteen-Menu.html#' + encodeURIComponent(canteens[index].id);
            }
            card.addEventListener('click', openMenu);
            card.addEventListener('keydown', function (event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openMenu();
                }
            });
        });
        filters.forEach(function (button) {
            button.addEventListener('click', function () {
                filters.forEach(function (filter) {
                    filter.classList.toggle('active', filter === button);
                });
                activeFilter = button.dataset.filter;
                applyFilters();
            });
        });
    }

    function initializeAuthForms() {
        const registerForm = document.querySelector('.register-container form');
        if (registerForm) {
            registerForm.addEventListener('submit', async function (event) {
                event.preventDefault();
                const password = document.getElementById('password').value;
                const confirmation = document.getElementById('confirmPassword').value;
                if (password !== confirmation) {
                    window.alert('Passwords do not match.');
                    document.getElementById('confirmPassword').focus();
                    return;
                }

                const submitButton = registerForm.querySelector('[type="submit"]');
                submitButton.disabled = true;
                try {
                    const result = await apiRequest('/api/auth/register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name: document.getElementById('fullName').value.trim(),
                            studentId: document.getElementById('studentId').value.trim(),
                            email: document.getElementById('email').value.trim(),
                            password: password
                        })
                    });
                    write(keys.profile, result.user);
                    window.location.href = '../Student_Pages/Student-Dashboard.html';
                } catch (error) {
                    window.alert(error.message);
                    submitButton.disabled = false;
                }
            });
        }

        const loginForm = document.querySelector('.login-container form');
        if (loginForm) {
            const emailInput = document.getElementById('email');
            const rememberCheckbox = document.getElementById('remember');
            const rememberedEmail = localStorage.getItem('campusBites.rememberedEmail');
            if (rememberedEmail && rememberCheckbox) {
                emailInput.value = rememberedEmail;
                rememberCheckbox.checked = true;
            }
            loginForm.addEventListener('submit', async function (event) {
                event.preventDefault();
                const identifier = emailInput.value.trim();
                if (rememberCheckbox && rememberCheckbox.checked) {
                    localStorage.setItem('campusBites.rememberedEmail', identifier);
                } else {
                    localStorage.removeItem('campusBites.rememberedEmail');
                }
                const submitButton = loginForm.querySelector('[type="submit"]');
                submitButton.disabled = true;
                try {
                    const result = await apiRequest('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            identifier: identifier,
                            password: document.getElementById('password').value,
                            role: 'student'
                        })
                    });
                    write(keys.profile, result.user);
                    window.location.href = '../Student_Pages/Student-Dashboard.html';
                } catch (error) {
                    window.alert(error.message);
                    submitButton.disabled = false;
                }
            });
        }

        const forgotPassword = document.querySelector('.forgot-link');
        if (forgotPassword) {
            forgotPassword.addEventListener('click', function (event) {
                event.preventDefault();
                window.alert('For this demo, password recovery is not connected to an account service.');
            });
        }
    }

    function initializeContactForm() {
        const form = document.querySelector('.contact-form');
        if (!form) return;

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            const messages = read(keys.messages, []);
            messages.push({
                name: document.getElementById('fullName').value.trim(),
                email: document.getElementById('email').value.trim(),
                message: document.getElementById('message').value.trim(),
                sentAt: new Date().toISOString()
            });
            write(keys.messages, messages);
            form.reset();
            showToast('Thanks! Your message has been saved on this device.');
        });
    }

    function initializeInfoLinks() {
        document.querySelectorAll('a[href="#"]').forEach(function (link) {
            const label = link.textContent.trim().toLowerCase();
            if (label !== 'privacy policy' && label !== 'terms of service') return;
            link.addEventListener('click', function (event) {
                event.preventDefault();
                if (label === 'privacy policy') {
                    window.alert('This local version stores account credentials as salted password hashes and uses HTTP-only sign-in cookies. Orders are stored in the local SQLite database; cart and catalog data remain in this browser.');
                } else {
                    window.alert('CampusBites runs locally. Orders are recorded in its local database, but no payment is processed and orders are not sent to a real canteen.');
                }
            });
        });
    }

    function initializeStudentPages() {
        const cart = getCart();
        updateCartBadges(cart);

        const activeOrder = read(keys.order, null);
        const dashboardOrder = document.querySelector('.active-order-card');
        if (activeOrder && dashboardOrder) {
            const names = activeOrder.items.map(function (item) {
                return item.name;
            });
            const orderName = dashboardOrder.querySelector('.order-name');
            const orderDetail = dashboardOrder.querySelector('.order-detail');
            const orderStatus = dashboardOrder.querySelector('.order-status');
            if (orderName) orderName.textContent = names.join(' & ');
            if (orderDetail) orderDetail.textContent = activeOrder.canteenName + ' • Order #' + activeOrder.id;
            if (orderStatus) {
                const statusText = orderStatus.lastChild;
                if (statusText && statusText.nodeType === Node.TEXT_NODE) {
                    statusText.textContent = ' ' + activeOrder.status;
                } else {
                    orderStatus.appendChild(document.createTextNode(' ' + activeOrder.status));
                }
            }
        } else if (dashboardOrder) {
            dashboardOrder.innerHTML = '<div class="order-info"><h3>No active order</h3>' +
                '<p class="order-detail">Place an order to see its status here.</p>' +
                '<a href="Canteen-Menu.html" class="btn-view-details">Browse menu</a></div>';
        }

        let orders = read(keys.orders, []);
        if ((!Array.isArray(orders) || !orders.length) && activeOrder) {
            orders = [activeOrder];
            write(keys.orders, orders);
        }
        if (!Array.isArray(orders)) orders = [];
        const recentBites = document.querySelector('.recent-bites');
        if (recentBites) {
            const list = recentBites.querySelectorAll('.bite-item');
            list.forEach(function (item) { item.remove(); });
            const orderList = Array.isArray(orders) ? orders.slice().reverse() : [];
            if (!orderList.length) {
                const empty = document.createElement('p');
                empty.className = 'empty-state';
                empty.textContent = 'Your placed orders will appear here.';
                recentBites.appendChild(empty);
            } else {
                orderList.slice(0, 3).forEach(function (order) {
                    (order.items || []).forEach(function (item) {
                        const bite = document.createElement('div');
                        bite.className = 'bite-item';
                        bite.innerHTML = '<div class="bite-info"><span class="bite-name"></span>' +
                            '<span class="bite-meta"></span></div><span class="bite-price"></span>';
                        bite.querySelector('.bite-name').textContent = item.name;
                        bite.querySelector('.bite-meta').textContent = order.canteenName;
                        bite.querySelector('.bite-price').textContent = money(item.price * item.quantity);
                        recentBites.appendChild(bite);
                    });
                });
            }
        }

        const quickCanteens = document.querySelector('.canteens-row');
        if (quickCanteens) {
            const canteens = getCanteens().filter(function (canteen) {
                return canteen.active;
            });
            quickCanteens.innerHTML = canteens.length ? canteens.slice(0, 3).map(function (canteen) {
                return '<a class="canteen-card" href="Canteen-Menu.html#' + encodeURIComponent(canteen.id) +
                    '"><span class="canteen-name">' + escapeHtml(canteen.name) +
                    '</span><span class="canteen-status">Available</span></a>';
            }).join('') : '<p class="empty-state">No canteens are available yet.</p>';
        }

        document.querySelectorAll('.cart-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                window.location.href = 'Orders-Cart.html';
            });
        });

        document.querySelectorAll('.icon-btn[aria-label="Notifications"]').forEach(function (button) {
            button.addEventListener('click', function () {
                showToast('You are all caught up.');
            });
        });

        const search = document.querySelector('.topbar .search-box input');
        if (search && !search.id) {
            const ordersPage = document.querySelector('.active-orders-container');
            if (ordersPage) {
                search.addEventListener('input', function () {
                    const query = search.value.trim().toLowerCase();
                    ordersPage.querySelectorAll('.order-item-card').forEach(function (item) {
                        item.hidden = !item.textContent.toLowerCase().includes(query);
                    });
                });
            } else {
                search.addEventListener('keydown', function (event) {
                    if (event.key === 'Enter' && search.value.trim()) {
                        window.location.href = 'Canteen-Menu.html?search=' + encodeURIComponent(search.value.trim());
                    }
                });
            }
        }

        document.querySelectorAll('.btn-view-details, .recent-bites .link-action').forEach(function (link) {
            link.setAttribute('href', 'Active-Orders.html');
        });

        const profile = read(keys.profile, null);
        const orderHistory = Array.isArray(orders) ? orders : [];
        const profileStats = document.querySelectorAll('.activity-card .stat-value');
        if (profileStats.length >= 4) {
            profileStats[0].textContent = String(orderHistory.length);
            profileStats[1].textContent = String(orderHistory.filter(function (order) {
                return String(order.status).toLowerCase() === 'completed';
            }).length);
            profileStats[2].textContent = String(orderHistory.filter(function (order) {
                return !['completed', 'cancelled'].includes(String(order.status).toLowerCase());
            }).length);
            profileStats[3].textContent = orderHistory.length ? orderHistory[orderHistory.length - 1].canteenName : '—';
        }
        if (profile) {
            document.querySelectorAll('.profile-name').forEach(function (element) {
                element.textContent = profile.name;
            });
            const infoValues = document.querySelectorAll('.personal-info-card .info-value');
            if (infoValues.length >= 3) {
                infoValues[0].textContent = profile.name || 'Not provided';
                infoValues[1].textContent = profile.studentId || 'Not provided';
                infoValues[2].textContent = profile.email || 'Not provided';
            }
            document.querySelectorAll('.profile-meta .meta-value').forEach(function (element) {
                if (element.textContent.includes('@') && profile.email) element.textContent = profile.email;
            });
            const greeting = document.querySelector('.greeting h2');
            if (greeting) greeting.textContent = 'Welcome, ' + profile.name.split(' ')[0] + '.';
        }

        const editButton = document.querySelector('.edit-profile-btn');
        if (editButton) {
            editButton.addEventListener('click', function () {
                const currentProfile = read(keys.profile, {
                    name: '',
                    studentId: '',
                    email: ''
                });
                const dialog = document.createElement('dialog');
                dialog.style.cssText = 'border:0;border-radius:14px;padding:24px;width:min(420px,calc(100% - 32px));box-shadow:0 20px 60px #0004;font:14px Poppins,sans-serif;color:#1f2937';
                const form = document.createElement('form');
                const heading = document.createElement('h2');
                heading.textContent = 'Edit profile';
                heading.style.margin = '0 0 16px';
                form.appendChild(heading);
                [
                    { name: 'name', label: 'Full name', value: currentProfile.name },
                    { name: 'studentId', label: 'Student ID', value: currentProfile.studentId },
                    { name: 'email', label: 'Email', value: currentProfile.email, type: 'email' }
                ].forEach(function (field) {
                    const label = document.createElement('label');
                    label.textContent = field.label;
                    label.style.cssText = 'display:block;margin:12px 0 5px;font-weight:600';
                    const input = document.createElement('input');
                    input.name = field.name;
                    input.value = field.value || '';
                    input.type = field.type || 'text';
                    input.required = true;
                    input.style.cssText = 'width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:7px;font:inherit';
                    form.appendChild(label);
                    form.appendChild(input);
                });
                const actions = document.createElement('div');
                actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:20px';
                const cancel = document.createElement('button');
                cancel.type = 'button';
                cancel.textContent = 'Cancel';
                const save = document.createElement('button');
                save.type = 'submit';
                save.textContent = 'Save';
                [cancel, save].forEach(function (button) {
                    button.style.cssText = 'padding:9px 14px;border:0;border-radius:7px;font:600 14px Poppins,sans-serif;cursor:pointer';
                });
                cancel.addEventListener('click', function () {
                    dialog.close();
                });
                actions.appendChild(cancel);
                actions.appendChild(save);
                form.appendChild(actions);
                form.addEventListener('submit', async function (event) {
                    event.preventDefault();
                    save.disabled = true;
                    try {
                        const result = await apiRequest('/api/auth/profile', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                name: form.elements.namedItem('name').value.trim(),
                                studentId: form.elements.namedItem('studentId').value.trim(),
                                email: form.elements.namedItem('email').value.trim()
                            })
                        });
                        write(keys.profile, result.user);
                        window.location.reload();
                    } catch (error) {
                        window.alert(error.message);
                        save.disabled = false;
                    }
                });
                dialog.appendChild(form);
                dialog.addEventListener('close', function () {
                    dialog.remove();
                });
                document.body.appendChild(dialog);
                dialog.showModal();
            });
        }

        document.querySelectorAll('.logout-link').forEach(function (link) {
            link.addEventListener('click', async function (event) {
                event.preventDefault();
                try {
                    await apiRequest('/api/auth/logout', { method: 'POST' });
                } catch (error) {
                    window.alert('Could not confirm sign out: ' + error.message);
                }
                localStorage.removeItem(keys.profile);
                window.location.href = '../Home-Pages/Login.html';
            });
        });
    }

    function initializeCartPage() {
        const container = document.querySelector('.cart-items-column');
        if (!container) return;

        let cart = getCart();
        container.innerHTML = '';

        const summaryRows = document.querySelector('.summary-rows');
        const totalValue = document.querySelector('.total-val');
        const placeOrderButton = document.getElementById('btnPlaceOrder');

        function render() {
            updateCartBadges(cart);
            if (!cart.length) {
                container.innerHTML = '<p class="cart-empty-state">Your cart is empty. <a href="Canteen-Menu.html">Browse the menu</a> to add something delicious.</p>';
            } else {
                container.innerHTML = cart.map(function (item, index) {
                    return '<article class="cart-item-card" data-index="' + index + '" data-unit-price="' + item.price + '">' +
                        '<div class="cart-item-image-wrapper">' + (item.imageData ?
                            '<img src="' + item.imageData + '" alt="' + escapeHtml(item.name) + '" class="cart-item-image">' :
                            item.image ? '<img src="images/' + encodeURIComponent(item.image) + '" alt="' + escapeHtml(item.name) + '" class="cart-item-image">' : '') + '</div>' +
                        '<div class="cart-item-content"><h2 class="cart-item-name">' + escapeHtml(item.name) + '</h2>' +
                        '<p class="cart-item-desc">' + escapeHtml(item.description || item.canteenName) + '</p>' +
                        '<div class="cart-item-bottom"><span class="cart-item-price">' + money(item.price * item.quantity) + '</span>' +
                        '<div class="qty-controls"><button type="button" class="qty-btn btn-decrease" aria-label="Decrease quantity">−</button>' +
                        '<span class="qty-number">' + item.quantity + '</span>' +
                        '<button type="button" class="qty-btn btn-increase" aria-label="Increase quantity">+</button></div></div></div>' +
                        '<button type="button" class="btn-remove-item" aria-label="Remove ' + escapeHtml(item.name) + '">×</button></article>';
                }).join('');
            }

            const subtotal = cart.reduce(function (sum, item) {
                return sum + item.price * item.quantity;
            }, 0);
            const total = subtotal;
            const itemCount = cartCount(cart);
            summaryRows.innerHTML = '<div class="summary-row"><span class="summary-label">Subtotal (' + itemCount + ' item' + (itemCount === 1 ? '' : 's') + ')</span><span class="summary-val">' + money(subtotal) + '</span></div>';
            totalValue.textContent = money(total);
            placeOrderButton.disabled = cart.length === 0;
        }

        container.addEventListener('click', function (event) {
            const card = event.target.closest('.cart-item-card');
            if (!card) return;
            const index = Number(card.dataset.index);
            if (event.target.closest('.btn-increase')) cart[index].quantity += 1;
            else if (event.target.closest('.btn-decrease')) cart[index].quantity = Math.max(1, cart[index].quantity - 1);
            else if (event.target.closest('.btn-remove-item')) cart.splice(index, 1);
            else return;
            write(keys.cart, cart);
            render();
        });

        document.querySelectorAll('.fulfillment-btn').forEach(function (button) {
            button.setAttribute('aria-pressed', String(button.classList.contains('selected')));
            button.addEventListener('click', function () {
                document.querySelectorAll('.fulfillment-btn').forEach(function (option) {
                    option.classList.toggle('selected', option === button);
                    option.setAttribute('aria-pressed', String(option === button));
                });
            });
        });

        const toast = document.getElementById('toastNotice');
        const toastMessage = document.getElementById('toastMessage');
        placeOrderButton.addEventListener('click', async function () {
            if (!cart.length || placeOrderButton.disabled) return;
            placeOrderButton.disabled = true;
            let order;
            try {
                const result = await apiRequest('/api/orders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        items: cart,
                        canteenName: cart[0].canteenName,
                        note: document.getElementById('special-instructions').value.trim(),
                        fulfillment: document.querySelector('.fulfillment-btn.selected') ?
                            document.querySelector('.fulfillment-btn.selected').dataset.method : 'pickup'
                    })
                });
                order = result.order;
            } catch (error) {
                window.alert('Your order was not placed: ' + error.message);
                placeOrderButton.disabled = false;
                return;
            }

            try {
                const savedOrders = read(keys.orders, []);
                const orders = Array.isArray(savedOrders) ? savedOrders : [];
                orders.unshift(order);
                write(keys.orders, orders);
                write(keys.order, order);
                write(keys.cart, []);
            } catch (error) {
                console.error('The order was saved on the server but its local display cache could not be updated.', error);
            }
            toastMessage.textContent = 'Order placed successfully! Redirecting...';
            toast.classList.add('show');
            window.setTimeout(function () {
                window.location.href = 'Active-Orders.html';
            }, 850);
        });

        render();
    }

    function renderActiveOrder(order) {
        if (!order) {
            const container = document.querySelector('.active-orders-container');
            if (container) container.innerHTML = '<section class="order-header-card"><h1 class="order-heading">No orders yet</h1>' +
                '<p class="order-subtitle">Orders you place will appear here.</p><a href="Canteen-Menu.html">Browse canteens</a></section>';
            return;
        }

        const heading = document.querySelector('.order-heading');
        const status = document.querySelector('.status-badge');
        const itemsList = document.querySelector('.order-items-list');
        const count = document.querySelector('.items-count-tag');
        const canteenName = document.querySelector('.location-canteen-name');
        const total = document.querySelector('.receipt-total-value');
        if (!heading || !itemsList) return;

        heading.textContent = 'Order #' + order.id;
        const subtitle = document.querySelector('.order-subtitle');
        if (subtitle) subtitle.textContent = 'Placed ' + new Date(order.placedAt).toLocaleString();
        if (status) {
            const pulse = status.querySelector('.status-pulse-dot');
            status.textContent = '';
            if (pulse) status.appendChild(pulse);
            status.appendChild(document.createTextNode(' ' + order.status));
        }
        const itemCount = cartCount(order.items);
        if (count) count.textContent = itemCount + ' item' + (itemCount === 1 ? '' : 's');
        if (canteenName) canteenName.textContent = order.canteenName;
        const locationAddress = document.querySelector('.location-address');
        if (locationAddress && order.canteenAddress) locationAddress.textContent = order.canteenAddress;
        if (total) total.textContent = money(order.total);
        itemsList.innerHTML = order.items.map(function (item) {
            return '<article class="order-item-card"><div class="item-img-box">' + (item.imageData ?
                '<img src="' + item.imageData + '" alt="' + escapeHtml(item.name) + '">' :
                item.image ? '<img src="images/' + encodeURIComponent(item.image) + '" alt="' + escapeHtml(item.name) + '">' : '') + '</div>' +
                '<div class="item-details"><div class="item-title-line"><h3 class="item-name">' +
                escapeHtml(item.name) + '</h3><span class="item-qty-badge">' + item.quantity + 'x</span></div>' +
                '<p class="item-desc">' + escapeHtml(item.description || item.canteenName) + '</p></div>' +
                '<div class="item-price-side"><span class="item-price">' + money(item.price * item.quantity) +
                '</span></div></article>';
        }).join('');

        const receiptRows = document.querySelector('.receipt-rows-list');
        if (receiptRows) {
            receiptRows.innerHTML = '<div class="receipt-row"><span class="receipt-label">Subtotal</span><span class="receipt-value">' +
                money(order.subtotal) + '</span></div>';
        }
    }

    function renderDashboardOrder(order) {
        const dashboardOrder = document.querySelector('.active-order-card');
        if (!dashboardOrder) return;
        if (!order) {
            dashboardOrder.innerHTML = '<div class="order-info"><h3>No active order</h3>' +
                '<p class="order-detail">Place an order to see its status here.</p>' +
                '<a href="Canteen-Menu.html" class="btn-view-details">Browse menu</a></div>';
            return;
        }
        const names = order.items.map(function (item) { return item.name; });
        const orderName = dashboardOrder.querySelector('.order-name');
        const orderDetail = dashboardOrder.querySelector('.order-detail');
        const orderStatus = dashboardOrder.querySelector('.order-status');
        if (orderName) orderName.textContent = names.join(' & ');
        if (orderDetail) orderDetail.textContent = order.canteenName + ' • Order #' + order.id;
        if (orderStatus) {
            const pulse = orderStatus.querySelector('.status-pulse-dot');
            orderStatus.textContent = '';
            if (pulse) orderStatus.appendChild(pulse);
            orderStatus.appendChild(document.createTextNode(' ' + order.status));
        }
    }

    async function refreshStudentOrders() {
        if (window.location.pathname.indexOf('/Student_Pages/') === -1) return;
        try {
            const result = await apiRequest('/api/orders');
            const orders = Array.isArray(result.orders) ? result.orders : [];
            const activeOrder = orders.find(function (order) {
                return !['completed', 'cancelled'].includes(String(order.status).toLowerCase());
            }) || null;
            write(keys.orders, orders);
            if (activeOrder) write(keys.order, activeOrder);
            else localStorage.removeItem(keys.order);

            renderDashboardOrder(activeOrder);
            renderActiveOrder(activeOrder || orders[0] || null);

            const recentBites = document.querySelector('.recent-bites');
            if (recentBites) {
                recentBites.querySelectorAll('.bite-item, .empty-state').forEach(function (item) { item.remove(); });
                if (!orders.length) {
                    const empty = document.createElement('p');
                    empty.className = 'empty-state';
                    empty.textContent = 'Your placed orders will appear here.';
                    recentBites.appendChild(empty);
                } else {
                    orders.slice(0, 3).forEach(function (order) {
                        (order.items || []).forEach(function (item) {
                            const bite = document.createElement('div');
                            bite.className = 'bite-item';
                            bite.innerHTML = '<div class="bite-info"><span class="bite-name"></span>' +
                                '<span class="bite-meta"></span></div><span class="bite-price"></span>';
                            bite.querySelector('.bite-name').textContent = item.name;
                            bite.querySelector('.bite-meta').textContent = order.canteenName;
                            bite.querySelector('.bite-price').textContent = money(item.price * item.quantity);
                            recentBites.appendChild(bite);
                        });
                    });
                }
            }

            const profileStats = document.querySelectorAll('.activity-card .stat-value');
            if (profileStats.length >= 4) {
                profileStats[0].textContent = String(orders.length);
                profileStats[1].textContent = String(orders.filter(function (order) {
                    return String(order.status).toLowerCase() === 'completed';
                }).length);
                profileStats[2].textContent = String(orders.filter(function (order) {
                    return !['completed', 'cancelled'].includes(String(order.status).toLowerCase());
                }).length);
                profileStats[3].textContent = orders.length ? orders[0].canteenName : '—';
            }
        } catch (error) {
            console.error('Could not refresh student orders from the server.', error);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        initializeCanteensPage();
        initializeAuthForms();
        initializeContactForm();
        initializeInfoLinks();
        initializeStudentPages();
        initializeCartPage();
        renderActiveOrder(read(keys.order, null));
        refreshStudentOrders();
        if (document.querySelector('.active-orders-container')) {
            window.setInterval(refreshStudentOrders, 5000);
        }
    });
}());
