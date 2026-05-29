// User Menu - Navbar dropdown
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initUserMenu, 600);
});

async function initUserMenu() {
  const container = document.getElementById('user-menu-container');
  if (!container || !sb) return;

  const user = await getCurrentUser();

  if (user) {
    const profile = await getUserProfile();
    const initial = (profile?.full_name || user.email || '?')[0].toUpperCase();
    const displayName = profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
    const avatarUrl = profile?.avatar_url || user.user_metadata?.avatar_url || '';
    const avatarHtml = avatarUrl
      ? `<img src="${escMenuHtml(avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : initial;

    container.innerHTML = `
      <button class="user-menu-btn" onclick="toggleUserMenu()">${avatarHtml}</button>
      <div class="user-dropdown" id="user-dropdown">
        <div class="user-dropdown-header">
          <strong>${escMenuHtml(displayName)}</strong>
          <small>${escMenuHtml(user.email)}</small>
        </div>
        <a href="/account.html"><svg class="icon icon-sm" style="vertical-align:middle;margin-right:6px;"><use href="#icon-user"/></svg>${t('account_title') || 'My Account'}</a>
        ${profile?.is_admin ? `<a href="/admin.html"><svg class="icon icon-sm" style="vertical-align:middle;margin-right:6px;"><use href="#icon-settings"/></svg>${t('nav_admin') || 'Admin Panel'}</a>` : ''}
        <a href="#" onclick="handleMenuLogout()"><svg class="icon icon-sm" style="vertical-align:middle;margin-right:6px;"><use href="#icon-logout"/></svg>${t('auth_logout') || 'Logout'}</a>
      </div>
    `;
  } else {
    container.innerHTML = `
      <a href="/auth.html" class="nav-auth-link nav-auth-desktop" data-i18n="auth_signin">${t('auth_signin') || 'Sign In'}</a>
      <a href="/auth.html?mode=signup" class="nav-auth-link nav-auth-signup nav-auth-desktop" data-i18n="auth_signup">${t('auth_signup') || 'Register'}</a>
    `;
    // Add mobile auth link inside hamburger menu
    const navLinks = document.getElementById('nav-links');
    if (navLinks && !navLinks.querySelector('.mobile-auth-item')) {
      const mobileLi = document.createElement('li');
      mobileLi.className = 'mobile-auth-item';
      mobileLi.innerHTML = `<a href="/auth.html" data-i18n="auth_signin">${t('auth_signin') || 'Sign In'}</a>`;
      navLinks.appendChild(mobileLi);
    }
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown && !container.contains(e.target)) {
      dropdown.classList.remove('show');
    }
  });
}

function toggleUserMenu() {
  const dropdown = document.getElementById('user-dropdown');
  if (dropdown) dropdown.classList.toggle('show');
}

async function handleMenuLogout() {
  await userSignOut();
  window.location.href = '/';
}

function escMenuHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
