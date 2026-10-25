require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const express = require('express');
const crypto = require('crypto');

const token = process.env.BOT_TOKEN;

if (!token) {
    throw new Error('BOT_TOKEN не найден в файле .env');
}

const bot = new Telegraf(token);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'miniapp')));


const images = {
    start: path.join(__dirname, 'images', 'start.jpg'),
    menu: path.join(__dirname, 'images', 'menu.jpg'),
    createProfile: path.join(__dirname, 'images', 'create-profile.jpg'),
    findGroup: path.join(__dirname, 'images', 'find-group.jpg'),
    thanks: path.join(__dirname, 'images', 'thanks.jpg')
};

const profilesFile = path.join(__dirname, 'profiles.json');
const groupsFile = path.join(__dirname, 'groups.json');
const adsFile = path.join(__dirname, 'ads.json');

const states = {};
const profileDrafts = {};
const groupDrafts = {};
const adDrafts = {};
const searchFilters = {};
const browseStates = {};

function loadJson(filePath) {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    try {
        const data = fs.readFileSync(filePath, 'utf8');

        if (!data.trim()) {
            return {};
        }

        return JSON.parse(data);
    } catch (error) {
        console.log(
            `Ошибка чтения ${path.basename(filePath)}:`,
            error.message
        );

        return {};
    }
}

function saveJson(filePath, data) {
    fs.writeFileSync(
        filePath,
        JSON.stringify(data, null, 2),
        'utf8'
    );
}

let profiles = loadJson(profilesFile);
let groups = loadJson(groupsFile);
let ads = loadJson(adsFile);

function saveProfiles() {
    saveJson(profilesFile, profiles);
}

function saveGroups() {
    saveJson(groupsFile, groups);
}

function saveAds() {
    saveJson(adsFile, ads);
}

// ==========================
// API ДЛЯ TELEGRAM MINI APP
// ==========================

function getTelegramUserFromInitData(initData) {
    if (!initData) {
        return null;
    }

    try {
        const params = new URLSearchParams(initData);
        const receivedHash = params.get('hash');

        if (!receivedHash) {
            return null;
        }

        params.delete('hash');

        const dataCheckString = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(token)
            .digest();

        const calculatedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        const a = Buffer.from(calculatedHash, 'hex');
        const b = Buffer.from(receivedHash, 'hex');

        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
            return null;
        }

        const authDate = Number(params.get('auth_date'));
        const now = Math.floor(Date.now() / 1000);

        if (!authDate || now - authDate > 86400) {
            return null;
        }

        const userRaw = params.get('user');
        return userRaw ? JSON.parse(userRaw) : null;
    } catch (error) {
        console.log('Ошибка проверки Telegram initData:', error.message);
        return null;
    }
}

function telegramAuth(req, res, next) {
    const initData = req.get('X-Telegram-Init-Data');
    const user = getTelegramUserFromInitData(initData);

    if (!user) {
        return res.status(401).json({
            error: 'Открой Mini App внутри Telegram'
        });
    }

    req.telegramUser = user;
    next();
}

function telegramUsername(user) {
    return user.username ? `@${user.username}` : 'не указан';
}

function cleanText(value, maxLength = 500) {
    return String(value ?? '').trim().slice(0, maxLength);
}

app.get('/api/profiles', (req, res) => {
    const result = Object.entries(profiles).map(([id, profile]) => ({
        id,
        ...profile,
        genre: normalizeGenre(profile.genre)
    }));

    res.json(result);
});

app.get('/api/groups', (req, res) => {
    const result = Object.entries(groups).map(([id, group]) => ({
        id,
        ...group,
        genre: normalizeGenre(group.genre)
    }));

    res.json(result);
});

app.get('/api/ads', (req, res) => {
    const result = Object.entries(ads).map(([id, ad]) => ({
        id,
        ...ad
    }));

    res.json(result);
});

app.get('/api/profile/:telegramId', (req, res) => {
    const profile = profiles[String(req.params.telegramId)];

    if (!profile) {
        return res.status(404).json({
            error: 'Анкета не найдена'
        });
    }

    res.json({
        ...profile,
        genre: normalizeGenre(profile.genre)
    });
});

app.post('/api/profile', telegramAuth, (req, res) => {
    const user = req.telegramUser;
    const userId = String(user.id);

    const name = cleanText(req.body.name, 60);
    const age = Number(req.body.age);
    const instrument = cleanText(req.body.instrument, 50);
    const genre = cleanText(req.body.genre, 50);
    const level = cleanText(req.body.level, 50);
    const lookingFor = cleanText(req.body.lookingFor, 180);
    const description = cleanText(req.body.description, 500);

    if (!name || !instrument || !genre || !level) {
        return res.status(400).json({
            error: 'Заполни имя, инструмент, жанр и уровень'
        });
    }

    if (!Number.isInteger(age) || age < 14 || age > 100) {
        return res.status(400).json({
            error: 'Возраст должен быть от 14 до 100 лет'
        });
    }

    profiles[userId] = {
        name,
        age,
        instrument,
        genre,
        level,
        lookingFor,
        description,
        username: telegramUsername(user),
        telegramId: user.id
    };

    saveProfiles();

    res.json({
        ok: true,
        profile: profiles[userId]
    });
});

app.delete('/api/profile', telegramAuth, (req, res) => {
    const userId = String(req.telegramUser.id);

    if (!profiles[userId]) {
        return res.status(404).json({ error: 'Анкета не найдена' });
    }

    delete profiles[userId];
    saveProfiles();
    res.json({ ok: true });
});

app.post('/api/groups', telegramAuth, (req, res) => {
    const user = req.telegramUser;
    const name = cleanText(req.body.name, 80);
    const genre = cleanText(req.body.genre, 50);
    const lookingFor = cleanText(req.body.lookingFor, 180);
    const description = cleanText(req.body.description, 500);

    if (!name || !genre || !lookingFor || !description) {
        return res.status(400).json({ error: 'Заполни все поля группы' });
    }

    const groupId = `${user.id}_${Date.now()}`;

    groups[groupId] = {
        name,
        genre,
        lookingFor,
        description,
        username: telegramUsername(user),
        ownerId: user.id,
        createdAt: new Date().toISOString()
    };

    saveGroups();
    res.json({ ok: true, id: groupId, group: groups[groupId] });
});

