# Taqyeem v2 — verification record

Verified on 2 November 2026 using Node.js 24.22.1 and pinned Wrangler 4.156.1. This record distinguishes completed local checks from deployment-specific work still required.

## Completed

| Check | Result |
| --- | --- |
| Source syntax/integrity | Passed for 22 JavaScript modules |
| SQLite-backed API integration suite | **19 passed, 0 failed, 0 skipped** |
| Actual workerd + local D1 smoke | Passed |
| Wrangler D1 migration | Applied successfully to a local database: 63 SQL commands |
| Psychiatry initialization | Applied successfully: 40 SQL commands; repeat setup verified separately |
| Production initialization data | Three tracks, 30 category rows, no fictional users/evaluations/file references |
| Production frontend build | Four files; live mode; demo seed asset and HTML reference excluded |
| Wrangler deployment dry run | Passed; Worker bundled successfully with DB and ASSETS bindings |
| Browser visual review | Desktop dashboard, student view, Arabic RTL, and 390px demo/live sign-in layouts reviewed |
| Editable diagram | Six XML pages, unique node IDs, valid connector references; all 20 tables represented |

The final verification command was:

```sh
npm run deploy:check
```

It runs the syntax checks, all integration tests, actual Worker runtime smoke, live frontend build, and Wrangler dry-run bundle. It does not deploy remotely or send real email.

## API scenarios exercised

1. Empty production setup, schema readiness, and single-use owner bootstrap.
2. Pending-owner invitation recovery; active-owner reset denied.
3. Unauthenticated, role, record/assignment, exact-Origin, and CSRF enforcement.
4. Single-use login links; protected cookies; logout; idle and absolute session expiry.
5. Invitation creation, reissue, revocation, expiry, and concurrent acceptance with exactly one activation/session.
6. Server-derived evaluator identity and mean; student response excludes notes, categories, and peers.
7. Invalid/incomplete score rejection without partially written records.
8. Draft optimistic concurrency, including a change after the initial read.
9. Concurrent publication with one winner and immutable corrections.
10. Injected database failure with rollback of evaluation, questions, notes, current pointer, and audit.
11. Supervisor reassignment during an in-flight assessment.
12. Question/template updates, stale forms, and original track/year/question preservation.
13. Arabic/Persian digit normalization, per-resident duplicate file protection, dates, and review authorization.
14. Administrator report filters, Arabic CSV, UTF-8 BOM, formula-safe cells, and feedback exclusion.
15. Deactivation and token/session revocation; reactivation by renewed invitation.
16. Supervisor access changes requiring reassignment; resident email-change reactivation.
17. Database immutability, bounds, sealed templates, and append-only audit constraints.
18. Rate limits, production security configuration, and mocked Resend requests without development links outside localhost.
19. Training-year/profile version changes reject stale assessments and preserve the draft until reviewed.

The concurrency tests accept either a preflight “already used” response or a transactional conflict for the losing invitation request. Both must produce exactly one successful activation, one session, one accepted invitation, and one activation audit event.

## Actual Worker runtime smoke

`tests/workerd-smoke.mjs` uses the installed Wrangler/Miniflare workerd runtime and real local D1. It applies the actual migration/setup and runs health, owner bootstrap/activation, psychiatrist/resident invitation and activation, draft save, stale-write rejection, publication, and student-response checks. It verifies no transaction-guard rows remain.

This complements the larger SQLite suite. It proves that the core paths execute in the target runtime; it is not a test of a particular remote Cloudflare account, DNS configuration, or mail domain.

## Frontend checks and limits

Targeted source/runtime smoke checks exercised English/Arabic demo and live rendering, session-derived roles, lack of live demo controls, student scalar-rating projection, API mutation/refresh behavior, CSRF and concurrency fields, immediate fragment stripping, explicit link acceptance, same-page login links, and absence of live record storage in localStorage.

Browser review inspected the actual static demo and responsive layouts. The live sign-in layout was visually reviewed against a temporary unauthenticated response fixture; the fixture was removed before delivery. Browser automation did not exercise a real emailed login against a hosted hospital instance. Actual backend onboarding and publication were exercised programmatically in workerd.

The independent review found and fixed a stale training-year form issue, an invitation DELETE content-type mismatch, same-page login fragment handling, pending-owner activation recovery, and canonical-origin configuration handling.

## Not performed

- Deployment to a real hospital-controlled Cloudflare account/database/domain.
- Delivery of a real login email or invitation to Dr. Khaled or anyone else.
- Hospital identity-provider or MFA integration.
- Production-data migration, load testing at hospital scale, or a production backup restore.
- Independent penetration testing, regulatory certification, clinical rubric validation, or institutional hosting approval.

Use `DEPLOYMENT.md` for configuration and staged acceptance, and `OPERATIONS.md` for release and recovery responsibilities. No demo records or development secrets are included in the production initialization or handoff archive.
