#!/usr/bin/env python3
"""
SunTrade Order Notifier
========================
Заказ түскенде Windows хабарламасын көрсететін бағдарлама.
Фонда жұмыс істейді, 10 секунд сайын жаңа заказдарды тексереді.

Қолдану:
    pip install supabase
    python order_notifier.py

Тоқтату үшін: Ctrl+C
"""

import time
import json
import os
import sys
from datetime import datetime
from supabase import create_client, Client

# ===== КОНФИГУРАЦИЯ =====
SUPABASE_URL = "https://wmznfdngucpsmjbxiwzn.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indtem5mZG5ndWNwc21qYnhpd3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Nzk1NDAsImV4cCI6MjA5NTE1NTU0MH0.DaYcIF7uaU0FSWbB9Mlq4YVVYm2EleOSz6ACtwyHjsI"

CHECK_INTERVAL = 10  # секунд сайын тексеру
SOUND_ENABLED = True  # дыбыс қосу/өшіру

# ===== ФАЙЛ: соңғы тексерілген заказ ID-сі =====
STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".order_notifier_state.json")


def load_last_order_id():
    """Соңғы көрген заказ ID-сін жүктеу"""
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r") as f:
                data = json.load(f)
                return data.get("last_order_id")
        except:
            pass
    return None


def save_last_order_id(order_id):
    """Соңғы заказ ID-сін сақтау"""
    try:
        with open(STATE_FILE, "w") as f:
            json.dump({"last_order_id": order_id}, f)
    except:
        pass


def show_notification(title, body):
    """Windows toast хабарламасын көрсету"""
    try:
        # PowerShell арқылы Windows 10/11 хабарламасы
        ps_script = f"""
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
        $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
        $textNodes = $template.GetElementsByTagName("text")
        $textNodes.Item(0).AppendChild($template.CreateTextNode("{title}")) > $null
        $textNodes.Item(1).AppendChild($template.CreateTextNode("{body}")) > $null
        $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
        $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("SunTrade Order Notifier")
        $notifier.Show($toast)
        """
        os.system(f'powershell -NoProfile -WindowStyle Hidden -Command "{ps_script}"')
    except Exception as e:
        print(f"  ⚠️ Хабарлама қатесі: {e}")


def play_sound():
    """Дыбыс шығару"""
    try:
        import winsound
        winsound.MessageBeep(winsound.MB_ICONINFORMATION)
    except:
        pass


def format_order_message(order, items=None):
    """Заказ туралы мәліметті әдемі форматтау"""
    name = order.get("customer_name") or "Белгісіз"
    email = order.get("customer_email") or ""
    amount = order.get("amount", 0)
    phone = order.get("customer_phone") or ""
    city = order.get("shipping_city") or ""
    country = order.get("shipping_country") or ""

    lines = [
        f"💰 €{float(amount):.2f}",
        f"👤 {name}",
    ]
    if email:
        lines.append(f"📧 {email}")
    if phone:
        lines.append(f"📞 {phone}")
    if city or country:
        loc = f"{city}, {country}".strip(", ")
        if loc:
            lines.append(f"📍 {loc}")

    return "\n".join(lines)


def main():
    print("=" * 50)
    print("🛎️  SunTrade Order Notifier")
    print("=" * 50)
    print(f"⏱  {CHECK_INTERVAL} секунд сайын тексеріледі")
    print(f"🔊 Дыбыс: {'ҚОСУЛЫ' if SOUND_ENABLED else 'ӨШІРУЛІ'}")
    print("Тоқтату үшін: Ctrl+C")
    print("-" * 50)

    # Supabase-қа қосылу
    print("🔗 Supabase-қа қосылу...")
    try:
        sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        # Тест — orders таблицасын оқу
        sb.from_("orders").select("id", count="exact").limit(1).execute()
        print("✅ Қосылым сәтті!")
    except Exception as e:
        print(f"❌ Қосылу қатесі: {e}")
        print("supabase пакетін орнатыңыз: pip install supabase")
        input("Шығу үшін Enter басыңыз...")
        return

    # Соңғы заказ ID-сін жүктеу
    last_id = load_last_order_id()
    if last_id:
        print(f"📌 Соңғы тексерілген заказ ID: {last_id}")
    else:
        print("🆕 Алғашқы іске қосу — ескі заказдарды өткізіп жіберемін...")
        # Соңғы заказды тауып, оны last_id етіп белгілеу
        try:
            resp = sb.from_("orders").select("id").order("created_at", desc=True).limit(1).execute()
            if resp.data:
                last_id = resp.data[0]["id"]
                save_last_order_id(last_id)
                print(f"📌 Ең соңғы заказ ID: {last_id}")
        except:
            pass

    print("-" * 50)
    print("👀 Заказдарды күтудемін...\n")

    test_mode = False  # Ctrl+T басылса тест хабарламасын жіберу

    while True:
        try:
            # Жаңа заказдарды тексеру
            query = sb.from_("orders").select("id, customer_name, customer_email, customer_phone, shipping_city, shipping_country, amount, created_at, status").order("created_at", desc=True).limit(5)

            if last_id:
                query = query.gt("id", last_id)

            resp = query.execute()

            new_orders = resp.data or []

            if new_orders:
                # Ең жаңасын бірінші көрсету
                new_orders.reverse()

                for order in new_orders:
                    order_id = order["id"]
                    # Тексеру: бұл заказды бұрын көрсеткен бе?
                    if last_id and str(order_id) <= str(last_id):
                        continue

                    amount = float(order.get("amount", 0))
                    name = order.get("customer_name") or "Белгісіз"
                    created = order.get("created_at", "")

                    print(f"\n{'='*50}")
                    print(f"🆕 ЖАҢА ЗАКАЗ! #{order_id}")
                    print(f"   Уақыты: {created}")
                    print(f"   Аты: {name}")
                    print(f"   Сома: €{amount:.2f}")
                    print(f"{'='*50}")

                    # Windows хабарламасы
                    title = f"🛒 Жаңа заказ! €{amount:.2f}"
                    body = format_order_message(order)
                    show_notification(title, body)

                    # Дыбыс
                    if SOUND_ENABLED:
                        play_sound()

                    last_id = order_id
                    save_last_order_id(last_id)

                    # Бірнеше заказ келсе, арасында кідіру
                    time.sleep(2)

            # Келесі тексеруге дейін күту
            for _ in range(CHECK_INTERVAL):
                time.sleep(1)

        except KeyboardInterrupt:
            print("\n\n👋 Бағдарлама тоқтатылды. Сау бол!")
            break
        except Exception as e:
            print(f"\n⚠️ Қате: {e}")
            print("5 секундтан кейін қайта қосыламын...")
            time.sleep(5)


if __name__ == "__main__":
    main()
