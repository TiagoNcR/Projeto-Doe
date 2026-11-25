const views = ['login', 'register', 'dashboard', 'feed', 'calendar', 'messages', 'donations', 'profile', 'notifications'];
const organizerRole = 'Instituição/Organizador';
const alertArea = document.getElementById('alert-area');
let currentUserData = null;
let feedItems = [];
let feedFilter = 'all';
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calendarEvents = [];
let calendarSelectedDate = '';
let conversationContacts = [];
let activeConversationId = null;
let messageRefreshTimer = null;
let notificationRefreshTimer = null;
let notificationRefreshInProgress = false;
let profileUserId = null;
let profileFilter = 'all';
let profileItems = [];

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
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
}

async function logoutUser() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
    currentUserData = null;
    profileUserId = null;
    activeConversationId = null;
    navigate('login', { history: 'replace' });
    showAlert('Você saiu da sua conta.');
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

// Endereço de cada tela; a conversa aberta tem endereço próprio para o "voltar" levar à lista.
let currentView = null;

function routeFor(view) {
  if (view === 'login') return '/';
  if (view === 'profile') return `#profile/${encodeURIComponent(profileUserId)}`;
  if (view === 'messages' && activeConversationId) return `#messages/${encodeURIComponent(activeConversationId)}`;
  return `#${view}`;
}

function currentRoute() {
  return location.hash || '/';
}

// mode: 'push' cria uma entrada no histórico, 'replace' atualiza a atual, 'none' (vindo do "voltar") não mexe
function updateHistory(mode, state = {}) {
  if (mode === 'none') return;
  const url = routeFor(currentView);
  if (mode === 'push' && url !== currentRoute()) history.pushState({ app: true, ...state }, '', url);
  else history.replaceState({ ...(history.state || {}), app: true, ...state }, '', url);
}

// No computador lista e conversa aparecem lado a lado; no celular, uma de cada vez
function chatShowsBothPanes() {
  return window.matchMedia('(min-width: 37.5625em)').matches;
}

