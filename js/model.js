export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const uid = () => globalThis.crypto.randomUUID();
export const emptyState = () => ({ version: 1, businesses: [] });
export function createBusiness(name) {
  return { id: uid(), name: name.trim(), description: '', address: '', phone: '', email: '',
    hoursConfirmed: false, hours: DAYS.map(day => ({ day, closed: true, open: '09:00', close: '17:00' })),
    services: [], faqs: [], conversations: [] };
}
function check(condition, message) { if (!condition) throw new Error(message); }
function text(value, max = 2000) { return typeof value === 'string' && value.length <= max; }
function id(value) { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value); }
function unique(items) { return new Set(items.map(item => item.id)).size === items.length; }
export function validateState(state) {
  check(state?.version === 1 && Array.isArray(state.businesses) && state.businesses.length <= 3, 'Unsupported or invalid saved data.');
  check(unique(state.businesses), 'Duplicate business IDs.');
  for (const b of state.businesses) {
    check(id(b.id) && text(b.name, 100) && b.name.trim(), 'Business name is required (100 characters maximum).');
    for (const key of ['description', 'address', 'phone', 'email']) check(text(b[key]), `Invalid business ${key}.`);
    check(typeof b.hoursConfirmed === 'boolean', 'Invalid hours confirmation.');
    check(Array.isArray(b.hours) && b.hours.length === 7, 'Provide hours for all seven days.');
    b.hours.forEach((h, i) => {
      check(h.day === DAYS[i] && typeof h.closed === 'boolean', 'Invalid day in opening hours.');
      check([h.open, h.close].every(t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)), 'Use valid opening and closing times.');
      check(h.closed || h.open < h.close, 'Closing time must be after opening time. Overnight hours are not supported yet.');
    });
    for (const key of ['services', 'faqs', 'conversations']) check(Array.isArray(b[key]) && unique(b[key]), `Invalid ${key}.`);
    check(b.services.length <= 100 && b.faqs.length <= 100, 'Limit: 100 services and 100 FAQs per business.');
    for (const s of b.services) check(id(s.id) && text(s.name, 100) && s.name.trim() && text(s.price, 100) && text(s.description), 'Invalid service.');
    for (const f of b.faqs) check(id(f.id) && text(f.question, 500) && f.question.trim() && text(f.answer) && f.answer.trim() && Array.isArray(f.aliases) && f.aliases.length <= 20 && f.aliases.every(a => text(a, 500) && a.trim()), 'Invalid FAQ.');
    for (const c of b.conversations) {
      check(id(c.id) && text(c.customer, 100) && text(c.contact, 200) && text(c.createdAt, 100) && Number.isFinite(Date.parse(c.createdAt)) && text(c.note) && Array.isArray(c.turns) && unique(c.turns), 'Invalid conversation.');
      for (const t of c.turns) check(id(t.id) && text(t.question, 1000) && t.question.trim() && text(t.answer, 250000) && ['answered', 'unknown', 'owner'].includes(t.status) && text(t.source, 600) && text(t.at, 100) && Number.isFinite(Date.parse(t.at)) && typeof t.resolved === 'boolean', 'Invalid conversation entry.');
    }
  }
  return state;
}
export function summary(conversation) {
  const pending = conversation.turns.filter(t => t.status !== 'answered' && !t.resolved);
  return { questions: conversation.turns.length, answered: conversation.turns.filter(t => t.status === 'answered').length,
    pending, topics: [...new Set(conversation.turns.filter(t => t.status === 'answered').map(t => t.source))],
    latest: conversation.turns.at(-1)?.question || 'No questions yet' };
}
