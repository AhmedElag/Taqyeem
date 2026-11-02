# Taqyeem workflows

These workflows describe the live psychiatry-residency application. The visible demo role selector is an exploration tool; it is not used to establish permissions in live mode. Dr. Khaled Abdelazim is the sole initial administrator.

The accompanying editable diagrams are in `Taqyeem-Database-and-Workflows.drawio`. Open that file in diagrams.net / draw.io to edit the nodes, wording, relationships, and page layouts.

## 1. Prepare the department and activate the administrator

1. The deployment operator configures the real application origin, database binding, administrator email, bootstrap secret, session secret, and mail sender settings.
2. The operator applies all ordered schema migrations and initializes the psychiatry training tracks and editable question templates. Production does not load the fictional demo people or assessments.
3. The operator invokes the authenticated bootstrap operation. The database accepts the first operation only, creates a pending administrator named **Dr. Khaled Abdelazim / د. خالد عبد العظيم**, and returns a single-use activation link.
4. Dr. Khaled opens that link and confirms acceptance. The server verifies its hash, expiry, account status, and unused state; it activates his account and creates a session atomically.
5. He can now invite supervising psychiatrists and register residents. A repeated bootstrap request does not create a second administrator or reset ownership.

**Failure path:** missing deployment settings prevent bootstrap; an expired or revoked activation link cannot authenticate. Before the owner's first activation, the operator can run `npm run bootstrap:recover` using the configured bootstrap secret. The protected `/api/auth/recover-owner` operation verifies the configured owner email and pending state, revokes the earlier link, and returns a new seven-day activation invitation. It never resets an active owner, creates another administrator, or permits repeating bootstrap. Remove the setup secret after verifying activation and a fresh emailed login, as described in the deployment guide.

## 2. Invite a supervising psychiatrist

| Step | Who acts | What happens |
| --- | --- | --- |
| Create invitation | Administrator | Enter the psychiatrist's English/Arabic name, email, and permitted training track. |
| Register pending account | Server | Validate uniqueness and administrator permission; create the pending doctor, program membership, invitation verifier, and audit event. |
| Share the link | Administrator | Copy the once-returned invitation link and send it through the hospital's chosen channel. Creating an invitation does not itself mean an email was sent. |
| Inspect invitation | Invited psychiatrist | Open the link. The frontend removes its token from the address bar and displays the role/program being accepted. |
| Accept | Invited psychiatrist + server | Explicitly confirm. The server activates the account and consumes the invitation in one transaction, then issues a session. |
| Assign residents | Administrator | Connect residents to that active psychiatrist, within the psychiatrist's permitted training track. |

The doctor cannot select an administrator role during acceptance. An empty newly accepted doctor workspace is expected until residents are assigned. The invitation's account and permissions come from the server record, not editable URL fields.

**Reissue:** invalidate the previous token and create a new seven-day link. The list of invitations contains status and expiry, not reusable plaintext tokens. After a page reload the administrator reissues a link if it must be shared again.

**Revoke:** record revocation without deleting history. Both an unused old link and a previously redeemed link are rejected.

## 3. Register a resident

1. The administrator enters the resident's name, email, current psychiatry training track, training year, primary supervising psychiatrist, and a review interval from 1 to 52 weeks.
2. The server validates that the email is unique and the supervisor is active and eligible for that track.
3. The account, enrollment, assignment, and invitation are created atomically. The resident can be registered while their access invitation is still pending.
4. The administrator shares the invitation. On acceptance, the resident receives only the student role.
5. The resident's first view contains their own file-number form and either a published overall score or a clear “not rated yet” state.

The endpoint obtains the account role from the administrator's authorized action. There is no public self-registration form that lets someone become a psychiatrist or administrator.

## 4. Sign in, expire a session, and sign out

1. A registered active user enters their email address and requests a sign-in link.
2. The server applies rate limits, gives the same generic response for registered and unregistered addresses, and sends a usable link only for an eligible active account.
3. The email link expires after 15 minutes. Opening it does not consume it automatically; the page asks the user to sign in explicitly.
4. The server atomically verifies/consumes the token and creates a fresh session. The browser receives a protected cookie, then loads the server-approved role and workspace.
5. The server ends the session after 30 minutes without activity or eight hours in total. A request using a revoked or expired session is refused and the interface returns to sign-in.
6. Signing out revokes the current session and clears the cookie. Deactivating the account revokes all its sessions and outstanding access links.

