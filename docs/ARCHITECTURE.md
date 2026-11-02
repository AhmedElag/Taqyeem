# Taqyeem — تقييم
## Psychiatry residency database and application design

Taqyeem is a bilingual assessment and training-activity application for a psychiatry department. **Dr. Khaled Abdelazim is the program administrator.** Supervising psychiatrists assess their assigned residents; residents receive only their own published overall rating and record the file numbers they have worked on.

The English interface is the default. Arabic changes the interface language and reading direction. Both languages use the same accounts, records, question identities, and scoring rules.

This document describes the v2.1 deployment package. The ordered SQL migrations are the authoritative physical schema; `API-CONTRACT.md` defines the interface between the frontend and the server. The editable companion is `Taqyeem-Database-and-Workflows.drawio`. Deployment configuration and the result of the final verification belong to the deployment guide and test output, rather than being inferred from this design.

## 1. Decisions that make the first release understandable

| Decision | Resulting behavior |
| --- | --- |
| One primary supervising psychiatrist per resident | A doctor works with a clearly defined resident list. A previous assignment remains in history when a resident changes supervisor. A referral to another faculty member shares a frozen assessment snapshot without changing the primary assignment. |
| One current published assessment per resident per reporting month | The application knows which assessment supplies the resident's displayed rating. A correction creates a new publication and retains the earlier one. |
| One overall number in the student interface | The student API returns the score and period, not the category breakdown, private notes, peers, or department reports. |
| Review reminders independent of reporting month | The administrator sets 1–52 weeks per resident. Last publication plus the interval determines the next due date; a repeat publication in the same month keeps immutable history and one current monthly result. |
| Equal weighting for the initial rubric | The server averages all required category scores. It retains calculation precision and formats the display to one decimal place. |
| Questions and publications have immutable history | Changing a question or moving a resident to another training track cannot rewrite an earlier assessment. |
| Accounts are deactivated rather than deleted | Access stops while attribution and educational records remain available to authorized staff. |
| Invitations establish the account role | A visitor cannot choose an administrator or doctor role from the sign-in screen or alter a URL to gain it. |

The initial training tracks are **General Adult Psychiatry**, **Child & Adolescent Psychiatry**, and **Addiction Psychiatry**. They are configurable examples of a department's local training structure. They are not a declaration that the hospital runs three separately accredited residency programs.

## 2. The deployed system

The production browser receives the live frontend. A Cloudflare Worker handles the application API, authentication, validation, authorization, and report generation. Cloudflare D1 stores the structured records. A configured email provider delivers requested sign-in links. Static assets and the API are served under the same application origin.

