import { escape as e, horseMark, icon, portrait, rideMap, vehicle } from './illustrations.js';
import { updateMap, recenterMap } from './map.js';
import { apiCall } from './transport.js';

const $ = id => document.getElementById(id);
const state = { data: null, token: '', tab: 'ride', bookingStep: 'route', pickupId: 'byward', destinationId: 'parliament', serviceId: 'pony', quotes: {}, quoteVersion: 0, busy: false, searchField: null, filter: 'all' };
const money = cents => '$' + (Number(cents) / 100).toFixed(2);
const place = id => state.data.places.find(p => p.id === id);
const horse = id => state.data.horses.find(h => h.id === id);
const selectedHorse = () => state.data.horses.find(h => h.service === state.serviceId);
const date = value => new Date(value).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
let toastTimeout;

async function api(path, method = 'GET', body) {
  return apiCall(path, method, body, state.token);
}
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => { $('toast').hidden = true; }, 4200);
}
function error(message) {
  $('error-banner').textContent = message;
  $('error-banner').hidden = !message;
}
function icons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
function initial(name) { return String(name).split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join(''); }

async function login(userId = 'alex') {
  try {
    error('');
    const result = await api('/lab/session', 'POST', { userId });
    state.token = result.token;
    await refresh();
    await loadQuotes();
  } catch (err) {
    error('Can’t reach the stable. Refresh to try again. ' + err.message);
    $('booking-body').innerHTML = `<div class="loading">${icon('horse', 28)} The stable is taking a breather.</div>`;
  }
}
async function refresh() {
  state.data = await api('/api/bootstrap');
  renderUser(); renderBooking(); renderMap(); renderTrips(); renderWallet();
}
function renderUser() {
  const user = state.data.user;
  $('avatar-initials').textContent = initial(user.name);
  $('header-name').textContent = String(user.name).split(' ')[0];
  $('account-avatar').textContent = initial(user.name);
  $('account-name').textContent = user.name;
  $('account-email').textContent = user.email;
  $('account-role').textContent = user.role === 'stable_admin' ? 'Stable administrator' : 'Rider · 4.98 ★';
  $('profile-name').value = user.name;
  $('quiet-ride').checked = user.quietRide;
  document.querySelectorAll('[data-account]').forEach(button => button.classList.toggle('active', button.dataset.account === user.id));
}
function navigate(tab) {
  if (!['ride', 'trips', 'wallet'].includes(tab)) return;
  state.tab = tab;
  for (const name of ['ride', 'trips', 'wallet']) $(name + '-screen').hidden = tab !== name;
  document.querySelectorAll('[data-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tab);
    if (button.closest('nav')) button.setAttribute('aria-current', button.dataset.tab === tab ? 'page' : 'false');
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
  if(tab === 'ride') requestAnimationFrame(recenterMap);
}
async function loadQuotes() {
  const version = ++state.quoteVersion;
  state.quotes = {}; renderBooking();
  try {
    const entries = await Promise.all(state.data.services.map(async service => {
      const { quote } = await api('/api/quotes', 'POST', { pickupId: state.pickupId, destinationId: state.destinationId, serviceId: service.id });
      return [service.id, quote];
    }));
    if (version !== state.quoteVersion) return;
    state.quotes = Object.fromEntries(entries); renderBooking();
  } catch (err) { if (version === state.quoteVersion) error(err.message); }
}
function renderBooking() {
  if (!state.data) return;
  document.querySelector('.booking-column').classList.toggle('choosing', state.bookingStep === 'choose' && !state.data.activeRide);
  if (state.data.activeRide) return renderActiveRide();
  if (state.bookingStep === 'route') return renderRouteCard();
  const pickup = place(state.pickupId), destination = place(state.destinationId);
  const quote = state.quotes[state.serviceId];
  $('booking-body').innerHTML = `<div class="choose-header"><button class="back-button" data-action="edit-route" aria-label="Edit route">${icon('arrow')}</button><h2>Choose a ride</h2></div><div class="trip-summary"><div><span>${icon('pin',12)} ${e(pickup.name)}</span><span>${icon('pin',12)} ${e(destination.name)}</span></div><button data-action="edit-route" aria-label="Change pickup and destination">${icon('chevron')}</button></div>
    <div class="route-inputs"><div class="route-row"><span class="route-dot"></span><div><label for="pickup-input">PICKUP</label><input id="pickup-input" data-search="pickup" value="${e(pickup.name)}" autocomplete="off" aria-label="Pickup location" aria-controls="suggestions"></div><span class="route-right">${icon('locate', 14)}</span></div><div class="route-row"><span class="route-dot square"></span><div><label for="destination-input">DROP-OFF</label><input id="destination-input" data-search="destination" value="${e(destination.name)}" autocomplete="off" aria-label="Destination" aria-controls="suggestions"></div><span class="route-right">${icon('plus', 14)}</span></div><div id="suggestions" class="suggestions" hidden></div></div>
    <div class="saved-stops"><button class="saved-stop" data-place="glebe" data-field="destination">${icon('pin', 11)} The Glebe</button><button class="saved-stop" data-place="hub" data-field="destination">${icon('pin', 11)} Impact Hub</button><button class="saved-stop" data-place="parliament" data-field="destination">${icon('star', 11)} Parliament</button></div>
    <div class="services-label"><span>Recommended</span><span>${quote ? `${quote.distanceKm} km · ${quote.durationMinutes} min` : 'Finding your route…'}</span></div>
    <div class="service-options" role="group" aria-label="Ride options">${state.data.services.map(service => {
      const q = state.quotes[service.id], h = state.data.horses.find(h => h.service === service.id), selected = state.serviceId === service.id;
      return `<button class="service-option ${selected ? 'selected' : ''}" data-service="${service.id}" aria-pressed="${selected}" aria-label="${e(service.name)}, ${q ? money(q.fareCents) : 'loading fare'}, ${service.eta} minutes away">${vehicle(h)}<div class="service-info"><div class="service-name">${e(service.name)}<span class="service-seats">${icon('user', 10)} ${service.seats}</span></div><span class="service-time">${service.eta} min away</span><p>${e(service.subtitle)}</p></div><div class="service-price"><strong>${q ? money(q.fareCents) : '—'}</strong></div></button>`;
    }).join('')}</div>
    <div class="payment-method">${icon('wallet',20)}<span>OatPay <small> · ${money(state.data.user.walletCents)}</small></span>${icon('chevron',14)}</div><button class="dark-button booking-cta" data-action="book" ${!quote || state.busy ? 'disabled' : ''}><span>${state.busy ? 'Requesting your ride…' : 'Request ' + e(state.data.services.find(s=>s.id===state.serviceId).name)}</span></button><p class="booking-disclaimer">Fares are simulated. No real booking or payment.</p>`;
}
function renderRouteCard() {
  const pickup = place(state.pickupId), destination = place(state.destinationId);
  $('booking-body').innerHTML = `<div class="booking-head"><h2>Get a ride</h2></div><div class="route-inputs"><div class="route-row"><span class="route-dot"></span><div><label for="pickup-input">Pickup location</label><input id="pickup-input" data-search="pickup" value="${e(pickup.name)}" placeholder="Pickup location" autocomplete="off" aria-label="Pickup location" aria-controls="suggestions"></div><span class="route-right">${icon('locate',15)}</span></div><div class="route-row"><span class="route-dot square"></span><div><label for="destination-input">Dropoff location</label><input id="destination-input" data-search="destination" value="${e(destination.name)}" placeholder="Dropoff location" autocomplete="off" aria-label="Destination" aria-controls="suggestions"></div></div><div id="suggestions" class="suggestions" hidden></div></div><button class="pickup-time" data-action="when"><span>${icon('clock',20)} Pickup now</span>${icon('chevron',13)}</button><button class="rider-picker" data-action="account">${icon('user',15)} For me ${icon('chevron',11)}</button><button class="dark-button booking-cta" data-action="search">Search</button><p class="booking-disclaimer">Demo rides. Real horsepower is not included.</p>`;
}
function renderMap() {
  if (!state.data) return;
  const ride = state.data.activeRide;
  updateMap({ pickup: place(ride?.pickupId || state.pickupId), destination: place(ride?.destinationId || state.destinationId), horses: state.data.horses, activeHorseId: ride?.horseId, selected: Boolean(ride) || state.bookingStep === 'choose' });
  document.querySelector('.nearby-badge').innerHTML = `<i></i> ${ride ? 'Your steed is ' + (ride.status === 'in_progress' ? 'on a roll' : 'on the way') : '3 steeds nearby'}`;
}
function renderSuggestions(query = '') {
  const target = $('suggestions'); if (!target || !state.searchField) return;
  const other = state.searchField === 'pickup' ? state.destinationId : state.pickupId;
  const matches = state.data.places.filter(p => p.id !== other && (p.name + p.address).toLowerCase().includes(query.toLowerCase()));
  target.innerHTML = matches.length ? matches.map(p => `<button class="suggestion" data-place="${p.id}" data-field="${state.searchField}">${icon('pin', 17)}<span><strong>${e(p.name)}</strong><small>${e(p.address)}</small></span></button>`).join('') : '<p class="suggestion">No stops on that trail. Try one of the Ottawa landmarks.</p>';
  target.hidden = false;
}
async function choosePlace(id, field) {
  const other = field === 'pickup' ? state.destinationId : state.pickupId;
  if (other === id) return toast('Pick a different stop. Your horse deserves a little adventure.');
  state[field === 'pickup' ? 'pickupId' : 'destinationId'] = id;
  state.searchField = null; error(''); renderMap(); await loadQuotes();
}
async function book() {
  const quote = state.quotes[state.serviceId]; if (!quote || state.busy) return;
  state.busy = true; renderBooking();
  try {
    await api('/api/rides', 'POST', { quoteId: quote.id, fareCents: quote.fareCents });
    await refresh(); toast('Your steed is on the way. Excellent life choice.');
  } catch (err) {
    if (err.message.toLowerCase().includes('expired')) { await loadQuotes(); toast('Your fare has refreshed. Please request your ride again.'); }
    else error(err.message);
  }
  finally { state.busy = false; renderBooking(); }
}
function renderActiveRide() {
  const ride = state.data.activeRide, h = horse(ride.horseId), moving = ride.status === 'in_progress';
  $('booking-body').innerHTML = `<div class="active-heading"><p class="eyebrow">${moving ? 'YOU’RE ON YOUR WAY' : 'YOUR STEED IS ON THE WAY'}</p><h2>${moving ? 'Taking the scenic trot.' : 'A good ride.<br>An even better horse.'}</h2><p>${moving ? `${e(place(ride.destinationId).name)} is just a few trots away.` : 'Meet your driver at ' + e(place(ride.pickupId).name) + '. An apple is optional.'}</p></div><div class="ride-progress"><span class="done"></span><span class="${moving ? 'done' : ''}"></span><span></span></div><div class="driver-card">${portrait(h, 80)}<div><strong>${e(h.name)}</strong><p>${e(h.breed)} · ${e(h.driver)}</p><span class="rating">${icon('star', 11)} ${e(h.rating)} · ${h.rides.toLocaleString()} rides</span></div></div><div class="between"><span class="plate">${e(h.plate)}</span><span class="small-badge">${moving ? 'On the trot' : '3 minutes away'}</span></div><div class="driver-actions"><button data-action="chat">${icon('message', 14)} Message driver</button><button data-action="horse-info">${icon('shield', 14)} Ride details</button></div><div class="active-route"><div><span class="route-dot"></span>${e(place(ride.pickupId).name)}</div><div><span class="route-dot square"></span>${e(place(ride.destinationId).name)}</div></div><button class="dark-button booking-cta" data-action="advance" ${state.busy ? 'disabled' : ''}><span>${state.busy ? 'One moment…' : moving ? 'Finish demo ride' : 'Meet your horse'}</span>${icon('arrow')}</button><p class="booking-disclaimer">A simulated trot. No actual horses are dispatched.</p>${moving ? '' : '<button class="cancel-button" data-action="cancel">Cancel this ride</button>'}`;
}
async function advance() {
  if (state.busy || !state.data.activeRide) return;
  state.busy = true; const rideId = state.data.activeRide.id; renderBooking();
  try {
    const { ride } = await api(`/api/rides/${rideId}/advance`, 'POST', {});
    if (ride.status === 'completed') state.bookingStep = 'route';
    await refresh();
    if (ride.status === 'completed') { await showReceipt(ride.id); toast('Five stars for four legs. Thanks for trotting with us.'); await loadQuotes(); }
    else toast('You’re on your way. Neigh worries.');
  } catch (err) { error(err.message); }
  finally { state.busy = false; renderBooking(); }
}
async function cancel() {
  if (state.busy || !state.data.activeRide) return;
  state.busy = true;
  try { await api(`/api/rides/${state.data.activeRide.id}/cancel`, 'POST', {}); await refresh(); await loadQuotes(); toast('Ride cancelled. Your horse has returned to snacking.'); }
  catch (err) { error(err.message); }
  finally { state.busy = false; renderBooking(); }
}
function renderTrips() {
  if (!state.data) return;
  const rides = state.data.rides.filter(r => state.filter === 'all' || r.status === state.filter);
  $('trip-list').innerHTML = rides.length ? rides.map(ride => {
    const h = horse(ride.horseId);
    return `<button class="trip-card" data-ride="${e(ride.id)}"><div class="trip-map">${rideMap({ pickup: place(ride.pickupId), destination: place(ride.destinationId), horses: [], compact: true })}</div><div><div class="trip-meta"><span>${date(ride.createdAt)}</span><span class="small-badge ${ride.status === 'cancelled' ? 'status-cancelled' : ''}">${e(ride.status.replace('_', ' '))}</span></div><h3>${e(place(ride.destinationId).name)}</h3><p>${e(h.name)} · ${e(state.data.services.find(s => s.id === ride.serviceId).name)}<br>${e(place(ride.pickupId).name)} → ${e(place(ride.destinationId).name)}</p></div><div class="trip-price"><strong>${money(ride.fareCents)}</strong><span>View receipt ${icon('arrow-up', 10)}</span></div></button>`;
  }).join('') : `<div class="empty-state">${horseMark(45)}No ${state.filter === 'all' ? '' : state.filter + ' '}trots yet. Your next adventure is waiting.</div>`;
}
function renderWallet() { if (state.data) $('wallet-balance').textContent = money(state.data.user.walletCents); }
async function showReceipt(id) {
  try {
    const { ride, horse: h, pickup, destination } = await api(`/api/rides/${encodeURIComponent(id)}`);
    $('receipt-body').innerHTML = `<p class="eyebrow">THANKS FOR RIDING HUBER</p><h2>${ride.status === 'completed' ? 'That was a good trot.' : 'Your ride details.'}</h2><span class="small-badge">${e(ride.status.replace('_', ' '))} · ${date(ride.createdAt)}</span><div class="receipt-horse">${portrait(h, 60)}<div><strong>${e(h.name)}</strong><p>${e(h.driver)} · ${e(h.plate)} · ★ ${e(h.rating)}</p></div></div><div class="receipt-route"><div><span class="route-dot"></span><span><strong>${e(pickup.name)}</strong><small>${e(pickup.address)}</small></span></div><div><span class="route-dot square"></span><span><strong>${e(destination.name)}</strong><small>${e(destination.address)}</small></span></div></div><div class="receipt-totals"><div><span>${ride.distanceKm} km · ${ride.durationMinutes} minutes</span><span>${money(ride.fareCents - ride.bookingFeeCents)}</span></div><div><span>Booking fee</span><span>${money(ride.bookingFeeCents)}</span></div><div class="total"><span>Total · ${e(ride.payment)}</span><span>${money(ride.fareCents)}</span></div></div><p class="receipt-id">${e(ride.id)}<br>Demo receipt. No real payment was made.</p>`;
    if (!$('receipt-dialog').open) $('receipt-dialog').showModal();
  } catch (err) { toast(err.message); }
}
async function openChat() {
  if (!state.data.activeRide) return;
  const h = horse(state.data.activeRide.horseId); $('chat-title').textContent = h.driver;
  try { const result = await api(`/api/rides/${state.data.activeRide.id}/messages`); renderMessages(result.messages); $('chat-dialog').showModal(); }
  catch (err) { toast(err.message); }
}
function renderMessages(messages) {
  $('chat-messages').innerHTML = messages.map(m => `<div class="chat-bubble ${m.from === 'rider' ? 'rider' : ''}">${e(m.text)}</div>`).join('');
  $('chat-messages').scrollTop = $('chat-messages').scrollHeight;
}

document.addEventListener('click', async event => {
  const target = event.target.closest('button,a,g[data-action]');
  if (!target) { if (!event.target.closest('.route-inputs')) { state.searchField = null; if ($('suggestions')) $('suggestions').hidden = true; } return; }
  if (target.dataset.tab) return navigate(target.dataset.tab);
  if (!state.data) return;
  if (target.dataset.service) { state.serviceId = target.dataset.service; renderBooking(); return; }
  if (target.dataset.place) return choosePlace(target.dataset.place, target.dataset.field || 'destination');
  if (target.dataset.ride) return showReceipt(target.dataset.ride);
  if (target.dataset.filter) { state.filter = target.dataset.filter; document.querySelectorAll('[data-filter]').forEach(el => el.classList.toggle('active', el === target)); return renderTrips(); }
  if (target.dataset.account) {
    $('account-dialog').close(); state.busy = false; state.quotes = {}; state.filter = 'all'; state.bookingStep = 'route';
    await login(target.dataset.account); navigate('ride'); return toast('Now riding as ' + state.data.user.name + '.');
  }
  switch (target.dataset.action) {
    case 'search': state.bookingStep = 'choose'; state.searchField = null; renderBooking(); renderMap(); break;
    case 'edit-route': state.bookingStep = 'route'; renderBooking(); renderMap(); break;
    case 'when': toast('This demo supports pickup now. Your horse is ready when you are.'); break;
    case 'account': renderUser(); $('account-dialog').showModal(); break;
    case 'book': await book(); break;
    case 'advance': await advance(); break;
    case 'cancel': await cancel(); break;
    case 'chat': await openChat(); break;
    case 'horse-info': await showReceipt(state.data.activeRide.id); break;
    case 'recenter': recenterMap(); break;
    case 'select-horse': { const h = horse(target.dataset.horse); if (h && !state.data.activeRide) { state.serviceId = h.service; renderBooking(); toast(h.name + ' says neigh.'); } break; }
  }
});
document.addEventListener('focusin', event => {
  if (event.target.dataset.search) { state.searchField = event.target.dataset.search; event.target.select(); renderSuggestions(); }
});
document.addEventListener('input', event => { if (event.target.dataset.search) renderSuggestions(event.target.value); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { state.searchField = null; if ($('suggestions')) $('suggestions').hidden = true; }
  if (event.key === 'Enter' && event.target.dataset.search) { const first = $('suggestions')?.querySelector('[data-place]'); if (first) { event.preventDefault(); choosePlace(first.dataset.place, first.dataset.field); } }
});
$('promo-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
  try { const result = await api('/api/wallet/promo', 'POST', { code: $('promo-code').value }); state.data.user = result.user; renderWallet(); $('promo-feedback').textContent = `${money(result.creditCents)} in fresh hay money. Enjoy the ride.`; $('promo-code').value = ''; toast('Promo applied. Your horse approves.'); }
  catch (err) { $('promo-feedback').textContent = err.message; }
  finally { button.disabled = false; }
});
$('profile-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
  try { const result = await api('/api/me', 'PATCH', { name: $('profile-name').value, quietRide: $('quiet-ride').checked }); state.data.user = result.user; renderUser(); $('profile-feedback').textContent = 'Preferences saved. Neigh problem.'; toast('Preferences saved.'); }
  catch (err) { $('profile-feedback').textContent = err.message; }
  finally { button.disabled = false; }
});
$('chat-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!state.data.activeRide) return;
  const button = event.target.querySelector('button'); button.disabled = true;
  try { const result = await api(`/api/rides/${state.data.activeRide.id}/messages`, 'POST', { text: $('chat-input').value }); $('chat-input').value = ''; renderMessages(result.messages); }
  catch (err) { toast(err.message); }
  finally { button.disabled = false; }
});
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
icons();
await login();
