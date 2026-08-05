import os

path = r"D:\Sait\SunTrade\admin.html"

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add Type field in form-row (between Price and Stock)
old1 = '''          <label data-i18n="admin_product_price">Price (EUR)</label>
          <input type="number" id="pprice" step="0.01" min="0" required>
        </div>
        <div class="form-group">
          <label data-i18n="admin_product_stock">Stock</label>
          <input type="number" id="pstock" min="0" required>'''

new1 = '''          <label data-i18n="admin_product_price">Price (EUR)</label>
          <input type="number" id="pprice" step="0.01" min="0" required>
        </div>
        <div class="form-group">
          <label data-i18n="admin_product_type">Type</label>
          <input type="text" id="ptype" placeholder="e.g. Size, Color">
        </div>
        <div class="form-group">
          <label data-i18n="admin_product_stock">Stock</label>
          <input type="number" id="pstock" min="0" required>'''

content = content.replace(old1, new1)

# 2. Add type loading in openProductModal
old2 = "document.getElementById('pprice').value = product.price;\n      document.getElementById('pstock').value = product.stock;\n      document.getElementById('pactive').checked = product.active;"

new2 = "document.getElementById('pprice').value = product.price;\n      document.getElementById('ptype').value = product.type || '';\n      document.getElementById('pstock').value = product.stock;\n      document.getElementById('pactive').checked = product.active;"

content = content.replace(old2, new2)

# 3. Add type in saveProduct
old3 = "price: parseFloat(document.getElementById('pprice').value),\n      stock: parseInt(document.getElementById('pstock').value),\n      category_id: document.getElementById('pcategory').value || null,"

new3 = "price: parseFloat(document.getElementById('pprice').value),\n      type: document.getElementById('ptype').value,\n      stock: parseInt(document.getElementById('pstock').value),\n      category_id: document.getElementById('pcategory').value || null,"

content = content.replace(old3, new3)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done! admin.html updated successfully.")
