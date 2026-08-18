// ===== Volume Discount Tiers =====
// Quantity-based discount rules (applied automatically in cart). A permanent
// 10% discount is always active — even for a single item. Larger quantities
// get progressively bigger discounts: 2-4 pieces 20%, 5+ pieces 30%.
const DISCOUNT_TIERS = [
  { minQty: 1, maxQty: 1, discount: 0.10, label: '1' },
  { minQty: 2, maxQty: 4, discount: 0.20, label: '2-4' },
  { minQty: 5, maxQty: Infinity, discount: 0.30, label: '5+' }
];

/** Get the effective (discounted) unit price for a given base price and quantity */
function getDiscountedPrice(basePrice, qty) {
  const tier = DISCOUNT_TIERS.find(t => qty >= t.minQty && qty <= t.maxQty) || DISCOUNT_TIERS[0];
  return basePrice * (1 - tier.discount);
}

/** Get full discount info for an item */
function getDiscountInfo(basePrice, qty) {
  const tier = DISCOUNT_TIERS.find(t => qty >= t.minQty && qty <= t.maxQty) || DISCOUNT_TIERS[0];
  const effectivePrice = basePrice * (1 - tier.discount);
  return {
    effectivePrice,
    discountPercent: tier.discount * 100,
    savedAmount: (basePrice - effectivePrice) * qty,
    tier
  };
}

// Cart management
let cart = JSON.parse(localStorage.getItem('suntrade_cart') || '[]');

// Auto-clean invalid items on load
function cleanCart() {
  cart = cart.filter(item => {
    if (!item) return false;
    if (!item.id) return false;
    if (!item.name || String(item.name).trim() === '') return false;
    const price = parseFloat(item.price);
    if (isNaN(price) || price <= 0) return false;
    const qty = parseInt(item.qty);
    if (isNaN(qty) || qty <= 0) return false;
    // Normalize types
    item.price = price;
    item.qty = qty;
    return true;
  });
  localStorage.setItem('suntrade_cart', JSON.stringify(cart));
}
cleanCart();

function saveCart() {
  localStorage.setItem('suntrade_cart', JSON.stringify(cart));
  updateCartBadge();
}

function escapeCartHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getCartItemDisplayName(item) {
  if (!item) return '';
  const baseName = item.baseName || item.name || '';
  const parts = Array.isArray(item.variantParts) ? item.variantParts : [];
  if (!parts.length) return item.name || baseName;
  const labels = item.variantLabelTranslations || {};
  const rendered = parts.map(part => {
    const group = labels[part.group] || part.group || '';
    const value = labels[part.value] || part.value || '';
    return group ? group + ': ' + value : value;
  }).filter(Boolean).join(' / ');
  return baseName + (rendered ? ' — ' + rendered : '');
}

async function refreshCartVariantTranslations() {
  if (typeof currentLang === 'undefined' || currentLang === 'en' ||
      typeof ensureProductLabelTranslations !== 'function') return;
  const items = cart.filter(item => item && item.id && Array.isArray(item.variantParts) && item.variantParts.length);
  for (const item of items) {
    const sourceLabels = {};
    item.variantParts.forEach(part => {
      if (part.group) sourceLabels[part.group] = part.group;
      if (part.value) sourceLabels[part.value] = part.value;
    });
    const translated = await ensureProductLabelTranslations(item.id, currentLang, sourceLabels);
    item.variantLabelTranslations = { ...sourceLabels, ...translated };
    item.name = getCartItemDisplayName(item);
  }
  if (items.length) {
    localStorage.setItem('suntrade_cart', JSON.stringify(cart));
    if (typeof renderCartPage === 'function') renderCartPage();
    if (typeof renderCheckoutItems === 'function') renderCheckoutItems();
  }
}

