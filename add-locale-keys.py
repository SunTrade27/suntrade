#!/usr/bin/env python3
"""
Adds four new i18n keys to every locale file for the new admin product-
variants editor. Keeps the orders of keys consistent by inserting them
right after admin_product_type (which they conceptually belong next to).

Keys added:
  admin_product_variants       -> header text "Product variants ..."
  admin_product_add_variant    -> "+ Add variant ..."
  admin_product_remove_variant -> tooltip "Remove variant"
  admin_product_min_one_variant-> alert + tooltip "At least one variant required"
"""
import json, sys, os

ROOT = os.path.dirname(os.path.abspath(__file__))

# Per-language translations. Pair keys with the appropriate UI copy.
# Where a language already had admin_product_type=Type 1 we keep parity by
# using "Type N" as the notion; where it said "Tip 1 / Type 1" we keep it.
T = {
    'en': {
        'admin_product_variants': 'Product variants (Type 1, Type 2, ...)',
        'admin_product_add_variant': '+ Add variant (Type 2, Type 3, ...)',
        'admin_product_remove_variant': 'Remove variant',
        'admin_product_min_one_variant': 'At least one product variant is required',
    },
    'kz': {
        'admin_product_variants': 'Тауар түрлері (Түр 1, Түр 2, ...)',
        'admin_product_add_variant': '+ Түр қосу (Түр 2, Түр 3, ...)',
        'admin_product_remove_variant': 'Түрді алып тастау',
        'admin_product_min_one_variant': 'Кемінде бір тауар түрі қажет',
    },
    'ru': {
        'admin_product_variants': 'Варианты товара (Тип 1, Тип 2, ...)',
        'admin_product_add_variant': '+ Добавить вариант (Тип 2, Тип 3, ...)',
        'admin_product_remove_variant': 'Удалить вариант',
        'admin_product_min_one_variant': 'Нужен хотя бы один вариант товара',
    },
    'de': {
        'admin_product_variants': 'Produktvarianten (Typ 1, Typ 2, ...)',
        'admin_product_add_variant': '+ Variante hinzufügen (Typ 2, Typ 3, ...)',
        'admin_product_remove_variant': 'Variante entfernen',
        'admin_product_min_one_variant': 'Mindestens eine Produktvariante ist erforderlich',
    },
    'fr': {
        'admin_product_variants': 'Variantes du produit (Type 1, Type 2, ...)',
        'admin_product_add_variant': '+ Ajouter une variante (Type 2, Type 3, ...)',
        'admin_product_remove_variant': 'Supprimer la variante',
        'admin_product_min_one_variant': 'Au moins une variante est requise',
    },
    'es': {
        'admin_product_variants': 'Variantes del producto (Tipo 1, Tipo 2, ...)',
        'admin_product_add_variant': '+ Añadir variante (Tipo 2, Tipo 3, ...)',
        'admin_product_remove_variant': 'Eliminar variante',
        'admin_product_min_one_variant': 'Se requiere al menos una variante',
    },
    'it': {
        'admin_product_variants': 'Varianti del prodotto (Tipo 1, Tipo 2, ...)',
        'admin_product_add_variant': '+ Aggiungi variante (Tipo 2, Tipo 3, ...)',
        'admin_product_remove_variant': 'Rimuovi variante',
        'admin_product_min_one_variant': 'È richiesta almeno una variante',
    },
    'tr': {
        'admin_product_variants': 'Ürün varyantları (Tip 1, Tip 2, ...)',
        'admin_product_add_variant': '+ Varyant ekle (Tip 2, Tip 3, ...)',
        'admin_product_remove_variant': 'Varyantı kaldır',
        'admin_product_min_one_variant': 'En az bir varyant gerekli',
    },
    'pt': {
        'admin_product_variants': 'Variantes do produto (Tipo 1, Tipo 2, ...)',
        'admin_product_add_variant': '+ Adicionar variante (Tipo 2, Tipo 3, ...)',
        'admin_product_remove_variant': 'Remover variante',
        'admin_product_min_one_variant': 'É necessária pelo menos uma variante',
    },
    'nl': {
        'admin_product_variants': 'Productvarianten (Type 1, Type 2, ...)',
        'admin_product_add_variant': '+ Variant toevoegen (Type 2, Type 3, ...)',
        'admin_product_remove_variant': 'Variant verwijderen',
        'admin_product_min_one_variant': 'Minstens één productvariant is vereist',
    },
    'pl': {
        'admin_product_variants': 'Warianty produktu (Typ 1, Typ 2, ...)',
        'admin_product_add_variant': '+ Dodaj wariant (Typ 2, Typ 3, ...)',
        'admin_product_remove_variant': 'Usuń wariant',
        'admin_product_min_one_variant': 'Wymagany jest co najmniej jeden wariant',
    },
    'ar': {
        'admin_product_variants': 'أنواع المنتج (النوع 1، النوع 2، ...)',
        'admin_product_add_variant': '+ إضافة نوع (النوع 2، النوع 3، ...)',
        'admin_product_remove_variant': 'إزالة النوع',
        'admin_product_min_one_variant': 'يجب إدخال نوع واحد على الأقل',
    },
}

ANCHOR_AFTER = 'admin_product_type5'

for lang, additions in T.items():
    path = os.path.join(ROOT, 'locales', lang + '.json')
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    # If already present (idempotent), do nothing.
    if 'admin_product_variants' in data:
        print(f'{lang}: already has keys, skipping')
        continue
    # Find anchor (admin_product_type5) and insert right after it.
    keys = list(data.keys())
    idx = keys.index(ANCHOR_AFTER) if ANCHOR_AFTER in keys else None
    if idx is None:
        # Fallback: just append at end.
        print(f'{lang}: anchor {ANCHOR_AFTER} not found, appending at end', file=sys.stderr)
        new_data = {**data, **additions}
    else:
        # Insert in deterministic order right after anchor.
        before = {k: data[k] for k in keys[:idx + 1]}
        after  = {k: data[k] for k in keys[idx + 1:]}
        new_data = {}
        new_data.update(before)
        new_data.update(additions)
        new_data.update(after)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(new_data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'{lang}: added {len(additions)} keys')

print('done')
