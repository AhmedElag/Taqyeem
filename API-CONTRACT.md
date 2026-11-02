# Taqyeem implementation contract

This is the agreed contract for the deployable v2 implementation, not a claim that all endpoints have been verified yet.

## Product decisions

- Brand: Taqyeem / تقييم. Psychiatry residency assessment.
- One primary supervising psychiatrist per resident in v1; admin may evaluate any resident. Assignments preserve history.
- Psychiatry training tracks: General Adult Psychiatry (`adult`), Child & Adolescent Psychiatry (`child`), Addiction Psychiatry (`addiction`). These are editable local starter templates, not an accredited assessment instrument.
- Ten default criteria: psychiatric interviewing/history; mental status examination; formulation/differential reasoning; risk assessment and safety planning; management planning; psychopharmacology knowledge; therapeutic communication/psychotherapy skills; professionalism/confidentiality; teamwork/handover; documentation/learning. Local faculty approve wording and scoring anchors.
- Month `YYYY-MM` is the assessment period. Every required integer score is 1–10, equal weight; the server calculates an unrounded mean, display one decimal. One authoritative published assessment per resident/month; corrections create immutable revisions and require an expected previous publication ID. The latest published period supplies the student's single displayed number.
- All persistence in live mode is through the server. No clinical records, credentials, evaluations, or file numbers in localStorage. Language preference only. The static hosted demo remains explicitly fictional, separate from live deployment.
- Authentication: single-use random email login links, 15-minute expiry; invitations seven days. Tokens are SHA-256 hashed at rest. Secure HttpOnly host-only session cookie, 8-hour absolute / 30-minute idle expiry, per-session CSRF token, exact Origin checks on mutations. All account deactivation revokes sessions and outstanding tokens immediately.
- No patient name, diagnosis, clinical notes, attachments or patient-document upload fields. File-number references only; supervisor notes are resident educational feedback.

## Layout / ownership

- `dist/` = existing hosted Site demo; frontend owner edits here.
- `server/worker.mjs`, supporting `server/*.mjs`, `migrations/0001_initial.sql`, `tests/backend.test.mjs` = backend owner's files.
- `public/` = generated production frontend: same app with `window.TAQYEEM_MODE = 'live'`, demo seed excluded. Root creates build/config/scripts/docs and diagram deliverables. Do not edit generated public files manually.
- Native Site deployment remains static/private. The standalone Cloudflare source package carries the actual server and D1 deployment. Do not call native Sites tools from subagents.

## Conventions

All JSON mutations use Content-Type application/json. Authenticated mutations send `X-CSRF-Token` from `/api/session`. All mutations also require Origin matching APP_ORIGIN, except bootstrap (Bearer secret, strict origin still accepted from bootstrap script). No wildcard CORS.

Roles are `admin`, `doctor` (manager), `student`.

Error: HTTP 4xx/5xx with `{error:{code,message}}`; user-safe message, no SQL/notes/tokens. Frontend displays a localized generic fallback and server message for actionable configuration errors. Validation 422, unauthenticated 401, forbidden 403, conflict 409, rate limited 429.

## Session / onboarding

- `GET /api/health` → `{ok:true,app:'Taqyeem'}`. Check actual DB migration readiness; 503 if unavailable.
- `GET /api/session` → `{authenticated:false}` or `{authenticated:true,user:{id,role,name:{en,ar},email,initials,color},csrfToken,period,today}`.
- `POST /api/auth/request-link` `{email,lang}` → generic 202 `{ok:true}` whether account unknown/inactive or email queued. Only pre-registered active accounts can receive links. Use RESEND_API_KEY and MAIL_FROM. Development-only mail sink may return/log test links only when APP_ORIGIN is localhost AND DEVELOPMENT=true; never in production.
- `POST /api/auth/consume` `{token}` → `{ok:true}` and session cookie. Login URL is `APP_ORIGIN/#login=TOKEN`; frontend strips fragment immediately and requires an explicit sign-in button, rather than auto-consuming on page load.
- `POST /api/auth/invitation` `{token}` → `{name:{en,ar},role,programId,expiresAt}` if valid. No session.
- `POST /api/auth/accept-invitation` `{token}` → `{ok:true}` and session cookie. Atomically activate the previously registered account and consume invitation. URL is `APP_ORIGIN/#invite=TOKEN`.
- `POST /api/auth/logout` → `{ok:true}`, revoke session, clear cookie.
- `POST /api/auth/bootstrap`, `Authorization: Bearer BOOTSTRAP_TOKEN`, JSON `{}` → `{ok:true,activationUrl}`. Requires valid configured ADMIN_EMAIL, sufficiently long BOOTSTRAP_TOKEN and SESSION_SECRET; exactly once. Creates sole admin Dr. Khaled Abdelazim / د. خالد عبد العظيم as pending, and a single-use activation invitation. Empty production starts with no other users or fictional records. No admin-email default; guide explains required configuration.
- `POST /api/auth/recover-owner`, same operator Bearer credential and exact Origin, JSON `{}` → `{ok:true,activationUrl}`. Only the existing pending sole admin whose email matches ADMIN_EMAIL may receive a fresh invitation; prior invitation revoked atomically. Cannot replace or reset an active owner. Handles lost/expired first activation and uncertain bootstrap responses without creating a second admin.

## Workspace response

`GET /api/workspace` → `{data,studentRating,period,today}`.

`data = {version:2,students:[],doctors:[],programs:[],evaluations:[],files:[],invitations:[],activity:[]}` uses current demo-compatible record shapes, with extra version fields where needed:

