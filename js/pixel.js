// ===== Facebook Pixel (Meta Pixel) =====
// Pixel ID: 1360976662857950
// Loaded on every page. GDPR consent gates tracking for EU visitors.
// Helper functions (fbTrackViewContent, fbTrackAddToCart, fbTrackPurchase, etc.)
// are called by product.html, cart.js, checkout.html, etc.

const FB_PIXEL_ID = '1360976662857950';

// ---------- Consent state ----------
// Stored in localStorage so returning visitors stay opted-in/opted-out.
const CONSENT_KEY = 'suntrade_fb_consent';

function getFbConsent() {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    if (v === 'granted') return true;
    if (v === 'denied') return false;
  } catch (_) { /* private browsing */ }
  return null; // undecided
}

function setFbConsent(granted) {
  try { localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied'); } catch (_) {}
  // Update the FB data processing settings
  if (typeof fbq === 'function') {
    fbq('consent', granted ? 'grant' : 'revoke');
  }
}

// ---------- GDPR region detection ----------
// Simple GeoIP-free heuristic: if the browser language is an EU/EEA locale
// or the user has not yet decided, show the consent banner.
const EU_LOCALES = ['de','fr','es','it','nl','pl','pt','hr','cs','da','et','fi','el',
                     'hu','ga','lv','lt','mt','ro','sk','sl','sv','bg'];
function isLikelyEuVisitor() {
  const lang = (navigator.language || navigator.userLanguage || '').slice(0, 2).toLowerCase();
  return EU_LOCALES.includes(lang);
}

// ---------- Load the Pixel ----------
(function initFbPixel() {
  // Always load the fbevents.js library so fbq() is callable
  !function(f,b,e,v,n,t,s){
    if(f.fbq)return;n=f.fbq=function(){
      n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];
    t=b.createElement(e);t.async=!0;t.src=v;
    s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s);
  }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');

  // Apply stored consent BEFORE init so FB knows the user's choice
  const storedConsent = getFbConsent();
  if (storedConsent === false) {
    // Set default to denied so fbq respects it from the start
    window._fbq = window._fbq || {};
  }

  // Initialize the pixel
  fbq('init', FB_PIXEL_ID);

  // Apply consent state
  if (storedConsent === true) {
    fbq('consent', 'grant');
  } else if (storedConsent === false) {
    fbq('consent', 'revoke');
  } else {
    // First visit: default to denied until they accept
    fbq('consent', 'revoke');
  }

  // Fire PageView ONLY when consent is explicitly granted.
  // For first-time visitors (storedConsent === null) PageView is fired
  // by showFbConsentBanner() after they click "Accept All".
  if (storedConsent === true) {
    fbq('track', 'PageView');
  }
})();

// ---------- Consent Banner ----------
function showFbConsentBanner() {
  if (getFbConsent() !== null) return; // already decided
  if (!isLikelyEuVisitor()) {
    // Non-EU: auto-grant and fire PageView
    setFbConsent(true);
    fbq('track', 'PageView');
    return;
  }

  // Build the banner
  const banner = document.createElement('div');
  banner.id = 'fb-cookie-banner';
  banner.innerHTML = `
    <div style="position:fixed;bottom:0;left:0;right:0;z-index:99999;
      background:#1a1a2e;color:#e0e0e0;padding:16px 24px;
      display:flex;align-items:center;justify-content:space-between;
      flex-wrap:wrap;gap:12px;font-family:Inter,sans-serif;font-size:14px;
      box-shadow:0 -4px 20px rgba(0,0,0,0.3);border-top:1px solid rgba(255,107,0,0.3);">
      <span style="flex:1;min-width:250px;line-height:1.5;">
        🍪 We use cookies and pixels (including Meta/Facebook) to improve your experience
        and measure ad performance. <a href="/privacy-policy.html"
        style="color:#FF6B00;text-decoration:underline;">Privacy Policy</a>
      </span>
      <div style="display:flex;gap:8px;flex-shrink:0;">
        <button id="fb-consent-accept"
          style="background:#FF6B00;color:white;border:none;padding:10px 20px;
          border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;">
          Accept All
        </button>
        <button id="fb-consent-decline"
          style="background:transparent;color:#aaa;border:1px solid #444;padding:10px 20px;
          border-radius:8px;font-weight:500;cursor:pointer;font-size:14px;">
          Decline
        </button>
      </div>
    </div>`;
  document.body.appendChild(banner);

  document.getElementById('fb-consent-accept').addEventListener('click', function() {
    setFbConsent(true);
    fbq('track', 'PageView');
    banner.remove();
  });
  document.getElementById('fb-consent-decline').addEventListener('click', function() {
    setFbConsent(false);
    banner.remove();
  });
}

