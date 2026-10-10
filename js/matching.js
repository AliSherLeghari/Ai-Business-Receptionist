// A deliberately small English vocabulary, not fuzzy retrieval. We do not drop
// brands, model numbers, negation, or qualifiers to force a knowledge match.
const SPELLING = Object.freeze({
  adress: 'address', addres: 'address', locaton: 'location', timmings: 'timings',
  openning: 'opening', batery: 'battery', batttery: 'battery', batteries: 'battery',
  replacment: 'replacement', replacemen: 'replacement', screeen: 'screen',
  samsng: 'samsung', refnd: 'refund', compaint: 'complaint', emergancy: 'emergency',
});
export function normalize(text) {
  return text.toLowerCase().normalize('NFKC').replace(/’/g, "'")
    .replace(/\bwhat'?s\b/g, 'what is').replace(/\bwhere'?s\b/g, 'where is')
    .replace(/\b(can't|cant)\b/g, 'cannot').replace(/\b(don't|dont)\b/g, 'do not')
    .replace(/\b(isn't|isnt)\b/g, 'is not').replace(/\b(aren't|arent)\b/g, 'are not')
    .replace(/'/g, '').replace(/\+/g, ' plus ').replace(/#/g, ' sharp ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    .split(/\s+/).map(word => Object.hasOwn(SPELLING, word) ? SPELLING[word] : word).join(' ');
}
export function questionText(text) {
  return normalize(text).replace(/^(?:(?:please|pls) |(?:can|could|would) you (?:please )?tell me )/, '')
    .replace(/ (?:please|pls)$/, '');
}
export function needsOwner(q) {
  return /\b(owners?|managers?|human|person|complain(?:t|ts|ing|ed)?|refund(?:s|ed|ing)?|cancel(?:led|ed|ing|lation|lations)?|reschedul(?:e|ing)|book(?:s|ing|ings|ed)?|reserv(?:e|ation|ations)|appointments?|discounts?|negotiate|payments?|pay(?:ing)?|paid|emergenc(?:y|ies)|urgent|injured|danger)\b/.test(q)
    || /\b(money back|charged twice|on fire|speak to someone|talk to someone)\b/.test(q);
}
// Only narrowly equivalent FAQ forms are generalized. Important adjectives and
// conditions remain part of the key: "free parking" never becomes "parking".
export function faqKey(q) {
  const item = q.match(/^(?:do you have|is there) (.+)$/)?.[1]
    || q.match(/^is (.+) available$/)?.[1];
  return item ? `availability:${item}` : q;
}
const SERVICE_WORDS = Object.freeze({
  replacing: 'replace', replacement: 'replace', replacements: 'replace',
  change: 'replace', changing: 'replace',
  fix: 'repair', fixing: 'repair', repairs: 'repair', repairing: 'repair',
  phones: 'phone', screens: 'screen', displays: 'screen', display: 'screen',
});
export function serviceKey(text) {
  return normalize(text).split(' ').filter(word => !['a', 'an', 'the', 'my', 'your'].includes(word))
    .map(word => Object.hasOwn(SERVICE_WORDS, word) ? SERVICE_WORDS[word] : word).sort().join(' ');
}
export function serviceQuery(q) {
  const price = q.match(/^(?:how much (?:is|for)|what is the (?:price|cost) (?:of|for)|(?:price|cost) (?:of|for)) (.+)$/)
    || q.match(/^how much does (.+) cost$/)
    || q.match(/^how much (?:do you charge|would it cost) (?:for|to) (.+)$/);
  if (price) return { name: price[1], price: true };
  const info = q.match(/^(?:tell me about|do you offer|do you provide) (.+)$/);
  if (info) return { name: info[1], price: false };
  const repair = q.match(/^(?:can|do) you (fix|repair|replace|change) (.+)$/);
  if (repair) return { name: `${repair[1]} ${repair[2]}`, price: false };
  return { name: q, price: false };
}
export function hoursIntent(q) {
  const days = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';
  const suffix = q.match(new RegExp(` (?:on )?(${days})$`));
  const base = suffix ? q.slice(0, suffix.index) : q;
  const subjects = '(?:you|your shop|your store|your business|the shop|the store)';
  const patterns = [
    /^(?:hours|opening hours|business hours|timings|opening times|closing time|what are your (?:hours|opening hours|business hours|timings))$/,
    new RegExp(`^(?:when (?:do|does) ${subjects} (?:open|close)|when (?:are|is) ${subjects} open)$`),
    new RegExp(`^when ${subjects} (?:opens|closes)$`),
    new RegExp(`^what time (?:do|does) ${subjects} (?:open|close)$`),
  ];
  if (patterns.some(pattern => pattern.test(base)) || (suffix && new RegExp(`^(?:are|is) ${subjects} open$`).test(base))) {
    return { day: suffix?.[1] || null };
  }
  return null;
}
