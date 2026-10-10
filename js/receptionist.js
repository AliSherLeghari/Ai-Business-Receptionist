import { questionText, needsOwner, faqKey, serviceKey, serviceQuery, hoursIntent } from './matching.js';
export { normalize } from './matching.js';
// Pure, local knowledge adapter. No network, generative model, or other business.
const result = (answer, source) => ({ answer, status: 'answered', source });
const unknown = () => ({ answer: 'I don’t have a verified answer to that in this business’s saved information. I’ve flagged your question for the owner in this browser. No notification has been sent.', status: 'unknown', source: 'Missing knowledge' });
const ambiguous = () => ({ answer: 'More than one saved entry could match. Please ask about one specific service or use the full service name, including its model or option. I’ve flagged this question for owner review in this browser; no notification has been sent.', status: 'unknown', source: 'Ambiguous knowledge' });
const owner = () => ({ answer: 'This needs the business owner’s attention. I’ve flagged it for review in this browser. I cannot confirm bookings, process payments, or contact the owner for you.', status: 'owner', source: 'Owner action required' });
export function respond(business, question) {
  if (typeof question !== 'string' || question.length > 1000) return unknown();
  const q = questionText(question);
  if (!q) return unknown();
  if (needsOwner(q)) return owner();
  // Exact FAQ questions remain authoritative; broad lexical overlap is never used.
  const matches = business.faqs.filter(f => [f.question, ...f.aliases].some(a => faqKey(questionText(a)) === faqKey(q)));
  if (matches.length === 1) return result(matches[0].answer, `FAQ: ${matches[0].question}`);
  if (matches.length > 1) return ambiguous();
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)$/.test(q)) return result(`Hello! I can help with ${business.name}’s saved business information, hours, services, prices, and FAQs. What would you like to know?`, 'Greeting');
  const hours = hoursIntent(q);
  if (hours) {
    if (!business.hoursConfirmed) return unknown();
    const rows = hours.day ? business.hours.filter(h => h.day.toLowerCase() === hours.day) : business.hours;
    return result(rows.map(h => `${h.day}: ${h.closed ? 'Closed' : `${h.open}–${h.close}`}`).join('\n') + '\nRegular weekly hours in the business’s local time. Holiday exceptions are not confirmed.', 'Opening hours');
  }
  if (/^(where are you(?: located)?|where is (?:your|the) (?:shop|store|business)(?: located)?|what is your address|address|location)$/.test(q)) return business.address.trim() ? result(business.address, 'Address') : unknown();
  if (/^(what is your phone number|phone number|phone|how can i contact you|contact details|contact)$/.test(q)) {
    const details = [business.phone && `Phone: ${business.phone}`, business.email && `Email: ${business.email}`].filter(Boolean);
    return details.length ? result(details.join('\n'), 'Contact information') : unknown();
  }
  if (/^(what is your email(?: address)?|email address|email)$/.test(q)) return business.email ? result(business.email, 'Email') : unknown();
  if (/^(about|about your business|tell me about your business|what do you do)$/.test(q)) return business.description ? result(business.description, 'Business description') : unknown();
  if (/^(services|prices|price list|what services do you offer|what are your services|what are your prices|how much do your services cost)$/.test(q)) {
    return business.services.length ? result(business.services.map(s => `${s.name}: ${s.price || 'Price not provided'}${s.description ? ` — ${s.description}` : ''}`).join('\n'), 'Services and prices') : unknown();
  }
  const query = serviceQuery(q);
  const key = serviceKey(query.name);
  // Preserve qualifiers and model numbers. Repair != replacement. Do not answer
  // a generic query from a more specific service (or the reverse).
  const services = business.services.filter(s => serviceKey(s.name) === key);
  if (services.length > 1) return ambiguous();
  if (services.length === 1) {
    const s = services[0];
    if (query.price && !s.price.trim()) return unknown();
    return result(`${s.name}: ${s.price || 'Price not provided'}${s.description ? ` — ${s.description}` : ''}`, `Service: ${s.name}`);
  }
  const tokens = key.split(' ');
  const related = business.services.filter(s => tokens.every(token => serviceKey(s.name).split(' ').includes(token)));
  return related.length > 1 ? ambiguous() : unknown();
}
