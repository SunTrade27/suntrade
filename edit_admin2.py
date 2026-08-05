import os

path = r"D:\Sait\SunTrade\admin.html"

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add CSS rule for .product-fields-row before the closing </style> tag
css_rule = '''
/* Product form fields row: 3 columns for Price, Type, Stock */
.product-fields-row {
  grid-template-columns: 1fr 1fr 1fr !important;
}
@media (max-width: 768px) {
  .product-fields-row {
    grid-template-columns: 1fr 1fr !important;
  }
}
'''

# Insert the CSS rule just before </style>
content = content.replace('</style>', css_rule + '\n</style>')

# Add class="product-fields-row" to the form-row
content = content.replace(
    '<div class="form-row">',
    '<div class="form-row product-fields-row">',
    1  # Only replace the first occurrence
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done! CSS rule added.")
