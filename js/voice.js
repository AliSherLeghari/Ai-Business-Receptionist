// Browser speech is optional and may be provided by a browser vendor's online
// service. This module never records audio or asks for permission on construction.
const ERRORS = {
  'not-allowed': 'Microphone permission denied. Allow microphone access in browser site settings, or type instead.',
  'service-not-allowed': 'Speech recognition is blocked by this browser. Type your question instead.',
  'audio-capture': 'No microphone is available. Check your microphone or type instead.',
  'no-speech': 'No speech was detected. Tap the microphone to try again, or type instead.',
  network: 'Speech recognition needs a working connection in this browser. Type your question instead.',
  'language-not-supported': 'English speech recognition is unavailable. Type your question instead.',
  aborted: 'Listening stopped. You can type your question.',
};
export class VoiceController {
  constructor({ Recognition, synthesis, Utterance, onTranscript = () => {}, onChange = () => {},
    setTimer = (callback, delay) => setTimeout(callback, delay), clearTimer = timer => clearTimeout(timer) } = {}) {
    Object.assign(this, { Recognition, synthesis, Utterance, onTranscript, onChange, setTimer, clearTimer });
    this.recognition = null; this.timer = null; this.session = 0; this.speechSession = 0;
    this.listening = false; this.speaking = false; this.spoken = false; this.disposed = false;
    this.message = Recognition ? 'Microphone off. Tap to dictate one question, then review and send.' : 'Speech recognition is unavailable in this browser. Type your question instead.';
  }
  snapshot() {
    return { supported: Boolean(this.Recognition), speechSupported: Boolean(this.synthesis && this.Utterance),
      listening: this.listening, speaking: this.speaking, spoken: this.spoken, message: this.message };
  }
  notify(message) { if (message) this.message = message; if (!this.disposed) this.onChange(this.snapshot()); }
  start() {
    if (this.disposed || this.listening) return;
    if (!this.Recognition) return this.notify('Speech recognition is unavailable in this browser. Type your question instead.');
    this.stopSpeaking();
    const session = ++this.session;
    try {
      const recognition = new this.Recognition();
      this.recognition = recognition; this.listening = true;
      recognition.lang = 'en-US'; recognition.continuous = false;
      recognition.interimResults = false; recognition.maxAlternatives = 1;
      const current = () => !this.disposed && session === this.session;
      recognition.onstart = () => { if (current()) this.notify('Listening for one question… Tap Stop listening to cancel.'); };
      recognition.onresult = event => {
        if (!current()) return;
        const parts = Array.from(event.results).filter(result => result.isFinal).map(result => result[0]?.transcript || '');
        const transcript = parts.join(' ').trim();
        if (!transcript) return;
        this.stopListening(transcript.length > 1000 ? 'Dictation was too long. Shorten it to 1,000 characters and try again.' : 'Text ready. Review the question and press Send question.');
        if (transcript.length <= 1000) this.onTranscript(transcript);
      };
      recognition.onerror = event => { if (current()) this.stopListening(ERRORS[event.error] || 'Speech recognition failed. Type your question or tap the microphone to retry.'); };
      recognition.onend = () => {
        if (!current()) return;
        this.clearTimer(this.timer); this.timer = null; this.recognition = null;
        this.listening = false; ++this.session;
        this.notify('Listening ended. Review any text, or tap the microphone to try again.');
      };
      this.notify('Starting microphone… You may be asked for permission.');
      recognition.start();
      if (current()) this.timer = this.setTimer(() => this.stopListening('Listening stopped after 20 seconds. Tap the microphone to try again, or type instead.'), 20000);
    } catch (error) {
      this.stopListening(error.name === 'NotAllowedError' ? ERRORS['not-allowed'] : 'Could not start the microphone. Type instead, or check browser permissions.');
    }
  }
  stopListening(message = 'Listening stopped. You can type your question.') {
    ++this.session;
    const recognition = this.recognition; this.recognition = null;
    this.clearTimer(this.timer); this.timer = null; this.listening = false;
    if (recognition) {
      recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
      try { recognition.abort(); } catch { /* Already stopped by the browser. */ }
    }
    this.notify(message);
  }
  setSpoken(enabled) {
    this.spoken = Boolean(enabled && this.synthesis && this.Utterance);
    if (!this.spoken) this.stopSpeaking();
    this.notify(this.spoken ? 'Spoken replies enabled for new answers. You can mute or stop at any time.' : 'Spoken replies muted. Text chat remains available.');
  }
  stopSpeaking() {
    ++this.speechSession;
    try { this.synthesis?.cancel(); } catch { /* Text fallback remains available. */ }
    this.speaking = false; this.notify();
  }
  speak(text) {
    if (this.disposed || !this.spoken || !this.synthesis || !this.Utterance) return;
    if (this.listening) this.stopListening();
    this.stopSpeaking();
    if (text.length > 1200) return this.notify('This reply is too long to speak. Read the full answer in chat.');
    const session = ++this.speechSession;
    try {
      const utterance = new this.Utterance(text); utterance.lang = 'en-US';
      this.speaking = true;
      utterance.onend = () => { if (session === this.speechSession && !this.disposed) { this.speaking = false; this.notify('Spoken reply finished. Microphone is off.'); } };
      utterance.onerror = () => { if (session === this.speechSession && !this.disposed) { this.speaking = false; this.notify('Spoken reply is unavailable. Read the answer in chat.'); } };
      this.notify('Speaking the answer. Microphone is off.'); this.synthesis.speak(utterance);
    } catch { this.speaking = false; this.notify('Spoken reply is unavailable. Read the answer in chat.'); }
  }
  suspend() { this.stopListening(); this.stopSpeaking(); }
  destroy() { this.disposed = true; this.suspend(); }
}