function addToCart(productId, name, price, image, qty = 1, metadata = {}) {
  // Guard: reject items with empty/missing name
  if (!name || String(name).trim() === '') {
    console.error('Cannot add product without a name:', productId);
    showNotification(typeof t === 'function' ? t('no_name_alert') : 'Cannot add product without a name');
    return false;
  }
  // Ensure price is a number
  const numPrice = parseFloat(price);
  if (isNaN(numPrice) || numPrice <= 0) {
    console.error('Invalid price:', price);
    return false;
  }
  const numQty = parseInt(qty) || 1;
  if (numQty <= 0) return false;

  const existing = cart.find(item => item.id === productId);
  if (existing) {
    // Already in cart - don't add again, just notify
    showNotification((typeof t === 'function' ? t('already_in_cart') : 'Already in cart') + ' <svg class="icon icon-sm" style="color:white;vertical-align:middle;"><use href="#icon-check"/></svg>');
    return false;
  } else {
    const item = {
      id: productId,
      name: String(name),
      baseName: metadata.baseName || String(name),
      price: numPrice,
      image: image || '',
      qty: numQty
    };
    if (Array.isArray(metadata.variantParts) && metadata.variantParts.length) {
      item.variantParts = metadata.variantParts;
      item.variantLabelTranslations = metadata.variantLabelTranslations || {};
      item.name = getCartItemDisplayName(item);
    }
    cart.push(item);
  }
  saveCart();
  showNotification((typeof t === 'function' ? t('product_add_cart') : 'Add to Cart') + ' <svg class="icon icon-sm" style="color:white;vertical-align:middle;"><use href="#icon-check"/></svg>');
  return true;
}

function removeFromCart(productId) {
  cart = cart.filter(item => item.id !== productId);
  saveCart();
  renderCartPage();
}

function updateCartQty(productId, qty) {
  const item = cart.find(i => i.id === productId);
  if (item) {
    item.qty = Math.max(1, qty);
    saveCart();
    renderCartPage();
  }
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + getDiscountedPrice(item.price, item.qty) * item.qty, 0);
}

function getCartCount() {
  return cart.reduce((sum, item) => sum + item.qty, 0);
}

function clearCart() {
  cart = [];
  saveCart();
}

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (badge) {
    const count = getCartCount();
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}

function renderCartPage() {
  const container = document.getElementById('cart-items');
  const totalEl = document.getElementById('cart-total-amount');
  const emptyEl = document.getElementById('cart-empty');
  const checkoutBtn = document.getElementById('checkout-btn');
  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    if (checkoutBtn) checkoutBtn.style.display = 'none';
    if (totalEl) totalEl.textContent = '€0.00';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (checkoutBtn) checkoutBtn.style.display = 'block';

  container.innerHTML = cart.map(item => {
    const unitPrice = getDiscountedPrice(item.price, item.qty);
    const subTotal = unitPrice * item.qty;
    const info = getDiscountInfo(item.price, item.qty);
    const hasDiscount = info.discountPercent > 0;
    return `
    <div class="cart-item" data-id="${item.id}">
      <img src="${item.image || '/images/placeholder.jpg'}" alt="${item.name}" class="cart-item-img">
      <div class="cart-item-info">
        <h3 class="cart-item-name">${escapeCartHtml(getCartItemDisplayName(item))}</h3>
        <p class="cart-item-price">
          €${unitPrice.toFixed(2)}
          ${hasDiscount ? `<span class="cart-item-base-price">€${item.price.toFixed(2)}</span>` : ''}
          ${hasDiscount ? `<span class="cart-item-discount-badge">-${info.discountPercent}%</span>` : ''}
        </p>
        <div class="cart-item-qty">
          <button onclick="updateCartQty('${item.id}', ${item.qty - 1})">-</button>
          <span>${item.qty}</span>
          <button onclick="updateCartQty('${item.id}', ${item.qty + 1})">+</button>
        </div>
      </div>
      <div class="cart-item-right">
        <p class="cart-item-subtotal">€${subTotal.toFixed(2)}</p>
        ${hasDiscount ? `<p class="cart-item-saved">${t('you_save') || 'You save'} €${info.savedAmount.toFixed(2)}</p>` : ''}
        <button class="cart-remove-btn" onclick="removeFromCart('${item.id}')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
      </div>
    </div>
  `;}).join('');

  if (totalEl) totalEl.textContent = '€' + getCartTotal().toFixed(2);
}

function showNotification(message) {
  const notif = document.createElement('div');
  notif.className = 'notification';
  // Use innerHTML so callers can pass SVG icons (e.g. <svg class="icon"><use href="#icon-check"/></svg>).
  // All current callers pass hardcoded strings or translated text from JSON files (no user input),
  // so this is safe. If user-provided data is ever passed, sanitize it first.
  notif.innerHTML = message;
  document.body.appendChild(notif);
  setTimeout(() => notif.classList.add('show'), 10);
  setTimeout(() => {
    notif.classList.remove('show');
    setTimeout(() => notif.remove(), 300);
  }, 2000);
}

document.addEventListener('DOMContentLoaded', () => {
  updateCartBadge();
  refreshCartVariantTranslations().catch(err => console.warn('[cart] initial variant label translation failed:', err));
});
window.addEventListener('langChanged', () => {
  refreshCartVariantTranslations().catch(err => console.warn('[cart] variant label translation failed:', err));
});
