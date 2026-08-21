// User Menu - Navbar dropdown with instant cached display
// Uses data-i18n attributes so applyTranslations() handles translation

const USER_MENU_CACHE_KEY = 'suntrade_user_menu_cache';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    requestAnimationFrame(initUserMenu);
  });
} else {
  requestAnimationFrame(initUserMenu);
}

function getCachedUserMenu() {
  try {
    const cached = localStorage.getItem(USER_MENU_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch { return null; }
}

function setCachedUserMenu(data) {
  try {
    localStorage.setItem(USER_MENU_CACHE_KEY, JSON.stringify(data));
  } catch {}
}

function renderUserMenu(data) {
  const container = document.getElementById('user-menu-container');
  if (!container) return;

  if (data.user) {
    const avatarHtml = data.avatarUrl
      ? `<img src="${escMenuHtml(data.avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : data.initial;

    container.innerHTML = `
      <button class="user-menu-btn" onclick="toggleUserMenu()">${avatarHtml}</button>
      <div class="user-dropdown" id="user-dropdown">
        <div class="user-dropdown-header">
          <strong>${escMenuHtml(data.displayName)}</strong>
          <small>${escMenuHtml(data.email)}</small>
        </div>
        <a href="/account.html"><svg class="icon icon-sm" style="vertical-align:middle;margin-right:6px;"><use href="#icon-user"/></svg><span data-i18n="account_title">My Account</span></a>
        ${data.isAdmin ? `<a href="/admin.html"><svg class="icon icon-sm" style="vertical-align:middle;margin-right:6px;"><use href="#icon-settings"/></svg><span data-i18n="nav_admin">Admin Panel</span></a>` : ''}
        <a href="#" onclick="handleMenuLogout()"><svg class="icon icon-sm" style="vertical-align:middle;margin-right:6px;"><use href="#icon-logout"/></svg><span data-i18n="auth_logout">Logout</span></a>
      </div>
    `;
  } else {
    container.innerHTML = `
      <a href="/auth.html" class="nav-auth-link nav-auth-desktop" data-i18n="auth_signin">Sign In</a>
      <a href="/auth.html?mode=signup" class="nav-auth-link nav-auth-signup nav-auth-desktop" data-i18n="auth_signup">Register</a>
    `;
    const navLinks = document.getElementById('nav-links');
    if (navLinks && !navLinks.querySelector('.mobile-auth-item')) {
      const mobileLi = document.createElement('li');
      mobileLi.className = 'mobile-auth-item';
      mobileLi.innerHTML = `
        <a href="/auth.html" data-i18n="auth_signin">Sign In</a>
        <a href="/auth.html?mode=signup" class="mobile-register-link" data-i18n="auth_signup">Register</a>
      `;
      navLinks.appendChild(mobileLi);
    }
  }

  // applyTranslations() will automatically translate all data-i18n elements
  // including these menu items. No need to call t() manually.
  if (typeof applyTranslations === 'function') {
    applyTranslations();
  }

  // Close dropdown when clicking outside
  container.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown && !container.contains(e.target)) {
      dropdown.classList.remove('show');
    }
  });
}

async function initUserMenu() {
  const container = document.getElementById('user-menu-container');
  if (!container || typeof sb === 'undefined' || !sb) return;

  // Step 1: Show cached menu INSTANTLY
  const cached = getCachedUserMenu();
  if (cached) {
    renderUserMenu(cached);
  }

  // Step 2: Fetch fresh data in background
  try {
    const user = await getCurrentUser();
    if (!user) {
      setCachedUserMenu({ user: null });
      if (!cached) renderUserMenu({ user: null });
      return;
    }

    const profile = await getUserProfile();
    const initial = (profile?.full_name || user.email || '?')[0].toUpperCase();
    const displayName = profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
    const avatarUrl = profile?.avatar_url || user.user_metadata?.avatar_url || '';
    const isAdmin = profile?.is_admin || false;

    const freshData = { user: true, initial, displayName, email: user.email, avatarUrl, isAdmin };
    setCachedUserMenu(freshData);

    // Only re-render if data changed
    if (!cached || cached.displayName !== freshData.displayName || cached.avatarUrl !== freshData.avatarUrl || cached.isAdmin !== freshData.isAdmin) {
      renderUserMenu(freshData);
    }
  } catch (err) {
    console.warn('User menu refresh error:', err);
    if (!cached) renderUserMenu({ user: null });
  }
}

function toggleUserMenu() {
  const dropdown = document.getElementById('user-dropdown');
  if (dropdown) dropdown.classList.toggle('show');
}

async function handleMenuLogout() {
  localStorage.removeItem(USER_MENU_CACHE_KEY);
  await userSignOut();
  window.location.href = '/';
}

function escMenuHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
