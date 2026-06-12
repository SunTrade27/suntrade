#!/usr/bin/env python3
"""Replace TRENDING_PRODUCTS array and seedTrendingProducts function in admin.html."""

with open('admin.html', 'r', encoding='utf-8') as f:
    content = f.read()

# ===== Replacement 1: Button HTML =====
old_button = '''          <button class="btn-sm btn-outline" onclick="seedTrendingProducts()" id="seed-btn" style="font-size:0.8rem;padding:8px 14px;background:linear-gradient(135deg,#667EEA,#764BA2);color:white;border:none;">
            <svg class="icon icon-sm" style="vertical-align:middle"><use href="#icon-package"/></svg> Add Trending Electronics (10)
          </button>'''

new_button = '''          <button class="btn-sm btn-outline" onclick="seedTrendingProducts()" id="seed-btn" style="font-size:0.8rem;padding:8px 14px;background:linear-gradient(135deg,#667EEA,#764BA2);color:white;border:none;">
            <svg class="icon icon-sm" style="vertical-align:middle"><use href="#icon-package"/></svg> AI Auto-Trending Products
          </button>'''

if old_button in content:
    content = content.replace(old_button, new_button)
    print("Button HTML replaced")
else:
    print("Button HTML NOT FOUND!")
    idx = content.find('seedTrendingProducts')
    if idx > 0:
        print(f"  Found at idx {idx}, context: {content[idx-80:idx+80]}")

# ===== Replacement 2: TRENDING_PRODUCTS header =====
old_header = "  // ===== Seed Trending Products (Electronics) ====="
new_header = "  // ===== Seed Trending Products (AI-powered via Google Trends + Gemini) ====="

count = content.count(old_header)
if count > 0:
    content = content.replace(old_header, new_header)
    print(f"Header replaced ({count} occurrences)")
else:
    print("Header NOT found!")

# ===== Replacement 3: Remove the hardcoded array items =====
# Find the const TRENDING_PRODUCTS = [ line and remove until ]; that ends before function
old_const_line = "  const TRENDING_PRODUCTS = ["
idx_const = content.find(old_const_line)
idx_fn = content.find("  async function seedTrendingProducts()")

if idx_const > 0 and idx_fn > idx_const:
    # Find the ]; that ends the array
    array_end = content.find("];", idx_const)
    if array_end > idx_const and array_end < idx_fn:
        # Remove from const line to end of ];
        content = content[:idx_const] + "  const TRENDING_PRODUCTS = []; // Now fetched from /api/trending-products\n" + content[array_end+2:]
        print(f"Array items removed (from idx {idx_const} to {array_end+2})")
    else:
        print(f"Could not find array end! array_end={array_end}, fn_idx={idx_fn}")
else:
    print(f"Could not find array! const_idx={idx_const}, fn_idx={idx_fn}")

