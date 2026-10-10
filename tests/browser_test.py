"""Real Chromium acceptance tests. Uses the environment's existing Playwright.
Run: python3 -m unittest discover -s tests -p '*_test.py' -v
No browser tooling is shipped to application users.
"""
import functools
import http.server
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
KEY = 'receptionist.phase1.v1'

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

class BrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}/'
        cls.playwright = sync_playwright().start()

    @classmethod
    def tearDownClass(cls):
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.profile = tempfile.TemporaryDirectory()
        self.context = self.playwright.chromium.launch_persistent_context(self.profile.name, executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'], viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        self.page = self.context.pages[0]
        self.errors = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.goto(self.url)
        expect(self.page.get_by_role('heading', name='Start with your first business')).to_be_visible()

    def tearDown(self):
        self.context.close()
        self.profile.cleanup()
        self.assertEqual(self.errors, [], 'Browser JavaScript errors')

    def tab(self, name):
        self.page.locator('#navigation').get_by_role('button', name=name, exact=True).click()

    def add_business(self, name):
        self.page.locator('#add-business').click()
        self.page.locator('dialog').get_by_label('Business name').fill(name)
        self.page.get_by_role('button', name='Create business', exact=True).click()
        expect(self.page.get_by_role('heading', name='Business information', exact=True)).to_be_visible()

    def start_chat(self, name='Sam'):
        self.tab('Receptionist')
        self.page.get_by_label('Customer name').fill(name)
        self.page.get_by_label('Contact details (optional)').fill('sam@example.test')
        self.page.get_by_role('button', name='Start conversation', exact=True).click()

    def ask(self, question):
        self.page.get_by_label('Your question').fill(question)
        self.page.get_by_role('button', name='Send question', exact=True).click()

    def saved(self):
        return self.page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)

    def test_complete_owner_and_customer_workflow(self):
        self.add_business('Willow Studio')
        self.page.get_by_label('Address', exact=True).fill('12 Garden Lane')
        self.page.get_by_label('Phone', exact=True).fill('+1 555 0100')
        self.page.get_by_label('Email', exact=True).fill('hello@example.test')
        self.page.get_by_label('About the business').fill('A neighborhood salon.')
        self.page.locator('[name="closed-0"]').uncheck()
        self.page.get_by_role('button', name='Save business information').click()
        self.tab('Services')
        self.page.get_by_label('Service name').fill('Haircut')
        self.page.get_by_label('Price', exact=True).fill('PKR 2,000')
        self.page.get_by_label('Description', exact=True).fill('Includes a wash.')
        self.page.get_by_role('button', name='Add service', exact=True).click()
        self.page.get_by_role('button', name='Edit', exact=True).click()
        self.page.get_by_label('Price', exact=True).fill('PKR 2,500')
        self.page.get_by_role('button', name='Save service', exact=True).click()
        self.tab('FAQs')
        self.page.get_by_label('Question', exact=True).fill('Do you have parking?')
        self.page.get_by_role('textbox', name='Answer', exact=True).fill('Two spaces behind the studio.')
        self.page.get_by_label('Alternate questions').fill('Where can I park?')
        self.page.get_by_role('button', name='Add FAQ', exact=True).click()
        self.start_chat()
        self.ask('How much is haircut?')
        expect(self.page.locator('.message').last).to_contain_text('PKR 2,500')
        self.ask('Where can I park?')
        expect(self.page.locator('.message').last).to_contain_text('Two spaces behind the studio.')
        self.ask('What are your hours?')
        expect(self.page.locator('.message').last).to_contain_text('Monday: 09:00–17:00')
        self.ask('Do you offer catering?')
        expect(self.page.locator('.message').last).to_contain_text('Unknown question')
        self.ask('I want a refund')
        expect(self.page.locator('.message').last).to_contain_text('Owner needed')
        self.tab('Conversations')
        expect(self.page.get_by_text('5 questions · 3 answered from knowledge · 2 pending review.')).to_be_visible()
        self.page.get_by_role('button', name='Mark reviewed', exact=True).first.click()
        expect(self.page.get_by_text('5 questions · 3 answered from knowledge · 1 pending review.')).to_be_visible()
        self.page.get_by_label('Private owner note').fill('Call Sam after checking the refund policy.')
        self.page.get_by_role('button', name='Save note').click()
        self.page.reload()
        self.tab('Conversations')
        expect(self.page.get_by_label('Private owner note')).to_have_value('Call Sam after checking the refund policy.')
        self.page.get_by_role('button', name='Reopen review').click()
        expect(self.page.get_by_text('5 questions · 3 answered from knowledge · 2 pending review.')).to_be_visible()
        self.tab('Overview')
        Path('/tmp/reception-desk-desktop.png').unlink(missing_ok=True)
        self.page.screenshot(path='/tmp/reception-desk-desktop.png', full_page=True)
        self.assertEqual(len(self.saved()['businesses'][0]['conversations'][0]['turns']), 5)

    def test_business_limit_isolation_and_deletion(self):
        self.add_business('First business')
        self.page.get_by_label('Address', exact=True).fill('First-only address')
        self.page.get_by_role('button', name='Save business information').click()
        self.start_chat('First customer')
        self.ask('Address')
        self.add_business('Second business')
        self.start_chat('Second customer')
        self.ask('Address')
        expect(self.page.locator('.message').last).to_contain_text('Unknown question')
        self.assertNotIn('First-only address', self.page.locator('#main').inner_text())
        self.tab('Conversations')
        self.assertNotIn('First customer', self.page.locator('#main').inner_text())
        self.add_business('Third business')
        expect(self.page.locator('#add-business')).to_be_disabled()
        self.page.once('dialog', lambda dialog: dialog.accept())
        self.page.get_by_role('button', name='Delete business', exact=True).click()
        expect(self.page.locator('#add-business')).to_be_enabled()
        saved = self.saved()
        self.assertEqual([b['name'] for b in saved['businesses']], ['First business', 'Second business'])
        self.assertEqual(saved['businesses'][0]['conversations'][0]['customer'], 'First customer')
        self.assertEqual(saved['businesses'][1]['conversations'][0]['customer'], 'Second customer')

    def test_mobile_offline_pwa_and_manifest(self):
        self.page.set_viewport_size({'width': 390, 'height': 844})
        self.add_business('Mobile Studio')
        self.page.get_by_label('Address', exact=True).fill('Offline address')
        self.page.get_by_role('button', name='Save business information').click()
        self.page.evaluate('async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, {once: true})); }')
        client = self.context.new_cdp_session(self.page)
        manifest = client.send('Page.getAppManifest')
        self.assertEqual(manifest.get('errors'), [])
        parsed = json.loads(manifest['data'])
        self.assertEqual(parsed['display'], 'standalone')
        self.assertEqual(len(parsed['icons']), 3)
        issues = client.send('Page.getInstallabilityErrors')
        self.assertEqual(issues['installabilityErrors'], [], issues)
        self.context.set_offline(True)
        self.page.reload()
        self.assertTrue(self.page.evaluate('async () => { try { await fetch("./offline-network-probe", {cache: "no-store"}); return false; } catch { return true; } }'), 'Uncached network requests must fail while offline')
        self.start_chat('Offline customer')
        self.ask('Address')
        expect(self.page.locator('.message').last).to_contain_text('Offline address')
        for tab in ['Business info', 'Services', 'FAQs', 'Receptionist', 'Conversations', 'Overview']:
            self.tab(tab)
            self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Horizontal overflow in {tab}')
        self.page.screenshot(path='/tmp/reception-desk-mobile.png', full_page=True)
        self.page.reload()
        self.tab('Conversations')
        expect(self.page.get_by_role('heading', name='Offline customer', exact=True)).to_be_visible()
        self.context.set_offline(False)

    def test_xss_backup_restore_and_invalid_backup(self):
        self.add_business('<img src=x onerror=alert(1)>')
        self.page.get_by_label('About the business').fill('<script>window.compromised=true</script>')
        self.page.get_by_role('button', name='Save business information').click()
        self.tab('Overview')
        self.assertEqual(self.page.locator('#main img, #main script').count(), 0)
        self.assertIsNone(self.page.evaluate('window.compromised'))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'backup.json'
            with self.page.expect_download() as download:
                self.page.get_by_role('button', name='Export backup').click()
            download.value.save_as(path)
            original = json.loads(path.read_text())
            self.add_business('Temporary')
            self.page.once('dialog', lambda dialog: dialog.accept())
            self.page.locator('#restore').set_input_files(str(path))
            expect(self.page.locator('#notice')).to_have_text('Backup restored.')
            self.assertEqual(self.saved(), original)
            path.write_text('{"version": 999, "businesses": []}')
            self.page.locator('#restore').set_input_files(str(path))
            expect(self.page.locator('#notice')).to_contain_text('Backup not restored')
            self.assertEqual(self.saved(), original)

    def test_storage_failure_and_conflicting_tab(self):
        self.add_business('Original')
        original = self.saved()
        self.page.evaluate('() => { Storage.prototype.setItem = function() { throw new DOMException("Full", "QuotaExceededError"); }; }')
        self.page.locator('#main').get_by_label('Business name', exact=True).fill('Unsaved')
        self.page.get_by_role('button', name='Save business information').click()
        expect(self.page.locator('#notice')).to_contain_text('Could not save')
        self.assertEqual(self.saved(), original)
        self.page.once('dialog', lambda dialog: dialog.accept())
        self.page.reload()
        other = self.context.new_page()
        other.goto(self.url)
        other.locator('#navigation').get_by_role('button', name='Business info', exact=True).click()
        other.locator('#main').get_by_label('Business name', exact=True).fill('Saved in other tab')
        other.get_by_role('button', name='Save business information').click()
        expect(self.page.locator('#notice')).to_contain_text('Data changed in another tab')
        self.tab('Business info')
        self.page.locator('#main').get_by_label('Business name', exact=True).fill('Stale edit')
        self.page.get_by_role('button', name='Save business information').click()
        expect(self.page.locator('#notice')).to_contain_text('Another tab changed your data')
        self.assertEqual(self.saved()['businesses'][0]['name'], 'Saved in other tab')
        other.close()

    def test_knowledge_crud_hours_validation_and_history_deletion(self):
        self.add_business('Editable business')
        self.page.locator('[name="closed-0"]').uncheck()
        self.page.locator('[name="open-0"]').fill('17:00')
        self.page.locator('[name="close-0"]').fill('09:00')
        self.page.get_by_role('button', name='Save business information').click()
        expect(self.page.locator('#notice')).to_contain_text('Closing time must be after opening time')
        self.assertFalse(self.saved()['businesses'][0]['hoursConfirmed'])
        self.page.locator('[name="open-0"]').fill('08:00')
        self.page.get_by_role('button', name='Save business information').click()
        self.tab('Services')
        self.page.get_by_label('Service name').fill('Consultation')
        self.page.get_by_label('Price', exact=True).fill('$50')
        self.page.get_by_role('button', name='Add service', exact=True).click()
        self.tab('FAQs')
        self.page.get_by_label('Question', exact=True).fill('Do you have parking?')
        self.page.get_by_role('textbox', name='Answer', exact=True).fill('Old answer')
        self.page.get_by_role('button', name='Add FAQ', exact=True).click()
        self.page.get_by_role('button', name='Edit', exact=True).click()
        self.page.get_by_role('textbox', name='Answer', exact=True).fill('Updated answer')
        self.page.get_by_role('button', name='Save FAQ', exact=True).click()
        self.start_chat()
        self.ask('Do you have parking?')
        expect(self.page.locator('.message').last).to_contain_text('Updated answer')
        self.tab('FAQs')
        self.page.once('dialog', lambda dialog: dialog.accept())
        self.page.get_by_role('button', name='Delete', exact=True).click()
        self.tab('Services')
        self.page.once('dialog', lambda dialog: dialog.accept())
        self.page.get_by_role('button', name='Delete', exact=True).click()
        self.tab('Receptionist')
        self.ask('Do you have parking?')
        expect(self.page.locator('.message').last).to_contain_text('Unknown question')
        self.assertEqual(self.saved()['businesses'][0]['conversations'][0]['turns'][0]['answer'], 'Updated answer')
        self.tab('Conversations')
        self.page.once('dialog', lambda dialog: dialog.accept())
        self.page.get_by_role('button', name='Delete conversation', exact=True).click()
        self.assertEqual(self.saved()['businesses'][0]['conversations'], [])
        expect(self.page.get_by_role('heading', name='No conversations to show')).to_be_visible()

    def test_corrupt_storage_is_preserved(self):
        self.page.evaluate('(key) => localStorage.setItem(key, "broken-json")', KEY)
        self.page.reload()
        expect(self.page.locator('#notice')).to_contain_text('It has not been overwritten')
        expect(self.page.locator('#add-business')).to_be_disabled()
        self.assertEqual(self.page.evaluate('(key) => localStorage.getItem(key)', KEY), 'broken-json')

if __name__ == '__main__':
    unittest.main(verbosity=2)