app.delete('/api/groups/:id', telegramAuth, (req, res) => {
    const group = groups[req.params.id];

    if (!group) {
        return res.status(404).json({ error: 'Группа не найдена' });
    }

    if (String(group.ownerId) !== String(req.telegramUser.id)) {
        return res.status(403).json({ error: 'Нельзя удалить чужую группу' });
    }

    delete groups[req.params.id];
    saveGroups();
    res.json({ ok: true });
});

app.post('/api/ads', telegramAuth, (req, res) => {
    const user = req.telegramUser;
    const type = cleanText(req.body.type, 60);
    const title = cleanText(req.body.title, 100);
    const description = cleanText(req.body.description, 500);

    if (!type || !title || !description) {
        return res.status(400).json({ error: 'Заполни все поля объявления' });
    }

    const adId = `${user.id}_${Date.now()}`;

    ads[adId] = {
        type,
        title,
        description,
        username: telegramUsername(user),
        ownerId: user.id,
        createdAt: new Date().toISOString()
    };

    saveAds();
    res.json({ ok: true, id: adId, ad: ads[adId] });
});

app.delete('/api/ads/:id', telegramAuth, (req, res) => {
    const ad = ads[req.params.id];

    if (!ad) {
        return res.status(404).json({ error: 'Объявление не найдено' });
    }

    if (String(ad.ownerId) !== String(req.telegramUser.id)) {
        return res.status(403).json({ error: 'Нельзя удалить чужое объявление' });
    }

    delete ads[req.params.id];
    saveAds();
    res.json({ ok: true });
});

app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        service: 'UniSound'
    });
});

function normalizeGenre(genre) {
    const genres = {
        Rock: 'Рок',
        Metal: 'Метал',
        Pop: 'Поп',
        'Hip-Hop': 'Хип-хоп',
        Jazz: 'Джаз',
        Indie: 'Инди'
    };

    return genres[genre] || genre;
}

async function sendImage(ctx, imagePath) {
    if (!fs.existsSync(imagePath)) {
        return;
    }

    await ctx.replyWithPhoto({
        source: imagePath
    });
}

function mainMenuKeyboard() {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback(
                '🔎 Найти музыканта',
                'find_musician'
            )
        ],
        [
            Markup.button.callback(
                '👤 Создать анкету',
                'create_profile'
            )
        ],
        [
            Markup.button.callback(
                '👥 Найти группу',
                'find_group'
            )
        ],
        [
            Markup.button.callback(
                '📄 Объявления',
                'ads'
            )
        ],
        [
            Markup.button.callback(
                '⚙️ Мой профиль',
                'my_profile'
            )
        ]
    ]);
}

async function showMainMenu(ctx) {
    await sendImage(ctx, images.menu);

    await ctx.reply(
        `🎵 UNISOUND

Выбери действие:`,
        mainMenuKeyboard()
    );
}

async function showProfileGenres(ctx) {
    await ctx.reply(
        `✅ Инструмент сохранён.

Шаг 4 из 7

🎵 Выбери любимый жанр:`,
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    'Рок',
                    'genre_rock'
                ),
                Markup.button.callback(
                    'Метал',
                    'genre_metal'
                )
            ],
            [
                Markup.button.callback(
                    'Поп',
                    'genre_pop'
                ),
                Markup.button.callback(
                    'Хип-хоп',
                    'genre_hiphop'
                )
            ],
            [
                Markup.button.callback(
                    'Джаз',
                    'genre_jazz'
                ),
                Markup.button.callback(
                    'Инди',
                    'genre_indie'
                )
            ],
            [
                Markup.button.callback(
                    'Другое',
                    'genre_other'
                )
            ]
        ])
    );
}

async function showLevels(ctx) {
    await ctx.reply(
        `✅ Жанр сохранён.

Шаг 5 из 7

⭐ Как ты оцениваешь свой уровень?`,
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    '🌱 Начинающий',
                    'level_beginner'
                )
            ],
            [
                Markup.button.callback(
                    '🎵 Средний',
                    'level_middle'
                )
            ],
            [
                Markup.button.callback(
                    '🔥 Продвинутый',
                    'level_advanced'
                )
            ]
        ])
    );
}

async function showCreatedProfile(ctx) {
    const userId = String(ctx.from.id);
    const profile = profiles[userId];

    if (!profile) {
        await ctx.reply('❌ Анкета не найдена.');
        return;
    }

    await sendImage(ctx, images.thanks);

    await ctx.reply(
        `✅ АНКЕТА СОЗДАНА

👤 Имя:
${profile.name || 'не указано'}

🎂 Возраст:
${profile.age || 'не указан'}

🎸 Инструмент:
${profile.instrument || 'не указан'}

🎵 Жанр:
${normalizeGenre(profile.genre) || 'не указан'}

⭐ Уровень:
${profile.level || 'не указан'}

🔎 Ищу:
${profile.lookingFor || 'не указано'}

📝 О себе:
${profile.description || 'не указано'}

💬 Telegram:
${profile.username || 'не указан'}`,
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    '✏️ Заполнить заново',
                    'create_profile'
                )
            ],
            [
                Markup.button.callback(
                    '🏠 Главное меню',
                    'main_menu_new'
                )
            ]
        ])
    );
}

function paginationKeyboard(
    prevAction,
    nextAction,
    searchAction
) {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback(
                '⬅️ Назад',
                prevAction
            ),
            Markup.button.callback(
                '➡️ Далее',
                nextAction
            )
        ],
        [
            Markup.button.callback(
                '🔎 Новый поиск',
                searchAction
            )
        ],
        [
            Markup.button.callback(
                '🏠 Главное меню',
                'main_menu_new'
            )
        ]
    ]);
}

async function showProfilePage(ctx, edit = false) {
    const userId = String(ctx.from.id);
    const state = browseStates[userId];

    if (
        !state ||
        state.type !== 'profiles' ||
        state.items.length === 0
    ) {
        return;
    }

    const [, profile] =
        state.items[state.index];

    const text =
        `👤 МУЗЫКАНТ ${state.index + 1} ИЗ ${state.items.length}

👤 Имя:
${profile.name || 'не указано'}

🎂 Возраст:
${profile.age || 'не указан'}

🎸 Инструмент:
${profile.instrument || 'не указан'}

🎵 Жанр:
${normalizeGenre(profile.genre) || 'не указан'}

⭐ Уровень:
${profile.level || 'не указан'}

🔎 Ищет:
${profile.lookingFor || 'не указано'}

📝 О себе:
${profile.description || 'не указано'}

💬 Telegram:
${profile.username || 'не указан'}`;

    const keyboard = paginationKeyboard(
        'profile_page_prev',
        'profile_page_next',
        'find_musician'
    );

    if (edit) {
        await ctx.editMessageText(
            text,
            keyboard
        );
    } else {
        await ctx.reply(
            text,
            keyboard
        );
    }
}

