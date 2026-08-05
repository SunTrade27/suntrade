import os

path = r"D:\Sait\SunTrade\admin.html"

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the CSS: use #product-modal for higher specificity, remove !important
old_css = '''/* Product form fields row: 3 columns for Price, Type, Stock */
.product-fields-row {
  grid-template-columns: 1fr 1fr 1fr !important;
}
@media (max-width: 768px) {
  .product-fields-row {
    grid-template-columns: 1fr 1fr !important;
  }
}'''

new_css = '''/* Product form fields row: 3 columns for Price, Type, Stock */
#product-modal .product-fields-row {
  grid-template-columns: 1fr 1fr 1fr;
}
@media (max-width: 768px) {
  #product-modal .product-fields-row {
    grid-template-columns: 1fr 1fr;
  }
}'''

content = content.replace(old_css, new_css)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done! CSS selector fixed.")
