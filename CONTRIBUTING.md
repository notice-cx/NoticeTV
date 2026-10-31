# Contributing to NoticeTV

NoticeTV has two independently runnable parts: the dashboard in `app/` and the display appliance
in `os/`, `image/`, and `installer/`. Keep changes focused on the relevant part, and read
[AGENTS.md](AGENTS.md) for repository conventions.

## Dashboard changes

Use Node.js 22.12 or newer and install locked dependencies with `npm ci` from `app/`.
The [dashboard guide](app/README.md) covers development, API boundaries, and hosting.

Before submitting a change, run from `app/`:

```sh
npm run format:check
npm test
npm run build
npm run test:browser
```

Install Playwright Chromium once with `npx playwright install chromium`. Browser tests use a
production build, local fixtures, a separate data directory, and a test-only editor key.
They must never connect to a real home, camera, stream, or production service.

For interface changes, inspect desktop and phone screenshots. Check keyboard access, meaningful
labels, loading and failure states, and the passive display. Keep fictional data visibly
identified. Sources need bounded requests, outage behavior, and accurate attribution; a failed
source must not invent a successful reading.

Dashboard documents are a compatibility boundary. Validate browser and server input with the
shared schema, protect editing endpoints, and keep installation settings outside source control.
Tests should prove behavior at these boundaries rather than duplicate functions.

## Appliance changes

Box scripts are POSIX sh. Installation must converge when run again. Preserve recovery behavior
and keep installation settings out of the repository. Boot changes require the documented VM
validation; see [how images are built](docs/building.md).

Do not test against or deploy to a real installation without the owner's specific approval.

## Pull requests

Describe the user-visible problem, resulting behavior, and evidence from relevant checks.
Include screenshots for visual changes and disclose verification limits. Keep code readable,
comments focused on non-obvious constraints, and documentation consistent with what runs.
Use new commits; never amend or force-push history.