async function showGroupPage(ctx, edit = false) {
    const userId = String(ctx.from.id);
    const state = browseStates[userId];

    if (
        !state ||
        state.type !== 'groups' ||
        state.items.length === 0
    ) {
        return;
    }

    const [, group] =
        state.items[state.index];

    const text =
        `👥 ГРУППА ${state.index + 1} ИЗ ${state.items.length}

🎵 Название:
${group.name || 'не указано'}

🎼 Жанр:
${normalizeGenre(group.genre) || 'не указан'}

🔎 Ищут:
${group.lookingFor || 'не указано'}

📝 О группе:
${group.description || 'не указано'}

💬 Контакт:
${group.username || 'не указан'}`;

    const keyboard = paginationKeyboard(
        'group_page_prev',
        'group_page_next',
        'browse_groups'
    );

    if (edit) {
        await ctx.editMessageText(
            text,
            keyboard
        );
    } else {
        await ctx.reply(
            text,
            keyboard
        );
    }
}

async function showAdPage(ctx, edit = false) {
    const userId = String(ctx.from.id);
    const state = browseStates[userId];

    if (
        !state ||
        state.type !== 'ads' ||
        state.items.length === 0
    ) {
        return;
    }

    const [, ad] =
        state.items[state.index];

    const text =
        `📄 ОБЪЯВЛЕНИЕ ${state.index + 1} ИЗ ${state.items.length}

📌 Заголовок:
${ad.title || 'без названия'}

🏷 Тип:
${ad.type || 'не указан'}

📝 Описание:
${ad.description || 'не указано'}

💬 Контакт:
${ad.username || 'не указан'}`;

    const keyboard = paginationKeyboard(
        'ad_page_prev',
        'ad_page_next',
        'browse_ads'
    );

    if (edit) {
        await ctx.editMessageText(
            text,
            keyboard
        );
    } else {
        await ctx.reply(
            text,
            keyboard
        );
    }
}

async function movePage(
    ctx,
    expectedType,
    direction,
    showFunction
) {
    const userId = String(ctx.from.id);
    const state = browseStates[userId];

    if (
        !state ||
        state.type !== expectedType ||
        !state.items.length
    ) {
        return;
    }

    if (state.items.length === 1) {
        await ctx.answerCbQuery(
            'Это единственная карточка'
        );

        return;
    }

    await ctx.answerCbQuery();

    state.index =
        (
            state.index +
            direction +
            state.items.length
        ) %
        state.items.length;

    await showFunction(ctx, true);
}

bot.start(async (ctx) => {
    const userId = String(ctx.from.id);

    states[userId] = null;

    await sendImage(
        ctx,
        images.start
    );

    await ctx.reply(
        `🎵 UNISOUND

Привет! 👋

Я бот UniSound.

Помогу тебе найти музыкантов,
группу или участников для
музыкального проекта.`,
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    'Начать →',
                    'main_menu'
                )
            ]
        ])
    );
});

bot.action(
    'main_menu',
    async (ctx) => {
        await ctx.answerCbQuery();
        await showMainMenu(ctx);
    }
);

bot.action(
    'main_menu_new',
    async (ctx) => {
        await ctx.answerCbQuery();
        await showMainMenu(ctx);
    }
);

bot.action(
    'create_profile',
    async (ctx) => {
        await ctx.answerCbQuery();

        const userId =
            String(ctx.from.id);

        profileDrafts[userId] = {};
        states[userId] = 'name';

        await sendImage(
            ctx,
            images.createProfile
        );

        await ctx.reply(
            `🎤 СОЗДАНИЕ АНКЕТЫ

Шаг 1 из 7

Как тебя зовут?

Напиши своё имя сообщением.`
        );
    }
);

