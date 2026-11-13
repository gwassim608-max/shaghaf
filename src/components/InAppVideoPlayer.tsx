import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Volume2, X } from 'lucide-react';

interface InAppVideoPlayerProps {
  coverUrl: string;
  videoUrl: string;
  lang: 'ar' | 'en' | 'fr';
  onClose: () => void;
}

function isHlsStream(url: string): boolean {
  return /\.m3u8(\?.*)?$/i.test(url);
}

export function InAppVideoPlayer({
  coverUrl,
  videoUrl,
  lang,
  onClose,
}: InAppVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [needsUnmute, setNeedsUnmute] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    setLoading(true);
    setFailed(false);
    setNeedsUnmute(false);

    let hls: Hls | null = null;
    let cancelled = false;

    const startPlayback = async () => {
      if (cancelled) return;
      video.muted = false;
      video.volume = 1;
      try {
        await video.play();
      } catch {
        if (cancelled) return;
        try {
          video.muted = true;
          await video.play();
          setNeedsUnmute(true);
        } catch {
          // User can click native play controls
        }
      }
    };

    if (isHlsStream(videoUrl)) {
      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
        });
        hls.loadSource(videoUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          void startPlayback();
        });
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (data.fatal) {
            setFailed(true);
            setLoading(false);
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = videoUrl;
        void startPlayback();
      } else {
        setFailed(true);
        setLoading(false);
      }
    } else {
      video.src = videoUrl;
      void startPlayback();
    }

    return () => {
      cancelled = true;
      if (hls) {
        hls.destroy();
      }
    };
  }, [videoUrl]);

  if (failed) {
    return (
      <div className="relative w-full h-full bg-black">
        <img
          src={coverUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-50"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center bg-black/55">
          <p className="text-xs font-bold text-slate-200">
            {lang === 'ar'
              ? 'تعذر تحميل الفيديو الرسمي حاليًا — تم الإبقاء على الصورة'
              : lang === 'fr'
              ? 'Vidéo officielle indisponible — affichage de l’image'
              : 'Official video unavailable right now'}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold"
          >
            {lang === 'ar' ? 'عرض الصورة' : lang === 'fr' ? 'Afficher l’image' : 'Show photo'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black">
      <video
        ref={videoRef}
        poster={coverUrl}
        controls
        playsInline
        preload="auto"
        onCanPlay={() => setLoading(false)}
        onPlaying={() => setLoading(false)}
        onError={() => {
          setFailed(true);
          setLoading(false);
        }}
        className="w-full h-full object-cover bg-black"
      />
      {loading && (
        <div className="pointer-events-none absolute inset-0 bg-black/50 flex items-center justify-center">
          <span className="px-3.5 py-2 rounded-xl bg-[#12121D]/90 border border-violet-500/40 text-xs font-bold text-white">
            {lang === 'ar' ? 'جاري تحميل الفيديو الرسمي...' : 'Loading official video...'}
          </span>
        </div>
      )}
      {needsUnmute && (
        <button
          type="button"
          onClick={() => {
            const vid = videoRef.current;
            if (vid) {
              vid.muted = false;
              vid.volume = 1;
              void vid.play().catch(() => {});
            }
            setNeedsUnmute(false);
          }}
          className="absolute top-2.5 start-2.5 min-h-[38px] px-3 rounded-xl bg-violet-600/95 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg"
        >
          <Volume2 className="w-4 h-4" />
          <span>{lang === 'ar' ? 'تفعيل الصوت' : 'Unmute'}</span>
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close video"
        className="absolute top-2 end-2 min-h-[36px] min-w-[36px] rounded-full bg-black/80 hover:bg-black text-white grid place-items-center"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
