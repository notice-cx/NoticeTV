import { useEffect, useRef, useState } from 'react';
import { Play, Radio, Volume2, VolumeX } from 'lucide-react';
import type { WidgetOf } from '../shared/dashboard';

export function Video({
  widget,
  demo,
  passive,
}: {
  widget: WidgetOf<'video'>;
  demo: boolean;
  passive: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('Connecting');
  const [muted, setMuted] = useState(true);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video || !widget.url || demo) return;
    let retired = false;
    let player: import('hls.js').default | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setInterval> | undefined;
    let attempts = 0,
      lastProgress = performance.now(),
      lastFrame = -1,
      generation = 0,
      lastStart = performance.now(),
      autoplayBlocked = false;

    const dispose = () => {
      generation++;
      player?.destroy();
      player = undefined;
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
    const play = async () => {
      try {
        await video.play();
        if (!retired) setBlocked(false);
      } catch (error) {
        if (!retired && (error as DOMException).name === 'NotAllowedError') {
          autoplayBlocked = true;
          setBlocked(true);
          setStatus('Press play to start');
        }
      }
    };
    const schedule = () => {
      if (retired || retry || document.hidden || !navigator.onLine) return;
      setStatus('Reconnecting');
      dispose();
      retry = setTimeout(
        () => {
          retry = undefined;
          void start();
        },
        Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5)),
      );
    };
    const start = async () => {
      if (retired || document.hidden || !navigator.onLine) return;
      dispose();
      const current = generation;
      setStatus('Connecting');
      lastStart = lastProgress = performance.now();
      lastFrame = -1;
      autoplayBlocked = false;
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = widget.url;
        void play();
        return;
      }
      let Hls: typeof import('hls.js').default;
      try {
        Hls = (await import('hls.js')).default;
      } catch {
        if (!retired && generation === current) schedule();
        return;
      }
      if (retired || generation !== current) return;
      if (!Hls.isSupported()) {
        setStatus('HLS playback is unavailable in this browser');
        return;
      }
      player = new Hls({ capLevelToPlayerSize: true, maxBufferLength: 20, backBufferLength: 10 });
      player.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!retired && generation === current) void play();
      });
      player.on(Hls.Events.ERROR, (_event, data) => {
        if (!retired && generation === current && data.fatal) schedule();
      });
      player.attachMedia(video);
      player.loadSource(widget.url);
    };
    const onError = () => schedule();
    const visibility = () => {
      if (document.hidden || !navigator.onLine) {
        clearTimeout(retry);
        retry = undefined;
        dispose();
        setStatus(document.hidden ? 'Paused' : 'Waiting for connection');
      } else if (!retry) {
        void start();
      }
    };
    video.addEventListener('error', onError);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', visibility);
    window.addEventListener('offline', visibility);
    watchdog = setInterval(() => {
      if (
        retired ||
        document.hidden ||
        !navigator.onLine ||
        retry ||
        (autoplayBlocked && video.paused)
      )
        return;
      const frames = video.getVideoPlaybackQuality?.().totalVideoFrames;
      const progress = frames === undefined ? video.currentTime : frames;
      if (progress > lastFrame && progress > 0) {
        lastFrame = progress;
        lastProgress = performance.now();
        setStatus('Playing');
      }
      if (performance.now() - lastProgress > (lastFrame < 0 ? 20_000 : 40_000)) schedule();
      else if (performance.now() - lastStart > 60_000 && performance.now() - lastProgress < 5000)
        attempts = 0;
    }, 5000);
    void start();
    return () => {
      retired = true;
      clearTimeout(retry);
      clearInterval(watchdog);
      dispose();
      video.removeEventListener('error', onError);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('online', visibility);
      window.removeEventListener('offline', visibility);
    };
  }, [widget.url, demo]);

  if (demo)
    return (
      <div className="video-scene">
        <Coast />
        <div className="scene-caption">
          <span className="tiny-label">A WINDOW TO SOMEWHERE</span>
          <h3>{widget.title}</h3>
          <span className="sample-stream">
            <Play size={11} fill="currentColor" /> Sample scene · HLS ready
          </span>
        </div>
        <div className="scene-badge">DEMO</div>
      </div>
    );
  if (!widget.url)
    return (
      <div className="empty-video">
        <Radio size={30} strokeWidth={1.1} />
        <h3>Your window to the world.</h3>
        <p>Add an HLS stream in widget settings.</p>
        <span className="format-badge">HTTP LIVE STREAMING</span>
      </div>
    );
  return (
    <div className="video-player">
      <video
        ref={ref}
        muted={muted}
        playsInline
        autoPlay
        controls={false}
        crossOrigin="anonymous"
        style={{ objectFit: widget.fit }}
        aria-label={widget.title}
      />
      <div className="video-meta">
        <span>
          <i className={status === 'Playing' ? 'status-dot' : 'status-dot amber'} />
          {status === 'Playing' ? widget.title : status}
        </span>
        {!passive && (
          <button
            className="icon-button"
            onClick={(event) => {
              event.stopPropagation();
              setMuted(!muted);
            }}
            aria-label={muted ? 'Unmute stream' : 'Mute stream'}
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
        )}
      </div>
      {blocked && !passive && (
        <button
          className="play-stream"
          onClick={(event) => {
            event.stopPropagation();
            void ref.current?.play().then(() => setBlocked(false));
          }}
        >
          <Play size={20} /> Play stream
        </button>
      )}
    </div>
  );
}

function Coast() {
  return (
    <svg
      className="coast-scene"
      viewBox="0 0 700 480"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="An illustrated coast at dusk"
    >
      <defs>
        <linearGradient id="sky" x2="0" y2="1">
          <stop stopColor="#95a99c" />
          <stop offset="1" stopColor="#d9cba7" />
        </linearGradient>
        <linearGradient id="sea" x2="0.7" y2="1">
          <stop stopColor="#6b8f89" />
          <stop offset="1" stopColor="#243f3c" />
        </linearGradient>
        <linearGradient id="shade" x2="0" y2="1">
          <stop stopColor="#101a1500" />
          <stop offset="1" stopColor="#101a15dd" />
        </linearGradient>
      </defs>
      <path fill="url(#sky)" d="M0 0h700v480H0z" />
      <circle cx="475" cy="136" r="44" fill="#f5ddb0" opacity=".8" />
      <path fill="url(#sea)" d="M0 220q180-10 350 0t350 0v260H0z" />
      <path
        d="M0 258q140-20 300-4t400 0M50 280q200-10 400 0M390 243h180M430 253h120"
        fill="none"
        stroke="#c9d3b4"
        strokeWidth="2"
        opacity=".3"
      />
      <path fill="#46605a" d="m0 150 110 35 80 70 90 70-280 120z" />
      <path fill="#213d34" d="m0 242 100 38 85 63 120 20 110 117H0z" />
      <path fill="#192e26" d="m0 363 95-18 70 36 110 26 87 73H0z" />
      <path
        d="m158 302 40 43 83 34 91 101"
        stroke="#b9b08b"
        strokeWidth="6"
        fill="none"
        opacity=".6"
      />
      <path fill="url(#shade)" d="M0 0h700v480H0z" />
    </svg>
  );
}