bot.on(
    'text',
    async (ctx) => {
        const userId =
            String(ctx.from.id);

        const state =
            states[userId];

        if (!state) {
            return;
        }

        if (state === 'name') {
            const name =
                ctx.message.text.trim();

            if (name.length < 2) {
                await ctx.reply(
                    '❌ Введи нормальное имя.'
                );

                return;
            }

            profileDrafts[userId].name =
                name;

            states[userId] =
                'age';

            await ctx.reply(
                `✅ Имя сохранено.

Шаг 2 из 7

🎂 Сколько тебе лет?`
            );

            return;
        }

        if (state === 'age') {
            const age =
                Number(ctx.message.text);

            if (
                !Number.isInteger(age) ||
                age < 10 ||
                age > 100
            ) {
                await ctx.reply(
                    '❌ Введи возраст числом от 10 до 100.'
                );

                return;
            }

            profileDrafts[userId].age =
                age;

            states[userId] = null;

            await ctx.reply(
                `✅ Возраст сохранён.

Шаг 3 из 7

🎸 Выбери основной инструмент:`,
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '🎸 Гитара',
                            'instrument_guitar'
                        ),
                        Markup.button.callback(
                            '🎸 Бас',
                            'instrument_bass'
                        )
                    ],
                    [
                        Markup.button.callback(
                            '🥁 Барабаны',
                            'instrument_drums'
                        ),
                        Markup.button.callback(
                            '🎹 Клавишные',
                            'instrument_keys'
                        )
                    ],
                    [
                        Markup.button.callback(
                            '🎤 Вокал',
                            'instrument_vocal'
                        )
                    ],
                    [
                        Markup.button.callback(
                            'Другое',
                            'instrument_other'
                        )
                    ]
                ])
            );

            return;
        }

        if (state === 'custom_instrument') {
            profileDrafts[userId].instrument =
                ctx.message.text.trim();

            states[userId] = null;

            await showProfileGenres(ctx);

            return;
        }

        if (state === 'custom_genre') {
            profileDrafts[userId].genre =
                ctx.message.text.trim();

            states[userId] = null;

            await showLevels(ctx);

            return;
        }

        if (state === 'looking_for') {
            profileDrafts[userId].lookingFor =
                ctx.message.text.trim();

            states[userId] =
                'description';

            await ctx.reply(
                `✅ Отлично.

Шаг 7 из 7

📝 Расскажи немного о себе.

Например:

Играю на гитаре около двух лет.
Хочу собрать группу для репетиций
и выступлений.`
            );

            return;
        }

        if (state === 'description') {
            profileDrafts[userId].description =
                ctx.message.text.trim();

            profileDrafts[userId].username =
                ctx.from.username
                    ? '@' + ctx.from.username
                    : 'не указан';

            profileDrafts[userId].telegramId =
                ctx.from.id;

            profiles[userId] = {
                ...profileDrafts[userId]
            };

            saveProfiles();

            delete profileDrafts[userId];
            states[userId] = null;

            await showCreatedProfile(ctx);

            return;
        }

        if (state === 'group_name') {
            const name =
                ctx.message.text.trim();

            if (name.length < 2) {
                await ctx.reply(
                    '❌ Введи название группы.'
                );

                return;
            }

            groupDrafts[userId].name =
                name;

            states[userId] = null;

            await ctx.reply(
                `✅ Название сохранено.

Шаг 2 из 4

🎵 Выбери основной жанр группы:`,
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            'Рок',
                            'group_genre_rock'
                        ),
                        Markup.button.callback(
                            'Метал',
                            'group_genre_metal'
                        )
                    ],
                    [
                        Markup.button.callback(
                            'Поп',
                            'group_genre_pop'
                        ),
                        Markup.button.callback(
                            'Хип-хоп',
                            'group_genre_hiphop'
                        )
                    ],
                    [
                        Markup.button.callback(
                            'Джаз',
                            'group_genre_jazz'
                        ),
                        Markup.button.callback(
                            'Инди',
                            'group_genre_indie'
                        )
                    ],
                    [
                        Markup.button.callback(
                            'Другое',
                            'group_genre_other'
                        )
                    ]
                ])
            );

            return;
        }

        if (state === 'group_custom_genre') {
            groupDrafts[userId].genre =
                ctx.message.text.trim();

            states[userId] =
                'group_looking_for';

            await ctx.reply(
                `✅ Жанр сохранён.

Шаг 3 из 4

🔎 Кого вы ищете?

Например:

Барабанщика и бас-гитариста`
            );

            return;
        }

        if (state === 'group_looking_for') {
            groupDrafts[userId].lookingFor =
                ctx.message.text.trim();

            states[userId] =
                'group_description';

            await ctx.reply(
                `✅ Сохранено.

Шаг 4 из 4

📝 Расскажи немного о группе.

Например:

Играем альтернативный рок.
Репетируем два раза в неделю.
Хотим записывать свои песни.`
            );

            return;
        }

        if (state === 'group_description') {
            groupDrafts[userId].description =
                ctx.message.text.trim();

            groupDrafts[userId].username =
                ctx.from.username
                    ? '@' + ctx.from.username
                    : 'не указан';

            groupDrafts[userId].ownerId =
                ctx.from.id;

            groupDrafts[userId].createdAt =
                new Date().toISOString();

            const groupId =
                `${userId}_${Date.now()}`;

            groups[groupId] = {
                ...groupDrafts[userId]
            };

            saveGroups();

            const group =
                groups[groupId];

            delete groupDrafts[userId];
            states[userId] = null;

            await ctx.reply(
                `✅ ГРУППА СОЗДАНА

🎵 Название:
${group.name}

🎼 Жанр:
${normalizeGenre(group.genre)}

🔎 Ищут:
${group.lookingFor}

📝 О группе:
${group.description}

💬 Контакт:
${group.username}`,
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '👥 Смотреть группы',
                            'browse_groups'
                        )
                    ],
                    [
                        Markup.button.callback(
                            '🏠 Главное меню',
                            'main_menu_new'
                        )
                    ]
                ])
            );

            return;
        }

        if (state === 'ad_title') {
            const title =
                ctx.message.text.trim();

            if (title.length < 3) {
                await ctx.reply(
                    '❌ Заголовок слишком короткий.'
                );

                return;
            }

            adDrafts[userId].title =
                title;

            states[userId] =
                'ad_description';

            await ctx.reply(
                `✅ Заголовок сохранён.

Шаг 3 из 3

📝 Напиши описание объявления.

Например:

Ищу барабанщика в рок-группу.
Репетиции два раза в неделю.`
            );

            return;
        }

        if (state === 'ad_description') {
            adDrafts[userId].description =
                ctx.message.text.trim();

            adDrafts[userId].username =
                ctx.from.username
                    ? '@' + ctx.from.username
                    : 'не указан';

            adDrafts[userId].ownerId =
                ctx.from.id;

            adDrafts[userId].createdAt =
                new Date().toISOString();

            const adId =
                `${userId}_${Date.now()}`;

            ads[adId] = {
                ...adDrafts[userId]
            };

            saveAds();

            const ad =
                ads[adId];

            delete adDrafts[userId];
            states[userId] = null;

            await ctx.reply(
                `✅ ОБЪЯВЛЕНИЕ СОЗДАНО

📄 ${ad.title}

🏷 Тип:
${ad.type}

📝 Описание:
${ad.description}

💬 Контакт:
${ad.username}`,
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '📄 Смотреть объявления',
                            'browse_ads'
                        )
                    ],
                    [
                        Markup.button.callback(
                            '🏠 Главное меню',
                            'main_menu_new'
                        )
                    ]
                ])
            );

            return;
        }
    }
);

bot.action(
    /^instrument_/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const userId =
            String(ctx.from.id);

        const action =
            ctx.callbackQuery.data;

        if (!profileDrafts[userId]) {
            profileDrafts[userId] = {};
        }

        const instruments = {
            instrument_guitar: 'Гитара',
            instrument_bass: 'Бас-гитара',
            instrument_drums: 'Барабаны',
            instrument_keys: 'Клавишные',
            instrument_vocal: 'Вокал'
        };

        if (action === 'instrument_other') {
            states[userId] =
                'custom_instrument';

            await ctx.reply(
                '🎵 Напиши свой инструмент:'
            );

            return;
        }

        profileDrafts[userId].instrument =
            instruments[action];

        await showProfileGenres(ctx);
    }
);

bot.action(
    /^genre_/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const userId =
            String(ctx.from.id);

        const action =
            ctx.callbackQuery.data;

        if (!profileDrafts[userId]) {
            profileDrafts[userId] = {};
        }

        const genres = {
            genre_rock: 'Рок',
            genre_metal: 'Метал',
            genre_pop: 'Поп',
            genre_hiphop: 'Хип-хоп',
            genre_jazz: 'Джаз',
            genre_indie: 'Инди'
        };

        if (action === 'genre_other') {
            states[userId] =
                'custom_genre';

            await ctx.reply(
                '🎵 Напиши свой жанр:'
            );

            return;
        }

        profileDrafts[userId].genre =
            genres[action];

        await showLevels(ctx);
    }
);

