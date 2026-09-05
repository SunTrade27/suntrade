// ===== Visitor Tracker (Lead / Abandoned Cart) =====
// Tracks anonymous visitor behavior: page_view, add_to_cart, checkout, purchase.
// Visitor ID is a random UUID stored in localStorage so returning visitors
// are recognised. Events are batched and flushed to Supabase via the REST API
// (anon key, RLS allows INSERT for anyone).

(function () {
  'use strict';

  const VISITOR_ID_KEY = 'suntrade_visitor_id';
  const SESSION_ID_KEY = 'suntrade_session_id';
  const TRACKER_ENDPOINT = 'https://wmznfdngucpsmjbxiwzn.supabase.co/rest/v1/visitor_events';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indtem5mZG5ndWNwc21qYnhpd3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Nzk1NDAsImV4cCI6MjA5NTE1NTU0MH0.DaYcIF7uaU0FSWbB9Mlq4YVVYm2EleOSz6ACtwyHjsI';

  // ---- Supported site languages (used to record the visitor's language) ----
  const SITE_LANGS = ['en', 'kz', 'ru', 'de', 'fr', 'es', 'it', 'tr', 'pt', 'nl', 'pl', 'ar'];
  function detectSiteLang() {
    try {
      const cur = (typeof currentLang !== 'undefined' && currentLang) || '';
      if (SITE_LANGS.indexOf(cur) !== -1) return cur;
      const nav = (navigator.language || 'en').toLowerCase();
      for (let i = 0; i < SITE_LANGS.length; i++) {
        const l = SITE_LANGS[i];
        if (nav === l || nav.indexOf(l + '-') === 0) return l;
      }
    } catch (e) {}
    return 'en';
  }

  // ---- Visitor ID ----
  function getVisitorId() {
    try {
      let id = localStorage.getItem(VISITOR_ID_KEY);
      if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() :
          'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(VISITOR_ID_KEY, id);
      }
      return id;
    } catch (_) {
      return 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }
  }

  // ---- Session ID (changes every 30 min inactivity) ----
  function getSessionId() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(SESSION_ID_KEY) || 'null');
      const now = Date.now();
      if (stored && now - stored.ts < 30 * 60 * 1000) {
        // Refresh timestamp
        stored.ts = now;
        sessionStorage.setItem(SESSION_ID_KEY, JSON.stringify(stored));
        return stored.id;
      }
      const id = 's-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem(SESSION_ID_KEY, JSON.stringify({ id, ts: now }));
      return id;
    } catch (_) {
      return 's-' + Date.now();
    }
  }

  // ---- IP hash (best-effort, SHA-256) ----
  let _ipHash = null;
  async function getIpHash() {
    if (_ipHash) return _ipHash;
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const { ip } = await res.json();
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
      _ipHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (_) {
      _ipHash = 'unknown';
    }
    return _ipHash;
  }

  // ---- Flush event to Supabase ----
  async function trackEvent(eventType, data) {
    const visitorId = getVisitorId();
    const sessionId = getSessionId();
    const ipHash = await getIpHash();

    const payload = {
      visitor_id: visitorId,
      event_type: eventType,
      product_id: data.productId || null,
      product_name: data.productName || null,
      product_price: data.productPrice || null,
      product_image: data.productImage || null,
      page_url: window.location.href,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent || null,
      ip_hash: ipHash,
      session_id: sessionId,
      metadata: Object.assign({ lang: detectSiteLang() }, data.metadata || {})
    };

    try {
      await fetch(TRACKER_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      // Silent fail — tracking should never break the site
      console.warn('[visitor-tracker] Failed to track event:', err);
    }
  }

  // ---- Public API ----
  window.visitorTrack = {
    /** Track product page view */
    viewContent: function (product) {
      trackEvent('page_view', {
        productId: product.id,
        productName: product.name || product.name_en || '',
        productPrice: parseFloat(product.price) || 0,
        productImage: (Array.isArray(product.images) && product.images[0]) || '',
        metadata: { source: 'product_page' }
      });
    },

    /** Track add-to-cart */
    addToCart: function (item) {
      trackEvent('add_to_cart', {
        productId: item.id,
        productName: item.name || '',
        productPrice: parseFloat(item.price) || 0,
        productImage: item.image || '',
        metadata: { qty: item.qty || 1, variant: item.variantLabel || '' }
      });
    },

    /** Track checkout initiated */
    checkout: function (items) {
      trackEvent('checkout', {
        metadata: {
          items: items.map(i => ({
            id: i.id,
            name: i.name || '',
            price: i.price,
            qty: i.qty || 1
          })),
          total: items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (i.qty || 1), 0)
        }
      });
    },

    /** Track successful purchase */
    purchase: function (orderId, items, total) {
      trackEvent('purchase', {
        metadata: {
          orderId: orderId,
          items: items,
          total: total
        }
      });
    }
  };

  console.log('[visitor-tracker] Initialized — visitor:', getVisitorId().slice(0, 8) + '...');
})();
