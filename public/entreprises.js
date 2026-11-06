'use strict';
const box = document.getElementById('message');

function message(text, type) {
  box.textContent = text;
  box.className = 'show ' + type;
}

async function send(url, data) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    credentials: 'same-origin',
    body: JSON.stringify(data)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Une erreur est survenue.');
  return result;
}

document.getElementById('registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const result = await send('/api/auth/register', data);
    message(result.message, 'success');
    event.currentTarget.reset();
  } catch (error) {
    message(error.message, 'error');
  }
});

document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    await send('/api/auth/login', data);
    location.assign('/professional');
  } catch (error) {
    message(error.message, 'error');
  }
});

(async () => {
  const params = new URLSearchParams(location.search);
  const token = params.get('token');
  if (!token) return;

  try {
    const result = await send('/api/auth/verify-email', {token});
    message(result.message, 'success');
    params.delete('token');
    history.replaceState({}, '', location.pathname + (params.toString() ? '?' + params.toString() : ''));
  } catch (error) {
    message(error.message, 'error');
  }
})();
