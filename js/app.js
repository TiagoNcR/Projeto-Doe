const views = ['login', 'register', 'dashboard', 'feed', 'donations'];
const alertArea = document.getElementById('alert-area');
let currentUserData = null;
let feedDonations = [];
let feedFilter = 'all';

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a ação.');
  return data;
}

function showAlert(message, type = 'success') {
  alertArea.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">
    ${escapeHTML(message)}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Fechar"></button>
  </div>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function navigate(view) {
  if (!views.includes(view)) return;
  if (['dashboard', 'feed', 'donations'].includes(view) && !currentUserData) view = 'login';
  views.forEach(name => {
    document.getElementById(`${name}-view`).classList.toggle('hidden', name !== view);
  });
  document.getElementById('header-feed').classList.toggle('hidden', !currentUserData);
  document.getElementById('header-donations').classList.toggle('hidden', !currentUserData);
  alertArea.innerHTML = '';
  if (view === 'dashboard') updateDashboard();
  if (view === 'feed') loadFeed();
  if (view === 'donations') loadMyDonations();
  document.title = `Projeto Doe | ${view === 'login' ? 'Login' : view === 'register' ? 'Cadastro' : view === 'dashboard' ? 'Painel' : view === 'feed' ? 'Feed' : 'Doações'}`;
  history.replaceState(null, '', view === 'login' ? '/' : `#${view}`);
}

async function updateDashboard() {
  if (!currentUserData) return navigate('login');
  document.getElementById('welcome-name').textContent = currentUserData.name.split(' ')[0];
  document.getElementById('stat-profile').textContent = currentUserData.type;
  try {
    const data = await api('/api/feed');
    const mine = data.donations.filter(item => item.ownerId === currentUserData.id);
    document.getElementById('stat-total').textContent = mine.length;
    document.getElementById('stat-available').textContent = mine.length;
  } catch {
    document.getElementById('stat-total').textContent = '0';
    document.getElementById('stat-available').textContent = '0';
  }
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function timeLabel(date) {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(date));
}

async function loadFeed() {
  try {
    const data = await api(`/api/feed?filter=${feedFilter}`);
    feedDonations = data.donations;
    document.querySelectorAll('[data-feed-filter]').forEach(button => {
      button.classList.toggle('active', button.dataset.feedFilter === feedFilter);
    });
    const uniqueOwners = [...new Map(feedDonations.map(item => [item.ownerId, item])).values()].slice(0, 10);
    document.getElementById('stories').innerHTML = uniqueOwners.length
      ? uniqueOwners.map(item => `
          <article class="story">
            <div class="story-avatar">${escapeHTML(initials(item.ownerName))}</div>
            <span>${escapeHTML(item.ownerName.split(' ')[0])}</span>
          </article>
        `).join('')
      : '<p class="muted mb-0">Seja o primeiro a publicar uma doação.</p>';

    const list = document.getElementById('feed-list');
    if (!feedDonations.length) {
      list.innerHTML = feedFilter === 'following'
        ? '<div class="empty-state">As pessoas que você segue ainda não publicaram doações.<br>Volte para “Todas” e siga um participante para acompanhar as publicações.</div>'
        : '<div class="empty-state">Ainda não há doações na comunidade.</div>';
      return;
    }
    list.innerHTML = feedDonations.map(item => `
      <article class="social-post">
        <header class="post-header">
          <div class="post-author">
            <div class="post-avatar">${escapeHTML(initials(item.ownerName))}</div>
            <div><strong>${escapeHTML(item.ownerName)}</strong><small>${escapeHTML(item.category)} · ${escapeHTML(item.size)}</small></div>
          </div>
          <div class="post-header-actions">
            ${item.ownerId !== currentUserData.id
              ? `<button class="follow-button ${item.followingOwner ? 'following' : ''}" type="button" data-follow="${escapeHTML(item.ownerId)}">${item.followingOwner ? 'Seguindo' : 'Seguir'}</button>`
              : '<span class="my-post-label">Sua publicação</span>'}
            <small>${escapeHTML(timeLabel(item.createdAt))}</small>
          </div>
        </header>
        ${item.image
          ? `<img class="post-image" src="${escapeHTML(item.image)}" alt="${escapeHTML(item.name)}">`
          : `<div class="post-placeholder"><span>👕</span><strong>${escapeHTML(item.name)}</strong></div>`}
        <div class="post-body">
          <div class="post-actions">
            <button class="like-button ${item.likedByMe ? 'liked' : ''}" type="button" data-like="${item.id}" aria-label="Curtir">
              ${item.likedByMe ? '♥' : '♡'} <span>${item.likes.length}</span>
            </button>
            <span class="comment-count">💬 ${item.comments.length}</span>
          </div>
          <p class="post-caption"><strong>${escapeHTML(item.ownerName)}</strong> está doando ${escapeHTML(item.name)}.</p>
          <p class="post-details">Tamanho ${escapeHTML(item.size)} · Condição: ${escapeHTML(item.condition)}</p>
          ${item.description ? `<p class="post-description">${escapeHTML(item.description)}</p>` : ''}
          <div class="comments">
            ${item.comments.slice(-3).map(comment => `<p><strong>${escapeHTML(comment.name)}</strong> ${escapeHTML(comment.text)}</p>`).join('')}
          </div>
          <form class="comment-form" data-comment="${item.id}">
            <input type="text" maxlength="180" placeholder="Adicionar um comentário..." aria-label="Comentário">
            <button type="submit">Enviar</button>
          </form>
        </div>
      </article>
    `).join('');
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

async function loadMyDonations() {
  const list = document.getElementById('donation-list');
  try {
    const data = await api('/api/feed');
    const mine = data.donations.filter(item => item.ownerId === currentUserData.id);
    if (!mine.length) {
      list.innerHTML = '<div class="empty-state">Você ainda não cadastrou uma doação.</div>';
      return;
    }
    list.innerHTML = mine.map(item => `
      <article class="donation-item">
        ${item.image ? `<img class="donation-thumb" src="${escapeHTML(item.image)}" alt="${escapeHTML(item.name)}">` : '<div class="donation-thumb-placeholder">👕</div>'}
        <div class="donation-details">
          <h3>${escapeHTML(item.name)}</h3>
          <p>${escapeHTML(item.category)} · Tamanho ${escapeHTML(item.size)} · ${escapeHTML(item.condition)}</p>
          ${item.description ? `<p>${escapeHTML(item.description)}</p>` : ''}
          <small>${item.likes.length} curtida(s) · ${item.comments.length} comentário(s)</small>
        </div>
        <button class="delete-button" type="button" data-delete="${item.id}">Excluir</button>
      </article>
    `).join('');
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

document.addEventListener('click', async event => {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) {
    event.preventEvent?.();
    navigate(viewButton.dataset.view);
  }

  const deleteButton = event.target.closest('[data-delete]');
  if (deleteButton) {
    try {
      await api(`/api/donations/${deleteButton.dataset.delete}`, { method: 'DELETE' });
      await loadMyDonations();
      await updateDashboard();
      showAlert('Doação excluída com sucesso.');
    } catch (error) {
      showAlert(error.message, 'danger');
    }
  }

  const likeButton = event.target.closest('[data-like]');
  if (likeButton) {
    try {
      await api(`/api/donations/${likeButton.dataset.like}/like`, { method: 'POST' });
      await loadFeed();
    } catch (error) {
      showAlert(error.message, 'danger');
    }
  }

  const followButton = event.target.closest('[data-follow]');
  if (followButton) {
    try {
      const { following } = await api(`/api/users/${followButton.dataset.follow}/follow`, { method: 'POST' });
      await loadFeed();
      showAlert(following
        ? 'Agora você está seguindo este participante.'
        : 'Você deixou de seguir este participante.');
    } catch (error) {
      showAlert(error.message, 'danger');
    }
  }

  const filterButton = event.target.closest('[data-feed-filter]');
  if (filterButton) {
    feedFilter = filterButton.dataset.feedFilter;
    await loadFeed();
  }
});

document.addEventListener('submit', async event => {
  if (event.target.matches('.comment-form')) {
    event.preventDefault();
    const input = event.target.querySelector('input');
    try {
      await api(`/api/donations/${event.target.dataset.comment}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text: input.value })
      });
      await loadFeed();
    } catch (error) {
      showAlert(error.message, 'danger');
    }
  }
});

document.getElementById('register-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('register-name').value,
        email: document.getElementById('register-email').value,
        type: document.getElementById('register-type').value,
        password: document.getElementById('register-password').value
      })
    });
    currentUserData = data.user;
    event.target.reset();
    navigate('feed');
    showAlert('Conta criada! Bem-vindo ao Projeto Doe.');
  } catch (error) {
    showAlert(error.message, 'danger');
  }
});

document.getElementById('login-form').addEventListener('submit', async event => {
  event.preventEvent?.();
  event.preventDefault();
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('login-email').value,
        password: document.getElementById('login-password').value
      })
    });
    currentUserData = data.user;
    event.target.reset();
    navigate('feed');
    showAlert('Login realizado com sucesso!');
  } catch (error) {
    showAlert(error.message, 'danger');
  }
});

document.getElementById('item-image').addEventListener('change', event => {
  const file = event.target.files[0];
  const preview = document.getElementById('image-preview');
  if (!file) {
    preview.classList.add('hidden');
    preview.innerHTML = '';
    return;
  }
  if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
    showAlert('Selecione uma imagem com até 5 MB.', 'warning');
    event.target.value = '';
    preview.classList.add('hidden');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    preview.innerHTML = `<img src="${escapeHTML(reader.result)}" alt="Prévia da roupa">`;
    preview.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

document.getElementById('donation-form').addEventListener('submit', async event => {
  event.preventDefault();
  const file = document.getElementById('item-image').files[0];
  const readImage = file ? new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  }) : Promise.resolve('');

  try {
    const image = await readImage;
    await api('/api/donations', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('item-name').value,
        category: document.getElementById('item-category').value,
        size: document.getElementById('item-size').value,
        condition: document.getElementById('item-condition').value,
        description: document.getElementById('item-description').value,
        image
      })
    });
    event.target.reset();
    document.getElementById('image-preview').classList.add('hidden');
    document.getElementById('image-preview').innerHTML = '';
    await loadMyDonations();
    await updateDashboard();
    showAlert('Doação publicada no feed com sucesso!');
  } catch (error) {
    showAlert(error.message, 'danger');
  }
});

document.getElementById('logout-button').addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    showAlert(error.message, 'danger');
  }
  currentUserData = null;
  navigate('login');
});

async function initialize() {
  try {
    const data = await api('/api/me');
    currentUserData = data.user;
  } catch {
    currentUserData = null;
  }
  const requestedView = location.hash.slice(1);
  navigate(currentUserData && views.includes(requestedView) ? requestedView : currentUserData ? 'feed' : 'login');
}

initialize();