The live role does not come from localStorage or a role switch. Language preference may persist locally; credentials and department records do not. A non-sensitive lock flag may persist in sessionStorage so reload cannot reveal a screen that was locked during an offline interruption.

## 5. Record work using a file number

1. The resident enters a file reference and the date they worked on it.
2. The server determines the resident identity from the signed-in session. It does not accept a different resident selected in the request.
3. The server trims the reference, normalizes Arabic/Persian digits and letter case, checks the allowed format and length, and validates the work date.
4. A repeated normalized number for the same resident returns a conflict. The interface retains the form and explains that the number is already recorded.
5. A new valid reference is stored with submission attribution. The resident sees a submission confirmation and the item in their own log.
6. The current assigned psychiatrist and the administrator can see it. Either can mark it reviewed; the review records the reviewer and time.

**Scope:** the form takes the file number only. It does not ask for a patient name, diagnosis, clinical narrative, or a copy of the medical file. The same reference may legitimately be recorded by two different residents; uniqueness is within a resident's own log.

**Review meaning:** “reviewed” means the supervisor has acknowledged the reference in this training workflow. It does not certify a clinical outcome or modify the hospital's medical record.

## 6. Create and save an assessment draft

1. The supervising psychiatrist opens a current assigned resident. An administrator may open any resident.
2. The application selects the monthly period and the applicable version of the psychiatry rubric. The current training track and year are part of the assessment context.
3. The psychiatrist chooses an integer from 1 to 10 for each category and may write educational feedback about the resident.
4. **Save draft** may leave some scores empty. The request includes the loaded draft's `expectedVersion`, the resident's `expectedResidentVersion`, and the observed `basePublishedId`. The resident version is captured when the form is opened, not silently refreshed immediately before saving.
5. The server checks the current assignment and context, validates the values, and saves the draft with a new revision number.
6. A draft remains in the staff workspace. It does not change the number returned by the student API.

**Conflict path:** if another session saved a newer draft, changed the resident's profile, program, training year or supervisor, or changed a relevant publication while this editor was working, the request returns 409. The same check runs again inside the transactional write. The rejected request preserves the earlier draft and published result. Reload and review the current state before saving again; a form opened for Year 2 must not silently publish under Year 3.

## 7. Publish a rating

1. The psychiatrist completes every category in the selected template.
2. The confirmation screen shows the computed overall score and explains that the student sees only that number.
3. The server rechecks session, role, current assignment, the template/context, every required 1–10 score, the draft version, the captured resident version, and the previous publication ID.
4. The server calculates the equal-weight mean. A value supplied by the browser is not trusted as the overall result.
5. In one transactional operation, the application records the publication and scores/notes, moves the current publication reference to the new row, consumes the relevant draft, and appends an audit event. The earlier publication remains immutable and is no longer the current reference.
6. Only after the database confirms success does the interface display a saved/published message and reload the authoritative workspace.
7. The resident's next workspace read returns the overall score for their latest published month. Category details and private notes are not included in that response.

**Incomplete publication:** reject the request and keep the previous score visible. No partially written publication or average of only the completed fields is released.

**Concurrent publication:** reject the stale writer with 409 and roll back the attempted change. At most one publication remains authoritative for the resident and month.

## 8. Correct a published assessment

The current assigned psychiatrist or administrator starts a new assessment revision for the same period. The application uses the previous publication ID as an explicit base, rather than editing the published row in place.

The revised assessment follows the same full validation and publication process. On success, the new publication becomes current and the earlier one remains in history with its original author, program/year context, rubric, scores, notes, and timestamp. The visible student score changes to the new authoritative result for that period if it is still their latest published month.

A later resident program change does not relabel a historical assessment. A correction involving a changed assessment context must be reviewed explicitly rather than silently inheriting incompatible old scores.

## 9. Change questions without changing history

