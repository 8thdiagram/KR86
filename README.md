# Kick Return ’86 — standalone iPhone PWA

This is the existing football game in an independent, account-free web application.
It is not a new football engine or an App Store submission. Classic, Full Game,
Franchise and the earned Playoff mode use the frozen original game.

## What exists and what does not

- The separate app runs in this workspace at the registered `/kick-return-86/` preview.
- This folder and its exported ZIP can be moved into a separate Replit project.
- **A separate Replit project and independent published URL have not been created here.**
- Do not publish the whole trytry workspace as a substitute for independent hosting.
- No trytry login, Stripe, database, API service or environment secret is needed by this game.

## Exact remaining publishing steps

1. Download `generated-artifacts/kick-return-86-standalone.zip` from the original workspace.
2. Open https://replit.com/import, choose **ZIP**, and upload that archive as a new project.
   The archive has files at its root, a normal package.json, a lockfile and its own
   static deployment configuration. It contains no trytry account data or credentials.
3. In that new project, install packages with `pnpm install --frozen-lockfile`.
   Run with `pnpm run dev`. This builds and serves the release, including its service worker.
4. In the new project's Publishing tool, publish a **Static** app with
   build command `pnpm run build` and public directory `dist/public`.
5. Use the HTTPS URL actually returned by Publishing. Do not reuse or change trytry's
   production domain. An unadvertised, login-free address is public to anyone who knows it.
   `noindex` metadata discourages indexing; it is not access control.

## Install on iPhone

1. Open that **published HTTPS game address in Safari**.
2. Tap **Share → Add to Home Screen → Add**. Enable **Open as Web App** if offered.
   The suggested name is **Kick Return ’86**; leave it unchanged. iOS may visually
   shorten long labels depending on Home Screen layout and text settings.
3. Tap the new Kick Return ’86 icon. The existing game-mode chooser opens, without login.
4. Open **SAVE & INSTALL** at the menu and wait for **Ready for offline play on this device**.
   Let the first asset download finish before switching off internet access.
5. Rotate to landscape for the existing handheld layout. iOS can ignore an orientation
   request; turn off Portrait Orientation Lock if needed. No orientation-lock guarantee is made.
6. Create and continue your Franchise from the installed app. Save progress is local to
   this device/site/browser installation, not a synced account. Export regular backups.
   Safari and Home Screen storage can differ across iOS versions; export/import explicitly
   to move progress. Changing the hosting origin also requires export/import.

## Official standalone icon

The owner-supplied neon KR / red-uniform football artwork is this edition's
official icon. It is not trytry's icon. The unchanged 1254×1254 source is retained
at `branding/official-app-icon.png`, alongside an opaque 1024×1024
`branding/app-store-icon-1024.png` for future native packaging. The iPhone
120/180, PWA 192/512, and browser 32 pixel PNGs use that same artwork, resized
without cropping or redesign. A separately padded maskable variant keeps the
complete artwork inside the circular safe area for platforms that mask icons.
All runtime icons are bundled locally and cached for offline use.

If replacing an older Home Screen installation, export its saves before removing
it, then add the published site again and import the backup if needed. iOS can
retain an installed icon instead of immediately adopting a site's new icon.

## Saving and recovery

The device has independent Classic, Full Game, Franchise and sound-setting slots.
Franchise retains its complete original structure: schedules, standings, player/MVP
progress, history, league simulations and any active game at the original save checkpoints.
IndexedDB stores complete snapshots; an isolated synchronous write-ahead journal covers
closing the app while an IndexedDB transaction is finishing.

Errors are shown rather than silently resetting progress. If device storage is full,
progress does not advance past a failed checkpoint. Keep the app open and export a backup.
The synchronous journal shares the browser's local-storage quota; exceptionally large
multi-season saves can reach that quota. It is not unlimited storage.

**SAVE & INSTALL → Export backup** exports all three game slots and settings.
**Import backup** validates the full file, previews it, and requires explicit
replacement confirmation. Cancel or an invalid file changes nothing. Before a valid
replacement, the previous save is also retained in IndexedDB as `before-last-import`.
Use one game window at a time; detected concurrent edits block further saving.

No automatic migration reads or writes trytry's saves. Browser/OS storage can be cleared
or evicted even for installed apps. There is no account backup, cloud sync or unlimited
storage promise; keep exported copies outside website storage.

## Offline and updates

All football engines, CPU AI, franchise simulations, graphics, locally bundled fonts,
original audio and local saves run on the device. The release service worker precaches
only the game's own asset allowlist, never trytry APIs, accounts or authentication pages.
It uses a content-derived cache version and never forces a mid-game update. Downloaded
updates are offered from the game menu. The worker's scope and cache names are isolated.

**Online limitation:** trytry's cross-player rankings require its server and are not
connected to this independent edition. Local return timing/statistics and normal football
gameplay remain. No other game mode requires a server after the release is cached.

## Development and safe synchronization

Use Node 22+ and pnpm. Standard scripts:

```
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run test:engine
pnpm run build
pnpm run serve
pnpm run game:check
```

On an independent host, `BASE_PATH` defaults to `/`; `PORT` defaults to 5173.
The managed workspace supplies a preview prefix and port. The source export resolves
catalog dependencies and parent TypeScript configuration, so no monorepo is required.

The original trytry game has not been refactored or redirected. A frozen game copy was
chosen to avoid risking its production code. `game-source-lock.json` pins source hashes;
`game:check` proves all non-adapter game code is byte-identical and, when the original
workspace is present, checks that its source remains unchanged. Only the listed local-save,
account-removal and sound-setting adapters differ. Local fonts retain their OFL notice.

For future updates in the original workspace, run
`node scripts/snapshot-game.mjs --stage`. It stages a new copy in generated-artifacts;
it does not replace the playable game. Review the diff against the pinned version,
apply approved changes, rerun engine/save/offline checks, and intentionally repin hashes.
Keep the previous ZIP/release for rollback. Neither edition automatically follows the other.
Extracting a truly shared package can be a later, separately verified change.

## Future App Store path

The game is plain React/TypeScript/canvas with local platform adapters. A later Capacitor
project can bundle the same `dist/public` files and add native safe-area, lifecycle,
file-sharing and durable-storage adapters. That will require Apple Developer setup,
real-device checks, asset/rights review, store metadata and Apple's review.
No native packaging, Apple enrollment, submission or approval is included in this work.

## Verification scope

Automated engine checks, desktop/mobile browser emulation, service-worker offline checks
and save/backup checks are distinct from a physical iPhone installation. Real Safari
Add to Home Screen, iOS storage persistence, audio, system gestures and on-device frame
rate still need to be verified on the installed published app. Do not describe emulation
as real-device testing.
