#!/usr/bin/env python3
"""Verify all 12 locale files are valid JSON and have the new return-policy keys."""
import json, os

KEYS_EXPECTED = [
    "return_title", "return_updated", "return_intro",
    "return_s1_title", "return_s1_text",
    "return_s2_title", "return_s2_intro", "return_s2_li1", "return_s2_li2", "return_s2_li3",
    "return_s3_title", "return_s3_intro", "return_s3_li1", "return_s3_li2", "return_s3_li3",
    "return_s4_title", "return_s4_text",
    "return_s5_title", "return_s5_text",
    "return_contact_title", "return_contact_intro",
    "return_contact_li_email", "return_contact_li_wa",
    "return_more_info", "footer_return"
]

langs = ['en', 'kz', 'ru', 'de', 'fr', 'es', 'it', 'tr', 'pt', 'nl', 'pl', 'ar']
for lang in langs:
    path = os.path.join('locales', f'{lang}.json')
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    missing = [k for k in KEYS_EXPECTED if k not in data]
    empty = [k for k in KEYS_EXPECTED if k in data and not data[k]]
    status = 'OK' if not missing and not empty else 'FAIL'
    print(f'[{status}] {lang}: {len(data)} total keys, missing={missing}, empty={empty}')