1. The administrator selects a psychiatry training track and edits the English and Arabic labels.
2. The server requires between one and twenty questions, nonempty labels in both languages, unique question identities, and distinct labels within each language.
3. The save request contains the template version the administrator edited. A stale version returns 409.
4. A successful save creates a new immutable template revision and makes it available for future assessments.
5. Earlier published evaluations retain the question version they actually used. An old-version draft must be reviewed against the current rubric: preserve scores only for matching stable question IDs, score any newly added questions, and save with the current template ID. Stale-template saves and publications return 409; old question wording is never silently rewritten in a published assessment.

Faculty own the rubric and scoring anchors. The application supplies structured recording and arithmetic, not an automated judgment about a resident's promotion or clinical privileges.

## 10. Reassign a resident or deactivate an account

### Reassign a resident

The administrator chooses an active psychiatrist permitted for the resident's program. The existing assignment ends and the new one becomes current, preserving assignment history. On subsequent API requests, the previous psychiatrist no longer receives that resident through the current-assignment workspace. Historical assessment attribution remains intact for the administrator and authorized current workflow.

### Deactivate a resident

Mark the resident account inactive and revoke sessions, login links, and invitations. Preserve enrollment, files, drafts, and published history. The inactive account cannot sign in or make another file submission. A later reactivation requires a valid active supervisor and permitted program relationship. Reactivation returns the account to pending and issues a fresh seven-day invitation; access restoration never reuses a revoked link.

### Deactivate a supervising psychiatrist

First reassign residents whose accounts have not been deactivated, including residents still awaiting invitation acceptance. The server rejects doctor deactivation, an email change, or removal of required program access while it would strand one of those assigned residents. Then deactivate the account and revoke its sessions and outstanding access tokens. Keep the psychiatrist's authorship on earlier assessments. Reactivating the doctor returns the account to pending and issues a fresh seven-day invitation.

### Change an email address

An administrator may correct the address, but this is an access change. Revoke sessions and outstanding links, return the account to the pending state, and require a fresh invitation to the new address. Do not silently transfer an already authenticated session to a new identity.

The sole initial administrator is not a valid target for ordinary doctor/resident deactivation endpoints. There is no public endpoint to grant an administrator role.

## 11. Generate a program report

1. The administrator chooses the training track, resident (or all), month, and interface language.
2. The server applies the same filters to the authorized report data, using the published assessment's saved program/year context for historical records.
3. The report includes the current published rating, category scores, and the period's file-reference count. A missing published result is shown as not evaluated, not zero.
4. Drafts and educational note text are excluded from the ordinary export. Student and doctor accounts cannot use the administrator report endpoint.
5. CSV output is UTF-8 with Arabic support, quoted cells, and protection against spreadsheet formula interpretation. It contains one row per scored category, repeating the assessment-level metadata on each row. Group by assessment ID before summing resident-level results or file counts. The printable report follows the selected filters.

An earlier correction remains in the database history but does not count twice in the report. Each evaluated resident contributes once to the selected period's overall summary.

## 12. Failures that must have a clear user outcome

| Situation | Application outcome |
| --- | --- |
| Session expired or account deactivated | Stop the request; return to sign-in. Do not show a success toast. |
| Doctor guesses an unassigned resident/file ID | Deny the read or mutation on the server. |
| Student requests evaluation details or reports | Deny access or return the narrow student projection. |
| Duplicate file reference | Explain the duplicate; preserve the original row. |
| Invalid or incomplete scores | Keep the draft/current publication unchanged; identify the missing requirement. |
| Another editor changed the record | Return 409; reload and reconcile. |
| Invitation/login token expired, revoked, or used | Reject it; request a new appropriate link. |
| Network/database write failed | Keep unsaved input where practical and report that the save did not complete. |
| Email delivery unavailable | Do not expose another user's account status or pretend an invitation was automatically emailed. Follow the configured operational recovery procedure. |
| Report contains no publication for the filters | Show an empty/not-evaluated state; do not fabricate a score. |

## 13. Acceptance scenarios

These scenarios define expected behavior. The current automated test output and final handoff state establish which have been verified; this list alone is not a passing test report.

