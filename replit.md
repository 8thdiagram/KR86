# Kick Return ’86

Standalone React/TypeScript/Vite football PWA. Keep the existing project structure and frozen game engine; do not migrate it into a workspace or add account services.

## Run on Replit

- Runtime: Node.js 22; package manager: pnpm 10.26.1.
- Install existing dependencies: `pnpm install --frozen-lockfile`.
- Click Run to start the `Start application` workflow (`PORT=5000 pnpm run dev`).
- The command builds the release and serves `dist/public` on `0.0.0.0:5000`, with the service worker enabled. After editing source, restart the workflow to rebuild.
- No secrets, database, authentication, or external API services are required.

## Checks

- `pnpm run typecheck`
- `pnpm test`
- `pnpm run test:engine`
- `pnpm run game:check`

The original static publishing configuration is preserved: build with `pnpm install --frozen-lockfile && pnpm run build`, serve `dist/public`. Running in Preview does not publish the app. See README.md and TESTING.md for local-save backup instructions and physical-iPhone verification limitations.
