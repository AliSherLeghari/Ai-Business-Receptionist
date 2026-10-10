# Answering upgrade investigation — 2026-10-10

## What was inspected

- Current `main`: `fb0dd33` (Phase 2 merge); its implementation is identical to
  `d98be102c222508337d28be940cdf2bee8201064`.
- Phase 1 release: `392cb344aa68c274188aa9d7ad9c0b8ead4a8b9f`.
- The exact fictional `js/demo-knowledge.js` shipped in Phase 2.
- Legacy service-worker install, activation, and fetch handlers; a real Chromium
  profile upgraded between archived releases on the same origin and project path.

## Production access limitation

Direct HTTPS requests to the public GitHub Pages demo and its JS/worker files
were denied by the execution environment's outbound proxy (`Tunnel connection
failed: 403 Forbidden`). No production response bodies were received. Repository
main was accessible through GitHub, but that does **not** verify deployed Pages
bytes or CDN state. No proxy bypass was attempted.

The repository/upgrade findings below are verified. A stale or partial Pages
publication/CDN response is not ruled out for the user's session. In particular,
a completely fresh Incognito session has not been reproduced against production;
Incognito alone is not evidence for or against the locally reproduced transition.

## Verified results before the fix

| Question | Current Phase 2 engine | Phase 1-controlled Phase 2 demo |
| --- | --- | --- |
| What time does your shop close? | Verified weekly schedule | Missing knowledge |
| Can you fix Samsung phones? | Saved Samsung phone repair service | Missing knowledge |
| Where is your shop? | Fictional saved address | Missing knowledge |
| Are you open on Friday? | Friday hours and new weekly-hours disclaimer | Exact old Phase 1 wording |
| How much for battery replacement? | Saved fictional PKR 2,500 price | Missing knowledge |
| What services do you provide? | Missing knowledge | Missing knowledge |

The legacy Friday answer was reproduced verbatim:

> Friday: 09:00–18:00 (regular hours, business local time). Holiday exceptions are not confirmed.

The five original questions are not matching defects in the Phase 2 source.
“Provide” is a separate genuine missing service-list variation, now supported.

## Verified cause of the upgrade regression

1. A Phase 1 owner tab installs `reception-desk-shell-v1` and stays open.
2. Phase 2 adds `demo.html`, `js/demo.js`, and `js/demo-knowledge.js`. The old
   worker does not know these paths, so they load from the newer deployment.
3. The new demo imports the unchanged URL `js/receptionist.js`. Phase 1's
   cache-first fetch handler returns the old engine for that path. A browser
   fetch with `cache: reload` still receives that worker response.
4. Phase 2's worker installs cache v2 but remains **waiting** while the Phase 1
   owner tab is a controlled client. `serviceWorker.ready` resolves for the old
   active worker; it is not proof that the current application release controls
   the page.
5. The observed fetched engine text is byte-for-byte equal to the archived Phase 1
   engine. The demo produces the four unknown answers and exact old Friday text.

The original handler also strips query strings from module URLs, so adding
`?v=2` is insufficient to escape that legacy cache. Fresh HTTP cache responses
at shared URLs are another reason not to reuse unversioned module identities.

## Fix and release behavior

- Every module and stylesheet is emitted under a content-derived
  `assets/<build>/` path. Relative imports stay inside that release. New HTML can
  no longer import an old root-level cached engine, even while a legacy worker
  still controls the document. The source files remain modular and dependency-free.
- `release-manifest.json` identifies the version/build and SHA-256 of every
  offline asset. The generated worker fetches with `cache: reload`, validates the
  whole asset set, and only then fills its cache and activates. A stale or partial
  deployment fails installation and retains the old offline release.
- A verified worker activates without waiting indefinitely for legacy owner tabs.
  It does not reload those tabs. The current and preceding cache are retained;
  unrelated cache names and all localStorage data are untouched.
- Existing documents keep their already-executed JavaScript until reload. After
  installation, one normal demo reload obtains the coherent new release. Owner
  forms are never silently navigated; unsaved drafts remain in place.
- Both pages show the running app version, content build, engine version, and
  controlling worker build. A legacy/nonresponsive worker is labeled as such.
  A future different worker build exposes a **Reload update** control; owner
  beforeunload handling still protects unsaved edits.

## Regression verification

`tests/upgrade_browser_test.py` uses the actual archived Phase 1 and Phase 2
releases and the generated fix, on one Chromium origin under `/project/`:

- Reproduces the broken Phase 1 → Phase 2 transition and exact old response;
  verifies immutable engine imports bypass v1 while it is still controlling.
- Upgrades to the fix without closing the owner tab, then verifies all six
  questions after a normal reload and while offline.
- Covers a direct Phase 1 → fixed release and an offline new-tab restart.
- Holds a stale stylesheet response to prove a mismatched release cannot activate
  or replace the old cache; repairs it and verifies a retry succeeds.
- Compares the entire original localStorage payload byte-for-byte, including
  business information, conversation/contact data, and private owner notes.
  Confirms an unsaved owner draft survives, a separate application's cache
  survives, and no private data appears in the demo.

The existing voice, privacy, matching, storage, PWA, and browser acceptance suites
also run. The Phase 2 cache assertion now reads the current generated build
instead of hard-coding `reception-desk-shell-v2`; no behavioral coverage is removed.

Validation completed: all 64 JavaScript tests and all 17 Chromium acceptance tests
passed, with zero failures. The generated-release consistency check and
`git diff --check` passed. Mobile screenshots were inspected. Speech tests use
browser mocks; no real microphone or production deployment was tested.

## After deployment

1. Publish the generated HTML, `assets/`, icons, manifest, `sw.js`, and release
   manifest together. Do not copy only source JS or manually edit a release path.
2. Visit online, allow the verified worker to install, and normally reload an
   already-open legacy demo once. Do **not** clear site storage or delete business
   records as an update workaround.
3. Check the footer's app/build/engine/worker values. Compare the build with
   `release-manifest.json` in the deployment. Report those values with any failure.
4. If verification fails, check that Pages finished deploying all generated
   assets and retry online. A production-side stale deployment requires correcting
   the publication; it cannot be diagnosed from repository main alone.
