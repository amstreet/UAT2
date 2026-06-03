# CLAUDE.md

Project context and conventions for Claude Code sessions working on this repo.
Read this first.

## 1. What this is

A marketing site + lead-capture contact form for **Timothy B. Ehrlich, MD** —
a private wellness practice offering hair loss restoration (transplant
surgery), weight management (GLP-1), and testosterone replacement therapy.
Hosted on **Firebase Hosting** in the project `timothyehrlichmd`, with a
Cloud Function (`submitLead`) that writes contact submissions to Firestore
and notifies Dr. Ehrlich via Resend.

**Important scope note:** the form is **contact-information only** (name,
phone, email, service interest). It does **not** collect PHI — that was an
explicit scoping decision. See [§10 HIPAA / scope rationale](#10-hipaa--scope-rationale).

The site is currently in a "coming soon" placeholder state while content is
still being refined. See [§8 Current state](#8-current-state).

## 2. Working directives (do not skip)

- **Commit directly to `main`.** The user explicitly set this policy. Do not
  create feature branches unless asked.
- **Push to `origin/main` after each meaningful change.** The deploy workflow
  is manual-only (workflow_dispatch), so pushes do not trigger deploys — they
  just publish to GitHub.
- **The user triggers deploys manually** by clicking "Run workflow" on
  *Deploy to Firebase (manual)* in GitHub Actions. The workflow deploys
  **hosting + functions + firestore** in one shot.
- **Never paste secrets or service-account JSON into this sandbox.** The
  Firebase service-account key lives in the repo's GitHub Secrets
  (`FIREBASE_SERVICE_ACCOUNT_TIMOTHYEHRLICHMD`). The Resend API key lives in
  Firebase Secret Manager (set via `firebase functions:secrets:set
  RESEND_API_KEY` on the user's Mac — never in the repo).
- **The user works from a Mac** that has Claude Code + Desktop Commander.
  This sandbox does *not* have Desktop Commander, browser access, or
  filesystem access to the Mac. Do not pretend to ssh, drive a browser, or
  reach the user's local machine.

## 3. Repo layout

```
.
├── index.html                # PUBLIC home — currently the "coming soon" placeholder
├── home.html                 # REAL home page — renamed from index.html while
│                             # in WIP mode. Preview at *.web.app/home.
├── script.js                 # Homepage hydration + contact-form submit handler
├── styles.css                # Single global stylesheet (CSS variables in :root)
├── site-data.json            # Source of truth for all editable site copy
├── firebase.json             # Hosting + Firestore + Functions config
├── .firebaserc               # Pinned to project "timothyehrlichmd"
├── firestore.rules           # Lock down ALL Firestore access from web clients
├── firestore.indexes.json    # (empty for now)
├── functions/
│   ├── package.json          # Node 20, firebase-functions ^6, resend ^4
│   ├── index.js              # submitLead HTTP function
│   └── .gitignore            # node_modules etc.
├── .github/workflows/
│   └── firebase-hosting-deploy.yml   # Manual-trigger deploy (hosting+fns+firestore)
├── logo-blue.png             # Brand logo on light backgrounds (navbar, header)
├── logo-white.png            # Inverted logo for dark backgrounds (footer)
├── dr-ehrlich.jpg            # About-section photo (4:5 portrait)
├── TE FINAL LOGOS*.{pdf,jpeg,jpg}    # SOURCE artwork — not deployed (ignored)
└── *.docx                    # SOURCE reference (intake questionnaires, consents,
                              # patient education) — not deployed. Kept in the
                              # repo as reference material for Dr. Ehrlich.
```

`.docx`, `.pdf`, and `TE FINAL LOGOS*` files are reference material from the
doctor; they are excluded from the deploy via `firebase.json` → `ignore`.
The `functions/` directory is also excluded from Hosting; it's deployed
separately as Cloud Functions.

## 4. Local development

The site is plain static HTML/CSS/JS. To preview locally on the user's Mac:

```sh
python3 -m http.server 8765
# then visit http://127.0.0.1:8765/
```

`file://` previews fall back to the hardcoded defaults baked into the HTML
because `fetch('site-data.json')` won't work over `file://`. Always test via
HTTP.

**Note:** the contact-form submit (`POST /api/submitLead`) requires the
Cloud Function to be deployed and reachable. It will not work from
`python3 -m http.server` unless you also run the Firebase emulators
(`firebase emulators:start --only functions,hosting`).

## 5. Deploy flow

```
[edit files locally / via Claude Code]
    ↓
[commit + push to main]
    ↓
[user clicks "Run workflow" in GitHub Actions]
    ↓
[GitHub Actions runner installs functions deps,
 then runs: firebase deploy --only hosting,functions,firestore]
    ↓
[live at https://timothyehrlichmd.web.app/ and the custom domain
 once DNS propagates]
```

**To deploy:** GitHub → Actions → "Deploy to Firebase (manual)" → "Run
workflow" → pick `main` → Run. Takes ~2-3 min.

**Workflow gotchas to keep in place** (see [§11 Gotchas](#11-known-gotchas)
for context):
- Do not add `repoToken: ${{ secrets.GITHUB_TOKEN }}` to a Firebase action
  step; it caused git auth failures previously because of restrictive
  `contents: read` permissions.
- `fetch-depth: 0` on the checkout step is required so the firebase CLI can
  read commit history locally without trying to fetch from origin.

## 6. Brand & design

Defined as CSS variables in `styles.css` `:root`. Stick to these.

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#1F5F94` | Deep medical blue — buttons, headings, dark sections |
| `--color-primary-light` | `#2E78B3` | Hover, lighter variant |
| `--color-primary-dark` | `#0F3F66` | Footer bg, shadows |
| `--color-accent` | `#5B8EA5` | Slate teal-blue — section labels, accents |
| `--color-accent-subtle` | `#EAF2F6` | Very light blue tint |
| `--color-bg` | `#F7FAFC` | Body background |
| `--color-bg-alt` | `#EDF2F7` | Alternating section background |
| `--color-text` | `#1A2430` | Primary text |
| `--color-text-secondary` | `#4A5765` | Body text |
| `--color-text-muted` | `#8596A3` | Hints / metadata |

**Fonts** (loaded from Google Fonts at the top of each HTML page):
- Headings: **Cormorant Garamond** (serif, weight 500)
- Body / UI: **Outfit** (sans-serif, weight 300-700)

**Logo files:**
- `logo-blue.png` — full color, for light backgrounds (used in navbar)
- `logo-white.png` — knockout, for dark backgrounds (used in footer)
  Both were generated from `TE FINAL LOGOS_hr.jpg` (the high-res source).

**Photo of Dr. Ehrlich:**
- `dr-ehrlich.jpg`, used in the About section
- 4:5 portrait on desktop, 1:1 on mobile (CSS handles the crop)
- Mobile uses `object-position: center 20%` to avoid cropping his forehead.

## 7. Content management

`site-data.json` is the **single source of truth** for all editable copy on
the homepage. The HTML elements that get hydrated carry one of:

- `data-content="path.to.value"` — sets `textContent` (or an attribute via
  `data-content-attr="placeholder|alt|content"`)
- `data-content-list="path.to.array"` — replaces `<li>` children of a `<ul>`
  with one `<li>` per array item

`script.js` does the hydration on page load. Defaults are also baked into the
HTML so the page still renders if `site-data.json` is unavailable.

**Content is edited directly in `site-data.json` via Claude Code**, then
committed and deployed. (There used to be an `/admin.html` browser-based
editor; it was removed because exposing a content-editing page on the open
internet was an unnecessary risk. Edit the JSON in the repo instead.)

**If you change the schema** (add/remove/rename a field in `site-data.json`):
1. Update bindings in `home.html` (or wherever rendered)
2. Re-verify with a quick `grep` that no binding references a non-existent
   path

## 8. Current state

- ✅ Site is live at `https://timothyehrlichmd.web.app/` and
  `https://timothyehrlichmd.firebaseapp.com/`
- ✅ Custom domain `timothyehrlichmd.com` registered and DNS pointed at
  Firebase. Once propagation completes it'll serve the site.
- ✅ Firebase project is on **Blaze** (required for Cloud Functions).
- ⏳ The public sees the **coming-soon placeholder** at `/`. The real site
  lives at `home.html` (preview at `*.web.app/home`). To go live, rename
  `home.html` back to `index.html` (overwriting the placeholder), commit,
  push, and trigger the manual deploy workflow.
- ⏳ **`submitLead` function expects two pieces of bootstrap** before it
  works end-to-end (see [§9 Setup](#9-firebase--external-accounts)):
  1. `timothyehrlichmd.com` verified in Resend with DNS records added in
     Cloudflare.
  2. `RESEND_API_KEY` secret set in Firebase Secret Manager via the user's
     Mac CLI.
- ⏳ Service-account IAM roles for the GitHub Actions deploys may need to be
  expanded — see [§11 Gotchas](#11-known-gotchas).

**To take the site live (when ready):**

```sh
git mv -f home.html index.html
git commit -m "Go live: replace placeholder with real homepage"
git push origin main
# then user clicks Run workflow
```

## 9. Firebase & external accounts

- **Firebase project ID:** `timothyehrlichmd` (on Blaze plan)
- **Firestore region:** `us-central1` (default — set in `functions/index.js`
  and `firebase.json` rewrite)
- **GitHub repo:** `amstreet/UAT2`. Repo secrets:
  - `FIREBASE_SERVICE_ACCOUNT_TIMOTHYEHRLICHMD` — service-account JSON used
    by the deploy workflow.
- **Firebase Function secrets** (managed by Google Secret Manager, set via
  CLI on the user's Mac — NOT in the repo):
  - `RESEND_API_KEY` — Resend API key. Set with
    `firebase functions:secrets:set RESEND_API_KEY` and paste when prompted.
- **Email delivery:** Resend.
  - From address: `Timothy Ehrlich, MD <contact@timothyehrlichmd.com>`
    (hardcoded in `functions/index.js`). Requires `timothyehrlichmd.com` to
    be verified as a sending domain in Resend.
  - Destination: `Tbehrlichmd@gmail.com` (hardcoded — Dr. Ehrlich's personal
    Gmail; fine because no PHI).
  - Reply-To is set to the patient's email so Dr. Ehrlich just clicks Reply.
- **Domain plan:** `timothyehrlichmd.com` for the website (already registered
  via Cloudflare Registrar). DNS in Cloudflare. Keep records as **DNS only**
  (gray cloud), not Proxied — Cloudflare's proxy interferes with Firebase TLS
  provisioning. The Workspace primary domain `tbehrlichmd.com` is separate
  and unrelated.

## 10. HIPAA / scope rationale

**The contact form does NOT collect PHI.** It collects only name, phone,
email, and which services the visitor is interested in. That last field
(interest in TRT / hair / weight) is technically a hint but is treated as an
inquiry, not a medical record. No symptoms, no contraindications, no medical
history.

Because no PHI is in scope:
- No BAA with Google is required for this site.
- Dr. Ehrlich's personal Gmail is a fine destination for the notification.
- Spark would have technically worked too, but Blaze was needed anyway for
  Cloud Functions (the v2 functions used here aren't available on Spark for
  new projects).

**If the scope ever changes** and the form starts collecting PHI:
1. The practice MUST sign a Google BAA before any patient submits.
2. Only HIPAA-eligible Google Cloud services may be used. Firestore and
   Cloud Functions ✓. Firebase Crashlytics and Firebase Analytics ✗.
3. The notification flow must NOT carry PHI in email. Use "you have a new
   submission, log in to review" only; PHI stays in Firestore.
4. The destination must change from a personal Gmail to a Workspace inbox
   covered by the BAA.

The intake-wizard code that originally collected medical history was
removed in the same commit that introduced the lead-only architecture. The
reference docs (`Testosterone Intake Questionnaire.docx`, etc.) remain in
the repo as source material — they are excluded from the deploy.

## 11. Known gotchas

- **`actions/checkout@v4` with depth 1 + FirebaseExtended action = git
  auth failures.** Always use `fetch-depth: 0`.
- **GitHub Actions service-account IAM**: the service account created by
  `firebase init` for hosting may not have permission to deploy Functions
  and Firestore rules. If the deploy fails with permission errors, the user
  needs to add these roles to the
  `github-action-<id>@timothyehrlichmd.iam.gserviceaccount.com` service
  account in GCP IAM:
  - `roles/cloudfunctions.developer`
  - `roles/iam.serviceAccountUser`
  - `roles/firebase.rules.admin` (or `roles/firebaserules.admin`)
  - `roles/cloudbuild.builds.editor` (Functions v2 uses Cloud Build)
  - `roles/artifactregistry.writer` (Functions v2 stores artifacts here)
  - `roles/serviceusage.serviceUsageConsumer`
  Or just `roles/firebase.admin` for breadth in a low-risk solo project.
- **Resend domain verification**: until `timothyehrlichmd.com` is verified
  in Resend (DNS records added in Cloudflare), the function will fail to
  send emails. The Firestore record still saves; check the
  `notificationError` field on a `leads` document to confirm.
- **Cloudflare orange-cloud proxy will break Firebase TLS issuance.** Keep
  DNS records as "DNS only" (gray cloud), not Proxied.
- **`fetch('site-data.json')` fails on `file://` previews.** Always test
  via HTTP (`python3 -m http.server`).
- **The Firebase Console "App Hosting" product is NOT what we use.** Use
  classic **Firebase Hosting** (the static-file CDN). App Hosting is for
  SSR frameworks and is wrong for this static site.
- **SPA-rewrite (`rewrites: ** -> /index.html`) is intentionally NOT
  enabled** in `firebase.json` because the site has multiple HTML pages
  (`index.html`, `home.html`). `cleanUrls: true` is enabled, so `/home`
  resolves without the `.html` extension. The only rewrite is
  `/api/submitLead` → the `submitLead` Cloud Function.
- **Mobile photo crop:** `.about-photo-img { object-position: center 20% }`
  inside `@media (max-width: 1024px)` keeps Dr. Ehrlich's forehead from
  being clipped. Don't touch unless verifying on a phone-width viewport.

## 12. Contact form architecture

`home.html` contains a single `<form id="contactForm">` with four fields:
**Name**, **Phone**, **Email**, and **Interests** (multi-select checkboxes
for hair/weight/hrt). A honeypot input named `website` is hidden via the
`.hp-field` CSS class — real users don't see it, bots fill it, and the
function silently drops those submissions.

**Submit flow:**

```
Patient fills form → script.js submit handler
    → POST /api/submitLead  (same-origin via firebase.json rewrite)
        → submitLead Cloud Function (Node 20, v2 HTTPS function)
            ↙                       ↘
        Firestore `leads`         Resend  → Dr. Ehrlich's Gmail
        (system of record)        (notification with Reply-To = patient)
    ← JSON { ok: true, leadId }
    → script.js swaps form for success state
```

The Cloud Function lives in `functions/index.js`. It:
1. Validates required fields (name, phone, email) and email format
2. Drops bot submissions where the honeypot field is filled
3. Writes a document to the `leads` collection with a server timestamp
4. Sends a notification email via Resend (Reply-To = patient's email so
   Dr. Ehrlich just clicks Reply)
5. If the email send fails, logs the error on the Firestore document
   (`notificationError`, `notificationErrorAt` fields) so a missed
   notification can be found and re-sent

**Firestore `leads` schema:**

```
{
  name: string,
  phone: string,
  email: string,
  interests: string[],         // any of ['hair', 'weight', 'hrt']
  userAgent: string,
  ip: string,
  createdAt: Timestamp,
  notificationError?: string,  // present only if Resend failed
  notificationErrorAt?: Timestamp
}
```

**Reading leads:** Dr. Ehrlich uses the **Firebase Console** for now (no
admin UI built). Firestore rules deny all client access — only the Admin
SDK (Cloud Functions) and IAM-authenticated Console can read.

## 13. Tracked decisions and history

A condensed history so future sessions don't repeat conversations:

- **Branding:** the doctor picked the **blue** logo variant (over the green).
  All colors in §6 are derived from that.
- **Hosting choice:** classic Firebase Hosting (not App Hosting), repo root
  as public dir, manual deploy via workflow_dispatch, no auto-deploy on push.
- **Domain choice:** `timothyehrlichmd.com` for the website (registered via
  Cloudflare Registrar), separate from `tbehrlichmd.com` which is reserved
  for Workspace.
- **Coming-soon mode:** in effect. Real site at `home.html`. To go live,
  rename back to `index.html`.
- **Deploy workflow fix:** removed `repoToken` and added `fetch-depth: 0`
  after a deploy failed with git auth errors. Do not undo this.
- **Scope decision:** form is contact-only, no PHI. The original multi-step
  intake wizard with medical-history collection (`intake.html`/`intake.js`)
  was deleted when this decision was made. Do not reintroduce PHI fields
  without first making the BAA / compliance decisions in §10.
- **Architecture decision:** server-side submit handling (Cloud Functions +
  Firestore + Resend) chosen over the simpler client-side approach for
  validation, abuse protection, schema control, and future flexibility.

## 14. Useful commands

```sh
# preview locally (on the Mac, in the repo dir)
python3 -m http.server 8765

# emulate functions locally too (covers the /api/submitLead path)
firebase emulators:start --only functions,hosting

# set the Resend API key in Firebase Secret Manager (one-time, on the Mac)
firebase functions:secrets:set RESEND_API_KEY

# normal change cycle
git add <files>
git commit -m "<message>"
git push origin main
# then: GitHub → Actions → "Deploy to Firebase (manual)" → Run workflow

# go live (swap placeholder for real homepage)
git mv -f home.html index.html
git commit -m "Go live"
git push origin main

# tail function logs (on the Mac)
firebase functions:log
```
