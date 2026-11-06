
const notice = document.getElementById('notice');

async function api(url, options = {}) {
  const response = await fetch('/api/professional' + url, {
    credentials: 'same-origin',
    headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Erreur de communication avec le serveur.');
  return data;
}

function showError(error) {
  notice.textContent = error.message;
}

async function loadAll() {
  try {
    const profile = await api('/profile');
    const c = profile.company;
    document.getElementById('profile').innerHTML =
      '<strong>' + escapeHtml(c.name) + '</strong><p>' +
      escapeHtml(c.country || '') + ' · ' + escapeHtml(c.sector || '') +
      '</p><p class="muted">' + escapeHtml(c.description || 'Aucune description.') + '</p>';

    const products = await api('/products');
    document.getElementById('products').innerHTML = products.products.length
      ? products.products.map(p => '<div class="item"><strong>' + escapeHtml(p.name) +
        '</strong><p>' + escapeHtml(p.category) + ' · ' + escapeHtml(p.status) +
        '</p><p class="muted">' + escapeHtml(p.description) + '</p></div>').join('')
      : '<p class="muted">Aucun produit enregistré.</p>';

    const partnerships = await api('/partnerships');
    document.getElementById('partnerships').innerHTML = partnerships.partnerships.length
      ? partnerships.partnerships.map(p => {
        const incoming = Number(p.receiver_company_id) === Number(c.id);
        return '<div class="item"><strong>' + escapeHtml(incoming ? p.sender_name : p.receiver_name) +
          '</strong><p>' + escapeHtml(p.message) + '</p><p class="muted">Statut : ' +
          escapeHtml(p.status) + '</p>' +
          (incoming && p.status === 'pending'
            ? '<button data-respond="' + p.id + '" data-status="accepted">Accepter</button> ' +
              '<button data-respond="' + p.id + '" data-status="rejected">Refuser</button>' : '') +
          '</div>';
      }).join('')
      : '<p class="muted">Aucune demande de partenariat.</p>';

    const quotes = await api('/quotes');
    document.getElementById('quotes').innerHTML = quotes.quotes.length
      ? quotes.quotes.map(q => '<div class="item"><strong>' +
        escapeHtml(q.product_name || 'Demande générale') + '</strong><p>' +
        escapeHtml(q.message) + '</p><p class="muted">' +
        escapeHtml(q.buyer_name) + ' → ' + escapeHtml(q.seller_name) +
        ' · ' + escapeHtml(q.status) + '</p></div>').join('')
      : '<p class="muted">Aucune demande de devis.</p>';
  } catch (error) {
    showError(error);
    document.getElementById('profile').textContent =
      'Connectez-vous avec un compte entreprise vérifié et approuvé pour accéder à cet espace.';
  }
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

document.getElementById('product-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const data = Object.fromEntries(form.entries());
  if (data.price === '') data.price = null;
  else data.price = Number(data.price);
  try {
    await api('/products', { method: 'POST', body: JSON.stringify(data) });
    notice.textContent = 'Produit ajouté au catalogue.';
    event.currentTarget.reset();
    await loadAll();
  } catch (error) { showError(error); }
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-respond]');
  if (!button) return;
  try {
    await api('/partnerships/' + encodeURIComponent(button.dataset.respond) + '/respond', {
      method: 'PATCH',
      body: JSON.stringify({ status: button.dataset.status })
    });
    notice.textContent = 'Réponse enregistrée.';
    await loadAll();
  } catch (error) { showError(error); }
});

loadAll();