// Shared, accessible controls for owner chat and the independent customer demo.
export function mountVoice(element, { onTranscript, spoken = false, onSpokenChange = () => {} }) {
  element.innerHTML = `<div class="voice-actions"><button type="button" data-mic aria-pressed="false">🎙 Start microphone</button><button type="button" data-stop-speech disabled>Stop spoken reply</button><label class="voice-toggle"><input type="checkbox" data-spoken>Speak replies</label></div><p class="hint" data-voice-status role="status" aria-live="polite"></p><p class="hint">Optional browser voice · English · Your browser may send speech to its recognition service and may require internet. This app stores no audio. Review dictated text before sending.</p>`;
  const mic = element.querySelector('[data-mic]');
  const stop = element.querySelector('[data-stop-speech]');
  const toggle = element.querySelector('[data-spoken]');
  const status = element.querySelector('[data-voice-status]');
  const update = state => {
    mic.disabled = !state.supported;
    mic.textContent = state.listening ? 'Stop listening' : '🎙 Start microphone';
    mic.setAttribute('aria-pressed', String(state.listening));
    stop.disabled = !state.speaking; toggle.disabled = !state.speechSupported;
    toggle.checked = state.spoken; status.textContent = state.message;
  };
  const controller = new VoiceController({ Recognition: window.SpeechRecognition || window.webkitSpeechRecognition,
    synthesis: window.speechSynthesis, Utterance: window.SpeechSynthesisUtterance, onTranscript, onChange: update });
  controller.spoken = Boolean(spoken && controller.snapshot().speechSupported);
  update(controller.snapshot());
  mic.addEventListener('click', () => controller.listening ? controller.stopListening() : controller.start());
  stop.addEventListener('click', () => { controller.stopSpeaking(); controller.notify('Spoken reply stopped.'); });
  toggle.addEventListener('change', () => { controller.setSpoken(toggle.checked); onSpokenChange(controller.spoken); });
  const hide = () => { if (document.hidden) controller.suspend(); };
  const leave = () => controller.suspend();
  document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', leave);
  return { speak: text => controller.speak(text), stop: () => controller.suspend(), destroy: () => {
    document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', leave); controller.destroy();
  } };
}
