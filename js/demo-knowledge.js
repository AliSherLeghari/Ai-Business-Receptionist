// PUBLIC, EXPLICITLY FICTIONAL EXAMPLES ONLY. This file never reads owner storage.
// Do not replace this with a serialized business or an exported backup.
export const demoKnowledge = {
  name: 'Example Repair Studio (fictional)',
  description: 'A fictional phone repair shop for demonstrating rule-based customer chat. No real services are offered.',
  address: '123 Example Lane, Demo City — fictional address',
  phone: '', email: 'hello@example.invalid', hoursConfirmed: true,
  hours: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, i) => ({ day, closed: i === 6, open: i === 5 ? '10:00' : '09:00', close: i === 5 ? '14:00' : '18:00' })),
  services: [
    { name: 'Battery replacement', price: 'Demo price: PKR 2,500', description: 'Fictional standard battery replacement.' },
    { name: 'Screen replacement', price: 'Demo price: PKR 6,000', description: 'Fictional standard screen replacement.' },
    { name: 'Samsung phone repair', price: 'Demo estimate: from PKR 3,000', description: 'Fictional general repair service. Specific models and faults require an owner review.' },
  ],
  faqs: [
    { question: 'Do you have parking?', aliases: ['Where can I park?'], answer: 'In this fictional example, two customer parking spaces are behind the shop.' },
    { question: 'Do repairs have a warranty?', aliases: ['What is your warranty policy?'], answer: 'This fictional shop lists a 30-day parts warranty. This is sample knowledge, not a real policy.' },
  ],
};
