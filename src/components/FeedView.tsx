import { useEffect, useState, type FormEvent } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  Hash,
  Heart,
  MessageSquare,
  MoreHorizontal,
  PlayCircle,
  Plus,
  Search,
  Send,
  Share2,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  extractHashtags,
  hasOfficialHashtag,
  LIMITS,
  SERVERS,
  STORY_GRADIENTS,
  TIER_META,
} from '../lib/constants';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { Post, PostComment, Story } from '../types';
import { BadgeIcon } from './BadgeIcon';
import { ServerHeroBanner } from './ServerHeroBanner';

interface FeedViewProps {
  selectedServer: string;
  onSelectServer: (server: string) => void;
  onOpenProfile: (uid: string, fallbackTag?: string) => void;
  onOpenPostModal: () => void;
  onOpenStoryModal: () => void;
  onOpenVideos: () => void;
  onOpenOwnerTools: (uid: string, tag: string) => void;
  onOpenUserOptions: (uid: string, tag: string) => void;
}

function PostCard({
  post,
  onOpenProfile,
  onOpenOwnerTools,
  onOpenUserOptions,
  onSelectHashtag,
}: {
  post: Post;
  onOpenProfile: (uid: string, fallbackTag?: string) => void;
  onOpenOwnerTools: (uid: string, tag: string) => void;
  onOpenUserOptions: (uid: string, tag: string) => void;
  onSelectHashtag: (tag: string) => void;
}) {
  const { firebaseUser, profile, flagsMap, friendsMap, blockedMap, isOwner, lang, t, showToast, checkTextModeration, addXp } =
    useApp();
  const [likes, setLikes] = useState<string[]>([]);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [zoomImage, setZoomImage] = useState(false);

  useEffect(() => {
    const unsubLikes = onSnapshot(
      collection(db, 'posts', post.id, 'likes'),
      (snap) => setLikes(snap.docs.map((d) => d.id)),
      (err) => handleFirestoreError(err, OperationType.LIST, `posts/${post.id}/likes`)
    );
    const unsubComments = onSnapshot(
      query(collection(db, 'posts', post.id, 'comments'), orderBy('createdAt', 'asc'), limit(40)),
      (snap) =>
        setComments(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PostComment, 'id'>) }))
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, `posts/${post.id}/comments`)
    );
    return () => {
      unsubLikes();
      unsubComments();
    };
  }, [post.id]);

  if (!firebaseUser) return null;
  const uid = firebaseUser.uid;
  const isLiked = likes.includes(uid);
  const authorFlag = flagsMap[post.authorUid];
  const isAuthorOwner = authorFlag?.badge === 'own';
  const isFeatured = Boolean(authorFlag?.boost || isAuthorOwner || authorFlag?.badge === 'sub');
  const friend = friendsMap[post.authorUid];
  const ringColor = friend ? TIER_META[friend.tier].ringColor : undefined;

  const toggleLike = async () => {
    const likePath = `posts/${post.id}/likes/${uid}`;
    try {
      if (isLiked) {
        await deleteDoc(doc(db, 'posts', post.id, 'likes', uid));
      } else {
        await setDoc(doc(db, 'posts', post.id, 'likes', uid), {
          uid,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, likePath);
    }
  };

  const handleCommentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const text = commentText.trim();
    if (!text) return;
    if (!checkTextModeration(text)) return;
    try {
      await addDoc(collection(db, 'posts', post.id, 'comments'), {
        authorUid: uid,
        authorTag: profile.gamerTag,
        text: text.slice(0, LIMITS.COMMENT_MAX),
        createdAt: serverTimestamp(),
      });
      setCommentText('');
      addXp(2);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `posts/${post.id}/comments`);
    }
  };

  const handleDeletePost = async () => {
    try {
      await deleteDoc(doc(db, 'posts', post.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `posts/${post.id}`);
    }
  };

  const handleShare = () => {
    const payload = `${post.authorTag}: ${post.content} — Shaghaf`;
    if (navigator.share) {
      navigator.share({ text: payload }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(payload).then(() => showToast(t.copiedPost));
    }
  };

  return (
    <article
      className={`rounded-2xl bg-[#12121D] border p-4 lg:p-5 transition-colors ${
        authorFlag?.badge === 'own'
          ? 'border-amber-500/40'
          : 'border-white/[0.08] hover:border-white/15'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onOpenProfile(post.authorUid, post.authorTag)}
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
            {post.authorTag.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 font-bold text-white text-sm lg:text-base">
              <span className="truncate">{post.authorTag}</span>
              <BadgeIcon kind={authorFlag?.badge} />
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
              <span>
                {t.serverPrefix}:{' '}
                {post.server === 'ALL'
                  ? lang === 'ar'
                    ? 'جميع السيرفرات'
                    : 'All Servers'
                  : post.server}
              </span>
              {isAuthorOwner ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-400 font-bold">
                    {lang === 'ar' ? 'منشور المالك' : lang === 'fr' ? 'Propriétaire' : 'Owner Post'}
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
              {authorFlag?.ban && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-rose-400 font-medium">{t.bannedLabel}</span>
                </>
              )}
            </span>
          </span>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          {isOwner && post.authorUid !== uid && (
            <button
              type="button"
              onClick={() => onOpenOwnerTools(post.authorUid, post.authorTag)}
              aria-label={t.ownerTools}
              className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-xs font-bold flex items-center gap-1 whitespace-nowrap"
            >
              <Shield className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.ownerTools}</span>
            </button>
          )}
          {(post.authorUid === uid || isOwner) && (
            <button
              type="button"
              onClick={handleDeletePost}
              aria-label="Delete post"
              className="min-h-[40px] min-w-[40px] grid place-items-center rounded-xl text-slate-400 hover:text-rose-400 hover:bg-white/5"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {post.authorUid !== uid && !isAuthorOwner && (
            <button
              type="button"
              onClick={() => onOpenUserOptions(post.authorUid, post.authorTag)}
              aria-label={t.userOptions}
              className="min-h-[40px] min-w-[40px] grid place-items-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {post.content && (
        <p className="mt-3 text-sm lg:text-[15px] text-slate-100 leading-relaxed whitespace-pre-line break-words">
          {post.content.split(/(#[\p{L}\p{N}_]{2,30})/gu).map((part, idx) => {
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
        </p>
      )}

      {post.imageUrl && (
        <button
          type="button"
          onClick={() => setZoomImage(true)}
          className="mt-3 block w-full overflow-hidden rounded-xl border border-white/10 bg-black/40"
        >
          <img
            src={post.imageUrl}
            alt={post.content || post.authorTag}
            loading="lazy"
            className="w-full max-h-[460px] object-cover"
          />
        </button>
      )}

      {zoomImage && post.imageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setZoomImage(false)}
        >
          <img
            src={post.imageUrl}
            alt={post.content || post.authorTag}
            className="max-w-full max-h-[88vh] rounded-2xl object-contain"
          />
        </div>
      )}

      {/* Action Row */}
      <div className="mt-3 pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLike}
            className={`min-h-[44px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-semibold transition-colors ${
              isLiked ? 'text-rose-400 bg-rose-500/10' : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
            <span className="tabular-nums">{likes.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowComments((v) => !v)}
            className={`min-h-[44px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-semibold transition-colors ${
              showComments
                ? 'text-blue-400 bg-blue-500/10'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="tabular-nums">{comments.length}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleShare}
          aria-label={t.share}
          className="min-h-[44px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5"
        >
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      {/* Comments Drawer */}
      {showComments && (
        <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-3">
          {comments
            .filter((c) => !blockedMap[c.authorUid])
            .map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onOpenProfile(c.authorUid, c.authorTag)}
                    className="font-bold text-slate-200 hover:underline me-1.5"
                  >
                    {c.authorTag}
                  </button>
                  <span className="text-slate-300 break-words">{c.text}</span>
                </div>
                {(c.authorUid === uid || isOwner) && (
                  <button
                    type="button"
                    onClick={() =>
                      deleteDoc(doc(db, 'posts', post.id, 'comments', c.id)).catch(() => {})
                    }
                    className="text-slate-500 hover:text-rose-400 px-1.5 py-1"
                    aria-label="Delete comment"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}

          <form onSubmit={handleCommentSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              maxLength={LIMITS.COMMENT_MAX}
              placeholder={t.writeComment}
              className="flex-1 h-11 px-3.5 rounded-xl bg-[#1A1A29] border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
            />
            <button
              type="submit"
              aria-label={t.send}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-violet-600 hover:bg-violet-500 text-white grid place-items-center shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </article>
  );
}

export function FeedView({
  selectedServer,
  onSelectServer,
  onOpenProfile,
  onOpenPostModal,
  onOpenStoryModal,
  onOpenVideos,
  onOpenOwnerTools,
  onOpenUserOptions,
}: FeedViewProps) {
  const { profile, flagsMap, blockedMap, lang, t, isOwner, enforceExistingModeration } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeHashtag, setActiveHashtag] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [activeStory, setActiveStory] = useState<Story | null>(null);

  const tsMs = (v: unknown) => {
    const obj = v as { toMillis?: () => number } | undefined;
    return typeof obj?.toMillis === 'function' ? obj.toMillis() : Date.now();
  };

  useEffect(() => {
    const unsubPosts = onSnapshot(
      query(collection(db, 'posts'), where('visibility', '==', 'public'), limit(200)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Post, 'id'>) }))
          .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
        setPosts(list);
        list.forEach((p) => {
          void enforceExistingModeration('post', p.id, p.authorUid, p.authorTag, p.content);
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'posts')
    );

    const unsubStories = onSnapshot(
      query(collection(db, 'stories'), where('visibility', '==', 'public'), limit(40)),
      (snap) => {
        const now = Date.now();
        setStories(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Story, 'id'>) }))
            .filter((s) => s.expiresAtMs > now)
            .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'stories')
    );

    return () => {
      unsubPosts();
      unsubStories();
    };
  }, [enforceExistingModeration]);

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
      ...posts.flatMap((p) =>
        p.hashtags && p.hashtags.length > 0 ? p.hashtags : extractHashtags(p.content || '')
      ),
    ])
  ).slice(0, 10);

  const visiblePosts = posts
    .filter((p) => {
      const authorFlag = flagsMap[p.authorUid];
      const authorIsOwner = authorFlag?.badge === 'own';
      const authorHasFame = Boolean(
        authorFlag?.boost || authorFlag?.badge === 'sub' || authorFlag?.badge === 'gift'
      );
      if (!authorIsOwner && blockedMap[p.authorUid]) return false;
      if (!authorIsOwner && authorFlag?.ban && (!authorFlag.banUntilMs || authorFlag.banUntilMs > Date.now()) && !isOwner) {
        return false;
      }

      const postTags = p.hashtags && p.hashtags.length > 0 ? p.hashtags : extractHashtags(p.content || '');
      const hasOfficialTag = hasOfficialHashtag(p.content || '', postTags);

      const matchesServer =
        selectedServer === 'ALL' ||
        (selectedServer === 'FOR_YOU'
          ? authorIsOwner ||
            authorHasFame ||
            hasOfficialTag ||
            myGames.length === 0 ||
            myGames.some((g) => p.server.toLowerCase().includes(g))
          : p.server === selectedServer || (authorIsOwner && p.server === 'ALL'));
      if (!matchesServer) return false;

      if (activeHashtag && !postTags.includes(activeHashtag.toLowerCase())) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        return `${p.content} ${p.authorTag} ${p.server} ${postTags.join(' ')}`.toLowerCase().includes(q);
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

      {/* Stories Strip */}
      <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-1">
        <button
          type="button"
          onClick={onOpenStoryModal}
          className="flex flex-col items-center gap-1.5 min-w-[68px] shrink-0 group"
        >
          <span className="w-14 h-14 rounded-full border border-dashed border-violet-400/70 bg-violet-500/10 grid place-items-center text-violet-300 group-hover:bg-violet-500/20 transition-colors">
            <Plus className="w-5 h-5" />
          </span>
          <span className="text-[11px] font-medium text-slate-300 whitespace-nowrap">
            {t.addStory}
          </span>
        </button>

        {stories
          .filter((s) => !blockedMap[s.authorUid])
          .map((story) => (
            <button
              key={story.id}
              type="button"
              onClick={() => setActiveStory(story)}
              className="flex flex-col items-center gap-1.5 min-w-[68px] shrink-0"
            >
              <span className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-violet-500 to-blue-500">
                <span className="w-full h-full rounded-full bg-[#12121D] border-2 border-[#09090F] grid place-items-center font-black text-sm text-white">
                  {story.authorTag.charAt(0).toUpperCase()}
                </span>
              </span>
              <span className="text-[11px] font-medium text-slate-200 max-w-[68px] truncate">
                {story.authorTag}
              </span>
            </button>
          ))}
      </div>

      {/* Search + Videos + Quick Post Bar */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
        <label className="flex-1 min-w-[180px] h-12 px-3.5 rounded-xl bg-[#12121D] border border-white/[0.08] flex items-center gap-2.5 focus-within:border-violet-500">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchPosts}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={onOpenVideos}
          className="h-12 px-4 rounded-xl bg-[#1A1A29] hover:bg-white/10 border border-violet-500/40 text-violet-300 text-sm font-bold flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <PlayCircle className="w-4 h-4" />
          <span>{t.watchVideos}</span>
        </button>
        <button
          type="button"
          onClick={onOpenPostModal}
          className="h-12 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t.newPost}</span>
        </button>
      </div>

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

      {/* Posts Stream */}
      {visiblePosts.length === 0 ? (
        <div className="rounded-2xl bg-[#12121D] border border-white/[0.08] p-10 text-center text-sm text-slate-400">
          {t.noPosts}
        </div>
      ) : (
        <div className="space-y-3">
          {visiblePosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onOpenProfile={onOpenProfile}
              onOpenOwnerTools={onOpenOwnerTools}
              onOpenUserOptions={onOpenUserOptions}
              onSelectHashtag={(tag) => setActiveHashtag(tag)}
            />
          ))}
        </div>
      )}

      {/* Fullscreen Story Viewer */}
      {activeStory && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setActiveStory(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md min-h-[420px] rounded-3xl p-8 flex flex-col justify-between text-center bg-gradient-to-br ${
              STORY_GRADIENTS[activeStory.themeIndex % STORY_GRADIENTS.length]
            }`}
          >
            <div className="text-sm font-bold text-white/90">{activeStory.authorTag}</div>
            <p className="text-2xl font-black text-white leading-snug">{activeStory.text}</p>
            <button
              type="button"
              onClick={() => setActiveStory(null)}
              className="min-h-[44px] px-6 rounded-xl bg-black/30 hover:bg-black/50 text-white text-sm font-bold mx-auto"
            >
              {t.close}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
