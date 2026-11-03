# Deploy this exact project to Vercel

This package keeps your uploaded source and adds the static-demo deployment configuration. No backend is connected.

## Upload with GitHub web

1. Extract Taqyeem-main.zip.
2. Open the extracted Taqyeem-main folder. Copy its CONTENTS into the repository root. The files package.json and vercel.json must sit directly in the repository root; docs must be directly underneath it.
3. You may also add only these three new files to your existing repository: vercel.json, docs/index.html, and docs/Taqyeem-Admin-Demo.html. All other supplied files are unchanged.
4. Commit the files.

## Vercel project settings

- Root Directory: leave blank (repository root).
- Framework Preset: Other.
- Build Command: empty.
- Install Command: empty.
- Output Directory: docs.

The root vercel.json explicitly sets the static configuration. It skips the old Cloudflare/live build script and publishes the ready-made docs HTML files.

Deploy the latest commit. For an existing project, open Deployments, select the latest commit, choose Redeploy and disable the existing build cache. Wait for Ready and open the production domain.

## Page paths

- / or /index.html: Admin
- /Taqyeem-Admin-Demo.html: Admin
- /Taqyeem-Doctor-Demo.html: Doctor / Supervisor
- /Taqyeem-Student-Demo.html: Student
- /Taqyeem-Demo.html: existing Admin filename retained

Do not add /docs to the public URLs: Vercel publishes the contents of that directory at the website root.

The three pages share fictional demo data in the same browser when served under the same origin. Different devices and browser profiles do not synchronize without a backend.

Each role HTML is self-contained. No dependency installation or application build is required for this deployment.
