# A quick tour for Dr. Khaled

**Taqyeem — تقييم** is a proposed psychiatry residency workspace. The name means evaluation; `Ta2yeem` is another everyday Franco spelling. The product uses `Taqyeem` in its branding and technical names.

Open **Taqyeem-Demo.html** in a browser. It contains fictional records and needs no installation. The buttons at the top switch among Administrator, Doctor, and Student so you can see each person’s experience. Demo changes stay in that browser; **Reset** restores the sample.

## Three-minute walkthrough

1. **Administrator:** review the dashboard, completion ring, published ratings and program progress, open a resident, then open **Settings** for Doctors, Assessment categories, and Invitations. Reports has its own menu item. Your name appears as administrator.
2. **Doctor:** open an assigned resident’s evaluation. Choose a score for each category; expand Private notes when needed. Save a draft, then publish a complete evaluation. The app explains which result is released.
3. **Student:** see the single overall rating and submit a fictional file number. There are no category scores, private notes, peer records, or administrative pages in this view.
4. Select **العربية** to switch the interface to Arabic and a right-to-left layout; select English to return.

The supplied sample programs are Adult Psychiatry, Child & Adolescent Psychiatry, and Addiction Psychiatry. All supervisors and residents are part of psychiatry. The categories are editable teaching examples for the faculty to approve.

## Decisions to review

- Is one primary supervising psychiatrist per resident the right starting arrangement?
- Should an assessment be published monthly?
- Are the ten proposed categories appropriate, and should different training years use different wording?
- Should a supervisor publish directly, as the current version allows, or should another person approve first?

The current overall rating is the equal-weight mean of all category scores, shown to one decimal place. A draft does not change the student’s score. Correcting a published assessment preserves the earlier version.

## What the deployable application adds

The source package includes actual sign-in, a SQL database, server-enforced permissions, single-use invitations, private notes, versioned assessments, and deployment scripts. Its first run has no fictional accounts. The operator configures your real email and activates the administrator account before inviting colleagues.

For the technical handover, start with `README.md` and `docs/DEPLOYMENT.md`. The six-page `docs/Taqyeem-Database-and-Workflows.drawio` opens in diagrams.net / draw.io. `docs/VERIFICATION.md` records what has been tested.
