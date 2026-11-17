# CampusBites local app

## Run the application

Use Node.js 22.13 or newer. From the project root, run:

```powershell
npm start
```

Open `http://127.0.0.1:3000`. Do not open the HTML files directly with `file://` or use a separate static-file server; all pages and API requests must use this same origin.

## Create an administrator

In a second terminal at the project root, run:

```powershell
npm run create-admin
```

Enter an administrator name, email, and password when prompted. Password input is hidden. There is no default admin account or password. Students can register from the public registration page; there is no public admin registration.

Passwords must be 10–128 characters. They are stored as salted scrypt hashes. Login sessions use HttpOnly, SameSite cookies. Student orders and accounts are saved in `data/campusbites.sqlite`; that local database is ignored by Git.

## Local prototype limits

This server binds only to `127.0.0.1`, so it is for local development on this computer, not shared hosting or production. Orders are recorded and visible to the admin but are not sent to a real canteen and no payment is processed. Canteen and menu edits, including uploaded images, remain in this browser's local storage.
