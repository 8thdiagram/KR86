# Standalone verification

Verified in development on November 12, 2026 (America/Denver). No published
standalone URL or separate Replit project existed at delivery.

## Passed automated checks

- 234 gameplay checks against the copied engine: quarterback tap/bullet/manual
  scramble behavior, receiver locking, passing/catching, six/four play recommendations,
  adaptive coaching, clock management, defense, Clutch, Franchise/league/MVP progression,
  field/graphics geometry and the approved touchdown artwork.
- Eight save/backup checks: independent namespace, complete Franchise journal and
  IndexedDB snapshots, separate game/settings slots, export, rejection of invalid
  imports, atomic valid replacement, storage-quota failure without advancement.
- Original account-localStorage-specific tests are intentionally not used in the
  standalone engine command. Their storage assumptions do not apply to this edition;
  the device IndexedDB/journal suite replaces that contract.
- 98 non-adapter game/support files match the pinned source byte-for-byte.
  All 103 pinned original trytry files remain unchanged.
- TypeScript validation and a release build.
- Exported project installed, type-checked and built independently, with no parent
  workspace configuration, API service, credentials or workspace packages.
- Manifest/service worker served successfully; release JavaScript contained no
  Clerk/Stripe/account API or remote-font dependency.

## Browser-emulation checks

A fresh isolated browser context used synthetic Redbirds/Classic/Full Game saves.
No real account was signed in, no customer save was altered, and nothing was published.

- Direct 852×393 launch: original mode chooser, no trytry navigation/login/dev banner.
- Classic field/controls rendered; pause/back confirmation returned to the menu.
- Created Redbirds Franchise, selected kickoff and saved an active checkpoint.
  Reopening showed CONTINUE GAME. Journal and IndexedDB were exactly equal.
- Export downloaded valid JSON. Malformed and structurally invalid imports left
  progress unchanged. A valid import required explicit confirmation; Cancel retained
  progress, and confirmed restoration persisted after reload.
- Full Game initialized, accepted kickoff/Power selection, and showed the expected
  field, scoreboard, play cards and controls at 393×852 and 852×393 without observed
  horizontal clipping. Blur/pause and resume worked.
- Activated, game-scoped service worker cached 13 release files, including fonts/audio.
  Offline reload and entry into Classic, Full Game and continued Franchise worked.
  Offline saving/export and a subsequent offline reopen retained the Franchise.
- A separate original-edition browser context blocked mutating API requests and
  confirmed `/games/play/kick-return` still showed its original four-mode chooser.

## Not established by these checks

- No physical iPhone Add to Home Screen, actual standalone iOS window, native-touch
  timing, iOS audio/system gestures or on-device frame-rate/startup benchmark.
- The automated browser's clicks missed Classic's brief active window and Full Game's
  snap clock, so successful live browser steering/ACTION and a snapped play were not
  demonstrated. Engine tests verify the unchanged control logic; this is not a substitute
  for a physical iPhone session.
- Goalpost/pylon geometry was engine/render-test verified, not individually counted
  in the browser screenshots.
- Initial-online request tracing and forced-cache-failure/update-interruption scenarios
  were not browser-tested. After-reload resource timings showed only same-origin game
  resources; static bundle/cache inspection provides the additional dependency check.
- No unlimited-device-storage, cloud-save, production hosting, private-address or
  App Store approval claim is made.
