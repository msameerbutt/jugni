# Hosting Jugni as an installable app

Jugni's normal output is one self-contained file that opens from `file://` with
the network off. This document covers the *other* way to deliver the same app:
a hosted URL you can add to a phone's home screen, where it opens full-screen
with its own icon and keeps working offline.

Both exist at once. Nothing here changes `jugni.html`.

---

## Why this is a second output, not a setting

A Progressive Web App is, by definition, several files fetched by URL from a
secure origin: an HTML document, a manifest beside it, a service worker, icons.
A single self-contained file has none of those neighbours and no origin at all.

So the two cannot be one artifact, and the portable file must not pretend
otherwise. A `<link rel="manifest">` inside `jugni.html` would point at a
sibling that does not exist — a dead reference in the one output whose entire
promise is that nothing it needs lives anywhere else. `make host` therefore
writes a *separate folder*, and the PWA tags exist only in that copy.

| | `make build` | `make host` |
|---|---|---|
| Output | `trips/<slug>/jugni.html` | `trips/<slug>/hosted/` |
| Opens from | `file://`, email, a USB stick | an HTTPS URL |
| Installable | no | yes |
| Needs a server | no | yes |
| Survives the host disappearing | **yes** | no |

That last row is why the single file stays the default. Spec §8 argues against
hosting the keepsake copy: a free host that lapses in three years is how a trip
someone wanted to keep quietly stops existing. The hosted build is a
convenience layered on top, not a replacement.

---

## Building it

```
make host TRIP=mytrip
```

Writes `trips/mytrip/hosted/`:

```
index.html            the same app, plus the PWA head tags and SW registration
manifest.webmanifest  name, colours, icons, standalone display
sw.js                 cache-first service worker over the app shell
icon.svg              the mark, used for both normal and maskable entries
icon-180.png          the same mark for iOS, which will not take an SVG
```

It then runs `make check` against `index.html`, which verifies the manifest
parses, declares `standalone`, has a maskable icon and a PNG, that every icon
it names exists, that `sw.js` is present and that the HTML links the manifest.
A bundle that fails any of those installs badly or not at all, usually with no
error anyone sees until they tap the icon on a phone.

Everything is generated from the app's own design tokens, so the splash
colour, the theme colour and the icon cannot drift from the app they open. A
dark-theme trip gets a dark manifest.

---

## Deploying

Any static host works. The one that is genuinely free *and* can put a Google
login in front of a private trip is Cloudflare Pages with Cloudflare Access
(free for up to 50 users) — see the comparison in `someplan.md`.

Upload the **contents** of `hosted/`, not the folder itself:

```
cd trips/mytrip/hosted && zip -r ../hosted.zip .
```

> A nested folder inside the zip is the most common cause of a blank deploy on
> Cloudflare Pages direct upload. `index.html` must be at the zip root.

**Redeploying.** The service worker's cache name carries the build hash, so
every rebuild is a new cache and the old one is deleted when the new worker
activates. There is no version number to remember to bump — that manual step is
exactly what gets forgotten, and the symptom is a returning user pinned to a
stale app with no way to tell.

**Cloudflare Access.** The service worker caches only what it has already
loaded successfully, after authentication. It does not bypass or interact with
the login gate. A new visitor still signs in with Google first.

---

## What the service worker does

Cache-first over the app shell, with three deliberate limits:

- **GET only.** Anything else must reach the network or fail honestly.
- **Same origin only.** The weather and currency APIs are cross-origin and must
  never be answered from a cache that cannot hold a meaningful response —
  the app has its own caching for those, with a "last updated" stamp.
- **Navigations fall back to the shell.** Offline, a deep link opens the app
  rather than the browser's error page.

---

## Storage

The hosted copy asks for persistent storage on load:

```js
navigator.storage.persist()
```

This asks the browser to exempt the trip from routine eviction — the technical
half of "clearing your browsing history should not clear your trip". It is a
**request, not a guarantee**: the browser can decline, and iOS may still clear
data under storage pressure. It layers on top of **Trip data → Export**, which
remains the only actual backup.

Clearing is already an in-app action, not a browser one: **Trip data → Reset**
restores the trip as built, and **Clear everything** empties the browser copy.
Both name what they are about to destroy and offer a way back, because deleting
the wrong trip from a browser settings panel is not a recoverable mistake.

Storage is keyed per trip (`jugni.trip.v1::<tripKey>`), so several trips hosted
on one domain do not overwrite each other.

---

## Verifying on a device

The static checks are automated; these are the ones only a phone can answer.

- [ ] **DevTools → Application → Manifest** — loads with no errors, icon renders
- [ ] **Application → Service Workers** — `sw.js` registered, status *activated*
- [ ] **Console** — `Jugni: persistent storage granted / not granted`. Either is
      fine; it is informational
- [ ] **Add to Home Screen** on iOS Safari and Android Chrome — a real icon
      appears, not a screenshot of the page, and it opens with no URL bar
- [ ] **Airplane mode** after one successful load, then reopen from the icon —
      the app still loads
- [ ] If it sits behind Cloudflare Access, the Google sign-in still appears on
      a fresh browser

---

## Known limits

- **iOS needs the PNG.** `apple-touch-icon` does not accept SVG; given one,
  Safari silently substitutes a screenshot of the page. `icon-180.png` is the
  only raster asset in the project and exists solely for this.
- **The icon is drawn twice** — once as SVG, once with Pillow for the PNG —
  because rasterising SVG would mean a new dependency. The shape is simple
  enough that a divergence is visible immediately; keep them in step in
  `scripts/lib/pwa.py`.
- **Installability is not tested here.** Whether a browser offers "install"
  depends on the browser, the origin and the engagement heuristics of the day.
  `make check` verifies the bundle is *correct*; only a device confirms the
  prompt appears.
- **Nothing is synced.** Every installed copy keeps its own data, exactly like
  the single file. Shared, live state across devices is Phase 3 (spec §1).
