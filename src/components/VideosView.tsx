import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  addDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Hash,
  Heart,
  Maximize2,
  Play,
  Plus,
  Repeat2,
  Search,
  Share2,
  Shield,
  Trash2,
  Video as VideoIcon,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  extractHashtags,
  hasOfficialHashtag,
  SERVERS,
  TIER_META,
} from '../lib/constants';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { VideoPost } from '../types';
import { BadgeIcon } from './BadgeIcon';
import { ServerHeroBanner } from './ServerHeroBanner';

interface VideosViewProps {
  selectedServer: string;
  onSelectServer: (server: string) => void;
  onOpenProfile: (uid: string, fallbackTag?: string) => void;
  onOpenVideoModal: () => void;
  onOpenOwnerTools: (uid: string, tag: string) => void;
  onBackToFeed: () => void;
}

type ParsedMedia =
  | { kind: 'iframe'; embedUrl: string; safeHref: string }
  | { kind: 'video'; src: string; safeHref: string }
  | { kind: 'external'; safeHref: string };

function parseVideoMedia(rawUrl: string): ParsedMedia {
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('/uploads/')) {
    return { kind: 'video', src: trimmed, safeHref: trimmed };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return { kind: 'external', safeHref: 'https://' };
    }
    const host = parsed.hostname.toLowerCase();
    const safeHref = parsed.href;

    // YouTube / Shorts / Live
    if (
      host === 'youtu.be' ||
      host === 'youtube.com' ||
      host === 'www.youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtube-nocookie.com' ||
      host === 'www.youtube-nocookie.com'
    ) {
      let ytId = '';
      if (host === 'youtu.be') {
        ytId = parsed.pathname.split('/').filter(Boolean)[0] || '';
      } else if (parsed.pathname.startsWith('/watch')) {
        ytId = parsed.searchParams.get('v') || '';
      } else {
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'embed') {
          ytId = parts[1] || '';
        }
      }
      if (/^[a-zA-Z0-9_-]{6,20}$/.test(ytId)) {
        return {
          kind: 'iframe',
          embedUrl: `https://www.youtube-nocookie.com/embed/${ytId}`,
          safeHref,
        };
      }
    }

    // TikTok
    if (host === 'tiktok.com' || host === 'www.tiktok.com' || host === 'm.tiktok.com') {
      const match = parsed.pathname.match(/\/video\/(\d{6,25})/);
      if (match?.[1]) {
        return {
          kind: 'iframe',
          embedUrl: `https://www.tiktok.com/embed/v2/${match[1]}`,
          safeHref,
        };
      }
    }

    // Direct HTML5 Video files
    if (/\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(parsed.pathname)) {
      return { kind: 'video', src: safeHref, safeHref };
    }

    return { kind: 'external', safeHref };
  } catch {
    return { kind: 'external', safeHref: 'https://' };
  }
}

