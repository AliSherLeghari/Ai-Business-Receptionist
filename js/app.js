import { createBusiness, DAYS, uid, summary, validateState } from './model.js';
import { Repository, STORAGE_KEY } from './storage.js';
import { ask, startConversation } from './conversations.js';
import { mountVoice } from './voice.js';
let voiceSession = null, spokenReplies = false;

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
let repo;
let activeId = '', tab = 'overview', conversationId = '', editId = '', pendingOnly = false, dirty = false;
const tabs = { overview: 'Overview', business: 'Business info', services: 'Services', faqs: 'FAQs', chat: 'Receptionist', history: 'Conversations' };
const notice = (message, error = false) => { $('#notice').textContent = message; $('#notice').className = error ? 'error' : ''; $('#notice').hidden = false; };
const business = () => repo?.read().businesses.find(b => b.id === activeId);
const formatDate = value => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const badge = turn => `<span class="badge ${turn.status === 'answered' || turn.resolved ? 'ok' : 'warn'}">${turn.status === 'answered' ? 'Answered' : turn.resolved ? 'Reviewed' : turn.status === 'owner' ? 'Owner needed' : 'Unknown question'}</span>`;
const empty = (title, body) => `<div class="empty"><h2>${title}</h2><p>${body}</p></div>`;
const discard = () => !dirty || confirm('Leave without saving your current edits?');
function commit(change, message) {
  try { change(); dirty = false; if (message) notice(message); render(); return true; }
  catch (error) { notice(error.message, true); return false; }
}
function head(title, subtitle, action = '') { return `<div class="page-head"><div><p class="eyebrow">${escape(business().name)}</p><h1>${title}</h1><p class="subtitle">${subtitle}</p></div>${action}</div>`; }
function overview(b) {
  const turns = b.conversations.flatMap(c => c.turns);
  const pending = turns.filter(t => t.status !== 'answered' && !t.resolved);
  return head('Your front desk, organized.', 'Keep your information current. Give customers clear answers.') +
    `<div class="stats"><div class="stat"><strong>${b.conversations.length}</strong><span>Conversations</span></div><div class="stat"><strong>${pending.length}</strong><span>Need attention</span></div><div class="stat"><strong>${b.faqs.length + b.services.length}</strong><span>Knowledge entries</span></div></div>
    <div class="grid"><section class="panel"><h2>Business knowledge</h2><p class="muted">Your receptionist answers only from this business’s saved information.</p><div class="field-stack"><div>${b.address ? '✓' : '○'} Address ${b.address ? 'saved' : 'not added'}</div><div>${b.services.length ? '✓' : '○'} ${b.services.length} services · ${b.faqs.length} FAQs</div><div>${b.hoursConfirmed ? '✓ Regular opening hours saved' : '○ Opening hours not confirmed'}</div><button data-tab="business">Edit business information</button><button data-tab="chat" class="primary">Open receptionist</button></div></section>
    <section class="panel"><h2>Owner attention</h2>${pending.length ? `<p class="muted">${pending.length} question${pending.length === 1 ? '' : 's'} waiting for your review.</p>${pending.slice(-3).reverse().map(t => `<div class="history-turn">${badge(t)}<p class="copy">${escape(t.question)}</p></div>`).join('')}<button data-tab="history" style="margin-top:16px">Review conversations</button>` : '<p class="muted">Nothing waiting for review. Questions the receptionist cannot answer will appear here.</p>'}</section></div>
    <div class="note">This is a local chat workspace. It does not receive telephone calls, send messages, confirm appointments, or notify owners. Export a backup regularly; clearing browser data removes saved records.</div>`;
}
function info(b) {
  return head('Business information', 'These details are the source of truth for your receptionist.') + `<form id="info-form"><section class="panel"><h2>Business details</h2><div class="form-grid">
    <label>Business name<input name="name" required maxlength="100" value="${escape(b.name)}"></label><label>Phone<input name="phone" type="tel" maxlength="2000" value="${escape(b.phone)}"></label>
    <label class="full">About the business<textarea name="description" maxlength="2000">${escape(b.description)}</textarea></label>
    <label>Address<textarea name="address" maxlength="2000">${escape(b.address)}</textarea></label><label>Email<input name="email" type="email" maxlength="2000" value="${escape(b.email)}"></label></div></section>
    <section class="panel"><h2>Weekly opening hours</h2><p class="muted">Use the business’s local time. Closed days are explicit. Overnight hours and holiday exceptions are not supported in Phase 1.</p>
    ${b.hours.map((h, i) => `<div class="hours-row"><span>${h.day}</span><label class="closed-label"><input type="checkbox" name="closed-${i}" ${h.closed ? 'checked' : ''} data-day="${i}">Closed</label><label>Opens<input type="time" name="open-${i}" value="${h.open}" ${h.closed ? 'disabled' : ''} required></label><label>Closes<input type="time" name="close-${i}" value="${h.close}" ${h.closed ? 'disabled' : ''} required></label></div>`).join('')}</section><button class="primary">Save business information</button></form>
    <div class="danger-zone"><div><h3>Delete this business</h3><p class="muted">Permanently removes its knowledge and conversations from this browser.</p></div><button class="danger" data-action="delete-business">Delete business</button></div>`;
}
function services(b) {
  const item = b.services.find(s => s.id === editId);
  return head('Services & prices', 'Use explicit prices, including currency or “from” pricing where needed.') + `<div class="grid"><section class="panel"><h2>${item ? 'Edit service' : 'Add a service'}</h2><form id="service-form" class="field-stack"><label>Service name<input name="name" required maxlength="100" value="${escape(item?.name)}"></label><label>Price<input name="price" maxlength="100" placeholder="e.g. PKR 2,000 or From $40" value="${escape(item?.price)}"></label><label>Description<textarea name="description" maxlength="2000">${escape(item?.description)}</textarea></label><div class="actions"><button class="primary">${item ? 'Save service' : 'Add service'}</button>${item ? '<button type="button" data-action="cancel-edit">Cancel</button>' : ''}</div></form></section><section class="panel"><h2>Saved services <span class="badge">${b.services.length}/100</span></h2>${b.services.length ? b.services.map(s => `<div class="list-item"><div><h3 class="copy">${escape(s.name)}</h3><p class="price">${escape(s.price || 'Price not provided')}</p><p class="copy muted">${escape(s.description)}</p></div><div class="actions"><button class="small" data-action="edit-service" data-id="${s.id}">Edit</button><button class="small danger" data-action="delete-service" data-id="${s.id}">Delete</button></div></div>`).join('') : '<p class="muted">Add your first service to help customers discover what you offer.</p>'}</section></div>`;
}
function faqs(b) {
  const item = b.faqs.find(f => f.id === editId);
  return head('Frequently asked questions', 'Save verified answers and the alternate questions customers might ask.') + `<div class="grid"><section class="panel"><h2>${item ? 'Edit FAQ' : 'Add an FAQ'}</h2><form id="faq-form" class="field-stack"><label>Question<input name="question" required maxlength="500" placeholder="Do you have parking?" value="${escape(item?.question)}"></label><label>Answer<textarea name="answer" required maxlength="2000">${escape(item?.answer)}</textarea></label><label>Alternate questions<textarea name="aliases" maxlength="10020" placeholder="Is parking available?&#10;Where can I park?">${escape(item?.aliases.join('\n'))}</textarea><span class="hint">One complete question per line, up to 20. Matches ignore case and punctuation. Unrecognized wording is flagged for the owner.</span></label><div class="actions"><button class="primary">${item ? 'Save FAQ' : 'Add FAQ'}</button>${item ? '<button type="button" data-action="cancel-edit">Cancel</button>' : ''}</div></form></section><section class="panel"><h2>Saved answers <span class="badge">${b.faqs.length}/100</span></h2>${b.faqs.length ? b.faqs.map(f => `<div class="list-item"><div><h3 class="copy">${escape(f.question)}</h3><p class="copy">${escape(f.answer)}</p><p class="hint copy">${f.aliases.length ? `Also matches: ${escape(f.aliases.join(' · '))}` : 'No alternate questions'}</p></div><div class="actions"><button class="small" data-action="edit-faq" data-id="${f.id}">Edit</button><button class="small danger" data-action="delete-faq" data-id="${f.id}">Delete</button></div></div>`).join('') : '<p class="muted">Add answers about parking, policies, accessibility, and other common questions. Requests for owner actions always go to review.</p>'}</section></div>`;
}
function chat(b) {
  const c = b.conversations.find(c => c.id === conversationId);
  return head('Receptionist', 'A customer chat powered by your saved business knowledge.', c ? '<button data-action="new-chat">New conversation</button>' : '') + '<p class="note">Conversations stay on this device. Owner flags are visible here only; no external messages or telephone calls are sent.</p>' + (c ? `<section class="panel"><h2>${escape(c.customer)}</h2><p class="muted">${escape(c.contact || 'No contact details shared')} · ${escape(formatDate(c.createdAt))}</p><div class="chat-log" id="chat-log" role="log" aria-label="Conversation messages" aria-live="polite">${c.turns.length ? c.turns.map(t => `<div class="message customer"><small>Customer</small><div class="copy">${escape(t.question)}</div></div><div class="message"><small>Receptionist</small><div class="copy">${escape(t.answer)}</div><small class="source">${escape(t.source)}</small>${badge(t)}</div>`).join('') : '<p class="muted">Welcome. Ask about our hours, address, services, or FAQs.</p>'}</div><div class="suggestions">${['What are your hours?', 'What services do you offer?', 'Where are you located?'].map(q => `<button class="small" data-question="${q}">${q}</button>`).join('')}</div><form id="chat-form" class="chat-form"><label>Your question<textarea name="question" required maxlength="1000" placeholder="Type a question…"></textarea></label><button class="primary">Send question</button></form><div id="owner-voice" class="voice-panel"></div></section>` : `<section class="panel"><h2>Start a customer conversation</h2><p class="muted">A name and contact detail are optional. Avoid storing sensitive information.</p><form id="conversation-form"><div class="form-grid"><label>Customer name<input name="customer" maxlength="100" placeholder="Guest" autocomplete="off"></label><label>Contact details (optional)<input name="contact" maxlength="200" placeholder="Phone or email for your records" autocomplete="off"></label></div><button class="primary">Start conversation</button></form></section>`);
}
function history(b) {
  const conversations = [...b.conversations].reverse().filter(c => !pendingOnly || summary(c).pending.length);
  return head('Conversations', 'Review customer questions, owner summaries, and follow-up notes.') + `<label class="filter-row"><input type="checkbox" id="pending-filter" ${pendingOnly ? 'checked' : ''}>Only needs attention</label>` + (conversations.length ? conversations.map(c => {
    const s = summary(c);
    return `<article class="panel history-card"><div class="page-head"><div><h2 class="copy">${escape(c.customer)}</h2><p class="muted copy">${escape(c.contact || 'No contact details')} · ${escape(formatDate(c.createdAt))}</p></div><span class="badge ${s.pending.length ? 'warn' : 'ok'}">${s.pending.length ? `${s.pending.length} need attention` : 'Up to date'}</span></div><h3>Owner summary</h3><p class="copy">${s.questions} question${s.questions === 1 ? '' : 's'} · ${s.answered} answered from knowledge · ${s.pending.length} pending review.</p>${s.topics.length ? `<p class="copy muted">Topics: ${escape(s.topics.join('; '))}</p>` : ''}<p class="copy"><strong>Latest:</strong> ${escape(s.latest)}</p><details ${s.pending.length ? 'open' : ''}><summary>Full conversation & review</summary>${c.turns.map(t => `<div class="history-turn"><p class="copy"><strong>Customer:</strong> ${escape(t.question)}</p><p class="copy"><strong>Receptionist:</strong> ${escape(t.answer)}</p><p class="hint">${escape(formatDate(t.at))} · ${escape(t.source)}</p><div class="actions">${badge(t)}${t.status !== 'answered' ? `<button class="small" data-action="resolve" data-conversation="${c.id}" data-id="${t.id}">${t.resolved ? 'Reopen review' : 'Mark reviewed'}</button>` : ''}</div></div>`).join('') || '<p class="muted">No messages yet.</p>'}</details><form class="note-form" data-conversation="${c.id}"><label>Private owner note<textarea name="note" maxlength="2000" placeholder="Record your follow-up here. This is not sent to the customer.">${escape(c.note)}</textarea></label><button class="small" style="margin:10px 0 18px">Save note</button></form><div class="actions"><button data-action="open-chat" data-id="${c.id}">Continue conversation</button><button class="danger" data-action="delete-chat" data-id="${c.id}">Delete conversation</button></div></article>`;
  }).join('') : empty('No conversations to show', pendingOnly ? 'There are no questions waiting for owner review.' : 'Start a conversation in the Receptionist tab. Customer history will appear here.'));
}
function render() {
  voiceSession?.destroy(); voiceSession = null;
  const state = repo?.read() || { businesses: [] };
  if (!state.businesses.some(b => b.id === activeId)) activeId = state.businesses[0]?.id || '';
  $('#business-select').innerHTML = state.businesses.length ? state.businesses.map(b => `<option value="${escape(b.id)}" ${b.id === activeId ? 'selected' : ''}>${escape(b.name)}</option>`).join('') : '<option>No businesses yet</option>';
  $('#business-select').disabled = !state.businesses.length;
  $('#business-count').textContent = `${state.businesses.length}/3`;
  $('#add-business').disabled = state.businesses.length >= 3 || !repo || repo.blocked;
  $('#navigation').innerHTML = Object.entries(tabs).map(([key, label]) => `<button data-tab="${key}" ${key === tab ? 'aria-current="page"' : ''} ${!activeId ? 'disabled' : ''}>${label}</button>`).join('');
  if (!activeId) {
    $('#main').innerHTML = `<div class="intro"><p class="eyebrow">A clearer front desk</p><h1>Your business knowledge.<br>Ready for every conversation.</h1><p class="subtitle">Manage up to three businesses, answer common customer questions, and keep owner follow-ups in one place.</p><section class="panel"><h2>Start with your first business</h2><p class="muted">Add business details, services, prices, and FAQs. Your receptionist will use only what you’ve saved.</p><button class="primary" data-action="add-business" ${!repo || repo.blocked ? 'disabled' : ''}>Add your first business</button></section><p class="hint">Works offline after the first load. Data stays in this browser, with no account or paid API required. This is a chat tool; real telephone calls are not supported.</p></div>`;
    return;
  }
  $('#main').innerHTML = ({ overview, business: info, services, faqs, chat, history })[tab](business());
  if ($('#chat-log')) $('#chat-log').scrollTop = $('#chat-log').scrollHeight;
  if ($('#owner-voice')) voiceSession = mountVoice($('#owner-voice'), {
    spoken: spokenReplies, onSpokenChange: enabled => { spokenReplies = enabled; },
    onTranscript: text => { const input = $('[name="question"]'); input.value = text; dirty = true; input.focus(); },
  });
}
function openBusinessDialog() {
  voiceSession?.stop();
  if (!discard()) return;
  if ((repo?.read().businesses.length || 0) >= 3) return notice('You can manage up to three businesses.', true);
  $('#new-business-form').reset(); $('#business-dialog').showModal();
}
function changeTab(next) {
  voiceSession?.stop();
  if (!discard()) return;
  dirty = false; tab = next; editId = ''; render(); $('#main').focus();
}
$('#add-business').addEventListener('click', openBusinessDialog);
$('#cancel-business').addEventListener('click', () => $('#business-dialog').close());
$('#business-select').addEventListener('change', event => {
  voiceSession?.stop();
  if (!discard()) { event.target.value = activeId; return; }
  activeId = event.target.value; conversationId = ''; editId = ''; dirty = false; render();
});
document.addEventListener('input', event => { if (event.target.closest('#main form')) dirty = true; });
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('change', event => {
  const day = event.target.dataset.day;
  if (day !== undefined) {
    for (const key of ['open', 'close']) $(`[name="${key}-${day}"]`).disabled = event.target.checked;
  }
  if (event.target.id === 'pending-filter') { if (!discard()) { event.target.checked = pendingOnly; return; } dirty = false; pendingOnly = event.target.checked; render(); }
});
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.tab) return changeTab(button.dataset.tab);
  if (button.dataset.question) { $('[name="question"]').value = button.dataset.question; dirty = true; $('[name="question"]').focus(); return; }
  const action = button.dataset.action;
  if (!action) return;
  if (action === 'add-business') return openBusinessDialog();
  if (!discard()) return;
  const id = button.dataset.id;
  if (action === 'delete-business') {
    if (!confirm(`Delete ${business().name} and all its knowledge and conversations? This cannot be undone.`)) return;
    commit(() => repo.update(state => { state.businesses = state.businesses.filter(b => b.id !== activeId); }), 'Business deleted.');
    conversationId = ''; editId = ''; return;
  }
  if (action === 'cancel-edit') { editId = ''; dirty = false; render(); }
  if (action.startsWith('edit-')) { editId = id; dirty = false; render(); $('#main input')?.focus(); }
  if (action === 'delete-service' || action === 'delete-faq') {
    if (!confirm('Delete this knowledge entry? Existing conversation history will be preserved.')) return;
    const key = action === 'delete-service' ? 'services' : 'faqs';
    commit(() => repo.business(activeId, b => { b[key] = b[key].filter(item => item.id !== id); }), 'Entry deleted.');
    if (editId === id) { editId = ''; render(); }
  }
  if (action === 'new-chat') { conversationId = ''; dirty = false; render(); }
  if (action === 'open-chat') { conversationId = id; dirty = false; tab = 'chat'; render(); }
  if (action === 'delete-chat') {
    if (!confirm('Permanently delete this conversation and owner notes?')) return;
    commit(() => repo.business(activeId, b => { b.conversations = b.conversations.filter(c => c.id !== id); }), 'Conversation deleted.');
  }
  if (action === 'resolve') commit(() => repo.business(activeId, b => {
    const t = b.conversations.find(c => c.id === button.dataset.conversation).turns.find(t => t.id === id);
    t.resolved = !t.resolved;
  }), 'Review status updated. No message was sent to the customer.');
});
document.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target, data = new FormData(form);
  const value = key => String(data.get(key) || '').trim();
  if (form.id === 'new-business-form') {
    const b = createBusiness(value('name'));
    if (commit(() => { repo.update(s => { s.businesses.push(b); }); activeId = b.id; conversationId = ''; editId = ''; tab = 'business'; }, 'Business created. Add verified information below.')) $('#business-dialog').close();
  }
  if (form.id === 'info-form') commit(() => repo.business(activeId, b => {
    for (const key of ['name', 'description', 'address', 'phone', 'email']) b[key] = value(key);
    b.hoursConfirmed = true;
    b.hours = DAYS.map((day, i) => ({ day, closed: data.has(`closed-${i}`), open: data.get(`open-${i}`) || b.hours[i].open, close: data.get(`close-${i}`) || b.hours[i].close }));
  }), 'Business information saved.');
  if (form.id === 'service-form' || form.id === 'faq-form') {
    const key = form.id === 'service-form' ? 'services' : 'faqs';
    const item = key === 'services' ? { id: editId || uid(), name: value('name'), price: value('price'), description: value('description') } : { id: editId || uid(), question: value('question'), answer: value('answer'), aliases: value('aliases').split('\n').map(s => s.trim()).filter(Boolean) };
    commit(() => { repo.business(activeId, b => { const index = b[key].findIndex(entry => entry.id === item.id); if (index < 0) b[key].push(item); else b[key][index] = item; }); editId = ''; }, 'Knowledge entry saved.');
  }
  if (form.id === 'conversation-form') commit(() => repo.business(activeId, b => { conversationId = startConversation(b, value('customer'), value('contact')); }), 'Conversation started.');
  if (form.id === 'chat-form') {
    voiceSession?.stop();
    if (commit(() => repo.business(activeId, b => ask(b, conversationId, value('question'))))) {
      $('[name="question"]').focus();
      voiceSession?.speak(business().conversations.find(c => c.id === conversationId).turns.at(-1).answer);
    }
  }
  if (form.classList.contains('note-form')) commit(() => repo.business(activeId, b => { b.conversations.find(c => c.id === form.dataset.conversation).note = value('note'); }), 'Owner note saved locally.');
});
$('#backup').addEventListener('click', () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || JSON.stringify({ version: 1, businesses: [] });
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `reception-desk-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice('Backup exported. It contains business and customer data; keep it private.');
  } catch { notice('Browser storage could not be accessed for export.', true); }
});
$('#restore-button').addEventListener('click', () => { voiceSession?.stop(); $('#restore').click(); });
$('#restore').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('Backup is too large (maximum 5 MB).');
    const imported = validateState(JSON.parse(await file.text()));
    if (!discard() || !confirm(`Replace all saved businesses and conversations with this backup (${imported.businesses.length} businesses)? Export your current data first. This cannot be undone.`)) return;
    commit(() => { repo.update(state => { state.businesses = imported.businesses; }); activeId = ''; conversationId = ''; editId = ''; tab = 'overview'; }, 'Backup restored.');
  } catch (error) { notice(`Backup not restored: ${error.message}`, true); }
});
window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY || event.key === null) notice('Data changed in another tab. Reload to use the latest version. Unsaved edits have not been replaced.', true);
});
try { repo = new Repository(localStorage); repo.load(); }
catch (error) { notice(error.message || 'Local storage is unavailable in this browser.', true); }
render();
let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('#install').hidden = false; });
$('#install').addEventListener('click', async () => { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; $('#install').hidden = true; } });
window.addEventListener('appinstalled', () => { $('#install').hidden = true; notice('Reception Desk installed.'); });
const connection = () => { $('#connection').textContent = navigator.onLine ? 'Local workspace' : 'Offline · local workspace'; };
window.addEventListener('online', connection); window.addEventListener('offline', connection); connection();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => {
    $('#offline-status').textContent = 'Ready for offline use · Install from your browser’s menu';
  }).catch(() => { $('#offline-status').textContent = 'Offline support unavailable. Use HTTPS or localhost and reload.'; });
} else $('#offline-status').textContent = 'Offline support requires a browser with service workers.';
