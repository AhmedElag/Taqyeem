# Taqyeem operations and handover

The hospital’s operator owns deployment accounts, email configuration, backups, and incident response. Dr. Khaled manages educational users through the application. Technical operator access is broader than application administrator access and should be restricted accordingly.

## Accounts and access

- Use an individually controlled email for every person. The administrator assigns the role; the sign-in screen cannot promote a user.
- Psychiatrists must accept their invitation before residents are assigned to them. Each resident has one active primary supervisor in the relevant track.
- Reassign active/pending residents before deactivating their psychiatrist or removing that psychiatrist from the track. The API rejects changes that strand those assignments.
- Deactivation retains assessments while revoking sessions, login links, and pending invitations. Reactivation or an email change requires a fresh invitation.
- The sole administrator cannot be deactivated/deleted by ordinary management routes. Institutional ownership transfer requires a controlled operator procedure, not a second administrator created through the UI.
- Invitation links expire in seven days and are returned only on creation/reissue. Reissuing invalidates the older link. Handle them as credentials.

Lost or expired initial-owner invitations can be renewed with `npm run bootstrap:recover` and the configured bootstrap secret, only while that owner is pending. Once active, this route cannot reset the owner. Remove the bootstrap secret after verifying activation and a fresh emailed login. An inaccessible or compromised active-owner mailbox needs institutional operator support; the release does not offer account takeover through a public recovery form.

The current release does not provide hospital SSO, MFA enrollment, multiple administrators, or a self-service owner-transfer interface.

## Assessment and rubric changes

Faculty should approve the psychiatry rubric and scoring anchors before formal use. The starter 1–10 scale and equal weighting are local choices, not a validated conversion from another framework.

Question edits create new versions. A published assessment retains its original labels, scores, track, year, evaluator, and result. A correction creates a new publication and updates the current pointer; it does not edit the previous result in place.

Conflicting updates return HTTP 409. Review the latest saved state before retrying. Do not loop publication requests with guessed revision numbers. The UI retains unsaved editor content and offers an explicit reload.

## Backup and restore

Agree a retention policy for educational records, file references, feedback, and audit events. The release preserves history and has no automatic permanent-deletion policy. Deactivation is not data erasure.

Before a schema migration or significant maintenance:

1. Confirm the intended Worker and database.
2. Schedule maintenance if export/migration can interrupt use.
3. Export the database and record source revision and migration level.
4. Encrypt the export and store it in the institution’s controlled backup destination, separate from source code.
5. Rehearse restoration into a separate disposable database. Check row counts, publication history, and role isolation; do not rehearse by overwriting production.

After creating a private `backups` directory:

```sh
npx wrangler d1 export DB --remote --output=backups/taqyeem-before-release.sql
```

Exports contain private notes and hashed access verifiers. Do not upload them to the demo, attach them to support tickets, or commit them. The supplied ignore file excludes backups and SQLite files; it cannot replace access controls.

D1 also provides Time Travel recovery. Retention depends on the plan, and restore changes the target database. Confirm the current [Time Travel policy](https://developers.cloudflare.com/d1/reference/time-travel/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) before making a recovery commitment. [Import/export documentation](https://developers.cloudflare.com/d1/best-practices/import-export-data/) explains command behavior and availability during exports.

After a restore, revoke existing sessions and unconsumed login/invitation links through a controlled maintenance operation. Restoring an earlier database can otherwise restore earlier access state. Reissue only invitations that are still intended. The institution must rehearse and approve this recovery operation; the package does not claim a production restore has been performed.

## Releasing an update

Use separate staging infrastructure and synthetic records. Never use production with `DEVELOPMENT=true`.

1. Review source changes, migrations, and API compatibility.
2. Run `npm ci` and `npm run deploy:check`.
3. Migrate staging and exercise onboarding, all roles, corrections, and CSV export.
4. Export production and document its recovery point.
5. Run `npm run db:migrate:remote` for the approved migration.
6. Run `npm run deploy` for the matching Worker.
7. Verify health, email delivery, limited student response, and a controlled staff workflow.

Keep prior source revisions. Rolling back code does not roll back a database migration. Prefer backward-compatible changes; destructive changes require a separate recovery plan. Do not edit a migration already applied to a database.

## Secrets and email

Production secrets belong in Cloudflare’s secret store and the institution’s recovery vault. Never include `.dev.vars` in an archive or Git. Use different secrets for local and production environments.

Removing `BOOTSTRAP_TOKEN` disables the setup credential. `SESSION_SECRET` protects derived CSRF and rate-limit identifiers; rotating it alone does not revoke server-side sessions. Revoke sessions and access tokens explicitly during incident response.

Sign-in requests return a generic message for unknown/inactive accounts, so anonymous visitors cannot use the response as an account directory. This is not a delivery receipt. Check sender verification, provider key scope, provider delivery logs, and spam filtering if an active user receives no email. Do not paste login links or keys into diagnostic channels.

## Maintenance and growth

This release serves one department. The workspace API returns the role-authorized dataset for dashboards and reports. Introduce pagination and bounded period queries before scaling to a large hospital dataset; the initial dashboard is not an unlimited analytics warehouse.

Expired sessions, login tokens, and rate-limit counters can be pruned by an institutionally reviewed maintenance job. Historical evaluations, templates, assignments, file references, and audit events require a retention decision. The release does not register a scheduled cleanup job or silently delete these records.

Monitor API failures, request volume, D1 limits/storage, and email delivery using provider controls. The app avoids logging scores, notes, tokens, and email bodies. Review extra logging before enabling it. D1 query limits differ by plan; verify capacity against the expected department size and traffic.

## Common problems

| Symptom | Check |
| --- | --- |
| Configuration required | Exact origin, uploaded session secret, valid time zone, database migration |
| Origin rejected / 403 | Browser address matches canonical origin; no alternate proxy hostname |
| CSRF rejected | Refresh session; verify same-origin cookies and CSRF header reach the Worker |
| Email missing | Active account, verified sender, provider key/logs, spam folder |
| Invitation expired/used | Administrator reissues it; original stays invalid |
| Owner still pending, link lost | Operator runs `bootstrap:recover` before removing setup secret |
| No eligible supervisor | Invite and activate a psychiatrist in that track first |
| Cannot deactivate psychiatrist | Reassign affected active/pending residents first |
| Publication conflict | Draft, publication, template, or enrollment changed; review current state |
| Student has no score | No published assessment yet; drafts never become student results |
| Demo works, live fails | Test the actual Worker, database, origin, and mail setup |

## Decisions before real use

Confirm that one supervisor and one monthly published assessment fit the department; whether different years need distinct question sets; who may correct publications; and whether a separate approval stage is needed. V2 supports track-specific templates and preserves training year, but does not automatically select a different rubric by year.

The institution should approve export access, record retention, permitted file references, email recovery, hosting terms/location, and any SSO/MFA requirement. These deployment decisions remain explicit rather than being implied by the existence of working code.
