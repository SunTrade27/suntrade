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
        const now = new Date().toISOString();
        let query = sb.from('ads')
          .select('*')
          .eq('active', true)
          .or('end_date.is.null,end_date.gt.' + now)
          .lte('start_date', now)
          .order('placement_priority', { ascending: false });

        if (position) {
          query = query.or('position.eq.both,position.eq.' + position);
        }

        const { data, error } = await query;
        if (error) { console.warn('[ads] fetch error:', error.message); return []; }
        return data || [];
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

      // Strategy: find the trust badges section or the payment badges area
      // and insert after it
      const targets = [
        document.querySelector('.trust-badges'),
        document.querySelector('.payment-badges'),
        document.querySelector('.product-actions'),
        document.getElementById('product-price-block')
      ];

      let inserted = false;
      for (const el of targets) {
        if (el && el.parentNode) {
          // Insert after the element
          if (el.nextSibling) {
            el.parentNode.insertBefore(banner, el.nextSibling);
          } else {
            el.parentNode.appendChild(banner);
          }
          inserted = true;
          break;
        }
      }

      // Fallback: insert before the volume pricing or ticker
      if (!inserted) {
        const fallbacks = [
          document.querySelector('.volume-pricing'),
          document.querySelector('.ticker-banner'),
          document.querySelector('.product-desc-content')
        ];
        for (const el of fallbacks) {
          if (el && el.parentNode) {
            el.parentNode.insertBefore(banner, el);
            inserted = true;
            break;
          }
        }
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
