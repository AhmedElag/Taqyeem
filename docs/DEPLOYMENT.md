# Deploy Taqyeem

This package deploys one psychiatry department’s application to **Cloudflare Workers + D1**, with **Resend** for requested sign-in emails. Assets and API share one origin. The hosted family demo is a separate static application with fictional records.

## 1. Required decisions and accounts

Use Node.js 24 or newer and the included lockfile. The operator needs a Cloudflare account with permission to create a Worker and D1 database, and a Resend account with a verified sender domain. The application does not create those accounts or enter billing agreements for you.

Gather these values:

| Value | Meaning | Where stored |
| --- | --- | --- |
| Worker name | Default: `taqyeem-psychiatry` | `wrangler.jsonc` |
| D1 database UUID | Returned when the database is created | `wrangler.jsonc` |
| `APP_ORIGIN` | Exact public HTTPS origin you will use | `wrangler.jsonc` |
| `ADMIN_EMAIL` | Dr. Khaled Abdelazim’s real, controlled email | `wrangler.jsonc` |
| `MAIL_FROM` | `Taqyeem <noreply@your-verified-domain>` | `wrangler.jsonc` |
| `APP_TIMEZONE` | Hospital IANA zone, such as `Africa/Cairo` if appropriate | `wrangler.jsonc` |
| `SESSION_SECRET` | Random value, at least 32 characters | Cloudflare secret |
| `BOOTSTRAP_TOKEN` | A different random value, at least 32 characters | Cloudflare secret; remove after setup |
| `RESEND_API_KEY` | Key authorized for the verified sending domain | Cloudflare secret |

Choose the actual hospital time zone rather than assuming it from the language. It determines the current month and latest permitted file date. The origin must be canonical: HTTPS, no trailing slash, path, query, or fragment. It is used in invitation/login links and origin checks, so an incorrect value breaks sign-in.

Before real use, the institution must approve hosting terms/location, record retention, and identity requirements. This implementation is not a declaration of HIPAA, GDPR, or local-law compliance.

## 2. Install and validate the source

Unzip the deployment package and open a terminal in its `Taqyeem` directory:

```sh
npm ci
npm run deploy:check
```

Dependencies are pinned in `package-lock.json`. The application runtime has no third-party JavaScript dependencies; Wrangler is the deployment tool. `deploy:check` performs tests and a dry-run bundle, with no production write.

To explore only the interface, open `Taqyeem-Demo.html` in a desktop browser. Use fictional names and references in that demo.

## 3. Optional: exercise the live system locally

```sh
npm run setup:local
npm run dev:live
```

`setup:local` creates an ignored `.dev.vars` only if one does not exist, generates random local secrets, and applies migrations and psychiatry setup to a local D1 database. Rerunning preserves existing local records. It creates no remote database.

With the server running, use a second terminal:

```sh
npm run bootstrap:local
```

Open the printed URL and accept the invitation. This creates the first local administrator session. Local onboarding exercises the real API: invite a psychiatrist, accept their link, and add a resident with that active psychiatrist as supervisor. Use separate browser profiles/private windows for different roles.

Local sign-in uses `admin@example.test` and the development mail sink. A sign-in request displays a test link only when both `DEVELOPMENT=true` and the configured origin is localhost/127.0.0.1. No email is sent. Production keeps `DEVELOPMENT=false` and HTTPS.

Use `http://localhost:8787` exactly. Live records are in the local SQL database, not localStorage. `.dev.vars`, `.wrangler/`, and SQLite files are ignored by Git and excluded from the delivered archive.

## 4. Create the remote database

```sh
npx wrangler login
npx wrangler d1 create taqyeem-psychiatry
```

Complete authentication in your own browser. Retain the returned database UUID. If Wrangler offers to edit configuration, ensure the binding is exactly `DB` and `migrations_dir` is `migrations`.

Determine the final origin from your Cloudflare Workers subdomain or a custom domain you control. Different preview URLs are not automatically trusted.

## 5. Write the nonsecret configuration

```sh
npm run configure
npm run check:config
```

The script asks for the Worker name, origin, real administrator email, verified sender, time zone, database name, and UUID. It validates the input before writing `wrangler.jsonc`. It does not ask for secret keys.

Keep the generated configuration as strict JSON, even though Wrangler accepts the `.jsonc` extension. The helper scripts intentionally parse JSON and do not accept comments or trailing commas.

Do not leave the zero UUID or an example email in production. Do not put `SESSION_SECRET`, `BOOTSTRAP_TOKEN`, or `RESEND_API_KEY` inside `vars`, HTML, JavaScript, screenshots, or source control. Configuration checks reject secret values accidentally added to `vars`.

## 6. Upload secrets

Generate two different random values using your password manager, or run this command twice and keep each result privately:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Store the values in the institution’s secret manager, then use interactive secret input:

```sh
npx wrangler secret put SESSION_SECRET
npx wrangler secret put BOOTSTRAP_TOKEN
npx wrangler secret put RESEND_API_KEY
```

Paste one value at each prompt. Do not pass secrets as shell arguments. If Wrangler asks to create the named Worker before setting its first secret, verify its name matches your configuration and allow that setup.

Verify the Resend sender domain and use a key authorized for it. Invitation links are generated for Dr. Khaled to copy and share with the named recipient; the application does not automatically send those invitations. Subsequent sign-in links are emailed when an active user requests them.

## 7. Apply migrations and starter configuration

```sh
npm run db:migrate:remote
npm run db:setup:remote
```

Review the remote database name before confirming. Migrations create tables, indexes, and invariants. The separate setup creates **only** the three psychiatry tracks and their ten bilingual question templates. It inserts no users, patient records, scores, or demo references.