function navigate(view, { history: historyMode = 'push', historyState } = {}) {
  if (!views.includes(view)) return;
  if (['dashboard', 'feed', 'calendar', 'messages', 'donations', 'profile', 'notifications'].includes(view) && !currentUserData) view = 'login';
  currentView = view;
  if (view === 'profile' && !profileUserId) profileUserId = currentUserData.id;
  if (messageRefreshTimer) {
    clearInterval(messageRefreshTimer);
    messageRefreshTimer = null;
  }
  if (notificationRefreshTimer) {
    clearInterval(notificationRefreshTimer);
    notificationRefreshTimer = null;
  }
  document.body.classList.remove('chat-open');
  views.forEach(name => {
    document.getElementById(`${name}-view`).classList.toggle('hidden', name !== view);
  });
  document.getElementById('header-dashboard').classList.toggle('hidden', !currentUserData);
  document.getElementById('header-feed').classList.toggle('hidden', !currentUserData);
  document.getElementById('header-calendar').classList.toggle('hidden', !currentUserData);
  document.getElementById('header-donations').classList.toggle('hidden', !currentUserData);
  document.getElementById('header-messages').classList.toggle('hidden', !currentUserData);
  document.getElementById('header-logout').classList.toggle('hidden', !currentUserData);
  document.body.classList.toggle('is-authenticated', Boolean(currentUserData));
  document.querySelectorAll('.header-actions [data-view], .guest-actions [data-view]').forEach(button => {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  renderProfileAvatar();
  if (currentUserData) {
    if (view !== 'messages') refreshNotifications();
    notificationRefreshTimer = setInterval(refreshNotifications, 10000);
  } else {
    renderNotificationCount(0);
  }
  alertArea.innerHTML = '';
  if (view === 'dashboard') updateDashboard();
  if (view === 'feed') {
    loadFeed();
    loadCalendarMonth();
  }
  if (view === 'calendar') loadCalendarMonth();
  if (view === 'messages') {
    if (activeConversationId) showConversationShell(activeConversationId);
    loadConversations(activeConversationId, { autoSelectUnread: chatShowsBothPanes() });
    messageRefreshTimer = setInterval(refreshChat, 4000);
  }
  if (view === 'donations') loadMyDonations();
  if (view === 'notifications') loadNotifications();
  if (view === 'profile') {
    profileFilter = 'all';
    closeProfileEdit();
    loadProfile();
  }
  document.title = `Projeto Doe | ${view === 'login' ? 'Login' : view === 'register' ? 'Cadastro' : view === 'dashboard' ? 'Painel' : view === 'feed' ? 'Feed' : view === 'calendar' ? 'Calendário' : view === 'messages' ? 'Mensagens' : view === 'profile' ? 'Perfil' : view === 'notifications' ? 'Notificações' : 'Doações'}`;
  updateHistory(historyMode, historyState);
}

// Mostra a tela correspondente a um endereço (ao abrir o site ou ao usar o "voltar"/"avançar")
function applyRoute(hash, historyMode) {
  const [name, rawParam] = hash.replace(/^#/, '').split('/');
  const param = rawParam ? decodeURIComponent(rawParam) : '';
  // Sem login, qualquer endereço vira a tela de login (ou cadastro), e o endereço é corrigido
  if (!currentUserData) {
    return navigate(name === 'register' ? 'register' : 'login', { history: historyMode === 'none' ? 'replace' : historyMode });
  }
  if (name === 'profile' && param) {
    profileUserId = param;
    return navigate('profile', { history: historyMode });
  }
  if (name === 'messages') {
    activeConversationId = param || null;
    pendingConversationName = '';
    return navigate('messages', { history: historyMode });
  }
  return navigate(views.includes(name) && !['login', 'register'].includes(name) ? name : 'feed', { history: historyMode });
}

window.addEventListener('popstate', () => applyRoute(location.hash, 'none'));

// Nome já conhecido de quem vai ter a conversa aberta, para o cabeçalho aparecer antes da resposta do servidor
let pendingConversationName = '';

function openConversation(userId, name = '') {
  activeConversationId = userId;
  pendingConversationName = name || '';
  navigate('messages');
}

// Mostra a conversa na hora (cabeçalho e "Carregando…"), sem passar pela lista de conversas;
// loadConversations() completa com as mensagens quando a resposta chegar.
function showConversationShell(userId) {
  const contact = conversationContacts.find(item => item.id === userId);
  document.getElementById('chat-placeholder').classList.add('hidden');
  document.getElementById('active-chat').classList.remove('hidden');
  document.querySelector('.chat-layout').classList.add('has-active-chat');
  document.body.classList.add('chat-open');
  document.getElementById('chat-title').textContent = contact?.name || pendingConversationName || 'Conversa';
  const history = document.getElementById('chat-history');
  if (history.dataset.conversationId !== userId) {
    history.innerHTML = '<p class="chat-empty">Carregando mensagens…</p>';
    delete history.dataset.conversationId;
  }
}

function openProfile(userId) {
  profileUserId = userId;
  navigate('profile');
  window.scrollTo(0, 0);
}

function openProfileEdit() {
  const typeSelect = document.getElementById('profile-edit-type');
  // As opções de tipo vêm do formulário de cadastro, para não duplicar a lista
  if (!typeSelect.options.length) {
    for (const option of document.getElementById('register-type').options) typeSelect.add(new Option(option.text, option.value));
  }
  document.getElementById('profile-edit-name').value = currentUserData.name;
  typeSelect.value = currentUserData.type;
  document.getElementById('password-form').reset();
  document.getElementById('profile-edit').classList.remove('hidden');
  document.getElementById('profile-edit-name').focus();
}

function closeProfileEdit() {
  document.getElementById('profile-edit').classList.add('hidden');
}

function memberSinceLabel(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return `Membro desde ${date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;
}

function countLabel(count, singular, plural) {
  return `<li><strong>${count}</strong> ${count === 1 ? singular : plural}</li>`;
}

async function loadProfile() {
  const requestedId = profileUserId;
  try {
    const data = await api(`/api/users/${encodeURIComponent(requestedId)}/profile`);
    if (requestedId !== profileUserId || document.getElementById('profile-view').classList.contains('hidden')) return;
    const { profile, stats } = data;
    profileItems = data.items;
    document.title = `Projeto Doe | ${profile.name}`;
    document.getElementById('profile-avatar-slot').innerHTML = avatarMarkup(profile.name, profile.avatarUrl, 'profile-avatar-large');
    document.getElementById('profile-name').textContent = profile.name;
    document.getElementById('profile-meta').textContent = [profile.type, memberSinceLabel(profile.createdAt)].filter(Boolean).join(' · ');
    document.getElementById('profile-stats').innerHTML = [
      countLabel(stats.followers, 'seguidor', 'seguidores'),
      countLabel(stats.following, 'seguindo', 'seguindo'),
      countLabel(stats.donations, 'doação', 'doações'),
      countLabel(stats.delivered, 'entregue', 'entregues'),
      countLabel(stats.posts, 'publicação', 'publicações')
    ].join('');
    document.getElementById('profile-actions').innerHTML = data.isMe
      ? `<button class="btn btn-doe" type="button" data-edit-profile aria-controls="profile-edit">Editar perfil</button>
         <button class="btn btn-outline-doe" type="button" data-change-avatar>Alterar foto</button>`
      : `<button class="btn btn-outline-doe" type="button" data-message-user="${escapeHTML(profile.id)}" data-message-name="${escapeHTML(profile.name)}">Mensagem</button>
         <button class="btn ${data.followingUser ? 'btn-outline-doe' : 'btn-doe'}" type="button" data-follow="${escapeHTML(profile.id)}">${data.followingUser ? 'Seguindo' : 'Seguir'}</button>`;
    renderProfileItems(data.isMe ? 'Você' : profile.name.split(' ')[0]);
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

function renderProfileItems(personLabel = '') {
  document.querySelectorAll('[data-profile-filter]').forEach(button => {
    button.classList.toggle('active', button.dataset.profileFilter === profileFilter);
  });
  const items = profileFilter === 'all' ? profileItems : profileItems.filter(item => item.kind === profileFilter);
  const emptyText = {
    all: 'ainda não publicou nada.',
    donation: 'ainda não cadastrou doações.',
    post: 'ainda não fez publicações.'
  }[profileFilter];
  const subject = personLabel || document.getElementById('profile-name').textContent.split(' ')[0];
  document.getElementById('profile-list').innerHTML = items.length
    ? items.map(renderFeedItem).join('')
    : `<div class="empty-state">${escapeHTML(subject)} ${emptyText}</div>`;
}

// Recarrega a lista visível (feed ou perfil) depois de curtir, comentar, seguir etc.
async function refreshSocialItems() {
  if (!document.getElementById('profile-view').classList.contains('hidden')) return loadProfile();
  return loadFeed();
}

async function updateDashboard() {
  if (!currentUserData) return navigate('login');
  document.getElementById('welcome-name').textContent = currentUserData.name.split(' ')[0];
  document.getElementById('stat-profile').textContent = currentUserData.type;
  try {
    const data = await api('/api/feed');
    const mine = data.items.filter(item => item.kind === 'donation' && item.ownerId === currentUserData.id);
    document.getElementById('stat-total').textContent = mine.length;
    document.getElementById('stat-available').textContent = mine.filter(item => item.status === 'available').length;
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
    ? `<img src="${escapeHTML(avatarUrl)}" alt="" loading="lazy" decoding="async">`
    : escapeHTML(initials(name));
  return `<div class="${className}" role="img" aria-label="Foto de perfil de ${escapeHTML(name)}">${content}</div>`;
}

function renderProfileAvatar() {
  const button = document.getElementById('profile-avatar-button');
  const notificationBell = document.getElementById('notification-bell');
  const initialsElement = document.getElementById('profile-avatar-initials');
  const image = document.getElementById('profile-avatar-image');
  const isLoggedIn = Boolean(currentUserData);

  button.classList.toggle('hidden', !isLoggedIn);
  notificationBell.classList.toggle('hidden', !isLoggedIn);
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
  button.title = 'Ver meu perfil';
  button.setAttribute('aria-label', `Ver meu perfil (${currentUserData.name})`);
}

// O sino soma mensagens não lidas e notificações (curtidas, comentários, seguidores, interesse).
let unreadMessageCount = 0;
let unreadNotificationCount = 0;

function pluralLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function renderBell() {
  const bell = document.getElementById('notification-bell');
  const badge = document.getElementById('notification-badge');
  const total = unreadMessageCount + unreadNotificationCount;
  const parts = [];
  if (unreadMessageCount) parts.push(pluralLabel(unreadMessageCount, 'mensagem não lida', 'mensagens não lidas'));
  if (unreadNotificationCount) parts.push(pluralLabel(unreadNotificationCount, 'notificação nova', 'notificações novas'));
  const label = parts.length ? `${parts.join(' e ')}. Abrir notificações` : 'Abrir notificações';

  badge.textContent = total > 99 ? '99+' : String(total);
  badge.classList.toggle('hidden', total === 0);
  bell.classList.toggle('has-unread', total > 0);
  bell.setAttribute('aria-label', label);
  bell.title = label;
}

function renderNotificationCount(count) {
  unreadMessageCount = 0;
  unreadNotificationCount = Math.max(0, Math.trunc(Number(count) || 0));
  renderBell();
}

function renderConversationNotificationCount(conversations) {
  unreadMessageCount = conversations.reduce(
    (total, conversation) => total + (Number(conversation.unreadCount) || 0),
    0
  );
  renderBell();
}

async function refreshNotifications() {
  if (!currentUserData || notificationRefreshInProgress) return;
  const userId = currentUserData.id;
  notificationRefreshInProgress = true;
  try {
    const [conversationData, notificationData] = await Promise.all([
      api('/api/conversations'),
      api('/api/notifications')
    ]);
    if (currentUserData?.id !== userId) return;
    unreadNotificationCount = notificationData.unreadCount;
    renderConversationNotificationCount(conversationData.conversations);
    if (!document.getElementById('messages-view').classList.contains('hidden')) {
      conversationContacts = conversationData.conversations;
      renderConversationList();
    }
    if (!document.getElementById('notifications-view').classList.contains('hidden') && notificationData.unreadCount) {
      await loadNotifications();
    }
  } catch (error) {
    const bell = document.getElementById('notification-bell');
    bell.setAttribute('aria-label', 'Não foi possível verificar as notificações');
    bell.title = 'Não foi possível verificar as notificações';
    console.error('Não foi possível atualizar as notificações.', error);
  } finally {
    notificationRefreshInProgress = false;
  }
}

function notificationText(item) {
  const actor = `<strong>${escapeHTML(item.actor.name)}</strong>`;
  const target = item.itemKind === 'post' ? 'sua publicação' : 'sua doação';
  const label = item.itemLabel ? ` “${escapeHTML(item.itemLabel)}”` : '';
  if (item.type === 'like') return `${actor} curtiu ${target}${label}.`;
  if (item.type === 'comment') {
    return `${actor} comentou em ${target}${label}${item.preview ? `: <span class="notification-preview">“${escapeHTML(item.preview)}”</span>` : '.'}`;
  }
  if (item.type === 'follow') return `${actor} começou a seguir você.`;
  if (item.type === 'interest') return `${actor} tem interesse na sua doação${label}.`;
  if (item.type === 'reservation_canceled') return `${actor} desistiu da reserva da sua doação${label}. Ela voltou a ficar disponível.`;
  if (item.type === 'reserved_other') return `A doação${label} de ${actor} foi reservada para outra pessoa.`;
  if (item.type === 'delivered_other') return `A doação${label} de ${actor} foi entregue a outra pessoa.`;
  if (item.type === 'available_again') return `A doação${label} de ${actor} está disponível de novo.`;
  return `${actor} interagiu com você.`;
}

async function loadNotifications() {
  try {
    const data = await api('/api/notifications');
    if (document.getElementById('notifications-view').classList.contains('hidden')) return;
    const messages = document.getElementById('notifications-messages');
    messages.innerHTML = unreadMessageCount
      ? `<button class="notification-messages" type="button" data-view="messages">
           <span>💬 Você tem ${pluralLabel(unreadMessageCount, 'mensagem não lida', 'mensagens não lidas')}</span>
           <span class="notification-messages-action">Abrir</span>
         </button>`
      : '';
    document.getElementById('notification-list').innerHTML = data.notifications.length
      ? data.notifications.map(item => `
          <li>
            <button class="notification-item ${item.read ? '' : 'unread'}" type="button"
              data-notification-type="${escapeHTML(item.type)}" data-notification-actor="${escapeHTML(item.actor.id)}" data-notification-actor-name="${escapeHTML(item.actor.name)}">
              ${avatarMarkup(item.actor.name, item.actor.avatarUrl, 'conversation-avatar')}
              <span class="notification-body">
                <span class="notification-text">${notificationText(item)}</span>
                <time>${escapeHTML(timeLabel(item.createdAt))}</time>
              </span>
              ${item.read ? '' : '<span class="notification-dot" aria-hidden="true"></span><span class="visually-hidden">Nova</span>'}
            </button>
          </li>
        `).join('')
      : `<li class="empty-state">Nenhuma notificação por enquanto.<br>Quando alguém curtir, comentar, seguir você ou se interessar por uma doação, o aviso aparece aqui.</li>`;
    // Marca como lidas, mantendo o destaque das novas enquanto a tela estiver aberta
    if (data.unreadCount) await api('/api/notifications/read', { method: 'POST' });
    unreadNotificationCount = 0;
    renderBell();
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

function timeLabel(date) {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(date));
}

function formatEventDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(year, month - 1, day));
}

function calendarMonthKey() {
  return `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}`;
}

function renderCalendar() {
  const monthKey = calendarMonthKey();
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const todayKey = `${monthKey}-${String(today.getDate()).padStart(2, '0')}`;

  if (!calendarSelectedDate.startsWith(`${monthKey}-`)) {
    calendarSelectedDate = monthKey === currentMonthKey
      ? todayKey
      : calendarEvents[0]?.eventDate || `${monthKey}-01`;
  }

  const monthLabel = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric'
  }).format(calendarMonth);
  document.querySelectorAll('[data-calendar-month-label]').forEach(label => {
    label.textContent = monthLabel;
  });

  const cellCount = Math.ceil((firstDayOffset + daysInMonth) / 7) * 7;
  const calendarGrid = Array.from({ length: cellCount }, (_, index) => {
    const day = index - firstDayOffset + 1;
    if (day < 1 || day > daysInMonth) return '<span class="calendar-day-empty" aria-hidden="true"></span>';

    const date = `${monthKey}-${String(day).padStart(2, '0')}`;
    const count = calendarEvents.filter(item => item.eventDate === date).length;
    const eventLabel = count ? `${count} ${count === 1 ? 'evento' : 'eventos'}` : '';
    return `
      <button class="calendar-day ${count ? 'has-events' : ''} ${date === calendarSelectedDate ? 'selected' : ''}"
        type="button" role="gridcell" data-calendar-date="${date}"
        aria-label="${escapeHTML(formatEventDate(date))}${count ? `, ${eventLabel}` : ''}"
        aria-pressed="${date === calendarSelectedDate}">
        <span class="calendar-day-number">${day}</span>
        ${count ? `<span class="calendar-event-count">${eventLabel}</span>` : ''}
      </button>
    `;
  }).join('');
  document.querySelectorAll('[data-calendar-grid]').forEach(grid => {
    grid.innerHTML = calendarGrid;
  });

  const selectedLabel = `Atividades em ${formatEventDate(calendarSelectedDate)}`;
  document.querySelectorAll('[data-calendar-selected-label]').forEach(label => {
    label.textContent = selectedLabel;
  });
  const eventsForDay = calendarEvents.filter(item => item.eventDate === calendarSelectedDate);
  const eventList = eventsForDay.length
    ? eventsForDay.map(item => `
        <article class="calendar-event-card">
          <strong>${escapeHTML(item.ownerName)}</strong>
          <p>${escapeHTML(item.text)}</p>
        </article>
      `).join('')
    : '<p class="calendar-empty">Não há atividades nesta data.</p>';
  document.querySelectorAll('[data-calendar-event-list]').forEach(list => {
    list.innerHTML = eventList;
  });
}

async function loadCalendarMonth() {
  const requestedMonth = calendarMonthKey();
  calendarEvents = [];
  renderCalendar();

  try {
    const data = await api(`/api/events?month=${requestedMonth}`);
    if (requestedMonth !== calendarMonthKey()) return;
    calendarEvents = data.events;
    if (calendarEvents.length && !calendarEvents.some(item => item.eventDate === calendarSelectedDate)) {
      calendarSelectedDate = calendarEvents[0].eventDate;
    }
    renderCalendar();
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

const donationStatusLabels = { available: 'Disponível', reserved: 'Reservada', delivered: 'Entregue' };

function donationStatusBadge(item) {
  const status = donationStatusLabels[item.status] ? item.status : 'available';
  const label = status === 'reserved' && item.reservedForMe ? 'Reservada para você' : donationStatusLabels[status];
  return `<span class="donation-status status-${status}">${label}</span>`;
}

function interestedPeopleLabel(count) {
  return `${count} ${count === 1 ? 'pessoa interessada' : 'pessoas interessadas'}`;
}

function donationInterestMarkup(item) {
  let action = '';
  if (item.ownerId === currentUserData.id) {
    action = item.interestCount
      ? `<span class="donation-interest-note">${interestedPeopleLabel(item.interestCount)} · <button class="text-button" type="button" data-view="donations">Gerenciar</button></span>`
      : '';
  } else if (item.reservedForMe || item.interestedByMe) {
    const canWithdraw = item.interestedByMe && !(item.status === 'delivered' && item.reservedForMe);
    action = `${item.interestedByMe && item.status === 'available' ? '<span class="donation-interest-note">Interesse enviado</span>' : ''}
      ${canWithdraw ? `<button class="text-button donation-withdraw" type="button" data-withdraw-interest="${escapeHTML(item.id)}" data-donation-name="${escapeHTML(item.name)}" data-reserved-for-me="${item.reservedForMe && item.status === 'reserved' ? '1' : ''}">Desistir</button>` : ''}
      <button class="btn btn-outline-doe btn-interest" type="button" data-message-user="${escapeHTML(item.ownerId)}" data-message-name="${escapeHTML(item.ownerName)}">Abrir conversa</button>`;
  } else if (item.status === 'available') {
    action = `<button class="btn btn-doe btn-interest" type="button" data-interest="${escapeHTML(item.id)}">Tenho interesse</button>`;
  }
  return `<div class="donation-interest">${donationStatusBadge(item)}<div class="donation-interest-action">${action}</div></div>`;
}

// Opções de categoria e tamanho da busca vêm do formulário de cadastro, para não duplicar as listas.
function fillDonationSearchOptions() {
  for (const [sourceId, targetId] of [['item-category', 'donation-search-category'], ['item-size', 'donation-search-size']]) {
    const target = document.getElementById(targetId);
    if (target.options.length > 1) continue;
    for (const option of document.getElementById(sourceId).options) target.add(new Option(option.text, option.value));
  }
}

function donationSearchParams() {
  const params = new URLSearchParams();
  const text = document.getElementById('donation-search-text').value.trim();
  const category = document.getElementById('donation-search-category').value;
  const size = document.getElementById('donation-search-size').value;
  if (text) params.set('q', text);
  if (category) params.set('category', category);
  if (size) params.set('size', size);
  if (document.getElementById('donation-search-available').checked) params.set('available', '1');
  return params;
}

function resetDonationSearch() {
  document.getElementById('donation-search').reset();
}

let feedRequestId = 0;

async function loadFeed() {
  const requestId = ++feedRequestId;
  const searchingDonations = feedFilter === 'donations';
  document.getElementById('donation-search').classList.toggle('hidden', !searchingDonations);
  document.getElementById('stories').classList.toggle('hidden', searchingDonations);
  document.querySelectorAll('[data-feed-filter]').forEach(button => {
    button.classList.toggle('active', button.dataset.feedFilter === feedFilter);
  });
  try {
    if (searchingDonations) fillDonationSearchOptions();
    const data = searchingDonations
      ? await api(`/api/donations?${donationSearchParams()}`)
      : await api(`/api/feed?filter=${feedFilter}`);
    // Ignora respostas antigas quando a pessoa digita ou troca de filtro rapidamente
    if (requestId !== feedRequestId) return;
    feedItems = data.items;
    if (searchingDonations) {
      const count = feedItems.length;
      document.getElementById('donation-search-summary').textContent = count
        ? `${count} ${count === 1 ? 'doação encontrada' : 'doações encontradas'}`
        : '';
      document.getElementById('feed-list').innerHTML = count
        ? feedItems.map(renderFeedItem).join('')
        : `<div class="empty-state">Nenhuma doação encontrada com esses filtros.<br>
             <button class="text-button" type="button" data-clear-donation-search>Limpar filtros</button></div>`;
      return;
    }
    const uniqueOwners = [...new Map(feedItems.map(item => [item.ownerId, item])).values()].slice(0, 10);
    document.getElementById('stories').innerHTML = uniqueOwners.length
      ? uniqueOwners.map(item => `
          <a class="story" href="#profile/${escapeHTML(item.ownerId)}" data-profile="${escapeHTML(item.ownerId)}" title="Ver perfil de ${escapeHTML(item.ownerName)}">
            ${avatarMarkup(item.ownerName, item.ownerAvatarUrl, 'story-avatar')}
            <span>${escapeHTML(item.ownerName.split(' ')[0])}</span>
          </a>
        `).join('')
      : '<p class="muted mb-0">Seja o primeiro a compartilhar algo com a comunidade.</p>';

    const list = document.getElementById('feed-list');
    if (!feedItems.length) {
      list.innerHTML = feedFilter === 'following'
        ? '<div class="empty-state">As pessoas que você segue ainda não publicaram.<br>Volte para “Todas” e siga um participante para acompanhar as publicações.</div>'
        : '<div class="empty-state">Ainda não há publicações na comunidade.</div>';
      return;
    }
    list.innerHTML = feedItems.map(renderFeedItem).join('');
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

function renderFeedItem(item) {
      const isDonation = item.kind === 'donation';
      const collection = isDonation ? 'donations' : 'posts';
      const publicationText = isDonation
        ? `<p class="post-caption"><strong>${escapeHTML(item.ownerName)}</strong> está doando ${escapeHTML(item.name)}.</p>
           <p class="post-details">Tamanho ${escapeHTML(item.size)} · Condição: ${escapeHTML(item.condition)}</p>
           ${item.description ? `<p class="post-description">${escapeHTML(item.description)}</p>` : ''}
           ${donationInterestMarkup(item)}`
        : `<p class="post-caption"><strong>${escapeHTML(item.ownerName)}</strong></p>
           ${item.eventDate ? `<p class="post-event-date"><strong>Atividade:</strong> ${escapeHTML(formatEventDate(item.eventDate))}</p>` : ''}
           <p class="post-text">${escapeHTML(item.text)}</p>`;
      return `
      <article class="social-post ${isDonation ? 'donation-post' : 'community-post'}">
        <header class="post-header">
          <a class="post-author" href="#profile/${escapeHTML(item.ownerId)}" data-profile="${escapeHTML(item.ownerId)}" title="Ver perfil de ${escapeHTML(item.ownerName)}">
            ${avatarMarkup(item.ownerName, item.ownerAvatarUrl, 'post-avatar')}
            <div class="post-author-text"><strong>${escapeHTML(item.ownerName)}</strong><small><span class="post-kind">${isDonation ? `${escapeHTML(item.category)} · ${escapeHTML(item.size)}` : 'Publicação da comunidade'}</span><time>· ${escapeHTML(timeLabel(item.createdAt))}</time></small></div>
          </a>
          <div class="post-header-actions">
            ${item.ownerId !== currentUserData.id
              ? `<button class="message-button" type="button" data-message-user="${escapeHTML(item.ownerId)}" data-message-name="${escapeHTML(item.ownerName)}" aria-label="Enviar mensagem para ${escapeHTML(item.ownerName)}" title="Mensagem">
                  <svg class="message-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
                  <span class="message-label">Mensagem</span>
                </button><button class="follow-button ${item.followingOwner ? 'following' : ''}" type="button" data-follow="${escapeHTML(item.ownerId)}">${item.followingOwner ? 'Seguindo' : 'Seguir'}</button>`
              : '<span class="my-post-label">Sua publicação</span>'}
          </div>
        </header>
        ${item.image
          ? `<img class="post-image" loading="lazy" decoding="async" src="${escapeHTML(item.image)}" alt="${escapeHTML(isDonation ? item.name : `Publicação de ${item.ownerName}`)}">`
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
    list.innerHTML = mine.map(item => {
      const interests = item.interests || [];
      const reservedName = interests.find(person => person.userId === item.reservedFor)?.name;
      const selectedValue = item.status === 'reserved' ? `reserved:${item.reservedFor}` : item.status;
      const options = [
        { value: 'available', label: 'Disponível' },
        ...interests.map(person => ({ value: `reserved:${person.userId}`, label: `Reservada para ${person.name}` })),
        { value: 'delivered', label: reservedName ? `Entregue para ${reservedName}` : 'Entregue' }
      ];
      return `
      <article class="donation-item">
        ${item.image ? `<img class="donation-thumb" loading="lazy" decoding="async" src="${escapeHTML(item.image)}" alt="${escapeHTML(item.name)}">` : '<div class="donation-thumb-placeholder">👕</div>'}
        <div class="donation-details">
          <h3>${escapeHTML(item.name)} ${donationStatusBadge(item)}</h3>
          <p>${escapeHTML(item.category)} · Tamanho ${escapeHTML(item.size)} · ${escapeHTML(item.condition)}</p>
          ${item.description ? `<p>${escapeHTML(item.description)}</p>` : ''}
          <small>${item.likes.length} curtida(s) · ${item.comments.length} comentário(s)</small>
          <div class="donation-manage">
            <label class="form-label" for="donation-status-${escapeHTML(item.id)}">Situação</label>
            <select id="donation-status-${escapeHTML(item.id)}" class="form-select" data-donation-status="${escapeHTML(item.id)}">
              ${options.map(option => `<option value="${escapeHTML(option.value)}" ${option.value === selectedValue ? 'selected' : ''}>${escapeHTML(option.label)}</option>`).join('')}
            </select>
            ${interests.length
              ? `<p class="donation-interest-note">${interestedPeopleLabel(interests.length)}. Toque para conversar:</p>
                 <div class="interest-chips">${interests.map(person => `<button class="interest-chip" type="button" data-message-user="${escapeHTML(person.userId)}" data-message-name="${escapeHTML(person.name)}">${escapeHTML(person.name)}</button>`).join('')}</div>`
              : '<p class="donation-interest-note">Ninguém demonstrou interesse ainda. Para reservar, a pessoa precisa tocar em “Tenho interesse” no feed.</p>'}
          </div>
        </div>
        <button class="delete-button" type="button" data-delete="${item.id}" data-kind="donations">Excluir</button>
      </article>
    `;
    }).join('');
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
        ${contact.unreadCount ? `<span class="conversation-unread-badge" aria-label="${contact.unreadCount} mensagens não lidas">${contact.unreadCount > 99 ? '99+' : contact.unreadCount}</span>` : ''}
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
    const contact = conversationContacts.find(item => item.id === contactId);
    if (contact) {
      contact.unreadCount = Number(data.unreadCount) || 0;
      renderConversationList();
      renderConversationNotificationCount(conversationContacts);
    }
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

let conversationRequestId = 0;

async function loadConversations(selectedId = activeConversationId, { autoSelectUnread = false } = {}) {
  const requestId = ++conversationRequestId;
  try {
    const data = await api('/api/conversations');
    // Uma busca mais nova já foi feita (ex.: a pessoa tocou numa conversa enquanto a lista atualizava);
    // aplicar esta resposta antiga desfaria a escolha.
    if (requestId !== conversationRequestId) return;
    conversationContacts = data.conversations;
    renderConversationNotificationCount(conversationContacts);
    activeConversationId = conversationContacts.some(contact => contact.id === selectedId)
      ? selectedId
      : !selectedId && autoSelectUnread
        ? conversationContacts.find(contact => contact.unreadCount > 0)?.id || null
        : null;
    renderConversationList();

    const contact = conversationContacts.find(item => item.id === activeConversationId);
    document.getElementById('chat-placeholder').classList.toggle('hidden', Boolean(contact));
    document.getElementById('active-chat').classList.toggle('hidden', !contact);
    document.querySelector('.chat-layout').classList.toggle('has-active-chat', Boolean(contact));
    document.body.classList.toggle('chat-open', Boolean(contact));
    if (currentView === 'messages' && routeFor('messages') !== currentRoute()) updateHistory('replace');
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
  if (event.target.closest('#notification-bell')) activeConversationId = null;

  const logoutButton = event.target.closest('[data-logout]');
  if (logoutButton) {
    await logoutUser();
  }

  const viewButton = event.target.closest('[data-view]');
  if (viewButton) {
    // A aba Mensagens sempre abre a lista, não a última conversa aberta
    if (viewButton.dataset.view === 'messages') activeConversationId = null;
    navigate(viewButton.dataset.view);
  }

  if (event.target.closest('#show-post-form')) {
    document.getElementById('post-event-date-field').classList.toggle(
      'hidden',
      currentUserData?.type !== organizerRole
    );
    document.getElementById('post-form').classList.remove('hidden');
    document.getElementById('post-content').focus();
  }
  if (event.target.closest('#cancel-post')) resetPostComposer();

  const messageButton = event.target.closest('[data-message-user]');
  if (messageButton) {
    openConversation(messageButton.dataset.messageUser, messageButton.dataset.messageName);
  }

  const conversationButton = event.target.closest('[data-chat-user]');
  if (conversationButton) {
    const contactId = conversationButton.dataset.chatUser;
    // No celular a conversa substitui a lista: vira uma entrada no histórico para o "voltar" retornar à lista
    if (activeConversationId !== contactId) {
      activeConversationId = contactId;
      if (chatShowsBothPanes()) updateHistory('replace');
      else history.pushState({ app: true, conversationFromList: true }, '', routeFor('messages'));
    }
    showConversationShell(contactId);
    await loadConversations(contactId);
  }

  if (event.target.closest('[data-chat-back]')) {
    if (history.state?.conversationFromList) {
      // Veio da lista: o mesmo que o "voltar" do celular
      history.back();
    } else {
      activeConversationId = null;
      await loadConversations(null);
    }
  }

  const withdrawButton = event.target.closest('[data-withdraw-interest]');
  if (withdrawButton) {
    const name = withdrawButton.dataset.donationName;
    const question = withdrawButton.dataset.reservedForMe
      ? `Desistir da reserva de “${name}”? A peça volta a ficar disponível para outras pessoas.`
      : `Desistir do interesse em “${name}”?`;
    if (window.confirm(question)) {
      withdrawButton.disabled = true;
      try {
        await api(`/api/donations/${encodeURIComponent(withdrawButton.dataset.withdrawInterest)}/interest`, { method: 'DELETE' });
        await refreshSocialItems();
        showAlert(withdrawButton.dataset.reservedForMe ? 'Você desistiu da reserva. Quem está doando foi avisado.' : 'Você desistiu do interesse.');
      } catch (error) {
        showAlert(error.message, 'danger');
        withdrawButton.disabled = false;
      }
    }
  }

  const interestButton = event.target.closest('[data-interest]');
  if (interestButton) {
    interestButton.disabled = true;
    try {
      const data = await api(`/api/donations/${encodeURIComponent(interestButton.dataset.interest)}/interest`, { method: 'POST' });
      openConversation(data.contactId, data.donation.ownerName);
      if (!data.alreadyInterested) showAlert('Interesse enviado! Continue a conversa com quem está doando.');
    } catch (error) {
      showAlert(error.message, 'danger');
      await refreshSocialItems();
    }
  }

  const deleteButton = event.target.closest('[data-delete]');
  if (deleteButton) {
    try {
      const collection = deleteButton.dataset.kind || 'donations';
      await api(`/api/${collection}/${deleteButton.dataset.delete}`, { method: 'DELETE' });
      if (collection === 'posts') {
        await refreshSocialItems();
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
      await refreshSocialItems();
    } catch (error) {
      showAlert(error.message, 'danger');
    }
  }

  const followButton = event.target.closest('[data-follow]');
  if (followButton) {
    try {
      const { following } = await api(`/api/users/${followButton.dataset.follow}/follow`, { method: 'POST' });
      await refreshSocialItems();
      showAlert(following
        ? 'Agora você está seguindo este participante.'
        : 'Você deixou de seguir este participante.');
    } catch (error) {
      showAlert(error.message, 'danger');
    }
  }

  // Cada aviso leva ao lugar onde a ação aconteceu
  const notificationItem = event.target.closest('[data-notification-type]');
  if (notificationItem) {
    const type = notificationItem.dataset.notificationType;
    if (type === 'follow') {
      openProfile(notificationItem.dataset.notificationActor);
    } else if (type === 'interest') {
      // Abre a conversa com quem demonstrou interesse, que já começa com a mensagem citando a peça
      openConversation(notificationItem.dataset.notificationActor, notificationItem.dataset.notificationActorName);
    } else if (type === 'reservation_canceled') {
      navigate('donations');
    } else if (['reserved_other', 'delivered_other', 'available_again'].includes(type)) {
      // Perfil de quem doa, onde a peça aparece com a situação atualizada
      openProfile(notificationItem.dataset.notificationActor);
    } else {
      openProfile(currentUserData.id);
    }
  }

  const profileLink = event.target.closest('[data-profile]');
  if (profileLink) {
    event.preventDefault();
    openProfile(profileLink.dataset.profile);
  }

  const profileFilterButton = event.target.closest('[data-profile-filter]');
  if (profileFilterButton) {
    profileFilter = profileFilterButton.dataset.profileFilter;
    renderProfileItems();
  }

  if (event.target.closest('[data-edit-profile]')) openProfileEdit();
  if (event.target.closest('[data-close-profile-edit]')) closeProfileEdit();

  if (event.target.closest('[data-change-avatar]')) {
    document.getElementById('profile-avatar-input').click();
  }

  if (event.target.closest('[data-clear-donation-search]')) {
    resetDonationSearch();
    await loadFeed();
  }

  const filterButton = event.target.closest('[data-feed-filter]');
  if (filterButton) {
    feedFilter = filterButton.dataset.feedFilter;
    await loadFeed();
  }

  const calendarMonthButton = event.target.closest('[data-calendar-month]');
  if (calendarMonthButton) {
    calendarMonth = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + Number(calendarMonthButton.dataset.calendarMonth),
      1
    );
    calendarSelectedDate = '';
    await loadCalendarMonth();
  }

  const calendarDayButton = event.target.closest('[data-calendar-date]');
  if (calendarDayButton) {
    calendarSelectedDate = calendarDayButton.dataset.calendarDate;
    renderCalendar();
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
      await refreshSocialItems();
    } catch (error) {
      showAlert(error.message, 'danger');
    }
  }

  if (event.target.matches('#profile-edit-form')) {
    event.preventDefault();
    try {
      const data = await api('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: document.getElementById('profile-edit-name').value,
          type: document.getElementById('profile-edit-type').value
        })
      });
      currentUserData = data.user;
      renderProfileAvatar();
      closeProfileEdit();
      await loadProfile();
      showAlert('Perfil atualizado.');
    } catch (error) {
      showAlert(error.message, 'danger');
    }
  }

  if (event.target.matches('#password-form')) {
    event.preventDefault();
    const newPassword = document.getElementById('password-new').value;
    if (newPassword !== document.getElementById('password-confirm').value) {
      showAlert('A confirmação não é igual à nova senha.', 'warning');
      document.getElementById('password-confirm').focus();
      return;
    }
    try {
      const data = await api('/api/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword: document.getElementById('password-current').value, newPassword })
      });
      event.target.reset();
      showAlert(data.endedSessions
        ? 'Senha alterada. Você saiu da conta nos outros aparelhos.'
        : 'Senha alterada.');
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
          image: await readImage(file),
          eventDate: currentUserData.type === organizerRole
            ? document.getElementById('post-event-date').value
            : ''
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
    navigate('feed', { history: 'replace' });
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
    navigate('feed', { history: 'replace' });
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
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    showAlert('Selecione uma imagem PNG, JPG ou WebP com até 5 MB.', 'warning');
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
  openProfile(currentUserData.id);
});

document.addEventListener('change', async event => {
  const statusSelect = event.target.closest('[data-donation-status]');
  if (!statusSelect) return;
  const [status, reservedFor] = statusSelect.value.split(':');
  statusSelect.disabled = true;
  try {
    await api(`/api/donations/${encodeURIComponent(statusSelect.dataset.donationStatus)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reservedFor })
    });
    showAlert(status === 'reserved'
      ? 'Doação reservada. Combine a entrega pelas mensagens.'
      : 'Situação da doação atualizada.');
  } catch (error) {
    showAlert(error.message, 'danger');
  }
  await loadMyDonations();
});

let donationSearchTimer = null;
const donationSearchForm = document.getElementById('donation-search');
donationSearchForm.addEventListener('input', event => {
  clearTimeout(donationSearchTimer);
  // Texto: espera a pessoa parar de digitar; filtros: atualiza na hora
  donationSearchTimer = setTimeout(loadFeed, event.target.type === 'search' ? 300 : 0);
});
donationSearchForm.addEventListener('submit', event => {
  event.preventDefault();
  clearTimeout(donationSearchTimer);
  loadFeed();
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
    if (!document.getElementById('profile-view').classList.contains('hidden')) await loadProfile();
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
  applyRoute(location.hash, 'replace');
}

initialize();
