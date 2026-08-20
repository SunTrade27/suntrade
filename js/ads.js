/**
 * SunTrade Ad System — client-side loader
 * Inserts top navbar banner and/or product-page bottom ad
 * from the `ads` table in Supabase.
 *
 * Usage (any page):
 *   <script src="/js/ads.js"></script>
 *   // ads.loadAds() is called automatically on DOMContentLoaded
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://wmznfdngucpsmjbxiwzn.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indtem5mZG5ndWNwc21qYnhpd3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Nzk1NDAsImV4cCI6MjA5NTE1NTU0MH0.DaYcIF7uaU0FSWbB9Mlq4YVVYm2EleOSz6ACtwyHjsI';

  const ads = {
    /** Fetch active ads from Supabase */
    async fetchAds(position) {
      try {
        if (!window.supabase || !window.supabase.createClient) return [];
        const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        const { data, error } = await sb.from('ads')
          .select('*')
          .eq('active', true)
          .order('placement_priority', { ascending: false });
        if (error) { console.warn('[ads] fetch error:', error.message); return []; }
        // Client-side filtering for dates and position
        const now = Date.now();
        return (data || []).filter(ad => {
          const startMs = ad.start_date ? new Date(ad.start_date).getTime() : 0;
          const endMs = ad.end_date ? new Date(ad.end_date).getTime() : Infinity;
          if (startMs > now || endMs < now) return false;
          if (position && ad.position !== position && ad.position !== 'both') return false;
          return true;
        });
      } catch (e) {
        console.warn('[ads] fetch failed:', e);
        return [];
      }
    },

    /** Build an ad banner HTML element */
    createBanner(ad, cssClass) {
      const a = document.createElement('a');
      a.href = ad.link_url || '#';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = cssClass;
      a.title = ad.title;
      a.setAttribute('aria-label', 'Advertisement: ' + ad.title);

      const img = document.createElement('img');
      img.src = ad.image_url;
      img.alt = ad.title;
      img.loading = 'lazy';
      img.style.cssText = 'width:100%;height:auto;display:block;object-fit:cover;';
      a.appendChild(img);
      return a;
    },

    /** Insert ads into their target positions */
    async loadAds() {
      // ── 1. Navbar top banner ──
      const navbarAds = await this.fetchAds('navbar');
      if (navbarAds.length > 0) {
        this.insertNavbarBanner(navbarAds[0]);
      }

      // ── 2. Product page bottom ad ──
      const productAds = await this.fetchAds('product_bottom');
      if (productAds.length > 0) {
        this.insertProductBottomAd(productAds[0]);
      }
    },

    /** Insert a thin banner above the main navbar */
    insertNavbarBanner(ad) {
      // Don't duplicate
      if (document.getElementById('ads-navbar-banner')) return;

      const banner = this.createBanner(ad, 'ads-navbar-banner');
      banner.id = 'ads-navbar-banner';
      banner.style.cssText =
        'display:block;width:100%;max-height:100px;overflow:hidden;' +
        'background:#111827;text-align:center;line-height:0;';

      // Insert before the navbar
      const navbar = document.getElementById('main-navbar') ||
                     document.querySelector('.navbar') ||
                     document.querySelector('nav');
      if (navbar && navbar.parentNode) {
        navbar.parentNode.insertBefore(banner, navbar);
      }
    },

    /** Insert ad in the product page empty zone (after trust badges, before ticker) */
    insertProductBottomAd(ad) {
      // Don't duplicate
      if (document.getElementById('ads-product-bottom')) return;

      const banner = this.createBanner(ad, 'ads-product-bottom');
      banner.id = 'ads-product-bottom';
      banner.style.cssText =
        'display:block;width:100%;border-radius:16px;overflow:hidden;' +
        'margin:1.5rem 0;background:#111827;line-height:0;';

      // Product page loads content dynamically (500ms delay).
      // Retry insertion until the target element appears.
      this._insertProductAd(banner, 0);
    },

    _insertProductAd(banner, attempt) {
      if (document.getElementById('ads-product-bottom')) return;

      const targets = [
        document.querySelector('.trust-badges'),
        document.querySelector('.payment-badges'),
        document.querySelector('.product-actions'),
        document.getElementById('product-price-block')
      ];

      for (const el of targets) {
        if (el && el.parentNode) {
          if (el.nextSibling) {
            el.parentNode.insertBefore(banner, el.nextSibling);
          } else {
            el.parentNode.appendChild(banner);
          }
          return;
        }
      }

      // Fallback targets
      const fallbacks = [
        document.querySelector('.volume-pricing'),
        document.querySelector('.ticker-banner'),
        document.querySelector('.product-desc-content')
      ];
      for (const el of fallbacks) {
        if (el && el.parentNode) {
          el.parentNode.insertBefore(banner, el);
          return;
        }
      }

      // Retry up to 20 times (2 seconds total) for dynamically loaded content
      if (attempt < 20) {
        setTimeout(() => this._insertProductAd(banner, attempt + 1), 100);
      }
    }
  };

  // Auto-load when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ads.loadAds());
  } else {
    ads.loadAds();
  }

  // Expose globally
  window.suntradeAds = ads;
})();