bot.action(
    /^level_/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const userId =
            String(ctx.from.id);

        const action =
            ctx.callbackQuery.data;

        if (!profileDrafts[userId]) {
            profileDrafts[userId] = {};
        }

        const levels = {
            level_beginner: 'Начинающий',
            level_middle: 'Средний',
            level_advanced: 'Продвинутый'
        };

        profileDrafts[userId].level =
            levels[action];

        states[userId] =
            'looking_for';

        await ctx.reply(
            `✅ Уровень сохранён.

Шаг 6 из 7

🔎 Кого ты ищешь?

Например:

Барабанщика и вокалиста

или:

Группу для совместных репетиций`
        );
    }
);

bot.action(
    'find_musician',
    async (ctx) => {
        await ctx.answerCbQuery();

        const userId =
            String(ctx.from.id);

        searchFilters[userId] = {};

        await ctx.reply(
            `🔎 ПОИСК МУЗЫКАНТОВ

Можно посмотреть все анкеты
или выбрать инструмент.`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        '📋 Все анкеты',
                        'show_all_profiles'
                    )
                ],
                [
                    Markup.button.callback(
                        '🎸 Гитара',
                        'search_instrument_guitar'
                    ),
                    Markup.button.callback(
                        '🎸 Бас',
                        'search_instrument_bass'
                    )
                ],
                [
                    Markup.button.callback(
                        '🥁 Барабаны',
                        'search_instrument_drums'
                    ),
                    Markup.button.callback(
                        '🎹 Клавишные',
                        'search_instrument_keys'
                    )
                ],
                [
                    Markup.button.callback(
                        '🎤 Вокал',
                        'search_instrument_vocal'
                    )
                ],
                [
                    Markup.button.callback(
                        '🏠 Главное меню',
                        'main_menu_new'
                    )
                ]
            ])
        );
    }
);

bot.action(
    'show_all_profiles',
    async (ctx) => {
        await ctx.answerCbQuery();

        const userId =
            String(ctx.from.id);

        const allProfiles =
            Object.entries(profiles)
                .filter(
                    ([id]) =>
                        id !== userId
                );

        if (allProfiles.length === 0) {
            await ctx.reply(
                '😔 Пока нет других анкет.',
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '🏠 Главное меню',
                            'main_menu_new'
                        )
                    ]
                ])
            );

            return;
        }

        browseStates[userId] = {
            type: 'profiles',
            items: allProfiles,
            index: 0
        };

        await showProfilePage(ctx);
    }
);

bot.action(
    /^search_instrument_/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const userId =
            String(ctx.from.id);

        const action =
            ctx.callbackQuery.data;

        const instruments = {
            search_instrument_guitar: 'Гитара',
            search_instrument_bass: 'Бас-гитара',
            search_instrument_drums: 'Барабаны',
            search_instrument_keys: 'Клавишные',
            search_instrument_vocal: 'Вокал'
        };

        const instrument =
            instruments[action];

        if (!instrument) {
            return;
        }

        searchFilters[userId] = {
            instrument
        };

        await ctx.reply(
            `✅ Инструмент: ${instrument}

Шаг 2 из 2

🎵 Выбери жанр:`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        'Рок',
                        'search_genre_rock'
                    ),
                    Markup.button.callback(
                        'Метал',
                        'search_genre_metal'
                    )
                ],
                [
                    Markup.button.callback(
                        'Поп',
                        'search_genre_pop'
                    ),
                    Markup.button.callback(
                        'Хип-хоп',
                        'search_genre_hiphop'
                    )
                ],
                [
                    Markup.button.callback(
                        'Джаз',
                        'search_genre_jazz'
                    ),
                    Markup.button.callback(
                        'Инди',
                        'search_genre_indie'
                    )
                ],
                [
                    Markup.button.callback(
                        '🎵 Любой жанр',
                        'search_genre_any'
                    )
                ]
            ])
        );
    }
);

bot.action(
    /^search_genre_/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const userId =
            String(ctx.from.id);

        const action =
            ctx.callbackQuery.data;

        if (!searchFilters[userId]) {
            await ctx.reply(
                '❌ Поиск был сброшен. Начни заново.'
            );

            return;
        }

        const genres = {
            search_genre_rock: 'Рок',
            search_genre_metal: 'Метал',
            search_genre_pop: 'Поп',
            search_genre_hiphop: 'Хип-хоп',
            search_genre_jazz: 'Джаз',
            search_genre_indie: 'Инди',
            search_genre_any: null
        };

        const selectedGenre =
            genres[action];

        searchFilters[userId].genre =
            selectedGenre;

        const filters =
            searchFilters[userId];

        const foundProfiles =
            Object.entries(profiles)
                .filter(
                    ([id, profile]) => {
                        if (id === userId) {
                            return false;
                        }

                        if (
                            profile.instrument !==
                            filters.instrument
                        ) {
                            return false;
                        }

                        if (
                            filters.genre &&
                            normalizeGenre(
                                profile.genre
                            ) !==
                            filters.genre
                        ) {
                            return false;
                        }

                        return true;
                    }
                );

        delete searchFilters[userId];

        if (foundProfiles.length === 0) {
            await ctx.reply(
                '😔 Подходящих музыкантов пока нет.',
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '🔎 Новый поиск',
                            'find_musician'
                        )
                    ],
                    [
                        Markup.button.callback(
                            '📋 Все анкеты',
                            'show_all_profiles'
                        )
                    ],
                    [
                        Markup.button.callback(
                            '🏠 Главное меню',
                            'main_menu_new'
                        )
                    ]
                ])
            );

            return;
        }

        browseStates[userId] = {
            type: 'profiles',
            items: foundProfiles,
            index: 0
        };

        await showProfilePage(ctx);
    }
);

bot.action(
    'profile_page_next',
    async (ctx) => {
        await movePage(
            ctx,
            'profiles',
            1,
            showProfilePage
        );
    }
);

bot.action(
    'profile_page_prev',
    async (ctx) => {
        await movePage(
            ctx,
            'profiles',
            -1,
            showProfilePage
        );
    }
);

bot.action(
    'find_group',
    async (ctx) => {
        await ctx.answerCbQuery();

        await sendImage(
            ctx,
            images.findGroup
        );

        await ctx.reply(
            `👥 ГРУППЫ

Здесь можно найти музыкальную
группу или создать свою.`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        '🔎 Смотреть группы',
                        'browse_groups'
                    )
                ],
                [
                    Markup.button.callback(
                        '➕ Создать группу',
                        'create_group'
                    )
                ],
                [
                    Markup.button.callback(
                        '🏠 Главное меню',
                        'main_menu_new'
                    )
                ]
            ])
        );
    }
);

