# A quick tour for Dr. Khaled

**Taqyeem — تقييم** is a proposed psychiatry residency workspace. The name means evaluation; `Ta2yeem` is another everyday Franco spelling. The product uses `Taqyeem` in its branding and technical names.

Open **Taqyeem-Demo.html** in a browser. It contains fictional records and needs no installation. The buttons at the top switch among Administrator, Doctor, and Student so you can see each person’s experience. Demo changes stay in that browser; **Reset** restores the sample.

## Three-minute walkthrough

1. **Administrator:** review the dashboard, completion ring, published ratings and program progress, open a resident, then open **Settings** for Doctors, Assessment categories, and Invitations. Reports has its own menu item. Your name appears as administrator.
2. **Doctor:** open an assigned resident’s evaluation. Choose a score for each category; expand Private notes when needed. Save a draft, then publish a complete evaluation or send it to another doctor or the administrator for review. The selected reviewer returns approval or requested changes; the author publishes the final score.
3. **Student:** see the single overall rating, submit a fictional file number, or correct a mistyped number in your own log. A corrected number returns for acknowledgment if it was already reviewed. There are no category scores, private notes, peer records, or administrative pages in this view.
4. **Teaching:** add a quick observation or one private teaching goal from the resident’s staff view. Mark the goal reviewed before recording the next one. These notes and goals stay with authorized faculty.
5. **Review schedule:** edit a resident as administrator and choose **Review every**, from **1 week** through **52 weeks**. The resident returns to the due-review queue after that interval from the last published rating.
6. **Lock:** try the lock control. The demo explicitly offers **Unlock demo**; the real deployment requires a new sign-in.
7. Select **العربية** to switch the interface to Arabic and a right-to-left layout; select English to return.

The supplied sample programs are Adult Psychiatry, Child & Adolescent Psychiatry, and Addiction Psychiatry. All supervisors and residents are part of psychiatry. The categories are editable teaching examples for the faculty to approve.

## Decisions to review

- Is one primary supervising psychiatrist per resident the right starting arrangement?
- Should an assessment be published monthly?
- Are the ten proposed categories appropriate, and should different training years use different wording?
- Should a supervisor publish directly, as the current version allows, or should another person approve first?

Weekly reminders and monthly reporting are separate: a resident can become due again within a month, and a later published review replaces that month’s visible rating while preserving earlier revisions. Sending a review request or approving it does not publish a score or reset the reminder date.

The current overall rating is the equal-weight mean of all category scores, shown to one decimal place. A draft does not change the student’s score. Correcting a published assessment preserves the earlier version.

## What the deployable application adds

The source package includes actual sign-in, a SQL database, server-enforced permissions, single-use invitations, private notes, versioned assessments, and deployment scripts. Its first run has no fictional accounts. The operator configures your real email and activates the administrator account before inviting colleagues.

For the technical handover, start with `README.md` and `docs/DEPLOYMENT.md`. The six-page `docs/Taqyeem-Database-and-Workflows.drawio` opens in diagrams.net / draw.io. `docs/VERIFICATION.md` records what has been tested.

## Sharing the static demo through GitHub Pages

The complete source can remain in your repository. Run `npm run build:demo` from the project root to update both `artifacts/Taqyeem-Demo.html` and `docs/index.html`; the build also creates `docs/.nojekyll`. Commit and push, then configure GitHub Pages to publish the pushed branch’s `/docs` folder. The standalone demo has sample data and browser-local changes. It does not use the production database or send real invitations/reminders.
