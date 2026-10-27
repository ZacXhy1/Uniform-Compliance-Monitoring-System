/* ==========================================================================
   Login — page logic
   Owner: Earl (Phase 1)
   No sidebar/header on this screen — it is the entry point before the app
   shell applies. Demo-level validation only; see js/auth.js for the actual
   login() / requireAuth() logic shared across the app.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const errorBox = document.getElementById('loginError');

  const passwordToggle = document.getElementById('passwordToggle');
  const eyeOpen = document.getElementById('eyeOpen');
  const eyeOff = document.getElementById('eyeOff');

  // Start with the open eye visible, crossed-out eye hidden
  eyeOpen.style.display = 'block';
  eyeOff.style.display = 'none';

  // Only show the eye icon once something has been typed
  passwordInput.addEventListener('input', () => {
    const hasText = passwordInput.value.length > 0;
    passwordToggle.classList.toggle('is-visible', hasText);

    // If the field is emptied, reset back to hidden-password state
    if (!hasText) {
      passwordInput.type = 'password';
      eyeOpen.style.display = 'block';
      eyeOff.style.display = 'none';
      passwordToggle.setAttribute('aria-label', 'Show password');
    }
  });

  // Show / hide password
  passwordToggle.addEventListener('click', () => {
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    eyeOpen.style.display = isHidden ? 'none' : 'block';
    eyeOff.style.display = isHidden ? 'block' : 'none';
    passwordToggle.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
  });

  // Login submit
  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      showError('Enter both a username and password.');
      return;
    }

    if (login(username, password)) {
      window.location.href = 'dashboard.html';
    } else {
      showError('Incorrect username or password.');
    }
  });

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }
});