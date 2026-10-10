import { uid } from './model.js';
import { respond } from './receptionist.js';
export function startConversation(business, customer = '', contact = '') {
  const conversation = { id: uid(), customer: customer.trim() || 'Guest', contact: contact.trim(), createdAt: new Date().toISOString(), note: '', turns: [] };
  business.conversations.push(conversation);
  return conversation.id;
}
export function ask(business, conversationId, question, adapter = respond) {
  const conversation = business.conversations.find(c => c.id === conversationId);
  if (!conversation) throw new Error('Conversation not found. Start a new conversation.');
  question = question.trim();
  if (!question || question.length > 1000) throw new Error('Enter a question of 1–1,000 characters.');
  const reply = adapter(business, question);
  conversation.turns.push({ id: uid(), question, ...reply, at: new Date().toISOString(), resolved: false });
}
