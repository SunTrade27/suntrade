#!/usr/bin/env python3
"""
Adds 8 new i18n keys to every locale file for the new admin option-groups
editor (Alibaba-style variant buckets). Keeps the existing
locales/add-locale-keys.py keys; this is an additive batch.

Keys added:
  admin_product_option_groups       -> "Option groups (Color, Plug, ...)"
  admin_product_add_option_group    -> "+ Add option group ..."
  admin_product_option_groups_hint  -> "Examples: Color: Black, White ..."
  admin_product_group_name          -> Placeholder "e.g. Color, Plug, Size"
  admin_product_add_option          -> "+ Add option"
  admin_product_option_label        -> Placeholder "e.g. Black"
  admin_product_remove_option       -> aria-label / title "Remove option"
  admin_product_remove_group        -> aria-label / title "Remove group"
"""
import json, sys, os

ROOT = os.path.dirname(os.path.abspath(__file__))

T = {
    'en': {
        'admin_product_option_groups': 'Option groups (Color, Plug, Voltage, ...)',
        'admin_product_add_option_group': '+ Add option group (Color, Plug, Size, ...)',
        'admin_product_option_groups_hint': 'Examples: "Color: Black, White, Pink" · "Plug: EU, AU, UK, US" · "Voltage: 110V, 220-240V"',
        'admin_product_group_name': 'e.g. Color, Plug, Size',
        'admin_product_add_option': '+ Add option',
        'admin_product_option_label': 'e.g. Black',
        'admin_product_remove_option': 'Remove option',
        'admin_product_remove_group': 'Remove group',
    },
    'kz': {
        'admin_product_option_groups': 'Опция топтары (Түс, Plug, Кернеу, ...)',
        'admin_product_add_option_group': '+ Опция тобын қосу (Түс, Plug, Өлшем, ...)',
        'admin_product_option_groups_hint': 'Мысалы: "Түс: Қара, Ақ, Қызғылт" · "Plug: EU, AU, UK, US" · "Кернеу: 110V, 220-240V"',
        'admin_product_group_name': 'мысалы Түс, Plug, Өлшем',
        'admin_product_add_option': '+ Опция қосу',
        'admin_product_option_label': 'мысалы Қара',
        'admin_product_remove_option': 'Опцияны алып тастау',
        'admin_product_remove_group': 'Топты алып тастау',
    },
    'ru': {
        'admin_product_option_groups': 'Группы опций (Цвет, Вилка, Напряжение, ...)',
        'admin_product_add_option_group': '+ Добавить группу опций (Цвет, Вилка, Размер, ...)',
        'admin_product_option_groups_hint': 'Примеры: "Цвет: Чёрный, Белый, Розовый" · "Вилка: EU, AU, UK, US" · "Напряжение: 110V, 220-240V"',
        'admin_product_group_name': 'напр. Цвет, Вилка, Размер',
        'admin_product_add_option': '+ Добавить опцию',
        'admin_product_option_label': 'напр. Чёрный',
        'admin_product_remove_option': 'Удалить опцию',
        'admin_product_remove_group': 'Удалить группу',
    },
    'de': {
        'admin_product_option_groups': 'Optionsgruppen (Farbe, Stecker, Spannung, ...)',
        'admin_product_add_option_group': '+ Optionsgruppe hinzufügen (Farbe, Stecker, Größe, ...)',
        'admin_product_option_groups_hint': 'Beispiele: "Farbe: Schwarz, Weiß, Rosa" · "Stecker: EU, AU, UK, US" · "Spannung: 110V, 220-240V"',
        'admin_product_group_name': 'z.B. Farbe, Stecker, Größe',
        'admin_product_add_option': '+ Option hinzufügen',
        'admin_product_option_label': 'z.B. Schwarz',
        'admin_product_remove_option': 'Option entfernen',
        'admin_product_remove_group': 'Gruppe entfernen',
    },
    'fr': {
        'admin_product_option_groups': 'Groupes d\'options (Couleur, Prise, Tension, ...)',
        'admin_product_add_option_group': '+ Ajouter un groupe (Couleur, Prise, Taille, ...)',
        'admin_product_option_groups_hint': 'Exemples: "Couleur: Noir, Blanc, Rose" · "Prise: EU, AU, UK, US" · "Tension: 110V, 220-240V"',
        'admin_product_group_name': 'ex. Couleur, Prise, Taille',
        'admin_product_add_option': '+ Ajouter une option',
        'admin_product_option_label': 'ex. Noir',
        'admin_product_remove_option': 'Supprimer l\'option',
        'admin_product_remove_group': 'Supprimer le groupe',
    },
    'es': {
        'admin_product_option_groups': 'Grupos de opciones (Color, Enchufe, Voltaje, ...)',
        'admin_product_add_option_group': '+ Añadir grupo de opciones (Color, Enchufe, Tamaño, ...)',
        'admin_product_option_groups_hint': 'Ejemplos: "Color: Negro, Blanco, Rosa" · "Enchufe: EU, AU, UK, US" · "Voltaje: 110V, 220-240V"',
        'admin_product_group_name': 'ej. Color, Enchufe, Tamaño',
        'admin_product_add_option': '+ Añadir opción',
        'admin_product_option_label': 'ej. Negro',
        'admin_product_remove_option': 'Eliminar opción',
        'admin_product_remove_group': 'Eliminar grupo',
    },
    'it': {
        'admin_product_option_groups': 'Gruppi di opzioni (Colore, Spina, Voltaggio, ...)',
        'admin_product_add_option_group': '+ Aggiungi gruppo di opzioni (Colore, Spina, Taglia, ...)',
        'admin_product_option_groups_hint': 'Esempi: "Colore: Nero, Bianco, Rosa" · "Spina: EU, AU, UK, US" · "Voltaggio: 110V, 220-240V"',
        'admin_product_group_name': 'es. Colore, Spina, Taglia',
        'admin_product_add_option': '+ Aggiungi opzione',
        'admin_product_option_label': 'es. Nero',
        'admin_product_remove_option': 'Rimuovi opzione',
        'admin_product_remove_group': 'Rimuovi gruppo',
    },
    'tr': {
        'admin_product_option_groups': 'Seçenek grupları (Renk, Fiş, Voltaj, ...)',
        'admin_product_add_option_group': '+ Seçenek grubu ekle (Renk, Fiş, Beden, ...)',
        'admin_product_option_groups_hint': 'Örnekler: "Renk: Siyah, Beyaz, Pembe" · "Fiş: EU, AU, UK, US" · "Voltaj: 110V, 220-240V"',
        'admin_product_group_name': 'örn. Renk, Fiş, Beden',
        'admin_product_add_option': '+ Seçenek ekle',
        'admin_product_option_label': 'örn. Siyah',
        'admin_product_remove_option': 'Seçeneği kaldır',
        'admin_product_remove_group': 'Grubu kaldır',
    },
    'pt': {
        'admin_product_option_groups': 'Grupos de opções (Cor, Tomada, Voltagem, ...)',
        'admin_product_add_option_group': '+ Adicionar grupo de opções (Cor, Tomada, Tamanho, ...)',
        'admin_product_option_groups_hint': 'Exemplos: "Cor: Preto, Branco, Rosa" · "Tomada: EU, AU, UK, US" · "Voltagem: 110V, 220-240V"',
        'admin_product_group_name': 'ex. Cor, Tomada, Tamanho',
        'admin_product_add_option': '+ Adicionar opção',
        'admin_product_option_label': 'ex. Preto',
        'admin_product_remove_option': 'Remover opção',
        'admin_product_remove_group': 'Remover grupo',
    },
    'nl': {
        'admin_product_option_groups': 'Optiegroepen (Kleur, Stekker, Spanning, ...)',
        'admin_product_add_option_group': '+ Optiegroep toevoegen (Kleur, Stekker, Maat, ...)',
        'admin_product_option_groups_hint': 'Voorbeelden: "Kleur: Zwart, Wit, Roze" · "Stekker: EU, AU, UK, US" · "Spanning: 110V, 220-240V"',
        'admin_product_group_name': 'bijv. Kleur, Stekker, Maat',
        'admin_product_add_option': '+ Optie toevoegen',
        'admin_product_option_label': 'bijv. Zwart',
        'admin_product_remove_option': 'Optie verwijderen',
        'admin_product_remove_group': 'Groep verwijderen',
    },
    'pl': {
        'admin_product_option_groups': 'Grupy opcji (Kolor, Wtyczka, Napięcie, ...)',
        'admin_product_add_option_group': '+ Dodaj grupę opcji (Kolor, Wtyczka, Rozmiar, ...)',
        'admin_product_option_groups_hint': 'Przykłady: "Kolor: Czarny, Biały, Różowy" · "Wtyczka: EU, AU, UK, US" · "Napięcie: 110V, 220-240V"',
        'admin_product_group_name': 'np. Kolor, Wtyczka, Rozmiar',
        'admin_product_add_option': '+ Dodaj opcję',
        'admin_product_option_label': 'np. Czarny',
        'admin_product_remove_option': 'Usuń opcję',
        'admin_product_remove_group': 'Usuń grupę',
    },
    'ar': {
        'admin_product_option_groups': '\u0645\u062c\u0645\u0648\u0639\u0627\u062a \u0627\u0644\u062e\u064a\u0627\u0631\u0627\u062a (\u0627\u0644\u0644\u0648\u0646, \u0627\u0644\u0642\u0627\u0628\u0633, \u0627\u0644\u062c\u0647\u062f, ...)',
        'admin_product_add_option_group': '+ \u0625\u0636\u0627\u0641\u0629 \u0645\u062c\u0645\u0648\u0639\u0629 \u062e\u064a\u0627\u0631\u0627\u062a (\u0627\u0644\u0644\u0648\u0646, \u0627\u0644\u0642\u0627\u0628\u0633, \u0627\u0644\u062d\u062c\u0645, ...)',
        'admin_product_option_groups_hint': '\u0623\u0645\u062b\u0644\u0629: "\u0627\u0644\u0644\u0648\u0646: \u0623\u0633\u0648\u062f, \u0623\u0628\u064a\u0636, \u0648\u0631\u062f\u064a" \u00b7 "\u0627\u0644\u0642\u0627\u0628\u0633: EU, AU, UK, US" \u00b7 "\u0627\u0644\u062c\u0647\u062f: 110V, 220-240V"',
        'admin_product_group_name': '\u0645\u062b\u0644 \u0627\u0644\u0644\u0648\u0646, \u0627\u0644\u0642\u0627\u0628\u0633, \u0627\u0644\u062d\u062c\u0645',
        'admin_product_add_option': '+ \u0625\u0636\u0627\u0641\u0629 \u062e\u064a\u0627\u0631',
        'admin_product_option_label': '\u0645\u062b\u0644 \u0623\u0633\u0648\u062f',
        'admin_product_remove_option': '\u062d\u0630\u0641 \u0627\u0644\u062e\u064a\u0627\u0631',
        'admin_product_remove_group': '\u062d\u0630\u0641 \u0627\u0644\u0645\u062c\u0645\u0648\u0639\u0629',
    },
}

for lang, additions in T.items():
    path = os.path.join(ROOT, 'locales', lang + '.json')
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    # Skip if all keys already present (idempotent re-run).
    skip = True
    for k in additions.keys():
        if k not in data:
            skip = False
            break
    if skip:
        print(f'{lang}: already has keys, skipping')
        continue
    merged = {**data, **additions}
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'{lang}: added missing keys')

print('done')
