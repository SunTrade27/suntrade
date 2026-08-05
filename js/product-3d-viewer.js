// ===== Product 3D Viewer — Interactive 360° Carousel =====
// Uses Three.js (lazy-loaded from CDN) to display product images
// arranged on a rotating 3D carousel with drag, zoom, and auto-rotate.

(function () {
  'use strict';

  const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  let viewerInstance = null;
  let threeLoaded = false;
  let threeLoading = false;

  // --- Lazy-load Three.js ---
  function loadThreeJS() {
    return new Promise((resolve, reject) => {
      if (window.THREE) { threeLoaded = true; resolve(); return; }
      if (threeLoading) {
        // Wait for existing load
        const check = setInterval(() => {
          if (window.THREE) { clearInterval(check); resolve(); }
        }, 100);
        return;
      }
      threeLoading = true;
      const script = document.createElement('script');
      script.src = THREE_CDN;
      script.onload = () => { threeLoaded = true; resolve(); };
      script.onerror = () => reject(new Error('Failed to load Three.js'));
      document.head.appendChild(script);
    });
  }

  // --- Viewer class ---
  class Product3DViewer {
    constructor() {
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.carousel = null;
      this.images = [];
      this.rotation = 0;
      this.targetRotation = 0;
      this.isDragging = false;
      this.previousMouseX = 0;
      this.velocity = 0;
      this.autoRotateSpeed = -0.004;
      this.dampingFactor = 0.94;
      this.zoom = 6;
      this.targetZoom = 6;
      this.minZoom = 3;
      this.maxZoom = 12;
      this.isOpen = false;
      this.animationId = null;
      this.overlay = null;
      this.autoRotateTimeout = null;
      this.clock = null;
      this.glowParticles = null;
      this.activeIndex = 0;
    }

    // --- Public API ---
    async open(imageUrls) {
      if (!imageUrls || imageUrls.length === 0) return;
      this.images = imageUrls;

      try {
        await loadThreeJS();
      } catch (e) {
        console.error('3D Viewer: Could not load Three.js', e);
        return;
      }

      this.createOverlay();
      this.setupScene();
      this.createCarousel();
      this.createParticles();
      this.createFloor();
      this.setupControls();
      this.isOpen = true;
      this.clock = new THREE.Clock();
      this.animate();

      // Entrance animation
      requestAnimationFrame(() => {
        if (this.overlay) this.overlay.classList.add('active');
      });
    }

    close() {
      if (!this.isOpen && !this.overlay) return;
      this.isOpen = false;
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      if (this.autoRotateTimeout) clearTimeout(this.autoRotateTimeout);
      if (this._closeTimeout) { clearTimeout(this._closeTimeout); this._closeTimeout = null; }
      if (this._fadeCancels) { this._fadeCancels.forEach(function(fn) { fn(); }); this._fadeCancels = null; }
      if (this.overlay) {
        this.overlay.classList.remove('active');
        var self = this;
        this._closeTimeout = setTimeout(function() {
          self.removeOverlay();
          self.dispose();
          self._closeTimeout = null;
        }, 400);
      }
      document.body.style.overflow = '';
    }

    // --- Overlay ---
    createOverlay() {
      this.removeOverlay();
      document.body.style.overflow = 'hidden';

      const overlay = document.createElement('div');
      overlay.id = 'product-3d-viewer-overlay';
      overlay.innerHTML = `
        <div class="viewer-3d-header">
          <button class="viewer-3d-close" aria-label="Close 3D viewer">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <div class="viewer-3d-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
            <span>360° View</span>
          </div>
          <div class="viewer-3d-controls">
            <button class="viewer-3d-zoom-in" aria-label="Zoom in">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
            </button>
            <button class="viewer-3d-zoom-out" aria-label="Zoom out">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
            </button>
            <button class="viewer-3d-reset" aria-label="Reset view">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
              </svg>
            </button>
          </div>
        </div>
        <canvas id="product-3d-canvas"></canvas>
        <div class="viewer-3d-footer">
          <p class="viewer-3d-hint">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            Drag to rotate • Scroll to zoom
          </p>
          <div class="viewer-3d-dots" id="viewer-3d-dots"></div>
        </div>
      `;
      document.body.appendChild(overlay);
      this.overlay = overlay;

      // Bind close
      overlay.querySelector('.viewer-3d-close').onclick = () => this.close();
      overlay.querySelector('.viewer-3d-reset').onclick = () => this.resetView();
      overlay.querySelector('.viewer-3d-zoom-in').onclick = () => this.zoomIn();
      overlay.querySelector('.viewer-3d-zoom-out').onclick = () => this.zoomOut();
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.close();
      });
      document.addEventListener('keydown', this._escHandler = (e) => {
        if (e.key === 'Escape') this.close();
      });
    }

    removeOverlay() {
      if (this.overlay) {
        this.overlay.remove();
        this.overlay = null;
      }
      if (this._escHandler) {
        document.removeEventListener('keydown', this._escHandler);
        this._escHandler = null;
      }
    }

    // --- Scene ---
    setupScene() {
      const canvas = document.getElementById('product-3d-canvas');
      if (!canvas) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x0a0a1a);
      this.scene.fog = new THREE.FogExp2(0x0a0a1a, 0.04);

      this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 100);
      this.camera.position.set(0, 1.8, this.zoom);
      this.camera.lookAt(0, 0, 0);

      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.2;

      // Ambient
      this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

      // Key light (warm)
      const keyLight = new THREE.DirectionalLight(0xffeedd, 0.9);
      keyLight.position.set(5, 8, 5);
      this.scene.add(keyLight);

      // Fill light (cool)
      const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
      fillLight.position.set(-5, 3, -3);
      this.scene.add(fillLight);

      // Accent (orange)
      const accentLight = new THREE.PointLight(0xFF6B00, 0.6, 15);
      accentLight.position.set(0, 4, 0);
      this.scene.add(accentLight);

      // Resize handler
      this._resizeHandler = () => {
        const r = canvas.parentElement.getBoundingClientRect();
        this.camera.aspect = r.width / r.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(r.width, r.height);
      };
      window.addEventListener('resize', this._resizeHandler);
    }

    // --- Carousel ---
    createCarousel() {
      this.carousel = new THREE.Group();
      const n = this.images.length;
      const radius = Math.max(2.5, n * 0.5);
      const loader = new THREE.TextureLoader();
      loader.crossOrigin = 'anonymous';

      this.images.forEach((url, i) => {
        const angle = (i / n) * Math.PI * 2;

        loader.load(url, (texture) => {
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;

          const imgAspect = texture.image.width / texture.image.height;
          const h = 2.2;
          const w = h * imgAspect;

          // Image plane
          const geo = new THREE.PlaneGeometry(w, h);
          const mat = new THREE.MeshStandardMaterial({
            map: texture,
            side: THREE.DoubleSide,
            metalness: 0.05,
            roughness: 0.85,
            transparent: true,
            opacity: 0,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.userData.index = i;

          // Position on circle
          mesh.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
          // Face outward
          mesh.lookAt(0, 0, 0);
          mesh.rotateY(Math.PI);

          // Glow frame
          const frameGeo = new THREE.PlaneGeometry(w + 0.08, h + 0.08);
          const frameMat = new THREE.MeshBasicMaterial({
            color: 0xFF6B00,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
          });
          const frame = new THREE.Mesh(frameGeo, frameMat);
          frame.position.z = -0.02;
          mesh.add(frame);

          // Click to enlarge image
          mesh.userData.viewer = this;
          mesh.userData.imageUrl = url;
          mesh.userData.imageIndex = i;

          this.carousel.add(mesh);

          // Animate opacity in
          this._fadeInMaterial(mat, 0, 1, 600 + i * 150);
          this._fadeInMaterial(frameMat, 0, 0.15, 600 + i * 150);
        });
      });

      this.scene.add(this.carousel);

      // Create dot indicators
      this.createDots(n);
    }

    _fadeInMaterial(mat, from, to, duration) {
      const start = performance.now();
      let cancelled = false;
      const self = this;
      const tick = () => {
        if (cancelled || !self.isOpen) return;
        try {
          const elapsed = performance.now() - start;
          const t = Math.min(elapsed / duration, 1);
          mat.opacity = from + (to - from) * self._easeOutCubic(t);
          if (t < 1) requestAnimationFrame(tick);
        } catch (e) { /* material disposed */ }
      };
      requestAnimationFrame(tick);
      this._fadeCancels = this._fadeCancels || [];
      this._fadeCancels.push(() => { cancelled = true; });
    }

    _easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    // --- Particles (ambient floating dots) ---
    createParticles() {
      const count = 80;
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 20;
        positions[i * 3 + 1] = Math.random() * 8 - 2;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xFF6B00,
        size: 0.04,
        transparent: true,
        opacity: 0.5,
        sizeAttenuation: true,
      });
      this.glowParticles = new THREE.Points(geo, mat);
      this.scene.add(this.glowParticles);
    }

    // --- Floor (reflective circle) ---
    createFloor() {
      const geo = new THREE.CircleGeometry(12, 64);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x111122,
        metalness: 0.85,
        roughness: 0.15,
        transparent: true,
        opacity: 0.6,
      });
      const floor = new THREE.Mesh(geo, mat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -1.5;
      this.scene.add(floor);

      // Ring accent
      const ringGeo = new THREE.RingGeometry(2.8, 3.0, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xFF6B00,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -1.48;
      this.scene.add(ring);
    }

    // --- Dots ---
    createDots(n) {
      const dotsEl = document.getElementById('viewer-3d-dots');
      if (!dotsEl) return;
      dotsEl.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const dot = document.createElement('span');
        dot.className = 'viewer-3d-dot' + (i === 0 ? ' active' : '');
        const self = this;
        const idx = i;
        dot.addEventListener('click', function() { self.goToImage(idx); });
        dot.addEventListener('dblclick', function(e) { e.stopPropagation(); self.enlargeImage(idx); });
        dotsEl.appendChild(dot);
      }
    }

    updateDots() {
      const n = this.images.length;
      if (n === 0) return;
      const step = (Math.PI * 2) / n;
      // Normalize rotation to [0, 2PI)
      let norm = ((this.rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      // Find closest image index
      let closest = Math.round(norm / step) % n;
      // The carousel faces outward so index 0 is at angle 0, but we rotate the group
      // so we need to find which image is closest to the front
      let frontAngle = Math.PI; // camera looks from +Z, so front is at PI
      let minDist = Infinity;
      let frontIndex = 0;
      for (let i = 0; i < n; i++) {
        const imgAngle = ((i / n) * Math.PI * 2 + this.rotation) % (Math.PI * 2);
        const dist = Math.abs(imgAngle - frontAngle);
        const wrappedDist = Math.min(dist, Math.PI * 2 - dist);
        if (wrappedDist < minDist) {
          minDist = wrappedDist;
          frontIndex = i;
        }
      }

      if (frontIndex !== this.activeIndex) {
        this.activeIndex = frontIndex;
        const dots = document.querySelectorAll('.viewer-3d-dot');
        dots.forEach((d, i) => d.classList.toggle('active', i === frontIndex));
      }
    }

    goToImage(index) {
      const n = this.images.length;
      const step = (Math.PI * 2) / n;
      // Rotate so that the target image faces the camera (front at PI)
      const targetAngle = Math.PI - index * step;
      // Find shortest rotation path
      let diff = targetAngle - (this.rotation % (Math.PI * 2));
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      this.targetRotation = this.rotation + diff;
      // Zoom in slightly for better view
      this.targetZoom = Math.max(this.minZoom, this.zoom - 1.5);
      this.pauseAutoRotate();
      this.scheduleAutoRotate();
    }

    enlargeImage(index) {
      if (!this.images || !this.images[index]) return;
      // Create fullscreen lightbox
      const lb = document.createElement('div');
      lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:100001;display:flex;align-items:center;justify-content:center;cursor:zoom-out;animation:fadeIn 0.25s ease;padding:1rem;';
      const img = document.createElement('img');
      img.src = this.images[index];
      img.style.cssText = 'max-width:92vw;max-height:92vh;object-fit:contain;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.6);cursor:default;';
      img.onclick = function(e) { e.stopPropagation(); };
      lb.appendChild(img);
      // Close button
      const btn = document.createElement('button');
      btn.innerHTML = '&times;';
      btn.style.cssText = 'position:absolute;top:16px;right:20px;background:rgba(255,255,255,0.15);color:white;border:none;width:44px;height:44px;border-radius:50%;font-size:1.5rem;cursor:pointer;display:flex;align-items:center;justify-content:center;';
      btn.onclick = function() { lb.remove(); };
      lb.appendChild(btn);
      lb.onclick = function() { lb.remove(); };
      document.body.appendChild(lb);
    }

    // --- Controls ---
    setupControls() {
      const canvas = document.getElementById('product-3d-canvas');
      if (!canvas) return;

      // Pointer state
      let startX = 0;
      let startTime = 0;

      const onPointerDown = (x) => {
        this.isDragging = true;
        startX = x;
        startTime = Date.now();
        this.previousMouseX = x;
        this.velocity = 0;
        this.pauseAutoRotate();
      };

      const onPointerMove = (x) => {
        if (!this.isDragging) return;
        const dx = x - this.previousMouseX;
        this.velocity = -dx * 0.006;
        this.previousMouseX = x;
      };

      const onPointerUp = () => {
        if (!this.isDragging) return;
        this.isDragging = false;
        // Fling: keep velocity for momentum
        this.scheduleAutoRotate();
      };

      // Mouse
      canvas.addEventListener('mousedown', (e) => { e.preventDefault(); onPointerDown(e.clientX); });
      this._onMouseMove = (e) => onPointerMove(e.clientX);
      this._onMouseUp = onPointerUp;
      window.addEventListener('mousemove', this._onMouseMove);
      window.addEventListener('mouseup', this._onMouseUp);

      // Touch
      canvas.addEventListener('touchstart', (e) => { onPointerDown(e.touches[0].clientX); }, { passive: true });
      canvas.addEventListener('touchmove', (e) => { onPointerMove(e.touches[0].clientX); }, { passive: true });
      canvas.addEventListener('touchend', onPointerUp);

      // Click on image plane to enlarge
      canvas.addEventListener('dblclick', (e) => {
        if (!this.carousel) return;
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);
        const intersects = raycaster.intersectObjects(this.carousel.children, true);
        if (intersects.length > 0) {
          const obj = intersects[0].object;
          if (obj.userData.imageIndex !== undefined) {
            e.preventDefault();
            this.enlargeImage(obj.userData.imageIndex);
          }
        }
      });

      // Zoom (wheel)
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.targetZoom += e.deltaY * 0.008;
        this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom));
      }, { passive: false });

      // Pinch zoom
      let lastPinchDist = 0;
      canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
          lastPinchDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
        }
      }, { passive: true });
      canvas.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
          const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          const delta = lastPinchDist - dist;
          this.targetZoom += delta * 0.02;
          this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom));
          lastPinchDist = dist;
        }
      }, { passive: true });
    }

    pauseAutoRotate() {
      this.autoRotateSpeed = 0;
      if (this.autoRotateTimeout) clearTimeout(this.autoRotateTimeout);
    }

    scheduleAutoRotate() {
      if (this.autoRotateTimeout) clearTimeout(this.autoRotateTimeout);
      this.autoRotateTimeout = setTimeout(() => {
        this.autoRotateSpeed = 0.004;
      }, 3000);
    }

    resetView() {
      this.targetRotation = 0;
      this.rotation = 0;
      this.velocity = 0;
      this.targetZoom = 6;
      this.autoRotateSpeed = 0.004;
    }

    zoomIn() {
      this.targetZoom = Math.max(this.minZoom, this.targetZoom - 1.5);
    }

    zoomOut() {
      this.targetZoom = Math.min(this.maxZoom, this.targetZoom + 1.5);
    }

    // --- Animation Loop ---
    animate() {
      if (!this.isOpen) return;
      this.animationId = requestAnimationFrame(() => this.animate());

      const dt = this.clock ? this.clock.getDelta() : 0.016;

      // Auto-rotate
      this.rotation += this.autoRotateSpeed;

      // Velocity (fling momentum)
      if (Math.abs(this.velocity) > 0.0001) {
        this.rotation += this.velocity;
        this.velocity *= this.dampingFactor;
      } else {
        this.velocity = 0;
      }

      // Smooth zoom
      this.zoom += (this.targetZoom - this.zoom) * 0.08;
      this.camera.position.set(0, 1.8 + (this.zoom - 6) * 0.05, this.zoom);
      this.camera.lookAt(0, 0, 0);

      // Rotate carousel
      if (this.carousel) {
        this.carousel.rotation.y = this.rotation;
      }

      // Animate particles
      if (this.glowParticles) {
        const positions = this.glowParticles.geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
          positions[i + 1] += Math.sin(Date.now() * 0.001 + i) * 0.002;
        }
        this.glowParticles.geometry.attributes.position.needsUpdate = true;
        this.glowParticles.rotation.y += 0.0003;
      }

      // Update dots
      this.updateDots();

      // Render
      this.renderer.render(this.scene, this.camera);
    }

    // --- Cleanup ---
    dispose() {
      if (this._resizeHandler) {
        window.removeEventListener('resize', this._resizeHandler);
        this._resizeHandler = null;
      }
      if (this._onMouseMove) {
        window.removeEventListener('mousemove', this._onMouseMove);
        this._onMouseMove = null;
      }
      if (this._onMouseUp) {
        window.removeEventListener('mouseup', this._onMouseUp);
        this._onMouseUp = null;
      }
      if (this._fadeCancels) {
        this._fadeCancels.forEach(function(fn) { fn(); });
        this._fadeCancels = null;
      }
      if (this.renderer) {
        this.renderer.dispose();
        this.renderer = null;
      }
      if (this.carousel) {
        this.carousel.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        });
        this.carousel = null;
      }
      if (this.glowParticles) {
        this.glowParticles.geometry.dispose();
        this.glowParticles.material.dispose();
        this.glowParticles = null;
      }
      this.scene = null;
      this.camera = null;
    }
  }

  // --- Public API ---
  window.Product3DViewer = {
    open: async function (imageUrls) {
      if (viewerInstance) viewerInstance.close();
      viewerInstance = new Product3DViewer();
      await viewerInstance.open(imageUrls);
    },
    close: function () {
      if (viewerInstance) {
        viewerInstance.close();
        viewerInstance = null;
      }
    },
    isOpen: function () {
      return viewerInstance && viewerInstance.isOpen;
    }
  };
})();
