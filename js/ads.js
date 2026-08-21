/**
 * SunTrade Ad System — client-side loader
 * Inserts top navbar banner and/or product-page bottom ad
 * from the `ads` table in Supabase.
 *
 * Rotation logic:
 *   - MAX_ACTIVE_ADS = 5 (only 5 ads shown at a time per position)
 *   - Ads are sorted by placement_priority (highest first)
 *   - Expired ads are automatically deactivated
 *   - If fewer than 5 active ads exist, queued ads can become active
 *
 * Usage (any page):
 *   <script src="/js/ads.js"></script>
 *   // ads.loadAds() is called automatically on DOMContentLoaded
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://wmznfdngucpsmjbxiwzn.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indtem5mZG5ndWNwc21qYnhpd3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Nzk1NDAsImV4cCI6MjA5NTE1NTU0MH0.DaYcIF7uaU0FSWbB9Mlq4YVVYm2EleOSz6ACtwyHjsI';

  const MAX_ACTIVE_ADS = 5;

  const ads = {
    /** Fetch active ads from Supabase with rotation logic */
    async fetchAds(position) {
      try {
        if (!window.supabase || !window.supabase.createClient) return [];
        const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

        // Fetch ONLY paid ads — unpaid ads should NEVER appear on the site
        const { data, error } = await sb.from('ads')
          .select('*')
          .eq('paid', true)
          .order('placement_priority', { ascending: false });
        if (error) { console.warn('[ads] fetch error:', error.message); return []; }

        const now = Date.now();

        // Step 1: Deactivate expired ads and activate queued ads if slot available
        const allAds = (data || []);
        const activeAds = [];
        const expiredAds = [];
        const queuedAds = [];

        for (const ad of allAds) {
          const startMs = ad.start_date ? new Date(ad.start_date).getTime() : 0;
          const endMs = ad.end_date ? new Date(ad.end_date).getTime() : Infinity;

          // Filter by position
          if (position && ad.position !== position && ad.position !== 'both') continue;

          if (ad.active && startMs <= now && endMs >= now) {
            activeAds.push(ad);
          } else if (ad.active && endMs < now) {
            // Expired — mark for deactivation
            expiredAds.push(ad);
          } else if (!ad.active && ad.start_date && startMs <= now) {
            // Paid but queued — eligible to become active
            queuedAds.push(ad);
          }
        }

        // Deactivate expired ads (keep paid=true so they stay in rotation if re-activated)
        for (const expired of expiredAds) {
          sb.from('ads').update({ active: false }).eq('id', expired.id)
            .then(() => console.log('[ads] Deactivated expired ad:', expired.id))
            .catch(err => console.warn('[ads] Failed to deactivate:', err));
        }

        // If we have room, activate queued paid ads (by priority)
        const slotsAvailable = MAX_ACTIVE_ADS - activeAds.length;
        if (slotsAvailable > 0 && queuedAds.length > 0) {
          const toActivate = queuedAds.slice(0, slotsAvailable);
          for (const queued of toActivate) {
            sb.from('ads').update({
              active: true,
              start_date: new Date().toISOString(),
              end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            }).eq('id', queued.id)
              .then(() => console.log('[ads] Activated queued ad:', queued.id))
              .catch(err => console.warn('[ads] Failed to activate:', err));
            activeAds.push(queued);
          }
        }

        // Step 2: Return only the top MAX_ACTIVE_ADS by priority
        return activeAds
          .sort((a, b) => (b.placement_priority || 0) - (a.placement_priority || 0))
          .slice(0, MAX_ACTIVE_ADS);
      } catch (e) {
        console.warn('[ads] fetch failed:', e);
        return [];
      }
    },

    /** Build an ad banner HTML element */
    createBanner(ad, cssClass, imageUrl) {
      const a = document.createElement('a');
      a.href = ad.link_url || '#';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = cssClass;
      a.title = ad.title;
      a.setAttribute('aria-label', 'Advertisement: ' + ad.title);

      const img = document.createElement('img');
      img.src = imageUrl || ad.image_url;
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
        'display:block;width:100%;max-height:120px;overflow:hidden;' +
        'background:#111827;text-align:center;line-height:0;' +
        'border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,0.3);';

      // Insert before the navbar
      const navbar = document.getElementById('main-navbar') ||
                     document.querySelector('.navbar') ||
                     document.querySelector('nav');
      if (navbar && navbar.parentNode) {
        navbar.parentNode.insertBefore(banner, navbar);
      }
    },

    /** Insert ad inside product-gallery, under the thumbnail strip (left column) */
    insertProductBottomAd(ad) {
      if (document.getElementById('ads-product-bottom')) return;

      const banner = this.createBanner(ad, 'ads-product-bottom', ad.product_image_url || ad.image_url);
      banner.id = 'ads-product-bottom';
      banner.style.cssText =
        'display:block;width:100%;border-radius:12px;overflow:hidden;' +
        'margin-top:1rem;background:var(--bg-white,#fff);border:2px solid var(--primary,#FF6B00);' +
        'line-height:0;box-shadow:0 4px 12px rgba(0,0,0,0.15);';

      this._insertProductAd(banner, 0);
    },

    _insertProductAd(banner, attempt) {
      if (document.getElementById('ads-product-bottom')) return;

      // Primary target: inside .product-gallery after .gallery-thumbs (left column under images)
      const gallery = document.querySelector('.product-gallery');
      const thumbs = document.querySelector('.gallery-thumbs');
      if (gallery && thumbs && thumbs.nextSibling) {
        gallery.insertBefore(banner, thumbs.nextSibling);
        return;
      }
      if (gallery) {
        gallery.appendChild(banner);
        return;
      }

      // Fallback: insert after .gallery-main inside product-gallery
      const galleryMain = document.querySelector('.gallery-main');
      if (galleryMain && galleryMain.parentNode === gallery) {
        galleryMain.parentNode.insertBefore(banner, galleryMain.nextSibling);
        return;
      }

      // Last resort: retry up to 20 times (2 seconds total)
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
