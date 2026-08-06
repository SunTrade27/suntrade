#!/usr/bin/env python3
"""
Adds the admin_product_images_reorder_hint key (shown under the
uploaded-images preview grid in the product modal) to every locale file.
Idempotent: re-running this script is a no-op if the key is already present.
"""
import json, os

ROOT = os.path.dirname(os.path.abspath(__file__))

T = {
    'en': 'Drag thumbnails to reorder \u2014 the first image is the main one.',
    'kz': '\u0421\u0443\u0440\u0435\u0442\u0442\u0435\u0440\u0434\u0456 \u0440\u0435\u0442\u0456\u043d \u0430\u0443\u044b\u0441\u0442\u044b\u0440\u0443 \u04af\u0448\u0456\u043d \u0441\u04af\u0439\u0440\u0435\u04a3\u0456\u0437 \u2014 \u0431\u0456\u0440\u0456\u043d\u0448\u0456 \u0441\u0443\u0440\u0435\u0442 \u043d\u0435\u0433\u0456\u0437\u0433\u0456.',
    'ru': '\u041f\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u043c\u0438\u043d\u0438\u0430\u0442\u044e\u0440\u044b, \u0447\u0442\u043e\u0431\u044b \u0438\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u043f\u043e\u0440\u044f\u0434\u043e\u043a \u2014 \u043f\u0435\u0440\u0432\u043e\u0435 \u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u0433\u043b\u0430\u0432\u043d\u043e\u0435.',
    'de': 'Ziehen Sie die Miniaturbilder, um die Reihenfolge zu \u00e4ndern \u2014 das erste Bild ist das Hauptbild.',
    'fr': 'Glissez les miniatures pour r\u00e9organiser \u2014 la premi\u00e8re image est l\u2019image principale.',
    'es': 'Arrastra las miniaturas para reordenarlas \u2014 la primera imagen es la principal.',
    'it': 'Trascina le miniature per riordinarle \u2014 la prima immagine \u00e8 quella principale.',
    'tr': 'S\u0131ralamay\u0131 de\u011fi\u015ftirmek i\u00e7in k\u00fc\u00e7\u00fck resimleri s\u00fcr\u00fckleyin \u2014 ilk resim ana resimdir.',
    'pt': 'Arraste as miniaturas para reorden\u00e1-las \u2014 a primeira imagem \u00e9 a principal.',
    'nl': 'Versleep miniaturen om ze opnieuw te ordenen \u2014 de eerste afbeelding is de hoofdafbeelding.',
    'pl': 'Przeci\u0105gnij miniatury, aby zmieni\u0107 kolejno\u015b\u0107 \u2014 pierwszy obraz jest g\u0142\u00f3wny.',
    'ar': '\u0627\u0633\u062d\u0628 \u0627\u0644\u0635\u0648\u0631 \u0627\u0644\u0645\u0635\u063a\u0631\u0629 \u0644\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u062a\u0631\u062a\u064a\u0628 \u2014 \u0627\u0644\u0635\u0648\u0631\u0629 \u0627\u0644\u0623\u0648\u0644\u0649 \u0647\u064a \u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629.',
}
KEY = 'admin_product_images_reorder_hint'

for lang, value in T.items():
    path = os.path.join(ROOT, 'locales', lang + '.json')
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    if KEY in data:
        print(f'{lang}: already has key, skipping')
        continue
    data[KEY] = value
    # Re-write preserving parent key ordering: dump merged dict.
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'{lang}: added {KEY}')

print('done')
