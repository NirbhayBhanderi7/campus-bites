document.addEventListener('DOMContentLoaded', function () {
    const form = document.querySelector('.login-form');
    const errorMessage = document.getElementById('admin-login-error');
    if (!form) return;

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        const submitButton = form.querySelector('[type="submit"]');
        submitButton.disabled = true;
        errorMessage.hidden = true;
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    identifier: document.getElementById('admin-username').value.trim(),
                    password: document.getElementById('admin-password').value,
                    role: 'admin'
                })
            });
            const contentType = response.headers.get('content-type') || '';
            if (contentType.indexOf('application/json') === -1) {
                throw new Error('The CampusBites API is unavailable here. Run npm start and open http://127.0.0.1:3000.');
            }
            const text = await response.text();
            let result = {};
            if (text) {
                try {
                    result = JSON.parse(text);
                } catch (error) {
                    throw new Error('The server returned an invalid response.');
                }
            }
            if (!response.ok) throw new Error(result.error || 'Sign in failed.');
            window.location.href = 'admin-dashboard.html';
        } catch (error) {
            errorMessage.textContent = error instanceof TypeError ?
                'Start the CampusBites server with npm start, then open http://127.0.0.1:3000.' :
                error.message;
            errorMessage.hidden = false;
            submitButton.disabled = false;
        }
    });
});
