#!/usr/bin/env python3
"""Insert Return Policy link into the footer-bottom legal-links row of all 9 HTML pages."""
import os, re

PAGES = ['cart.html', 'catalog.html', 'checkout.html', 'index.html',
         'privacy-policy.html', 'product.html', 'review.html',
         'reviews.html', 'terms.html']

# Exact pattern that exists in every footer (verified above)
# We're matching the Terms link + closing tag on the same line in a flex row
pattern = re.compile(
    r'(\s*<a href="/terms\.html" data-i18n="footer_terms">Terms of Service</a>)(\s*\n\s*</div>)',
    re.MULTILINE
)

replacement = (
    r'\1'
    + '\n      <a href="/return-policy.html" data-i18n="footer_return">Return Policy</a>'
    + r'\2'
)

for page in PAGES:
    if not os.path.exists(page):
        print(f'SKIP (missing): {page}')
        continue
    with open(page, 'r', encoding='utf-8') as f:
        content = f.read()
    new_content, count = pattern.subn(replacement, content)
    if count == 0:
        print(f'WARN: {page} - no match')
        continue
    with open(page, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f'OK: {page} - inserted 1 link')