bot.action(
    'create_group',
    async (ctx) => {
        await ctx.answerCbQuery();

        const userId =
            String(ctx.from.id);

        groupDrafts[userId] = {};
        states[userId] =
            'group_name';

        await ctx.reply(
            `➕ СОЗДАНИЕ ГРУППЫ

Шаг 1 из 4

🎵 Как называется группа?

Напиши название сообщением.`
        );
    }
);

bot.action(
    /^group_genre_/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const userId =
            String(ctx.from.id);

        const action =
            ctx.callbackQuery.data;

        if (!groupDrafts[userId]) {
            await ctx.reply(
                '❌ Создание группы было сброшено.'
            );

            return;
        }

        const genres = {
            group_genre_rock: 'Рок',
            group_genre_metal: 'Метал',
            group_genre_pop: 'Поп',
            group_genre_hiphop: 'Хип-хоп',
            group_genre_jazz: 'Джаз',
            group_genre_indie: 'Инди'
        };

        if (action === 'group_genre_other') {
            states[userId] =
                'group_custom_genre';

            await ctx.reply(
                '🎵 Напиши жанр группы:'
            );

            return;
        }

        groupDrafts[userId].genre =
            genres[action];

        states[userId] =
            'group_looking_for';

        await ctx.reply(
            `✅ Жанр сохранён.

Шаг 3 из 4

🔎 Кого вы ищете?

Например:

Барабанщика и бас-гитариста`
        );
    }
);

bot.action(
    'browse_groups',
    async (ctx) => {
        await ctx.answerCbQuery();

        await ctx.reply(
            `🔎 ПОИСК ГРУПП

Выбери жанр:`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        'Рок',
                        'find_group_genre_rock'
                    ),
                    Markup.button.callback(
                        'Метал',
                        'find_group_genre_metal'
                    )
                ],
                [
                    Markup.button.callback(
                        'Поп',
                        'find_group_genre_pop'
                    ),
                    Markup.button.callback(
                        'Хип-хоп',
                        'find_group_genre_hiphop'
                    )
                ],
                [
                    Markup.button.callback(
                        'Джаз',
                        'find_group_genre_jazz'
                    ),
                    Markup.button.callback(
                        'Инди',
                        'find_group_genre_indie'
                    )
                ],
                [
                    Markup.button.callback(
                        '🎵 Все группы',
                        'find_group_genre_any'
                    )
                ],
                [
                    Markup.button.callback(
                        '🏠 Главное меню',
                        'main_menu_new'
                    )
                ]
            ])
        );
    }
);

bot.action(
    /^find_group_genre_/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const userId =
            String(ctx.from.id);

        const action =
            ctx.callbackQuery.data;

        const genres = {
            find_group_genre_rock: 'Рок',
            find_group_genre_metal: 'Метал',
            find_group_genre_pop: 'Поп',
            find_group_genre_hiphop: 'Хип-хоп',
            find_group_genre_jazz: 'Джаз',
            find_group_genre_indie: 'Инди',
            find_group_genre_any: null
        };

        const selectedGenre =
            genres[action];

        const foundGroups =
            Object.entries(groups)
                .filter(
                    ([, group]) => {
                        if (
                            selectedGenre &&
                            normalizeGenre(
                                group.genre
                            ) !==
                            selectedGenre
                        ) {
                            return false;
                        }

                        return true;
                    }
                );

        if (foundGroups.length === 0) {
            await ctx.reply(
                '😔 Подходящих групп пока нет.',
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '🔎 Новый поиск',
                            'browse_groups'
                        )
                    ],
                    [
                        Markup.button.callback(
                            '➕ Создать группу',
                            'create_group'
                        )
                    ],
                    [
                        Markup.button.callback(
                            '🏠 Главное меню',
                            'main_menu_new'
                        )
                    ]
                ])
            );

            return;
        }

        browseStates[userId] = {
            type: 'groups',
            items: foundGroups,
            index: 0
        };

        await showGroupPage(ctx);
    }
);

bot.action(
    'group_page_next',
    async (ctx) => {
        await movePage(
            ctx,
            'groups',
            1,
            showGroupPage
        );
    }
);

bot.action(
    'group_page_prev',
    async (ctx) => {
        await movePage(
            ctx,
            'groups',
            -1,
            showGroupPage
        );
    }
);

bot.action(
    'ads',
    async (ctx) => {
        await ctx.answerCbQuery();

        await ctx.reply(
            `📄 ОБЪЯВЛЕНИЯ

Здесь можно найти людей
для музыкального проекта
или разместить своё объявление.`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        '🔎 Смотреть объявления',
                        'browse_ads'
                    )
                ],
                [
                    Markup.button.callback(
                        '➕ Создать объявление',
                        'create_ad'
                    )
                ],
                [
                    Markup.button.callback(
                        '🏠 Главное меню',
                        'main_menu_new'
                    )
                ]
            ])
        );
    }
);

bot.action(
    'create_ad',
    async (ctx) => {
        await ctx.answerCbQuery();

        const userId =
            String(ctx.from.id);

        adDrafts[userId] = {};

        await ctx.reply(
            `➕ СОЗДАНИЕ ОБЪЯВЛЕНИЯ

Шаг 1 из 3

🏷 Выбери тип объявления:`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        '🎸 Ищу музыканта',
                        'ad_type_musician'
                    )
                ],
                [
                    Markup.button.callback(
                        '👥 Ищу группу',
                        'ad_type_group'
                    )
                ],
                [
                    Markup.button.callback(
                        '🎵 Ищу проект',
                        'ad_type_project'
                    )
                ]
            ])
        );
    }
);

bot.action(
    /^ad_type_/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const userId =
            String(ctx.from.id);

        const action =
            ctx.callbackQuery.data;

        if (!adDrafts[userId]) {
            await ctx.reply(
                '❌ Создание объявления было сброшено.'
            );

            return;
        }

        const types = {
            ad_type_musician: 'Ищу музыканта',
            ad_type_group: 'Ищу группу',
            ad_type_project: 'Ищу проект'
        };

        adDrafts[userId].type =
            types[action];

        states[userId] =
            'ad_title';

        await ctx.reply(
            `✅ Тип выбран:
${adDrafts[userId].type}

Шаг 2 из 3

📄 Напиши заголовок объявления.

Например:

Ищу барабанщика в рок-группу`
        );
    }
);

