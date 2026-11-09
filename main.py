from workers import WorkerEntrypoint, Response
from js import fetch
import json

ADMIN_ID = 5151757168  # Ваш ID
BOT_TOKEN = "9231998177:AAEFkqiFf9ihgkzjBk-DJJSoeyh149pUmew"  # ВСТАВЬТЕ ВАШ ТОКЕН СЮДА!

class Default(WorkerEntrypoint):
    async def fetch(self, request):
        if request.method != "POST":
            return Response("OK", status=200)

        try:
            update = await request.json()
        except Exception:
            return Response("Invalid JSON", status=400)

        # Обработка команды /start
        if "message" in update:
            message = update["message"]
            chat_id = message["chat"]["id"]
            text = message.get("text", "")
            user_id = message["from"]["id"]

            if text == "/start":
                if user_id != ADMIN_ID:
                    reply = "🔒 <b>Доступ закрыт.</b>\n\nЭтот бот приватный.\nОбратитесь к владельцу (@gwrex)."
                else:
                    reply = (
                        "🎁 <b>NFT OFFER BOT</b> ||\n\n"
                        "✅ <b>Пользователь · Gift</b>\n"
                        f"🆔 <b>Ваш ID:</b> <code>{user_id}</code>\n"
                        "⏳ <b>Доступ:</b> ∞ бессрочно\n\n"
                        "Открой чат и напиши:\n"
                        "<code>@GarisOfferBot JesterHat 300 stars</code>"
                    )
                
                # Отправка через GET запрос (самый надежный способ на Cloudflare)
                import urllib.parse
                text_encoded = urllib.parse.quote(reply)
                url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage?chat_id={chat_id}&text={text_encoded}&parse_mode=HTML"
                await fetch(url)

        # Обработка inline-запросов
        if "inline_query" in update:
            iq = update["inline_query"]
            parts = iq["query"].split()
            
            if len(parts) >= 3:
                gift_id, amount, currency = parts[0], parts[1], parts[2]
                text = (
                    f"🎁 <b>{gift_id}</b>\n\n"
                    f"👤 <b>GiftBuyer Redo</b> предлагает вам {amount} ⭐ Stars за подарок {gift_id}."
                )
                results = [{
                    "type": "article",
                    "id": "1",
                    "title": f"Оффер: {gift_id}",
                    "description": f"За {amount} {currency}",
                    "input_message_content": {"message_text": text, "parse_mode": "HTML"},
                    "reply_markup": {
                        "inline_keyboard": [
                            [{"text": "✅ Принять", "callback_data": "accept"}],
                            [{"text": "❌ Отклонить", "callback_data": "decline"}]
                        ]
                    }
                }]
                
                # Для инлайна POST обязателен
                url = f"https://api.telegram.org/bot{BOT_TOKEN}/answerInlineQuery"
                payload = json.dumps({
                    "inline_query_id": iq["id"],
                    "results": results,
                    "cache_time": 0
                })
                await fetch(url, {
                    "method": "POST",
                    "headers": {"Content-Type": "application/json"},
                    "body": payload
                })

        return Response("OK", status=200)