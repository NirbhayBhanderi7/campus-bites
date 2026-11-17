(function () {
    'use strict';

    const canteenKey = 'campusBites.adminCanteens';
    const menuKey = 'campusBites.adminMenu';
    const categoryKey = 'campusBites.adminMenuCategories';

    async function apiRequest(endpoint, options) {
        const requestOptions = Object.assign({ credentials: 'same-origin' }, options || {});
        const response = await fetch(endpoint, requestOptions);
        const text = await response.text();
        let payload = {};
        if (text) {
            try {
                payload = JSON.parse(text);
            } catch (error) {
                throw new Error('The server returned an invalid response.');
            }
        }
        if (!response.ok) throw new Error(payload.error || 'The request could not be completed.');
        return payload;
    }

    function readCanteens() {
        const saved = localStorage.getItem(canteenKey);
        if (!saved) return [];
        try {
            const canteens = JSON.parse(saved);
            return Array.isArray(canteens) ? canteens : [];
        } catch (error) {
            console.error('Could not read saved canteens.', error);
            return [];
        }
    }

    function saveCanteens(canteens) {
        try {
            localStorage.setItem(canteenKey, JSON.stringify(canteens));
        } catch (error) {
            console.error('Could not save canteen data.', error);
            window.alert('The canteen could not be saved in this browser.');
            return false;
        }
        return true;
    }

    function readMenuItems() {
        const saved = localStorage.getItem(menuKey);
        if (!saved) return [];
        try {
            const items = JSON.parse(saved);
            if (!Array.isArray(items)) return [];
            const currentItems = items.filter(function (item) {
                return !/^menu-[0-3]$/.test(item.id || '');
            });
            if (currentItems.length !== items.length) saveMenuItems(currentItems);
            return currentItems;
        } catch (error) {
            console.error('Could not read saved menu items.', error);
            return [];
        }
    }

    function saveMenuItems(items) {
        try {
            localStorage.setItem(menuKey, JSON.stringify(items));
        } catch (error) {
            console.error('Could not save menu data.', error);
            window.alert('The menu item could not be saved in this browser.');
            return false;
        }
        return true;
    }

    function readCategories() {
        const saved = localStorage.getItem(categoryKey);
        if (!saved) return [];
        try {
            const categories = JSON.parse(saved);
            return Array.isArray(categories) ? categories : [];
        } catch (error) {
            console.error('Could not read saved menu categories.', error);
            return [];
        }
    }

    function filterRows(query, selector) {
        document.querySelectorAll(selector).forEach(function (row) {
            row.hidden = !row.textContent.toLowerCase().includes(query);
        });
    }

    function renderPagination(container, pageCount, currentPage, onSelect) {
        if (!container) return;
        container.innerHTML = '';

        function addButton(label, className, page, disabled, active) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = className + (active ? ' active' : '');
            button.textContent = label;
            button.disabled = Boolean(disabled);
            button.addEventListener('click', function () {
                onSelect(page);
            });
            container.appendChild(button);
            return button;
        }

        addButton('‹', 'page-nav-btn', currentPage - 1, currentPage === 1, false).setAttribute('aria-label', 'Previous page');
        for (let page = 1; page <= pageCount; page += 1) {
            addButton(String(page), 'page-num-btn', page, false, page === currentPage);
        }
        addButton('›', 'page-nav-btn', currentPage + 1, currentPage === pageCount, false).setAttribute('aria-label', 'Next page');
    }

    function openEditorDialog(title, fields, onSave) {
        const dialog = document.createElement('dialog');
        dialog.style.cssText = 'border:0;border-radius:14px;padding:24px;width:min(440px,calc(100% - 32px));box-shadow:0 20px 60px #0004;font:14px Poppins,sans-serif;color:#1f2937';
        const form = document.createElement('form');
        const heading = document.createElement('h2');
        heading.textContent = title;
        heading.style.cssText = 'margin:0 0 18px;font-size:20px';
        form.appendChild(heading);

        fields.forEach(function (field) {
            const label = document.createElement('label');
            label.textContent = field.label;
            label.style.cssText = 'display:block;margin:12px 0 5px;font-weight:600';
            const input = field.options ? document.createElement('select') :
                field.type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
            input.name = field.name;
            input.required = Boolean(field.required);
            input.style.cssText = 'width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:7px;font:inherit';
            if (field.type && field.type !== 'textarea' && !field.options) {
                input.type = field.type;
                if (field.type === 'number') {
                    input.min = '0';
                    input.step = '0.01';
                }
            }
            if (field.options) {
                field.options.forEach(function (option) {
                    const element = document.createElement('option');
                    element.value = typeof option === 'string' ? option : option.value;
                    element.textContent = typeof option === 'string' ? option : option.label;
                    input.appendChild(element);
                });
            }
            if (field.type !== 'file') input.value = field.value || '';
            form.appendChild(label);
            form.appendChild(input);
        });

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:22px';
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
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            const values = {};
            fields.forEach(function (field) {
                const input = form.elements.namedItem(field.name);
                values[field.name] = field.type === 'file' ? input.files[0] || null : input.value.trim();
            });
            const fileFields = fields.filter(function (field) {
                return field.type === 'file' && values[field.name];
            });
            function saveValues() {
                save.disabled = true;
                Promise.resolve().then(function () {
                    return onSave(values);
                }).then(function (shouldClose) {
                    if (shouldClose === false) {
                        save.disabled = false;
                        return;
                    }
                    dialog.close();
                }).catch(function (error) {
                    window.alert(error.message || 'The changes could not be saved.');
                    save.disabled = false;
                });
            }
            if (!fileFields.length) {
                saveValues();
                return;
            }
            save.disabled = true;
            Promise.all(fileFields.map(function (field) {
                return new Promise(function (resolve, reject) {
                    if (values[field.name].size > 1024 * 1024 || !values[field.name].type.startsWith('image/')) {
                        reject(new Error('Choose an image smaller than 1 MB.'));
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = function () { resolve([field.name, reader.result]); };
                    reader.onerror = function () { reject(new Error('The image could not be read.')); };
                    reader.readAsDataURL(values[field.name]);
                });
            })).then(function (images) {
                images.forEach(function (image) { values[image[0]] = image[1]; });
                saveValues();
            }).catch(function (error) {
                window.alert(error.message);
                save.disabled = false;
            });
        });
        dialog.appendChild(form);
        dialog.addEventListener('close', function () {
            dialog.remove();
        });
        document.body.appendChild(dialog);
        dialog.showModal();
    }

    function initializeHeaderActions() {
        document.querySelectorAll('.topbar-btn[aria-label="Notifications"]').forEach(function (button) {
            button.addEventListener('click', function () {
                const dot = button.querySelector('.notify-badge-dot');
                if (dot) dot.remove();
                window.alert('You have no new notifications.');
            });
        });

        document.querySelectorAll('.topbar-btn[aria-label="Help"]').forEach(function (button) {
            button.addEventListener('click', function () {
                window.location.href = '../Home-Pages/Contact.html';
            });
        });

        const search = document.querySelector('.search-input');
        if (search) {
            search.addEventListener('input', function () {
                const query = search.value.trim().toLowerCase();
                if (document.querySelector('#ordersTable')) {
                    filterRows(query, '#ordersTable tbody tr');
                } else if (document.querySelector('#canteensTable')) {
                    filterRows(query, '#canteensTable tbody tr');
                } else if (document.querySelector('.menu-items-grid')) {
                    filterRows(query, '.menu-item-card-v2');
                } else {
                    filterRows(query, '.timeline-item');
                }
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
                window.location.href = 'admin_login.html';
            });
        });
    }

    function initializeCanteenForm() {
        const saveButton = document.querySelector('.btn-save-primary');
        if (!saveButton) return;

        const inputs = Array.from(document.querySelectorAll('.add-canteen-container .form-input-v2'));
        const upload = document.getElementById('canteenImgUpload');
        const uploadBox = document.querySelector('.upload-box');
        let selectedImage = null;

        function setUpload(file) {
            if (!file) return;
            if (!file.type.startsWith('image/') || file.size > 1024 * 1024) {
                window.alert('Choose an image smaller than 1 MB.');
                return;
            }
            selectedImage = file;
            uploadBox.querySelector('.upload-text').textContent = file.name;
            let preview = uploadBox.querySelector('.canteen-image-preview');
            if (!preview) {
                preview = document.createElement('img');
                preview.className = 'canteen-image-preview';
                preview.alt = 'Selected canteen preview';
                preview.style.cssText = 'display:block;max-width:100%;max-height:140px;margin:12px auto 0;border-radius:8px;object-fit:cover';
                uploadBox.appendChild(preview);
            } else if (preview.src.startsWith('blob:')) {
                URL.revokeObjectURL(preview.src);
            }
            preview.src = URL.createObjectURL(file);
        }

        if (upload && uploadBox) {
            upload.addEventListener('change', function () {
                setUpload(upload.files[0]);
            });
            uploadBox.addEventListener('dragover', function (event) {
                event.preventDefault();
            });
            uploadBox.addEventListener('drop', function (event) {
                event.preventDefault();
                setUpload(event.dataTransfer.files[0]);
            });
        }

        saveButton.removeAttribute('onclick');
        saveButton.addEventListener('click', function () {
            const name = inputs[0].value.trim();
            const location = inputs[1].value.trim();
            if (!name || !location) {
                window.alert('Enter a canteen name and campus/building before saving.');
                (name ? inputs[1] : inputs[0]).focus();
                return;
            }

            function saveCanteen(imageData) {
                const canteens = readCanteens();
                canteens.push({
                    id: 'canteen-' + Date.now(),
                    name: name,
                    location: location,
                    description: inputs[2].value.trim(),
                    opensAt: inputs[3].value,
                    closesAt: inputs[4].value,
                    active: document.querySelector('.toggle-switch input').checked,
                    manager: inputs[5].value.trim(),
                    phone: inputs[6].value.trim(),
                    email: inputs[7].value.trim(),
                    imageData: imageData || ''
                });
                if (!saveCanteens(canteens)) return;
                window.location.href = 'admin-manage-canteens.html';
            }
            if (!selectedImage) {
                saveCanteen('');
                return;
            }
            const reader = new FileReader();
            reader.onload = function () { saveCanteen(reader.result); };
            reader.onerror = function () { window.alert('The image could not be read.'); };
            reader.readAsDataURL(selectedImage);
        });
    }

    function initializeManageCanteens() {
        const table = document.querySelector('#canteensTable tbody');
        if (!table) return;

        let activeTab = 'all';
        let query = '';
        let currentPage = 1;
        const pageSize = 5;
        const pagination = document.querySelector('.manage-table-card .table-pagination-nav');
        const emptyState = document.createElement('p');
        emptyState.className = 'empty-state';
        emptyState.textContent = 'No canteens have been added. Use Add Canteen to enter verified details.';
        table.insertAdjacentElement('afterend', emptyState);

        table.innerHTML = '';

        function updateCounts() {
            const rows = Array.from(table.querySelectorAll('tr'));
            const activeCount = rows.filter(function (row) {
                return Boolean(row.querySelector('.status-active-pill'));
            }).length;
            const metrics = document.querySelectorAll('.manage-metric-value');
            if (metrics[0]) metrics[0].textContent = String(rows.length);
            if (metrics[1]) metrics[1].textContent = String(activeCount);
            if (metrics[2]) metrics[2].textContent = String(rows.length - activeCount);
            const footer = document.querySelector('.manage-table-footer > span');
            if (footer) footer.textContent = rows.length + ' canteen' + (rows.length === 1 ? '' : 's') + ' total';
            emptyState.hidden = rows.length > 0;
        }

        function applyFilters() {
            const rows = Array.from(table.querySelectorAll('tr'));
            const matchingRows = rows.filter(function (row) {
                const isActive = Boolean(row.querySelector('.status-active-pill'));
                const matchesTab = activeTab === 'all' ||
                    (activeTab === 'active' && isActive) ||
                    (activeTab === 'inactive' && !isActive);
                return matchesTab && row.textContent.toLowerCase().includes(query);
            });
            const pageCount = Math.max(1, Math.ceil(matchingRows.length / pageSize));
            currentPage = Math.min(currentPage, pageCount);
            rows.forEach(function (row) {
                const matchIndex = matchingRows.indexOf(row);
                row.hidden = matchIndex < (currentPage - 1) * pageSize ||
                    matchIndex >= currentPage * pageSize;
            });
            renderPagination(pagination, pageCount, currentPage, function (page) {
                currentPage = page;
                applyFilters();
            });
        }

        readCanteens().forEach(function (canteen) {
            const row = document.createElement('tr');
            row.dataset.savedCanteenId = canteen.id;
            row.innerHTML = '<td><div class="canteen-cell"><img alt="" class="canteen-thumb"><div><div class="canteen-cell-name"></div><div class="canteen-cell-type"></div></div></div></td>' +
                '<td class="canteen-location"></td><td class="canteen-menu-count">0</td><td><span></span></td>' +
                '<td><button class="action-icon-btn" title="Edit" aria-label="Edit canteen">Edit</button> ' +
                '<button class="action-icon-btn delete-btn" title="Delete" aria-label="Delete canteen">Delete</button></td>';
            row.querySelector('.canteen-cell-name').textContent = canteen.name;
            row.querySelector('.canteen-cell-type').textContent = canteen.description || '';
            const thumbnail = row.querySelector('.canteen-thumb');
            thumbnail.alt = canteen.name;
            if (canteen.imageData) thumbnail.src = canteen.imageData;
            else if (canteen.image) thumbnail.src = 'images/' + encodeURIComponent(canteen.image);
            else thumbnail.remove();
            row.querySelector('.canteen-location').textContent = canteen.location;
            row.querySelector('.canteen-menu-count').textContent = String(readMenuItems().filter(function (item) {
                return item.canteen === canteen.id;
            }).length);
            const status = row.querySelector('td span');
            status.className = canteen.active ? 'status-active-pill' : 'status-inactive-pill';
            status.textContent = canteen.active ? '● Active' : '● Inactive';
            table.appendChild(row);
        });
        updateCounts();
        applyFilters();

        document.querySelectorAll('.tabs-bar .tab-btn').forEach(function (button, index) {
            button.addEventListener('click', function () {
                activeTab = ['all', 'active', 'inactive'][index] || 'all';
                currentPage = 1;
                document.querySelectorAll('.tabs-bar .tab-btn').forEach(function (tab) {
                    tab.classList.toggle('active', tab === button);
                });
                applyFilters();
            });
        });

        const searchInput = document.querySelector('.search-input');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                query = searchInput.value.trim().toLowerCase();
                currentPage = 1;
                applyFilters();
            });
        }

        table.addEventListener('click', function (event) {
            const button = event.target.closest('button');
            if (!button) return;
            const row = button.closest('tr');
            if (!row) return;

            if (button.classList.contains('delete-btn')) {
                if (!window.confirm('Delete this canteen?')) return;
                const id = row.dataset.savedCanteenId;
                if (id) {
                    if (!saveCanteens(readCanteens().filter(function (canteen) {
                        return canteen.id !== id;
                    }))) return;
                    if (!saveMenuItems(readMenuItems().filter(function (item) {
                        return item.canteen !== id;
                    }))) return;
                }
                row.remove();
                updateCounts();
                applyFilters();
                return;
            }

            const nameElement = row.querySelector('.canteen-cell-name');
            const locationElement = row.querySelector('.canteen-location') || row.cells[1];
            openEditorDialog('Edit canteen', [
                { name: 'name', label: 'Canteen name', value: nameElement.textContent.trim(), required: true },
                { name: 'location', label: 'Location', value: locationElement.textContent.trim(), required: true },
                {
                    name: 'active',
                    label: 'Status',
                    value: row.querySelector('.status-active-pill') ? 'Active' : 'Inactive',
                    options: ['Active', 'Inactive']
                }
            ], function (values) {
                const isActive = values.active === 'Active';
                const id = row.dataset.savedCanteenId;
                if (id) {
                    const canteens = readCanteens();
                    const canteen = canteens.find(function (item) {
                        return item.id === id;
                    });
                    if (canteen) {
                        canteen.name = values.name;
                        canteen.location = values.location;
                        canteen.active = isActive;
                        if (!saveCanteens(canteens)) return false;
                    }
                }
                nameElement.textContent = values.name;
                locationElement.textContent = values.location;
                const status = row.querySelector('td span');
                status.className = isActive ? 'status-active-pill' : 'status-inactive-pill';
                status.textContent = isActive ? '● Active' : '● Inactive';
                updateCounts();
                applyFilters();
            });
        });
    }

    function initializeMenuManagement() {
        const grid = document.querySelector('.menu-items-grid');
        if (!grid) return;
        let categoryButtons = Array.from(document.querySelectorAll('.cat-pill-btn'));
        let query = '';
        let currentPage = 1;
        const pageSize = 8;
        const pagination = grid.nextElementSibling;
        let items = readMenuItems();
        const canteenSelect = document.getElementById('canteenSelect');
        const emptyState = document.createElement('p');
        emptyState.className = 'empty-state';
        emptyState.textContent = 'No menu items have been added. Enter menu data and a matching image in the admin form.';

        if (canteenSelect) {
            const selectedCanteen = canteenSelect.value;
            canteenSelect.innerHTML = '<option value="all">All Canteens</option>';
            readCanteens().forEach(function (canteen) {
                const option = document.createElement('option');
                option.value = canteen.id;
                option.textContent = canteen.name;
                canteenSelect.appendChild(option);
            });
            canteenSelect.value = selectedCanteen;
        }

        function renderItems() {
            grid.innerHTML = '';
            if (!items.length) grid.appendChild(emptyState);
            items.forEach(function (item) {
                const card = document.createElement('article');
                card.className = 'menu-item-card-v2';
                card.dataset.id = item.id;
                card.dataset.category = item.category;
                card.dataset.canteen = item.canteen || 'all';
                card.innerHTML = '<img alt="" class="menu-item-img"><div class="menu-item-body">' +
                    '<h4 class="menu-item-name"></h4><p class="menu-item-desc"></p><div class="menu-item-price-row">' +
                    '<span class="menu-item-price"></span><span class="available-badge">● Available</span></div>' +
                    '<div class="menu-item-actions"><button class="action-icon-btn" title="Edit">Edit</button>' +
                    '<button class="action-icon-btn delete-btn" title="Delete">Delete</button></div></div>';
                const image = card.querySelector('.menu-item-img');
                if (item.imageData) image.src = item.imageData;
                else if (item.image) image.src = 'images/' + encodeURIComponent(item.image);
                else image.remove();
                image.alt = item.name;
                card.querySelector('.menu-item-name').textContent = item.name;
                card.querySelector('.menu-item-desc').textContent = item.description;
                card.querySelector('.menu-item-price').textContent = '₹' + Number(item.price).toFixed(2);
                grid.appendChild(card);
            });
            applyFilters();
        }

        function applyFilters(resetPage) {
            if (resetPage !== false) currentPage = 1;
            const activeButton = categoryButtons.find(function (button) {
                return button.classList.contains('active');
            });
            const category = activeButton ? activeButton.textContent.trim().toLowerCase() : 'all items';
            const cards = Array.from(grid.querySelectorAll('.menu-item-card-v2'));
            const matchingCards = cards.filter(function (card) {
                const cardCategory = (card.dataset.category || '').toLowerCase();
                const matchesCategory = category === 'all items' ||
                    (category === 'lunch/dinner' ? cardCategory.includes('lunch') : cardCategory === category);
                const matchesSearch = card.textContent.toLowerCase().includes(query);
                const matchesCanteen = !canteenSelect || canteenSelect.value === 'all' ||
                    card.dataset.canteen === 'all' || card.dataset.canteen === canteenSelect.value;
                return matchesCategory && matchesSearch && matchesCanteen;
            });
            const pageCount = Math.max(1, Math.ceil(matchingCards.length / pageSize));
            currentPage = Math.min(currentPage, pageCount);
            cards.forEach(function (card) {
                const matchIndex = matchingCards.indexOf(card);
                card.hidden = matchIndex < (currentPage - 1) * pageSize ||
                    matchIndex >= currentPage * pageSize;
            });
            renderPagination(pagination, pageCount, currentPage, function (page) {
                currentPage = page;
                applyFilters(false);
            });
        }

        function activateCategory(button) {
            categoryButtons.forEach(function (categoryButton) {
                categoryButton.classList.toggle('active', categoryButton === button);
            });
            applyFilters();
        }

        function addCategoryButton(label) {
            const button = document.createElement('button');
            button.className = 'cat-pill-btn';
            button.textContent = label;
            button.addEventListener('click', function () {
                activateCategory(button);
            });
            const spacer = document.querySelector('.category-filter-bar .tab-spacer');
            spacer.parentNode.insertBefore(button, spacer);
            categoryButtons.push(button);
        }

        const savedCategories = readCategories();
        savedCategories.forEach(function (category) {
            if (!categoryButtons.some(function (button) {
                return button.textContent.trim().toLowerCase() === category.toLowerCase();
            })) {
                addCategoryButton(category);
            }
        });

        categoryButtons.forEach(function (button) {
            button.addEventListener('click', function () {
                activateCategory(button);
            });
        });
        if (canteenSelect) canteenSelect.addEventListener('change', applyFilters);

        const manageCategoriesButton = document.querySelector('.manage-categories-btn');
        if (manageCategoriesButton) {
            manageCategoriesButton.addEventListener('click', function () {
                openEditorDialog('Add menu category', [
                    { name: 'category', label: 'Category name', required: true }
                ], function (values) {
                    if (categoryButtons.some(function (button) {
                        return button.textContent.trim().toLowerCase() === values.category.toLowerCase();
                    })) {
                        window.alert('That category already exists.');
                        return false;
                    }
                    savedCategories.push(values.category);
                    localStorage.setItem(categoryKey, JSON.stringify(savedCategories));
                    addCategoryButton(values.category);
                });
            });
        }

        document.querySelectorAll('.search-input').forEach(function (input) {
            input.addEventListener('input', function () {
                query = input.value.trim().toLowerCase();
                applyFilters();
            });
        });

        grid.addEventListener('click', function (event) {
            const button = event.target.closest('.action-icon-btn');
            if (!button) return;
            const card = button.closest('.menu-item-card-v2');
            if (!card) return;

            if (button.classList.contains('delete-btn')) {
                if (!window.confirm('Remove this menu item?')) return;
                const nextItems = items.filter(function (item) {
                    return item.id !== card.dataset.id;
                });
                if (!saveMenuItems(nextItems)) return;
                items = nextItems;
                renderItems();
                return;
            }

            const item = items.find(function (entry) {
                return entry.id === card.dataset.id;
            });
            if (!item) return;
            openEditorDialog('Edit menu item', [
                { name: 'name', label: 'Item name', value: item.name, required: true },
                { name: 'description', label: 'Description', value: item.description },
                { name: 'price', label: 'Price in rupees', value: item.price, type: 'number', required: true },
                { name: 'category', label: 'Category', value: item.category, required: true },
                { name: 'imageData', label: 'Replace food image (optional, max 1 MB)', type: 'file' }
            ], function (values) {
                if (!/^\d+(\.\d{1,2})?$/.test(values.price)) {
                    window.alert('Enter a valid non-negative price.');
                    return false;
                }
                const updatedItem = Object.assign({}, item, {
                    name: values.name,
                    description: values.description,
                    price: Number(values.price),
                    category: values.category.toLowerCase()
                });
                if (values.imageData) updatedItem.imageData = values.imageData;
                const nextItems = items.map(function (entry) {
                    return entry.id === item.id ? updatedItem : entry;
                });
                if (!saveMenuItems(nextItems)) return false;
                items = nextItems;
                renderItems();
            });
        });

        const addButton = document.querySelector('.btn-add-primary');
        if (addButton) {
            addButton.removeAttribute('onclick');
            addButton.addEventListener('click', function () {
                const canteens = readCanteens();
                if (!canteens.length) {
                    window.alert('Add a canteen before adding menu items.');
                    return;
                }
                openEditorDialog('Add menu item', [
                    { name: 'name', label: 'Item name', required: true },
                    { name: 'description', label: 'Description', type: 'textarea' },
                    { name: 'price', label: 'Price in rupees', type: 'number', required: true },
                    { name: 'category', label: 'Category', required: true },
                    {
                        name: 'canteen',
                        label: 'Canteen',
                        required: true,
                        options: canteens.map(function (canteen) {
                            return { value: canteen.id, label: canteen.name };
                        })
                    },
                    { name: 'imageData', label: 'Food image (optional, max 1 MB)', type: 'file' }
                ], function (values) {
                    if (!readCanteens().some(function (canteen) { return canteen.id === values.canteen; })) {
                        window.alert('Add a canteen before adding menu items.');
                        return false;
                    }
                    if (!/^\d+(\.\d{1,2})?$/.test(values.price)) {
                        window.alert('Enter a valid non-negative price.');
                        return false;
                    }
                    const nextItems = items.concat({
                        id: 'menu-' + Date.now(),
                        category: values.category,
                        canteen: values.canteen,
                        name: values.name,
                        description: values.description,
                        price: Number(values.price),
                        imageData: values.imageData || ''
                    });
                    if (!saveMenuItems(nextItems)) return false;
                    items = nextItems;
                    renderItems();
                });
            });
        }

        renderItems();
    }

    async function initializeOrders() {
        const table = document.querySelector('#ordersTable tbody');
        if (!table) return;

        let activeFilter = 'all';
        let query = '';
        let currentPage = 1;
        let orders = [];
        const pageSize = 10;
        const pagination = document.querySelector('#ordersTable').closest('.orders-table-card').querySelector('.table-pagination-nav');
        const entriesInfo = document.querySelector('.table-entries-info');
        const emptyState = document.createElement('p');
        emptyState.className = 'empty-state';
        emptyState.textContent = 'No student orders have been placed yet.';
        table.insertAdjacentElement('afterend', emptyState);

        const metricStats = document.querySelectorAll('.order-metric-card .metric-stat');

        function applyFilters(resetPage) {
            if (resetPage !== false) currentPage = 1;
            const rows = Array.from(table.querySelectorAll('tr'));
            const matchingRows = rows.filter(function (row) {
                const status = row.querySelector('.order-status-pill').textContent.trim().toLowerCase();
                const matchesStatus = activeFilter === 'all' || status === activeFilter;
                return matchesStatus && row.textContent.toLowerCase().includes(query);
            });
            const pageCount = Math.max(1, Math.ceil(matchingRows.length / pageSize));
            currentPage = Math.min(currentPage, pageCount);
            rows.forEach(function (row) {
                const matchIndex = matchingRows.indexOf(row);
                row.dataset.matchesFilters = String(matchIndex !== -1);
                row.hidden = matchIndex < (currentPage - 1) * pageSize ||
                    matchIndex >= currentPage * pageSize;
            });
            renderPagination(pagination, pageCount, currentPage, function (page) {
                currentPage = page;
                applyFilters(false);
            });
            if (entriesInfo) {
                const first = matchingRows.length ? (currentPage - 1) * pageSize + 1 : 0;
                const last = Math.min(currentPage * pageSize, matchingRows.length);
                entriesInfo.textContent = 'Showing ' + first + ' to ' + last + ' of ' + matchingRows.length + ' entries';
            }
        }

        function renderOrders() {
            table.innerHTML = '';
            emptyState.textContent = 'No student orders have been placed yet.';
            emptyState.hidden = orders.length > 0;
            orders.forEach(function (order) {
                const row = document.createElement('tr');
                row.dataset.orderId = order.id;
                row.innerHTML = '<td class="td-order-id"></td><td class="td-student-name"></td>' +
                    '<td class="td-canteen"></td><td class="td-total"></td>' +
                    '<td><span class="order-status-pill"></span></td><td></td>';
                row.querySelector('.td-order-id').textContent = '#' + order.id;
                row.querySelector('.td-student-name').textContent = order.studentName || 'Student';
                row.querySelector('.td-canteen').textContent = order.canteenName;
                row.querySelector('.td-total').textContent = '₹' + Number(order.total).toFixed(2);
                const status = row.querySelector('.order-status-pill');
                status.textContent = order.status;
                status.className = 'order-status-pill status-' + order.status.toLowerCase().replace(' ', '-');
                table.appendChild(row);
            });

            const today = new Date().toISOString().slice(0, 10);
            const todaysOrders = orders.filter(function (order) {
                return (order.placedAt || '').slice(0, 10) === today;
            });
            if (metricStats[0]) metricStats[0].textContent = String(todaysOrders.length);
            ['Pending', 'Preparing', 'Ready'].forEach(function (label, index) {
                const count = orders.filter(function (order) {
                    return order.status.toLowerCase() === label.toLowerCase();
                }).length;
                if (metricStats[index + 1]) metricStats[index + 1].textContent = String(count);
            });
            applyFilters();
        }

        async function loadOrders() {
            try {
                const result = await apiRequest('/api/admin/orders');
                orders = Array.isArray(result.orders) ? result.orders : [];
                renderOrders();
            } catch (error) {
                console.error('Could not load student orders from the server.', error);
                if (!orders.length) {
                    emptyState.textContent = 'Could not load orders from the server. Refresh to try again.';
                    emptyState.hidden = false;
                }
            }
        }

        const filterButton = document.getElementById('filterBtn');
        if (filterButton) {
            const statuses = ['All', 'Pending', 'Preparing', 'Ready', 'Completed'];
            let current = 0;
            filterButton.addEventListener('click', function () {
                current = (current + 1) % statuses.length;
                const label = filterButton.querySelector('span');
                label.textContent = current === 0 ? 'Filter' : statuses[current];
                activeFilter = current === 0 ? 'all' : statuses[current].toLowerCase();
                applyFilters();
            });
        }

        const searchInput = document.getElementById('orderTableSearch');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                query = searchInput.value.trim().toLowerCase();
                applyFilters();
            });
        }

        table.addEventListener('click', function (event) {
            const cell = event.target.closest('td');
            if (!cell || !cell.querySelector('.order-status-pill')) return;
            const pill = cell.querySelector('.order-status-pill');
            const statuses = ['Pending', 'Preparing', 'Ready', 'Completed'];
            const current = statuses.findIndex(function (status) {
                return status.toLowerCase() === pill.textContent.trim().toLowerCase();
            });
            const row = pill.closest('tr');
            const orderId = row.dataset.orderId;
            openEditorDialog('Update order status', [
                { name: 'status', label: 'Status', value: statuses[current < 0 ? 0 : current], options: statuses }
            ], async function (values) {
                await apiRequest('/api/admin/orders/' + encodeURIComponent(orderId), {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: values.status })
                });
                const savedOrder = orders.find(function (order) { return order.id === orderId; });
                if (savedOrder) savedOrder.status = values.status;
                renderOrders();
                return true;
            });
        });

        const exportButton = document.getElementById('exportBtn');
        if (exportButton) {
            exportButton.addEventListener('click', function () {
                const rows = Array.from(document.querySelectorAll('#ordersTable tr')).filter(function (row) {
                    return row.closest('thead') || row.dataset.matchesFilters === 'true';
                });
                const csv = rows.map(function (row) {
                    return Array.from(row.cells).map(function (cell) {
                        return '"' + cell.textContent.trim().replace(/"/g, '""') + '"';
                    }).join(',');
                }).join('\r\n');
                const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
                const link = document.createElement('a');
                link.href = url;
                link.download = 'campusbites-orders.csv';
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.setTimeout(function () {
                    URL.revokeObjectURL(url);
                }, 1000);
            });
        }

        await loadOrders();
        window.setInterval(loadOrders, 5000);
    }

    document.addEventListener('DOMContentLoaded', function () {
        initializeHeaderActions();
        initializeCanteenForm();
        initializeManageCanteens();
        initializeMenuManagement();
        initializeOrders();
    });
}());
