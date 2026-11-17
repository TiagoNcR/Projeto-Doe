const views = ['login', 'register', 'dashboard', 'feed', 'messages', 'donations'];
const alertArea = document.getElementById('alert-area');
let currentUserData = null;
let feedItems = [];
let feedFilter = 'all';
let conversationContacts = [];
let activeConversationId = null;
let messageRefreshTimer = null;

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

async function logoutUser() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
    currentUserData = null;
    navigate('login');
    showAlert('Você saiu da sua conta.');
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

function navigate(view) {
  if (!views.includes(view)) return;
  if (['dashboard', 'feed', 'messages', 'donations'].includes(view) && !currentUserData) view = 'login';
  if (messageRefreshTimer) {
    clearInterval(messageRefreshTimer);
    messageRefreshTimer = null;
  }
  views.forEach(name => {
    document.getElementById(`${name}-view`).classList.toggle('hidden', name !== view);
  });
  document.getElementById('header-dashboard').classList.toggle('hidden', !currentUserData);
  document.getElementById('header-feed').classList.toggle('hidden', !currentUserData);
  document.getElementById('header-donations').classList.toggle('hidden', !currentUserData);
  document.getElementById('header-messages').classList.toggle('hidden', !currentUserData);
  document.getElementById('header-logout').classList.toggle('hidden', !currentUserData);
  renderProfileAvatar();
  alertArea.innerHTML = '';
  if (view === 'dashboard') updateDashboard();
  if (view === 'feed') loadFeed();
  if (view === 'messages') {
    loadConversations(activeConversationId);
    messageRefreshTimer = setInterval(refreshChat, 4000);
  }
  if (view === 'donations') loadMyDonations();
  document.title = `Projeto Doe | ${view === 'login' ? 'Login' : view === 'register' ? 'Cadastro' : view === 'dashboard' ? 'Painel' : view === 'feed' ? 'Feed' : view === 'messages' ? 'Mensagens' : 'Doações'}`;
  history.replaceState(null, '', view === 'login' ? '/' : `#${view}`);
}

