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
      // ФУНКЦИЯ ПРОВЕРКИ ДОСТУПА
      // ==========================================
      async function checkAccess(userId, username) {
          if (userId === ADMIN_ID_1 || userId === ADMIN_ID_2) return true; 
          if (!kv) return false; 
          const byId = await kv.get(`allowed_id:${userId}`);
          if (byId) return true;
          if (username) {
              const byName = await kv.get(`allowed_username:${username.toLowerCase()}`);
              if (byName) return true;
          }
          return false;
      }

      // ==========================================
      // ОБРАБОТКА СООБЩЕНИЙ (И ОБЫЧНЫХ, И БИЗНЕС)
      // ==========================================
      const msg = update.message || update.business_message;
      const isBusiness = !!update.business_message;

      if (msg && msg.text) {
        const text = msg.text.trim();
        const chatId = msg.chat.id; 
        const userId = msg.from.id;
        const username = msg.from.username || "";

        // --- КОМАНДА /start ---
        if (text === "/start") {
            if (kv) await kv.put(`user:${userId}`, username || "no_username");
            const startText = `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n⚙️ <b>Как это работает:</b>\n\n1. Напишите <code>/buy [ссылка] [цена] stars</code>\n2. Бот пришлет предложение.\n3. Клиент нажимает «Принять».\n\n💡 Отправляйте команду прямо в этот чат.`;
            const startMarkup = { inline_keyboard: [[{ text: "❓ Как принять оффер?", callback_data: "how_to_accept" }]] };
            
            if (isBusiness) {
                await callApi("sendMessage", { business_connection_id: update.business_connection_id, chat_id: chatId, text: startText, parse_mode: "HTML", reply_markup: startMarkup }, BOT_TOKEN);
            } else {
                await callApi("sendMessage", { chat_id: chatId, text: startText, parse_mode: "HTML", reply_markup: startMarkup }, BOT_TOKEN);
            }
        }

        // --- КОМАНДА /buy (Создание оффера) ---
        if (text.startsWith("/buy ")) {
            const parts = text.split(/\s+/);
            if (parts.length < 4) {
                const errText = `❌ <b>Ошибка формата.</b>\nПишите: <code>/buy [ссылка] [цена] stars</code>`;
                if (isBusiness) await callApi("sendMessage", { business_connection_id: update.business_connection_id, chat_id: chatId, text: errText, parse_mode: "HTML" }, BOT_TOKEN);
                else await callApi("sendMessage", { chat_id: chatId, text: errText, parse_mode: "HTML" }, BOT_TOKEN);
                return new Response("OK", { status: 200 });
            }

            let linkOrGift = parts[1];
            let amount = parts[2];
            let lang = "ru";
            
            if (text.includes("eng") || text.includes("en ")) lang = "en";
            else if (text.includes("cn") || text.includes("中文")) lang = "cn";

            let giftLink = "";
            if (linkOrGift.includes("t.me")) {
                giftLink = linkOrGift.startsWith("http") ? linkOrGift : "https://" + linkOrGift;
            } else {
                giftLink = "https://t.me/nft/" + linkOrGift;
            }

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

            const offerMarkup = {
                inline_keyboard: [
                    [
                        { text: btnAccept, callback_data: `acc|${amount}|stars|${username || "gwrex"}|${giftLink}|${lang}` },
                        { text: btnDecline, callback_data: `dec|${amount}|stars|${lang}` }
                    ]
                ]
            };

            if (isBusiness) {
                await callApi("sendMessage", { business_connection_id: update.business_connection_id, chat_id: chatId, text: offerText, parse_mode: "HTML", reply_markup: offerMarkup }, BOT_TOKEN);
            } else {
                await callApi("sendMessage", { chat_id: chatId, text: offerText, parse_mode: "HTML", reply_markup: offerMarkup }, BOT_TOKEN);
            }
        }
      }

      // ==========================================
      // ОБРАБОТКА КНОПОК
      // ==========================================
      if (update.callback_query) {
        const cq = update.callback_query;
        
        if (cq.data === "how_to_accept") {
          await callApi("answerCallbackQuery", { callback_query_id: cq.id }, BOT_TOKEN);
          const instructionText = `🎁 <b>Пошаговая инструкция:</b>\n\n1. Нажмите «Принять»\n2. Перейдите в профиль продавца\n3. Отправьте подарок\n4. Получите звезды`;
          const backMarkup = { inline_keyboard: [[{ text: "Назад", callback_data: "back_to_start" }]] };
          try { await callApi("editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: instructionText, parse_mode: "HTML", reply_markup: backMarkup }, BOT_TOKEN); } catch (e) {}
        }

        if (cq.data.startsWith("acc") || cq.data.startsWith("dec")) {
          const dataParts = cq.data.split("|");
          const action = dataParts[0];
          const amount = dataParts[1] || "0";
          const sellerUsername = dataParts[3] || "gwrex"; 
          const giftLink = dataParts[4] || ""; 
          let lang = dataParts[5] || "ru";
          
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

      // ==========================================
      // АДМИНСКИЕ КОМАНДЫ (/stats, /add, /remove)
      // ==========================================
      if (update.message && update.message.text === "/stats") {
        const senderId = update.message.from.id;
        const chatId = update.message.chat.id;

        if (senderId !== ADMIN_ID_1 && senderId !== ADMIN_ID_2) { await callApi("sendMessage", { chat_id: chatId, text: "⛔ У вас нет прав." }, BOT_TOKEN); return new Response("OK", { status: 200 }); }
        if (!kv) { await callApi("sendMessage", { chat_id: chatId, text: "❌ База данных KV не подключена." }, BOT_TOKEN); return new Response("OK", { status: 200 }); }

        try {
            let cursor = undefined;
            let idsList = [];
            let usernamesList = [];

            do {
                const list = await kv.list({ cursor });
                for (const key of list.keys) {
                    if (key.name.startsWith("allowed_id:")) idsList.push(key.name.replace("allowed_id:", ""));
                    if (key.name.startsWith("allowed_username:")) usernamesList.push(key.name.replace("allowed_username:", ""));
                }
                cursor = list.cursor;
            } while (cursor);

            let statsText = `📊 <b>Список доступа:</b>\n\n👤 <b>По ID (${idsList.length}):</b>\n${idsList.length > 0 ? idsList.map(id => `<code>${id}</code>`).join(", ") : "— пусто —"}\n\n🔗 <b>По @username (${usernamesList.length}):</b>\n${usernamesList.length > 0 ? usernamesList.map(uname => `@${uname}`).join(", ") : "— пусто —"}`;
            await callApi("sendMessage", { chat_id: chatId, text: statsText, parse_mode: "HTML" }, BOT_TOKEN);
        } catch (err) { await callApi("sendMessage", { chat_id: chatId, text: `❌ Ошибка: ${err.message}` }, BOT_TOKEN); }
        return new Response("OK", { status: 200 });
      }

      if (update.message && (update.message.text.startsWith("/add ") || update.message.text.startsWith("/remove "))) {
        const senderId = update.message.from.id;
        if (senderId !== ADMIN_ID_1 && senderId !== ADMIN_ID_2) return new Response("OK", { status: 200 });
        if (!kv) return new Response("OK", { status: 200 });

        const args = update.message.text.split(" ");
        const command = args[0]; 
        const targetUser = args[1]; 

        if (!targetUser) { await callApi("sendMessage", { chat_id: update.message.chat.id, text: "⚠️ Укажите ID или @username.", parse_mode: "HTML" }, BOT_TOKEN); return new Response("OK", { status: 200 }); }

        if (command === "/add") {
            if (targetUser.startsWith("@")) {
                const uname = targetUser.slice(1).toLowerCase();
                await kv.put(`allowed_username:${uname}`, "true");
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `✅ Пользователь <b>@${uname}</b> добавлен.` , parse_mode: "HTML"}, BOT_TOKEN);
            } else {
                await kv.put(`allowed_id:${targetUser}`, "true");
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `✅ Пользователь с ID <code>${targetUser}</code> добавлен.`, parse_mode: "HTML" }, BOT_TOKEN);
            }
        } 
        else if (command === "/remove") {
            if (targetUser.startsWith("@")) {
                const uname = targetUser.slice(1).toLowerCase();
                await kv.delete(`allowed_username:${uname}`);
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `🗑 Пользователь <b>@${uname}</b> удален.`, parse_mode: "HTML" }, BOT_TOKEN);
            } else {
                await kv.delete(`allowed_id:${targetUser}`);
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `🗑 Пользователь с ID <code>${targetUser}</code> удален.`, parse_mode: "HTML" }, BOT_TOKEN);
            }
        }
        return new Response("OK", { status: 200 });
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