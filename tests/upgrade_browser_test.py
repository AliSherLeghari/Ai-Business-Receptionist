"""Real upgrades from immutable committed Phase 1/2 releases. Full local Git
history is required; these tests do not fetch or modify production deployments.
"""
import functools
import http.server
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import threading
import unittest
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
PHASE1 = '392cb344aa68c274188aa9d7ad9c0b8ead4a8b9f'
PHASE2 = 'd98be102c222508337d28be940cdf2bee8201064'
KEY = 'receptionist.phase1.v1'
QUESTIONS = [
    ('What time does your shop close?', 'Friday: 09:00–18:00'),
    ('Can you fix Samsung phones?', 'Samsung phone repair: Demo estimate: from PKR 3,000'),
    ('Where is your shop?', '123 Example Lane, Demo City'),
    ('Are you open on Friday?', 'Friday: 09:00–18:00\nRegular weekly hours'),
    ('How much for battery replacement?', 'Battery replacement: Demo price: PKR 2,500'),
    ('What services do you provide?', 'Screen replacement: Demo price: PKR 6,000'),
]
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_): pass
    def end_headers(self):
        # Simulate a still-fresh HTTP cache for the original unversioned engine.
        if self.path.endswith('/js/receptionist.js') and '/assets/' not in self.path:
            self.send_header('Cache-Control', 'public, max-age=3600')
        super().end_headers()

class UpgradeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        for name, ref in [('phase1', PHASE1), ('phase2', PHASE2)]:
            folder = self.root / name; folder.mkdir()
            archive = subprocess.check_output(['git', 'archive', ref], cwd=ROOT)
            with tarfile.open(fileobj=io.BytesIO(archive)) as tar: tar.extractall(folder, filter='data')
        self.fixed = self.root / 'fixed'; self.fixed.mkdir()
        self.release = json.loads((ROOT / 'release-manifest.json').read_text())
        for entry in self.release['assets'] + [{'url': './sw.js'}, {'url': './release-manifest.json'}]:
            name = entry['url'][2:] or 'index.html'
            target = self.fixed / name; target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)
        self.link = self.root / 'project'
        self.deploy('phase1')
        self.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=self.temp.name))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base = f'http://127.0.0.1:{self.server.server_port}/project/'
        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
        self.context = self.browser.new_context()
        self.errors = []
        self.context.on('page', lambda page: page.on('pageerror', lambda e: self.errors.append(str(e))))
        self.owner = self.context.new_page(); self.owner.goto(self.base)
        self.owner.evaluate('async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener("controllerchange",r,{once:true}));}')
        # Create data through the actual old UI, including a private owner note.
        self.owner.locator('#add-business').click()
        self.owner.locator('dialog').get_by_label('Business name').fill('PRIVATE BUSINESS')
        self.owner.get_by_role('button', name='Create business', exact=True).click()
        self.owner.get_by_label('Address', exact=True).fill('PRIVATE ADDRESS')
        self.owner.get_by_role('button', name='Save business information').click()
        self.owner.locator('#navigation').get_by_role('button', name='Receptionist', exact=True).click()
        self.owner.get_by_label('Customer name').fill('PRIVATE CUSTOMER')
        self.owner.get_by_label('Contact details (optional)').fill('private@example.test')
        self.owner.get_by_role('button', name='Start conversation', exact=True).click()
        self.owner.get_by_label('Your question').fill('Address')
        self.owner.get_by_role('button', name='Send question', exact=True).click()
        self.owner.locator('#navigation').get_by_role('button', name='Conversations', exact=True).click()
        self.owner.get_by_label('Private owner note').fill('PRIVATE FOLLOW UP')
        self.owner.get_by_role('button', name='Save note').click()
        self.original = self.owner.evaluate('(key)=>localStorage.getItem(key)', KEY)
        self.owner.locator('#navigation').get_by_role('button', name='Business info', exact=True).click()
        self.owner.locator('#main').get_by_label('Business name', exact=True).fill('UNSAVED OWNER DRAFT')
        self.owner.evaluate('async()=>{await caches.open("other-app-cache")}')

    def tearDown(self):
        self.context.close(); self.browser.close(); self.playwright.stop()
        self.server.shutdown(); self.server.server_close(); self.temp.cleanup()
        self.assertEqual(self.errors, [])

    def deploy(self, name):
        self.link.unlink(missing_ok=True)
        self.link.symlink_to(self.root / name, target_is_directory=True)

    def ask_all(self, page):
        for question, expected in QUESTIONS:
            page.get_by_role('textbox', name='Your question').fill(question)
            page.get_by_role('button', name='Send question', exact=True).click()
            expect(page.locator('#demo-log .message').last).to_contain_text(expected)
            self.assertNotIn('Missing knowledge', page.locator('#demo-log .message').last.inner_text())

    def wait_for_fixed_worker(self, page):
        page.wait_for_function('async(build)=>{const c=navigator.serviceWorker.controller;if(!c)return false;return await new Promise(r=>{const channel=new MessageChannel();const t=setTimeout(()=>r(false),500);channel.port1.onmessage=e=>{clearTimeout(t);channel.port1.close();r(e.data.build===build)};c.postMessage({type:"GET_BUILD"},[channel.port2]);})}', arg=self.release['build'])

    def assert_private_data_preserved(self, page):
        self.assertEqual(page.evaluate('(key)=>localStorage.getItem(key)', KEY), self.original)
        expect(self.owner.locator('#main').get_by_label('Business name', exact=True)).to_have_value('UNSAVED OWNER DRAFT')
        self.assertTrue(page.evaluate('async()=> (await caches.keys()).includes("other-app-cache")'))
        self.assertNotIn('PRIVATE', page.locator('body').inner_text())
        self.assertNotIn('private@example.test', page.locator('body').inner_text())

    def test_reproduces_old_mixed_graph_then_recovers_without_closing_owner(self):
        self.deploy('phase2')
        demo = self.context.new_page(); demo.goto(self.base + 'demo.html')
        demo.evaluate('async()=>await(await navigator.serviceWorker.getRegistration()).update()')
        demo.wait_for_function('async()=>Boolean((await navigator.serviceWorker.getRegistration()).waiting)')
        served = demo.evaluate('async()=>await(await fetch("./js/receptionist.js",{cache:"reload"})).text()')
        self.assertEqual(served, (self.root / 'phase1/js/receptionist.js').read_text())
        for question, _ in QUESTIONS[:5]:
            demo.get_by_role('textbox', name='Your question').fill(question)
            demo.get_by_role('button', name='Send question', exact=True).click()
            expected = 'Friday: 09:00–18:00 (regular hours, business local time).' if question.startswith('Are you') else 'Missing knowledge'
            expect(demo.locator('#demo-log .message').last).to_contain_text(expected)
        self.deploy('fixed')
        # Even with v1 still controlling, immutable module URLs cannot hit its cache.
        answer = demo.evaluate('async(path)=>{const {respond}=await import(path+"receptionist.js");const {demoKnowledge}=await import(path+"demo-knowledge.js");return respond(demoKnowledge,"Where is your shop?")}', './assets/' + self.release['build'] + '/js/')
        self.assertEqual(answer['status'], 'answered')
        demo.goto(self.base + 'demo.html')
        self.wait_for_fixed_worker(demo)
        # An already-loaded legacy document is not forcibly navigated. A normal
        # reload now uses the verified release, even with a fresh legacy HTTP cache.
        demo.reload()
        self.ask_all(demo)
        expect(demo.locator('#build-info')).to_contain_text('App 2.1.0')
        expect(demo.locator('#build-info')).to_contain_text('engine 2.1.0')
        expect(demo.locator('#build-info')).to_contain_text('worker: ' + self.release['build'])
        self.assert_private_data_preserved(demo)
        self.context.set_offline(True); demo.reload(); self.ask_all(demo)
        self.assert_private_data_preserved(demo)
        self.assertTrue(demo.evaluate('async()=>{try{await fetch("./uncached-probe");return false}catch{return true}}'))
        self.context.set_offline(False)

    def test_direct_phase1_to_fixed_upgrade_and_offline_restart(self):
        self.deploy('fixed')
        demo = self.context.new_page(); demo.goto(self.base + 'demo.html')
        self.wait_for_fixed_worker(demo); self.ask_all(demo)
        self.assert_private_data_preserved(demo)
        self.context.set_offline(True)
        reopened = self.context.new_page(); reopened.goto(self.base + 'demo.html'); self.ask_all(reopened)
        self.assert_private_data_preserved(reopened)
        self.context.set_offline(False)

    def test_mismatched_deployment_cannot_activate_or_destroy_previous_cache(self):
        # Keep one asset stale to simulate a partial/CDN deployment during install.
        asset = self.fixed / f'assets/{self.release["build"]}/styles.css'
        asset.write_text('/* stale deployment response */')
        self.deploy('fixed')
        state = self.owner.evaluate('''async()=>{
          const reg=await navigator.serviceWorker.getRegistration();
          const terminal=new Promise(resolve=>reg.addEventListener('updatefound',()=>{
            const worker=reg.installing;
            worker.addEventListener('statechange',()=>{if(['redundant','activated'].includes(worker.state))resolve(worker.state)});
          },{once:true}));
          await reg.update();return await terminal;
        }''')
        self.assertEqual(state, 'redundant')
        keys = self.owner.evaluate('async()=>await caches.keys()')
        self.assertIn('reception-desk-shell-v1', keys)
        self.assertNotIn('reception-desk-shell-' + self.release['build'], keys)
        self.assertEqual(self.owner.evaluate('(key)=>localStorage.getItem(key)', KEY), self.original)
        expect(self.owner.locator('#main').get_by_label('Business name', exact=True)).to_have_value('UNSAVED OWNER DRAFT')
        # Repair and retry on the same profile; no clearing storage is needed.
        shutil.copyfile(ROOT / f'assets/{self.release["build"]}/styles.css', asset)
        self.owner.evaluate('async()=>await(await navigator.serviceWorker.getRegistration()).update()')
        self.wait_for_fixed_worker(self.owner)
        demo = self.context.new_page(); demo.goto(self.base + 'demo.html'); self.ask_all(demo)
        self.assert_private_data_preserved(demo)

if __name__ == '__main__': unittest.main(verbosity=2)