async function updateDashboard() {
  if (!currentUserData) return navigate('login');
  document.getElementById('welcome-name').textContent = currentUserData.name.split(' ')[0];
  document.getElementById('stat-profile').textContent = currentUserData.type;
  try {
    const data = await api('/api/feed');
    const mine = data.items.filter(item => item.kind === 'donation' && item.ownerId === currentUserData.id);
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

function avatarMarkup(name, avatarUrl, className) {
  const content = avatarUrl
    ? `<img src="${escapeHTML(avatarUrl)}" alt="">`
    : escapeHTML(initials(name));
  return `<div class="${className}" role="img" aria-label="Foto de perfil de ${escapeHTML(name)}">${content}</div>`;
}

function renderProfileAvatar() {
  const button = document.getElementById('profile-avatar-button');
  const initialsElement = document.getElementById('profile-avatar-initials');
  const image = document.getElementById('profile-avatar-image');
  const isLoggedIn = Boolean(currentUserData);

  button.classList.toggle('hidden', !isLoggedIn);
  if (!isLoggedIn) {
    image.removeAttribute('src');
    return;
  }

  const avatarUrl = currentUserData.avatarUrl || '';
  initialsElement.textContent = initials(currentUserData.name);
  initialsElement.classList.toggle('hidden', Boolean(avatarUrl));
  image.classList.toggle('hidden', !avatarUrl);
  if (avatarUrl) image.src = avatarUrl;
  else image.removeAttribute('src');
  button.title = `Alterar foto de ${currentUserData.name}`;
  button.setAttribute('aria-label', `Alterar foto de perfil de ${currentUserData.name}`);
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
    feedItems = data.items;
    document.querySelectorAll('[data-feed-filter]').forEach(button => {
      button.classList.toggle('active', button.dataset.feedFilter === feedFilter);
    });
    const uniqueOwners = [...new Map(feedItems.map(item => [item.ownerId, item])).values()].slice(0, 10);
    document.getElementById('stories').innerHTML = uniqueOwners.length
      ? uniqueOwners.map(item => `
          <article class="story">
            ${avatarMarkup(item.ownerName, item.ownerAvatarUrl, 'story-avatar')}
            <span>${escapeHTML(item.ownerName.split(' ')[0])}</span>
          </article>
        `).join('')
      : '<p class="muted mb-0">Seja o primeiro a compartilhar algo com a comunidade.</p>';

    const list = document.getElementById('feed-list');
    if (!feedItems.length) {
      list.innerHTML = feedFilter === 'following'
        ? '<div class="empty-state">As pessoas que você segue ainda não publicaram.<br>Volte para “Todas” e siga um participante para acompanhar as publicações.</div>'
        : '<div class="empty-state">Ainda não há publicações na comunidade.</div>';
      return;
    }
    list.innerHTML = feedItems.map(item => {
      const isDonation = item.kind === 'donation';
      const collection = isDonation ? 'donations' : 'posts';
      const publicationText = isDonation
        ? `<p class="post-caption"><strong>${escapeHTML(item.ownerName)}</strong> está doando ${escapeHTML(item.name)}.</p>
           <p class="post-details">Tamanho ${escapeHTML(item.size)} · Condição: ${escapeHTML(item.condition)}</p>
           ${item.description ? `<p class="post-description">${escapeHTML(item.description)}</p>` : ''}`
        : `<p class="post-caption"><strong>${escapeHTML(item.ownerName)}</strong></p>
           <p class="post-text">${escapeHTML(item.text)}</p>`;
      return `
      <article class="social-post ${isDonation ? 'donation-post' : 'community-post'}">
        <header class="post-header">
          <div class="post-author">
            ${avatarMarkup(item.ownerName, item.ownerAvatarUrl, 'post-avatar')}
            <div><strong>${escapeHTML(item.ownerName)}</strong><small>${isDonation ? `${escapeHTML(item.category)} · ${escapeHTML(item.size)}` : 'Publicação da comunidade'}</small></div>
          </div>
          <div class="post-header-actions">
            ${item.ownerId !== currentUserData.id
              ? `<button class="message-button" type="button" data-message-user="${escapeHTML(item.ownerId)}">Mensagem</button><button class="follow-button ${item.followingOwner ? 'following' : ''}" type="button" data-follow="${escapeHTML(item.ownerId)}">${item.followingOwner ? 'Seguindo' : 'Seguir'}</button>`
              : '<span class="my-post-label">Sua publicação</span>'}
            <small>${escapeHTML(timeLabel(item.createdAt))}</small>
          </div>
        </header>
        ${item.image
          ? `<img class="post-image" src="${escapeHTML(item.image)}" alt="${escapeHTML(isDonation ? item.name : `Publicação de ${item.ownerName}`)}">`
          : isDonation ? `<div class="post-placeholder"><span>👕</span><strong>${escapeHTML(item.name)}</strong></div>` : ''}
        <div class="post-body">
          <div class="post-actions">
            <button class="like-button ${item.likedByMe ? 'liked' : ''}" type="button" data-like="${item.id}" data-kind="${item.kind}" aria-label="Curtir">
              ${item.likedByMe ? '♥' : '♡'} <span>${item.likes.length}</span>
            </button>
            <span class="comment-count">💬 ${item.comments.length}</span>
          </div>
          ${publicationText}
          <div class="comments">
            ${item.comments.slice(-3).map(comment => `<p><strong>${escapeHTML(comment.name)}</strong> ${escapeHTML(comment.text)}</p>`).join('')}
          </div>
          <form class="comment-form" data-comment="${item.id}" data-kind="${item.kind}">
            <input type="text" maxlength="180" placeholder="Adicionar um comentário..." aria-label="Comentário">
            <button type="submit">Enviar</button>
          </form>
          ${!isDonation && item.ownerId === currentUserData.id
            ? `<button class="delete-button mt-2" type="button" data-delete="${item.id}" data-kind="${collection}">Excluir publicação</button>`
            : ''}
        </div>
      </article>
    `;
    }).join('');
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

async function loadMyDonations() {
  const list = document.getElementById('donation-list');
  try {
    const data = await api('/api/feed');
    const mine = data.items.filter(item => item.kind === 'donation' && item.ownerId === currentUserData.id);
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
        <button class="delete-button" type="button" data-delete="${item.id}" data-kind="donations">Excluir</button>
      </article>
    `).join('');
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

function renderConversationList() {
  const list = document.getElementById('conversation-list');
  const scrollTop = list.scrollTop;
  if (!conversationContacts.length) {
    list.innerHTML = '<p class="muted conversation-empty">Ainda não há outros participantes cadastrados.</p>';
    return;
  }
  list.innerHTML = conversationContacts.map(contact => {
    const preview = contact.lastMessage
      ? `${contact.lastMessageFromMe ? 'Você: ' : ''}${contact.lastMessage}`
      : 'Clique para iniciar uma conversa';
    return `
      <button class="conversation-button ${contact.id === activeConversationId ? 'active' : ''}" type="button" data-chat-user="${escapeHTML(contact.id)}">
        ${avatarMarkup(contact.name, contact.avatarUrl, 'conversation-avatar')}
        <span class="conversation-summary">
          <strong>${escapeHTML(contact.name)}</strong>
          <small>${escapeHTML(preview)}</small>
        </span>
        ${contact.lastMessageAt ? `<time>${escapeHTML(timeLabel(contact.lastMessageAt))}</time>` : ''}
      </button>
    `;
  }).join('');
  list.scrollTop = scrollTop;
}

async function loadConversationMessages(contactId) {
  if (!contactId || contactId !== activeConversationId) return;
  try {
    const data = await api(`/api/conversations/${contactId}/messages`);
    if (contactId !== activeConversationId) return;
    const history = document.getElementById('chat-history');
    const isNewConversation = history.dataset.conversationId !== contactId;
    const wasNearBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 80;
    history.innerHTML = data.messages.length
      ? data.messages.map(message => `
          <article class="message-bubble ${message.senderId === currentUserData.id ? 'mine' : ''}">
            <p>${escapeHTML(message.text)}</p>
            <time>${escapeHTML(timeLabel(message.createdAt))}</time>
          </article>
        `).join('')
      : '<p class="chat-empty">Ainda não há mensagens. Envie a primeira!</p>';
    history.dataset.conversationId = contactId;
    if (isNewConversation || wasNearBottom) history.scrollTop = history.scrollHeight;
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

async function loadConversations(selectedId = activeConversationId) {
  try {
    const data = await api('/api/conversations');
    conversationContacts = data.conversations;
    activeConversationId = conversationContacts.some(contact => contact.id === selectedId) ? selectedId : null;
    renderConversationList();

    const contact = conversationContacts.find(item => item.id === activeConversationId);
    document.getElementById('chat-placeholder').classList.toggle('hidden', Boolean(contact));
    document.getElementById('active-chat').classList.toggle('hidden', !contact);
    if (contact) {
      document.getElementById('chat-title').textContent = contact.name;
      await loadConversationMessages(contact.id);
    }
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

async function refreshChat() {
  if (document.getElementById('messages-view').classList.contains('hidden')) return;
  await loadConversations(activeConversationId);
}

function resetPostComposer() {
  const form = document.getElementById('post-form');
  form.reset();
  form.classList.add('hidden');
  const preview = document.getElementById('post-image-preview');
  preview.classList.add('hidden');
  preview.innerHTML = '';
}

document.addEventListener('click', async event => {
  const logoutButton = event.target.closest('[data-logout]');
  if (logoutButton) {
    await logoutUser();
  }

  const viewButton = event.target.closest('[data-view]');
  if (viewButton) {
    event.preventEvent?.();
    navigate(viewButton.dataset.view);
  }

  if (event.target.closest('#show-post-form')) {
    document.getElementById('post-form').classList.remove('hidden');
    document.getElementById('post-content').focus();
  }
  if (event.target.closest('#cancel-post')) resetPostComposer();

  const messageButton = event.target.closest('[data-message-user]');
  if (messageButton) {
    activeConversationId = messageButton.dataset.messageUser;
    navigate('messages');
  }

  const conversationButton = event.target.closest('[data-chat-user]');
  if (conversationButton) {
    await loadConversations(conversationButton.dataset.chatUser);
  }

  const deleteButton = event.target.closest('[data-delete]');
  if (deleteButton) {
    try {
      const collection = deleteButton.dataset.kind || 'donations';
      await api(`/api/${collection}/${deleteButton.dataset.delete}`, { method: 'DELETE' });
      if (collection === 'posts') {
        await loadFeed();
        showAlert('Publicação excluída com sucesso.');
      } else {
        await loadMyDonations();
        await updateDashboard();
        showAlert('Doação excluída com sucesso.');
      }
    } catch (error) {
      showAlert(error.message, 'danger');
    }
  }

  const likeButton = event.target.closest('[data-like]');
  if (likeButton) {
    try {
      const collection = likeButton.dataset.kind === 'post' ? 'posts' : 'donations';
      await api(`/api/${collection}/${likeButton.dataset.like}/like`, { method: 'POST' });
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
      const collection = event.target.dataset.kind === 'post' ? 'posts' : 'donations';
      await api(`/api/${collection}/${event.target.dataset.comment}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text: input.value })
      });
      await loadFeed();
    } catch (error) {
      showAlert(error.message, 'danger');
    }
  }

  if (event.target.matches('#post-form')) {
    event.preventDefault();
    const file = document.getElementById('post-image').files[0];
    try {
      await api('/api/posts', {
        method: 'POST',
        body: JSON.stringify({
          text: document.getElementById('post-content').value,
          image: await readImage(file)
        })
      });
      resetPostComposer();
      feedFilter = 'all';
      await loadFeed();
      showAlert('Publicação compartilhada com a comunidade.');
    } catch (error) {
      showAlert(error.message, 'danger');
    }
  }

  if (event.target.matches('.chat-form')) {
    event.preventDefault();
    const input = document.getElementById('chat-input');
    try {
      await api(`/api/conversations/${activeConversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: input.value })
      });
      input.value = '';
      await loadConversations(activeConversationId);
      input.focus();
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

function previewImage(event, previewId) {
  const file = event.target.files[0];
  const preview = document.getElementById(previewId);
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
    preview.innerHTML = `<img src="${escapeHTML(reader.result)}" alt="Prévia da imagem">`;
    preview.classList.remove('hidden');
  };
  reader.onerror = () => showAlert('Não foi possível carregar a imagem.', 'danger');
  reader.readAsDataURL(file);
}

function readImage(file) {
  if (!file) return Promise.resolve('');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível carregar a imagem.'));
    reader.readAsDataURL(file);
  });
}

document.getElementById('profile-avatar-button').addEventListener('click', () => {
  document.getElementById('profile-avatar-input').click();
});

document.getElementById('profile-avatar-input').addEventListener('change', async event => {
  const input = event.currentTarget;
  const file = input.files[0];
  if (!file) return;

  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowedTypes.includes(file.type) || file.size > 2 * 1024 * 1024) {
    showAlert('Escolha uma foto PNG, JPG ou WebP de até 2 MB.', 'warning');
    input.value = '';
    return;
  }

  try {
    const data = await api('/api/auth/avatar', {
      method: 'PUT',
      body: JSON.stringify({ image: await readImage(file) })
    });
    currentUserData = data.user;
    renderProfileAvatar();
    if (!document.getElementById('feed-view').classList.contains('hidden')) await loadFeed();
    if (!document.getElementById('messages-view').classList.contains('hidden')) {
      await loadConversations(activeConversationId);
    }
    showAlert('Foto de perfil atualizada.');
  } catch (error) {
    showAlert(error.message, 'danger');
  } finally {
    input.value = '';
  }
});

document.getElementById('item-image').addEventListener('change', event => {
  previewImage(event, 'image-preview');
});

document.getElementById('post-image').addEventListener('change', event => {
  previewImage(event, 'post-image-preview');
});

document.getElementById('donation-form').addEventListener('submit', async event => {
  event.preventDefault();
  const file = document.getElementById('item-image').files[0];

  try {
    const image = await readImage(file);
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
