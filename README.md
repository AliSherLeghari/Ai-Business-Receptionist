# AI Business Receptionist — Phase 1

**Reception Desk** is a mobile-friendly, browser-local business dashboard and
knowledge-based chat receptionist. It uses plain HTML, CSS, and JavaScript with
no application dependencies, backend, account, paid API, or build step.

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
  has been cached successfully.

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

This phase uses a conservative rule-based knowledge adapter, not a generative
AI model. It recognizes complete FAQ questions/aliases after case and punctuation
normalization, and a small set of full-question patterns:

| Example | Source |
| --- | --- |
| `What are your hours?` / `Are you open on Monday?` | Confirmed weekly hours |
| `Where are you located?` | Saved address |
| `How can I contact you?` / `What is your email?` | Saved contact information |
| `Tell me about your business` | Saved description |
| `What services do you offer?` / `What are your prices?` | Services and explicit prices |
| `How much is haircut?` / `Do you offer haircut?` | Exact service name |
| `Do you have parking?` | Exact saved FAQ or alternate question |

Unknown wording, missing data, conflicting FAQ matches, and ambiguous service
names are flagged for owner review. Multi-part questions are not partially
answered unless that complete question is a saved FAQ. Bookings, cancellations,
refunds, complaints, payments, discounts, and requests for a human take priority
over FAQ matching and require owner attention. This deliberately favors
abstaining over guessing; add FAQ aliases to expand coverage.

Weekly hours use the business's local time. Overnight intervals, live availability,
and holiday exceptions are not calculated. Closing time must be after opening
time. “Open now?” is an unknown question unless explicitly covered by a saved FAQ.
The quality and freshness of saved information remain the owner's responsibility.

## PWA installation and offline behavior

Serve the app over **HTTPS**, or `localhost` during development. Wait for the
footer to say **Ready for offline use** before disconnecting.

- Chromium: use **Install app** when offered, or the browser's install menu.
- iPhone/iPad Safari: use **Share → Add to Home Screen**.
- Installation availability depends on browser/platform; private browsing may
  disable installation or persistence. Installed apps use their own browser's
  storage context, which can differ by platform.

The service worker precaches only the static application shell. Customer data is
stored in localStorage, not the service-worker cache. The app works at a domain
root or in a subdirectory because asset and manifest paths are relative. Workers
wait for old tabs to close before activating updates; close all app windows and
reopen to adopt a new version. Developers must bump the shell cache version in
`sw.js` when changing shipped assets. Cache cleanup only touches this app's prefix.
The connection badge uses the browser's connectivity hint, not a server probe.

## Data and limitations

- **Real telephone calls, voice AI, SMS, email delivery, booking confirmation,
  payment processing, and external owner notifications are not supported.**
- This is a local owner workspace with a customer-chat interface on the same
  device. It is not a remotely shared customer portal. Hosting the files does
  not synchronize knowledge or conversations between devices.
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
- The app makes no external API requests and loads no external fonts or scripts.

## Architecture

| File | Responsibility |
| --- | --- |
| `js/model.js` | Business schema, validation, IDs, and derived owner summaries |
| `js/storage.js` | Versioned repository, defensive copies, durable writes, stale-write detection |
| `js/receptionist.js` | Pure knowledge adapter: business + question → answer, status, source |
| `js/conversations.js` | Conversation lifecycle and immutable answer snapshots; injectable answer adapter |
| `js/app.js` | UI rendering, accessible forms, navigation, backup actions, PWA lifecycle |
| `sw.js` | Versioned offline app-shell caching |
| `manifest.webmanifest`, `icons/` | Install metadata and regular/maskable app icons |

The UI accesses data through the repository. The receptionist has no DOM,
storage, or network dependencies and receives exactly one business. The
conversation adapter contract is `{ answer, status, source }`, with status
`answered`, `unknown`, or `owner`. All user content is rendered as escaped text;
restored IDs and fields are validated before they enter the UI.

A future voice adapter can convert speech to text and consume the same answer
contract. Remote AI requires an asynchronous orchestration layer around the
knowledge/conversation boundary; network requests must finish before committing
local state. Production telephony also needs a secure backend, authentication,
provider webhooks, durable storage, and consent/privacy controls. Never place
provider secrets in this static client. None of those integrations is implemented
or implied by Phase 1.

## Automated verification

No installation is needed for the core suite (Node.js 20+):

```sh
npm test
# Detailed individual test output:
node tests/core.test.js
```

The core tests cover knowledge accuracy/abstention, owner escalation, ambiguity,
business isolation, historical answer snapshots, summary review state, validation,
quota failures, corrupt data preservation, and stale-tab writes.

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
Screenshots are written to `/tmp/reception-desk-desktop.png` and
`/tmp/reception-desk-mobile.png`. The suite does not automate an OS-level installation.

Before committing, also run `git diff --check`. There is no compilation or build
step. Existing editor settings and the saved preview task are unchanged.

## Static hosting

Publish only these application files over HTTPS:

```text
index.html
styles.css
js/
icons/
manifest.webmanifest
sw.js
```

Do not publish `.git`, tests, editor configuration, backups, or private data.
Configure a valid JavaScript MIME type for modules and the service worker; serve
`sw.js` with revalidation rather than a long immutable cache. Static hosting is
optional and separate from the GitHub pull request.

For Codex environment settings, keep repository
`AliSherLeghari/Ai-Business-Receptionist`, base `main`, and project directory
`/workspace/Ai-Business-Receptionist`. Leave setup/install and build commands blank.
Preview uses `python3 -m http.server 8000 --bind 0.0.0.0`, port `8000`; no secrets
are required. `.vscode` configures editor tasks, not Codex cloud settings.
