// ===== Bottom Navigation Active State =====
// Automatically highlights the current page in the bottom nav bar
(function() {
  'use strict';
  document.addEventListener('DOMContentLoaded', function() {
    const path = window.location.pathname;
    const items = document.querySelectorAll('.bottom-nav-item');
    items.forEach(function(item) {
      const href = item.getAttribute('href');
      if (!href) return;
      if (path === href || (href === '/' && path === '/index.html') || 
          (href !== '/' && path.startsWith(href))) {
        item.classList.add('active');
      }
    });
    // Update cart badge in bottom nav
    updateBottomNavBadge();
  });

  function updateBottomNavBadge() {
    const badge = document.getElementById('bottom-nav-cart-badge');
    if (!badge) return;
    try {
      const cart = JSON.parse(localStorage.getItem('suntrade_cart') || '[]');
      const count = cart.reduce(function(s, i) { return s + (parseInt(i.qty) || 1); }, 0);
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    } catch(e) {}
  }

  // Listen for cart changes
  window.addEventListener('storage', function(e) {
    if (e.key === 'suntrade_cart') updateBottomNavBadge();
  });
  // Override saveCart to also update bottom nav badge
  var origUpdateBadge = window.updateCartBadge;
  window.updateCartBadge = function() {
    if (typeof origUpdateBadge === 'function') origUpdateBadge();
    updateBottomNavBadge();
  };
})();

// ===== Cart Drawer =====
var CartDrawer = {
  isOpen: false,

  open: function() {
    var overlay = document.getElementById('cart-drawer-overlay');
    var drawer = document.getElementById('cart-drawer');
    if (!overlay || !drawer) return;
    this.isOpen = true;
    this.render();
    overlay.classList.add('open');
    drawer.classList.add('open');
    document.body.style.overflow = 'hidden';
  },

  close: function() {
    var overlay = document.getElementById('cart-drawer-overlay');
    var drawer = document.getElementById('cart-drawer');
    if (!overlay || !drawer) return;
    this.isOpen = false;
    overlay.classList.remove('open');
    drawer.classList.remove('open');
    document.body.style.overflow = '';
  },

  toggle: function() {
    if (this.isOpen) this.close();
    else this.open();
  },

  render: function() {
    var itemsEl = document.getElementById('cart-drawer-items');
    var footerEl = document.getElementById('cart-drawer-footer');
    var countEl = document.getElementById('cart-drawer-count');
    if (!itemsEl) return;

    var cartItems = [];
    try { cartItems = JSON.parse(localStorage.getItem('suntrade_cart') || '[]'); } catch(e) {}

    if (countEl) {
      var total = cartItems.reduce(function(s, i) { return s + (parseInt(i.qty) || 1); }, 0);
      countEl.textContent = total;
    }

    if (cartItems.length === 0) {
      itemsEl.innerHTML = '<div class="cart-drawer-empty">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>' +
        '<p>' + (typeof t === 'function' ? t('cart_empty') : 'Your cart is empty') + '</p>' +
        '<a href="/catalog.html" class="btn-checkout" style="display:inline-block;width:auto;padding:10px 24px;">' + (typeof t === 'function' ? t('cart_continue') : 'Continue Shopping') + '</a>' +
        '</div>';
      if (footerEl) footerEl.style.display = 'none';
      return;
    }

    if (footerEl) footerEl.style.display = 'block';

    var html = '';
    var total = 0;
    for (var i = 0; i < cartItems.length; i++) {
      var item = cartItems[i];
      var unitPrice = (typeof getDiscountedPrice === 'function') ? getDiscountedPrice(item.price, item.qty) : item.price;
      var subTotal = unitPrice * item.qty;
      total += subTotal;
      html += '<div class="cart-drawer-item">' +
        '<img src="' + (item.image || '/images/placeholder.jpg') + '" alt="" class="cart-drawer-item-img">' +
        '<div class="cart-drawer-item-info">' +
          '<div class="cart-drawer-item-name">' + (item.name || 'Product') + '</div>' +
          '<div class="cart-drawer-item-price">€' + subTotal.toFixed(2) + '</div>' +
          '<div class="cart-drawer-item-qty">x' + item.qty + ' · €' + unitPrice.toFixed(2) + '/pc</div>' +
        '</div>' +
        '<button class="cart-drawer-item-remove" onclick="CartDrawer.removeItem(\'' + item.id + '\')" aria-label="Remove">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>';
    }
    itemsEl.innerHTML = html;

    var totalAmountEl = document.getElementById('cart-drawer-total-amount');
    if (totalAmountEl) totalAmountEl.textContent = '€' + total.toFixed(2);
  },

  removeItem: function(id) {
    if (typeof removeFromCart === 'function') {
      removeFromCart(id);
    } else {
      var cart = [];
      try { cart = JSON.parse(localStorage.getItem('suntrade_cart') || '[]'); } catch(e) {}
      cart = cart.filter(function(item) { return item.id !== id; });
      localStorage.setItem('suntrade_cart', JSON.stringify(cart));
      if (typeof updateCartBadge === 'function') updateCartBadge();
    }
    this.render();
  }
};

