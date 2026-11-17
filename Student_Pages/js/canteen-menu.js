(function () {
    'use strict';

    const canteensView = document.getElementById('canteens-view');
    const menuView = document.getElementById('menu-view');
    const canteenGrid = document.querySelector('#canteens-view .canteens-grid');
    const menuGrid = document.getElementById('menu-food-grid');
    const searchInput = document.getElementById('global-search-input');
    const canteenCount = document.getElementById('canteen-count');
    const canteenName = document.getElementById('active-canteen-name');
    const canteenMeta = document.getElementById('active-canteen-meta');
    const categoryFilter = document.getElementById('menuCategoryFilter');
    let activeCanteen = null;
    let menuItems = [];

    function read(key) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(value) ? value : [];
        } catch (error) {
            console.error('Could not read CampusBites menu data.', error);
            return [];
        }
    }

    function activeCanteens() {
        return read('campusBites.adminCanteens').filter(function (canteen) {
            return canteen.active;
        });
    }

    function renderCanteens() {
        if (!canteenGrid) return;
        const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const canteens = activeCanteens().filter(function (canteen) {
            return (canteen.name + ' ' + (canteen.description || '') + ' ' + (canteen.location || ''))
                .toLowerCase().includes(query);
        });
        canteenGrid.innerHTML = '';
        if (canteenCount) {
            const total = activeCanteens().length;
            canteenCount.textContent = canteens.length + ' of ' + total + ' canteen' + (total === 1 ? '' : 's') + ' available';
        }
        if (!canteens.length) {
            canteenGrid.innerHTML = '<p class="empty-state">' + (query ?
                'No canteens match your search.' : 'No canteens are currently available.') + '</p>';
            return;
        }
        canteens.forEach(function (canteen) {
            const card = document.createElement('article');
            card.className = 'canteen-card';
            const imageWrap = document.createElement('div');
            imageWrap.className = 'canteen-card-img-wrap';
            const imageSrc = canteen.imageData || (canteen.image ? 'images/' + encodeURIComponent(canteen.image) : '');
            if (imageSrc) {
                const image = document.createElement('img');
                image.src = imageSrc;
                image.alt = canteen.name;
                imageWrap.appendChild(image);
            }
            const body = document.createElement('div');
            body.className = 'canteen-card-body';
            const name = document.createElement('h3');
            name.className = 'canteen-name';
            name.textContent = canteen.name;
            const description = document.createElement('p');
            description.className = 'canteen-desc';
            description.textContent = canteen.description || canteen.location || '';
            const location = document.createElement('span');
            location.className = 'canteen-loc';
            location.textContent = canteen.location || '';
            const action = document.createElement('span');
            action.className = 'canteen-action-link';
            action.textContent = 'View Menu →';
            body.append(name, description, location, action);
            card.append(imageWrap, body);
            card.addEventListener('click', function () { openCanteenMenu(canteen.id); });
            canteenGrid.appendChild(card);
        });
    }

    function renderCategories() {
        if (!categoryFilter) return;
        const categories = Array.from(new Set(menuItems.map(function (item) {
            return item.category;
        }).filter(Boolean)));
        categoryFilter.innerHTML = '<option value="">All categories</option>';
        categories.forEach(function (category) {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilter.appendChild(option);
        });
    }

    function renderMenu() {
        if (!menuGrid) return;
        const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const category = categoryFilter ? categoryFilter.value : '';
        const visibleItems = menuItems.filter(function (item) {
            return (!category || item.category === category) &&
                (!query || (item.name + ' ' + (item.description || '')).toLowerCase().includes(query));
        });
        menuGrid.innerHTML = '';
        if (!visibleItems.length) {
            menuGrid.innerHTML = '<p class="empty-state">No menu items have been added for this canteen.</p>';
            return;
        }
        visibleItems.forEach(function (item) {
            const card = document.createElement('article');
            card.className = 'food-card';
            const imageWrap = document.createElement('div');
            imageWrap.className = 'food-img-wrap';
            const imageSrc = item.imageData || (item.image ? 'images/' + encodeURIComponent(item.image) : '');
            if (imageSrc) {
                const image = document.createElement('img');
                image.src = imageSrc;
                image.alt = item.name;
                imageWrap.appendChild(image);
            }
            const content = document.createElement('div');
            content.className = 'food-content';
            const header = document.createElement('div');
            header.className = 'food-header';
            const name = document.createElement('h4');
            name.className = 'food-name';
            name.textContent = item.name;
            const price = document.createElement('span');
            price.className = 'food-price';
            price.textContent = '₹' + Number(item.price).toFixed(2);
            header.append(name, price);
            const description = document.createElement('p');
            description.className = 'food-description';
            description.textContent = item.description || '';
            const footer = document.createElement('div');
            footer.className = 'food-footer';
            const addButton = document.createElement('button');
            addButton.type = 'button';
            addButton.className = 'btn-add';
            addButton.textContent = '+ Add';
            addButton.addEventListener('click', function () {
                window.CampusBites.addToCart({
                    name: item.name,
                    price: Number(item.price),
                    image: item.image,
                    imageData: item.imageData,
                    description: item.description,
                    canteen: activeCanteen.id,
                    canteenName: activeCanteen.name
                });
                addButton.textContent = 'Added';
            });
            footer.appendChild(addButton);
            content.append(header, description, footer);
            card.append(imageWrap, content);
            menuGrid.appendChild(card);
        });
    }

    function openCanteenMenu(id) {
        const canteen = activeCanteens().find(function (entry) {
            return entry.id === id;
        });
        if (!canteen) return;
        activeCanteen = canteen;
        menuItems = read('campusBites.adminMenu').filter(function (item) {
            return item.canteen === canteen.id;
        });
        if (canteenName) canteenName.textContent = canteen.name;
        if (canteenMeta) canteenMeta.textContent = canteen.location || '';
        if (searchInput) searchInput.value = '';
        renderCategories();
        renderMenu();
        canteensView.style.display = 'none';
        menuView.style.display = 'block';
        window.location.hash = encodeURIComponent(id);
    }

    window.openCanteenMenu = openCanteenMenu;
    window.backToCanteens = function () {
        menuView.style.display = 'none';
        canteensView.style.display = 'block';
        window.location.hash = '';
        renderCanteens();
    };

    if (searchInput) {
        searchInput.addEventListener('input', function () {
            if (activeCanteen) renderMenu();
            else renderCanteens();
        });
    }
    if (categoryFilter) categoryFilter.addEventListener('change', renderMenu);

    document.addEventListener('DOMContentLoaded', function () {
        renderCanteens();
        const id = decodeURIComponent(window.location.hash.slice(1));
        if (id) openCanteenMenu(id);
    });
}());
