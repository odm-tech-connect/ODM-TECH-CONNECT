const loginPanel = document.getElementById('loginPanel');
const dashboardPanel = document.getElementById('dashboardPanel');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const dashboardMessage = document.getElementById('dashboardMessage');
const logoutBtn = document.getElementById('logoutBtn');

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || 'Une erreur est survenue.');
  }

  return data;
}

function showLogin() {
  loginPanel.classList.remove('hidden');
  dashboardPanel.classList.add('hidden');
  logoutBtn.classList.add('hidden');
}

function showDashboard() {
  loginPanel.classList.add('hidden');
  dashboardPanel.classList.remove('hidden');
  logoutBtn.classList.remove('hidden');
}

function showError(element, message) {
  element.textContent = message;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

async function loadDashboard() {
  try {
    const data = await api('/api/admin/dashboard');
    const stats = data.statistics || data;
    document.getElementById('statCompanies').textContent = stats.companies ?? 0;
    document.getElementById('statPending').textContent = stats.pendingCompanies ?? 0;
    document.getElementById('statContacts').textContent = stats.newContacts ?? 0;
    document.getElementById('statPartnerships').textContent = stats.pendingPartnerships ?? 0;

    await Promise.all([loadContacts(), loadCompanies(), loadPartnerships()]);
    dashboardMessage.textContent = '';
  } catch (error) {
    showError(dashboardMessage, error.message);
  }
}

async function loadContacts() {
  const container = document.getElementById('contactsList');
  container.replaceChildren(createElement('p', '', 'Chargement...'));

  try {
    const data = await api('/api/admin/contacts');
    container.replaceChildren();

    if (!data.contacts || data.contacts.length === 0) {
      container.append(createElement('p', '', 'Aucune demande de contact pour le moment.'));
      return;
    }

    data.contacts.forEach(contact => {
      const card = createElement('article', 'record-card');
      card.append(createElement('h3', '', contact.company_name || contact.contact_name || 'Demande de contact'));
      card.append(createElement('p', '', 'Contact : ' + (contact.contact_name || 'Non renseigné')));
      card.append(createElement('p', '', 'E-mail : ' + (contact.email || 'Non renseigné')));
      card.append(createElement('p', '', 'Pays : ' + (contact.country || 'Non renseigné')));
      card.append(createElement('p', '', 'Secteur : ' + (contact.sector || 'Non renseigné')));
      card.append(createElement('p', '', 'Message : ' + (contact.message || 'Aucun message')));
      card.append(createElement('p', '', 'Statut : ' + contact.status));

      const select = document.createElement('select');
      ['new', 'reviewing', 'answered', 'closed'].forEach(status => {
        const option = document.createElement('option');
        option.value = status;
        option.textContent = status;
        option.selected = status === contact.status;
        select.append(option);
      });

      const updateButton = createElement('button', 'secondary-btn', 'Enregistrer le statut');
      updateButton.type = 'button';
      updateButton.addEventListener('click', async () => {
        try {
          await api('/api/admin/contacts/' + encodeURIComponent(contact.id) + '/status', {
            method: 'PATCH',
            body: JSON.stringify({ status: select.value })
          });
          await loadDashboard();
        } catch (error) {
          showError(dashboardMessage, error.message);
        }
      });

      card.append(select, updateButton);
      container.append(card);
    });
  } catch (error) {
    container.replaceChildren(createElement('p', '', error.message));
  }
}

async function loadCompanies() {
  const container = document.getElementById('companiesList');
  container.replaceChildren(createElement('p', '', 'Chargement...'));

  try {
    const data = await api('/api/admin/companies');
    container.replaceChildren();

    if (!data.companies || data.companies.length === 0) {
      container.append(createElement('p', '', 'Aucune entreprise inscrite pour le moment.'));
      return;
    }

    data.companies.forEach(company => {
      const card = createElement('article', 'record-card');
      card.append(createElement('h3', '', company.name || 'Entreprise'));
      card.append(createElement('p', '', 'Pays : ' + (company.country || 'Non renseigné')));
      card.append(createElement('p', '', 'Secteur : ' + (company.sector || 'Non renseigné')));
      card.append(createElement('p', '', 'E-mail : ' + (company.email || 'Non renseigné')));
      card.append(createElement('p', '', 'Statut : ' + (company.approval_status || 'Non défini')));

      if (company.approval_status === 'pending') {
        ['approved', 'rejected'].forEach(status => {
          const button = createElement('button', 'secondary-btn', status === 'approved' ? 'Approuver' : 'Refuser');
          button.type = 'button';
          button.addEventListener('click', async () => {
            try {
              await api('/api/admin/companies/' + encodeURIComponent(company.id) + '/status', {
                method: 'PATCH',
                body: JSON.stringify({ status })
              });
              await loadDashboard();
            } catch (error) {
              showError(dashboardMessage, error.message);
            }
          });
          card.append(button);
        });
      }

      container.append(card);
    });
  } catch (error) {
    container.replaceChildren(createElement('p', '', error.message));
  }
}


async function loadPartnerships() {
  const container = document.getElementById('partnershipsList');
  container.replaceChildren(createElement('p', '', 'Chargement...'));

  try {
    const data = await api('/api/admin/partnerships');
    container.replaceChildren();

    if (!data.partnerships || data.partnerships.length === 0) {
      container.append(createElement('p', '', 'Aucune demande de partenariat pour le moment.'));
      return;
    }

    data.partnerships.forEach(partnership => {
      const card = createElement('article', 'record-card');

      card.append(createElement('h3', '',
        (partnership.sender_name || 'Entreprise expéditrice') +
        ' → ' +
        (partnership.receiver_name || 'Entreprise destinataire')
      ));

      card.append(createElement('p', '', 'Pays expéditeur : ' + (partnership.sender_country || 'Non renseigné')));
      card.append(createElement('p', '', 'Pays destinataire : ' + (partnership.receiver_country || 'Non renseigné')));
      card.append(createElement('p', '', 'Secteur expéditeur : ' + (partnership.sender_sector || 'Non renseigné')));
      card.append(createElement('p', '', 'Secteur destinataire : ' + (partnership.receiver_sector || 'Non renseigné')));
      card.append(createElement('p', '', 'Message : ' + (partnership.message || 'Aucun message')));
      card.append(createElement('p', '', 'Statut : ' + partnership.status));

      if (partnership.status === 'pending') {
        ['accepted', 'rejected'].forEach(status => {
          const button = createElement('button', 'secondary-btn',
            status === 'accepted' ? 'Accepter' : 'Refuser'
          );
          button.type = 'button';

          button.addEventListener('click', async () => {
            button.disabled = true;
            try {
              await api('/api/admin/partnerships/' + encodeURIComponent(partnership.id) + '/status', {
                method: 'PATCH',
                body: JSON.stringify({ status })
              });
              await loadDashboard();
            } catch (error) {
              button.disabled = false;
              showError(dashboardMessage, error.message);
            }
          });

          card.append(button);
        });
      }

      container.append(card);
    });
  } catch (error) {
    container.replaceChildren(createElement('p', '', error.message));
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginMessage.textContent = 'Connexion en cours...';

  const email = document.getElementById('email').value.trim();
  const passwordInput = document.getElementById('password');
  const password = passwordInput.value;

  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    passwordInput.value = '';
    showDashboard();
    await loadDashboard();
  } catch (error) {
    showError(loginMessage, error.message);
  } finally {
    passwordInput.value = '';
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    showError(dashboardMessage, error.message);
  }

  showLogin();
});

document.getElementById('refreshContacts').addEventListener('click', loadContacts);
document.getElementById('refreshCompanies').addEventListener('click', loadCompanies);
document.getElementById('refreshPartnerships').addEventListener('click', loadPartnerships);

async function checkSession() {
  try {
    await api('/api/auth/me');
    showDashboard();
    await loadDashboard();
  } catch {
    showLogin();
  }
}

checkSession();
