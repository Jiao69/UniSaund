const tg = window.Telegram?.WebApp;

if (tg) {
    tg.ready();
    tg.expand();

    try {
        tg.setHeaderColor('#0d0d0d');
        tg.setBackgroundColor('#0d0d0d');
    } catch (error) {
        console.log('Telegram colors are not available');
    }
}

const pages = {
    home: document.getElementById('home-page'),
    musicians: document.getElementById('musicians-page'),
    groups: document.getElementById('groups-page'),
    ads: document.getElementById('ads-page'),
    profile: document.getElementById('profile-page')
};

const pageTitles = {
    home: 'Главная',
    musicians: 'Музыканты',
    groups: 'Группы',
    ads: 'Объявления',
    profile: 'Профиль'
};

const pageTitle = document.getElementById('page-title');
const navButtons = document.querySelectorAll('.nav-button');

let allProfiles = [];
let allGroups = [];
let allAds = [];
let myProfile = null;

function telegramUser() {
    return tg?.initDataUnsafe?.user || null;
}

function isTelegramApp() {
    return Boolean(tg?.initData && telegramUser());
}

function showPage(pageName) {
    if (!pages[pageName]) return;

    Object.values(pages).forEach(page => page.classList.remove('active'));
    navButtons.forEach(button => button.classList.remove('active-nav'));

    pages[pageName].classList.add('active');

    if (pageTitle) {
        pageTitle.textContent = pageTitles[pageName];
    }

    const activeButton = document.querySelector(
        `.nav-button[data-page="${pageName}"]`
    );

    if (activeButton) {
        activeButton.classList.add('active-nav');
    }

    if (pageName === 'groups') renderGroups(allGroups);
    if (pageName === 'ads') renderAds(allAds);

    window.scrollTo({ top: 0, behavior: 'smooth' });
    tg?.HapticFeedback?.selectionChanged();
}

function openMusicians() {
    showPage('musicians');
}

window.showPage = showPage;
window.openMusicians = openMusicians;

navButtons.forEach(button => {
    button.addEventListener('click', () => showPage(button.dataset.page));
});

function showMessage(message) {
    if (tg?.showAlert) {
        tg.showAlert(message);
    } else {
        alert(message);
    }
}

function confirmAction(message) {
    return new Promise(resolve => {
        if (tg?.showConfirm) {
            tg.showConfirm(message, resolve);
        } else {
            resolve(window.confirm(message));
        }
    });
}

function requireTelegram() {
    if (isTelegramApp()) return true;

    showMessage(
        'Создание и изменение данных работает внутри Telegram Mini App. ' +
        'В обычном браузере доступен режим просмотра.'
    );

    return false;
}

