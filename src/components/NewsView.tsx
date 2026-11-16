import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, ExternalLink, Newspaper, Play, RefreshCw, Trophy } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { InAppVideoPlayer } from './InAppVideoPlayer';

interface NewsItem {
  id: string;
  game: string;
  category: 'tournament' | 'update';
  title: string;
  summary: string;
  imageUrl: string;
  videoUrl?: string;
  sourceName: string;
  sourceUrl: string;
  publishedAtMs: number;
  isLiveSteam?: boolean;
}

interface NewsViewProps {
  onOpenArena: () => void;
}

const NEWS_GAMES = [
  'ALL',
  'Free Fire',
  'PUBG Mobile',
  'THE FINALS',
  'Warzone',
  'Fortnite',
  'Valorant',
  'Apex Legends',
  'Call of Duty',
  'CS2',
  'League of Legends',
  'Rocket League',
  'Mobile Legends',
  'EA FC',
];

export function NewsView({ onOpenArena }: NewsViewProps) {
  const { lang, t, newsRefreshTick } = useApp();
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState<'all' | 'tournament' | 'update'>('all');
  const [gameFilter, setGameFilter] = useState<string>('ALL');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(Date.now());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [brokenImgIds, setBrokenImgIds] = useState<Record<string, boolean>>({});

  const loadNews = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    try {
      const res = await fetch(`/api/news${forceRefresh ? '?refresh=1' : ''}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        items?: NewsItem[];
        lastUpdatedAt?: number;
      };
      if (Array.isArray(data.items)) {
        setItems(data.items);
      }
      if (data.lastUpdatedAt) {
        setLastUpdatedAt(data.lastUpdatedAt);
      }
    } catch {
      // Keep current list on transient error
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadNews(false);
    const timer = setInterval(() => {
      void loadNews(false);
    }, 3 * 60_000);
    return () => clearInterval(timer);
  }, [loadNews, newsRefreshTick]);

  const formatTimeAgo = (ms: number) => {
    const diffMin = Math.max(1, Math.floor((Date.now() - ms) / 60_000));
    if (diffMin < 60) {
      return lang === 'ar' ? `منذ ${diffMin} د` : `${diffMin}m ago`;
    }
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) {
      return lang === 'ar' ? `منذ ${diffHrs} س` : `${diffHrs}h ago`;
    }
    const diffDays = Math.floor(diffHrs / 24);
    return lang === 'ar' ? `منذ ${diffDays} ي` : `${diffDays}d ago`;
  };

  const visibleItems = useMemo(() => {
    const filtered = items.filter((it) => {
      if (category !== 'all' && it.category !== category) return false;
      if (gameFilter !== 'ALL' && it.game.toLowerCase() !== gameFilter.toLowerCase()) return false;
      return true;
    });
    const usedUrls = new Set<string>();
    return filtered.map((it) => {
      const uniqueSvg = `/api/news-art/${encodeURIComponent(it.id)}.svg`;
      let cover = brokenImgIds[it.id] ? uniqueSvg : it.imageUrl || uniqueSvg;
      if (usedUrls.has(cover)) {
        cover = uniqueSvg;
      }
      usedUrls.add(cover);
      return { ...it, resolvedCover: cover };
    });
  }, [items, category, gameFilter, brokenImgIds]);

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="rounded-2xl bg-[#12121D] border border-violet-500/30 p-4 lg:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-base lg:text-xl font-black text-white flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-violet-400 shrink-0" />
            <span>{t.newsPageTitle}</span>
          </h1>
          <p className="text-xs text-slate-300 flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{t.newsBotSubtitle}</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-400 tabular-nums">
              {new Date(lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </p>
        </div>

        <button
          type="button"
          disabled={refreshing}
          onClick={() => void loadNews(true)}
          className="min-h-[44px] px-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>{t.newsRefresh}</span>
        </button>
      </div>

      {/* Category Switcher */}
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#12121D] border border-white/[0.08]">
        <button
          type="button"
          onClick={() => setCategory('all')}
          className={`min-h-[44px] px-3 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
            category === 'all' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:text-white'
          }`}
        >
          {t.newsAll}
        </button>
        <button
          type="button"
          onClick={() => setCategory('tournament')}
          className={`min-h-[44px] px-3 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
            category === 'tournament'
              ? 'bg-violet-600 text-white'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          {t.newsTournaments}
        </button>
        <button
          type="button"
          onClick={() => setCategory('update')}
          className={`min-h-[44px] px-3 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
            category === 'update' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:text-white'
          }`}
        >
          {t.newsUpdates}
        </button>
      </div>

      {/* Game Filter Rail */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {NEWS_GAMES.map((g) => {
          const active = gameFilter === g;
          return (
            <button
              key={g}
              type="button"
              onClick={() => setGameFilter(g)}
              className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 border transition-colors ${
                active
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-[#12121D] border-white/[0.08] text-slate-300 hover:text-white hover:border-white/20'
              }`}
            >
              {g === 'ALL' ? t.newsAll : g}
            </button>
          );
        })}
      </div>

      {/* News Cards Grid */}
      {loading && visibleItems.length === 0 ? (
        <div className="rounded-2xl bg-[#12121D] border border-white/[0.08] p-10 text-center text-sm text-slate-400">
          {t.newsRefresh}...
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-2xl bg-[#12121D] border border-white/[0.08] p-10 text-center text-sm text-slate-400">
          {t.noPosts}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleItems.map((item) => {
            const cover = item.resolvedCover;
            const hasOfficialVideo = Boolean(item.videoUrl);
            const isPlayingVideo = hasOfficialVideo && playingId === item.id;

            return (
              <article
                key={item.id}
                className="rounded-2xl bg-[#12121D] border border-white/[0.08] overflow-hidden flex flex-col justify-between hover:border-violet-500/40 transition-colors"
              >
                <div>
                  {/* Media Area (Official Video when available, otherwise official photo only) */}
                  <div className="relative aspect-video bg-[#0B0B13] overflow-hidden">
                    {isPlayingVideo && item.videoUrl ? (
                      <InAppVideoPlayer
                        coverUrl={cover}
                        videoUrl={item.videoUrl}
                        lang={lang}
                        onClose={() => setPlayingId(null)}
                      />
                    ) : (
                      <>
                        <img
                          src={cover}
                          alt={item.title}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenImgIds((prev) =>
                              prev[item.id] ? prev : { ...prev, [item.id]: true }
                            )
                          }
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#12121D] via-black/30 to-transparent" />
                        <div className="absolute bottom-2.5 inset-x-3.5 flex items-center justify-between gap-2 text-xs font-bold">
                          <span className="text-white drop-shadow">
                            {item.game} ·{' '}
                            <span
                              className={
                                item.category === 'tournament' ? 'text-amber-300' : 'text-sky-300'
                              }
                            >
                              {item.category === 'tournament' ? t.newsTournaments : t.newsUpdates}
                            </span>
                          </span>
                          {hasOfficialVideo && (
                            <button
                              type="button"
                              onClick={() => setPlayingId(item.id)}
                              className="min-h-[36px] px-3 rounded-lg bg-violet-600/95 hover:bg-violet-500 text-white text-[11px] font-bold flex items-center gap-1 whitespace-nowrap"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>{t.watchInAppVideo}</span>
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Body */}
                  <div className="p-4 space-y-2">
                    <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-1.5">
                      <span className="text-violet-300 font-semibold">{item.sourceName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{formatTimeAgo(item.publishedAtMs)}</span>
                    </div>

                    <h2 className="text-base font-black text-white leading-snug">{item.title}</h2>
                    <p className="text-xs text-slate-300 leading-relaxed">{item.summary}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="px-4 pb-4 pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[42px] px-3.5 rounded-xl bg-[#1A1A29] hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-100 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-violet-400" />
                    <span>{t.openOfficialSource}</span>
                  </a>

                  {item.category === 'tournament' && (
                    <button
                      type="button"
                      onClick={onOpenArena}
                      className="min-h-[42px] px-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Trophy className="w-3.5 h-3.5" />
                      <span>{t.tournamentsTab}</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
