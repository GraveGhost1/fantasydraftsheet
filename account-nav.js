(function () {
  const USER_KEY = 'fantasy-draft-username';
  const PASS_KEY = 'fantasy-draft-password';
  const STATE_KEY = 'fantasy-draft-sheet-state';

  function session() {
    const username = (localStorage.getItem(USER_KEY) || '').trim();
    const password = localStorage.getItem(PASS_KEY) || '';
    if (!username || !password) return null;
    return { username, password };
  }

  function syncAccountNav() {
    const current = session();
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const userDisplay = document.getElementById('user-display');
    if (userDisplay) userDisplay.textContent = current ? current.username : '';
    if (loginButton) loginButton.style.display = current ? 'none' : 'inline-flex';
    if (logoutButton) logoutButton.style.display = current ? 'inline-flex' : 'none';
  }

  function showStatus(message, isError) {
    const el = document.getElementById('account-login-status');
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || '';
    el.style.color = isError ? '#e15b64' : '';
  }

  function setMode(mode) {
    const loginView = document.getElementById('account-login-view');
    const resetView = document.getElementById('account-reset-view');
    if (loginView) loginView.hidden = mode !== 'login';
    if (resetView) resetView.hidden = mode !== 'reset';
    const title = document.getElementById('account-login-title');
    if (title) title.textContent = mode === 'reset' ? 'Reset your password' : 'Account access';
  }

  function closeModal() {
    const modal = document.getElementById('account-login-modal');
    if (modal) modal.style.display = 'none';
  }

  async function submitLogin() {
    const username = document.getElementById('account-username')?.value.trim() || '';
    const password = document.getElementById('account-password')?.value.trim() || '';
    const email = document.getElementById('account-email')?.value.trim() || '';
    if (!username || !password) {
      showStatus('Enter a username and password.', true);
      return;
    }
    const button = document.getElementById('account-login-submit');
    if (button) button.disabled = true;
    try {
      const response = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Unable to access this account.');
      }
      localStorage.setItem(USER_KEY, username);
      localStorage.setItem(PASS_KEY, password);
      syncAccountNav();
      closeModal();
    } catch (error) {
      showStatus(error.message || 'Unable to access this account.', true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function submitReset() {
    const email = document.getElementById('account-reset-email')?.value.trim() || '';
    if (!email) {
      showStatus('Enter the email address associated with your account.', true);
      return;
    }
    const button = document.getElementById('account-reset-submit');
    if (button) button.disabled = true;
    try {
      const response = await fetch('/api/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Unable to request a password reset.');
      }
      setMode('login');
      showStatus(data.message || 'If an account uses that email, a reset link has been sent.', false);
    } catch (error) {
      showStatus(error.message || 'Unable to request a password reset.', true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function wireModal(modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });
    document.getElementById('account-login-cancel')?.addEventListener('click', closeModal);
    document.getElementById('account-reset-cancel')?.addEventListener('click', () => {
      showStatus('');
      setMode('login');
    });
    document.getElementById('account-forgot')?.addEventListener('click', () => {
      const email = document.getElementById('account-email')?.value.trim() || '';
      const resetEmail = document.getElementById('account-reset-email');
      if (resetEmail && email) resetEmail.value = email;
      showStatus('');
      setMode('reset');
      resetEmail?.focus();
    });
    document.getElementById('account-login-submit')?.addEventListener('click', submitLogin);
    document.getElementById('account-reset-submit')?.addEventListener('click', submitReset);
    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeModal();
      if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
        event.preventDefault();
        if (document.getElementById('account-reset-view')?.hidden) submitLogin();
        else submitReset();
      }
    });
  }

  function ensureModal() {
    let modal = document.getElementById('account-login-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'account-login-modal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'account-login-title');
    modal.innerHTML = `
      <div class="modal-content">
        <h2 id="account-login-title">Account access</h2>
        <p id="account-login-status" hidden></p>
        <div id="account-login-view">
          <p>Use your username and password. New accounts need an email for password recovery.</p>
          <input id="account-username" type="text" placeholder="Your name" maxlength="30" autocomplete="username" />
          <input id="account-password" type="password" placeholder="Password" maxlength="50" autocomplete="current-password" />
          <input id="account-email" type="email" placeholder="Email address (new accounts)" maxlength="254" autocomplete="email" />
          <button id="account-login-submit" type="button">Log in</button>
          <button id="account-forgot" class="ghost" type="button">Forgot password?</button>
          <button id="account-login-cancel" class="ghost" type="button">Cancel</button>
        </div>
        <div id="account-reset-view" hidden>
          <p>Enter your account email. If it matches an account, a reset link is sent.</p>
          <input id="account-reset-email" type="email" placeholder="Email address" maxlength="254" autocomplete="email" />
          <button id="account-reset-submit" type="button">Send reset link</button>
          <button id="account-reset-cancel" class="ghost" type="button">Back to login</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    wireModal(modal);
    return modal;
  }

  function openModal() {
    const modal = ensureModal();
    setMode('login');
    showStatus('');
    modal.style.display = 'flex';
    document.getElementById('account-username')?.focus();
  }

  function bind() {
    if (!document.getElementById('login-button') && !document.getElementById('logout-button')) return;
    document.getElementById('login-button')?.addEventListener('click', openModal);
    document.getElementById('logout-button')?.addEventListener('click', () => {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(PASS_KEY);
      localStorage.removeItem(STATE_KEY);
      syncAccountNav();
    });
    window.addEventListener('storage', (event) => {
      if (!event.key || event.key === USER_KEY || event.key === PASS_KEY) syncAccountNav();
    });
    syncAccountNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
