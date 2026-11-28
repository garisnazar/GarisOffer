const ADMIN_ID = 5151757168;
const WEBHOOK_SECRET = "GarisOffer9231998";
const TON_WALLET = "UQChRfzub4CLp2FAV998bfowFC4eE3aqIRQQeZinoajQ0oOG";
const BOT_USERNAME = "GarisOfferRobot";
const CHANNEL_ID = "@GarisOffer";

export default {
  async fetch(request, env, ctx) {
    const BOT_TOKEN = env.BOT_TOKEN;
    const kv = env.USERS_KV;

    if (!BOT_TOKEN) {
      return new Response("Bot token is not configured", { status: 500 });
    }

    const secretHeader = request.headers.get(
      "X-Telegram-Bot-Api-Secret-Token"
    );

    if (secretHeader !== WEBHOOK_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }

    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    try {
      const update = await request.json();

      async function isSubscribed(userId) {
        try {
          const res = await callApi("getChatMember", {
            chat_id: CHANNEL_ID,
            user_id: userId
          }, BOT_TOKEN);

          if (!res.ok) return false;

          return [
            "creator",
            "administrator",
            "member"
          ].includes(res.result.status);
        } catch (e) {
          return false;
        }
      }

      async function checkAccess(userId, username) {
        if (userId === ADMIN_ID) return true;
        if (!kv) return false;

        const byId = await kv.get(`allowed_id:${userId}`);
        if (byId) return true;

        if (username) {
          const byName = await kv.get(
            `allowed_username:${username.toLowerCase()}`
          );

          if (byName) return true;
        }

        return false;
      }

      async function answerCallback(callbackId, text = "", alert = false) {
        try {
          await callApi("answerCallbackQuery", {
            callback_query_id: callbackId,
            text,
            show_alert: alert
          }, BOT_TOKEN);
        } catch (e) {}
      }

      // ==========================================
      // ПРОМОКОДЫ: УДАЛЕНИЕ С ИСТОРИЕЙ ИСПОЛЬЗОВАНИЙ
      // ==========================================

      async function deletePromoCompletely(code) {
        if (!kv) return;

        await kv.delete(`promo:${code}`);

        let cursor;

        do {
          const list = await kv.list({
            prefix: `promo_used:${code}:`,
            cursor
          });

          for (const key of list.keys) {
            await kv.delete(key.name);
          }

          cursor = list.cursor;
        } while (cursor);
      }

      // ==========================================
      // ПРОМОКОДЫ: СПИСОК ДЛЯ АДМИНА
      // ==========================================

      async function showPromos(chatId, page = 0, messageId = null) {
        if (!kv) return;

        const allPromos = [];
        let cursor;

        do {
          const list = await kv.list({
            prefix: "promo:",
            cursor
          });

          for (const key of list.keys) {
            const code = key.name.replace("promo:", "");
            const data = await kv.get(key.name);

            if (!data) continue;

            try {
              allPromos.push({
                code,
                promo: JSON.parse(data)
              });
            } catch (e) {
              console.error("Ошибка чтения промокода:", code);
            }
          }

          cursor = list.cursor;
        } while (cursor);

        allPromos.sort((a, b) => a.code.localeCompare(b.code));

        const perPage = 5;
        const totalPages = Math.max(
          1,
          Math.ceil(allPromos.length / perPage)
        );

        page = Math.max(0, Math.min(page, totalPages - 1));

        const start = page * perPage;
        const current = allPromos.slice(start, start + perPage);

        let text =
          `🎟 <b>УПРАВЛЕНИЕ ПРОМОКОДАМИ</b>\n\n` +
          `Всего промокодов: <b>${allPromos.length}</b>\n` +
          `Страница: <b>${page + 1}/${totalPages}</b>\n\n`;

        const keyboard = [];

        if (current.length === 0) {
          text += "📭 <i>Промокодов пока нет.</i>";
        }

        for (const item of current) {
          const p = item.promo;

          let reward = "Неизвестная награда";

          if (p.rewardType === "permanent") {
            reward = "♾ Бессрочный доступ";
          } else if (p.rewardType === "stars") {
            reward = `⭐ Скидка ${p.rewardValue} Stars`;
          } else if (p.rewardType === "ton") {
            reward = `💎 Скидка ${p.rewardValue} TON`;
          } else if (
            p.discountStars !== undefined ||
            p.discountTon !== undefined
          ) {
            reward =
              `⭐ ${p.discountStars || 0} Stars` +
              ` / 💎 ${p.discountTon || 0} TON`;
          }

          const uses = Number(p.uses || 0);
          const maxUses = Number(p.maxUses || 0);

          const limitText = maxUses === 0
            ? "♾ Без ограничений"
            : `${uses}/${maxUses}`;

          text +=
            `🎁 <b>${item.code}</b>\n` +
            `Награда: ${reward}\n` +
            `Использовано: ${limitText}\n\n`;

          keyboard.push([{
            text: `🗑 Удалить ${item.code}`,
            callback_data: `promodel|${item.code}|${page}`
          }]);
        }

        const navigation = [];

        if (page > 0) {
          navigation.push({
            text: "⬅️ Назад",
            callback_data: `promolist|${page - 1}`
          });
        }

        if (page < totalPages - 1) {
          navigation.push({
            text: "Вперёд ➡️",
            callback_data: `promolist|${page + 1}`
          });
        }

        if (navigation.length) {
          keyboard.push(navigation);
        }

        const markup = {
          inline_keyboard: keyboard
        };

        if (messageId) {
          try {
            await callApi("editMessageText", {
              chat_id: chatId,
              message_id: messageId,
              text,
              parse_mode: "HTML",
              reply_markup: markup
            }, BOT_TOKEN);
            return;
          } catch (e) {
            console.error("Не удалось обновить список промокодов:", e.message);
          }
        }

        await callApi("sendMessage", {
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          reply_markup: markup
        }, BOT_TOKEN);
      }

      // ==========================================
      // БАЗОВЫЕ ЦЕНЫ
      // ==========================================

      let BASE_STARS_PRICE = 250;
      let BASE_TON_PRICE = 3;

      if (kv) {
        const savedStars = await kv.get("config:stars");
        const savedTon = await kv.get("config:ton");

        if (savedStars) BASE_STARS_PRICE = parseInt(savedStars);
        if (savedTon) BASE_TON_PRICE = parseFloat(savedTon);
      }

      // ==========================================
      // ОБРАБОТКА ЧЕКОВ
      // ==========================================

      if (update.message?.photo) {
        const chatId = update.message.chat.id;
        const userId = update.message.from.id;
        const username = update.message.from.username || "без username";
        const photoId =
          update.message.photo[update.message.photo.length - 1].file_id;

        const adminText =
          `📸 <b>НОВЫЙ ЧЕК ОБ ОПЛАТЕ!</b>\n\n` +
          `👤 Пользователь: @${username}\n` +
          `🆔 ID: <code>${userId}</code>\n` +
          `💬 Чат: <code>${chatId}</code>`;

        const adminMarkup = {
          inline_keyboard: [[
            {
              text: "✅ Принять",
              callback_data: `approve_${userId}`
            },
            {
              text: "❌ Отклонить",
              callback_data: `reject_${userId}`
            }
          ]]
        };

        try {
          await callApi("sendPhoto", {
            chat_id: ADMIN_ID,
            photo: photoId,
            caption: adminText,
            parse_mode: "HTML",
            reply_markup: adminMarkup
          }, BOT_TOKEN);

          await callApi("sendMessage", {
            chat_id: chatId,
            text:
              "📥 <b>Чек успешно отправлен администратору!</b>\n\n" +
              "⏳ Ожидайте проверки оплаты.",
            parse_mode: "HTML"
          }, BOT_TOKEN);

        } catch (e) {
          console.error("ОШИБКА ОТПРАВКИ ЧЕКА:", e.message);

          try {
            await callApi("sendMessage", {
              chat_id: chatId,
              text:
                "❌ Не удалось отправить чек администратору.",
              parse_mode: "HTML"
            }, BOT_TOKEN);
          } catch (sendError) {
            console.error(
              "Не удалось сообщить пользователю:",
              sendError.message
            );
          }
        }

        return new Response("OK", { status: 200 });
      }

      // ==========================================
      // АДМИН: /setprice
      // ==========================================

      if (update.message?.text?.startsWith("/setprice ")) {
        if (update.message.from.id !== ADMIN_ID) {
          return new Response("OK");
        }

        const args = update.message.text.split(/\s+/);

        if (args.length < 3) return new Response("OK");

        const stars = parseInt(args[1]);
        const ton = parseFloat(args[2]);

        if (
          !Number.isFinite(stars) ||
          stars < 0 ||
          !Number.isFinite(ton) ||
          ton < 0
        ) {
          await callApi("sendMessage", {
            chat_id: update.message.chat.id,
            text: "❌ Неверные цены. Пример: /setprice 250 3"
          }, BOT_TOKEN);

          return new Response("OK");
        }

        if (kv) {
          await kv.put("config:stars", String(stars));
          await kv.put("config:ton", String(ton));

          await callApi("sendMessage", {
            chat_id: update.message.chat.id,
            text:
              `✅ <b>Цены обновлены!</b>\n\n` +
              `⭐ Stars: ${stars}\n` +
              `💎 TON: ${ton}`,
            parse_mode: "HTML"
          }, BOT_TOKEN);
        }

        return new Response("OK");
      }

      // ==========================================
      // АДМИН: /createpromo
      // ==========================================

      if (update.message?.text?.startsWith("/createpromo")) {
        if (update.message.from.id !== ADMIN_ID) {
          return new Response("OK");
        }

        if (!kv) return new Response("OK");

        const chatId = update.message.chat.id;
        const match = update.message.text.match(
          /^\/createpromo(?:@\w+)?\s+"([^"]+)"\s+"([^"]+)"\s+"(\d+)"$/i
        );

        if (!match) {
          await callApi("sendMessage", {
            chat_id: chatId,
            text:
              `🎟 <b>СОЗДАНИЕ ПРОМОКОДА</b>\n\n` +
              `Формат команды:\n` +
              `<code>/createpromo "КОД" "НАГРАДА" "ЛИМИТ"</code>\n\n` +
              `<b>Примеры:</b>\n` +
              `<code>/createpromo "NEWYEAR2027" "50 stars" "100"</code>\n` +
              `<code>/createpromo "VIP2027" "0.5 ton" "50"</code>\n` +
              `<code>/createpromo "FOREVER" "навсегда" "10"</code>\n\n` +
              `⭐ Stars — скидка в Stars\n` +
              `💎 TON — скидка в TON\n` +
              `♾ Навсегда — постоянный доступ\n\n` +
              `Лимит 0 означает бесконечное количество использований.`,
            parse_mode: "HTML"
          }, BOT_TOKEN);

          return new Response("OK");
        }

        const promoCode = match[1].trim().toUpperCase();
        const rewardText = match[2].trim().toLowerCase();
        const maxUses = Number(match[3]);

        if (!/^[A-Z0-9_-]{3,32}$/.test(promoCode)) {
          await callApi("sendMessage", {
            chat_id: chatId,
            text: "❌ Код должен содержать 3–32 символа: A–Z, 0–9, _ или -."
          }, BOT_TOKEN);

          return new Response("OK");
        }

        if (!Number.isSafeInteger(maxUses) || maxUses < 0) {
          await callApi("sendMessage", {
            chat_id: chatId,
            text: "❌ Неверный лимит использований."
          }, BOT_TOKEN);

          return new Response("OK");
        }

        const existing = await kv.get(`promo:${promoCode}`);

        if (existing) {
          await callApi("sendMessage", {
            chat_id: chatId,
            text: `⚠️ Промокод <code>${promoCode}</code> уже существует.`,
            parse_mode: "HTML"
          }, BOT_TOKEN);

          return new Response("OK");
        }

        const promo = {
          code: promoCode,
          maxUses,
          uses: 0,
          rewardType: "",
          rewardValue: 0,
          createdAt: Date.now()
        };

        const permanentWords = [
          "навсегда",
          "бессрочно",
          "вечный доступ",
          "бесконечный доступ"
        ];

        if (permanentWords.includes(rewardText)) {
          promo.rewardType = "permanent";
        } else {
          const rewardMatch = rewardText.match(
            /^(\d+(?:[.,]\d+)?)\s*(stars?|звезд|звёзд|ton)$/i
          );

          if (!rewardMatch) {
            await callApi("sendMessage", {
              chat_id: chatId,
              text:
                "❌ Неизвестная награда.\n\n" +
                "Используй, например: 50 stars, 0.5 ton или навсегда."
            }, BOT_TOKEN);

            return new Response("OK");
          }

          const rewardValue = Number(
            rewardMatch[1].replace(",", ".")
          );

          if (!Number.isFinite(rewardValue) || rewardValue <= 0) {
            await callApi("sendMessage", {
              chat_id: chatId,
              text: "❌ Размер скидки должен быть больше нуля."
            }, BOT_TOKEN);

            return new Response("OK");
          }

          if (rewardMatch[2].toLowerCase().startsWith("ton")) {
            promo.rewardType = "ton";
          } else {
            promo.rewardType = "stars";
          }

          promo.rewardValue = rewardValue;
        }

        await kv.put(
          `promo:${promoCode}`,
          JSON.stringify(promo)
        );

        let rewardDescription = "";

        if (promo.rewardType === "permanent") {
          rewardDescription = "♾ Бессрочный доступ";
        } else if (promo.rewardType === "stars") {
          rewardDescription = `⭐ Скидка ${promo.rewardValue} Stars`;
        } else {
          rewardDescription = `💎 Скидка ${promo.rewardValue} TON`;
        }

        await callApi("sendMessage", {
          chat_id: chatId,
          text:
            `✅ <b>ПРОМОКОД СОЗДАН!</b>\n\n` +
            `🎟 Код: <code>${promoCode}</code>\n` +
            `🎁 Награда: ${rewardDescription}\n` +
            `👥 Лимит: ${maxUses === 0 ? "♾ Без ограничений" : maxUses}\n` +
            `📊 Использовано: 0\n\n` +
            `Пользователи могут активировать его командой:\n` +
            `<code>/promo ${promoCode}</code>`,
          parse_mode: "HTML"
        }, BOT_TOKEN);

        return new Response("OK");
      }

      // ==========================================
      // АДМИН: /promos
      // ==========================================

      if (
        update.message?.text === "/promos" ||
        update.message?.text?.startsWith("/promos@")
      ) {
        if (update.message.from.id !== ADMIN_ID) {
          return new Response("OK");
        }

        if (!kv) return new Response("OK");

        await showPromos(update.message.chat.id, 0);

        return new Response("OK");
      }

      // ==========================================
      // АДМИН: /deletepromo
      // ==========================================

      if (update.message?.text?.startsWith("/deletepromo ")) {
        if (update.message.from.id !== ADMIN_ID) {
          return new Response("OK");
        }

        if (!kv) return new Response("OK");

        const promoCode = update.message.text
          .split(/\s+/)[1]
          ?.toUpperCase();

        if (!promoCode) return new Response("OK");

        const existing = await kv.get(`promo:${promoCode}`);

        if (!existing) {
          await callApi("sendMessage", {
            chat_id: update.message.chat.id,
            text: `❌ Промокод ${promoCode} не найден.`
          }, BOT_TOKEN);

          return new Response("OK");
        }

        await deletePromoCompletely(promoCode);

        await callApi("sendMessage", {
          chat_id: update.message.chat.id,
          text: `🗑 Промокод <code>${promoCode}</code> и история его использований удалены.`,
          parse_mode: "HTML"
        }, BOT_TOKEN);

        return new Response("OK");
      }

      // ==========================================
      // ВВОД ПРОМОКОДА
      // ==========================================

      if (update.message?.text?.startsWith("/promo ")) {
        const chatId = update.message.chat.id;
        const userId = update.message.from.id;
        const promoCode = update.message.text
          .replace(/^\/promo(?:@\w+)?\s+/i, "")
          .trim()
          .toUpperCase();

        if (!kv) return new Response("OK");

        if (!/^[A-Z0-9_-]{3,32}$/.test(promoCode)) {
          await callApi("sendMessage", {
            chat_id: chatId,
            text: "❌ Неверный формат промокода."
          }, BOT_TOKEN);

          return new Response("OK");
        }

        const promoData = await kv.get(`promo:${promoCode}`);

        if (!promoData) {
          await callApi("sendMessage", {
            chat_id: chatId,
            text: "❌ Промокод не найден или недействителен."
          }, BOT_TOKEN);

          return new Response("OK");
        }

        const promo = JSON.parse(promoData);
        const usedKey = `promo_used:${promoCode}:${userId}`;

        if (await kv.get(usedKey)) {
          await callApi("sendMessage", {
            chat_id: chatId,
            text: "⚠️ Вы уже использовали этот промокод."
          }, BOT_TOKEN);

          return new Response("OK");
        }

        const uses = Number(promo.uses || 0);
        const maxUses = Number(promo.maxUses || 0);

        if (maxUses > 0 && uses >= maxUses) {
          await callApi("sendMessage", {
            chat_id: chatId,
            text: "❌ Лимит использований этого промокода исчерпан."
          }, BOT_TOKEN);

          return new Response("OK");
        }

        // БЕССРОЧНЫЙ ДОСТУП

        if (promo.rewardType === "permanent") {
          await kv.put(usedKey, "true");

          await kv.put(
            `allowed_id:${userId}`,
            "true"
          );

          promo.uses = uses + 1;

          await kv.put(
            `promo:${promoCode}`,
            JSON.stringify(promo)
          );

          await callApi("sendMessage", {
            chat_id: chatId,
            text:
              `🎉 <b>ПРОМОКОД АКТИВИРОВАН!</b>\n\n` +
              `🎟 Код: <code>${promoCode}</code>\n` +
              `♾ Вам выдан <b>бессрочный доступ</b> к созданию офферов!\n\n` +
              `Нажмите /start, чтобы открыть меню.`,
            parse_mode: "HTML"
          }, BOT_TOKEN);

          return new Response("OK");
        }

        // СКИДКИ STARS / TON

        let discountStars = 0;
        let discountTon = 0;

        if (promo.rewardType === "stars") {
          discountStars = Number(promo.rewardValue || 0);
        } else if (promo.rewardType === "ton") {
          discountTon = Number(promo.rewardValue || 0);
        } else {
          discountStars = Number(promo.discountStars || 0);
          discountTon = Number(promo.discountTon || 0);
        }

        const newStars = Math.max(
          0,
          BASE_STARS_PRICE - discountStars
        );

        const newTon = Math.max(
          0,
          BASE_TON_PRICE - discountTon
        ).toFixed(2);

        await kv.put(usedKey, "true");

        promo.uses = uses + 1;

        await kv.put(
          `promo:${promoCode}`,
          JSON.stringify(promo)
        );

        const text =
          `✅ <b>ПРОМОКОД ПРИМЕНЁН!</b>\n\n` +
          `🎟 Код: <code>${promoCode}</code>\n\n` +
          `💳 <b>Ваши цены:</b>\n` +
          `⭐ Stars: <b>${newStars}</b>\n` +
          `💎 TON: <b>${newTon}</b>\n\n` +
          `Выберите способ оплаты:`;

        const markup = {
          inline_keyboard: [
            [{
              text: `⭐ Оплатить ${newStars} Stars`,
              callback_data: `pay_promo_stars_${newStars}`
            }],
            [{
              text: `💎 Оплатить ${newTon} TON`,
              callback_data: `pay_promo_ton_${newTon}`
            }]
          ]
        };

        await callApi("sendMessage", {
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          reply_markup: markup
        }, BOT_TOKEN);

        return new Response("OK");
      }

      // ==========================================
      // АДМИН: /add и /remove
      // ==========================================

      if (
        update.message?.text?.startsWith("/add ") ||
        update.message?.text?.startsWith("/remove ")
      ) {
        const senderId = update.message.from.id;

        if (senderId !== ADMIN_ID) {
          return new Response("OK");
        }

        if (!kv) return new Response("OK");

        const args = update.message.text.split(/\s+/);
        const command = args[0];
        const targetUser = args[1];

        if (!targetUser) return new Response("OK");

        if (
          command === "/remove" &&
          targetUser.toLowerCase() === "all"
        ) {
          try {
            let cursor;
            const keysToDelete = [];

            do {
              const list = await kv.list({ cursor });

              for (const key of list.keys) {
                if (
                  key.name.startsWith("allowed_") &&
                  key.name !== `allowed_id:${ADMIN_ID}`
                ) {
                  keysToDelete.push(key.name);
                }
              }

              cursor = list.cursor;
            } while (cursor);

            for (const key of [...new Set(keysToDelete)]) {
              await kv.delete(key);
            }

            await callApi("sendMessage", {
              chat_id: update.message.chat.id,
              text: "🗑 <b>Список доступа очищен!</b>",
              parse_mode: "HTML"
            }, BOT_TOKEN);

          } catch (err) {
            console.error(err);
          }

          return new Response("OK");
        }

        if (command === "/add") {
          if (targetUser.startsWith("@")) {
            const uname = targetUser
              .slice(1)
              .toLowerCase();

            const userId = await kv.get(
              `username_id:${uname}`
            );

            if (!userId) {
              await callApi("sendMessage", {
                chat_id: update.message.chat.id,
                text:
                  "⚠️ Пользователь не найден. " +
                  "Пусть сначала нажмёт /start."
              }, BOT_TOKEN);
            } else {
              await kv.put(
                `allowed_username:${uname}`,
                "true"
              );

              await kv.put(
                `allowed_id:${userId}`,
                "true"
              );

              await callApi("sendMessage", {
                chat_id: update.message.chat.id,
                text: `✅ Пользователь <b>@${uname}</b> добавлен.`,
                parse_mode: "HTML"
              }, BOT_TOKEN);
            }
          } else {
            await kv.put(
              `allowed_id:${targetUser}`,
              "true"
            );

            await callApi("sendMessage", {
              chat_id: update.message.chat.id,
              text: `✅ ID <code>${targetUser}</code> добавлен.`,
              parse_mode: "HTML"
            }, BOT_TOKEN);
          }

        } else if (command === "/remove") {
          if (targetUser.startsWith("@")) {
            await kv.delete(
              `allowed_username:${targetUser.slice(1).toLowerCase()}`
            );
          } else {
            await kv.delete(`allowed_id:${targetUser}`);
          }

          await callApi("sendMessage", {
            chat_id: update.message.chat.id,
            text: "🗑 Пользователь удален."
          }, BOT_TOKEN);
        }

        return new Response("OK");
      }

      // ==========================================
      // РАССЫЛКА /text
      // ==========================================

      if (update.message?.text?.startsWith("/text ")) {
        if (update.message.from.id !== ADMIN_ID) {
          return new Response("OK");
        }

        if (!kv) return new Response("OK");

        const broadcastText = update.message.text.replace(
          /^\/text\s+/,
          ""
        );

        if (!broadcastText) return new Response("OK");

        let cursor;
        const users = [];

        do {
          const list = await kv.list({
            cursor,
            prefix: "user:"
          });

          for (const key of list.keys) {
            users.push(key.name.replace("user:", ""));
          }

          cursor = list.cursor;
        } while (cursor);

        let delivered = 0;
        let failed = 0;

        for (const userId of users) {
          try {
            await callApi("sendMessage", {
              chat_id: userId,
              text: broadcastText,
              parse_mode: "HTML"
            }, BOT_TOKEN);

            delivered++;
          } catch (e) {
            failed++;
          }
        }

        await callApi("sendMessage", {
          chat_id: update.message.chat.id,
          text:
            `✅ Рассылка завершена.\n\n` +
            `📨 Доставлено: ${delivered}\n` +
            `❌ Ошибок: ${failed}`
        }, BOT_TOKEN);

        return new Response("OK");
      }

      // ==========================================
      // СТАТИСТИКА /stats
      // ==========================================

      if (update.message?.text === "/stats") {
        const senderId = update.message.from.id;
        const chatId = update.message.chat.id;

        if (senderId !== ADMIN_ID) {
          return new Response("OK");
        }

        if (!kv) return new Response("OK");

        let cursor;
        const accessList = [];
        let totalUsers = 0;
        let totalOffers = 0;

        do {
          const list = await kv.list({ cursor });

          for (const key of list.keys) {
            if (key.name.startsWith("user:")) totalUsers++;
            if (key.name.startsWith("offer:")) totalOffers++;

            if (key.name.startsWith("allowed_id:")) {
              const userId = key.name.replace("allowed_id:", "");
              const username =
                await kv.get(`user:${userId}`) || "нет_в_базе";

              accessList.push(`@${username} (${userId})`);
            }
          }

          cursor = list.cursor;
        } while (cursor);

        let statsText =
          `📊 <b>Статистика:</b>\n\n` +
          `👥 Всего: ${totalUsers}\n` +
          `👤 С доступом: ${accessList.length}\n` +
          `📦 Офферов: ${totalOffers}\n\n`;

        if (accessList.length > 0) {
          statsText +=
            `📋 <b>Доступ:</b>\n${accessList.join("\n")}`;
        }

        await callApi("sendMessage", {
          chat_id: chatId,
          text: statsText,
          parse_mode: "HTML"
        }, BOT_TOKEN);

        return new Response("OK");
      }

      // ==========================================
      // /START
      // ==========================================

      if (update.message?.text?.startsWith("/start")) {
        const chatId = update.message.chat.id;
        const userId = update.message.from.id;
        const username =
          update.message.from.username || "no_username";

        if (kv) {
          await kv.put(`user:${userId}`, username);

          if (username !== "no_username") {
            await kv.put(
              `username_id:${username.toLowerCase()}`,
              userId.toString()
            );
          }
        }

        if (userId !== ADMIN_ID) {
          const subscribed = await isSubscribed(userId);

          if (!subscribed) {
            const subText =
              `⚠️ <b>Для использования бота подпишитесь на наш канал!</b>\n\n` +
              `1. Подпишитесь на ${CHANNEL_ID}\n` +
              `2. Нажмите кнопку «Проверить» ниже.`;

            const subMarkup = {
              inline_keyboard: [
                [{
                  text: "📢 Подписаться",
                  url: `https://t.me/${CHANNEL_ID.replace("@", "")}`
                }],
                [{
                  text: "🔄 Проверить",
                  callback_data: "check_sub"
                }]
              ]
            };

            await callApi("sendMessage", {
              chat_id: chatId,
              text: subText,
              parse_mode: "HTML",
              reply_markup: subMarkup
            }, BOT_TOKEN);

            return new Response("OK");
          }
        }

        const hasAccess = await checkAccess(
          userId,
          username
        );

        let startText = "";
        let startMarkup = [];

        if (hasAccess) {
          startText =
            `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n` +
            `✅ <b>У вас есть доступ к созданию офферов!</b>\n\n` +
            `📖 <b>Как создать оффер (пошагово):</b>\n\n` +
            `1. Зайдите в профиль человека, у которого есть нужный вам подарок.\n` +
            `2. Найдите этот подарок и скопируйте на него ссылку.\n` +
            `3. Выйдите в любой чат и напишите:\n\n` +
            `<code>@${BOT_USERNAME} [ссылка] [цена] [валюта]</code>\n\n` +
            `<b>Пример:</b>\n` +
            `<code>@${BOT_USERNAME} t.me/nft/PrettyPosy-5375 500 stars</code>`;

          startMarkup = [
            [{
              text: "📖 Инструкция",
              callback_data: "how_to_offer"
            }],
            [{
              text: "👥 Наша группа",
              url: "https://t.me/+24x_cIR6se01NWQy"
            }]
          ];
        } else {
          startText =
            `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n` +
            `🔒 <b>У вас нет доступа.</b>\n\n` +
            `Вы можете купить доступ, нажав на кнопку ниже.`;

          startMarkup = [
            [{
              text: "💳 Купить доступ",
              callback_data: "buy_access"
            }],
            [{
              text: "👥 Наша группа",
              url: "https://t.me/+24x_cIR6se01NWQy"
            }]
          ];
        }

        await callApi("sendMessage", {
          chat_id: chatId,
          text: startText,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: startMarkup
          },
          disable_web_page_preview: true
        }, BOT_TOKEN);
      }

      // ==========================================
      // INLINE-ЗАПРОСЫ
      // ==========================================

      if (update.inline_query) {
        const iq = update.inline_query;
        const userId = iq.from.id;
        const username = iq.from.username || "";

        if (userId !== ADMIN_ID) {
          const subscribed = await isSubscribed(userId);
          if (!subscribed) return new Response("OK");
        }

        const hasAccess = await checkAccess(
          userId,
          username
        );

        if (!hasAccess) return new Response("OK");

        let textQuery = iq.query
          .replace(/[\u00A0\u200B\u202F]/g, " ")
          .replace(/https?:\/\//gi, "")
          .trim()
          .toLowerCase();

        // По умолчанию русский
        let lang = "ru";

        // Ищем ТОЛЬКО отдельные слова (en, cn, ar, ru)
        if (/\b(en|eng)\b/.test(textQuery)) {
          lang = "en";
          textQuery = textQuery.replace(/\b(en|eng)\b/g, "").trim();
        } else if (/\bcn\b/.test(textQuery)) {
          lang = "cn";
          textQuery = textQuery.replace(/\bcn\b/g, "").trim();
        } else if (/\bar\b/.test(textQuery)) {
          lang = "ar";
          textQuery = textQuery.replace(/\bar\b/g, "").trim();
        } else if (/\bru\b/.test(textQuery)) {
          lang = "ru";
          textQuery = textQuery.replace(/\bru\b/g, "").trim();
        }

        const allNums = textQuery.match(/\d+/g);
        const amount = allNums
          ? allNums[allNums.length - 1]
          : "0";

        const giftMatch = textQuery.match(
          /(?:https?:\/\/)?(?:t\.me\/nft\/)?[A-Za-z0-9_-]+/i
        );

        let giftLink = "";

        if (giftMatch) {
          const rawGift = giftMatch[0].replace(
            /^https?:\/\//,
            ""
          );

          giftLink = rawGift.startsWith("t.me")
            ? "https://" + rawGift
            : "https://t.me/nft/" + rawGift;
        }

        let currencyType = "stars";
        let currencyDisplay = "⭐ Stars";

        if (
          textQuery.includes("gram") ||
          textQuery.includes("ton")
        ) {
          currencyType = "gram";
          currencyDisplay = "💎 Gram";
        } else if (
          textQuery.includes("rub") ||
          textQuery.includes("руб")
        ) {
          currencyType = "rub";
          currencyDisplay = "₽ Rub";
        }

        let senderName = iq.from.first_name || "";

        if (iq.from.last_name) {
          senderName += " " + iq.from.last_name;
        }

        if (!senderName) {
          senderName = iq.from.username
            ? "@" + iq.from.username
            : "Игрок";
        }

        const targetReceiver = iq.from.username || "gwrex";

        let text = "";
        let btnAccept = "Принять";
        let btnDecline = "Отклонить";
        let titleText = "";

        // УПРОЩЕННЫЕ ТЕКСТЫ ДЛЯ ОФФЕРОВ
        if (lang === "en") {
          text =
            `<b>Gift Offer</b>\n\n` +
            `You are offered <b>${amount} ${currencyDisplay}</b>\n` +
            `${giftLink}`;
          btnAccept = "Accept";
          btnDecline = "Decline";
          titleText = `Offer: ${amount} ${currencyDisplay}`;
        } else if (lang === "cn") {
          text =
            `<b>礼物报价</b>\n\n` +
            `有人为您提供 <b>${amount} ${currencyDisplay}</b>\n` +
            `${giftLink}`;
          btnAccept = "接受";
          btnDecline = "拒绝";
          titleText = `报价: ${amount} ${currencyDisplay}`;
        } else if (lang === "ar") {
          text =
            `<b>عرض هدية</b>\n\n` +
            `تم تقديم لك <b>${amount} ${currencyDisplay}</b>\n` +
            `${giftLink}`;
          btnAccept = "قبول";
          btnDecline = "رفض";
          titleText = `عرض: ${amount} ${currencyDisplay}`;
        } else {
          // Русский (по умолчанию)
          text =
            `<b>Оффер на подарок</b>\n\n` +
            `Вам предлагают <b>${amount} ${currencyDisplay}</b>\n` +
            `${giftLink}`;
          titleText = `Оффер: ${amount} ${currencyDisplay}`;
        }

        const offerId = Math.random()
          .toString(36)
          .substring(2, 10);

        if (kv) {
          await kv.put(
            `offer:${offerId}`,
            JSON.stringify({
              amount,
              currencyType,
              giftLink,
              lang,
              senderName,
              targetReceiver
            }),
            { expirationTtl: 86400 }
          );
        }

        const results = [{
          type: "article",
          id: "1",
          title: titleText,
          description: `${amount} ${currencyDisplay}`,
          input_message_content: {
            message_text: text,
            parse_mode: "HTML"
          },
          reply_markup: {
            inline_keyboard: [
              [{
                text: btnAccept,
                callback_data: `acc|${offerId}`
              }],
              [{
                text: btnDecline,
                callback_data: `dec|${offerId}`
              }]
            ]
          }
        }];

        await callApi("answerInlineQuery", {
          inline_query_id: iq.id,
          results,
          cache_time: 0
        }, BOT_TOKEN);
      }

      // ==========================================
      // CALLBACK-КНОПКИ
      // ==========================================

      if (update.callback_query) {
        const cq = update.callback_query;

        // ------------------------------------------
        // НОВЫЙ ОБРАБОТЧИК: КАК КИДАТЬ ОФФЕРЫ
        // ------------------------------------------

        if (cq.data === "how_to_offer") {
          await answerCallback(cq.id);

          const instructionText =
            `📖 <b>ПОДРОБНАЯ ИНСТРУКЦИЯ: Как создать оффер</b>\n\n` +
            `Чтобы предложить кому-то купить у него подарок, вам нужно создать инлайн-запрос.\n\n` +
            `<b>Шаг 1: Найдите подарок</b>\n` +
            `Зайдите в профиль человека, у которого есть нужный вам подарок.\n\n` +
            `<b>Шаг 2: Скопируйте ссылку</b>\n` +
            `Нажмите на подарок и выберите «Скопировать ссылку» (или скопируйте из адресной строки).\n\n` +
            `<b>Шаг 3: Создайте оффер</b>\n` +
            `Выйдите в <i>любой</i> чат (например, в «Избранное») и напишите:\n` +
            `<code>@${BOT_USERNAME} [ссылка_на_подарок] [цена] [валюта]</code>\n\n` +
            `<b>Пример 1 (в звездах):</b>\n` +
            `<code>@${BOT_USERNAME} t.me/nft/PrettyPosy-5375 500 stars</code>\n\n` +
            `<b>Пример 2 (в TON):</b>\n` +
            `<code>@${BOT_USERNAME} https://t.me/nft/PrettyPosy-5375 3 ton</code>\n\n` +
            `<b>Шаг 4: Отправьте оффер</b>\n` +
            `Бот предложит вам результат — нажмите на него, и оффер будет отправлен в чат.\n\n` +
            `💡 <b>Полезные советы:</b>\n` +
            `• Вы можете добавить код языка в конце (например, <code>en</code>, <code>cn</code>, <code>ar</code>), чтобы оффер пришел на нужном языке. По умолчанию — русский.\n` +
            `• Цена и валюта могут быть любыми, но продавец должен согласиться.`;

          const markup = {
            inline_keyboard: [
              [
                {
                  text: "⬅️ В главное меню",
                  callback_data: "back_to_start"
                }
              ]
            ]
          };

          await callApi("sendMessage", {
            chat_id: cq.message.chat.id,
            text: instructionText,
            parse_mode: "HTML",
            reply_markup: markup,
            disable_web_page_preview: true
          }, BOT_TOKEN);
        }

        // ------------------------------------------
        // ПРОМОКОДЫ: ПЕРЕЛИСТЫВАНИЕ СПИСКА
        // ------------------------------------------

        if (cq.data.startsWith("promolist|")) {
          if (cq.from.id !== ADMIN_ID) {
            await answerCallback(
              cq.id,
              "⛔ Эта панель доступна только админу.",
              true
            );

            return new Response("OK");
          }

          const page = parseInt(
            cq.data.split("|")[1] || "0"
          );

          await answerCallback(cq.id);

          await showPromos(
            cq.message.chat.id,
            page,
            cq.message.message_id
          );

          return new Response("OK");
        }

        // ------------------------------------------
        // ПРОМОКОДЫ: НАЖАТИЕ УДАЛИТЬ
        // ------------------------------------------

        if (cq.data.startsWith("promodel|")) {
          if (cq.from.id !== ADMIN_ID) {
            await answerCallback(
              cq.id,
              "⛔ Только администратор может удалять промокоды.",
              true
            );

            return new Response("OK");
          }

          const parts = cq.data.split("|");
          const code = parts[1];
          const page = parseInt(parts[2] || "0");

          await answerCallback(cq.id);

          const promoExists = kv
            ? await kv.get(`promo:${code}`)
            : null;

          if (!promoExists) {
            await callApi("editMessageText", {
              chat_id: cq.message.chat.id,
              message_id: cq.message.message_id,
              text: `❌ Промокод ${code} уже не существует.`,
              reply_markup: {
                inline_keyboard: [[
                  {
                    text: "⬅️ К списку",
                    callback_data: `promolist|${page}`
                  }
                ]]
              }
            }, BOT_TOKEN);

            return new Response("OK");
          }

          await callApi("editMessageText", {
            chat_id: cq.message.chat.id,
            message_id: cq.message.message_id,
            text:
              `⚠️ <b>УДАЛЕНИЕ ПРОМОКОДА</b>\n\n` +
              `Ты действительно хочешь удалить код:\n` +
              `🎟 <code>${code}</code>?\n\n` +
              `История его использований также будет удалена.`,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{
                  text: "✅ Да, удалить",
                  callback_data: `promoconfirm|${code}|${page}`
                }],
                [{
                  text: "↩️ Отмена",
                  callback_data: `promolist|${page}`
                }]
              ]
            }
          }, BOT_TOKEN);

          return new Response("OK");
        }

        // ------------------------------------------
        // ПРОМОКОДЫ: ПОДТВЕРЖДЕНИЕ УДАЛЕНИЯ
        // ------------------------------------------

        if (cq.data.startsWith("promoconfirm|")) {
          if (cq.from.id !== ADMIN_ID) {
            await answerCallback(
              cq.id,
              "⛔ Только администратор может удалять промокоды.",
              true
            );

            return new Response("OK");
          }

          const parts = cq.data.split("|");
          const code = parts[1];
          const page = parseInt(parts[2] || "0");

          await answerCallback(cq.id);

          const promoExists = kv
            ? await kv.get(`promo:${code}`)
            : null;

          if (!promoExists) {
            await showPromos(
              cq.message.chat.id,
              page,
              cq.message.message_id
            );

            return new Response("OK");
          }

          await deletePromoCompletely(code);

          await callApi("editMessageText", {
            chat_id: cq.message.chat.id,
            message_id: cq.message.message_id,
            text:
              `🗑 <b>ПРОМОКОД УДАЛЁН</b>\n\n` +
              `Код <code>${code}</code> удалён вместе с историей использований.`,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [[
                {
                  text: "⬅️ Вернуться к промокодам",
                  callback_data: `promolist|${page}`
                }
              ]]
            }
          }, BOT_TOKEN);

          return new Response("OK");
        }

        // ------------------------------------------
        // ПРОВЕРКА ПОДПИСКИ
        // ------------------------------------------

        if (cq.data === "check_sub") {
          const subscribed = await isSubscribed(cq.from.id);

          if (subscribed) {
            await answerCallback(
              cq.id,
              "✅ Подписка подтверждена!",
              true
            );

            const chatId = cq.message.chat.id;
            const userId = cq.from.id;
            const username =
              cq.from.username || "no_username";

            if (kv) {
              await kv.put(`user:${userId}`, username);

              if (username !== "no_username") {
                await kv.put(
                  `username_id:${username.toLowerCase()}`,
                  userId.toString()
                );
              }
            }

            const hasAccess = await checkAccess(
              userId,
              username
            );

            let startText = "";
            let startMarkup = [];

            if (hasAccess) {
              startText =
                `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n` +
                `✅ <b>У вас есть доступ к созданию офферов!</b>\n\n` +
                `📖 <b>Как создать оффер:</b>\n\n` +
                `1. Зайдите в профиль человека с подарком.\n` +
                `2. Скопируйте ссылку на подарок.\n` +
                `3. Напишите в любом чате:\n\n` +
                `<code>@${BOT_USERNAME} [ссылка] [цена] [валюта]</code>\n\n` +
                `<b>Пример:</b>\n` +
                `<code>@${BOT_USERNAME} t.me/nft/PrettyPosy-5375 500 stars</code>`;

              startMarkup = [
                [{
                  text: "📖 Инструкция",
                  callback_data: "how_to_offer"
                }],
                [{
                  text: "👥 Наша группа",
                  url: "https://t.me/+24x_cIR6se01NWQy"
                }]
              ];

            } else {
              startText =
                `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n` +
                `🔒 <b>У вас нет доступа.</b>\n\n` +
                `Вы можете купить доступ, нажав на кнопку ниже.`;

              startMarkup = [
                [{
                  text: "💳 Купить доступ",
                  callback_data: "buy_access"
                }],
                [{
                  text: "👥 Наша группа",
                  url: "https://t.me/+24x_cIR6se01NWQy"
                }]
              ];
            }

            await callApi("editMessageText", {
              chat_id: cq.message.chat.id,
              message_id: cq.message.message_id,
              text: startText,
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: startMarkup
              },
              disable_web_page_preview: true
            }, BOT_TOKEN);

          } else {
            await answerCallback(
              cq.id,
              "❌ Вы все еще не подписаны!",
              true
            );
          }
        }

        // ------------------------------------------
        // ПОКУПКА ДОСТУПА
        // ------------------------------------------

        if (cq.data === "buy_access") {
          await answerCallback(cq.id);

          const buyText =
            `💳 <b>Выберите способ оплаты:</b>\n\n` +
            `1. <b>${BASE_STARS_PRICE} ⭐ Stars</b> (перевод на аккаунт)\n` +
            `2. <b>${BASE_TON_PRICE} 💎 TON</b> (перевод на кошелек)\n\n` +
            `🛒 <b>Где купить Stars?</b>\n` +
            `1️⃣ Официальный бот: <a href="https://t.me/stars_mint_bot?start=ref_r9pmn25y44jk">Stars Mint Bot</a>\n` +
            `2️⃣ Маркетплейсы: FunPay или Playerok\n\n` +
            `⚠️ <b>Важно:</b> Покупайте ровно ${BASE_STARS_PRICE} звезд (пополнение баланса, не подарком). Если покупаете подарком — учитывайте комиссию при его обмене на звезды!\n\n` +
            `<i>После выбора способа вы получите реквизиты для оплаты.</i>`;

          const buyMarkup = {
            inline_keyboard: [
              [{
                text: `⭐ Оплатить ${BASE_STARS_PRICE} Stars`,
                callback_data: "pay_stars"
              }],
              [{
                text: `💎 Оплатить ${BASE_TON_PRICE} TON`,
                callback_data: "pay_ton"
              }],
              [{
                text: "🎁 Ввести промокод",
                callback_data: "enter_promo"
              }]
            ]
          };

          await callApi("sendMessage", {
            chat_id: cq.message.chat.id,
            text: buyText,
            parse_mode: "HTML",
            reply_markup: buyMarkup,
            disable_web_page_preview: true
          }, BOT_TOKEN);
        }

        // ------------------------------------------
        // ВВОД ПРОМОКОДА
        // ------------------------------------------

        if (cq.data === "enter_promo") {
          await answerCallback(cq.id);

          await callApi("sendMessage", {
            chat_id: cq.message.chat.id,
            text:
              "🎁 Отправьте команду с промокодом:\n\n" +
              "<code>/promo NEWYEAR2027</code>",
            parse_mode: "HTML"
          }, BOT_TOKEN);
        }

        // ------------------------------------------
        // ОПЛАТА STARS
        // ------------------------------------------

        if (cq.data === "pay_stars") {
          await answerCallback(cq.id);

          const text =
            `⭐ <b>Оплата доступа (${BASE_STARS_PRICE} Stars)</b>\n\n` +
            `Выберите удобный для вас способ оплаты:\n\n` +
            `1️⃣ <b>Официальный бот:</b>\n` +
            `Купите ${BASE_STARS_PRICE} звезд в <a href="https://t.me/stars_mint_bot?start=ref_r9pmn25y44jk">Stars Mint Bot</a> и переведите их на аккаунт <b>@gwrex</b>.\n\n` +
            `2️⃣ <b>Оплата подарком:</b>\n` +
            `Отправьте подарок стоимостью <b>3 алмаза</b> (с учетом комиссии при обмене подарка на звезды) на аккаунт <b>@gwrex</b>.\n\n` +
            `3️⃣ <b>Маркетплейсы:</b>\n` +
            `Также можно официально приобрести звезды на площадках <b>PlayerOk</b> или <b>FunPay</b> (ищите продавцов с хорошими отзывами).\n\n` +
            `⚠️ <i>После оплаты нажмите кнопку ниже и отправьте скриншот чека!</i>`;

          const markup = {
            inline_keyboard: [
              [
                {
                  text: "⭐ Купить через StarsMint Bot",
                  url: "https://t.me/stars_mint_bot?start=ref_r9pmn25y44jk"
                }
              ],
              [
                {
                  text: "🎁 Отправить подарок (3 алмаза)",
                  url: "https://t.me/gwrex" 
                }
              ],
              [
                {
                  text: "✅ Я оплатил",
                  callback_data: "paid_check"
                }
              ],
              [
                {
                  text: "⬅️ Назад к выбору",
                  callback_data: "buy_access"
                }
              ]
            ]
          };

          await callApi("sendMessage", {
            chat_id: cq.message.chat.id,
            text,
            parse_mode: "HTML",
            reply_markup: markup,
            disable_web_page_preview: true
          }, BOT_TOKEN);
        }

        // ------------------------------------------
        // ОПЛАТА TON
        // ------------------------------------------

        if (cq.data === "pay_ton") {
          await answerCallback(cq.id);

          const text =
            `💎 <b>Оплата ${BASE_TON_PRICE} TON</b>\n\n` +
            `Переведите ${BASE_TON_PRICE} TON на кошелек:\n` +
            `<code>${TON_WALLET}</code>\n\n` +
            `После перевода нажмите кнопку ниже и отправьте скриншот чека.`;

          const markup = {
            inline_keyboard: [
              [
                {
                  text: "✅ Я оплатил",
                  callback_data: "paid_check"
                }
              ],
              [
                {
                  text: "⬅️ Назад к выбору",
                  callback_data: "buy_access"
                }
              ]
            ]
          };

          await callApi("sendMessage", {
            chat_id: cq.message.chat.id,
            text,
            parse_mode: "HTML",
            reply_markup: markup
          }, BOT_TOKEN);
        }

        // ------------------------------------------
        // НОВЫЙ ОБРАБОТЧИК: Я ОПЛАТИЛ
        // ------------------------------------------

        if (cq.data === "paid_check") {
          await answerCallback(cq.id);

          await callApi("sendMessage", {
            chat_id: cq.message.chat.id,
            text: "📸 <b>Отлично!</b>\n\nОтправьте скриншот с оплатой, заявка будет обработана в течении 5 минут.",
            parse_mode: "HTML"
          }, BOT_TOKEN);
        }

        // ------------------------------------------
        // ОПЛАТА STARS С ПРОМОКОДОМ
        // ------------------------------------------

        if (cq.data.startsWith("pay_promo_stars_")) {
          await answerCallback(cq.id);

          const price = cq.data.replace(
            "pay_promo_stars_",
            ""
          );

          const text =
            `⭐ <b>Оплата ${price} Stars (со скидкой)</b>\n\n` +
            `Переведите ${price} звезд на аккаунт: <a href="https://t.me/gwrex">клик</a>\n\n` +
            `После перевода нажмите кнопку ниже и отправьте скриншот чека.`;

          const markup = {
            inline_keyboard: [
              [
                {
                  text: "✅ Я оплатил",
                  callback_data: "paid_check"
                }
              ],
              [
                {
                  text: "⬅️ Назад к выбору",
                  callback_data: "buy_access"
                }
              ]
            ]
          };

          await callApi("sendMessage", {
            chat_id: cq.message.chat.id,
            text,
            parse_mode: "HTML",
            reply_markup: markup,
            disable_web_page_preview: true
          }, BOT_TOKEN);
        }

        // ------------------------------------------
        // ОПЛАТА TON С ПРОМОКОДОМ
        // ------------------------------------------

        if (cq.data.startsWith("pay_promo_ton_")) {
          await answerCallback(cq.id);

          const price = cq.data.replace(
            "pay_promo_ton_",
            ""
          );

          const text =
            `💎 <b>Оплата ${price} TON (со скидкой)</b>\n\n` +
            `Переведите ${price} TON на кошелек:\n` +
            `<code>${TON_WALLET}</code>\n\n` +
            `После перевода нажмите кнопку ниже и отправьте скриншот чека.`;

          const markup = {
            inline_keyboard: [
              [
                {
                  text: "✅ Я оплатил",
                  callback_data: "paid_check"
                }
              ],
              [
                {
                  text: "⬅️ Назад к выбору",
                  callback_data: "buy_access"
                }
              ]
            ]
          };

          await callApi("sendMessage", {
            chat_id: cq.message.chat.id,
            text,
            parse_mode: "HTML",
            reply_markup: markup
          }, BOT_TOKEN);
        }

        // ==========================================
        // ПРИНЯТИЕ И ОТКЛОНЕНИЕ ЧЕКОВ
        // ==========================================

        if (
          cq.data.startsWith("approve_") ||
          cq.data.startsWith("reject_")
        ) {
          if (cq.from.id !== ADMIN_ID) {
            await answerCallback(
              cq.id,
              "⛔ Вы не админ.",
              true
            );

            return new Response("OK");
          }

          const action = cq.data.split("_")[0];
          const targetUserId = cq.data.split("_")[1];

          if (action === "approve") {
            if (kv) {
              await kv.put(
                `allowed_id:${targetUserId}`,
                "true"
              );
            }

            await answerCallback(
              cq.id,
              "Доступ выдан ✅"
            );

            try {
              await callApi("sendMessage", {
                chat_id: targetUserId,
                text:
                  "✅ <b>Оплата подтверждена!</b>\n\n" +
                  "Вам выдан доступ. Теперь вы можете создавать офферы.\n\n" +
                  "👋 <b>Добро пожаловать в нашу группу!</b>\n" +
                  "Там вы найдете новости, полезные советы и сможете общаться с другими пользователями:\n" +
                  "👉 <a href=\"https://t.me/+24x_cIR6se01NWQy\">Вступить в группу</a>",
                parse_mode: "HTML",
                disable_web_page_preview: true,
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "📖 Как кидать офферы", callback_data: "how_to_offer" }],
                    [{ text: "👥 Наша группа", url: "https://t.me/+24x_cIR6se01NWQy" }]
                  ]
                }
              }, BOT_TOKEN);
            } catch (e) {
              console.error(
                "Не удалось отправить сообщение пользователю:",
                e.message
              );
            }

            await callApi("editMessageCaption", {
              chat_id: cq.message.chat.id,
              message_id: cq.message.message_id,
              caption:
                (cq.message.caption || "") +
                "\n\n✅ <b>Одобрено</b>",
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: []
              }
            }, BOT_TOKEN);

          } else {
            await answerCallback(
              cq.id,
              "Отклонено ❌"
            );

            try {
              await callApi("sendMessage", {
                chat_id: targetUserId,
                text:
                  "❌ <b>Оплата отклонена.</b>\n\n" +
                  "Если вы уверены, что оплатили, свяжитесь с админом.",
                parse_mode: "HTML"
              }, BOT_TOKEN);
            } catch (e) {
              console.error(
                "Не удалось уведомить пользователя:",
                e.message
              );
            }

            await callApi("editMessageCaption", {
              chat_id: cq.message.chat.id,
              message_id: cq.message.message_id,
              caption:
                (cq.message.caption || "") +
                "\n\n❌ <b>Отклонено</b>",
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: []
              }
            }, BOT_TOKEN);
          }
        }

        // ==========================================
        // ВОЗВРАТ В ГЛАВНОЕ МЕНЮ
        // ==========================================

        if (cq.data === "back_to_start") {
          await answerCallback(cq.id);

          const userId = cq.from.id;
          const username =
            cq.from.username || "no_username";

          const hasAccess = await checkAccess(
            userId,
            username
          );

          let startText = "";
          let startMarkup = [];

          if (hasAccess) {
            startText =
              `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n` +
              `✅ <b>У вас есть доступ к созданию офферов!</b>\n\n` +
              `📖 <b>Как создать оффер:</b>\n\n` +
              `1. Зайдите в профиль человека с подарком.\n` +
              `2. Скопируйте ссылку на подарок.\n` +
              `3. Напишите в любом чате:\n\n` +
              `<code>@${BOT_USERNAME} [ссылка] [цена] [валюта]</code>\n\n` +
              `<b>Пример:</b>\n` +
              `<code>@${BOT_USERNAME} t.me/nft/PrettyPosy-5375 500 stars</code>`;

            startMarkup = [
              [{
                text: "📖 Инструкция",
                callback_data: "how_to_offer"
              }],
              [{
                text: "👥 Наша группа",
                url: "https://t.me/+24x_cIR6se01NWQy"
              }]
            ];

          } else {
            startText =
              `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n` +
              `🔒 <b>У вас нет доступа.</b>\n\n` +
              `Вы можете купить доступ, нажав на кнопку ниже.`;

            startMarkup = [
              [{
                text: "💳 Купить доступ",
                callback_data: "buy_access"
              }],
              [{
                text: "👥 Наша группа",
                url: "https://t.me/+24x_cIR6se01NWQy"
              }]
            ];
          }

          try {
            await callApi("editMessageText", {
              chat_id: cq.message.chat.id,
              message_id: cq.message.message_id,
              text: startText,
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: startMarkup
              },
              disable_web_page_preview: true
            }, BOT_TOKEN);
          } catch (e) {}
        }

        // ==========================================
        // ПРИНЯТИЕ И ОТКЛОНЕНИЕ ОФФЕРОВ
        // ==========================================

        if (
          cq.data.startsWith("acc|") ||
          cq.data.startsWith("dec|")
        ) {
          const dataParts = cq.data.split("|");
          const action = dataParts[0];
          const offerId = dataParts[1];

          if (!offerId) return new Response("OK");

          let offer = {
            amount: "0",
            currencyType: "stars",
            giftLink: "",
            lang: "ru",
            senderName: "",
            targetReceiver: "gwrex"
          };

          if (kv) {
            const saved = await kv.get(`offer:${offerId}`);

            if (saved) {
              offer = JSON.parse(saved);
            }
          }

          const amount = offer.amount;
          const currencyType = offer.currencyType;
          const lang = offer.lang;
          const targetReceiver =
            offer.targetReceiver || "gwrex";

          let displayCurrency = "⭐ Stars";

          if (currencyType === "gram") {
            displayCurrency = "💎 Gram";
          }

          if (currencyType === "rub") {
            displayCurrency = "₽ Rub";
          }

          let newText = "";
          let newMarkup = {
            inline_keyboard: []
          };

          if (action === "acc") {
            
            // Уведомления
            if (lang === "en") await answerCallback(cq.id, "Offer accepted ✅", true);
            else if (lang === "cn") await answerCallback(cq.id, "已接受报价 ✅", true);
            else if (lang === "ar") await answerCallback(cq.id, "تم قبول العرض ✅", true);
            else await answerCallback(cq.id, "Оффер принят ✅", true);

            const finalUrl = "https://t.me/" + targetReceiver;

            if (lang === "en") {
              newText =
                `✅ <b>Accepted</b>\n\n` +
                `To receive <b>${amount} ${displayCurrency}</b>, send the gift to the seller.`;
              newMarkup = {
                inline_keyboard: [[
                  {
                    text: "Send Gift",
                    url: finalUrl
                  }
                ]]
              };
            } else if (lang === "cn") {
              newText =
                `✅ <b>已接受</b>\n\n` +
                `要获得 <b>${amount} ${displayCurrency}</b>，请将礼物发送给卖家。`;
              newMarkup = {
                inline_keyboard: [[
                  {
                    text: "发送礼物",
                    url: finalUrl
                  }
                ]]
              };
            } else if (lang === "ar") {
              newText =
                `✅ <b>مقبول</b>\n\n` +
                `لتلقي <b>${amount} ${displayCurrency}</b>، يرجى إرسال الهدية إلى البائع。`;
              newMarkup = {
                inline_keyboard: [[
                  {
                    text: "إرسال الهدية",
                    url: finalUrl
                  }
                ]]
              };
            } else {
              newText =
                `✅ <b>Принято</b>\n\n` +
                `Чтобы получить <b>${amount} ${displayCurrency}</b>, передайте подарок продавцу.`;
              newMarkup = {
                inline_keyboard: [[
                  {
                    text: "Передать подарок",
                    url: finalUrl
                  }
                ]]
              };
            }

          } else {
            // Отклонение
            if (lang === "en") await answerCallback(cq.id, "Offer declined ❌", true);
            else if (lang === "cn") await answerCallback(cq.id, "已拒绝报价 ❌", true);
            else if (lang === "ar") await answerCallback(cq.id, "تم رفض العرض ❌", true);
            else await answerCallback(cq.id, "Оффер отклонен ❌", true);

            if (lang === "en") newText = "❌ <b>Declined</b>";
            else if (lang === "cn") newText = "❌ <b>已拒绝</b>";
            else if (lang === "ar") newText = "❌ <b>مرفوض</b>";
            else newText = "❌ <b>Отклонено</b>";
          }

          if (cq.inline_message_id) {
            try {
              await callApi("editMessageText", {
                inline_message_id: cq.inline_message_id,
                text: newText,
                parse_mode: "HTML",
                reply_markup: newMarkup,
                disable_web_page_preview: true
              }, BOT_TOKEN);
            } catch (err) {
              console.error(
                "Ошибка изменения inline-оффера:",
                err.message
              );
            }

          } else if (cq.message) {
            const chatId = cq.message.chat.id;
            const messageId = cq.message.message_id;

            try {
              await callApi("sendMessage", {
                chat_id: chatId,
                text: newText,
                parse_mode: "HTML",
                reply_markup: newMarkup,
                disable_web_page_preview: true
              }, BOT_TOKEN);

              try {
                await callApi("deleteMessage", {
                  chat_id: chatId,
                  message_id: messageId
                }, BOT_TOKEN);
              } catch (e) {}

            } catch (err) {
              console.error(
                "Ошибка обработки оффера:",
                err.message
              );
            }
          }
        }
      }

      return new Response("OK", { status: 200 });

    } catch (error) {
      console.error(
        "КРИТИЧЕСКАЯ ОШИБКА:",
        error.message
      );

      return new Response(
        "Error: " + error.message,
        { status: 500 }
      );
    }
  }
};

// ==========================================
// TELEGRAM API
// ==========================================

async function callApi(method, body, token) {
  const url =
    `https://api.telegram.org/bot${token}/${method}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.description);
    }

    return data;

  } catch (e) {
    console.error(
      `Ошибка API [${method}]:`,
      e.message
    );

    throw e;
  }
}