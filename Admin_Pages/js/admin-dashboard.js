document.addEventListener('DOMContentLoaded', function () {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const adminSidebar = document.getElementById('adminSidebar');

    if (mobileMenuBtn && adminSidebar) {
        mobileMenuBtn.addEventListener('click', function (event) {
            event.stopPropagation();
            adminSidebar.classList.toggle('open');
        });
        document.addEventListener('click', function (event) {
            if (window.innerWidth <= 820 && !adminSidebar.contains(event.target) && event.target !== mobileMenuBtn) {
                adminSidebar.classList.remove('open');
            }
        });
    }

    async function readApi(endpoint) {
        const response = await fetch(endpoint, { credentials: 'same-origin' });
        const text = await response.text();
        let payload = {};
        if (text) {
            try {
                payload = JSON.parse(text);
            } catch (error) {
                throw new Error('The server returned an invalid response.');
            }
        }
        if (!response.ok) throw new Error(payload.error || 'The dashboard could not be refreshed.');
        return payload;
    }

    const statValues = document.querySelectorAll('.stats-grid .stat-value');
    const statFooters = document.querySelectorAll('.stats-grid .stat-footer');
    const chartPlaceholder = document.getElementById('chartPlaceholder');
    const timeline = document.querySelector('.activity-timeline');
    const searchInput = document.getElementById('adminSearchInput');
    let recentOrders = [];

    function renderTimeline(orders) {
        if (!timeline) return;
        timeline.innerHTML = '';
        orders.slice(0, 5).forEach(function (order) {
            const item = document.createElement('div');
            item.className = 'timeline-item';
            const content = document.createElement('div');
            content.className = 'timeline-content';
            const title = document.createElement('span');
            title.className = 'timeline-title';
            const strong = document.createElement('strong');
            strong.textContent = 'Order #' + order.id;
            title.appendChild(strong);
            title.appendChild(document.createTextNode(' from ' + (order.canteenName || 'a canteen')));
            const meta = document.createElement('span');
            meta.className = 'timeline-meta';
            meta.textContent = new Date(order.placedAt).toLocaleString() +
                ' • ₹' + Number(order.total || 0).toFixed(2) +
                (order.studentName ? ' • ' + order.studentName : '');
            const badgeWrap = document.createElement('div');
            badgeWrap.className = 'timeline-badge-wrap';
            const badge = document.createElement('span');
            badge.className = 'status-badge';
            badge.textContent = order.status;
            badgeWrap.appendChild(badge);
            content.append(title, meta, badgeWrap);
            item.appendChild(content);
            timeline.appendChild(item);
        });
        if (!orders.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = 'No student orders have been placed yet.';
            timeline.appendChild(empty);
        }
        if (searchInput) {
            const query = searchInput.value.trim().toLowerCase();
            timeline.querySelectorAll('.timeline-item').forEach(function (item) {
                item.hidden = !item.textContent.toLowerCase().includes(query);
            });
        }
    }

    async function refreshDashboard() {
        try {
            const results = await Promise.all([
                readApi('/api/admin/summary'),
                readApi('/api/admin/orders')
            ]);
            const summary = results[0];
            recentOrders = results[1].orders;
            if (statValues[0]) statValues[0].textContent = '₹' + Number(summary.orderValue).toFixed(2);
            if (statValues[1]) statValues[1].textContent = String(summary.activeOrders);
            if (statValues[2]) statValues[2].textContent = String(summary.studentCount);
            if (statFooters[0]) statFooters[0].textContent = 'Total value of recorded student orders';
            if (statFooters[1]) statFooters[1].textContent = String(summary.ordersToday) + ' placed today';
            if (statFooters[2]) statFooters[2].textContent = 'Registered student accounts';
            if (chartPlaceholder) {
                chartPlaceholder.textContent = summary.orderCount ?
                    summary.orderCount + ' order' + (summary.orderCount === 1 ? '' : 's') + ' in the shared database.' :
                    'No student orders have been placed yet.';
            }
            renderTimeline(recentOrders);
        } catch (error) {
            console.error('Could not refresh the admin dashboard.', error);
            if (timeline && !timeline.children.length) {
                const message = document.createElement('p');
                message.className = 'empty-state';
                message.textContent = 'Could not load dashboard data. Refresh to try again.';
                timeline.appendChild(message);
            }
        }
    }

    const chartDisplayArea = document.getElementById('chartDisplayArea');
    if (chartDisplayArea) {
        chartDisplayArea.style.cursor = 'default';
        chartDisplayArea.removeAttribute('title');
    }
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            renderTimeline(recentOrders);
        });
    }
    refreshDashboard();
    window.setInterval(refreshDashboard, 5000);
});
