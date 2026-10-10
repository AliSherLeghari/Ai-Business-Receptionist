# AI Business Receptionist — Phase 2

**Reception Desk** is a mobile-friendly, browser-local business dashboard and
knowledge-based chat receptionist. It uses plain HTML, CSS, and JavaScript with
no application dependencies, backend, account, paid API, or build step. Phase 2
adds improved rule-based question understanding, optional browser speech, and a
separate fictional customer demo. It is **not a generative LLM or telephone system**.

## Run locally

From the repository directory, use the existing VS Code task **Preview static
project**, `npm start`, or:

```sh
cd /workspace/Ai-Business-Receptionist
python3 -m http.server 8000 --bind 0.0.0.0
```

Open `http://localhost:8000`, or the environment's HTTPS forwarded port 8000 URL.
Use a modern browser. JavaScript modules and PWA functionality require HTTP(S),
not opening `index.html` as a local file. The Python server is for development.

## Phase 2 entry points

- **Owner workspace:** `index.html` (or the site root). All Phase 1 features and
  saved businesses, backups, notes, and conversations remain compatible.
- **Customer demonstration:** `demo.html`, also linked by **Customer demo** in
  the owner header. Share this relative path under your GitHub Pages project URL.
  It contains only the explicitly fictional **Example Repair Studio** knowledge.

The demo does not import the storage repository, read browser storage, accept a
business ID from a URL, or display owner navigation, contact forms, private notes,
or past conversations. Its current chat lives only in memory and is discarded
on reset/reload (100 questions maximum). It does not save or notify an owner;
escalation messages explicitly say so. The public example data lives in
`js/demo-knowledge.js`; never replace it with an exported owner backup.

**This page separation is not authentication or security.** Anyone using the
same browser profile can navigate to the owner workspace. Knowledge entered in
that workspace does not appear on another device, or in this fictional demo.
GitHub Pages serves static files and does not synchronize local browser data.

## What works

- Create, switch between, and delete up to **three independent businesses**.
- Edit business name, description, address, contact information, and weekly hours.
- Add, edit, and delete up to 100 services and 100 FAQs per business. Prices are
  explicit text, so include a currency and any conditions, for example
  `PKR 2,000` or `From $40`.
- Start named or anonymous customer chats with optional contact details. Replies
  use only the selected business's saved information.
- Flag unknown questions and owner-action requests, then review/reopen each flag.
- Read complete conversation history, deterministic owner summaries, topics,
  and private follow-up notes. Past replies retain the information used at that
  time, even if services or FAQs change later.
- Export and restore versioned JSON backups. Restore validates data and asks
  before replacing all businesses and conversations.
- Install as a PWA and use all local functionality offline after the app shell
  has been cached successfully. Voice availability is separate from offline text chat.
- Dictate a question with a user-initiated microphone button, review its text,
  and send it. Enable optional spoken replies or stop/mute them at any time.

### First use

1. Add a business. Fill in verified information and save weekly opening hours.
   New businesses have **unconfirmed** hours; the receptionist will not invent
   a schedule. Saving the information form confirms the displayed schedule.
2. Add services, prices, and FAQs. Add complete alternate FAQ questions, one per
   line, for wording your customers commonly use.
3. Open **Receptionist**, start a conversation, and ask questions.
4. Review **Conversations** or the overview's owner attention count. “Mark
   reviewed” changes the local review status; it does not send a reply.
5. Export a backup regularly and before clearing browser data or changing hosts.

### How answers are selected

The receptionist uses a conservative **local English rule-based** adapter. A small
curated spelling map, contractions, polite prefixes, narrowly equivalent FAQ
forms, and service synonyms extend Phase 1's exact matching. No embeddings,
external AI, API keys, or broad fuzzy similarity are involved.

| Example | Source and requirements |
| --- | --- |
| `When do you open?` / `What time does your shop close?` | Confirmed weekly hours |
| `Are you open on Friday?` | Friday's confirmed regular hours |
| `Where is your shop?` / `What is your adress?` | Saved address |
| `How much for battery replacement?` | Saved service and explicit price |
| `What's the cost of changing my screen?` | A uniquely matching screen replacement service |
| `Can you fix Samsung phones?` | Explicit Samsung phone repair service or matching FAQ; generic phone repair does not prove brand support |
| `Is parking available?` | Saved `Do you have parking?` FAQ or equivalent alias |

Service matching retains brands, models (including `+`), negation, and qualifiers.
Repair and replacement remain different services. Missing prices, conflicting
entries, multiple candidates, unknown services, and unsupported wording produce
an unknown/clarification response. A service description mentioning a brand does
not establish support for that brand. Prices, schedules, and policy answers are
returned from saved fields, never generated or inferred from other businesses.

Owner escalation takes priority over FAQ and service matching for refunds,
complaints, bookings, cancellations, payments, emergencies, and requests for a
human. Multi-part questions are not partially answered unless that complete
question is a saved FAQ. Add complete FAQ aliases to improve coverage. This is
not unrestricted natural-language understanding; conservative abstention remains
intentional.