Do not edit an already applied migration to upgrade a running deployment. Add a new numbered migration and follow the backup/staging procedure in `OPERATIONS.md`.

### Upgrade an existing deployment to 2.1

Apply `0002_review_workflows.sql` with the normal migration command before deploying this application version. It adds review intervals, private observations/goals, versioned file corrections, and assessment-review snapshots while retaining existing records. Existing residents receive a four-week interval; existing file entries start at version 1. The application health check requires schema version 2.

```sh
npm run db:migrate:remote
npm run deploy
```

Rehearse the upgrade on staging first. Migrations are ordered and tracked by Wrangler; run the migration command rather than manually executing an already-applied SQL file again. Keep the existing database binding and administrator account. Do not bootstrap a second time.

## 8. Deploy

```sh
npm run deploy
```

This validates configuration, checks JavaScript, runs integration tests, generates `public/`, and deploys the Worker/assets. The build removes `seed.js` and sets the frontend to live mode.

Open the returned HTTPS URL. If it differs from `APP_ORIGIN`, correct the configuration and redeploy. If using a custom domain, configure it in Cloudflare and wait for DNS/TLS readiness before continuing. Expect a sign-in screen with no demo role selector.

Open `/api/health` on that origin. Expect `{"ok":true,"app":"Taqyeem"}` when the schema is ready. Health success does not prove email delivery or that every user workflow has been exercised.

## 9. Activate Dr. Khaled’s account

```sh
npm run bootstrap
```

Enter the bootstrap secret in the hidden prompt. The script prints a **private, single-use activation URL**, valid for seven days. Give it directly to Dr. Khaled through an appropriate private channel. He opens it and explicitly accepts the invitation.

The server fixes the name to **Dr. Khaled Abdelazim / د. خالد عبد العظيم**, uses the configured email, and creates the sole administrator. It does not send an email or create other people. Repeated bootstrap calls return a conflict.

If this first activation link is lost, expired, or the initial request timed out after creating the account, an operator with the bootstrap secret can run:

```sh
npm run bootstrap:recover
```

Recovery works only while the same configured owner is still pending. It revokes the old invitation and returns a new one. It cannot reset or replace an active administrator. For a local installation, use `npm run bootstrap:recover:local`.

After activation and a fresh emailed sign-in both succeed, remove the setup secret:

```sh
npx wrangler secret delete BOOTSTRAP_TOKEN
```

Keep technical operator access under institutional control. An activation link is a credential, not a shareable demo link.

## 10. Verify a full workflow in staging

Use a separate staging Worker/database and controlled test addresses before entering real residency records:

1. Invite a supervising psychiatrist and accept their invitation in a separate session.
2. Add a resident, select that active psychiatrist and the training year, then accept the resident’s invitation separately.
3. Submit a fictional file reference as the resident and confirm it appears for the assigned psychiatrist.
4. Save an incomplete draft as the psychiatrist. Confirm the student has no new score. Complete all categories and publish; confirm the student sees only the overall value.
5. Correct the assessment and verify the old publication remains in database history. Change a template and verify older wording remains unchanged.
6. Confirm another psychiatrist cannot read the resident by changing an API ID. Inspect the student response for absence of notes, categories, and peers.
7. Export a filtered administrator CSV, switch to Arabic, and check the result in the institution’s spreadsheet software.
8. Deactivate the resident and verify their existing session loses access. Rehearse restoring a backup into a separate disposable database.
9. Confirm requested sign-in email arrives, expires, is single use, and works after sign-out. Generic “check your email” UI is not a delivery receipt.
10. Set a resident to a 1-week and then 52-week review interval. Confirm the next date follows the last publication and that the due queue is separate from monthly reporting.
11. Add a private observation and goal. Check that students and unassigned doctors receive neither. Mark the goal reviewed and create the next one.
12. Send a draft to a doctor who does not supervise that resident. Confirm they see only the shared snapshot and can approve/request changes; the author must still publish. Edit an approved draft and verify it requires a new review or explicit cancellation.
13. Correct an already-reviewed file number as its student owner. Confirm the reference needs another acknowledgment, the old number remains in faculty history, and a stale review cannot acknowledge the correction.
14. Lock a signed-in staff screen. Verify a replay of its old cookie is rejected, reopening the tab requires sign-in, and the saved draft is available after a new authenticated session.

Use real records only after the institution approves the workflow, rubric, hosting, and access arrangements. Completed package checks are documented in `VERIFICATION.md`.

## Reference commands

| Command | Effect |
| --- | --- |
| `npm run check` | Syntax and source checks |
| `npm test` | SQLite-backed API integration suite |
| `npm run build` | Generate `public/` live assets |
| `npm run deploy:check` | Tests and Worker bundle validation; no deployment |
| `npm run setup:local` | Initialize/upgrade local SQL and local-only configuration |
| `npm run dev:live` | Run the actual Worker locally on port 8787 |
| `npm run configure` | Fill nonsecret production values |
| `npm run deploy` | Verify and deploy the configured Worker |

Official references: [Worker assets](https://developers.cloudflare.com/workers/static-assets/binding/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [Wrangler D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/), [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email).

## Publish the demonstration through GitHub Pages

From the repository root, run `npm run build:demo`. It writes the standalone demo and the tracked `docs/index.html`/`docs/.nojekyll` publishing files. Push the source repository, then choose **Settings → Pages → Deploy from a branch**, the pushed branch, and **/docs**. This publishes the fictional interactive demo. `npm run build` produces the live Worker frontend in `public/`; use the Worker deployment for that output because it depends on authenticated API routes.
