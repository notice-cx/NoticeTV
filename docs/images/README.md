# Documentation visuals

The main README shows the current dashboard application. `docs/operating-system.md` uses the
separate appliance images and installer screenshots.

## Dashboard screenshots

From `app/`, with the locked dependencies installed:

```sh
npm run build
npx playwright install chromium
npm run screenshots
```

The capture script starts its own loopback server with a temporary data directory and key.
It captures the actual editor, display preview, five themes, widget collection, phone editor,
and pairing dialog. The date is fixed, the agenda and weather are fictional, and the video tile
is the app's original illustration. The pairing dialog uses a fixed example code and expiry.
The three Home Assistant captures use explicit local response fixtures for connection status,
entity discovery, and a temperature reading. Their dashboard is labeled as a fictional preview;
the capture server never receives HA credentials or contacts an HA installation.
Every external browser request is blocked. The browser,
server, and temporary data are removed when capture finishes.

The four rich-widget captures use `/demo?home` and `/demo?home&cameras`. Calendar events, readings,
and histories are fictional, and the camera image is an original illustration. The real household
reference is not included in the repository. These previews make no HA or external-source requests.

The script writes seventeen PNGs into this directory. Review them after interface changes, then commit
the updated images alongside the relevant documentation. The screenshots contain no data from a
real installation. `NOTICETV_DOCS_PORT` selects another local port if the default, 3002, is busy.

## Diagrams

The two diagrams are Mermaid code blocks in the root `README.md`; GitHub renders them directly.
They describe the server/editor/display relationships and the distinction between drafts,
previews, and publication. Keep those blocks with the documentation they explain.

## Appliance images

`render.sh` builds the OS installation visuals from the HTML files in `src/` and screenshots
from the existing VM tools. Its header documents the inputs. These assets are separate from
the dashboard capture command and do not contact a real appliance.