Weekly hours use the business's local time. Overnight intervals, live availability,
and holiday exceptions are not calculated. Closing time must be after opening
time. “Open now?” is an unknown question unless explicitly covered by a saved FAQ.
The quality and freshness of saved information remain the owner's responsibility.

## Browser voice demo

Voice controls are available in an active owner conversation and in `demo.html`.
They use `SpeechRecognition` / `webkitSpeechRecognition` and `speechSynthesis`
when supported. Recognition is configured for English (`en-US`).

- No microphone permission is requested on page load. **Start microphone** is
  the only action that starts listening; no automatic retry or restart occurs.
- Each session listens for one utterance, with a 20-second maximum. **Stop
  listening**, changing owner views/businesses, leaving the page, and hiding the
  tab stop recognition. Late recognition results are discarded.
- Recognized words populate the text box; they do **not** automatically send a
  message. Review/edit the text and press **Send question**. The app never stores
  raw microphone audio. In the owner workspace, only submitted text and answers
  become part of the normal saved conversation.
- Spoken replies are **off by default**. Enable **Speak replies** to hear new
  answers, use **Stop spoken reply** to interrupt, or uncheck to mute. Starting
  the microphone cancels speech to avoid feedback. Old conversations are never
  spoken automatically. Replies over 1,200 characters remain text-only.
- Permission denial, missing microphones, no speech, network errors, unsupported
  APIs, and synthesis failures show a text fallback. Unsupported recognition
  disables the microphone button but does not block chat.
- Browser recognition may send audio to the browser vendor's service and require
  internet. Installed speech voices can also vary. **Offline speech recognition
  or synthesis is not guaranteed.** No paid service, external AI SDK, or API key
  is configured by this app. Speech requests are browser-managed, not intercepted
  or cached by the service worker.

### Manual voice testing on Android Chrome

1. Open the deployed HTTPS `demo.html` URL in current Android Chrome. After a
   deployment, close older site/PWA tabs and reopen so the v2 worker can activate.
   Confirm that the microphone is initially off and no permission prompt appears.
2. Tap **Start microphone**, allow the site's microphone permission, and say
   “How much for battery replacement?” Confirm that listening ends and the words
   appear in the input **without being sent**. Correct them if needed; press
   **Send question** and check the fictional PKR 2,500 answer.
3. Enable **Speak replies**, send another question, then test **Stop spoken
   reply** and uncheck **Speak replies**. Verify that starting the microphone
   stops any spoken answer. Use device media volume for audible playback.
