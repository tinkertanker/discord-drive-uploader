/* eslint-env browser */

const messages = {
  not_authorised: 'That Google account is not authorised to manage this app.',
  oauth_cancelled: 'Google sign-in was cancelled. Try again when you are ready.',
  session_expired: 'Your admin session expired. Sign in again to continue.'
};

const message = messages[new URLSearchParams(window.location.search).get('error')];
const error = document.getElementById('auth-error');
if (message) {
  error.textContent = message;
  error.hidden = false;
}
