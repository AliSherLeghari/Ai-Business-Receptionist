"""Phase 2 acceptance tests. Speech APIs are mocked; real permission/audio needs
manual Android Chrome verification. All Phase 1 tests remain unchanged.
"""
import json
import unittest
from pathlib import Path
from playwright.sync_api import expect
import browser_test as phase1

SPEECH_MOCK = r"""
(() => {
  const state = window.__speechTest = {starts: 0, aborts: 0, cancels: 0, utterances: [], instance: null};
  class Recognition {
    constructor() { state.instance = this; }
    start() { state.starts++; this.onstart?.(); }
    abort() { state.aborts++; }
  }
  Object.defineProperty(window, 'SpeechRecognition', {value: Recognition, configurable: true});
  Object.defineProperty(window, 'webkitSpeechRecognition', {value: undefined, configurable: true});
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {value: class { constructor(text) { this.text = text; } }, configurable: true});
  Object.defineProperty(window, 'speechSynthesis', {value: {
    speak(utterance) { state.utterances.push(utterance); }, cancel() { state.cancels++; }
  }, configurable: true});
  state.result = text => state.instance?.onresult?.({results: [Object.assign([{transcript: text}], {isFinal: true})]});
  state.error = error => state.instance?.onerror?.({error});
})();
"""