1. Activate the sole administrator, then prove that bootstrap cannot be repeated.
2. Invite a psychiatrist and resident; prove that expired/revoked/used invitation tokens fail.
3. Log in with a single-use email link; prove replay is rejected and sign-out revokes the session.
4. Submit a file as the resident and verify it appears for the assigned psychiatrist, with a duplicate rejected.
5. Save an incomplete assessment draft and verify the student's previous published score remains unchanged.
6. Publish a valid ten-category assessment and verify the server-calculated score appears without private details in the student JSON.
7. Attempt to publish with missing/out-of-range scores and verify a complete rollback.
8. Publish from two stale editors and verify the second cannot overwrite the first unnoticed. Change the resident's training year while a draft is open and verify that the old form returns 409 without altering the saved draft; a reviewed form with the refreshed resident version can then publish.
9. Revise the rubric and resident program; verify past publications retain their original labels/context.
10. Deactivate an account and verify its existing session stops working immediately.
11. Try foreign-origin, missing-CSRF, unauthorized-role, and guessed-record requests and verify denial.
12. Export one resident's report and verify filters, Arabic text, current-publication selection, and exclusion of notes.

## 14. Review reminders every 1–52 weeks

The administrator sets each resident’s **Review every** value to an integer number of weeks, with 4 weeks as the default. A resident without a published evaluation is due from their joining date. Otherwise the next date is the date of the latest publication in the hospital time zone plus `7 × interval` calendar days.

A due date sends the resident back to the faculty review queue. Draft saves, quick observations, referral requests, and reviewer responses do not move it. A new publication resets the next date. These are in-application reminders; no email or external message is sent by this setting.

Monthly reporting remains monthly. A resident reviewed twice within one month has immutable publication history and one current monthly head, so the report does not double-count them. Changing the interval recomputes the next date against the existing publication rather than pretending a new evaluation occurred.

## 15. Quick observations and one private teaching goal

An assigned doctor or the administrator opens a resident’s staff view, writes a brief observation in the current interface language, and saves it. The record retains author and time. It contains educational feedback about the resident, not patient narrative. Staff can also create one open teaching goal. Marking it reviewed retains its history and allows a new goal.

Students receive none of these records. A doctor receives them only for currently assigned residents. An assessment referral does not share these separate observations/goals with a new reviewer.

## 16. Correct a file reference

The student selects **Correct number** on their own file entry, enters the corrected identifier, and saves it with the version they opened. The server repeats normalization, format, ownership, duplicate, and version checks. A successful correction increments the version and retains the old/new values in faculty history. If the entry was acknowledged, it returns to **Needs review**. The assigned doctor or administrator must acknowledge the corrected version; a stale screen cannot acknowledge the old one by mistake.

## 17. Send an assessment for review

1. The author saves the draft and chooses another active doctor or the administrator.
2. The server freezes the draft’s scores, questions, private assessment notes, resident context, and version. The new recipient can inspect only that assessment snapshot; they gain no general access to the resident’s files, other evaluations, observations, or goals.
3. The selected reviewer opens the request and either approves the complete assessment or requests changes with a comment. Their response does not publish a rating.
4. The author sees the decision. Pending and changes-requested assessments stay unpublished. The author may revise and send again, or explicitly cancel the request.
5. An approval applies to exactly that draft version and content. Editing supersedes the old snapshot and retains the requirement for fresh approval or explicit cancellation. Changing the resident’s program/year/assignment, template, or publication head also invalidates the old context.
6. The author publishes the approved unchanged assessment. Only then does the student’s overall score change and the review reminder date reset.

The administrator can inspect referrals and cancel the requirement when appropriate. Only the selected reviewer can submit the review decision. Referral actions appear in the application; they do not claim an email was delivered.

## 18. Lock the screen

The lock control hides the private interface, attempts to save an open draft, and revokes the live server session through the existing logout endpoint. The user must request a new email sign-in link before reopening department records. The interface also locks after 15 minutes of inactivity. If offline revocation fails, the interface stays locked and retries revocation when connectivity returns; the UI does not claim that a failed server request succeeded. Saved drafts remain in the database and can be reopened after authentication.

The fictional demo explicitly offers **Unlock demo**. Its role selector and local storage are demonstration conveniences, not access protection.

## Supporting references

- [Cloudflare D1 transactional batch behavior](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP Cross-Site Request Forgery Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Cloudflare D1 Time Travel and recovery](https://developers.cloudflare.com/d1/reference/time-travel/)

Recovery, backup retention, institutional hosting approval, and the hospital's sign-in policy must be configured and rehearsed for the actual deployment. These workflow documents do not assert a regulatory certification.
