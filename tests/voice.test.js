import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceController } from '../js/voice.js';
function setup({ unsupported = false, startError, speechError = false } = {}) {
  const calls = { starts: 0, aborts: 0, cancel: 0, transcripts: [], utterances: [] };
  let recognition, timer;
  class Recognition {
    constructor() { recognition = this; }
    start() { ++calls.starts; if (startError) throw startError; this.onstart?.(); }
    abort() { ++calls.aborts; }
  }
  class Utterance { constructor(text) { this.text = text; } }
  const voice = new VoiceController({ Recognition: unsupported ? undefined : Recognition, Utterance,
    synthesis: { cancel: () => { ++calls.cancel; }, speak: utterance => { if (speechError) throw Error('unavailable'); calls.utterances.push(utterance); } },
    onTranscript: text => calls.transcripts.push(text), setTimer: callback => { timer = callback; return 1; }, clearTimer: () => { timer = null; } });
  return { voice, calls, recognition: () => recognition, timeout: () => timer?.() };
}
function event(text) { return { results: [Object.assign([{ transcript: text }], { isFinal: true })] }; }
test('construction never starts listening or speaking', () => {
  const { voice, calls } = setup(); assert.equal(calls.starts, 0); assert.equal(calls.utterances.length, 0); assert.equal(voice.spoken, false);
});
test('explicit start creates bounded single-shot recognition', () => {
  const { voice, recognition, calls } = setup(); voice.start(); voice.start();
  assert.equal(calls.starts, 1); assert.equal(recognition().continuous, false); assert.equal(recognition().interimResults, false); assert.equal(voice.listening, true);
});
test('final transcript ends listening and returns text without submitting a chat', () => {
  const { voice, recognition, calls } = setup(); voice.start(); recognition().onresult(event('  When do you open?  '));
  assert.deepEqual(calls.transcripts, ['When do you open?']); assert.equal(voice.listening, false); assert.equal(calls.aborts, 1); assert.match(voice.message, /Review/);
});
test('manual stop ignores already queued recognition callbacks', () => {
  const { voice, recognition, calls } = setup(); voice.start(); const callback = recognition().onresult; voice.stopListening(); callback(event('Late result'));
  assert.deepEqual(calls.transcripts, []); assert.equal(voice.listening, false);
});
test('timeout aborts once and never automatically restarts recognition', () => {
  const { voice, calls, timeout } = setup(); voice.start(); timeout(); assert.equal(voice.listening, false); assert.equal(calls.starts, 1); assert.equal(calls.aborts, 1); assert.match(voice.message, /20 seconds/);
});
test('unsupported browsers keep a clear text fallback', () => {
  const { voice, calls } = setup({ unsupported: true }); voice.start(); assert.equal(calls.starts, 0); assert.match(voice.message, /Type your question/);
});
test('permission denial and common recognition failures end listening with actionable messages', () => {
  for (const code of ['not-allowed', 'service-not-allowed', 'audio-capture', 'no-speech', 'network', 'language-not-supported', 'unknown-error']) {
    const { voice, recognition, calls } = setup(); voice.start(); recognition().onerror({ error: code });
    assert.equal(voice.listening, false, code); assert.match(voice.message, /[Tt]ype/, code); assert.equal(calls.starts, 1);
  }
});
test('start exceptions do not leave controls in a listening state', () => {
  const error = Error('denied'); error.name = 'NotAllowedError'; const { voice } = setup({ startError: error }); voice.start(); assert.equal(voice.listening, false); assert.match(voice.message, /permission denied/);
});
test('natural end and interim results do not restart or send speech', () => {
  const { voice, recognition, calls } = setup(); voice.start(); recognition().onresult({ results: [Object.assign([{ transcript: 'interim' }], { isFinal: false })] }); recognition().onend();
  assert.deepEqual(calls.transcripts, []); assert.equal(voice.listening, false); assert.equal(calls.starts, 1);
});
test('oversized dictation is not silently truncated into a different question', () => {
  const { voice, recognition, calls } = setup(); voice.start(); recognition().onresult(event('a'.repeat(1001))); assert.deepEqual(calls.transcripts, []); assert.match(voice.message, /too long/);
});
test('spoken replies are opt-in; mute cancels current output', () => {
  const { voice, calls } = setup(); voice.speak('Muted'); assert.equal(calls.utterances.length, 0);
  voice.setSpoken(true); voice.speak('Saved answer'); assert.equal(calls.utterances[0].text, 'Saved answer'); assert.equal(voice.speaking, true);
  voice.setSpoken(false); assert.equal(voice.speaking, false); voice.speak('Still muted'); assert.equal(calls.utterances.length, 1);
});
test('listening cancels speech and speaking cancels listening to avoid feedback', () => {
  const { voice, calls } = setup(); voice.setSpoken(true); voice.speak('Answer'); voice.start(); assert.equal(voice.speaking, false);
  voice.speak('Next answer'); assert.equal(voice.listening, false); assert.equal(calls.aborts, 1);
});
test('speech failures and long answers retain the text fallback', () => {
  const { voice } = setup({ speechError: true }); voice.setSpoken(true); voice.speak('Answer'); assert.equal(voice.speaking, false); assert.match(voice.message, /Read the answer/);
  voice.speak('a'.repeat(1201)); assert.match(voice.message, /too long/);
});
test('speech callbacks from cancelled utterances cannot change the current state', () => {
  const { voice, calls } = setup(); voice.setSpoken(true); voice.speak('First'); const old = calls.utterances[0]; voice.speak('Second'); old.onend(); assert.equal(voice.speaking, true); calls.utterances[1].onend(); assert.equal(voice.speaking, false);
});
test('suspend and dispose stop microphone and speech; disposed instances cannot restart', () => {
  const { voice, recognition, calls } = setup(); voice.start(); const callback = recognition().onresult; voice.suspend(); assert.equal(voice.listening, false);
  voice.start(); voice.destroy(); callback(event('stale')); voice.start(); voice.speak('stale'); assert.equal(calls.starts, 2); assert.deepEqual(calls.transcripts, []); assert.equal(calls.utterances.length, 0);
});