// Override cart link clicks to open drawer instead
document.addEventListener('DOMContentLoaded', function() {
  // Wire up cart link in navbar to open drawer
  var cartLinks = document.querySelectorAll('.cart-link');
  cartLinks.forEach(function(link) {
    link.addEventListener('click', function(e) {
      if (window.innerWidth > 768) {
        e.preventDefault();
        CartDrawer.open();
      }
    });
  });
});

// ===== Favorites / Wishlist — Shared across all pages =====
var FavoritesManager = {
  cachedIds: null, // null = not loaded yet, Set = loaded
  loading: false,

  load: async function() {
    if (this.loading) return;
    this.loading = true;
    try {
      if (typeof getUserFavorites !== 'function' || typeof sb === 'undefined' || !sb) {
        this.cachedIds = new Set();
        this.loading = false;
        return;
      }
      var ids = await getUserFavorites();
      this.cachedIds = new Set(ids);
      this.updateButtons();
    } catch (e) {
      this.cachedIds = new Set();
    }
    this.loading = false;
  },

  isFav: function(productId) {
    return this.cachedIds ? this.cachedIds.has(productId) : false;
  },

  updateButtons: function() {
    if (!this.cachedIds) return;
    document.querySelectorAll('.wishlist-btn').forEach(function(btn) {
      var pid = btn.getAttribute('data-product-id');
      if (pid) {
        btn.classList.toggle('favorited', FavoritesManager.cachedIds.has(pid));
      }
    });
  },

  toggle: async function(productId, btnEl) {
    try {
      if (typeof toggleFavorite !== 'function') return;
      // If favorites not loaded yet, load first
      if (!this.cachedIds) await this.load();
      var added = await toggleFavorite(productId);
      if (this.cachedIds) {
        if (added) this.cachedIds.add(productId);
        else this.cachedIds.delete(productId);
      }
      if (btnEl) {
        btnEl.classList.toggle('favorited', added);
        btnEl.classList.add('animate');
        setTimeout(function() { btnEl.classList.remove('animate'); }, 600);
      }
      return added;
    } catch (e) {
      if (e.message === 'NOT_LOGGED_IN') {
        if (typeof showNotification === 'function') {
          showNotification('<svg class="icon icon-sm" style="color:white;vertical-align:middle;"><use href="#icon-user"/></svg> ' + (typeof t === 'function' ? t('login_required') : 'Please log in'));
        }
        setTimeout(function() { window.location.href = '/auth.html'; }, 1500);
      } else {
        console.error('FavoritesManager.toggle error:', e);
      }
      return false;
    }
  },

  initAuthListener: function() {
    if (typeof onAuthStateChange !== 'function') return;
    onAuthStateChange(function(event) {
      if (event === 'SIGNED_IN') {
        FavoritesManager.load();
      } else if (event === 'SIGNED_OUT') {
        FavoritesManager.cachedIds = new Set();
        FavoritesManager.updateButtons();
      }
    });
  }
};

// Initialize favorites after Supabase is ready
(function initFavorites() {
  function tryLoad() {
    if (typeof sb !== 'undefined' && sb && typeof getUserFavorites === 'function') {
      FavoritesManager.load();
      FavoritesManager.initAuthListener();
    } else {
      setTimeout(tryLoad, 300);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(tryLoad, 600); });
  } else {
    setTimeout(tryLoad, 600);
  }
})();