function openTelegram(username) {
    if (!username || username === 'не указан') {
        showMessage('У пользователя не указан Telegram username.');
        return;
    }

    const cleanUsername = username.replace('@', '').trim();
    const url = `https://t.me/${cleanUsername}`;

    if (tg?.openTelegramLink) {
        tg.openTelegramLink(url);
    } else {
        window.open(url, '_blank');
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

async function apiRequest(url, options = {}) {
    const headers = {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
    };

    if (tg?.initData) {
        headers['X-Telegram-Init-Data'] = tg.initData;
    }

    const response = await fetch(url, {
        ...options,
        headers
    });

    let data = null;

    try {
        data = await response.json();
    } catch (error) {
        data = null;
    }

    if (!response.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
    }

    return data;
}

function createEmptyCard(text) {
    const card = document.createElement('div');
    card.className = 'card data-card';
    card.innerHTML = `<p class="description">${escapeHtml(text)}</p>`;
    return card;
}

function clearDataCards(section) {
    section.querySelectorAll('.data-card').forEach(card => card.remove());
}

function renderMusicians(profiles) {
    const section = pages.musicians;
    clearDataCards(section);

    if (!profiles.length) {
        section.appendChild(createEmptyCard('Пока нет анкет музыкантов.'));
        return;
    }

    profiles.forEach(profile => {
        const card = document.createElement('div');
        card.className = 'card musician-card data-card';
        card.dataset.instrument = (profile.instrument || '').toLowerCase();

        const letter = (profile.name || 'U').charAt(0).toUpperCase();

        card.innerHTML = `
            <div class="card-top">
                <div class="profile-photo">${escapeHtml(letter)}</div>
                <div>
                    <h3>${escapeHtml(profile.name || 'Без имени')}${profile.age ? `, ${escapeHtml(profile.age)}` : ''}</h3>
                    <p class="accent">${escapeHtml(profile.instrument || 'Инструмент не указан')}</p>
                </div>
            </div>

            <div class="tags">
                <span>${escapeHtml(profile.genre || 'Жанр не указан')}</span>
                <span>${escapeHtml(profile.level || 'Уровень не указан')}</span>
            </div>

            <p class="description">
                ${escapeHtml(profile.description || profile.lookingFor || 'Описание не указано')}
            </p>

            ${profile.lookingFor ? `<p class="looking-for"><strong>Ищу:</strong> ${escapeHtml(profile.lookingFor)}</p>` : ''}

            <button class="secondary-button contact-button" type="button">Написать</button>
        `;

        card.querySelector('.contact-button').addEventListener('click', () => {
            openTelegram(profile.username);
        });

        section.appendChild(card);
    });
}

function renderGroups(groups, ownOnly = false) {
    const section = pages.groups;
    clearDataCards(section);

    if (!groups.length) {
        section.appendChild(
            createEmptyCard(ownOnly ? 'У тебя пока нет созданных групп.' : 'Пока нет созданных групп.')
        );
        return;
    }

    const user = telegramUser();

    groups.forEach(group => {
        const card = document.createElement('div');
        card.className = 'card data-card';

        const isOwner = user && String(group.ownerId) === String(user.id);

        card.innerHTML = `
            <p class="category">${escapeHtml(group.genre || 'ГРУППА')}</p>
            <h3>${escapeHtml(group.name || 'Без названия')}</h3>
            <p class="description">${escapeHtml(group.description || 'Описание не указано')}</p>
            <div class="tags">
                <span>Ищут: ${escapeHtml(group.lookingFor || 'не указано')}</span>
            </div>
            <div class="card-actions">
                <button class="secondary-button group-contact" type="button">Написать</button>
                ${isOwner ? '<button class="danger-button group-delete" type="button">Удалить</button>' : ''}
            </div>
        `;

        card.querySelector('.group-contact').addEventListener('click', () => {
            openTelegram(group.username);
        });

        const deleteButton = card.querySelector('.group-delete');

        if (deleteButton) {
            deleteButton.addEventListener('click', async () => {
                const ok = await confirmAction(`Удалить группу «${group.name}»?`);
                if (!ok) return;

                try {
                    await apiRequest(`/api/groups/${encodeURIComponent(group.id)}`, {
                        method: 'DELETE'
                    });
                    await loadData();
                    renderGroups(
                        ownOnly
                            ? allGroups.filter(item => String(item.ownerId) === String(user.id))
                            : allGroups,
                        ownOnly
                    );
                    showMessage('Группа удалена.');
                } catch (error) {
                    showMessage(error.message);
                }
            });
        }

        section.appendChild(card);
    });
}

function renderAds(ads, ownOnly = false) {
    const section = pages.ads;
    clearDataCards(section);

    if (!ads.length) {
        section.appendChild(
            createEmptyCard(ownOnly ? 'У тебя пока нет объявлений.' : 'Пока нет объявлений.')
        );
        return;
    }

    const user = telegramUser();

    ads.forEach(ad => {
        const card = document.createElement('div');
        card.className = 'card data-card';

        const isOwner = user && String(ad.ownerId) === String(user.id);

        card.innerHTML = `
            <p class="category">${escapeHtml(ad.type || 'ОБЪЯВЛЕНИЕ')}</p>
            <h3>${escapeHtml(ad.title || 'Без названия')}</h3>
            <p class="description">${escapeHtml(ad.description || 'Описание не указано')}</p>
            <p class="contact">${escapeHtml(ad.username || 'Контакт не указан')}</p>
            <div class="card-actions">
                <button class="secondary-button ad-contact" type="button">Написать</button>
                ${isOwner ? '<button class="danger-button ad-delete" type="button">Удалить</button>' : ''}
            </div>
        `;

        card.querySelector('.ad-contact').addEventListener('click', () => {
            openTelegram(ad.username);
        });

        const deleteButton = card.querySelector('.ad-delete');

        if (deleteButton) {
            deleteButton.addEventListener('click', async () => {
                const ok = await confirmAction(`Удалить объявление «${ad.title}»?`);
                if (!ok) return;

                try {
                    await apiRequest(`/api/ads/${encodeURIComponent(ad.id)}`, {
                        method: 'DELETE'
                    });
                    await loadData();
                    renderAds(
                        ownOnly
                            ? allAds.filter(item => String(item.ownerId) === String(user.id))
                            : allAds,
                        ownOnly
                    );
                    showMessage('Объявление удалено.');
                } catch (error) {
                    showMessage(error.message);
                }
            });
        }

        section.appendChild(card);
    });
}

function loadTelegramUserHeader() {
    const user = telegramUser();
    if (!user) return;

    const firstName = user.first_name || '';
    const lastName = user.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim();
    const username = user.username ? `@${user.username}` : 'Без username';
    const letter = firstName ? firstName.charAt(0).toUpperCase() : 'U';

    const profileName = document.getElementById('profile-name');
    const profileUsername = document.getElementById('profile-username');
    const profileAvatar = document.getElementById('profile-avatar');
    const topAvatar = document.querySelector('.avatar');

    if (profileName) profileName.textContent = fullName || 'Пользователь';
    if (profileUsername) profileUsername.textContent = username;
    if (profileAvatar) profileAvatar.textContent = letter;
    if (topAvatar) topAvatar.textContent = letter;
}

function updateProfileView(profile) {
    const profileLines = pages.profile.querySelectorAll('.profile-line strong');
    const editButton = document.getElementById('edit-profile-button');
    const deleteButton = document.getElementById('delete-profile-button');
    const status = document.getElementById('profile-status');

    if (!profile) {
        if (profileLines[0]) profileLines[0].textContent = 'Не указан';
        if (profileLines[1]) profileLines[1].textContent = 'Не указан';
        if (profileLines[2]) profileLines[2].textContent = 'Не указан';
        if (editButton) editButton.textContent = 'Создать анкету';
        if (deleteButton) deleteButton.hidden = true;
        if (status) status.textContent = 'Анкета ещё не создана';
        return;
    }

    if (profileLines[0]) profileLines[0].textContent = profile.instrument || 'Не указан';
    if (profileLines[1]) profileLines[1].textContent = profile.genre || 'Не указан';
    if (profileLines[2]) profileLines[2].textContent = profile.level || 'Не указан';
    if (editButton) editButton.textContent = 'Редактировать анкету';
    if (deleteButton) deleteButton.hidden = false;
    if (status) status.textContent = profile.lookingFor || 'Анкета опубликована';

    const profileName = document.getElementById('profile-name');
    const profileUsername = document.getElementById('profile-username');
    const profileAvatar = document.getElementById('profile-avatar');

    if (profileName) profileName.textContent = profile.name || profileName.textContent;
    if (profileUsername) profileUsername.textContent = profile.username || profileUsername.textContent;
    if (profileAvatar && profile.name) profileAvatar.textContent = profile.name.charAt(0).toUpperCase();
}

async function loadMyProfile() {
    const user = telegramUser();

    if (!user) {
        myProfile = null;
        updateProfileView(null);
        return;
    }

    try {
        myProfile = await apiRequest(`/api/profile/${user.id}`);
    } catch (error) {
        myProfile = null;
    }

    updateProfileView(myProfile);
}

async function loadData() {
    try {
        const [profiles, groups, ads] = await Promise.all([
            apiRequest('/api/profiles'),
            apiRequest('/api/groups'),
            apiRequest('/api/ads')
        ]);

        allProfiles = profiles;
        allGroups = groups;
        allAds = ads;

        renderMusicians(allProfiles);
        renderGroups(allGroups);
        renderAds(allAds);
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        showMessage('Не удалось загрузить данные UniSound. Проверь, запущен ли сервер.');
    }
}

const filters = document.querySelectorAll('.filter');

filters.forEach(filter => {
    filter.addEventListener('click', () => {
        filters.forEach(item => item.classList.remove('active-filter'));
        filter.classList.add('active-filter');

        const selected = filter.textContent.trim().toLowerCase();

        if (selected === 'все') {
            renderMusicians(allProfiles);
            return;
        }

        const filtered = allProfiles.filter(profile => {
            const instrument = (profile.instrument || '').toLowerCase();

            if (selected === 'бас') {
                return instrument.includes('бас');
            }

            return instrument.includes(selected);
        });

        renderMusicians(filtered);
    });
});

function closeModal() {
    document.querySelector('.modal-overlay')?.remove();
    document.body.classList.remove('modal-open');
}

function fieldHtml(field) {
    const value = escapeHtml(field.value ?? '');
    const required = field.required === false ? '' : 'required';

    if (field.type === 'select') {
        const options = field.options.map(option => {
            const selected = String(option) === String(field.value) ? 'selected' : '';
            return `<option value="${escapeHtml(option)}" ${selected}>${escapeHtml(option)}</option>`;
        }).join('');

        return `
            <label class="form-field">
                <span>${escapeHtml(field.label)}</span>
                <select name="${escapeHtml(field.name)}" ${required}>${options}</select>
            </label>
        `;
    }

    if (field.type === 'textarea') {
        return `
            <label class="form-field">
                <span>${escapeHtml(field.label)}</span>
                <textarea name="${escapeHtml(field.name)}" rows="4" ${required} placeholder="${escapeHtml(field.placeholder || '')}">${value}</textarea>
            </label>
        `;
    }

    return `
        <label class="form-field">
            <span>${escapeHtml(field.label)}</span>
            <input
                type="${escapeHtml(field.type || 'text')}"
                name="${escapeHtml(field.name)}"
                value="${value}"
                ${field.min ? `min="${escapeHtml(field.min)}"` : ''}
                ${field.max ? `max="${escapeHtml(field.max)}"` : ''}
                ${required}
                placeholder="${escapeHtml(field.placeholder || '')}"
            >
        </label>
    `;
}

function openFormModal({ title, submitText = 'Сохранить', fields, onSubmit }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
        <div class="modal-sheet">
            <div class="modal-head">
                <h2>${escapeHtml(title)}</h2>
                <button type="button" class="modal-close" aria-label="Закрыть">×</button>
            </div>
            <form class="app-form">
                ${fields.map(fieldHtml).join('')}
                <button type="submit" class="main-button form-submit">${escapeHtml(submitText)}</button>
            </form>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');

    overlay.querySelector('.modal-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', event => {
        if (event.target === overlay) closeModal();
    });

    const form = overlay.querySelector('.app-form');

    form.addEventListener('submit', async event => {
        event.preventDefault();

        const submitButton = form.querySelector('.form-submit');
        const formData = Object.fromEntries(new FormData(form).entries());

        submitButton.disabled = true;
        submitButton.textContent = 'Сохраняем...';

        try {
            await onSubmit(formData);
            closeModal();
        } catch (error) {
            showMessage(error.message);
            submitButton.disabled = false;
            submitButton.textContent = submitText;
        }
    });
}

function openProfileForm() {
    if (!requireTelegram()) return;

    const user = telegramUser();

    openFormModal({
        title: myProfile ? 'Редактировать анкету' : 'Создать анкету',
        fields: [
            {
                name: 'name',
                label: 'Имя',
                value: myProfile?.name || user?.first_name || ''
            },
            {
                name: 'age',
                label: 'Возраст',
                type: 'number',
                min: 14,
                max: 100,
                value: myProfile?.age || ''
            },
            {
                name: 'instrument',
                label: 'Инструмент',
                type: 'select',
                value: myProfile?.instrument || 'Гитара',
                options: ['Гитара', 'Бас-гитара', 'Барабаны', 'Клавишные', 'Вокал', 'Другое']
            },
            {
                name: 'genre',
                label: 'Жанр',
                type: 'select',
                value: myProfile?.genre || 'Рок',
                options: ['Рок', 'Метал', 'Поп', 'Хип-хоп', 'Джаз', 'Инди', 'Другое']
            },
            {
                name: 'level',
                label: 'Уровень',
                type: 'select',
                value: myProfile?.level || 'Начинающий',
                options: ['Начинающий', 'Средний', 'Продвинутый']
            },
            {
                name: 'lookingFor',
                label: 'Кого или что ищешь',
                value: myProfile?.lookingFor || '',
                required: false,
                placeholder: 'Например: ищу группу или барабанщика'
            },
            {
                name: 'description',
                label: 'О себе',
                type: 'textarea',
                value: myProfile?.description || '',
                required: false,
                placeholder: 'Расскажи о своём опыте и музыкальных интересах'
            }
        ],
        onSubmit: async data => {
            await apiRequest('/api/profile', {
                method: 'POST',
                body: JSON.stringify(data)
            });

            await loadData();
            await loadMyProfile();
            showMessage('Анкета сохранена.');
        }
    });
}

function openGroupForm() {
    if (!requireTelegram()) return;

    openFormModal({
        title: 'Создать группу',
        fields: [
            { name: 'name', label: 'Название группы' },
            {
                name: 'genre',
                label: 'Жанр',
                type: 'select',
                value: 'Рок',
                options: ['Рок', 'Метал', 'Поп', 'Хип-хоп', 'Джаз', 'Инди', 'Другое']
            },
            {
                name: 'lookingFor',
                label: 'Кого ищете',
                placeholder: 'Например: барабанщика и бас-гитариста'
            },
            {
                name: 'description',
                label: 'О группе',
                type: 'textarea',
                placeholder: 'Расскажи о стиле, репетициях и планах'
            }
        ],
        onSubmit: async data => {
            await apiRequest('/api/groups', {
                method: 'POST',
                body: JSON.stringify(data)
            });

            await loadData();
            showPage('groups');
            showMessage('Группа создана.');
        }
    });
}

function openAdForm() {
    if (!requireTelegram()) return;

    openFormModal({
        title: 'Создать объявление',
        fields: [
            {
                name: 'type',
                label: 'Тип объявления',
                type: 'select',
                value: 'Ищу музыканта',
                options: ['Ищу музыканта', 'Ищу группу', 'Ищу проект']
            },
            {
                name: 'title',
                label: 'Заголовок',
                placeholder: 'Например: ищу барабанщика'
            },
            {
                name: 'description',
                label: 'Описание',
                type: 'textarea',
                placeholder: 'Опиши, кого ищешь и для чего'
            }
        ],
        onSubmit: async data => {
            await apiRequest('/api/ads', {
                method: 'POST',
                body: JSON.stringify(data)
            });

            await loadData();
            showPage('ads');
            showMessage('Объявление создано.');
        }
    });
}

const createGroupButton = document.getElementById('create-group-button');
const createAdButton = document.getElementById('create-ad-button');
const editProfileButton = document.getElementById('edit-profile-button');
const deleteProfileButton = document.getElementById('delete-profile-button');

createGroupButton?.addEventListener('click', openGroupForm);
createAdButton?.addEventListener('click', openAdForm);
editProfileButton?.addEventListener('click', openProfileForm);

deleteProfileButton?.addEventListener('click', async () => {
    if (!requireTelegram() || !myProfile) return;

    const ok = await confirmAction('Удалить свою анкету?');
    if (!ok) return;

    try {
        await apiRequest('/api/profile', { method: 'DELETE' });
        myProfile = null;
        await loadData();
        updateProfileView(null);
        loadTelegramUserHeader();
        showMessage('Анкета удалена.');
    } catch (error) {
        showMessage(error.message);
    }
});

const profileMenuButtons = document.querySelectorAll('.profile-menu-button');

if (profileMenuButtons[0]) {
    profileMenuButtons[0].addEventListener('click', () => {
        const user = telegramUser();
        if (!user) {
            showMessage('Открой Mini App внутри Telegram, чтобы увидеть свои группы.');
            return;
        }

        const mine = allGroups.filter(group => String(group.ownerId) === String(user.id));
        renderGroups(mine, true);
        showPageWithoutReset('groups', 'Мои группы');
    });
}

if (profileMenuButtons[1]) {
    profileMenuButtons[1].addEventListener('click', () => {
        const user = telegramUser();
        if (!user) {
            showMessage('Открой Mini App внутри Telegram, чтобы увидеть свои объявления.');
            return;
        }

        const mine = allAds.filter(ad => String(ad.ownerId) === String(user.id));
        renderAds(mine, true);
        showPageWithoutReset('ads', 'Мои объявления');
    });
}

function showPageWithoutReset(pageName, customTitle) {
    if (!pages[pageName]) return;

    Object.values(pages).forEach(page => page.classList.remove('active'));
    navButtons.forEach(button => button.classList.remove('active-nav'));
    pages[pageName].classList.add('active');

    if (pageTitle) pageTitle.textContent = customTitle;

    const activeButton = document.querySelector(
        `.nav-button[data-page="${pageName}"]`
    );
    activeButton?.classList.add('active-nav');

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', async () => {
    loadTelegramUserHeader();
    showPage('home');
    await loadData();
    await loadMyProfile();
});
