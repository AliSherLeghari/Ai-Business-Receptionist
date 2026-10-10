// Pure knowledge adapter: no network, generative model, or cross-business lookup.
// Future adapters can return the same { answer, status, source } contract.
export const normalize = text => text.toLowerCase().normalize('NFKC').replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const result = (answer, source) => ({ answer, status: 'answered', source });
const unknown = () => ({ answer: 'I don’t have a verified answer to that in this business’s saved information. I’ve flagged your question for the owner in this browser. No notification has been sent.', status: 'unknown', source: 'Missing knowledge' });
const owner = () => ({ answer: 'This needs the business owner’s attention. I’ve flagged it for review in this browser. I cannot confirm bookings, process payments, or contact the owner for you.', status: 'owner', source: 'Owner action required' });
export function respond(business, question) {
  const q = normalize(question);
  if (!q || q.length > 1000) return unknown();
  if (/\b(owner|manager|human|person|complaint|complain|refund|cancel|cancellation|reschedule|book|booking|reserve|reservation|appointment|discount|negotiate|payment|pay|emergency|urgent)\b/.test(q)) return owner();
  const matches = business.faqs.filter(f => [f.question, ...f.aliases].some(a => normalize(a) === q));
  if (matches.length === 1) return result(matches[0].answer, `FAQ: ${matches[0].question}`);
  if (matches.length > 1) return unknown();
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)$/.test(q)) return result(`Hello! I can help with ${business.name}’s saved business information, hours, services, prices, and FAQs. What would you like to know?`, 'Greeting');
  if (/^(what are your hours|what are your opening hours|opening hours|hours|timings|when are you open|when do you open|when do you close)$/.test(q)) {
    if (!business.hoursConfirmed) return unknown();
    return result(business.hours.map(h => `${h.day}: ${h.closed ? 'Closed' : `${h.open}–${h.close}`}`).join('\n') + '\nRegular weekly hours in the business’s local time. Holiday exceptions are not confirmed.', 'Opening hours');
  }
  const day = q.match(/^(?:are you open on|what are your hours on|hours on) (monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/)?.[1];
  if (day) {
    if (!business.hoursConfirmed) return unknown();
    const h = business.hours.find(h => h.day.toLowerCase() === day);
    return result(`${h.day}: ${h.closed ? 'Closed' : `${h.open}–${h.close}`} (regular hours, business local time). Holiday exceptions are not confirmed.`, 'Opening hours');
  }
  if (/^(where are you located|where are you|what is your address|address|location)$/.test(q)) return business.address.trim() ? result(business.address, 'Address') : unknown();
  if (/^(what is your phone number|phone number|phone|how can i contact you|contact details|contact)$/.test(q)) {
    const details = [business.phone && `Phone: ${business.phone}`, business.email && `Email: ${business.email}`].filter(Boolean);
    return details.length ? result(details.join('\n'), 'Contact information') : unknown();
  }
  if (/^(what is your email|email address|email)$/.test(q)) return business.email ? result(business.email, 'Email') : unknown();
  if (/^(about|about your business|tell me about your business|what do you do)$/.test(q)) return business.description ? result(business.description, 'Business description') : unknown();
  if (/^(services|prices|price list|what services do you offer|what are your services|what are your prices|how much do your services cost)$/.test(q)) {
    return business.services.length ? result(business.services.map(s => `${s.name}: ${s.price || 'Price not provided'}${s.description ? ` — ${s.description}` : ''}`).join('\n'), 'Services and prices') : unknown();
  }
  const serviceName = q.match(/^(?:how much is|how much does|what is the price of|price of|tell me about|do you offer) (.+?)(?: cost)?$/)?.[1] || q;
  const services = business.services.filter(s => normalize(s.name) === serviceName);
  if (services.length === 1) {
    const s = services[0];
    if (/^(how much|what is the price|price of)/.test(q) && !s.price.trim()) return unknown();
    return result(`${s.name}: ${s.price || 'Price not provided'}${s.description ? ` — ${s.description}` : ''}`, `Service: ${s.name}`);
  }
  return unknown();
}