bot.action(
    'browse_ads',
    async (ctx) => {
        await ctx.answerCbQuery();

        await ctx.reply(
            `🔎 ОБЪЯВЛЕНИЯ

Выбери категорию:`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        '🎸 Ищу музыканта',
                        'browse_ads_musician'
                    )
                ],
                [
                    Markup.button.callback(
                        '👥 Ищу группу',
                        'browse_ads_group'
                    )
                ],
                [
                    Markup.button.callback(
                        '🎵 Ищу проект',
                        'browse_ads_project'
                    )
                ],
                [
                    Markup.button.callback(
                        '📄 Все объявления',
                        'browse_ads_all'
                    )
                ],
                [
                    Markup.button.callback(
                        '🏠 Главное меню',
                        'main_menu_new'
                    )
                ]
            ])
        );
    }
);

bot.action(
    /^browse_ads_/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const userId =
            String(ctx.from.id);

        const action =
            ctx.callbackQuery.data;

        const types = {
            browse_ads_musician: 'Ищу музыканта',
            browse_ads_group: 'Ищу группу',
            browse_ads_project: 'Ищу проект',
            browse_ads_all: null
        };

        const selectedType =
            types[action];

        const foundAds =
            Object.entries(ads)
                .filter(
                    ([, ad]) => {
                        if (
                            selectedType &&
                            ad.type !==
                            selectedType
                        ) {
                            return false;
                        }

                        return true;
                    }
                );

        if (foundAds.length === 0) {
            await ctx.reply(
                '😔 Объявлений пока нет.',
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '➕ Создать объявление',
                            'create_ad'
                        )
                    ],
                    [
                        Markup.button.callback(
                            '🔎 Другой поиск',
                            'browse_ads'
                        )
                    ],
                    [
                        Markup.button.callback(
                            '🏠 Главное меню',
                            'main_menu_new'
                        )
                    ]
                ])
            );

            return;
        }

        browseStates[userId] = {
            type: 'ads',
            items: foundAds,
            index: 0
        };

        await showAdPage(ctx);
    }
);

bot.action(
    'ad_page_next',
    async (ctx) => {
        await movePage(
            ctx,
            'ads',
            1,
            showAdPage
        );
    }
);

bot.action(
    'ad_page_prev',
    async (ctx) => {
        await movePage(
            ctx,
            'ads',
            -1,
            showAdPage
        );
    }
);

bot.action(
    'my_profile',
    async (ctx) => {
        await ctx.answerCbQuery();

        await ctx.reply(
            `⚙️ МОЙ ПРОФИЛЬ

Здесь можно управлять своими данными.`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        '🎵 Моя анкета',
                        'my_musician_profile'
                    )
                ],
                [
                    Markup.button.callback(
                        '👥 Мои группы',
                        'my_groups'
                    )
                ],
                [
                    Markup.button.callback(
                        '📄 Мои объявления',
                        'my_ads'
                    )
                ],
                [
                    Markup.button.callback(
                        '🏠 Главное меню',
                        'main_menu_new'
                    )
                ]
            ])
        );
    }
);

bot.action(
    'my_musician_profile',
    async (ctx) => {
        await ctx.answerCbQuery();

        const userId =
            String(ctx.from.id);

        const profile =
            profiles[userId];

        if (!profile) {
            await ctx.reply(
                '😔 У тебя пока нет анкеты.',
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '➕ Создать анкету',
                            'create_profile'
                        )
                    ],
                    [
                        Markup.button.callback(
                            '⬅️ Назад',
                            'my_profile'
                        )
                    ]
                ])
            );

            return;
        }

        await ctx.reply(
            `🎵 МОЯ АНКЕТА

👤 Имя:
${profile.name || 'не указано'}

🎂 Возраст:
${profile.age || 'не указан'}

🎸 Инструмент:
${profile.instrument || 'не указан'}

🎵 Жанр:
${normalizeGenre(profile.genre) || 'не указан'}

⭐ Уровень:
${profile.level || 'не указан'}

🔎 Ищу:
${profile.lookingFor || 'не указано'}

📝 О себе:
${profile.description || 'не указано'}

💬 Telegram:
${profile.username || 'не указан'}`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        '✏️ Заполнить заново',
                        'create_profile'
                    )
                ],
                [
                    Markup.button.callback(
                        '🗑 Удалить анкету',
                        'delete_profile_confirm'
                    )
                ],
                [
                    Markup.button.callback(
                        '⬅️ Назад',
                        'my_profile'
                    )
                ]
            ])
        );
    }
);

bot.action(
    'delete_profile_confirm',
    async (ctx) => {
        await ctx.answerCbQuery();

        await ctx.reply(
            `⚠️ Удалить анкету?

Это действие нельзя отменить.`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        '✅ Да, удалить',
                        'delete_profile'
                    )
                ],
                [
                    Markup.button.callback(
                        '❌ Отмена',
                        'my_musician_profile'
                    )
                ]
            ])
        );
    }
);

bot.action(
    'delete_profile',
    async (ctx) => {
        await ctx.answerCbQuery();

        const userId =
            String(ctx.from.id);

        delete profiles[userId];

        saveProfiles();

        await ctx.reply(
            '✅ Анкета удалена.',
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        '➕ Создать новую',
                        'create_profile'
                    )
                ],
                [
                    Markup.button.callback(
                        '🏠 Главное меню',
                        'main_menu_new'
                    )
                ]
            ])
        );
    }
);

async function showMyGroupPage(
    ctx,
    edit = false
) {
    const userId =
        String(ctx.from.id);

    const state =
        browseStates[userId];

    if (
        !state ||
        state.type !== 'my_groups' ||
        state.items.length === 0
    ) {
        return;
    }

    const [groupId, group] =
        state.items[state.index];

    const text =
        `👥 МОЯ ГРУППА ${state.index + 1} ИЗ ${state.items.length}

🎵 Название:
${group.name || 'не указано'}

🎼 Жанр:
${normalizeGenre(group.genre) || 'не указан'}

🔎 Ищут:
${group.lookingFor || 'не указано'}

📝 О группе:
${group.description || 'не указано'}

💬 Контакт:
${group.username || 'не указан'}`;

    const keyboard =
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    '⬅️',
                    'my_group_prev'
                ),
                Markup.button.callback(
                    '➡️',
                    'my_group_next'
                )
            ],
            [
                Markup.button.callback(
                    '🗑 Удалить группу',
                    `delete_group_${groupId}`
                )
            ],
            [
                Markup.button.callback(
                    '➕ Создать ещё',
                    'create_group'
                )
            ],
            [
                Markup.button.callback(
                    '⬅️ Мой профиль',
                    'my_profile'
                )
            ]
        ]);

    if (edit) {
        await ctx.editMessageText(
            text,
            keyboard
        );
    } else {
        await ctx.reply(
            text,
            keyboard
        );
    }
}

