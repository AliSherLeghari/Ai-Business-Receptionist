import test from 'node:test';
import assert from 'node:assert/strict';
import { respond } from '../js/receptionist.js';
import { demoKnowledge } from '../js/demo-knowledge.js';
import { Repository, STORAGE_KEY } from '../js/storage.js';
const fixture = () => structuredClone(demoKnowledge);

test('natural opening and closing questions use the verified schedule', () => {
  for (const q of ['When do you open?', 'What time does your shop close?', 'What time do you open?', 'Could you please tell me when your shop closes?']) {
    const r = respond(fixture(), q); assert.equal(r.status, 'answered', q); assert.match(r.answer, /Monday: 09:00–18:00/);
  }
});
test('weekday variations select only the requested day', () => {
  for (const q of ['Are you open on Friday?', 'Is your shop open Friday?', 'What time does your shop close on Friday?', 'hours on friday']) {
    const r = respond(fixture(), q); assert.equal(r.status, 'answered', q); assert.match(r.answer, /Friday: 09:00–18:00/); assert.doesNotMatch(r.answer, /Monday/);
  }
});
test('contractions and service synonyms preserve the exact saved price', () => {
  for (const q of ["What's the cost of changing my screen?", 'How much for screen replacement?', 'Price for replacing the display', 'How much would it cost to replace my screen?', 'Could you tell me how much for screen replacement please?']) {
    const r = respond(fixture(), q); assert.equal(r.status, 'answered', q); assert.match(r.answer, /PKR 6,000/);
  }
});
test('curated spellings and polite wording normalize without arbitrary fuzzy matching', () => {
  for (const q of ['How much for batery replacment?', 'Please, how much for battery replacement?', 'How much does battery replacement cost?']) {
    assert.match(respond(fixture(), q).answer, /PKR 2,500/);
  }
  assert.equal(respond(fixture(), 'What is your adress?').answer, demoKnowledge.address);
  assert.equal(respond(fixture(), 'Where is your shop?').answer, demoKnowledge.address);
  assert.equal(respond(fixture(), 'How much for mysterycomponent replacement?').status, 'unknown');
});
test('repair capability requires a matching saved service, not a description keyword', () => {
  assert.equal(respond(fixture(), 'Can you fix Samsung phones?').source, 'Service: Samsung phone repair');
  const b = fixture(); b.services = [{ name: 'Phone repair', description: 'Ask about Samsung phones.', price: '$10' }];
  assert.equal(respond(b, 'Can you fix Samsung phones?').status, 'unknown');
});
test('brands, models, methods, conditions, and negation are not discarded', () => {
  for (const q of ['Can you fix Samsung S24 phones?', 'Can you fix Apple phones?', 'Can you replace Samsung phones?', 'Can you repair Samsung phones for free?', 'Do you not offer battery replacement?', 'How much for screen repair?', 'How much for waterproof screen replacement?', 'Is the battery replacement free?', 'How much for screen replacement including delivery?']) {
    assert.equal(respond(fixture(), q).status, 'unknown', q);
  }
});
test('multiple candidates abstain instead of selecting the cheapest or first service', () => {
  const b = fixture();
  b.services = [
    { name: 'Samsung screen replacement', price: '$90' },
    { name: 'Apple screen replacement', price: '$150' },
  ];
  assert.equal(respond(b, 'How much for screen replacement?').source, 'Ambiguous knowledge');
  assert.match(respond(b, 'How much for Samsung screen replacement?').answer, /\$90/);
  b.services.push({ name: 'Samsung display replacement', price: '$100' });
  assert.equal(respond(b, 'How much for Samsung screen replacement?').source, 'Ambiguous knowledge');
});
test('missing prices and unconfirmed hours never produce invented answers', () => {
  const b = fixture(); b.hoursConfirmed = false; b.services[0].price = '';
  assert.equal(respond(b, 'What time does your shop close?').status, 'unknown');
  assert.equal(respond(b, 'How much for battery replacement?').status, 'unknown');
});
test('equivalent FAQ forms retain qualifiers and detect conflicting knowledge', () => {
  assert.match(respond(fixture(), 'Is parking available?').answer, /two customer parking spaces/);
  assert.equal(respond(fixture(), 'Is free parking available?').status, 'unknown');
  assert.equal(respond(fixture(), 'Is parking not available?').status, 'unknown');
  const b = fixture(); b.faqs.push({ question: 'Is parking available?', aliases: [], answer: 'No.' });
  assert.equal(respond(b, 'Do you have parking?').source, 'Ambiguous knowledge');
});
test('owner escalation wins over saved FAQs and service/price intents', () => {
  const questions = ['How much for battery replacement and a refund?', 'I want my money back', 'I was charged twice', 'I have complaints', 'Can I make a payment?', 'Book screen replacement', 'My phone is on fire', 'This is an emergancy', 'Can I speak to someone?', 'I need a refnd', 'Are you open Friday for my booking?'];
  for (const q of questions) {
    const b = fixture(); b.faqs.push({ question: q, aliases: [], answer: 'No owner required.' });
    assert.equal(respond(b, q).status, 'owner', q);
  }
});
test('mixed intents, holidays, and availability remain unknown without exact knowledge', () => {
  for (const q of ['Where is your shop and when do you close?', 'How much for battery and screen replacement?', 'Are you open right now?', 'Are you open on Friday during Eid?', 'When do you open tomorrow?', 'Is screen replacement in stock?', 'When do you open and is parking free?']) assert.equal(respond(fixture(), q).status, 'unknown', q);
});
test('business isolation still applies to normalized service queries', () => {
  const a = fixture(), b = fixture(); b.services = [];
  assert.equal(respond(a, 'How much for batery replacement?').status, 'answered');
  assert.equal(respond(b, 'How much for batery replacement?').status, 'unknown');
});
test('published demo knowledge has no owner records or personal customer data', () => {
  assert.match(demoKnowledge.name, /fictional/);
  assert.deepEqual(Object.keys(demoKnowledge).sort(), ['address','description','email','faqs','hours','hoursConfirmed','name','phone','services'].sort());
  assert.match(demoKnowledge.email, /\.invalid$/);
});
test('Phase 1 version-1 data loads without migration or writes', () => {
  const saved = { version: 1, businesses: [{ id: 'phase1', name: 'Existing business', address: 'Saved address', description: '', email: '', phone: '', hoursConfirmed: true, hours: fixture().hours, services: [{ id: 'old-service', name: 'Battery replacement', price: '$35', description: 'Saved in Phase 1' }], faqs: [], conversations: [{ id: 'old-chat', customer: 'Private customer', contact: 'private@example.test', note: 'Private owner note', createdAt: '2026-01-01T10:00:00Z', turns: [{ id: 'old-turn', question: 'Address', answer: 'Historical answer', status: 'answered', source: 'Address', at: '2026-01-01T10:00:00Z', resolved: false }] }] }] };
  const raw = JSON.stringify(saved); let writes = 0;
  const repo = new Repository({ getItem: key => { assert.equal(key, STORAGE_KEY); return raw; }, setItem: () => { ++writes; } });
  assert.deepEqual(repo.load(), saved); assert.equal(writes, 0);
  assert.match(respond(repo.read().businesses[0], 'How much for battery replacement?').answer, /\$35/);
  assert.deepEqual(repo.read(), saved);
});

test('model suffixes such as plus are not silently discarded', () => {
  const b = fixture(); b.services = [{ name: 'Samsung S24+ screen replacement', price: '$100' }];
  assert.equal(respond(b, 'How much for Samsung S24 screen replacement?').status, 'unknown');
  assert.match(respond(b, 'How much for Samsung S24 plus screen replacement?').answer, /\$100/);
});
