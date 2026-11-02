# Taqyeem 2.1 — verification record

Backend verification completed on 2 November 2026 using Node.js 24.22.1 and pinned Wrangler 4.156.1. Checks use fictional test data and local ephemeral databases. No production deployment or real email delivery is implied.

## Current backend checks

| Check | Result |
| --- | --- |
| SQLite-backed API integration suite | **30 passed, 0 failed, 0 skipped** |
| Actual workerd + local D1 smoke | **Passed**, including the new review, teaching, reminder and file-correction workflows |
| Upgrade from the original schema | Existing resident and file records retained; four-week interval and file version 1 supplied by migration 2; a direct SQL fractional interval is rejected |
| Schema readiness | Health rejects the original-only schema and accepts both ordered migrations |
| Production initialization | Three psychiatry tracks and 30 question rows; no fictional users/evaluations/file references |
| Editable diagram | Seven XML pages, unique cell IDs within each page, valid connector references; the appended page covers new workflows and four added record groups |

Commands executed for these checks:

```sh
npm test
npm run test:runtime
```

The default sandbox denied the workerd loopback listener. The same local-only runtime smoke then succeeded with the permitted execution override; no alternate database, remote deployment, or external mail was used.

## New API scenarios exercised

1. Upgrade a database that already contains a resident and a file reference. Verify preserved records, new defaults, and schema health gating.
2. Permit only the administrator to set numeric integer intervals from 1 to 52 weeks; reject zero, 53, fractions, strings, and explicit null. The migration also enforces SQLite integer storage: a direct SQL update to 2.5 fails and retains the existing value.
3. Compute the next due date from publication plus the interval. Keep repeated same-month publications immutable with one monthly report head.
4. Keep observations and goals private to the administrator/current assignment. Reject students and unrelated doctors. Validate text and enforce one open goal even when two writers race.
5. Restrict file corrections to the student owner. Normalize Arabic/Persian digits, reject duplicates/stale versions, retain faculty correction history, and require fresh acknowledgment for an already-reviewed number.
6. Give a selected reviewer only the intentionally shared snapshot. Do not expose the referred resident's profile, files, other evaluations, observations, or goals. Deny unrelated readers, reviewer publication, and re-forwarding of the author's draft.
7. Keep all new staff arrays empty in the student projection. Review requests, observations, goals, comments, and category notes do not leak into the student response.
8. Block publication while review is pending or changes are requested. Approval alone does not change the student's score. Require exact approved scores, notes, version, and context at publication.
9. Supersede old approval when a draft changes while retaining the review requirement. Reject cancellation of an older request when a newer review exists; permit explicit cancellation of the current requirement.
10. Reject review decisions and publication after resident, rubric, or publication-head context changes. Concurrent review decisions have one winner. Incomplete scores cannot be approved.
11. Revoke the server session on locking/logout: replaying the old cookie cannot read the workspace or save teaching records.

The existing nineteen scenarios still cover bootstrap/recovery, single-use invitations and login links, role/assignment/Origin/CSRF enforcement, draft/publication concurrency, transactional rollback, immutable snapshots, question changes, file validation, CSV scopes, deactivation, rate limits, and training-year conflicts.

## Actual Worker runtime smoke

`tests/workerd-smoke.mjs` uses Wrangler's Miniflare/workerd runtime and real local D1. It dynamically applies every numbered migration followed by the production psychiatry setup, then performs:

- Schema health, owner bootstrap/activation, psychiatrist/resident onboarding.
- Review interval storage and due state before/after publication.
- Private observation and teaching goal creation.
- Draft save, stale-write denial, referral to the administrator, pending-publication denial, approval and author publication.
- Narrow student response with every new staff array empty.
- File submission, acknowledgment, correction, faculty correction history and renewed acknowledgment.
- Goal completion, session revocation, old-cookie replay denial, and absence of leftover transaction-guard rows.

This proves these paths execute in the target runtime. It does not prove the configuration of a particular remote Cloudflare account, domain, or mail sender.

## Frontend and build verification

Final source checks passed for all 26 JavaScript modules. The production build generated the live sign-in assets without fictional seed data. The portable demo build generated both `artifacts/Taqyeem-Demo.html` and the self-contained GitHub Pages `docs/index.html`, with `docs/.nojekyll`. Wrangler's deployment dry run successfully bundled the Worker and four production assets; its optional log-file write encountered a read-only environment directory. No live Worker deployment was attempted by that dry run.

Managed-browser checks covered the desktop layout and 390 px phone / 820 px tablet frames, including English and Arabic RTL screens. The release owner verified:

- The full admin dashboard and management links remain present, with 32 px between the sidebar logo and navigation on desktop, tablet, and the phone drawer.
- All 52 review-interval choices appear with correct English/Arabic week labels. Saving 52 weeks updates the resident; next-review dates include the year.
- Quick observations save privately. A teaching goal can be marked reviewed, followed by a new goal saved in Arabic on the phone layout.
- An administrator can approve a submitted snapshot; the original doctor then explicitly publishes it. A doctor can send a draft to another doctor, who can return a change request. An incomplete assessment cannot be approved.
- A student can correct an owned, previously reviewed file reference. Faculty see its preserved history and the renewed review requirement, and can acknowledge the corrected version.
- The student workspace exposes only the overall rating and owned file-reference controls.
- Manual demo locking removes the workspace, remains locked after reload, and requires the explicit demo-unlock action. Server session revocation was verified separately by the runtime tests.
- Arabic forms, review dialogs, numeric rating fractions, and the resident header fit the phone/tablet layouts without page-level horizontal overflow.

A focused frontend VM harness also exercised the live lock callbacks and stale-session cases: delayed logout/retry responses cannot replace a fresh authenticated workspace, and a stale locked tab never retrieves a newer session's CSRF token to revoke it. The corresponding source changes received a focused independent review against the backend logout contract. This is not an end-to-end browser test of a configured hospital login email flow.

## Not performed on a hospital deployment

- Deployment to a real hospital-controlled Cloudflare account/database/domain.
- Delivery of a real login email, review message, or invitation to Dr. Khaled or anyone else.
- Hospital identity-provider or MFA integration.
- Production-data migration, hospital-scale load testing, or a production backup restore.
- Independent penetration testing, regulatory certification, or clinical rubric validation.

Use `DEPLOYMENT.md` for configuration and staged acceptance, and `OPERATIONS.md` for release and recovery. The hosted and single-file demonstrations use fictional browser-local records; actual shared access, saved records, and server session revocation require the configured live deployment.
