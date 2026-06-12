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

function addToCart(productId, name, price, image, qty = 1) {
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
    cart.push({ id: productId, name: String(name), price: numPrice, image: image || '', qty: numQty });
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
  return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
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

  container.innerHTML = cart.map(item => `
    <div class="cart-item" data-id="${item.id}">
      <img src="${item.image || '/images/placeholder.jpg'}" alt="${item.name}" class="cart-item-img">
      <div class="cart-item-info">
        <h3 class="cart-item-name">${item.name}</h3>
        <p class="cart-item-price">€${item.price.toFixed(2)}</p>
        <div class="cart-item-qty">
          <button onclick="updateCartQty('${item.id}', ${item.qty - 1})">-</button>
          <span>${item.qty}</span>
          <button onclick="updateCartQty('${item.id}', ${item.qty + 1})">+</button>
        </div>
      </div>
      <div class="cart-item-right">
        <p class="cart-item-subtotal">€${(item.price * item.qty).toFixed(2)}</p>
        <button class="cart-remove-btn" onclick="removeFromCart('${item.id}')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
      </div>
    </div>
  `).join('');

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

document.addEventListener('DOMContentLoaded', updateCartBadge);
