Ready for review
Select text to add comments on the plan
Hosting Jugni with Google sign-in, and making it installable
Context
Jugni is deliberately a single self-contained HTML file per trip: no server, no account, opens from file://, data lives in the browser's localStorage, and durability is handled today by manual export/import (output-<nickname>.json) and the "fork" model (spec §12). That design is a real, considered decision — spec §8 explicitly argues against externally hosting the portable keepsake file itself, because a free host that lapses years later would break a trip someone wants to keep.

You've now said the app is "almost ready" and asked for something different: a place to host it, gated by Google sign-in so only your family/travel group can get in, ideally free — and, in a follow-up, something that's easy to make feel like a phone app rather than "one more browser tab."

These don't conflict with the earlier decision. That decision was about the offline, mail-around, keepsake copy — it still ships exactly as-is, still opens from file:// forever, untouched by anything below. What you're asking for now is an additional, separate delivery path: a hosted, gated URL that's easier to get to than emailing a file, made installable so it feels like an app once you're there. Two different jobs, same underlying build.

What this plan does NOT do: it does not add real-time shared/synced storage (e.g. "I tick a task, my spouse sees it tick on their phone"). That's a genuinely bigger feature — new code in src/app/state/store.js, a real backend (Firebase Auth + Firestore, still free at this scale), conflict handling — and a real step toward the "Phase 3" the spec deliberately deferred. You asked for "easy," so this plan keeps today's per-browser localStorage model exactly as it is: everyone who signs in gets the same starting trip, and their own edits stay in their own browser, same as opening the file locally today. If you later want the synced version, it's a well-scoped follow-up, not a foreclosed option — flagged at the end.

Part A — Hosting + Google-gated access (pure infrastructure, zero code)
Cloudflare Pages (free, unlimited bandwidth, static sites only, one custom domain on the free tier) to host the built file, with Cloudflare Access (free for up to 50 users) sitting in front of it as an identity-aware proxy.

How it works: Access checks every request against an allow-list before it ever reaches your site — unauthenticated visitors are redirected to a Cloudflare-hosted Google sign-in screen; only approved Google accounts get through. Jugni's code never knows this is happening. No SDK, no auth code, no change to src/app/.

Researched alternatives, ruled out:

GitHub Pages — private-site access control needs a paid Enterprise Cloud org; not available free.
Netlify — password/auth protection moved to the paid Pro tier for accounts created after September 2025.
Vercel — equivalent gating needs Enterprise.
Cloudflare Pages + Access is the one combination that's genuinely free and does exactly this job.

Setup (dashboard only, no repo changes):

Connect the repo (or just drag-and-drop the trips/<slug>/ output folder) to a new Cloudflare Pages project.
Add a Cloudflare Zero Trust account (free), add Google as an identity provider (a few clicks — uses Google's own OAuth, no Google Cloud project needed for basic sign-in-with-Google).
Create an Access application for the Pages domain, with a policy allowing only the specific email addresses (or your Google Workspace domain, if you have one) you want in.
Result: https://<something>.pages.dev (or a custom domain), gated by Google login, live same-day. $0.

Part B — Installable, app-like (small, additive code change)
Once it's hosted over HTTPS, making it installable ("Add to Home Screen" on Android, full-screen, its own icon) needs three things per current Chrome requirements: a valid Web App Manifest (name, short_name, start_url, display: standalone, background_color, theme_color, a 512×512 icon), and HTTPS (already true once hosted). A service worker isn't required for the install prompt itself, but is worth having here specifically because trips happen on patchy wifi — without one, launching the installed icon with no signal would fail to load even though everything is normally self-contained.

This is scoped as a new, additive build output that never touches the existing single-file path:

New Makefile target: make build-hosted TRIP=<slug> — runs the normal build, then emits a small trips/<slug>/hosted/ folder alongside the usual jugni.html:

index.html — the exact same self-contained bundle, with three small additions to src/templates/app.html: a <link rel="manifest">, a <meta name="theme-color">, and a ~5-line inline service-worker registration snippet. These are harmless when the plain jugni.html is opened from file:// (a relative manifest link that can't resolve just fails silently, no error, no functional impact) — so they can live in the shared template unconditionally rather than needing a build flag.
manifest.webmanifest — a new small template. name/short_name from trip.name (falling back to "Jugni"), colors from the existing tokens (--brass #96661F, --bg #EDEEE7 light / #101416 dark), start_url, display: standalone.
sw.js — ~25 lines, hand-written (no Workbox): on install, cache the one HTML document; serve from cache when offline, network when available.
Two icon PNGs (192×192, 512×512). Jugni currently has no PNG assets, only an inline SVG favicon of a compass emoji — and Pillow (already a dependency, used for OCR) can't rasterize emoji glyphs without a font it doesn't have. Simplest zero-new-dependency path: draw a plain geometric mark directly with PIL.ImageDraw (a circle in --bg, a simple compass-needle shape in --brass) rather than trying to reproduce the emoji exactly. New small script, e.g. scripts/lib/pwa_icons.py.
What doesn't change: make build / make generate (the default, portable, single-file path) are untouched. The read-only snapshot export (src/app/lib/snapshot.js) clones the live document, so a downloaded snapshot will carry the same harmless dead manifest link — no functional effect there either.

Verification: extend make check with a fast static check (same pattern as the recently-added scripts/lint_components.py) confirming manifest.webmanifest parses as JSON and has the four required fields, and that sw.js exists — plus a manual pass with Chrome DevTools' Lighthouse installability audit against the real hosted URL once deployed.

Deploy: point Cloudflare Pages' publish directory at trips/<slug>/hosted/ instead of the bare .html file.

What this gets you, and what it doesn't
Result
Cost	$0 — Cloudflare Pages + Access free tier, no card required
Access control	Google sign-in, allow-list of specific emails, edge-enforced
Feels like an app	Yes — home-screen icon, full-screen, works offline once installed
Effort	Infra: ~20 min dashboard setup. Code: a handful of small new files, no changes to app logic
Shared/synced data	No — each signed-in person still has their own local copy, exactly like today. This is the "easy" tradeoff; see below if you want more.
The original keepsake file	Completely unaffected — still a single portable file, still works from file:// forever
If you later want real shared/synced storage (not part of this plan)
Firebase's free Spark tier (Google sign-in auth up to 50,000 monthly users, Firestore free at 50K reads/20K writes per day) is the natural next step, genuinely free at this scale, and Google-native — but it's real new code: the Firebase SDK added to the bundle, a Google sign-in flow inside the app, and a sync layer added to src/app/state/store.js alongside localStorage. Worth doing once you know you want "tick a task, everyone sees it" — not before.

Native Android app (also not part of this plan)
The app's navigation was already built with this in mind (spec §1: "app-style navigation now avoids a rewrite later"). Wrapping the exact same code with Capacitor into a real .apk is very feasible later, but is real ongoing work (Android Studio/Capacitor tooling, a $25 one-time Google Play developer account if you want Play Store listing, app signing, review). The PWA above gets you most of the "feels like an app" outcome today for free; native is a future upgrade the architecture doesn't block, not something to build now.

Add Comment