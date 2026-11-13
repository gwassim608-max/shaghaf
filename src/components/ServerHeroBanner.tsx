import { Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SERVERS } from '../lib/constants';
import { ALL_COLLAGE_IMAGES, getServerTheme } from '../lib/serverThemes';

interface ServerHeroBannerProps {
  selectedServer: string;
}

export function ServerHeroBanner({ selectedServer }: ServerHeroBannerProps) {
  const { lang } = useApp();
  const theme = getServerTheme(selectedServer);
  const serverInfo = SERVERS.find((s) => s.id === selectedServer);
  const title = serverInfo ? serverInfo.labels[lang] : selectedServer;
  const isAllMosaic = selectedServer === 'ALL' && Boolean(theme.collageImages?.length);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/[0.1] min-h-[128px] sm:min-h-[144px] flex items-end">
      {/* Backdrop Visual: Blended Mosaic for ALL, Specific Game Art for individual servers */}
      {isAllMosaic ? (
        <div className="absolute inset-0 grid grid-cols-4 grid-rows-2 gap-0.5 bg-[#09090F]">
          {ALL_COLLAGE_IMAGES.map((imgUrl, idx) => (
            <div key={imgUrl + idx} className="relative overflow-hidden">
              <img
                src={imgUrl}
                alt=""
                aria-hidden="true"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover opacity-85 scale-105"
              />
            </div>
          ))}
        </div>
      ) : (
        <img
          src={theme.imageUrl}
          alt={title}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Calibrated Contrast Scrim */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(9,9,15,0.28) 0%, rgba(9,9,15,0.72) 55%, rgba(9,9,15,0.94) 100%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-35 pointer-events-none"
        style={{
          background: `radial-gradient(circle at top right, ${theme.accentFrom}, transparent 60%)`,
        }}
      />

      {/* Foreground Title & Subtitle */}
      <div className="relative z-10 w-full p-4 sm:p-5 flex items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-[11px] font-bold text-violet-300 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>{serverInfo?.code || 'SHG'}</span>
          </div>
          <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight truncate">
            {title}
          </h2>
          <p className="text-xs sm:text-sm text-slate-200/90 leading-snug max-w-2xl">
            {theme.subtitle[lang]}
          </p>
        </div>
      </div>
    </div>
  );
}