- student `{id,name:{en,ar},email,programId,year,doctorId,active,pending,initials,color,joined,recordVersion}`. `active` denotes not deactivated; pending accounts cannot authenticate until invited acceptance. `recordVersion` changes when the resident profile/enrollment is edited.
- doctor `{id,name:{en,ar},email,programs:[ids],active,pending,initials,color}`.
- program `{id,name:{en,ar},color,description:{en,ar},templateVersionId,templateVersion,questions:[{id,en,ar}]}`.
- evaluation `{id,studentId,doctorId,programId,trainingYear,period,status,version,templateVersionId,scores:[integer|null],questions:[{id,en,ar}],note:{en,ar},createdAt,publishedAt?,superseded?:boolean}`. Only current publications + actor-owned drafts are needed by normal UI; historical revisions can remain server-side. Never reclassify historical program/year based on current enrollment.
- file `{id,studentId,number,date,createdAt,reviewed}`.
- invitation `{id,name:{en,ar},email,role,programId,status,createdAt,expiresAt}`. No tokens/links in list. Creation/reissue alone returns URL once, and frontend keeps it only in memory.
- activity `{id,type,text:{en,ar},at}`. Admin only; doctor activity limited to their assignments. No secret/clinical note text.

Admin receives all relevant records. Doctor receives only current assigned residents and their assessments/files, relevant programs, and minimal doctor identities needed for attribution. Student response MUST contain only their own profile, own files, and `studentRating:{score,period}|null`; evaluations, notes, doctors, programs, invitations, activity must be absent/empty. Server role enforcement independent of UI.

## Mutations

After successful mutations frontend reloads `/api/workspace`. Do not optimistically claim saved if request fails.

- `POST /api/admin/students` `{nameEn,nameAr,email,programId,year,doctorId}` → `{ok:true,invitation:{...record,url}}`. Creates pending student, enrollment, assignment, invitation atomically.
- `PATCH /api/admin/students/:id` `{nameEn?,nameAr?,email?,programId?,year?,doctorId?,active?}` → `{ok:true,invitation?:{...record,url}}`. Validate active eligible supervisor, retain assignment/evaluation history, deactivate reversibly. An email change requires renewed invitation and session revocation.
- `POST /api/admin/invitations` `{nameEn,nameAr,email,programId,role:'doctor'}` → `{ok:true,invitation:{...record,url}}`. Creates pending doctor + program membership and invitation. Frontend exposes manual copy; no automatic email claim.
- `POST /api/admin/invitations/:id/reissue` → same one-time URL response, revoke old link atomically.
- `DELETE /api/admin/invitations/:id` → `{ok:true}`. Revoke, not delete history.
- `PATCH /api/admin/doctors/:id` `{nameEn?,nameAr?,email?,programs?,active?}` → `{ok:true,invitation?:...}`. Reject deactivation/program removal until affected active residents are reassigned. Sole admin is not accepted as a target.
- `PUT /api/admin/programs/:id/questions` `{expectedVersion,questions:[{id,en,ar}]}` → `{ok:true,templateVersionId,templateVersion}`. One to twenty nonempty distinct bilingual labels; create new immutable template revision; reject stale version.
- `POST /api/evaluations/draft` and `POST /api/evaluations/publish` `{studentId,period,templateVersionId,scores,note:{en,ar},expectedVersion,expectedResidentVersion,basePublishedId}`. `expectedVersion` is own draft.version, or 0 for none. `expectedResidentVersion` is the resident's `recordVersion` captured when the editor opened; a profile/year/program/assignment change makes it stale. `basePublishedId` is latest current published id for resident+period, or null. Server obtains immutable question snapshot, validates program/year/assignment, derives doctor identity from session, calculates mean. Draft permits nulls; publication requires every score. On successful publish the own draft is consumed, previous publication is superseded, new immutable revision and audit are committed atomically. Reject 409 on stale draft/head/template/enrollment changes, rather than silently overwriting.
- `POST /api/files` `{number,date}` → `{ok:true}`. Student identity from session only. Normalize Arabic/Persian digits, trim/case; format letters/numbers/slash/hyphen/underscore; max40. Unique per student. Real date not in future. No arbitrary studentId accepted.
- `POST /api/files/:id/review` `{reviewed:true}` → `{ok:true}`. Admin or assigned current doctor only.
- `GET /api/reports?programId=all&studentId=all&period=YYYY-MM&lang=en&format=csv` → UTF8 CSV, BOM, formula-safe cells. Admin only. Published current snapshots, category scores, period file count; notes excluded. JSON format optional; existing report page can derive chart from authorized workspace.

## Backend build/test requirements

- Native Worker ES module, Web Crypto, D1 parameterized SQL. Runtime dependency-free; Node 24 test runner and node:sqlite for SQLite-backed integration tests. Wrangler devDependency for actual deployment.
- D1 `batch()` provides atomic multi-statement writes. Use conditional guards/constraints to roll back stale/replayed token writes, not a read-then-write assumption.
- SQL constraints for roles, 1–10 score bounds, unique emails/file references/current assignment, required foreign keys; immutable versions and published snapshots; append-only audit.
- Apply SQL schema separately from setup seed. Production initialization seeds only psychiatry programs/questions and no fake users.
- Rate limit login by hashed IP + normalized email, token consumption and bootstrap; do not log bearer tokens, scores, or supervisor notes. Secrets never in frontend/config archive.
- Required integration checks: unauthenticated/role/IDOR denial; student JSON contains no notes/categories/peers; forged actor ignored; inactive sessions denied; origin/CSRF; single-use invite/login including replay; invalid/incomplete score rollback; optimistic conflict rollback; historical template/program retention; file dedupe; report scope/export; bootstrap single-use; empty production seed.
