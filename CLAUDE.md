# CLAUDE.md

Project context and conventions for Claude Code sessions working on this repo.
Read this first.

## 1. What this is

A marketing site + patient intake wizard for **Timothy B. Ehrlich, MD** — a
private wellness practice offering hair loss prevention/restoration, weight
management (GLP-1), and testosterone replacement therapy. Hosted on **Firebase
Hosting** in the project `timothyehrlichmd`, deployed from this GitHub repo
(`amstreet/UAT2`).

The site is currently in a "coming soon" placeholder state while content is
still being refined. See [§8 Current state](#8-current-state).

## 2. Working directives (do not skip)

- **Commit directly to `main`.** The user explicitly set this policy. Do not
  create feature branches unless asked.
- **Push to `origin/main` after each meaningful change.** The deploy workflow
  is manual-only (workflow_dispatch), so pushes do not trigger deploys — they
  just publish to GitHub.
- **The user triggers deploys manually** by clicking "Run workflow" on
  *Deploy to Firebase Hosting (manual)* in GitHub Actions. Do not try to
  reconfigure the workflow to auto-deploy on push without confirmation.
- **Never paste secrets or service-account JSON into this sandbox.** The
  Firebase service-account key already lives in the repo's GitHub Secrets
  (`FIREBASE_SERVICE_ACCOUNT_TIMOTHYEHRLICHMD`) and the CI uses it from there.
- **The user works from a Mac** that has Claude Code + Desktop Commander.
  This sandbox does *not* have Desktop Commander, browser access, or
  filesystem access to the Mac. Do not pretend to ssh, drive a browser, or
  reach the user's local machine.
- **No phone or email of Dr. Ehrlich should appear on the public site.** The
  user explicitly removed those placeholders.

## 3. Repo layout

```
.
├── index.html                # PUBLIC home — currently the "coming soon" placeholder
├── home.html                 # REAL home page — renamed from index.html while
│                             # in WIP mode. Preview at *.web.app/home.
├── admin.html                # Internal content editor — edits site-data.json,
│                             # downloads it for re-commit. Not linked from
│                             # the public site.
├── intake.html               # Multi-step intake wizard host page
├── intake.js                 # Wizard logic (state, routing, HRT form, review)
├── script.js                 # Homepage hydration from site-data.json + contact
│                             # form handoff to intake.html
├── styles.css                # Single global stylesheet (CSS variables in :root)
├── site-data.json            # Source of truth for all editable site copy
├── firebase.json             # Hosting config (serves repo root, cleanUrls,
│                             # ignores source artifacts and *.docx/*.pdf)
├── .firebaserc               # Pinned to project "timothyehrlichmd"
├── .github/workflows/
│   └── firebase-hosting-deploy.yml   # Manual-trigger deploy to live channel
├── logo-blue.png             # Brand logo on light backgrounds (navbar, header)
├── logo-white.png            # Inverted logo for dark backgrounds (footer)
├── dr-ehrlich.jpg            # About-section photo (4:5 portrait)
├── TE FINAL LOGOS*.{pdf,jpeg,jpg}    # SOURCE artwork — not deployed (ignored)
└── *.docx                    # SOURCE reference (intake questionnaire, consents,
                              # patient education) — not deployed
```

`.docx`, `.pdf`, and `TE FINAL LOGOS*` files are reference material from the
doctor; they are excluded from the deploy via `firebase.json` → `ignore`.

## 4. Local development

The site is plain static HTML/CSS/JS. To preview locally on the user's Mac:

```sh
python3 -m http.server 8765
# then visit http://127.0.0.1:8765/
```

`file://` previews fall back to the hardcoded defaults baked into the HTML
because `fetch('site-data.json')` won't work over `file://`. Always test via
HTTP.

## 5. Deploy flow

```
[edit files locally / via Claude Code]
    ↓
[commit + push to main]
    ↓
[user clicks "Run workflow" in GitHub Actions]
    ↓
[FirebaseExtended/action-hosting-deploy → live channel]
    ↓
[live at https://timothyehrlichmd.web.app/]
```

**To deploy:** GitHub → Actions → "Deploy to Firebase Hosting (manual)" →
"Run workflow" → pick `main` → Run. Takes ~1 min.

**Important workflow notes** (see [§10 Gotchas](#10-known-gotchas) for context):
- Do not add `repoToken: ${{ secrets.GITHUB_TOKEN }}` back to the action step;
  it caused git auth failures because we have restrictive `contents: read`
  permissions.
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
  Do not touch this without re-checking on a phone-width viewport.

## 7. Content management

`site-data.json` is the **single source of truth** for all editable copy on
the homepage. The HTML elements that get hydrated carry one of:

- `data-content="path.to.value"` — sets `textContent` (or an attribute via
  `data-content-attr="placeholder|alt|content"`)
- `data-content-list="path.to.array"` — replaces `<li>` children of a `<ul>`
  with one `<li>` per array item

`script.js` does the hydration on page load. Defaults are also baked into the
HTML so the page still renders if `site-data.json` is unavailable.

**The doctor (or admin) edits content via `/admin.html`** — a form pre-filled
from the current `site-data.json` that downloads an updated copy on submit.
The downloaded file replaces the one in the repo, gets committed, and the
next deploy publishes it. Edits also auto-save to localStorage on every
keystroke so refresh doesn't lose work.

**If you change the schema** (add/remove/rename a field in `site-data.json`):
1. Update bindings in `index.html` (or wherever rendered)
2. Update the corresponding fieldset in `admin.html`
3. Re-verify with a quick `grep` that no binding references a non-existent
   path

## 8. Current state

- ✅ Site is live at `https://timothyehrlichmd.web.app/` and
  `https://timothyehrlichmd.firebaseapp.com/`
- ⏳ The public sees the **coming-soon placeholder** at `/`. The real site
  lives at `home.html` (preview at `*.web.app/home`).
- ⏳ Custom domain `timothyehrlichmd.com` not yet purchased. Plan: buy at
  Cloudflare Registrar, point apex + www at Firebase A records (DNS-only,
  not proxied), let Firebase issue Let's Encrypt cert. See [§9](#9-firebase--external-accounts).
- ⏳ Intake form Submit button is a stub. Will write to Firestore once BAA
  is signed.
- ⏳ Dr. Ehrlich's inbox / admin view for reading submissions: not built yet.

**To take the site live (when ready):** rename `home.html` → `index.html`
(overwriting the placeholder), commit, push, user triggers deploy.

```sh
git mv -f home.html index.html
git commit -m "Go live: replace placeholder with real homepage"
git push origin main
# then user clicks Run workflow
```

## 9. Firebase & external accounts

- **Firebase project ID:** `timothyehrlichmd`
- **Google Workspace primary domain:** `tbehrlichmd.com` (Dr. Ehrlich's
  general-purpose business identity). The Workspace account owns the
  Firebase project and signs the BAA.
- **Website domain (planned):** `timothyehrlichmd.com` — separate from
  Workspace primary domain; will be added as a secondary domain if email
  on it is ever needed.
- **GitHub repo:** `amstreet/UAT2`. The repo has one secret:
  `FIREBASE_SERVICE_ACCOUNT_TIMOTHYEHRLICHMD` — the service-account JSON
  uploaded by `firebase init` during initial setup. Don't regenerate
  unless rotating keys.

## 10. HIPAA & compliance

**This is a real medical practice. The intake form collects Protected
Health Information (PHI).** Several decisions follow from this:

1. **A Google BAA must be signed** before the intake form can accept
   real patient submissions. The BAA is requested via Google Workspace
   admin console.
2. **Only HIPAA-eligible Google Cloud services may be used.** Firestore
   ✓. Cloud Functions ✓. Firebase Auth ✓. **Crashlytics ✗.** **Google
   Analytics for Firebase ✗.** When wiring the SDK, do not initialize
   the latter two.
3. **Submissions must not flow through email.** No `mailto:`, no
   notification email that includes PHI. The admin inbox (when built)
   stays inside Firestore behind auth.
4. **The Firebase Hosting Spark plan does not support BAA** — the
   project must be on the **Blaze (pay-as-you-go) plan** before any
   PHI flow goes live. Hosting alone (no submissions) is fine on Spark.

The user is aware of all of the above. Do not silently skip these — flag
them again if a future change risks violating them.

## 11. Known gotchas

- **`actions/checkout@v4` with depth 1 + FirebaseExtended action = git
  auth failures.** Always use `fetch-depth: 0`. Do not re-add `repoToken`
  to the deploy step (it's only for preview-channel PR comments).
- **Cloudflare orange-cloud proxy will break Firebase TLS issuance.** When
  the custom domain is added, set the DNS records to "DNS only" (gray
  cloud), not Proxied.
- **`fetch('site-data.json')` fails on `file://` previews.** Always test
  via HTTP (`python3 -m http.server`).
- **The Firebase Console "App Hosting" product is NOT what we use.** Use
  classic **Firebase Hosting** (the static-file CDN). App Hosting is for
  SSR frameworks and is wrong for this static site.
- **SPA-rewrite (`rewrites: ** -> /index.html`) is intentionally NOT
  enabled** in `firebase.json` because the site has multiple HTML pages
  (`admin.html`, `intake.html`). `cleanUrls: true` is enabled, so
  `/admin` and `/intake` resolve correctly without the `.html` extension.
- **Mobile photo crop:** `.about-photo-img { object-position: center 20% }`
  inside `@media (max-width: 1024px)` keeps Dr. Ehrlich's forehead from
  being clipped. Don't touch unless verifying on a phone-width viewport.

## 12. Intake wizard architecture

`/intake.html` is a hash-routed multi-step wizard driven by `intake.js`.

- **Entry point:** the homepage contact form (`#contactForm` on the real
  site at `home.html`) saves contact info to `localStorage` under key
  `intake.draft` and navigates to `intake.html`.
- **Step registry:** each step is registered via `registerStep({ id,
  label, when, render })`. The `when(interests)` predicate decides if
  the step shows; `interests` is the array from the contact form
  checkboxes (`hair`, `weight`, `hrt`).
- **Steps currently registered:**
  - `hair` — placeholder ("intake form coming soon")
  - `weight` — placeholder
  - `hrt` — **fully built** from `Testosterone Intake Questionnaire.docx`
    (10 sections). Auto-saves on every keystroke.
  - `review` — per-section summary with "Edit this section" buttons
    that round-trip back to the relevant step pre-filled
    (`?return=review` query string in the hash)
  - `submitted` — confirmation. **Currently a stub** — does not actually
    persist anywhere off the user's browser. Will be wired to Firestore
    once BAA is in place.
- **Generic form ⇄ state binding** (in `intake.js`):
  - `name="dot.path.in.state"` on every input → `setByPath(state, name, value)`
  - Checkboxes → boolean; radios → checked value; text → string
  - `data-list="true"` on a textarea → split lines into a string array
  - `fillForm(formEl, state)` does the reverse for prefill

To add a new intake form for hair or weight: drop a new `registerStep({...})`
above the `review` step (the ordering helper `reorderSteps()` will keep
review/submitted at the end). Use the existing HRT step as a template;
the generic collect/fill helpers handle persistence automatically.

## 13. Tracked decisions and history

A condensed history so future sessions don't repeat conversations:

- **Branding:** the doctor picked the **blue** logo variant (over the green).
  All colors in §6 are derived from that. There's a high-res source
  `TE FINAL LOGOS_hr.jpg`; the two PNGs in use are generated from it.
- **Navbar:** white opaque background (no translucency), 76px tall, 52px logo.
- **Photo:** auto-loads `dr-ehrlich.jpg`; falls back to placeholder if
  missing (`onerror="this.remove()"`).
- **Branch policy:** old work happened on `claude/read-eps-files-K5HJb`; the
  user later directed all future work to `main` directly. That branch is
  defunct; do not push to it.
- **Hosting choice:** classic Firebase Hosting (not App Hosting), repo root
  as public dir, manual deploy via workflow_dispatch, no auto-deploy on push.
- **Domain choice:** `timothyehrlichmd.com` for the website (planned via
  Cloudflare Registrar), separate from `tbehrlichmd.com` which is Dr.
  Ehrlich's Workspace primary.
- **Coming-soon mode:** in effect as of commit `34d5afe`. Real site at
  `home.html`. To go live, rename back to `index.html`.
- **Deploy workflow fix:** commit `fb1eab5` removed `repoToken` and added
  `fetch-depth: 0` after the second deploy failed with git auth errors.
  Do not undo this.

## 14. Useful commands

```sh
# preview locally (on the Mac, in the repo dir)
python3 -m http.server 8765

# add the manual-deploy workflow into your normal cycle
git add <files>
git commit -m "<message>"
git push origin main
# then: GitHub → Actions → "Deploy to Firebase Hosting (manual)" → Run workflow

# go live (swap placeholder for real homepage)
git mv -f home.html index.html
git commit -m "Go live"
git push origin main

# go back into WIP mode (re-hide the real site behind the placeholder)
# (requires recreating the coming-soon index.html from the commit that
# introduced it, or from CLAUDE.md history; the simplest is to revert the
# "go live" commit)
git revert <go-live-sha>
git push origin main
```
