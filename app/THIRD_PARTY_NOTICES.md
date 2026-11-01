# Third-party notices

NoticeTV's application code is licensed under the GNU AGPL v3 in the repository root.
Dependencies retain their original licenses. Exact versions and integrity hashes are in
`package-lock.json`; dependency distributions contain their license texts. The build also copies
browser dependency licenses into `dist/licenses/`, served at `/licenses/`.

| Component                   | License                   | Source                                                        |
| --------------------------- | ------------------------- | ------------------------------------------------------------- |
| React and React DOM         | MIT                       | https://github.com/facebook/react                             |
| Express                     | MIT                       | https://github.com/expressjs/express                          |
| express-rate-limit          | MIT                       | https://github.com/express-rate-limit/express-rate-limit      |
| Zod                         | MIT                       | https://github.com/colinhacks/zod                             |
| Lucide icons                | ISC                       | https://github.com/lucide-icons/lucide                        |
| hls.js                      | Apache-2.0                | https://github.com/video-dev/hls.js                           |
| Home Assistant JS WebSocket | Apache-2.0                | https://github.com/home-assistant/home-assistant-js-websocket |
| ws (test fixtures)          | MIT                       | https://github.com/websockets/ws                              |
| Inter                       | SIL Open Font License 1.1 | `public/fonts/Inter-LICENSE.txt`                              |
| Stack Sans Notch            | SIL Open Font License 1.1 | `public/fonts/StackSansNotch-LICENSE.txt`                     |

The fonts are shared with NoticeTV's existing brand assets. The coast illustration, fictional
demo content, and dashboard styling are original NoticeTV assets. No broadcaster footage,
home-camera image, publisher logo, or data from a real household is bundled.

Weather comes from [Open-Meteo](https://open-meteo.com/) and is attributed in the widget.
The browser test video is a generated test pattern, documented in `tests/fixtures/README.md`.
