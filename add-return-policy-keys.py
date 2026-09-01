#!/usr/bin/env python3
"""Add return-policy translation keys to all 12 locale JSON files."""
import json, os, re

# Translation map: lang -> {key: value, ...}
TRANSLATIONS = {
    'en': {
        "return_title": "Return Policy - SunTrade",
        "return_updated": "Last updated: May 25, 2026",
        "return_intro": "We want you to be happy with your purchase. If you are not completely satisfied, you may return eligible items within 14 days of receiving your order.",
        "return_s1_title": "1. Eligibility",
        "return_s1_text": "You may return most items within 14 days of receiving your order. To qualify for a return, all of the following conditions must be met.",
        "return_s2_title": "2. Conditions",
        "return_s2_intro": "To be eligible for a return:",
        "return_s2_li1": "Items must be unused and in original packaging",
        "return_s2_li2": "Proof of purchase (order number) is required",
        "return_s2_li3": "Customized or used products are not eligible",
        "return_s3_title": "3. How to Return",
        "return_s3_intro": "Returning an item is simple:",
        "return_s3_li1": '<strong>Contact us</strong> at <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a> with your order number',
        "return_s3_li2": "We will provide the return instructions and address",
        "return_s3_li3": "Once we receive and inspect the item, your refund will be issued within 1–3 business days",
        "return_s4_title": "4. Defective Items",
        "return_s4_text": "If your product arrives damaged or defective, contact us within 48 hours with photos. We will replace the item or refund you at no extra cost.",
        "return_s5_title": "5. Return Shipping",
        "return_s5_text": "Return shipping costs are the responsibility of the customer. If the item is defective or we sent the wrong product, we cover the return shipping and provide a prepaid label when possible.",
        "return_contact_title": "6. Contact Us",
        "return_contact_intro": "If you have any questions about returns or need help with an order, please contact us:",
        "return_contact_li_email": 'Email: <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a>',
        "return_contact_li_wa": 'WhatsApp: <a href="https://wa.me/77021379248" style="color:var(--primary);" target="_blank" rel="noopener">+7 702 137 9248</a>',
        "return_more_info": 'For full terms and conditions, see our <a href="/terms.html" style="color:var(--primary);">Terms of Service</a>.',
        "footer_return": "Return Policy",
    },
    'kz': {
        "return_title": "Қайтару саясаты - SunTrade",
        "return_updated": "Соңғы жаңарту: 2026 жыл 25 мамыр",
        "return_intro": "Біз сіздің сатып алуыңызға қанағаттанғанымызды қалаймыз. Егер сіз толық қанағаттанбасаңыз, тапсырысты алғаннан кейін 14 күн ішінде жарамды тауарларды қайтара аласыз.",
        "return_s1_title": "1. Қайтару құқығы",
        "return_s1_text": "Тапсырысты алғаннан кейін 14 күн ішінде көптеген тауарларды қайтара аласыз. Қайтаруға өтініш беру үшін барлық шарттар сақталуы керек.",
        "return_s2_title": "2. Шарттар",
        "return_s2_intro": "Қайтару үшін:",
        "return_s2_li1": "Тауарлар пайдаланылмаған және түпнұсқа қаптамада болуы керек",
        "return_s2_li2": "Сатып алу дәлелі (тапсырыс нөмірі) қажет",
        "return_s2_li3": "Теңшелген немесе пайдаланылған тауарлар жарамсыз",
        "return_s3_title": "3. Қалай қайтаруға болады",
        "return_s3_intro": "Тауарды қайтару оңай:",
        "return_s3_li1": '<strong>Бізбен байланысыңыз</strong> <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a> мекенжайында тапсырыс нөміріңізбен',
        "return_s3_li2": "Біз қайтару нұсқаулары мен мекенжайын береміз",
        "return_s3_li3": "Тауарды алып, тексергеннен кейін, ақшаңыз 1–3 жұмыс күні ішінде қайтарылады",
        "return_s4_title": "4. Ақаулы тауарлар",
        "return_s4_text": "Егер тауар зақымдалған немесе ақаулы болып келсе, 48 сағат ішінде суреттерімен бізге хабарласыңыз. Біз тауарды ауыстырамыз немесе қосымша ақысыз ақшаңызды қайтарамыз.",
        "return_s5_title": "5. Қайтару жеткізу құны",
        "return_s5_text": "Қайтару жеткізу құнын сатып алушы көтереді. Егер тауар ақаулы болса немесе біз қате тауар жіберген болсақ, біз қайтару жеткізуді өзіміз төлейміз.",
        "return_contact_title": "6. Бізбен байланысу",
        "return_contact_intro": "Қайтару туралы сұрақтарыңыз болса немесе тапсырыс бойынша көмек қажет болса, бізбен байланысыңыз:",
        "return_contact_li_email": 'Email: <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a>',
        "return_contact_li_wa": 'WhatsApp: <a href="https://wa.me/77021379248" style="color:var(--primary);" target="_blank" rel="noopener">+7 702 137 9248</a>',
        "return_more_info": 'Толық шарттар мен талаптар үшін біздің <a href="/terms.html" style="color:var(--primary);">Қолдану шарттарын</a> қараңыз.',
        "footer_return": "Қайтару саясаты",
    },
    'ru': {
        "return_title": "Политика возврата - SunTrade",
        "return_updated": "Последнее обновление: 25 мая 2026",
        "return_intro": "Мы хотим, чтобы вы остались довольны покупкой. Если вы не полностью удовлетворены, вы можете вернуть подходящие товары в течение 14 дней с момента получения заказа.",
        "return_s1_title": "1. Право на возврат",
        "return_s1_text": "Большинство товаров можно вернуть в течение 14 дней с момента получения заказа. Чтобы возврат был возможен, должны быть соблюдены все перечисленные ниже условия.",
        "return_s2_title": "2. Условия",
        "return_s2_intro": "Для возврата необходимо:",
        "return_s2_li1": "Товар должен быть неиспользованным и в оригинальной упаковке",
        "return_s2_li2": "Требуется подтверждение покупки (номер заказа)",
        "return_s2_li3": "Изготовленные на заказ или использованные товары возврату не подлежат",
        "return_s3_title": "3. Как вернуть товар",
        "return_s3_intro": "Вернуть товар — просто:",
        "return_s3_li1": '<strong>Свяжитесь с нами</strong> по адресу <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a>, указав номер заказа',
        "return_s3_li2": "Мы предоставим инструкцию по возврату и адрес",
        "return_s3_li3": "После получения и проверки товара возврат средств будет произведён в течение 1–3 рабочих дней",
        "return_s4_title": "4. Дефектные товары",
        "return_s4_text": "Если товар прибыл повреждённым или дефектным, свяжитесь с нами в течение 48 часов и приложите фотографии. Мы заменим товар или вернём деньги без дополнительных расходов.",
        "return_s5_title": "5. Стоимость обратной доставки",
        "return_s5_text": "Стоимость обратной доставки оплачивает покупатель. Если товар оказался дефектным или мы отправили не тот товар, обратную доставку оплачиваем мы (по возможности предоставляем prepaid-этикетку).",
        "return_contact_title": "6. Свяжитесь с нами",
        "return_contact_intro": "Если у вас есть вопросы о возврате или нужна помощь с заказом, пожалуйста, свяжитесь с нами:",
        "return_contact_li_email": 'Email: <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a>',
        "return_contact_li_wa": 'WhatsApp: <a href="https://wa.me/77021379248" style="color:var(--primary);" target="_blank" rel="noopener">+7 702 137 9248</a>',
        "return_more_info": 'Полные условия см. в наших <a href="/terms.html" style="color:var(--primary);">Условиях использования</a>.',
        "footer_return": "Политика возврата",
    },
    'de': {
        "return_title": "Rückgaberichtlinie - SunTrade",
        "return_updated": "Letzte Aktualisierung: 25. Mai 2026",
        "return_intro": "Wir möchten, dass Sie mit Ihrem Kauf zufrieden sind. Wenn Sie nicht vollständig zufrieden sind, können Sie berechtigte Artikel innerhalb von 14 Tagen nach Erhalt Ihrer Bestellung zurückgeben.",
        "return_s1_title": "1. Rückgabeberechtigung",
        "return_s1_text": "Sie können die meisten Artikel innerhalb von 14 Tagen nach Erhalt Ihrer Bestellung zurückgeben. Alle folgenden Bedingungen müssen erfüllt sein.",
        "return_s2_title": "2. Bedingungen",
        "return_s2_intro": "Um für eine Rückgabe in Frage zu kommen:",
        "return_s2_li1": "Artikel müssen unbenutzt und in der Originalverpackung sein",
        "return_s2_li2": "Kaufnachweis (Bestellnummer) ist erforderlich",
        "return_s2_li3": "Personalisierte oder gebrauchte Produkte sind ausgeschlossen",
        "return_s3_title": "3. So geben Sie Artikel zurück",
        "return_s3_intro": "Eine Rückgabe ist einfach:",
        "return_s3_li1": '<strong>Kontaktieren Sie uns</strong> unter <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a> mit Ihrer Bestellnummer',
        "return_s3_li2": "Wir teilen Ihnen die Rückgabeanleitung und Adresse mit",
        "return_s3_li3": "Nach Erhalt und Prüfung des Artikels erfolgt die Rückerstattung innerhalb von 1–3 Werktagen",
        "return_s4_title": "4. Defekte Artikel",
        "return_s4_text": "Wenn Ihr Produkt beschädigt oder defekt ankommt, kontaktieren Sie uns innerhalb von 48 Stunden mit Fotos. Wir ersetzen den Artikel oder erstatten Ihnen den Betrag ohne Zusatzkosten.",
        "return_s5_title": "5. Rücksendekosten",
        "return_s5_text": "Die Rücksendekosten trägt der Kunde. Bei defekten Artikeln oder falsch gelieferten Produkten übernehmen wir die Rücksendekosten und stellen nach Möglichkeit ein vorfrankiertes Label zur Verfügung.",
        "return_contact_title": "6. Kontakt",
        "return_contact_intro": "Wenn Sie Fragen zur Rückgabe haben oder Hilfe bei einer Bestellung benötigen, kontaktieren Sie uns bitte:",
        "return_contact_li_email": 'E-Mail: <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a>',
        "return_contact_li_wa": 'WhatsApp: <a href="https://wa.me/77021379248" style="color:var(--primary);" target="_blank" rel="noopener">+7 702 137 9248</a>',
        "return_more_info": 'Die vollständigen Bedingungen finden Sie in unseren <a href="/terms.html" style="color:var(--primary);">Nutzungsbedingungen</a>.',
        "footer_return": "Rückgaberichtlinie",
    },
    'fr': {
        "return_title": "Politique de retour - SunTrade",
        "return_updated": "Dernière mise à jour : 25 mai 2026",
        "return_intro": "Nous voulons que vous soyez satisfait de votre achat. Si vous n'êtes pas entièrement satisfait, vous pouvez retourner les articles éligibles dans les 14 jours suivant la réception de votre commande.",
        "return_s1_title": "1. Éligibilité",
        "return_s1_text": "Vous pouvez retourner la plupart des articles dans les 14 jours suivant la réception de votre commande. Toutes les conditions suivantes doivent être remplies.",
        "return_s2_title": "2. Conditions",
        "return_s2_intro": "Pour être éligible à un retour :",
        "return_s2_li1": "Les articles doivent être inutilisés et dans leur emballage d'origine",
        "return_s2_li2": "Une preuve d'achat (numéro de commande) est requise",
        "return_s2_li3": "Les produits personnalisés ou utilisés ne sont pas éligibles",
        "return_s3_title": "3. Comment retourner",
        "return_s3_intro": "Retourner un article est simple :",
        "return_s3_li1": '<strong>Contactez-nous</strong> à <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a> avec votre numéro de commande',
        "return_s3_li2": "Nous vous fournirons les instructions et l'adresse de retour",
        "return_s3_li3": "Après réception et inspection de l'article, votre remboursement sera émis sous 5 à 10 jours ouvrés",
        "return_s4_title": "4. Articles défectueux",
        "return_s4_text": "Si votre produit arrive endommagé ou défectueux, contactez-nous dans les 48 heures avec des photos. Nous remplacerons l'article ou vous rembourserons sans frais supplémentaires.",
        "return_s5_title": "5. Frais de retour",
        "return_s5_text": "Les frais de retour sont à la charge du client. Si l'article est défectueux ou si nous avons envoyé le mauvais produit, nous prenons en charge les frais de retour et fournissons si possible une étiquette prépayée.",
        "return_contact_title": "6. Contactez-nous",
        "return_contact_intro": "Si vous avez des questions sur les retours ou besoin d'aide concernant une commande, veuillez nous contacter :",
        "return_contact_li_email": 'E-mail : <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a>',
        "return_contact_li_wa": 'WhatsApp : <a href="https://wa.me/77021379248" style="color:var(--primary);" target="_blank" rel="noopener">+7 702 137 9248</a>',
        "return_more_info": 'Pour les conditions complètes, consultez nos <a href="/terms.html" style="color:var(--primary);">Conditions d\'utilisation</a>.',
        "footer_return": "Politique de retour",
    },
    'es': {
        "return_title": "Política de devolución - SunTrade",
        "return_updated": "Última actualización: 25 de mayo de 2026",
        "return_intro": "Queremos que esté satisfecho con su compra. Si no está completamente satisfecho, puede devolver los artículos elegibles dentro de los 14 días posteriores a la recepción de su pedido.",
        "return_s1_title": "1. Elegibilidad",
        "return_s1_text": "Puede devolver la mayoría de los artículos dentro de los 14 días posteriores a la recepción de su pedido. Para calificar, deben cumplirse todas las siguientes condiciones.",
        "return_s2_title": "2. Condiciones",
        "return_s2_intro": "Para ser elegible para una devolución:",
        "return_s2_li1": "Los artículos deben estar sin usar y en su embalaje original",
        "return_s2_li2": "Se requiere prueba de compra (número de pedido)",
        "return_s2_li3": "Los productos personalizados o usados no son elegibles",
        "return_s3_title": "3. Cómo devolver",
        "return_s3_intro": "Devolver un artículo es sencillo:",
        "return_s3_li1": '<strong>Contáctenos</strong> en <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a> con su número de pedido',
        "return_s3_li2": "Le proporcionaremos las instrucciones de devolución y la dirección",
        "return_s3_li3": "Una vez recibido e inspeccionado el artículo, su reembolso se emitirá dentro de 5 a 10 días hábiles",
        "return_s4_title": "4. Artículos defectuosos",
        "return_s4_text": "Si su producto llega dañado o defectuoso, contáctenos dentro de las 48 horas con fotos. Reemplazaremos el artículo o le reembolsaremos sin costo adicional.",
        "return_s5_title": "5. Costos de envío de devolución",
        "return_s5_text": "Los costos de envío de devolución son responsabilidad del cliente. Si el artículo es defectuoso o enviamos el producto equivocado, cubrimos los gastos de envío de devolución y proporcionamos una etiqueta prepagada cuando sea posible.",
        "return_contact_title": "6. Contáctenos",
        "return_contact_intro": "Si tiene alguna pregunta sobre devoluciones o necesita ayuda con un pedido, por favor contáctenos:",
        "return_contact_li_email": 'Correo: <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a>',
        "return_contact_li_wa": 'WhatsApp: <a href="https://wa.me/77021379248" style="color:var(--primary);" target="_blank" rel="noopener">+7 702 137 9248</a>',
        "return_more_info": 'Para ver los términos y condiciones completos, consulte nuestros <a href="/terms.html" style="color:var(--primary);">Términos de Servicio</a>.',
        "footer_return": "Política de devolución",
    },
    'it': {
        "return_title": "Politica di reso - SunTrade",
        "return_updated": "Ultimo aggiornamento: 25 maggio 2026",
        "return_intro": "Vogliamo che tu sia soddisfatto del tuo acquisto. Se non sei completamente soddisfatto, puoi restituire gli articoli idonei entro 14 giorni dal ricevimento dell'ordine.",
        "return_s1_title": "1. Idoneità",
        "return_s1_text": "Puoi restituire la maggior parte degli articoli entro 14 giorni dal ricevimento dell'ordine. Per qualificarti, devono essere soddisfatte tutte le seguenti condizioni.",
        "return_s2_title": "2. Condizioni",
        "return_s2_intro": "Per essere idoneo a un reso:",
        "return_s2_li1": "Gli articoli devono essere inutilizzati e nella confezione originale",
        "return_s2_li2": "È richiesta la prova d'acquisto (numero d'ordine)",
        "return_s2_li3": "I prodotti personalizzati o usati non sono idonei",
        "return_s3_title": "3. Come restituire",
        "return_s3_intro": "Restituire un articolo è semplice:",
        "return_s3_li1": '<strong>Contattaci</strong> all\'indirizzo <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a> con il tuo numero d\'ordine',
        "return_s3_li2": "Ti forniremo le istruzioni e l'indirizzo per la restituzione",
        "return_s3_li3": "Dopo la ricezione e l'ispezione dell'articolo, il rimborso verrà emesso entro 1–3 giorni lavorativi",
        "return_s4_title": "4. Articoli difettosi",
        "return_s4_text": "Se il prodotto arriva danneggiato o difettoso, contattaci entro 48 ore con foto. Sostituiremo l'articolo o rimborseremo senza costi aggiuntivi.",
        "return_s5_title": "5. Spese di spedizione per il reso",
        "return_s5_text": "Le spese di spedizione per il reso sono a carico del cliente. Se l'articolo è difettoso o abbiamo inviato il prodotto sbagliato, copriamo le spese di spedizione del reso e forniamo un'etichetta prepagata quando possibile.",
        "return_contact_title": "6. Contattaci",
        "return_contact_intro": "Per qualsiasi domanda sui resi o se hai bisogno di aiuto con un ordine, contattaci:",
        "return_contact_li_email": 'Email: <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a>',
        "return_contact_li_wa": 'WhatsApp: <a href="https://wa.me/77021379248" style="color:var(--primary);" target="_blank" rel="noopener">+7 702 137 9248</a>',
        "return_more_info": 'Per i termini e le condizioni completi, vedi i nostri <a href="/terms.html" style="color:var(--primary);">Termini di Servizio</a>.',
        "footer_return": "Politica di reso",
    },
    'tr': {
        "return_title": "İade Politikası - SunTrade",
        "return_updated": "Son güncelleme: 25 Mayıs 2026",
        "return_intro": "Satın almanızdan memnun olmanızı istiyoruz. Tam olarak memnun kalmadıysanız, siparişinizi aldıktan sonraki 14 gün içinde uygun ürünleri iade edebilirsiniz.",
        "return_s1_title": "1. Uygunluk",
        "return_s1_text": "Siparişinizi aldıktan sonraki 14 gün içinde çoğu ürünü iade edebilirsiniz. İade için tüm aşağıdaki koşulların karşılanması gerekir.",
        "return_s2_title": "2. Koşullar",
        "return_s2_intro": "İade için uygun olmak için:",
        "return_s2_li1": "Ürünler kullanılmamış ve orijinal ambalajında olmalıdır",
        "return_s2_li2": "Satın alma kanıtı (sipariş numarası) gereklidir",
        "return_s2_li3": "Özelleştirilmiş veya kullanılmış ürünler uygun değildir",
        "return_s3_title": "3. Nasıl İade Edilir",
        "return_s3_intro": "Bir ürünü iade etmek basittir:",
        "return_s3_li1": '<strong>Bize ulaşın</strong> <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a> adresinden sipariş numaranızla',
        "return_s3_li2": "İade talimatlarını ve adresi size sağlayacağız",
        "return_s3_li3": "Ürünü aldıktan ve inceledikten sonra, geri ödemeniz 1–3 iş günü içinde yapılacaktır",
        "return_s4_title": "4. Kusurlu Ürünler",
        "return_s4_text": "Ürününüz hasarlı veya kusurlu gelirse, fotoğraflarla birlikte 48 saat içinde bizimle iletişime geçin. Ürünü değiştireceğiz veya ekstra ücret ödemeden iade edeceğiz.",
        "return_s5_title": "5. İade Kargo Ücreti",
        "return_s5_text": "İade kargo ücreti müşterinin sorumluluğundadır. Ürün kusurluysa veya yanlış ürün gönderdiysek, iade kargosunu biz karşılarız ve mümkün olduğunda ön ödemeli bir etiket sağlarız.",
        "return_contact_title": "6. Bize Ulaşın",
        "return_contact_intro": "İadelerle ilgili sorularınız varsa veya bir siparişle ilgili yardıma ihtiyacınız varsa, lütfen bizimle iletişime geçin:",
        "return_contact_li_email": 'E-posta: <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a>',
        "return_contact_li_wa": 'WhatsApp: <a href="https://wa.me/77021379248" style="color:var(--primary);" target="_blank" rel="noopener">+7 702 137 9248</a>',
        "return_more_info": 'Tam şartlar ve koşullar için <a href="/terms.html" style="color:var(--primary);">Hizmet Şartlarımıza</a> bakın.',
        "footer_return": "İade Politikası",
    },
    'pt': {
        "return_title": "Política de Devolução - SunTrade",
        "return_updated": "Última atualização: 25 de maio de 2026",
        "return_intro": "Queremos que você fique satisfeito com sua compra. Se não estiver totalmente satisfeito, pode devolver os itens elegíveis em até 14 dias após receber seu pedido.",
        "return_s1_title": "1. Elegibilidade",
        "return_s1_text": "Pode devolver a maioria dos itens em até 14 dias após receber seu pedido. Para se qualificar, todas as condições abaixo devem ser atendidas.",
        "return_s2_title": "2. Condições",
        "return_s2_intro": "Para ser elegível para devolução:",
        "return_s2_li1": "Os itens devem estar sem uso e na embalagem original",
        "return_s2_li2": "É necessário comprovante de compra (número do pedido)",
        "return_s2_li3": "Produtos personalizados ou usados não são elegíveis",
        "return_s3_title": "3. Como Devolver",
        "return_s3_intro": "Devolver um item é simples:",
        "return_s3_li1": '<strong>Contacte-nos</strong> em <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a> com o número do seu pedido',
        "return_s3_li2": "Forneceremos as instruções e o endereço de devolução",
        "return_s3_li3": "Após recebermos e inspecionarmos o item, o reembolso será emitido em 5 a 10 dias úteis",
        "return_s4_title": "4. Itens Defeituosos",
        "return_s4_text": "Se o produto chegar danificado ou com defeito, contacte-nos dentro de 48 horas com fotos. Substituiremos o item ou reembolsaremos sem custo extra.",
        "return_s5_title": "5. Custos de Envio da Devolução",
        "return_s5_text": "Os custos de envio da devolução são de responsabilidade do cliente. Se o item for defeituoso ou se tivermos enviado o produto errado, cobrimos o envio da devolução e fornecemos uma etiqueta pré-paga, quando possível.",
        "return_contact_title": "6. Contacte-nos",
        "return_contact_intro": "Se tiver alguma dúvida sobre devoluções ou precisar de ajuda com um pedido, por favor contacte-nos:",
        "return_contact_li_email": 'E-mail: <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a>',
        "return_contact_li_wa": 'WhatsApp: <a href="https://wa.me/77021379248" style="color:var(--primary);" target="_blank" rel="noopener">+7 702 137 9248</a>',
        "return_more_info": 'Para os termos e condições completos, veja os nossos <a href="/terms.html" style="color:var(--primary);">Termos de Serviço</a>.',
        "footer_return": "Política de Devolução",
    },
    'nl': {
        "return_title": "Retourbeleid - SunTrade",
        "return_updated": "Laatst bijgewerkt: 25 mei 2026",
        "return_intro": "Wij willen dat u tevreden bent met uw aankoop. Als u niet volledig tevreden bent, kunt u in aanmerking komende artikelen binnen 14 dagen na ontvangst van uw bestelling retourneren.",
        "return_s1_title": "1. Geschiktheid",
        "return_s1_text": "U kunt de meeste artikelen binnen 14 dagen na ontvangst van uw bestelling retourneren. Alle volgende voorwaarden moeten zijn vervuld.",
        "return_s2_title": "2. Voorwaarden",
        "return_s2_intro": "Om in aanmerking te komen voor retour:",
        "return_s2_li1": "Artikelen moeten ongebruikt zijn en in de originele verpakking",
        "return_s2_li2": "Aankoopbewijs (bestelnummer) is vereist",
        "return_s2_li3": "Aangepaste of gebruikte producten komen niet in aanmerking",
        "return_s3_title": "3. Hoe retourneert u",
        "return_s3_intro": "Een artikel retourneren is eenvoudig:",
        "return_s3_li1": '<strong>Neem contact met ons op</strong> via <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a> met uw bestelnummer',
        "return_s3_li2": "Wij verstrekken de retourinstructies en het retouradres",
        "return_s3_li3": "Na ontvangst en inspectie van het artikel wordt uw terugbetaling binnen 1–3 werkdagen uitgevoerd",
        "return_s4_title": "4. Defecte artikelen",
        "return_s4_text": "Als uw product beschadigd of defect aankomt, neem dan binnen 48 uur contact met ons op met foto's. Wij vervangen het artikel of storten het bedrag terug zonder extra kosten.",
        "return_s5_title": "5. Verzendkosten voor retour",
        "return_s5_text": "De verzendkosten voor retour zijn voor rekening van de klant. Als het artikel defect is of wij het verkeerde product hebben gestuurd, vergoeden wij de retourverzending en bieden waar mogelijk een vooraf betaald label aan.",
        "return_contact_title": "6. Contact",
        "return_contact_intro": "Heeft u vragen over retourzendingen of hulp nodig bij een bestelling, neem dan contact met ons op:",
        "return_contact_li_email": 'E-mail: <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a>',
        "return_contact_li_wa": 'WhatsApp: <a href="https://wa.me/77021379248" style="color:var(--primary);" target="_blank" rel="noopener">+7 702 137 9248</a>',
        "return_more_info": 'Voor de volledige voorwaarden, zie onze <a href="/terms.html" style="color:var(--primary);">Servicevoorwaarden</a>.',
        "footer_return": "Retourbeleid",
    },
    'pl': {
        "return_title": "Polityka zwrotów - SunTrade",
        "return_updated": "Ostatnia aktualizacja: 25 maja 2026",
        "return_intro": "Chcemy, abyś był zadowolony ze swojego zakupu. Jeśli nie jesteś w pełni zadowolony, możesz zwrócić kwalifikujące się przedmioty w ciągu 14 dni od otrzymania zamówienia.",
        "return_s1_title": "1. Uprawnienie do zwrotu",
        "return_s1_text": "Większość przedmiotów możesz zwrócić w ciągu 14 dni od otrzymania zamówienia. Aby kwalifikować się do zwrotu, muszą być spełnione wszystkie poniższe warunki.",
        "return_s2_title": "2. Warunki",
        "return_s2_intro": "Aby kwalifikować się do zwrotu:",
        "return_s2_li1": "Przedmioty muszą być nieużywane i w oryginalnym opakowaniu",
        "return_s2_li2": "Wymagany jest dowód zakupu (numer zamówienia)",
        "return_s2_li3": "Produkty spersonalizowane lub używane nie kwalifikują się",
        "return_s3_title": "3. Jak dokonać zwrotu",
        "return_s3_intro": "Zwrot przedmiotu jest prosty:",
        "return_s3_li1": '<strong>Skontaktuj się z nami</strong> pod adresem <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a>, podając numer zamówienia',
        "return_s3_li2": "Przekażemy instrukcje zwrotu i adres",
        "return_s3_li3": "Po otrzymaniu i sprawdzeniu przedmiotu zwrot środków zostanie zrealizowany w ciągu 1–3 dni roboczych",
        "return_s4_title": "4. Wadliwe przedmioty",
        "return_s4_text": "Jeśli produkt dotrze uszkodzony lub wadliwy, skontaktuj się z nami w ciągu 48 godzin, przesyłając zdjęcia. Wymienimy produkt lub zwrócimy pieniądze bez dodatkowych kosztów.",
        "return_s5_title": "5. Koszty wysyłki zwrotnej",
        "return_s5_text": "Koszty wysyłki zwrotnej ponosi klient. Jeśli przedmiot jest wadliwy lub wysłaliśmy niewłaściwy produkt, pokrywamy koszty wysyłki zwrotnej i w miarę możliwości zapewniamy przedpłaconą etykietę.",
        "return_contact_title": "6. Skontaktuj się z nami",
        "return_contact_intro": "Jeśli masz pytania dotyczące zwrotów lub potrzebujesz pomocy z zamówieniem, skontaktuj się z nami:",
        "return_contact_li_email": 'E-mail: <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a>',
        "return_contact_li_wa": 'WhatsApp: <a href="https://wa.me/77021379248" style="color:var(--primary);" target="_blank" rel="noopener">+7 702 137 9248</a>',
        "return_more_info": 'Pełne warunki znajdują się w naszym <a href="/terms.html" style="color:var(--primary);">Regulaminie</a>.',
        "footer_return": "Polityka zwrotów",
    },
    'ar': {
        "return_title": "سياسة الإرجاع - SunTrade",
        "return_updated": "آخر تحديث: 25 مايو 2026",
        "return_intro": "نريد أن تكون راضيًا عن مشترياتك. إذا لم تكن راضيًا تمامًا، يمكنك إرجاع العناصر المؤهلة خلال 14 يومًا من استلام طلبك.",
        "return_s1_title": "1. الأهلية",
        "return_s1_text": "يمكنك إرجاع معظم العناصر خلال 14 يومًا من استلام طلبك. يجب استيفاء جميع الشروط التالية للتأهل للإرجاع.",
        "return_s2_title": "2. الشروط",
        "return_s2_intro": "لكي تكون مؤهلاً للإرجاع:",
        "return_s2_li1": "يجب أن تكون العناصر غير مستخدمة وفي العبوة الأصلية",
        "return_s2_li2": "يُطلب إثبات الشراء (رقم الطلب)",
        "return_s2_li3": "المنتجات المخصصة أو المستخدمة غير مؤهلة",
        "return_s3_title": "3. كيفية الإرجاع",
        "return_s3_intro": "إرجاع عنصر أمر بسيط:",
        "return_s3_li1": '<strong>تواصل معنا</strong> على <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a> مع رقم طلبك',
        "return_s3_li2": "سنقدم لك تعليمات الإرجاع والعنوان",
        "return_s3_li3": "بعد استلامنا للعنصر وفحصه، سيتم إصدار المبلغ المسترد خلال 5 إلى 10 أيام عمل",
        "return_s4_title": "4. العناصر المعيبة",
        "return_s4_text": "إذا وصل منتجك تالفًا أو معيبًا، تواصل معنا خلال 48 ساعة مع الصور. سنستبدل العنصر أو نرد لك المبلغ دون أي تكلفة إضافية.",
        "return_s5_title": "5. تكاليف شحن الإرجاع",
        "return_s5_text": "تكاليف شحن الإرجاع على العميل. إذا كان العنصر معيبًا أو أرسلنا المنتج الخطأ، فإننا نغطي شحن الإرجاع ونوفر ملصقًا مدفوعًا مسبقًا عند الإمكان.",
        "return_contact_title": "6. تواصل معنا",
        "return_contact_intro": "إذا كانت لديك أي أسئلة حول الإرجاع أو كنت بحاجة إلى مساعدة في طلب، يرجى التواصل معنا:",
        "return_contact_li_email": 'البريد الإلكتروني: <a href="mailto:support@suntrade.store" style="color:var(--primary);">support@suntrade.store</a>',
        "return_contact_li_wa": 'WhatsApp: <a href="https://wa.me/77021379248" style="color:var(--primary);" target="_blank" rel="noopener">+7 702 137 9248</a>',
        "return_more_info": 'للاطلاع على الشروط والأحكام الكاملة، راجع <a href="/terms.html" style="color:var(--primary);">شروط الخدمة</a> الخاصة بنا.',
        "footer_return": "سياسة الإرجاع",
    },
}

