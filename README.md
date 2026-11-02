# Taqyeem — تقييم

**Psychiatry residency, thoughtfully connected.**

A bilingual frontend and deployable backend for **Dr. Khaled Abdelazim’s** psychiatry training team. English is the default; Arabic includes a right-to-left layout. Supervising psychiatrists assess their assigned residents, and each resident sees only their own published overall score and their own file-number log.

## What is included

- A polished administrator dashboard, resident directory, supervising-doctor management, invitation flow, monthly evaluation editor, file review, question editor, and filtered reports.
- Private teaching observations and goals, per-resident review reminders from 1 to 52 weeks, and a draft-review inbox for consultations with another doctor or the administrator.
- Student file-number corrections with review acknowledgment and history, plus manual and inactivity screen locking.
- A deliberately limited student workspace: one overall rating out of ten and the resident’s own submitted file references.
- A Worker API with server-enforced roles and assignments, passwordless email sign-in, expiring invitations, protected sessions, CSRF checks, and audit history.
- A SQL schema with immutable published assessments, versioned bilingual questions, optimistic revision checks, and assignment history.
- Three psychiatry starter tracks with ten editable teaching categories. The rubric is a local starting point, not an accredited instrument.
- Deployment/configuration scripts, repeatable SQL migrations, an integration suite, operational guidance, and an editable database/workflow diagram.

## Choose the right mode

| | Demo | Live application |
| --- | --- | --- |
| Files | `dist/` or the standalone `Taqyeem-Demo.html` deliverable | Generated `public/` plus `server/` |
| Entry | Opens directly to Dr. Khaled’s dashboard | Email sign-in / invitation acceptance |
| Data | Fictional sample records, stored in that browser | Authorized server API and SQL database |
| Role selector | Visible for showing the three experiences | Absent; role comes from the server session |
| Actual resident information | Do not enter it | After configuration, staging checks, and hospital approval |

The hosted demonstration is separate from the standalone production deployment. Publishing the demo does not provision this package’s real database, email sender, or administrator account.

## Publish the demonstration on GitHub Pages

The package includes a ready-made `docs/index.html` and `docs/.nojekyll`. Copy the contents of the extracted `Taqyeem` folder into your repository, commit, and push. In the repository’s Settings → Pages, select **Deploy from a branch**, your pushed branch, and **/docs**.

After editing the frontend, run `npm run build:demo` before committing. This regenerates both the standalone `artifacts/Taqyeem-Demo.html` and the Pages export. The demo role switch also lets you choose a sample doctor to try both sides of an evaluation handoff.

## Run the backend locally

Install Node.js 24 or newer. From this directory:

```sh
npm ci
npm run setup:local
npm run dev:live
```

Leave that terminal running. In a second terminal:

```sh
npm run bootstrap:local
```

Open the printed one-time administrator activation link. Local development uses `admin@example.test`; it sends no email. The live frontend exercises the actual server, SQL database, sessions, and authorization. Subsequent local sign-in requests display a development-only link.

## Deploy

Follow **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. It covers database creation, choosing the exact application origin, setting Dr. Khaled’s real email, configuring the sender, secret upload, migration, deployment, and one-time owner activation. Required values are intentionally blank or marked with a placeholder; production deployment refuses an incomplete configuration.

```sh
npm run deploy:check
```

This command runs source checks and integration tests, builds the live assets, and asks Wrangler to bundle the Worker without deploying it. It does not prove that a particular deployment account, custom domain, or email sender is configured correctly.

## Product rules in this release

**Administrator:** Dr. Khaled manages residents and psychiatrists, assigns primary supervisors, edits bilingual categories, sets each resident’s review interval (1–52 weeks), reviews assessments/files and incoming evaluation requests, and exports reports. Removing an account deactivates it while preserving history.

**Supervising psychiatrist:** works with currently assigned residents, scores each required category from 1 to 10, saves drafts, records private teaching observations and goals, publishes an assessment, and reviews file references. A doctor can send a saved draft to another active doctor or the administrator. The recipient sees that assessment snapshot and returns approval or requested changes; the author performs final publication. An explicit referral does not provide access to the resident’s unrelated records.

**Resident / student:** signs in, reads their own latest published overall rating, and submits/views/corrects their own file references. A correction to a reviewed number returns it for acknowledgment. The server does not send category scores, private feedback, teaching goals, review requests, other users, or administrative reports to that role.

One primary supervisor is active per resident. A calendar month groups reporting snapshots, while the review reminder interval counts weeks from the last published rating (or the joining date before the first publication). Sending a draft for review does not restart that interval. A further publication in the same month preserves the earlier immutable version and updates the month’s current rating. A complete set of equally weighted scores produces one mean, displayed to one decimal place.

The live screen lock ends the authenticated session and requires sign-in again; the demo’s unlock button is explicitly a demonstration. Apply **all** ordered migrations, including the 0002 workflow migration, when upgrading an existing database.

## Documents and source map

| Path | Purpose |
| --- | --- |
| `docs/ARCHITECTURE.md` | Information model, permissions, clinical rubric, history, security boundaries |
| `docs/WORKFLOWS.md` | Onboarding, evaluations, files, reporting, and account lifecycle |
| `docs/Taqyeem-Database-and-Workflows.drawio` | Editable architecture, ERD, and workflows for diagrams.net / draw.io |
| `docs/DEPLOYMENT.md` | Local and production installation |
| `docs/OPERATIONS.md` | Backups, recovery, releases, and troubleshooting |
| `docs/VERIFICATION.md` | Checks completed on the delivered revision and remaining deployment checks |
| `API-CONTRACT.md` | Request/response shapes and role-specific responses |
| `migrations/` | Ordered database migrations |
| `server/setup/psychiatry.sql` | Programs and question templates only; no sample users |
| `server/` | API, authentication, authorization, validation, SQL writes, CSV reports |
| `tests/` | Node integration tests using SQLite and the Worker request handler |
| `scripts/` | Build, configuration, validation, and local/bootstrap helpers |

## Data scope and handover status

This is a residency assessment application, not a patient record system. File numbers are references; there is no patient-name, diagnosis, patient-document upload, or clinical-note workflow. Supervisor notes describe the resident’s learning. The hospital must approve where its file references and educational records are stored, the access policy, and retention period.

The code and deployment workflow are supplied for review and deployment. No real hospital instance or email domain has been provisioned by this package. No independent penetration test, clinical validation, regulatory certification, or specific hosting-location approval is implied.