class Phase2BrowserTests(unittest.TestCase):
    setUpClass = classmethod(phase1.BrowserTests.setUpClass.__func__)
    tearDownClass = classmethod(phase1.BrowserTests.tearDownClass.__func__)
    setUp = phase1.BrowserTests.setUp
    tearDown = phase1.BrowserTests.tearDown
    tab = phase1.BrowserTests.tab
    add_business = phase1.BrowserTests.add_business
    start_chat = phase1.BrowserTests.start_chat
    ask = phase1.BrowserTests.ask
    saved = phase1.BrowserTests.saved

    def demo(self, mock=True):
        if mock:
            self.context.add_init_script(SPEECH_MOCK)
        self.page.goto(self.url + 'demo.html')
        expect(self.page.get_by_role('heading', name='Example Repair Studio (fictional)')).to_be_visible()

    def send_demo(self, question):
        self.page.get_by_role('textbox', name='Your question').fill(question)
        self.page.get_by_role('button', name='Send question', exact=True).click()

    def test_voice_is_opt_in_and_dictation_requires_send(self):
        self.demo()
        self.assertEqual(self.page.evaluate('__speechTest.starts'), 0)
        self.assertEqual(self.page.evaluate('__speechTest.utterances.length'), 0)
        self.page.get_by_role('button', name='Start microphone').click()
        expect(self.page.get_by_role('button', name='Stop listening')).to_have_attribute('aria-pressed', 'true')
        self.assertFalse(self.page.evaluate('__speechTest.instance.continuous'))
        self.page.evaluate('__speechTest.result("What time does your shop close?")')
        expect(self.page.get_by_role('textbox', name='Your question')).to_have_value('What time does your shop close?')
        self.assertEqual(self.page.locator('#demo-log .message').count(), 0)
        expect(self.page.get_by_role('button', name='Start microphone')).to_be_enabled()
        self.page.get_by_label('Speak replies', exact=True).check()
        self.assertEqual(self.page.evaluate('__speechTest.utterances.length'), 0)
        self.page.get_by_role('button', name='Send question', exact=True).click()
        expect(self.page.locator('#demo-log .message').last).to_contain_text('Friday: 09:00–18:00')
        self.assertEqual(self.page.evaluate('__speechTest.utterances.length'), 1)
        self.page.get_by_role('button', name='Stop spoken reply', exact=True).click()
        expect(self.page.get_by_role('button', name='Stop spoken reply', exact=True)).to_be_disabled()
        self.page.get_by_label('Speak replies', exact=True).uncheck()
        self.send_demo('Where is your shop?')
        self.assertEqual(self.page.evaluate('__speechTest.utterances.length'), 1)

    def test_stop_permission_and_network_errors_keep_text_usable(self):
        self.demo()
        self.page.get_by_role('button', name='Start microphone').click()
        self.page.evaluate('() => { window.queuedResult = __speechTest.instance.onresult; }')
        self.page.get_by_role('button', name='Stop listening', exact=True).click()
        self.page.evaluate('queuedResult({results: [Object.assign([{transcript: "stale"}], {isFinal: true})]})')
        expect(self.page.get_by_role('textbox', name='Your question')).to_have_value('')
        for code, message in [('not-allowed', 'permission denied'), ('audio-capture', 'No microphone'), ('no-speech', 'No speech'), ('network', 'working connection')]:
            self.page.get_by_role('button', name='Start microphone').click()
            self.page.evaluate('(code) => __speechTest.error(code)', code)
            expect(self.page.locator('[data-voice-status]')).to_contain_text(message)
            expect(self.page.get_by_role('button', name='Start microphone')).to_be_enabled()
        self.send_demo('How much for battery replacement?')
        expect(self.page.locator('#demo-log .message').last).to_contain_text('PKR 2,500')
        self.assertEqual(self.page.evaluate('__speechTest.starts'), 5)

    def test_unsupported_speech_apis_have_text_fallback(self):
        self.context.add_init_script("""for (const key of ['SpeechRecognition', 'webkitSpeechRecognition', 'speechSynthesis', 'SpeechSynthesisUtterance']) Object.defineProperty(window, key, {value: undefined, configurable: true});""")
        self.demo(mock=False)
        expect(self.page.get_by_role('button', name='Start microphone')).to_be_disabled()
        expect(self.page.get_by_label('Speak replies', exact=True)).to_be_disabled()
        expect(self.page.locator('[data-voice-status]')).to_contain_text('Type your question instead')
        self.send_demo("What's the cost of changing my screen?")
        expect(self.page.locator('#demo-log .message').last).to_contain_text('PKR 6,000')

    def test_owner_voice_preserves_history_and_stops_on_navigation(self):
        self.context.add_init_script(SPEECH_MOCK)
        self.page.reload()
        self.add_business('Existing owner')
        self.page.get_by_label('Address', exact=True).fill('Owner address')
        self.page.get_by_role('button', name='Save business information').click()
        self.start_chat('Existing customer')
        self.assertEqual(self.page.evaluate('__speechTest.starts'), 0)
        self.page.get_by_role('button', name='Start microphone').click()
        self.page.evaluate('__speechTest.result("Where is your shop?")')
        self.page.get_by_label('Speak replies', exact=True).check()
        self.page.get_by_role('button', name='Send question', exact=True).click()
        self.assertEqual(self.saved()['businesses'][0]['conversations'][0]['turns'][0]['answer'], 'Owner address')
        self.assertEqual(self.page.evaluate('__speechTest.utterances.length'), 1)
        self.page.get_by_role('button', name='Start microphone').click()
        self.page.evaluate('() => { window.oldResult = __speechTest.instance.onresult; }')
        self.tab('Overview')
        self.page.evaluate('oldResult({results: [Object.assign([{transcript: "late"}], {isFinal: true})]})')
        self.assertEqual(self.saved()['businesses'][0]['conversations'][0]['turns'][0]['question'], 'Where is your shop?')
        self.assertGreaterEqual(self.page.evaluate('__speechTest.aborts'), 2)
        self.tab('Receptionist')
        self.page.get_by_role('button', name='Start microphone').click()
        self.page.locator('#add-business').click()
        self.assertEqual(self.page.evaluate('__speechTest.aborts'), 3)
        self.page.get_by_role('button', name='Cancel', exact=True).click()
        expect(self.page.get_by_role('button', name='Start microphone')).to_have_attribute('aria-pressed', 'false')

    def test_demo_never_reads_private_data_or_displays_owner_controls(self):
        self.add_business('PRIVATE BUSINESS SENTINEL')
        self.start_chat('PRIVATE CUSTOMER SENTINEL')
        self.ask('PRIVATE QUESTION SENTINEL')
        self.tab('Conversations')
        self.page.get_by_label('Private owner note').fill('PRIVATE OWNER NOTE SENTINEL')
        self.page.get_by_role('button', name='Save note').click()
        original = self.saved()
        self.context.add_init_script("""window.__storageReads = 0; window.__storageWrites = 0;
          const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
          Storage.prototype.getItem = function(...args) { window.__storageReads++; return get.apply(this,args); };
          Storage.prototype.setItem = function(...args) { window.__storageWrites++; return set.apply(this,args); };
        """)
        self.demo()
        self.assertEqual(self.page.evaluate('__storageReads'), 0)
        for question in ['Owner notes', 'Conversation history', 'Customer contact details', 'I need a refund']:
            self.send_demo(question)
        body = self.page.locator('body').inner_text()
        self.assertNotIn('SENTINEL', body)
        self.assertNotIn('sam@example.test', body)
        self.assertEqual(self.page.locator('#navigation, #backup, #restore, #business-select, .note-form, #conversation-form').count(), 0)
        self.assertEqual(self.page.evaluate('__storageReads'), 0)
        self.assertEqual(self.page.evaluate('__storageWrites'), 0)
        self.assertEqual(self.saved(), original)
        expect(self.page.locator('#demo-log .message').last).to_contain_text('Nothing has been booked')
        self.page.get_by_role('button', name='Reset chat', exact=True).click()
        expect(self.page.get_by_text('Welcome! Try a question below, or type your own.')).to_be_visible()
        self.assertEqual(self.saved(), original)

    def test_demo_mobile_offline_and_subdirectory_deployment(self):
        # Same relative layout as GitHub Pages: the test server exposes a subdirectory
        # through a temporary symlink. This never changes production app files.
        import tempfile
        import http.server
        import threading
        import functools
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, 'project').symlink_to(phase1.ROOT, target_is_directory=True)
            server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(phase1.QuietHandler, directory=directory))
            thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
            try:
                self.page.set_viewport_size({'width': 390, 'height': 844})
                self.context.add_init_script(SPEECH_MOCK)
                self.page.goto(f'http://127.0.0.1:{server.server_port}/project/demo.html')
                self.page.evaluate('async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise(r => navigator.serviceWorker.addEventListener("controllerchange", r, {once:true})); }')
                build = json.loads((phase1.ROOT / 'release-manifest.json').read_text())['build']
                self.assertTrue(self.page.evaluate('async (build) => (await caches.keys()).includes("reception-desk-shell-" + build)', build))
                self.context.set_offline(True)
                self.page.reload()
                self.send_demo('Can you fix Samsung phones?')
                expect(self.page.locator('#demo-log .message').last).to_contain_text('Samsung phone repair')
                self.assertTrue(self.page.evaluate('async () => { try { await fetch("./not-cached", {cache:"no-store"}); return false; } catch { return true; } }'))
                for width in [320, 390, 768, 1280]:
                    self.page.set_viewport_size({'width': width, 'height': 844})
                    self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'), str(width))
                self.page.screenshot(path='/tmp/reception-desk-phase2-desktop.png', full_page=True)
                self.page.set_viewport_size({'width': 390, 'height': 844})
                self.page.screenshot(path='/tmp/reception-desk-phase2-mobile.png', full_page=True)
                self.page.reload()
                self.assertEqual(self.page.locator('#demo-log .message').count(), 0)
            finally:
                self.context.set_offline(False); server.shutdown(); server.server_close()

    def test_voice_suspends_when_hidden_and_text_submit_stops_listening(self):
        self.demo()
        self.page.get_by_role('button', name='Start microphone').click()
        self.page.evaluate('Object.defineProperty(document, "hidden", {value:true, configurable:true}); document.dispatchEvent(new Event("visibilitychange"));')
        expect(self.page.get_by_role('button', name='Start microphone')).to_have_attribute('aria-pressed', 'false')
        self.page.evaluate('Object.defineProperty(document, "hidden", {value:false, configurable:true}); document.dispatchEvent(new Event("visibilitychange"));')
        self.assertEqual(self.page.evaluate('__speechTest.starts'), 1)
        self.page.get_by_role('button', name='Start microphone').click()
        self.send_demo('Where is your shop?')
        expect(self.page.get_by_role('button', name='Start microphone')).to_have_attribute('aria-pressed', 'false')
        self.assertEqual(self.page.evaluate('__speechTest.aborts'), 2)

if __name__ == '__main__':
    unittest.main(verbosity=2)