# ===== Replacement 4: seedTrendingProducts function =====
new_fn = '''  async function seedTrendingProducts() {
    if (!confirm('Trending products: Google Trends + AI аркылы автоматты турады?\\n\\nAuto-generate trending products using Google Trends + AI? (Images from Unsplash)')) return;

    const btn = document.getElementById('seed-btn');
    const statusEl = document.getElementById('batch-translate-status');
    btn.disabled = true;
    btn.innerHTML = '<svg class="icon icon-sm" style="vertical-align:middle;margin-right:4px;"><use href="#icon-clock"/></svg> Analyzing trends...';
    statusEl.style.display = 'block';
    statusEl.style.background = '#FEF3C7';
    statusEl.style.color = '#92400E';

    try {
      // Step 1: Get categories
      const categories = await getCategories();
      const electronicsCat = categories.find(c => c.slug === 'electronics');
      const defaultCategoryId = electronicsCat ? electronicsCat.id : (categories.length > 0 ? categories[0].id : '');

      statusEl.innerHTML = '<svg class="icon icon-sm" style="vertical-align:middle;margin-right:4px;"><use href="#icon-clock"/></svg> Asking Gemini AI + Google Trends for trending products...';

      // Step 2: Call the AI-powered trending products API
      const resp = await fetch('/api/trending-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 10, category: '' })
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || 'API error: ' + resp.status);
      }

      const data = await resp.json();
      if (!data.success || !data.products || data.products.length === 0) {
        throw new Error('No products returned from AI');
      }

      const products = data.products;
      statusEl.innerHTML = '<svg class="icon icon-sm" style="vertical-align:middle;margin-right:4px;"><use href="#icon-clock"/></svg> Generated ' + products.length + ' products! Saving to database...';

      // Step 3: Save each product
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        statusEl.innerHTML = '<svg class="icon icon-sm" style="vertical-align:middle;margin-right:4px;"><use href="#icon-clock"/></svg> [' + (i + 1) + '/' + products.length + '] Saving: ' + (p.name_en || '').substring(0, 45) + '...';

        try {
          const productData = {
            name_en: p.name_en || 'Trending Product',
            desc_en: p.desc_en || '',
            price: parseFloat(p.price) || 9.99,
            stock: parseInt(p.stock) || 30,
            images: p.images || [],
            category_id: defaultCategoryId || null,
            active: true,
            name_kz: '', name_ru: '', name_de: '', name_fr: '', name_es: '', name_it: '',
            name_tr: '', name_pt: '', name_nl: '', name_pl: '', name_ar: '',
            desc_kz: '', desc_ru: '', desc_de: '', desc_fr: '', desc_es: '', desc_it: '',
            desc_tr: '', desc_pt: '', desc_nl: '', desc_pl: '', desc_ar: ''
          };

          const { error } = await sb.from('products').insert([productData]);
          if (error) throw error;
          successCount++;
        } catch (err) {
          console.error('Error saving product:', p.name_en, err);
          errorCount++;
        }
      }

      // Step 4: Show result
      statusEl.style.background = successCount > 0 ? '#D1FAE5' : '#FEE2E2';
      statusEl.style.color = successCount > 0 ? '#065F46' : '#991B1B';

      let msg = '<svg class="icon icon-sm" style="vertical-align:middle;margin-right:4px;"><use href="#icon-check-circle"/></svg> Done! Added ' + successCount + ' trending products';
      if (errorCount > 0) msg += ' (' + errorCount + ' errors)';
      msg += '. Images from Unsplash - replace them later.';

      if (successCount > 0) {
        msg += ' <button class="btn-sm btn-outline" onclick="batchTranslateAll()" style="margin-left:8px;font-size:0.8rem;">Translate All Now</button>';
      }

      statusEl.innerHTML = msg;
      loadProducts();

    } catch (err) {
      console.error('Seed trending error:', err);
      statusEl.style.background = '#FEE2E2';
      statusEl.style.color = '#991B1B';
      statusEl.innerHTML = '<svg class="icon icon-sm" style="vertical-align:middle;margin-right:4px;color:#EF4444;"><use href="#icon-x"/></svg> Error: ' + err.message + '. Make sure GEMINI_API_KEY is set in env vars.';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg class="icon icon-sm" style="vertical-align:middle"><use href="#icon-package"/></svg> AI Auto-Trending Products';
      setTimeout(function() { statusEl.style.display = 'none'; }, 15000);
    }
  }'''

# Find old function boundaries
old_fn_start = "  async function seedTrendingProducts() {"
old_fn_end = "  async function saveProduct(e)"

idx_fn_start = content.find(old_fn_start)
idx_fn_end = content.find(old_fn_end, idx_fn_start)

if idx_fn_start > 0 and idx_fn_end > idx_fn_start:
    content = content[:idx_fn_start] + new_fn + "\n" + content[idx_fn_end:]
    print(f"Function replaced (removed {idx_fn_end - idx_fn_start} chars, added {len(new_fn)} chars)")
else:
    print(f"Function boundaries not found! start={idx_fn_start}, end={idx_fn_end}")
    if idx_fn_start > 0:
        print(f"  Context: {content[idx_fn_start:idx_fn_start+200]}")

# Write the file back
with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("\nDone! admin.html updated successfully.")
