import { demoKnowledge } from './demo-knowledge.js';
import { respond } from './receptionist.js';
import { mountVoice } from './voice.js';

// Deliberately no Repository/localStorage import, URL-selected business, contact
// fields, or persisted demo transcript. Public demo uses only fictional knowledge.
const input = document.querySelector('#demo-question');
const log = document.querySelector('#demo-log');
const status = document.querySelector('#demo-status');
const voice = mountVoice(document.querySelector('#demo-voice'), { onTranscript: text => { input.value = text; input.focus(); } });
let turns = 0;
function message(label, text, customer = false, source = '') {
  const bubble = document.createElement('div'); bubble.className = `message${customer ? ' customer' : ''}`;
  const title = document.createElement('small'); title.textContent = label;
  const body = document.createElement('div'); body.className = 'copy'; body.textContent = text;
  bubble.append(title, body);
  if (source) { const cite = document.createElement('small'); cite.className = 'source'; cite.textContent = source; bubble.append(cite); }
  log.append(bubble);
}
document.querySelector('#demo-form').addEventListener('submit', event => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question || question.length > 1000) { status.textContent = 'Enter a question of 1–1,000 characters.'; return; }
  if (turns >= 100) { status.textContent = 'This demo has reached 100 questions. Reset chat to start again.'; return; }
  voice.stop();
  if (!turns) log.replaceChildren();
  const reply = respond(demoKnowledge, question);
  if (reply.status === 'owner') reply.answer = 'This request requires a real business owner. This fictional demo cannot act on it. Nothing has been booked, saved for an owner, or sent.';
  if (reply.status === 'unknown') reply.answer = reply.source === 'Ambiguous knowledge'
    ? 'That could match more than one saved entry. Please specify the full service name or model. Demo only: nothing is sent to an owner.'
    : 'I do not have a verified answer in this fictional business’s knowledge. Please ask a more specific question. Demo only: nothing is sent to an owner.';
  message('You', question, true); message('Receptionist', reply.answer, false, reply.source);
  ++turns; input.value = ''; status.textContent = ''; log.scrollTop = log.scrollHeight;
  input.focus(); voice.speak(reply.answer);
});
document.querySelectorAll('[data-question]').forEach(button => button.addEventListener('click', () => { input.value = button.dataset.question; input.focus(); }));
document.querySelector('#reset-demo').addEventListener('click', () => {
  // Reload discards all in-memory text and stops voice without touching storage.
  voice.destroy(); location.reload();
});
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => {
    document.querySelector('#offline-status').textContent = 'Text demo ready offline · Browser speech may need internet';
  }).catch(() => { document.querySelector('#offline-status').textContent = 'Offline cache unavailable. Use HTTPS or localhost and reload.'; });
} else document.querySelector('#offline-status').textContent = 'Offline caching is unavailable in this browser.';
