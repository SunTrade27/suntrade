$c = Get-Content "D:\Sait\SunTrade\admin.html" -Raw

# 1. Add Type field in form-row (between Price and Stock)
$old1 = '<label data-i18n="admin_product_price">Price (EUR)</label>
          <input type="number" id="pprice" step="0.01" min="0" required>
        </div>
        <div class="form-group">
          <label data-i18n="admin_product_stock">Stock</label>
          <input type="number" id="pstock" min="0" required>'

$new1 = '<label data-i18n="admin_product_price">Price (EUR)</label>
          <input type="number" id="pprice" step="0.01" min="0" required>
        </div>
        <div class="form-group">
          <label data-i18n="admin_product_type">Type</label>
          <input type="text" id="ptype" placeholder="e.g. Size, Color">
        </div>
        <div class="form-group">
          <label data-i18n="admin_product_stock">Stock</label>
          <input type="number" id="pstock" min="0" required>'

$c = $c.Replace($old1, $new1)

# 2. Add type loading in openProductModal
$old2 = "document.getElementById('pprice').value = product.price;
      document.getElementById('pstock').value = product.stock;
      document.getElementById('pactive').checked = product.active;"

$new2 = "document.getElementById('pprice').value = product.price;
      document.getElementById('ptype').value = product.type || '';
      document.getElementById('pstock').value = product.stock;
      document.getElementById('pactive').checked = product.active;"

$c = $c.Replace($old2, $new2)

# 3. Add type saving in saveProduct
$old3 = "price: parseFloat(document.getElementById('pprice').value),
      stock: parseInt(document.getElementById('pstock').value),
      category_id: document.getElementById('pcategory').value || null,"

$new3 = "price: parseFloat(document.getElementById('pprice').value),
      type: document.getElementById('ptype').value,
      stock: parseInt(document.getElementById('pstock').value),
      category_id: document.getElementById('pcategory').value || null,"

$c = $c.Replace($old3, $new3)

Set-Content "D:\Sait\SunTrade\admin.html" $c -NoNewline
Write-Host "Done!"