function VideoMediaFrame({
  video,
  theater = false,
}: {
  video: VideoPost;
  theater?: boolean;
}) {
  const { lang } = useApp();
  const [videoFailed, setVideoFailed] = useState(false);
  const media = parseVideoMedia(video.videoUrl);

  if (media.kind === 'iframe') {
    return (
      <div
        className={`w-full overflow-hidden rounded-xl bg-black border border-white/10 ${
          theater ? 'aspect-video max-h-[70vh]' : 'aspect-video'
        }`}
      >
        <iframe
          src={media.embedUrl}
          title={video.title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="w-full h-full border-0"
        />
      </div>
    );
  }

  if (media.kind === 'video' && !videoFailed) {
    return (
      <div
        className={`w-full overflow-hidden rounded-xl bg-black border border-white/10 ${
          theater ? 'aspect-video max-h-[70vh]' : 'aspect-video'
        }`}
      >
        <video
          src={media.src}
          controls
          playsInline
          preload="metadata"
          onError={() => setVideoFailed(true)}
          className="w-full h-full object-contain bg-black"
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#09090F] border border-white/10 p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-11 h-11 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-300 grid place-items-center shrink-0">
          <Play className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold text-white truncate">{video.title}</div>
          <div className="text-xs text-slate-400 truncate max-w-[260px] sm:max-w-sm">
            {media.safeHref}
          </div>
        </div>
      </div>
      <a
        href={media.safeHref}
        target="_blank"
        rel="noopener noreferrer"
        className="min-h-[44px] px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0"
      >
        <ExternalLink className="w-4 h-4" />
        <span>{lang === 'ar' ? 'مشاهدة الفيديو' : lang === 'fr' ? 'Regarder' : 'Watch Video'}</span>
      </a>
    </div>
  );
}

function VideoCard({
  video,
  onOpenProfile,
  onOpenOwnerTools,
  onExpand,
  onRepost,
  onSelectHashtag,
}: {
  video: VideoPost;
  onOpenProfile: (uid: string, fallbackTag?: string) => void;
  onOpenOwnerTools: (uid: string, tag: string) => void;
  onExpand: (video: VideoPost) => void;
  onRepost: (video: VideoPost) => void;
  onSelectHashtag: (tag: string) => void;
}) {
  const { firebaseUser, flagsMap, friendsMap, isOwner, lang, t, showToast } = useApp();
  const [likes, setLikes] = useState<string[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'videos', video.id, 'likes'),
      (snap) => setLikes(snap.docs.map((d) => d.id)),
      (err) => console.error('video likes listener error:', err)
    );
    return () => unsub();
  }, [video.id]);

  if (!firebaseUser) return null;
  const uid = firebaseUser.uid;
  const isLiked = likes.includes(uid);
  const authorFlag = flagsMap[video.authorUid];
  const isAuthorOwner = authorFlag?.badge === 'own';
  const isFeatured = Boolean(
    authorFlag?.boost || isAuthorOwner || authorFlag?.badge === 'sub' || authorFlag?.badge === 'gift'
  );
  const friend = friendsMap[video.authorUid];
  const ringColor = friend ? TIER_META[friend.tier].ringColor : undefined;

  const toggleLike = async () => {
    try {
      if (isLiked) {
        await deleteDoc(doc(db, 'videos', video.id, 'likes', uid));
      } else {
        await setDoc(doc(db, 'videos', video.id, 'likes', uid), {
          uid,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error('video toggleLike error:', err);
      showToast(lang === 'ar' ? 'تعذر تسجيل الإعجاب، حاول مجددًا' : 'Could not update like');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'videos', video.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `videos/${video.id}`);
    }
  };

  const handleShare = () => {
    const appOrigin = window.location.origin;
    const payload = `${video.title}\n${video.videoUrl}\n— ${t.brand}: ${appOrigin}`;
    if (navigator.share) {
      navigator
        .share({
          title: `${video.title} — ${t.brand}`,
          text: `${video.title}\n${video.videoUrl}`,
          url: appOrigin,
        })
        .catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(payload).then(() => showToast(t.copiedPost));
    }
  };

  return (
    <article
      className={`rounded-2xl bg-[#12121D] border p-4 lg:p-5 space-y-3 transition-colors ${
        isAuthorOwner ? 'border-amber-500/40' : 'border-white/[0.08] hover:border-white/15'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onOpenProfile(video.authorUid, video.authorTag)}
          className="flex items-center gap-3 text-start min-h-[44px]"
        >
          <span
            className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center font-black text-base text-white shrink-0"
            style={
              ringColor
                ? { boxShadow: `0 0 0 2px #12121D, 0 0 0 4px ${ringColor}` }
                : undefined
            }
          >
            {video.authorTag.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 font-bold text-white text-sm lg:text-base">
              <span className="truncate">{video.authorTag}</span>
              <BadgeIcon kind={authorFlag?.badge} />
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
              <span>
                {t.serverPrefix}:{' '}
                {video.server === 'ALL'
                  ? lang === 'ar'
                    ? 'جميع السيرفرات'
                    : 'All Servers'
                  : video.server}
              </span>
              {isAuthorOwner ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-400 font-bold">
                    {lang === 'ar' ? 'فيديو المالك' : lang === 'fr' ? 'Propriétaire' : 'Owner Video'}
                  </span>
                </>
              ) : (
                isFeatured && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-400 font-medium">{t.featured}</span>
                  </>
                )
              )}
            </span>
          </span>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          {isOwner && video.authorUid !== uid && (
            <button
              type="button"
              onClick={() => onOpenOwnerTools(video.authorUid, video.authorTag)}
              aria-label={t.ownerTools}
              className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-xs font-bold flex items-center gap-1 whitespace-nowrap"
            >
              <Shield className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.ownerTools}</span>
            </button>
          )}
          {(video.authorUid === uid || isOwner) && (
            <button
              type="button"
              onClick={handleDelete}
              aria-label="Delete video"
              className="min-h-[40px] min-w-[40px] grid place-items-center rounded-xl text-slate-400 hover:text-rose-400 hover:bg-white/5"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {video.repostFromTag && (
        <div className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
          <Repeat2 className="w-3.5 h-3.5 shrink-0" />
          <span>
            {t.repostedFrom}: {video.repostFromTag}
          </span>
        </div>
      )}

      <h3 className="text-sm lg:text-base font-bold text-slate-100 leading-snug break-words">
        {video.title.split(/(#[\p{L}\p{N}_]{2,30})/gu).map((part, idx) => {
          if (/^#[\p{L}\p{N}_]{2,30}$/u.test(part)) {
            const clean = part.slice(1).toLowerCase();
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectHashtag(clean)}
                className="text-violet-300 hover:text-violet-200 font-bold hover:underline inline"
              >
                {part}
              </button>
            );
          }
          return <span key={idx}>{part}</span>;
        })}
      </h3>

      <VideoMediaFrame video={video} />

      <div className="pt-1 border-t border-white/[0.06] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleLike}
            className={`min-h-[44px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-semibold transition-colors ${
              isLiked
                ? 'text-rose-400 bg-rose-500/10'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
            <span className="tabular-nums">{likes.length}</span>
          </button>

          <button
            type="button"
            onClick={() => onRepost(video)}
            className="min-h-[44px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10 transition-colors whitespace-nowrap"
          >
            <Repeat2 className="w-4 h-4" />
            <span>{t.repostVideo}</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onExpand(video)}
            aria-label={lang === 'ar' ? 'تكبير المشغل' : 'Theater mode'}
            className="min-h-[44px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <a
            href={video.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={lang === 'ar' ? 'فتح الرابط الأصلي' : 'Open original link'}
            className="min-h-[44px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            type="button"
            onClick={handleShare}
            aria-label={t.share}
            className="min-h-[44px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

export function VideosView({
  selectedServer,
  onSelectServer,
  onOpenProfile,
  onOpenVideoModal,
  onOpenOwnerTools,
  onBackToFeed,
}: VideosViewProps) {
  const {
    firebaseUser,
    profile,
    flagsMap,
    blockedMap,
    lang,
    t,
    isOwner,
    isBanned,
    showToast,
    addXp,
    enforceExistingModeration,
  } = useApp();
  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeHashtag, setActiveHashtag] = useState<string | null>(null);
  const [theaterVideo, setTheaterVideo] = useState<VideoPost | null>(null);
  const [repostingVideo, setRepostingVideo] = useState<VideoPost | null>(null);
  const [repostServer, setRepostServer] = useState('Free Fire');

  const tsMs = (v: unknown) => {
    const obj = v as { toMillis?: () => number } | undefined;
    return typeof obj?.toMillis === 'function' ? obj.toMillis() : Date.now();
  };

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'videos'), where('visibility', '==', 'public'), limit(120)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<VideoPost, 'id'>) }))
          .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
        setVideos(list);
        list.forEach((v) => {
          void enforceExistingModeration('video', v.id, v.authorUid, v.authorTag, v.title, v.server);
        });
      },
      (err) => console.error('videos listener error:', err)
    );
    return () => unsub();
  }, [enforceExistingModeration]);

  const handleConfirmRepost = async () => {
    if (!repostingVideo || !firebaseUser || !profile) return;
    if (isBanned) {
      showToast(t.bannedAlert);
      return;
    }
    const tags = extractHashtags(repostingVideo.title);
    try {
      const payload: Record<string, unknown> = {
        authorUid: firebaseUser.uid,
        authorTag: profile.gamerTag,
        server: repostServer,
        title: repostingVideo.title.slice(0, 140),
        videoUrl: repostingVideo.videoUrl,
        repostFromTag: repostingVideo.authorTag.slice(0, 16),
        visibility: 'public',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (tags.length > 0) payload.hashtags = tags;
      await addDoc(collection(db, 'videos'), payload);
      setRepostingVideo(null);
      addXp(5);
      showToast(t.repostDone);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'videos');
    }
  };

  const getScore = (authorUid: string) => {
    const fl = flagsMap[authorUid];
    if (!fl) return 0;
    if (fl.badge === 'own') return 3;
    if (fl.boost || fl.badge === 'sub' || fl.badge === 'gift') return 1;
    return 0;
  };

  const myGames = (profile?.favoriteGames || '')
    .toLowerCase()
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);

  const trendingHashtags = Array.from(
    new Set([
      'شغف',
      ...videos.flatMap((v) =>
        v.hashtags && v.hashtags.length > 0 ? v.hashtags : extractHashtags(v.title || '')
      ),
    ])
  ).slice(0, 10);

  const visibleVideos = videos
    .filter((v) => {
      const authorFlag = flagsMap[v.authorUid];
      const authorIsOwner = authorFlag?.badge === 'own';
      const authorHasFame = Boolean(
        authorFlag?.boost || authorFlag?.badge === 'sub' || authorFlag?.badge === 'gift'
      );
      if (!authorIsOwner && blockedMap[v.authorUid]) return false;
      if (!authorIsOwner && authorFlag?.ban && (!authorFlag.banUntilMs || authorFlag.banUntilMs > Date.now()) && !isOwner) {
        return false;
      }

      const vTags = v.hashtags && v.hashtags.length > 0 ? v.hashtags : extractHashtags(v.title || '');
      const hasOfficialTag = hasOfficialHashtag(v.title || '', vTags);

      const matchesServer =
        selectedServer === 'ALL' ||
        (selectedServer === 'FOR_YOU'
          ? authorIsOwner ||
            authorHasFame ||
            hasOfficialTag ||
            myGames.length === 0 ||
            myGames.some((g) => v.server.toLowerCase().includes(g))
          : v.server === selectedServer || (authorIsOwner && v.server === 'ALL'));
      if (!matchesServer) return false;

      if (activeHashtag && !vTags.includes(activeHashtag.toLowerCase())) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        return `${v.title} ${v.authorTag} ${v.server} ${vTags.join(' ')}`.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      const scoreDiff = getScore(b.authorUid) - getScore(a.authorUid);
      if (scoreDiff !== 0) return scoreDiff;
      return tsMs(b.createdAt) - tsMs(a.createdAt);
    });

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="rounded-2xl bg-[#12121D] border border-white/[0.08] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackToFeed}
            aria-label={t.navHome}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-[#1A1A29] border border-white/10 text-slate-200 hover:text-white grid place-items-center shrink-0"
          >
            {lang === 'ar' ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
          </button>
          <div className="min-w-0">
            <h1 className="text-base lg:text-lg font-black text-white flex items-center gap-2">
              <VideoIcon className="w-5 h-5 text-violet-400 shrink-0" />
              <span>{t.watchVideos}</span>
            </h1>
            <p className="text-xs text-slate-400 truncate">
              {lang === 'ar'
                ? 'شاهد لقطات اللاعبين والمالك أو شارك فيديوهاتك مباشرة'
                : lang === 'fr'
                ? 'Regardez les clips de la communauté et partagez les vôtres'
                : 'Watch community & Owner clips or publish your own video'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenVideoModal}
          className="min-h-[44px] px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t.postVideo}</span>
        </button>
      </div>

      {/* Server Filter Rail */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {SERVERS.map((srv) => {
          const active = selectedServer === srv.id;
          return (
            <button
              key={srv.id}
              type="button"
              onClick={() => onSelectServer(srv.id)}
              className={`min-h-[42px] px-3.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 border transition-colors ${
                active
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-[#12121D] border-white/[0.08] text-slate-300 hover:text-white hover:border-white/20'
              }`}
            >
              {srv.labels[lang]}
            </button>
          );
        })}
      </div>

      {/* Server-Specific Background Banner (or Blended ALL Mosaic) */}
      <ServerHeroBanner selectedServer={selectedServer} />

      {/* Search Bar */}
      <label className="h-12 px-3.5 rounded-xl bg-[#12121D] border border-white/[0.08] flex items-center gap-2.5 focus-within:border-violet-500">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            lang === 'ar'
              ? 'ابحث في الفيديوهات...'
              : lang === 'fr'
              ? 'Rechercher des vidéos...'
              : 'Search videos...'
          }
          className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
        />
      </label>

      {/* Hashtags Rail */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 shrink-0">
          <Hash className="w-3.5 h-3.5 text-violet-400" />
        </span>
        {trendingHashtags.map((tag) => {
          const isActive = activeHashtag === tag;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveHashtag(isActive ? null : tag)}
              className={`min-h-[34px] px-3 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 border transition-colors ${
                isActive
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-[#12121D] border-white/[0.08] text-violet-300 hover:border-violet-400/50'
              }`}
            >
              #{tag}
            </button>
          );
        })}
        {activeHashtag && (
          <button
            type="button"
            onClick={() => setActiveHashtag(null)}
            aria-label={t.close}
            className="min-h-[34px] px-2.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-300 text-xs font-bold flex items-center gap-1 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Video Feed */}
      {visibleVideos.length === 0 ? (
        <div className="rounded-2xl bg-[#12121D] border border-white/[0.08] p-10 text-center space-y-3">
          <p className="text-sm text-slate-400">{t.noVideos}</p>
          <button
            type="button"
            onClick={onOpenVideoModal}
            className="min-h-[44px] px-5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>{t.postVideo}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleVideos.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              onOpenProfile={onOpenProfile}
              onOpenOwnerTools={onOpenOwnerTools}
              onExpand={setTheaterVideo}
              onRepost={(vid) => {
                setRepostServer(
                  selectedServer !== 'ALL' && selectedServer !== 'FOR_YOU'
                    ? selectedServer
                    : vid.server !== 'ALL'
                    ? vid.server
                    : 'Free Fire'
                );
                setRepostingVideo(vid);
              }}
              onSelectHashtag={(tag) => setActiveHashtag(tag)}
            />
          ))}
        </div>
      )}

      {/* Repost Video Modal */}
      {repostingVideo && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setRepostingVideo(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[#12121D] border border-white/10 p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Repeat2 className="w-5 h-5 text-emerald-400" />
                <span>{t.repostVideo}</span>
              </h3>
              <button
                type="button"
                onClick={() => setRepostingVideo(null)}
                className="min-h-[36px] min-w-[36px] rounded-xl text-slate-400 hover:text-white grid place-items-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-300 truncate">{repostingVideo.title}</p>
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t.serverPrefix}</label>
              <select
                value={repostServer}
                onChange={(e) => setRepostServer(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
              >
                {SERVERS.filter((s) => s.id !== 'ALL' && s.id !== 'FOR_YOU').map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.labels[lang]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleConfirmRepost}
              className="w-full min-h-[46px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm"
            >
              {t.repostVideo}
            </button>
          </div>
        </div>
      )}

      {/* Theater Viewer Modal */}
      {theaterVideo && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setTheaterVideo(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl rounded-2xl bg-[#12121D] border border-white/10 p-4 sm:p-5 space-y-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-black text-base text-white truncate">{theaterVideo.title}</h3>
                <p className="text-xs text-slate-400">{theaterVideo.authorTag}</p>
              </div>
              <button
                type="button"
                onClick={() => setTheaterVideo(null)}
                aria-label={t.close}
                className="min-h-[40px] min-w-[40px] rounded-xl text-slate-400 hover:text-white hover:bg-white/5 grid place-items-center shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <VideoMediaFrame video={theaterVideo} theater />
          </div>
        </div>
      )}
    </div>
  );
}
