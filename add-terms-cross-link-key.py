#!/usr/bin/env python3
"""Add terms_s7_return_intro key to all 12 locales (cross-link to return-policy)."""
import json, os

TRANSLATIONS = {
    'en': '<a href="/return-policy.html" style="color:var(--primary);">Return Policy</a> for full details.',
    'kz': 'Толық мәліметтер үшін біздің <a href="/return-policy.html" style="color:var(--primary);">Қайтару саясатын</a> қараңыз.',
    'ru': 'Для получения полной информации см. нашу <a href="/return-policy.html" style="color:var(--primary);">Политику возврата</a>.',
    'de': 'Vollständige Details finden Sie in unserer <a href="/return-policy.html" style="color:var(--primary);">Rückgaberichtlinie</a>.',
    'fr': 'Pour plus de détails, consultez notre <a href="/return-policy.html" style="color:var(--primary);">Politique de retour</a>.',
    'es': 'Para más detalles, consulte nuestra <a href="/return-policy.html" style="color:var(--primary);">Política de devolución</a>.',
    'it': 'Per i dettagli completi, consulta la nostra <a href="/return-policy.html" style="color:var(--primary);">Politica di reso</a>.',
    'tr': 'Tüm ayrıntılar için <a href="/return-policy.html" style="color:var(--primary);">İade Politikamıza</a> bakın.',
    'pt': 'Para mais detalhes, consulte a nossa <a href="/return-policy.html" style="color:var(--primary);">Política de Devolução</a>.',
    'nl': 'Voor volledige details zie ons <a href="/return-policy.html" style="color:var(--primary);">Retourbeleid</a>.',
    'pl': 'Aby uzyskać pełne informacje, zobacz naszą <a href="/return-policy.html" style="color:var(--primary);">Politykę zwrotów</a>.',
    'ar': 'للحصول على التفاصيل الكاملة، راجع <a href="/return-policy.html" style="color:var(--primary);">سياسة الإرجاع</a> الخاصة بنا.',
}

KEY = "terms_s7_return_intro"
added = []
for lang, value in TRANSLATIONS.items():
    path = os.path.join('locales', f'{lang}.json')
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    if KEY in data:
        print(f'{lang}: already present, skipping')
        continue
    data[KEY] = value
    new_content = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    added.append(lang)

print(f'\nAdded to: {added}')