4. Test **Stop listening**, switching apps/locking the screen, and a new listen
   after returning. Listening must not restart on its own. Try denying permission
   (reset the site's microphone permission in Chrome site settings first) and
   confirm that the error is clear and typed chat still works.
5. After the footer confirms the text demo is cached, disable network access and
   reload. Text answers should still work. Voice may fail with a browser/network
   error; test the text fallback. Re-enable the network afterward.

Automated tests use speech mocks; real microphone accuracy, Android permission
UI, device audio, and browser-vendor recognition availability require these
manual checks. They were not claimed as hardware-tested in Chromium automation.

## PWA installation and offline behavior

Serve the app over **HTTPS**, or `localhost` during development. Wait for the
footer to say **Ready for offline use** before disconnecting.

- Chromium: use **Install app** when offered, or the browser's install menu.
- iPhone/iPad Safari: use **Share → Add to Home Screen**.
- Installation availability depends on browser/platform; private browsing may
  disable installation or persistence. Installed apps use their own browser's
  storage context, which can differ by platform.

The v2 service worker precaches both HTML entry points and all new matching,
voice, and fictional-demo modules as part of the static application shell. Customer data is
stored in localStorage, not the service-worker cache. The app works at a domain
root or in a subdirectory because asset and manifest paths are relative. Workers
wait for old tabs to close before activating updates; close all app windows and
reopen to adopt a new version. Developers must bump the shell cache version in
`sw.js` when changing shipped assets. Cache cleanup only touches this app's prefix.
The connection badge uses the browser's connectivity hint, not a server probe.

## Data and limitations

- **Real telephone calls, voice AI, SMS, email delivery, booking confirmation,
  payment processing, and external owner notifications are not supported.**
  Browser speech is a voice demonstration, not an AI voice agent or telephony.
- The owner workspace is local to the browser. The separate public customer
  demonstration uses fictional knowledge only. Hosting the files does not
  synchronize knowledge or conversations between devices.
- No login or access control is included. Business records are separated by ID
  and nested storage, but anyone with access to this browser profile can view
  its businesses. Backups contain readable business/customer data; keep them
  private and avoid entering sensitive information.
- Browser storage is origin-specific, limited, and may be evicted. Clearing site
  data removes records. Export a backup before changing origin, browser, or device.
  Restore accepts this app's version-1 format, up to 5 MB.
- Failed writes leave the saved and in-memory data intact and show a recoverable
  error. Export data, free space, and retry. There is no silent temporary save.
- A stale tab is warned and cannot knowingly overwrite a newer stored snapshot.
  Use one editing tab at a time; localStorage does not provide transactional
  multi-user concurrency. Reload to receive another tab's changes.
- Corrupt or unsupported saved data is never automatically overwritten. Export
  the raw backup first. To recover, keep that file, clear this app's site storage
  using browser settings, reload, and restore a valid version-1 backup. A broken
  export needs repair before it can be restored.
- The text application makes no external API requests and loads no external
  fonts or scripts. Optional browser-managed speech may use vendor services.

## Architecture

| File | Responsibility |
| --- | --- |
| `js/model.js` | Business schema, validation, IDs, and derived owner summaries |
| `js/storage.js` | Versioned repository, defensive copies, durable writes, stale-write detection |
| `js/receptionist.js` | Pure knowledge adapter: business + question → answer, status, source |
| `js/matching.js` | Conservative English normalization, intent parsing, and service/FAQ keys |
| `js/voice.js` | Injectable bounded speech controller and shared accessible controls |
| `demo.html`, `js/demo.js` | Separate customer UI, in-memory chat, no owner repository access |
| `js/demo-knowledge.js` | Explicitly fictional public knowledge, no owner/customer records |
| `js/conversations.js` | Conversation lifecycle and immutable answer snapshots; injectable answer adapter |
| `js/app.js` | UI rendering, accessible forms, navigation, backup actions, PWA lifecycle |
| `sw.js` | Versioned offline app-shell caching |
| `manifest.webmanifest`, `icons/` | Install metadata and regular/maskable app icons |

The UI accesses data through the repository. The receptionist has no DOM,
storage, or network dependencies and receives exactly one business. The
conversation adapter contract is `{ answer, status, source }`, with status
`answered`, `unknown`, or `owner`. All user content is rendered as escaped text;
restored IDs and fields are validated before they enter the UI.

The voice adapter fills the question input and consumes the same answer
contract without changing the model or repository. The storage key remains
`receptionist.phase1.v1`, schema version 1; no migration or automatic rewrite
is performed. Remote AI would require an asynchronous orchestration layer around the
knowledge/conversation boundary; network requests must finish before committing
local state. Production telephony also needs a secure backend, authentication,
provider webhooks, durable storage, and consent/privacy controls. Never place
provider secrets in this static client. None of those integrations is implemented
or implied by Phase 2.

## Automated verification

No installation is needed for the core suite (Node.js 20+):

```sh
npm test
# Detailed individual test output:
node tests/core.test.js
node tests/matching.test.js
node tests/voice.test.js
```

The core tests cover knowledge accuracy/abstention, owner escalation, ambiguity,
business isolation, historical answer snapshots, summary review state, validation,
quota failures, corrupt data preservation, and stale-tab writes. Additional suites
cover normalized/ambiguous queries, escalation priority, old saved data, voice
permission/errors, opt-in speech, timeout/stop behavior, and stale callbacks.

The browser suite uses development-only **Python Playwright** and an installed
Chromium; both are already available in the verified cloud environment:

```sh
python3 -m unittest discover -s tests -p '*_test.py' -v
```

On another development machine, install Python Playwright separately and set
`CHROMIUM_PATH` to that machine's Chromium executable. Browser tooling is not an
application dependency. The suite starts and stops a temporary localhost server,
uses temporary regular browser profiles, and checks complete CRUD/chat flows,
data isolation, backups, text-injection safety, failed storage writes, stale tabs,
mobile overflow, offline reload/chat, and Chromium's PWA installability diagnostics.
Phase 2 browser scenarios additionally exercise mocked speech in both views,
privacy against seeded owner data, unsupported APIs, mobile widths 320–1280, and
offline demo operation under a GitHub Pages-style subdirectory. Phase 1 tests are
preserved unchanged. Screenshots are written to `/tmp/reception-desk-desktop.png`,
`/tmp/reception-desk-mobile.png`, `/tmp/reception-desk-phase2-desktop.png`, and
`/tmp/reception-desk-phase2-mobile.png`. The suite does not automate an OS-level installation.

Before committing, also run `git diff --check`. There is no compilation or build
step. Existing editor settings and the saved preview task are unchanged.

## Static hosting

Publish only these application files over HTTPS:

```text
index.html
demo.html
styles.css
js/
icons/
manifest.webmanifest
sw.js
```

Do not publish `.git`, tests, editor configuration, backups, or private data.
Configure a valid JavaScript MIME type for modules and the service worker; serve
`sw.js` with revalidation rather than a long immutable cache. The files remain compatible with GitHub Pages project subdirectories; the PR
does not change Pages settings or merge/deploy itself.

For Codex environment settings, keep repository
`AliSherLeghari/Ai-Business-Receptionist`, base `main`, and project directory
`/workspace/Ai-Business-Receptionist`. Leave setup/install and build commands blank.
Preview uses `python3 -m http.server 8000 --bind 0.0.0.0`, port `8000`; no secrets
are required. `.vscode` configures editor tasks, not Codex cloud settings.