The application uses native Worker JavaScript and Web Crypto. It does not need a long-running application server. The deployment configuration binds the SQL database and static assets to the Worker. Cloudflare documents this static-asset/Worker combination and the `run_worker_first` routing setting in its [asset binding documentation](https://developers.cloudflare.com/workers/static-assets/binding/).

### The two operating modes

| Mode | Purpose | Storage and access |
| --- | --- | --- |
| Demonstration | Let the family and department explore fictional workflows | Browser-local sample records and a visible role selector. It does not provide real role protection. |
| Live deployment | Operate the hospital's own configured instance | Server sessions, database records, server-enforced permissions, and no demo role selector. Only the language preference belongs in localStorage; a non-sensitive sessionStorage lock flag keeps the interface locked across reloads. |

The demo dataset is excluded from the generated production frontend. Production initialization creates the psychiatry training configuration; it does not import fictional doctors, residents, assessments, or file references. The first administrator is created through a separate, single-use bootstrap procedure using an explicitly configured email address.

### Trust boundaries

1. **The browser is an untrusted client.** It can request an operation but cannot establish the caller's identity, role, assignment, score calculation, or account status.
2. **The Worker is the authorization boundary.** Every read and mutation resolves the signed-in account and checks the relevant role and resident relationship.
3. **The database is the durable record.** Constraints and transactional writes protect relationships, uniqueness, publication state, and revision checks.
4. **Email proves possession of an invited address.** The email contains an expiring bearer link. The application does not accept an email address by itself as authentication.

## 3. Information model

The model separates identity, training structure, assessment history, and activity references. That separation is useful because an account can become inactive, an assignment can change, and an evaluation question can be revised without erasing earlier records.

### Identity and access

| Record group | Responsibility |
| --- | --- |
| Users | Name in English/Arabic, unique normalized email, role, and lifecycle status: pending, active, or inactive. |
| Invitations | Target account, intended role/program, token hash, expiry, redemption, and revocation. The plaintext link is returned only when created or reissued. |
| Login tokens | Expiring, single-use sign-in challenges for active registered accounts. |
| Sessions | A server-side session verifier, account reference, expiry, idle activity, and revocation state. |
| Rate-limit records | Bounded request counters for login, token consumption, and bootstrap. Sensitive request material is not stored as a readable identifier. |
| Bootstrap marker | Makes first-administrator provisioning a one-time operation, including concurrent attempts. |

### Training and assessments

| Record group | Responsibility |
| --- | --- |
| Programs / tracks | Bilingual training-track identity and presentation. |
| Doctor program membership | Which active psychiatrists may supervise a training track. |
| Resident profile / enrollment | Current program, training year, and review interval in weeks. |
| Supervision assignments | Current primary supervisor plus the ended assignment history. |
| Template versions and questions | Immutable bilingual rubric revisions, stable question identities, and question order. |
| Evaluations and scores | Draft state, publication state, the selected template, category scores, author, resident, period, and revision metadata. |
| Educational notes | Supervisor feedback associated with the assessment; excluded from student responses and ordinary report exports. |
| Assessment review referrals | Immutable draft snapshot and version/context sent to one selected faculty member; explicit approval or requested changes. |
| Quick observations / teaching goals | Private educational observations and at most one open teaching goal for a resident. |
| Current publication reference | Identifies the authoritative assessment for a resident and month without deleting previous publications. |

### Activity and accountability

| Record group | Responsibility |
| --- | --- |
| File log | Resident-owned file-number reference, work date, submission time, and review status. |
| File correction history | Immutable old/new identifier, file version, student actor, and whether renewed acknowledgment is required. |
| Review attribution | Which authorized doctor/admin reviewed a submitted reference and when. |
| Audit events | Who performed an administrative or assessment action, when it occurred, and which record was affected. Audit metadata must not duplicate secret links or private note text. |

### Physical tables in the delivered migration

The following **24 tables** match `migrations/0001_initial.sql` and `migrations/0002_review_workflows.sql`. The editable diagrams preserve the original ERD pages and add a review-workflow page identifying the four new record groups. `PK` denotes a primary key and `FK` denotes a foreign key. The migration contains the complete field types, indexes, checks, and triggers.

| Table | Key and main relationship | Stored responsibility / important constraint |
| --- | --- | --- |
| `users` | PK `id` | Unique case-insensitive email; bilingual name; role; pending/active/inactive status. `auth_version` invalidates existing access; `record_version` detects stale profile/enrollment edits. A partial unique index permits one administrator; triggers protect that account from ordinary deletion/deactivation. |
| `programs` | PK `id`; FK `current_template_id` → `template_versions` | Bilingual training-track identity and pointer to the current rubric. |
| `template_versions` | PK `id`; FKs `program_id`, `created_by` | Immutable rubric revision, unique within program/version. |
| `template_questions` | Composite PK `template_version_id, question_key` | Immutable bilingual wording/order; positions and each language's labels are unique within a version. |
| `doctor_programs` | Composite PK/FKs `doctor_id, program_id` | Doctor eligibility for each track. |
| `resident_profiles` | PK/FK `user_id`; FK `program_id` | Current enrollment, training year 1–6, and `review_interval_weeks` 1–52 (default 4). |
| `assignments` | PK `id`; FKs `resident_id`, `doctor_id`, `created_by` | Start/end times preserve supervisor history. A partial unique index permits one unended assignment per resident. |
| `invitations` | PK `id`; FKs `user_id`, `program_id`, `created_by` | Unique hashed token; expiry and acceptance/revocation timestamps. Only one pending invitation per account. The intended role is taken from the referenced user. |
| `login_tokens` | PK `token_hash`; FK `user_id` | Single-use login challenge, expiry, use time, and account authorization version. |
| `sessions` | PK `id`; FK `user_id` | Unique hashed verifier, account authorization version, absolute expiry, last activity, and revocation. |
| `evaluations` | PK `id`; FKs `resident_id`, `doctor_id`, `program_id`, `template_version_id`, `base_published_id` | Draft or immutable publication with saved program/year/month, overall mean, author, and version. One draft per resident/evaluator/month. `review_required` prevents an edited referred draft from bypassing required fresh approval. |
| `evaluation_heads` | Composite PK `resident_id, period`; FK `published_id` | Exactly one authoritative published revision for a resident/month. Triggers require the pointed-to publication to match that resident and month. |
| `evaluation_questions` | Composite PK `evaluation_id, position`; FK `evaluation_id` | Wording/order snapshots and nullable draft scores; scored values must be integers 1–10. Published snapshots cannot change. |
| `evaluation_notes` | PK/FK `evaluation_id` | Bilingual educational notes, up to 3,000 characters per language. Published notes cannot change. |
| `file_log` | PK `id`; FKs `resident_id`, `reviewed_by` | Reference number, work/submission dates, and review attribution. Normalized number is unique within each resident; `version` protects corrections/acknowledgment and `needs_recheck` records renewed review. |
| `audit_events` | PK `id`; FK `actor_id` | Append-only action, subject reference, limited metadata, and timestamp. `subject_id` is an action-dependent reference, not an FK to one table. |
| `rate_limit_buckets` | PK `bucket_key` | Request window and counter. Sensitive request keys are hashed by the application. |
| `bootstrap_state` | PK `singleton`, constrained to 1 | One-time administrator initialization marker. |
| `transaction_guards` | PK `id`; `ok` constrained to 1 | Short-lived conditional guard used inside a transaction to force rollback when an expected record/version no longer matches. |
| `schema_meta` | PK `version` | Migration readiness marker and application time. |
| `file_corrections` | PK `id`; FKs `file_id`, `changed_by` | Immutable original/new number, time, version, and prior acknowledgment state; one correction per file version. |
| `observations` | PK `id`; FKs `resident_id`, `doctor_id` | Immutable private educational observation and attribution; up to 1,500 characters per language. |
| `teaching_goals` | PK `id`; FKs `resident_id`, `doctor_id`, `reviewed_by` | Immutable goal content with one-time review completion; partial unique index permits one open goal per resident. |
| `evaluation_reviews` | PK `id`; FKs `evaluation_id`, `resident_id`, `from_doctor_id`, `to_doctor_id`, `template_version_id`, `base_published_id` | Immutable JSON assessment snapshot bound to draft/resident/context versions; state transitions and one current request per evaluation are constrained. |

Published rows are never given a mutable “superseded” database status. When a correction succeeds, `evaluation_heads.published_id` moves to the new immutable row; the earlier row remains `published` and is simply no longer the current head. The API may derive a superseded indicator from that relationship.

Some rules require both layers. Foreign keys alone do not prove that a user is a doctor, active, or assigned to a particular resident: the Worker checks those facts on every relevant request. The server also validates real calendar dates and period syntax beyond the migration's basic shape checks. Database publication triggers reject incomplete scores or a mismatched mean, and the API supplies the trusted template snapshot.

## 4. The psychiatry rubric

The starting categories are proposed local teaching criteria. Faculty should approve their wording and scoring anchors before using them for formal training decisions. The 1–10 application scale is **not** an ACGME Milestones conversion or a validated assessment instrument. Psychiatry's established competency areas provide useful background, but the app's rubric and calculation are local product choices; see the [ACGME Psychiatry Milestones](https://www.acgme.org/globalassets/pdfs/milestones/psychiatrymilestones.pdf).

| No. | English | Arabic |
| --- | --- | --- |
| 1 | Psychiatric interviewing and history | المقابلة النفسية وأخذ التاريخ المرضي |
| 2 | Mental status examination | فحص الحالة العقلية |
| 3 | Clinical formulation and differential reasoning | الصياغة السريرية والاستدلال التشخيصي |
| 4 | Risk assessment and safety planning | تقييم المخاطر وتخطيط السلامة |
| 5 | Management planning | تخطيط التدبير العلاجي |
| 6 | Psychopharmacology knowledge | المعرفة بالعلاج الدوائي النفسي |
| 7 | Therapeutic communication and psychotherapy skills | التواصل العلاجي ومهارات العلاج النفسي |
| 8 | Professionalism and confidentiality | المهنية والسرية |
| 9 | Teamwork and handover | العمل الجماعي وتسليم الحالات |
| 10 | Documentation and reflective learning | التوثيق والتعلم التأملي |

The administrator can edit the bilingual labels and create a new template version. The server accepts one to twenty distinct, nonempty category labels per template. All categories in the selected version are required for publication; blank is not converted into zero. A draft may contain unscored categories.

For category scores \(s_1,\dots,s_n\), the initial calculation is:

\[
\text{overall rating}=\frac{\sum_{i=1}^{n}s_i}{n},\qquad s_i\in\{1,2,\dots,10\}.
\]

For example, scores totalling 84 across ten categories produce **8.4 / 10**. An incomplete draft does not produce a published student result. The server calculates the value, so a client-supplied overall score cannot override it.

## 5. Authorization and response design

| Operation | Administrator | Supervising psychiatrist | Resident / student |
| --- | --- | --- | --- |
| Register, invite, update, deactivate accounts | Yes | No | No |
| Assign or reassign the primary supervisor | Yes | No | No |
| Revise assessment templates | Yes | No | No |
| Read resident profile and submitted file references | All authorized department records | Current assigned residents | Own permitted profile and references |
| Read category scores and educational notes | Yes | Current assigned residents; explicitly referred snapshot only for an unassigned resident | No |
| Save a draft / publish a rating | Any resident | Current assigned residents | No |
| See a published overall rating | Yes | Current assigned residents | Own latest published period only |
| Submit or correct a file number | No | No | Own account only, with version checks |
| Add private observations/goals or mark a goal reviewed | Yes | Current assigned residents | No |
| Send a saved draft for faculty review | Author-owned draft | Author-owned draft for an assigned resident | No |
| Respond to a review request | When selected as recipient | When selected as recipient | No |
| Change the review interval | Yes | No | No |
| Mark a file reference reviewed | Yes | Current assigned residents | No |
| Export department reports | Yes | No | No |

In live mode, the server derives the submitting resident or evaluator from the session. An `actorId`, role, or resident ID inserted into a request must not grant access. Staff endpoints perform assignment checks even when the caller knows another resident's record ID.

The student workspace is deliberately a different response projection. It contains the student's own permitted profile, own file references, and either `{score, period}` or no rating. It must not fetch full evaluations into the browser and merely hide them with CSS or navigation. Published notes and category scores remain outside that response.

The ordinary staff workspace returns current published assessments and the signed-in evaluator's own drafts. Incoming review requests additionally carry their frozen assessment snapshots. This referral grants no access to the resident's files, other assessments, observations, or goals. A different supervisor's unfinished draft is not exposed merely because the administrator or a newly assigned doctor can read the resident's published history. Older publication revisions are retained in the database; the ordinary monthly display selects only the current publication. File correction and referral history are available to their authorized faculty workflows.

## 6. History and concurrent edits

Three independent facts are retained when an assessment is published:

- **The evaluated context:** resident, training track, training year, period, and evaluator.
- **The rubric used:** template version, question identities, wording, and order.
- **The result:** category scores, calculated overall value, publication time, and its relationship to the previous publication.

A later program change must not move an old assessment into the new program's reports. A later question edit must not relabel an old score. An earlier publication is retained when corrected.

Assessment requests carry three separate expectations: `expectedVersion` for the evaluator's draft, `expectedResidentVersion` captured from the resident's `recordVersion`, and `basePublishedId` for the publication last observed by the editor. If any has changed, the server returns **409 Conflict** and asks the client to reload. The resident version detects profile, training year, program, and supervisor changes made after the form was opened, including a year change that leaves the rubric unchanged. The current template ID is also checked. The transaction repeats these checks before changing records, so an update that arrives while the request is being processed also causes rollback.

Publication groups the new assessment, its scores/notes, current-publication reference, draft consumption, and audit event into one database operation. D1's [`batch()`](https://developers.cloudflare.com/d1/worker-api/d1-database/) executes its statements as a transaction and rolls the batch back if a statement fails. The implementation also needs a conditional guard that fails the batch when the expected revision is stale; a transaction alone does not establish that expectation.

## 7. Authentication and account lifecycle

The application uses email sign-in links rather than storing passwords. The login response is generic so that an unauthenticated visitor is not told whether an address is registered. Only a pre-registered active account may receive a usable login link.

| Item | V2 policy |
| --- | --- |
| Login link | Random, single use, 15-minute lifetime |
| Invitation | Random, single use, seven-day lifetime; reissue revokes the older link |
| Link storage | Full SHA-256 verifier; plaintext token is not retained in the database |
| Session lifetime | Eight hours maximum, with a 30-minute idle limit enforced on the server |
| Session cookie | Host-only, `Secure`, `HttpOnly`, explicit `SameSite`, root path |
| Mutation protection | Exact configured Origin and a per-session CSRF value for authenticated writes |
| Deactivation / email change | Revoke existing sessions and outstanding access tokens; a changed email requires a fresh invitation |

The application removes a link token from the URL fragment before continuing, retains it only in memory, and asks the user to press an explicit sign-in/accept button. It does not redeem a login simply because an email preview opens the page. Token redemption and account activation/session creation must be atomic so two requests cannot reuse the same challenge.

Initial owner provisioning is single-use. If that first activation link is lost or expires, `POST /api/auth/recover-owner` can rotate the invitation only for the configured administrator email while the owner remains pending. It requires the operator's bootstrap bearer secret, revokes previous access links, and guards the pending state/version transactionally. It cannot reset an active administrator or create a second owner. The deployment guide describes removing the bootstrap secret after successful activation and a verified emailed login.

These choices follow the principles of server-side session expiry, high-entropy session identifiers, protected cookies, and keeping credentials out of browser storage described by [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). They are implementation controls, not a claim that the application has completed an independent security assessment.

## 8. Data scope, reports, and operations

The file log holds a **reference number**, not a copy of a patient's medical file. No patient names, diagnoses, clinical narratives, or file uploads are required for this workflow. Educational notes describe the resident's performance. The hospital still determines who may access its file references and how long training records should be retained.

Report export is administrator-only. Filters are training track, resident, and assessment month. Published current assessments and their historical training context supply the report. Drafts and private notes are excluded. CSV output includes UTF-8 handling for Arabic and formula-safe text fields.

The exported CSV uses **one row per scored category**. Each row repeats the assessment ID, resident, saved training context, overall score, and period file count alongside that category's wording and score. Group by assessment ID before computing resident-level totals; repeated metadata is not another assessment or additional file activity. An empty selected period produces headers without fabricated ratings. The interface's summary counts each current publication once.

Operational preparation includes verified email delivery, explicit application origin and secrets, applied migrations, a separate staging database, and an agreed backup/restore routine. Cloudflare D1 offers [Time Travel recovery](https://developers.cloudflare.com/d1/reference/time-travel/); current retention depends on the selected plan, as listed in [D1 limits](https://developers.cloudflare.com/d1/platform/limits/). A recovery feature should be supplemented by a rehearsed restore procedure and the hospital's retention requirements, not treated as proof that recovery has been tested.

The package should be deployed with a valid administrator email, mail sender configuration, secrets, and database binding. Jurisdiction, institutional approval, retention, and identity requirements remain deployment decisions for the hospital. No particular regulatory compliance or hosting-location suitability is asserted here.

## 9. Extensions outside this release

These remain potential later changes:

- Multiple concurrent supervisors contributing to a moderated or weighted final score.
- Mandatory approval chains involving multiple sequential reviewers.
- Rotation calendars, attendance, comprehensive learning plans, or portfolio uploads.
- Hospital identity-provider integration and an institution-specific MFA policy.
- Patient-record system integration or clinical information storage.
- Multi-hospital tenancy and cross-institution reporting.

The database history and server authorization structure are intended to make those decisions possible later without weakening the resident's current limited view.

## 10. Review handoff and screen locking

A saved draft can be referred to any other active psychiatrist or the administrator. Approval is bound to exactly the requested draft version, score/note payload, rubric, resident profile/assignment version, and current publication head. Pending and changes-requested drafts cannot publish. An edit supersedes the prior snapshot while retaining `review_required`; the author must obtain a new approval or explicitly cancel review. The selected reviewer gives the decision; the author performs publication. The student's rating changes only at publication.

The lock control hides the private UI and uses real session revocation in live mode. Reauthentication is required to reopen records. An inactivity timer also locks the UI after 15 minutes without interaction; the existing server's independent 30-minute idle and eight-hour absolute expiry continue to apply. An offline lock keeps the interface closed and retries revocation, rather than implying a failed network request revoked the session. The demo's unlock action is visibly labeled as a simulation.