// Show banner when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', showFbConsentBanner);
} else {
  showFbConsentBanner();
}

// ---------- E-commerce Event Helpers ----------
// Each helper checks consent before firing. Call these from product.html,
// cart.js, checkout.html, etc.
// CAPI: every event gets a unique event_id for browser↔server deduplication.

function _fbCanTrack() {
  return getFbConsent() === true;
}

/** Generate a unique event ID for deduplication between browser pixel and CAPI */
function _generateEventId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/**
 * Send event to CAPI server endpoint (fire-and-forget, non-blocking).
 * The event_id must match the one sent via fbq() for deduplication.
 */
function _sendToCapi(eventName, event_id, customData) {
  try {
    fetch('/api/facebook-capi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: eventName,
        event_id: event_id,
        event_time: Math.floor(Date.now() / 1000),
        custom_data: customData || {}
      })
    }).catch(() => {}); // fire-and-forget
  } catch (_) { /* non-fatal */ }
}

/**
 * ViewContent — fired when a visitor opens a product page.
 * @param {Object} product  { id, name, price, category }
 */
function fbTrackViewContent(product) {
  if (!_fbCanTrack()) return;
  const eventId = _generateEventId();
  const eventData = {
    content_ids: [String(product.id)],
    content_type: 'product',
    value: parseFloat(product.price) || 0,
    currency: 'EUR',
    content_name: product.name || ''
  };
  fbq('track', 'ViewContent', eventData, { eventID: eventId });
  _sendToCapi('ViewContent', eventId, eventData);
}

/**
 * AddToCart — fired when the visitor clicks "Add to Cart".
 * @param {Array} items  [{ id, name, price, qty }]
 */
function fbTrackAddToCart(items) {
  if (!_fbCanTrack()) return;
  const eventId = _generateEventId();
  const contents = items.map(i => ({
    id: String(i.id),
    quantity: i.qty || 1,
    item_price: parseFloat(i.price) || 0
  }));
  const value = contents.reduce((s, i) => s + i.item_price * i.quantity, 0);
  const eventData = {
    content_ids: items.map(i => String(i.id)),
    content_type: 'product',
    contents,
    value,
    currency: 'EUR'
  };
  fbq('track', 'AddToCart', eventData, { eventID: eventId });
  _sendToCapi('AddToCart', eventId, eventData);
}

/**
 * InitiateCheckout — fired when visitor opens the checkout page.
 * @param {Array} items  [{ id, name, price, qty }]
 */
function fbTrackInitiateCheckout(items) {
  if (!_fbCanTrack()) return;
  const eventId = _generateEventId();
  const contents = items.map(i => ({
    id: String(i.id),
    quantity: i.qty || 1,
    item_price: parseFloat(i.price) || 0
  }));
  const value = contents.reduce((s, i) => s + i.item_price * i.quantity, 0);
  const eventData = {
    content_ids: items.map(i => String(i.id)),
    content_type: 'product',
    contents,
    value,
    currency: 'EUR',
    num_items: contents.reduce((s, i) => s + i.quantity, 0)
  };
  fbq('track', 'InitiateCheckout', eventData, { eventID: eventId });
  _sendToCapi('InitiateCheckout', eventId, eventData);
}

/**
 * Purchase — fired after a successful order.
 * @param {Object} order  { value, currency, content_ids, content_type, contents, num_items }
 */
function fbTrackPurchase(order) {
  if (!_fbCanTrack()) return;
  const eventId = _generateEventId();
  fbq('track', 'Purchase', order, { eventID: eventId });
  _sendToCapi('Purchase', eventId, order);
}

/**
 * CompleteRegistration — fired when a user signs up.
 */
function fbTrackCompleteRegistration() {
  if (!_fbCanTrack()) return;
  const eventId = _generateEventId();
  fbq('track', 'CompleteRegistration', {}, { eventID: eventId });
  _sendToCapi('CompleteRegistration', eventId, {});
}

/**
 * Search — fired when a visitor searches the catalog.
 * @param {string} searchString
 */
function fbTrackSearch(searchString) {
  if (!_fbCanTrack()) return;
  const eventId = _generateEventId();
  const eventData = { search_string: searchString || '' };
  fbq('track', 'Search', eventData, { eventID: eventId });
  _sendToCapi('Search', eventId, eventData);
}

/**
 * Lead — fired when a visitor contacts via WhatsApp or similar.
 */
function fbTrackLead() {
  if (!_fbCanTrack()) return;
  const eventId = _generateEventId();
  fbq('track', 'Lead', {}, { eventID: eventId });
  _sendToCapi('Lead', eventId, {});
}
