# Local fixtures

## Media

`hls/` is a six-second H.264 test pattern generated with FFmpeg's `testsrc2` filter.
It contains no footage, audio, private data, or third-party stream. Its only consumer is the
automated browser suite. Regenerate it from the `app/` directory with:

```sh
ffmpeg -hide_banner -loglevel error -f lavfi -i testsrc2=size=320x180:rate=24 -t 6 -c:v libx264 -preset ultrafast -pix_fmt yuv420p -g 48 -sc_threshold 0 -an -f hls -hls_time 2 -hls_list_size 0 -hls_segment_filename tests/fixtures/hls/segment%d.m2ts tests/fixtures/hls/index.m3u8
```

Tests serve these files from the loopback test origin. They never request a broadcaster,
Home Assistant installation, or other live service. Weather and geocoding responses are fixtures;
all other external browser requests are blocked.

## Home Assistant

`home-assistant.ts` starts a synthetic Home Assistant WebSocket server on an ephemeral loopback
port. Its account token, entities, readings, and private attribute markers are fictional. Unit
and browser tests use it for authentication, state updates, outages, removals, and permission
checks. It never connects to a real Home Assistant installation or external service.

Its `rich` option supplies fictional weather, calendar, thermostat, CO₂, readiness, motion, and
camera entities. It serves authenticated calendar/recorder REST responses and a one-pixel PNG;
controls simulate partial outages, redirects, rejected MIME types, and oversized responses.
The illustrations in `public/demo-front-door.svg` and the rich preview's sample readings are
original fictional demo assets, not data or images from a real household.
