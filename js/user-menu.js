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
    const displayName = profile?.full_name || user.email?.split('@')[0] || 'User';

    container.innerHTML = `
      <button class="user-menu-btn" onclick="toggleUserMenu()">${initial}</button>
      <div class="user-dropdown" id="user-dropdown">
        <div class="user-dropdown-header">
          <strong>${escMenuHtml(displayName)}</strong>
          <small>${escMenuHtml(user.email)}</small>
        </div>
        <a href="/account.html">👤 ${t('account_title') || 'My Account'}</a>
        ${profile?.is_admin ? `<a href="/admin.html">⚙️ ${t('nav_admin') || 'Admin Panel'}</a>` : ''}
        <a href="#" onclick="handleMenuLogout()">🚪 ${t('auth_logout') || 'Logout'}</a>
      </div>
    `;
  } else {
    container.innerHTML = `
      <a href="/auth.html" class="nav-auth-link" data-i18n="auth_signin">${t('auth_signin') || 'Sign In'}</a>
      <a href="/auth.html?mode=signup" class="nav-auth-link nav-auth-signup" data-i18n="auth_signup">${t('auth_signup') || 'Register'}</a>
    `;
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