# Read each file, parse, add new keys (skip if already exists), re-serialize
def main():
    locales_dir = os.path.join(os.path.dirname(__file__), 'locales')
    skipped = []
    added = []
    errors = []

    for lang, keys in TRANSLATIONS.items():
        path = os.path.join(locales_dir, f'{lang}.json')
        if not os.path.exists(path):
            errors.append(f'MISSING: {path}')
            continue

        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()

        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            errors.append(f'JSON ERROR in {path}: {e}')
            continue

        existing_keys = set(data.keys())
        new_keys = {k: v for k, v in keys.items() if k not in existing_keys}
        already = {k for k in keys.keys() if k in existing_keys}

        if not new_keys:
            skipped.append(f'{lang}: all {len(keys)} keys already present' if not already else f'{lang}: nothing to add')
            continue

        data.update(new_keys)

        # Re-serialize preserving 2-space indent (matches existing files) — JSON compatible
        # Note: ensure_ascii=False so non-ASCII chars (Cyrillic, Arabic, etc.) stay as-is for readability
        new_content = json.dumps(data, ensure_ascii=False, indent=2)

        # Add trailing newline (matches existing files)
        if not new_content.endswith('\n'):
            new_content += '\n'

        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)

        added.append(f'{lang}: +{len(new_keys)} keys' + (f' (skipped {len(already)} duplicates)' if already else ''))

    print('\n=== ADDED ===')
    for x in added: print('  ' + x)
    print('\n=== SKIPPED (no new keys) ===')
    for x in skipped: print('  ' + x)
    if errors:
        print('\n=== ERRORS ===')
        for x in errors: print('  ' + x)
        return 1
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