bot.action(
    'my_groups',
    async (ctx) => {
        await ctx.answerCbQuery();

        const userId =
            String(ctx.from.id);

        const userGroups =
            Object.entries(groups)
                .filter(
                    ([, group]) =>
                        String(
                            group.ownerId
                        ) === userId
                );

        if (userGroups.length === 0) {
            await ctx.reply(
                '😔 У тебя пока нет групп.',
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '➕ Создать группу',
                            'create_group'
                        )
                    ],
                    [
                        Markup.button.callback(
                            '⬅️ Назад',
                            'my_profile'
                        )
                    ]
                ])
            );

            return;
        }

        browseStates[userId] = {
            type: 'my_groups',
            items: userGroups,
            index: 0
        };

        await showMyGroupPage(ctx);
    }
);

bot.action(
    'my_group_next',
    async (ctx) => {
        await movePage(
            ctx,
            'my_groups',
            1,
            showMyGroupPage
        );
    }
);

bot.action(
    'my_group_prev',
    async (ctx) => {
        await movePage(
            ctx,
            'my_groups',
            -1,
            showMyGroupPage
        );
    }
);

bot.action(
    /^delete_group_/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const userId =
            String(ctx.from.id);

        const action =
            ctx.callbackQuery.data;

        const groupId =
            action.substring(
                'delete_group_'.length
            );

        const group =
            groups[groupId];

        if (!group) {
            await ctx.reply(
                '❌ Группа уже удалена.'
            );

            return;
        }

        if (
            String(group.ownerId) !==
            userId
        ) {
            await ctx.reply(
                '❌ Нельзя удалить чужую группу.'
            );

            return;
        }

        delete groups[groupId];

        saveGroups();

        delete browseStates[userId];

        await ctx.reply(
            '✅ Группа удалена.',
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        '👥 Мои группы',
                        'my_groups'
                    )
                ],
                [
                    Markup.button.callback(
                        '🏠 Главное меню',
                        'main_menu_new'
                    )
                ]
            ])
        );
    }
);

async function showMyAdPage(
    ctx,
    edit = false
) {
    const userId =
        String(ctx.from.id);

    const state =
        browseStates[userId];

    if (
        !state ||
        state.type !== 'my_ads' ||
        state.items.length === 0
    ) {
        return;
    }

    const [adId, ad] =
        state.items[state.index];

    const text =
        `📄 МОЁ ОБЪЯВЛЕНИЕ ${state.index + 1} ИЗ ${state.items.length}

📌 Заголовок:
${ad.title || 'без названия'}

🏷 Тип:
${ad.type || 'не указан'}

📝 Описание:
${ad.description || 'не указано'}

💬 Контакт:
${ad.username || 'не указан'}`;

    const keyboard =
        Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    '⬅️',
                    'my_ad_prev'
                ),
                Markup.button.callback(
                    '➡️',
                    'my_ad_next'
                )
            ],
            [
                Markup.button.callback(
                    '🗑 Удалить объявление',
                    `delete_ad_${adId}`
                )
            ],
            [
                Markup.button.callback(
                    '➕ Создать ещё',
                    'create_ad'
                )
            ],
            [
                Markup.button.callback(
                    '⬅️ Мой профиль',
                    'my_profile'
                )
            ]
        ]);

    if (edit) {
        await ctx.editMessageText(
            text,
            keyboard
        );
    } else {
        await ctx.reply(
            text,
            keyboard
        );
    }
}

bot.action(
    'my_ads',
    async (ctx) => {
        await ctx.answerCbQuery();

        const userId =
            String(ctx.from.id);

        const userAds =
            Object.entries(ads)
                .filter(
                    ([, ad]) =>
                        String(
                            ad.ownerId
                        ) === userId
                );

        if (userAds.length === 0) {
            await ctx.reply(
                '😔 У тебя пока нет объявлений.',
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '➕ Создать объявление',
                            'create_ad'
                        )
                    ],
                    [
                        Markup.button.callback(
                            '⬅️ Назад',
                            'my_profile'
                        )
                    ]
                ])
            );

            return;
        }

        browseStates[userId] = {
            type: 'my_ads',
            items: userAds,
            index: 0
        };

        await showMyAdPage(ctx);
    }
);

bot.action(
    'my_ad_next',
    async (ctx) => {
        await movePage(
            ctx,
            'my_ads',
            1,
            showMyAdPage
        );
    }
);

bot.action(
    'my_ad_prev',
    async (ctx) => {
        await movePage(
            ctx,
            'my_ads',
            -1,
            showMyAdPage
        );
    }
);

bot.action(
    /^delete_ad_/,
    async (ctx) => {
        await ctx.answerCbQuery();

        const userId =
            String(ctx.from.id);

        const action =
            ctx.callbackQuery.data;

        const adId =
            action.substring(
                'delete_ad_'.length
            );

        const ad =
            ads[adId];

        if (!ad) {
            await ctx.reply(
                '❌ Объявление уже удалено.'
            );

            return;
        }

        if (
            String(ad.ownerId) !==
            userId
        ) {
            await ctx.reply(
                '❌ Нельзя удалить чужое объявление.'
            );

            return;
        }

        delete ads[adId];

        saveAds();

        delete browseStates[userId];

        await ctx.reply(
            '✅ Объявление удалено.',
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        '📄 Мои объявления',
                        'my_ads'
                    )
                ],
                [
                    Markup.button.callback(
                        '🏠 Главное меню',
                        'main_menu_new'
                    )
                ]
            ])
        );
    }
);

bot.catch((error) => {
    console.log(
        'Ошибка Telegram-бота:',
        error.message
    );
});

process.once('SIGINT', () => {
    bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
});

app.listen(port, () => {
    console.log(`UniSound Mini App: http://localhost:${port}`);
});

bot.launch()
    .then(() => {
        console.log(
            'UniSound Bot запущен 🎵'
        );
    })
    .catch((error) => {
        console.log(
            'Ошибка запуска бота:',
            error.message
        );
    });