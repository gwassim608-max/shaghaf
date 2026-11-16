import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Award, Ban, Bot, CheckCircle2, Hash, Image as ImageIcon, ImagePlus, ShieldAlert, Smile, Trophy, Video as VideoIcon, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BAN_DURATIONS, extractHashtags, LIMITS, PAYMENT_METHODS, REGIONS, SERVERS } from '../lib/constants';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { uploadMediaFile } from '../lib/uploadMedia';
import { FULL_PAGE_COLLAGE_PHOTOS, getGameCoverImage, PAGE_WALLPAPER_PRESETS } from '../lib/serverThemes';
import type { BadgeRequest, Language, ServiceListing, TournamentCategory } from '../types';
import { MemePicker } from './MemePicker';
import { PWAInstallButton } from './PWAInstallButton';

export type ActiveModal =
  | null
  | { type: 'post'; defaultServer?: string }
  | { type: 'video'; defaultServer?: string; initialTitle?: string; initialUrl?: string }
  | { type: 'story' }
  | { type: 'clan' }
  | { type: 'arena'; kind: 'tournament' | 'lfg' | 'service' }
  | { type: 'order'; service: ServiceListing }
  | { type: 'editProfile' }
  | { type: 'settings' }
  | { type: 'wallpaper' }
  | { type: 'notifications' }
  | { type: 'badgeRequest' }
  | { type: 'botInbox' }
  | { type: 'terms' }
  | { type: 'userOptions'; uid: string; tag: string }
  | { type: 'ownerTools'; uid: string; tag: string };

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#12121D] border border-white/10 p-5 sm:p-6 space-y-4"
      >
        <div className="w-10 h-1.5 rounded-full bg-white/15 mx-auto sm:hidden" />
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[40px] min-w-[40px] rounded-xl text-slate-400 hover:text-white hover:bg-white/5 grid place-items-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Modals({
  modal,
  onClose,
  onSwitchModal,
}: {
  modal: ActiveModal;
  onClose: () => void;
  onSwitchModal?: (next: ActiveModal) => void;
}) {
  const {
    firebaseUser,
    profile,
    flagsMap,
    blockedMap,
    mutedMap,
    notifications,
    botMessages,
    isOwner,
    lang,
    t,
    liteMode,
    dndMode,
    pageBgPref,
    autoModPopup,
    adminWarnings,
    setLanguage,
    setLiteMode,
    setDndMode,
    setPageBgPref,
    updateProfileFields,
    checkTextModeration,
    moderateSubmission,
    addXp,
    showToast,
    toggleBlockUser,
    toggleMuteUser,
    logout,
    deleteAccount,
    dismissAutoModPopup,
    dismissAdminWarning,
    markBotMessageRead,
  } = useApp();

  const gameServers = SERVERS.filter((s) => s.id !== 'ALL' && s.id !== 'FOR_YOU');

  // Form states
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [postServer, setPostServer] = useState(gameServers[0].id);
  const [postContent, setPostContent] = useState('');
  const [postImageFile, setPostImageFile] = useState<File | null>(null);
  const [postImagePreview, setPostImagePreview] = useState<string | null>(null);
  const [postMemeUrl, setPostMemeUrl] = useState<string | null>(null);
  const [showPostMemes, setShowPostMemes] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postTopicMismatch, setPostTopicMismatch] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoSharedUrl, setVideoSharedUrl] = useState('');
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoTopicMismatch, setVideoTopicMismatch] = useState(false);

  const [storyText, setStoryText] = useState('');

  const [clanName, setClanName] = useState('');
  const [clanTag, setClanTag] = useState('');
  const [clanGame, setClanGame] = useState('Free Fire');
  const [clanRegion, setClanRegion] = useState('MENA');
  const [clanRank, setClanRank] = useState('');
  const [clanDesc, setClanDesc] = useState('');

  const [f1, setF1] = useState('');
  const [f2, setF2] = useState('');
  const [f3, setF3] = useState('');
  const [f4, setF4] = useState('');
  const [trnMode, setTrnMode] = useState<'solo' | 'squad'>('squad');
  const [trnCategory, setTrnCategory] = useState<TournamentCategory>('friendly');
  const [trnPhotoFile, setTrnPhotoFile] = useState<File | null>(null);
  const [trnPhotoPreview, setTrnPhotoPreview] = useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [badgeRefNote, setBadgeRefNote] = useState('');

  const [editBio, setEditBio] = useState(profile?.bio || '');
  const [editSkills, setEditSkills] = useState(profile?.skills || '');
  const [editGameId, setEditGameId] = useState(profile?.gameId || '');
  const [editRank, setEditRank] = useState(profile?.rank || '');
  const [editGames, setEditGames] = useState(profile?.favoriteGames || '');

  const [warnText, setWarnText] = useState('');
  const [showWarnBox, setShowWarnBox] = useState(false);
  const [ownerBanScope, setOwnerBanScope] = useState<'chat' | 'full'>('chat');
  const [ownerBanDuration, setOwnerBanDuration] = useState('1w');
  const [deleteStep, setDeleteStep] = useState(false);

  const uid = firebaseUser?.uid || '';

  const getSafeTag = () => {
    const raw = (profile?.gamerTag || firebaseUser?.displayName || 'Player').trim().slice(0, 16);
    return raw.length >= 3 ? raw : `${raw}___`.slice(0, 3);
  };

  useEffect(() => {
    if (modal?.type === 'editProfile' && profile) {
      setEditBio(profile.bio || '');
      setEditSkills(profile.skills || '');
      setEditGameId(profile.gameId || '');
      setEditRank(profile.rank || '');
      setEditGames(profile.favoriteGames || '');
    }
    if (modal?.type === 'post' || modal?.type === 'video') {
      const def = modal.defaultServer;
      if (def && gameServers.some((s) => s.id === def)) {
        setPostServer(def);
      } else if (isOwner && def === 'ALL') {
        setPostServer('ALL');
      } else {
        setPostServer(gameServers[0].id);
      }
      if (modal.type === 'video') {
        if (modal.initialTitle) setVideoTitle(modal.initialTitle);
        setVideoSharedUrl(modal.initialUrl || '');
        setVideoError(null);
        setVideoTopicMismatch(false);
      }
      if (modal.type === 'post') {
        setShowPostMemes(false);
        setPostError(null);
        setPostTopicMismatch(false);
      }
    }
  }, [modal, isOwner]);

  // Auto-mod popup takes precedence when active
  if (autoModPopup) {
    return (
      <Sheet title={t.autoModTitle} onClose={dismissAutoModPopup}>
        <p className="text-sm text-slate-200 leading-relaxed">
          {t.autoModBody}{' '}
          <strong className="text-amber-400 tabular-nums">{autoModPopup.remaining}/5</strong> (
          {autoModPopup.label})
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              dismissAutoModPopup();
              showToast(t.appealSent);
            }}
            className="w-full min-h-[46px] rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm"
          >
            {t.appealBtn}
          </button>
          <button
            type="button"
            onClick={dismissAutoModPopup}
            className="w-full min-h-[46px] rounded-xl bg-[#1A1A29] border border-white/10 text-slate-200 font-bold text-sm"
          >
            {t.close}
          </button>
        </div>
      </Sheet>
    );
  }

  // Admin warning popup when user has unread warnings
  if (adminWarnings.length > 0 && !modal) {
    const w = adminWarnings[0];
    return (
      <Sheet title={t.adminWarningTitle} onClose={() => dismissAdminWarning(w.id)}>
        <p className="text-sm text-slate-100 leading-relaxed whitespace-pre-line">{w.message}</p>
        <button
          type="button"
          onClick={() => dismissAdminWarning(w.id)}
          className="w-full min-h-[46px] rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm"
        >
          {t.close}
        </button>
      </Sheet>
    );
  }

  // Auto-display unread Shaghaf Bot message (welcome guide / warning / ban)
  const unreadBotMsg = !modal ? botMessages.find((m) => !m.read) : undefined;
  if (unreadBotMsg) {
    return (
      <Sheet title={unreadBotMsg.title} onClose={() => markBotMessageRead(unreadBotMsg.id)}>
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${
              unreadBotMsg.kind === 'ban'
                ? 'bg-rose-500/20 text-rose-400'
                : unreadBotMsg.kind === 'warning'
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-violet-500/20 text-violet-300'
            }`}
          >
            <Bot className="w-5 h-5" />
          </div>
          <p className="text-sm text-slate-100 leading-relaxed whitespace-pre-line">
            {unreadBotMsg.body}
          </p>
        </div>
        <button
          type="button"
          onClick={() => markBotMessageRead(unreadBotMsg.id)}
          className="w-full min-h-[46px] rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm"
        >
          {lang === 'ar' ? 'فهمت · متابعة' : 'Got it · Continue'}
        </button>
      </Sheet>
    );
  }

  if (!modal) return null;

  const clearPostImage = () => {
    if (postImagePreview) URL.revokeObjectURL(postImagePreview);
    setPostImageFile(null);
    setPostImagePreview(null);
    setPostMemeUrl(null);
  };

  const clearVideoFile = () => {
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoFile(null);
    setVideoPreview(null);
  };

  const handleSelectPostImage = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      showToast(t.fileTooLargeImage);
      return;
    }
    if (postImagePreview) URL.revokeObjectURL(postImagePreview);
    setPostMemeUrl(null);
    setShowPostMemes(false);
    setPostImageFile(file);
    setPostImagePreview(URL.createObjectURL(file));
  };

  const handleSelectVideoFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1024 * 1024 * 1024) {
      showToast(t.fileTooLargeVideo);
      return;
    }
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
    if (!videoTitle.trim()) {
      const cleanName = file.name.replace(/\.[^/.]+$/, '').slice(0, 140);
      if (cleanName) setVideoTitle(cleanName);
    }
  };

  const handleCreatePost = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!uid || !profile) {
      const msg =
        lang === 'ar'
          ? 'يرجى تسجيل الدخول وإكمال اسم اللاعب أولًا للنشر.'
          : 'Please sign in and complete your Gamer Tag first.';
      setPostError(msg);
      showToast(msg);
      return;
    }

    const text = postContent.trim();
    if (!text && !postImageFile && !postMemeUrl) {
      const msg =
        lang === 'ar'
          ? 'اكتب نصًا أو أرفق صورة قبل النشر.'
          : 'Write something or attach an image before publishing.';
      setPostError(msg);
      return;
    }

    setPostError(null);
    setPostTopicMismatch(false);

    if (!checkTextModeration(text, 'post')) {
      setPostError(
        lang === 'ar'
          ? 'تعذر النشر حاليًا بسبب قيود الحظر أو المحتوى غير اللائق.'
          : 'Post blocked by active moderation or ban rules.'
      );
      return;
    }

    const safeServer =
      postServer && postServer !== 'FOR_YOU' ? postServer : gameServers[0].id;

    setBusy(true);
    setUploadProgress(0);
    try {
      const verdict = await moderateSubmission(
        'post',
        text,
        postImageFile?.name || '',
        safeServer
      );
      if (!verdict.ok) {
        setPostError(
          verdict.reason ||
            (lang === 'ar' ? 'رفض بوت شغف هذا المنشور.' : 'Shaghaf Bot declined this post.')
        );
        setPostTopicMismatch(Boolean(verdict.isTopic));
        return;
      }

      let uploadedImageUrl: string | undefined = postMemeUrl || undefined;
      if (postImageFile) {
        uploadedImageUrl = await uploadMediaFile(postImageFile, 'image', setUploadProgress);
      }
      const tags = extractHashtags(text);
      const postPayload: Record<string, unknown> = {
        authorUid: uid,
        authorTag: getSafeTag(),
        server: safeServer,
        content: text.slice(0, LIMITS.POST_MAX),
        visibility: 'public',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (uploadedImageUrl) {
        postPayload.imageUrl = uploadedImageUrl.slice(0, 1000);
      }
      if (tags.length > 0) {
        postPayload.hashtags = tags;
      }
      await addDoc(collection(db, 'posts'), postPayload);
      setPostContent('');
      clearPostImage();
      setPostError(null);
      setPostTopicMismatch(false);
      void addXp(10);
      showToast(lang === 'ar' ? 'تم نشر منشورك!' : 'Post published!');
      onClose();
    } catch (err) {
      console.error('handleCreatePost failed:', err);
      const msg = err instanceof Error ? err.message : String(err || '');
      const lower = msg.toLowerCase();
      let friendly =
        lang === 'ar'
          ? 'تعذر نشر المنشور حاليًا، تحقق من الاتصال وحاول مرة أخرى.'
          : 'Could not publish post, please check connection and try again.';

      if (msg === 'FILE_TOO_LARGE_IMAGE') {
        friendly = t.fileTooLargeImage;
      } else if (msg.startsWith('UPLOAD_')) {
        friendly = t.uploadFailed;
      } else if (lower.includes('permission') || lower.includes('insufficient')) {
        friendly =
          lang === 'ar'
            ? 'رفضت قاعدة البيانات النشر (تأكد من توثيق الحساب أو عدم وجود حظر أو رابط غير صالح).'
            : 'Permission denied while publishing post. Check account verification or post format.';
      }
      setPostError(friendly);
      showToast(friendly);
    } finally {
      setBusy(false);
      setUploadProgress(0);
    }
  };

  const handleCreateVideo = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!uid || !profile) {
      const msg =
        lang === 'ar'
          ? 'يرجى تسجيل الدخول وإكمال اسم اللاعب أولًا.'
          : 'Please sign in first.';
      setVideoError(msg);
      return;
    }

    const title = videoTitle.trim();
    if (!title) {
      setVideoError(lang === 'ar' ? 'أدخل عنوانًا للفيديو.' : 'Enter a video title.');
      return;
    }

    setVideoError(null);
    setVideoTopicMismatch(false);

    if (!checkTextModeration(title, 'post')) {
      setVideoError(
        lang === 'ar'
          ? 'تعذر النشر حاليًا بسبب قيود الحظر أو المحتوى غير اللائق.'
          : 'Video blocked by active moderation or ban rules.'
      );
      return;
    }

    if (!videoFile && !videoSharedUrl) {
      const msg =
        lang === 'ar'
          ? 'اختر فيديو محفوظًا من جهازك للنشر'
          : 'Select a saved video from your device';
      setVideoError(msg);
      showToast(msg);
      return;
    }

    const safeServer =
      postServer && postServer !== 'FOR_YOU' ? postServer : gameServers[0].id;

    setBusy(true);
    setUploadProgress(0);
    try {
      const verdict = await moderateSubmission(
        'video',
        title,
        videoFile?.name || '',
        safeServer
      );
      if (!verdict.ok) {
        setVideoError(
          verdict.reason ||
            (lang === 'ar' ? 'رفض بوت شغف هذا الفيديو.' : 'Shaghaf Bot declined this video.')
        );
        setVideoTopicMismatch(Boolean(verdict.isTopic));
        return;
      }

      let finalUrl = videoSharedUrl;
      if (videoFile) {
        finalUrl = await uploadMediaFile(videoFile, 'video', setUploadProgress);
      }
      const tags = extractHashtags(title);
      const payload: Record<string, unknown> = {
        authorUid: uid,
        authorTag: getSafeTag(),
        server: safeServer,
        title: title.slice(0, 140),
        videoUrl: finalUrl.slice(0, 1000),
        visibility: 'public',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (tags.length > 0) {
        payload.hashtags = tags;
      }
      await addDoc(collection(db, 'videos'), payload);
      setVideoTitle('');
      setVideoSharedUrl('');
      clearVideoFile();
      setVideoError(null);
      setVideoTopicMismatch(false);
      void addXp(10);
      showToast(lang === 'ar' ? 'تم نشر الفيديو بنجاح!' : 'Video published!');
      onClose();
    } catch (err) {
      console.error('handleCreateVideo failed:', err);
      const msg = err instanceof Error ? err.message : '';
      let friendly = lang === 'ar' ? 'تعذر نشر الفيديو، حاول مرة أخرى' : 'Could not publish video';
      if (msg === 'FILE_TOO_LARGE_VIDEO') {
        friendly = t.fileTooLargeVideo;
      } else if (msg.startsWith('UPLOAD_')) {
        friendly = t.uploadFailed;
      }
      setVideoError(friendly);
      showToast(friendly);
    } finally {
      setBusy(false);
      setUploadProgress(0);
    }
  };

  const handleCreateStory = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile || busy) return;
    const text = storyText.trim();
    if (!text) return;
    if (!checkTextModeration(text)) return;
    setBusy(true);
    try {
      await addDoc(collection(db, 'stories'), {
        authorUid: uid,
        authorTag: getSafeTag(),
        text: text.slice(0, LIMITS.STORY_MAX),
        themeIndex: getSafeTag().length % 4,
        expiresAtMs: Date.now() + 86_400_000,
        visibility: 'public',
        createdAt: serverTimestamp(),
      });
      setStoryText('');
      void addXp(5);
      showToast(lang === 'ar' ? 'تم نشر الستوري!' : 'Story published!');
      onClose();
    } catch (err) {
      console.error('handleCreateStory failed:', err);
      showToast(lang === 'ar' ? 'تعذر نشر الستوري' : 'Could not publish story');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateClan = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile || busy) return;
    const name = clanName.trim();
    const tag = clanTag.trim().toUpperCase();
    if (name.length < LIMITS.CLAN_NAME_MIN || tag.length < LIMITS.CLAN_TAG_MIN) return;
    if (!checkTextModeration(`${name} ${tag} ${clanDesc}`)) return;
    const clanId = `clan_${Date.now()}_${uid.slice(0, 6)}`;
    setBusy(true);
    try {
      await setDoc(doc(db, 'clans', clanId), {
        name: name.slice(0, LIMITS.CLAN_NAME_MAX),
        tag: tag.slice(0, LIMITS.CLAN_TAG_MAX),
        game: clanGame,
        region: clanRegion,
        minRank: clanRank.trim().slice(0, 30),
        description: clanDesc.trim().slice(0, LIMITS.CLAN_DESC_MAX),
        ownerUid: uid,
        ownerTag: profile.gamerTag,
        isPublic: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'clans', clanId, 'members', uid), {
        uid,
        gamerTag: profile.gamerTag,
        role: 'owner',
        joinedAt: serverTimestamp(),
      });
      setClanName('');
      setClanTag('');
      setClanRank('');
      setClanDesc('');
      addXp(15);
      showToast(lang === 'ar' ? 'تم إنشاء الكلان بنجاح!' : 'Clan created!');
      onClose();
    } catch (err) {
      showToast(lang === 'ar' ? 'تعذر إنشاء الكلان' : 'Could not create clan');
      handleFirestoreError(err, OperationType.CREATE, `clans/${clanId}`);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateArena = async (e: FormEvent, kind: 'tournament' | 'lfg' | 'service') => {
    e.preventDefault();
    if (!profile || busy) return;
    if (!f1.trim() || !f2.trim()) return;
    if (!checkTextModeration(`${f1} ${f2} ${f3} ${f4}`)) return;

    setBusy(true);
    try {
      if (kind === 'tournament') {
        const cleanTitle = f1.trim().slice(0, 80);
        const cleanGame = f2.trim().slice(0, 40);
        let coverImage = getGameCoverImage(cleanGame);
        if (trnPhotoFile) {
          coverImage = await uploadMediaFile(trnPhotoFile, 'image', setUploadProgress);
        }
        await addDoc(collection(db, 'tournaments'), {
          creatorUid: uid,
          creatorTag: profile.gamerTag,
          title: cleanTitle.length >= 3 ? cleanTitle : `${cleanTitle} Cup`,
          game: cleanGame.length >= 2 ? cleanGame : 'Gaming',
          dateLabel: (f3.trim() || 'الجمعة 20:00').slice(0, 40),
          prize: f4.trim().slice(0, 40),
          mode: trnMode,
          category: trnCategory,
          imageUrl: coverImage.slice(0, 1000),
          visibility: 'public',
          createdAt: serverTimestamp(),
        });
        if (trnPhotoPreview) URL.revokeObjectURL(trnPhotoPreview);
        setTrnPhotoFile(null);
        setTrnPhotoPreview(null);
      } else if (kind === 'lfg') {
        await addDoc(collection(db, 'lfg'), {
          authorUid: uid,
          authorTag: profile.gamerTag,
          game: f1.trim().slice(0, 40),
          rank: f2.trim().slice(0, 40),
          schedule: (f3.trim() || 'MENA · Evening').slice(0, 60),
          visibility: 'public',
          createdAt: serverTimestamp(),
        });
      } else {
        const priceNum = Math.max(1, Math.min(10000, parseFloat(f2) || 5));
        await addDoc(collection(db, 'services'), {
          sellerUid: uid,
          sellerTag: profile.gamerTag,
          title: f1.trim().slice(0, LIMITS.SERVICE_TITLE_MAX),
          price: priceNum,
          description: f3.trim().slice(0, LIMITS.SERVICE_DESC_MAX),
          visibility: 'public',
          createdAt: serverTimestamp(),
        });
      }
      setF1('');
      setF2('');
      setF3('');
      setF4('');
      addXp(15);
      showToast(lang === 'ar' ? 'تم النشر بنجاح!' : 'Published!');
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'FILE_TOO_LARGE_IMAGE') {
        showToast(t.fileTooLargeImage);
      } else if (msg.startsWith('UPLOAD_')) {
        showToast(t.uploadFailed);
      } else {
        showToast(lang === 'ar' ? 'تعذر النشر' : 'Failed to publish');
        handleFirestoreError(err, OperationType.CREATE, kind);
      }
    } finally {
      setBusy(false);
      setUploadProgress(0);
    }
  };

  const handleConfirmOrder = async (srv: ServiceListing) => {
    if (!profile || busy) return;
    if (profile.isMinor) {
      showToast(t.minorMarketBlocked);
      return;
    }
    setBusy(true);
    try {
      await addDoc(collection(db, 'orders'), {
        buyerUid: uid,
        buyerTag: profile.gamerTag,
        sellerUid: srv.sellerUid,
        sellerTag: srv.sellerTag,
        serviceId: srv.id,
        serviceTitle: srv.title,
        price: srv.price,
        paymentMethod,
        status: 'escrow',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast(t.escrowStatus);
      onClose();
    } catch (err) {
      showToast(lang === 'ar' ? 'تعذر إتمام الطلب' : 'Order failed');
      handleFirestoreError(err, OperationType.CREATE, 'orders');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!checkTextModeration(`${editBio} ${editSkills} ${editGameId} ${editRank} ${editGames}`)) {
      return;
    }
    await updateProfileFields({
      bio: editBio.trim().slice(0, LIMITS.BIO_MAX),
      skills: editSkills.trim().slice(0, LIMITS.SKILLS_MAX),
      gameId: editGameId.trim().slice(0, 40),
      rank: editRank.trim().slice(0, 40),
      favoriteGames: editGames.trim().slice(0, LIMITS.GAMES_MAX),
    });
    showToast(t.profileSaved);
    onClose();
  };

  const handleSubmitBadgeRequest = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile || busy) return;
    setBusy(true);
    try {
      const reqRef = doc(db, 'badge_requests', uid);
      const existing = await getDoc(reqRef);
      if (existing.exists()) {
        const data = existing.data() as BadgeRequest;
        if (data.status === 'pending') {
          showToast(lang === 'ar' ? 'لديك طلب قيد المراجعة بالفعل' : 'Request already pending');
          onClose();
          return;
        }
        if (data.status === 'approved') {
          showToast(lang === 'ar' ? 'تمت الموافقة على شارتك بالفعل' : 'Already approved');
          onClose();
          return;
        }
        await deleteDoc(reqRef);
      }

      await setDoc(reqRef, {
        uid,
        gamerTag: profile.gamerTag,
        paymentMethod,
        referenceNote: badgeRefNote.trim().slice(0, 160),
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setBadgeRefNote('');
      showToast(
        lang === 'ar'
          ? 'تم إرسال طلب الشارة للمالك للمراجعة والتفعيل'
          : 'Badge request sent to Owner'
      );
      onClose();
    } catch (err) {
      showToast(lang === 'ar' ? 'تعذر إرسال طلب الشارة' : 'Could not send badge request');
      handleFirestoreError(err, OperationType.WRITE, `badge_requests/${uid}`);
    } finally {
      setBusy(false);
    }
  };

  const tsMs = (v: unknown) => {
    const obj = v as { toMillis?: () => number } | undefined;
    return typeof obj?.toMillis === 'function' ? obj.toMillis() : 0;
  };

  const sortedBotMessages = [...botMessages].sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));

  return (
    <>
      {modal.type === 'post' && (
        <Sheet title={t.newPost} onClose={onClose}>
          <form onSubmit={handleCreatePost} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t.serverPrefix}</label>
              <select
                value={postServer}
                onChange={(e) => {
                  setPostServer(e.target.value);
                  setPostError(null);
                  setPostTopicMismatch(false);
                }}
                className="w-full h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
              >
                {isOwner && (
                  <option value="ALL">
                    {lang === 'ar'
                      ? 'جميع السيرفرات (يرى المنشور كل المستخدمين)'
                      : 'All Servers (Owner Broadcast)'}
                  </option>
                )}
                {gameServers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.labels[lang]}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              rows={4}
              maxLength={LIMITS.POST_MAX}
              value={postContent}
              onChange={(e) => {
                setPostContent(e.target.value);
                if (postError) setPostError(null);
              }}
              placeholder={t.postPlaceholder}
              className="w-full p-3.5 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white placeholder:text-slate-500 resize-none focus:outline-none focus:border-violet-500"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  const tag = lang === 'ar' ? '#شغف' : '#Shaghaf';
                  if (!postContent.includes(tag)) {
                    setPostContent((prev) => `${prev ? `${prev.trim()} ` : ''}${tag} `);
                  }
                }}
                className="min-h-[34px] px-3 rounded-xl bg-violet-500/15 border border-violet-500/35 text-violet-300 text-xs font-bold flex items-center gap-1"
              >
                <Hash className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? '+ #شغف' : '+ #Shaghaf'}</span>
              </button>
              <span className="text-[11px] text-slate-400">{t.officialHashtagHint}</span>
            </div>

            {(postImagePreview || postMemeUrl) ? (
              <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black/40">
                <img
                  src={postImagePreview || postMemeUrl || ''}
                  alt="Preview"
                  className="w-full max-h-56 object-cover"
                />
                <button
                  type="button"
                  onClick={clearPostImage}
                  aria-label={t.removePhoto}
                  className="absolute top-2 end-2 min-h-[36px] min-w-[36px] rounded-full bg-black/75 text-white grid place-items-center hover:bg-rose-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="min-h-[46px] px-3 rounded-xl bg-[#1A1A29] hover:bg-white/10 border border-dashed border-white/20 text-xs font-bold text-slate-200 flex items-center justify-center gap-2 cursor-pointer">
                    <ImagePlus className="w-4 h-4 text-violet-400 shrink-0" />
                    <span className="truncate">{t.attachPhoto}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        handleSelectPostImage(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPostMemes((v) => !v)}
                    className={`min-h-[46px] px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 ${
                      showPostMemes
                        ? 'bg-violet-600/20 border-violet-500 text-violet-300'
                        : 'bg-[#1A1A29] border-white/10 text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    <Smile className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="truncate">{t.gifMemesBtn}</span>
                  </button>
                </div>

                {showPostMemes && (
                  <MemePicker
                    onSelect={(meme) => {
                      clearPostImage();
                      setPostMemeUrl(meme.url);
                      setShowPostMemes(false);
                    }}
                    onClose={() => setShowPostMemes(false)}
                  />
                )}
              </div>
            )}

            {busy && uploadProgress > 0 && (
              <div className="space-y-1">
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-violet-500 transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-400 text-center tabular-nums">
                  {t.uploadingMedia} {uploadProgress}%
                </div>
              </div>
            )}

            {postError && (
              <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 p-3 text-xs text-rose-200 space-y-2">
                <p className="font-bold leading-relaxed">{postError}</p>
                {postTopicMismatch && postServer !== 'Global' && (
                  <button
                    type="button"
                    onClick={() => {
                      setPostServer('Global');
                      setPostError(null);
                      setPostTopicMismatch(false);
                    }}
                    className="min-h-[34px] px-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs"
                  >
                    {t.switchGeneralServerBtn}
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || (!postContent.trim() && !postImageFile && !postMemeUrl)}
              className="w-full min-h-[48px] rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-sm"
            >
              {busy
                ? uploadProgress > 0
                  ? `${t.uploadingMedia} ${uploadProgress}%`
                  : lang === 'ar'
                  ? 'جاري النشر...'
                  : 'Publishing...'
                : t.publish}
            </button>
          </form>
        </Sheet>
      )}

      {modal.type === 'video' && (
        <Sheet title={t.postVideo} onClose={onClose}>
          <form onSubmit={handleCreateVideo} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t.serverPrefix}</label>
              <select
                value={postServer}
                onChange={(e) => setPostServer(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
              >
                {isOwner && (
                  <option value="ALL">
                    {lang === 'ar'
                      ? 'جميع السيرفرات (يرى الفيديو كل المستخدمين)'
                      : 'All Servers (Owner Broadcast)'}
                  </option>
                )}
                {gameServers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.labels[lang]}
                  </option>
                ))}
              </select>
            </div>

            <input
              type="text"
              required
              maxLength={140}
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              placeholder={t.videoTitlePlaceholder}
              className="w-full h-11 px-3.5 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  const tag = lang === 'ar' ? '#شغف' : '#Shaghaf';
                  if (!videoTitle.includes(tag)) {
                    setVideoTitle((prev) => `${prev ? `${prev.trim()} ` : ''}${tag}`.slice(0, 140));
                  }
                }}
                className="min-h-[34px] px-3 rounded-xl bg-violet-500/15 border border-violet-500/35 text-violet-300 text-xs font-bold flex items-center gap-1"
              >
                <Hash className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? '+ #شغف' : '+ #Shaghaf'}</span>
              </button>
              <span className="text-[11px] text-slate-400">{t.officialHashtagHint}</span>
            </div>

            {videoPreview && videoFile ? (
              <div className="space-y-2">
                <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black">
                  <video
                    src={videoPreview}
                    controls
                    playsInline
                    className="w-full max-h-56 object-contain"
                  />
                  <button
                    type="button"
                    onClick={clearVideoFile}
                    aria-label={t.removePhoto}
                    className="absolute top-2 end-2 min-h-[36px] min-w-[36px] rounded-full bg-black/75 text-white grid place-items-center hover:bg-rose-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {videoFile.name} · {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                </div>
              </div>
            ) : videoSharedUrl ? (
              <div className="p-3 rounded-xl bg-[#1A1A29] border border-violet-500/40 text-xs text-slate-200 flex items-center justify-between gap-2">
                <span className="truncate">{videoSharedUrl}</span>
                <button
                  type="button"
                  onClick={() => setVideoSharedUrl('')}
                  className="text-rose-400 font-bold shrink-0"
                >
                  ×
                </button>
              </div>
            ) : (
              <label className="w-full min-h-[92px] px-4 py-4 rounded-xl bg-[#1A1A29] hover:bg-white/10 border border-dashed border-violet-400/50 text-xs font-bold text-slate-200 flex flex-col items-center justify-center gap-2 cursor-pointer text-center">
                <VideoIcon className="w-6 h-6 text-violet-400" />
                <span>{t.chooseVideoFile}</span>
                <span className="text-[11px] font-normal text-slate-400">
                  {lang === 'ar'
                    ? 'انشر فيديو محفوظًا من جهازك (حتى 1 GB) أو استعمل «إعادة نشر» على الفيديوهات الموجودة'
                    : 'Upload a saved video from your device (up to 1 GB) or Repost an existing clip'}
                </span>
                <input
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  onChange={(e) => {
                    handleSelectVideoFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
            )}

            {busy && uploadProgress > 0 && (
              <div className="space-y-1">
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-violet-500 transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-400 text-center tabular-nums">
                  {t.uploadingMedia} {uploadProgress}%
                </div>
              </div>
            )}

            {videoError && (
              <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 p-3 text-xs text-rose-200 space-y-2">
                <p className="font-bold leading-relaxed">{videoError}</p>
                {videoTopicMismatch && postServer !== 'Global' && (
                  <button
                    type="button"
                    onClick={() => {
                      setPostServer('Global');
                      setVideoError(null);
                      setVideoTopicMismatch(false);
                    }}
                    className="min-h-[34px] px-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs"
                  >
                    {t.switchGeneralServerBtn}
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !videoTitle.trim() || (!videoFile && !videoSharedUrl)}
              className="w-full min-h-[48px] rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-sm"
            >
              {busy
                ? uploadProgress > 0
                  ? `${t.uploadingMedia} ${uploadProgress}%`
                  : lang === 'ar'
                  ? 'جاري النشر...'
                  : 'Publishing...'
                : t.publish}
            </button>
          </form>
        </Sheet>
      )}

      {modal.type === 'story' && (
        <Sheet title={t.storyTitle} onClose={onClose}>
          <form onSubmit={handleCreateStory} className="space-y-3">
            <textarea
              rows={3}
              required
              maxLength={LIMITS.STORY_MAX}
              value={storyText}
              onChange={(e) => setStoryText(e.target.value)}
              placeholder={t.storyPlaceholder}
              className="w-full p-3.5 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white placeholder:text-slate-500 resize-none focus:outline-none focus:border-violet-500"
            />
            <button
              type="submit"
              disabled={busy || !storyText.trim()}
              className="w-full min-h-[48px] rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-sm"
            >
              {busy ? '...' : t.publish}
            </button>
          </form>
        </Sheet>
      )}

      {modal.type === 'clan' && (
        <Sheet title={t.createClan} onClose={onClose}>
          <form onSubmit={handleCreateClan} className="space-y-3">
            <input
              type="text"
              required
              minLength={LIMITS.CLAN_NAME_MIN}
              maxLength={LIMITS.CLAN_NAME_MAX}
              value={clanName}
              onChange={(e) => setClanName(e.target.value)}
              placeholder={t.clanName}
              className="w-full h-11 px-3.5 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
            />
            <input
              type="text"
              required
              minLength={LIMITS.CLAN_TAG_MIN}
              maxLength={LIMITS.CLAN_TAG_MAX}
              value={clanTag}
              onChange={(e) => setClanTag(e.target.value)}
              placeholder={t.clanTag}
              className="w-full h-11 px-3.5 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={clanGame}
                onChange={(e) => setClanGame(e.target.value)}
                className="h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
              >
                {gameServers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.labels[lang]}
                  </option>
                ))}
              </select>
              <select
                value={clanRegion}
                onChange={(e) => setClanRegion(e.target.value)}
                className="h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
              >
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              maxLength={30}
              value={clanRank}
              onChange={(e) => setClanRank(e.target.value)}
              placeholder={t.clanRank}
              className="w-full h-11 px-3.5 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
            />
            <textarea
              rows={2}
              maxLength={LIMITS.CLAN_DESC_MAX}
              value={clanDesc}
              onChange={(e) => setClanDesc(e.target.value)}
              placeholder={t.clanDesc}
              className="w-full p-3 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white resize-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[48px] rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-sm"
            >
              {busy ? '...' : t.publish}
            </button>
          </form>
        </Sheet>
      )}

      {modal.type === 'arena' && (
        <Sheet
          title={
            modal.kind === 'tournament'
              ? t.createTournament
              : modal.kind === 'lfg'
              ? t.createLfg
              : t.createService
          }
          onClose={onClose}
        >
          <form onSubmit={(e) => handleCreateArena(e, modal.kind)} className="space-y-3">
            <input
              type="text"
              required
              value={f1}
              onChange={(e) => setF1(e.target.value)}
              placeholder={
                modal.kind === 'tournament'
                  ? 'اسم البطولة'
                  : modal.kind === 'lfg'
                  ? 'اللعبة (مثال: Free Fire)'
                  : 'عنوان الخدمة'
              }
              className="w-full h-11 px-3.5 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
            />
            <input
              type={modal.kind === 'service' ? 'number' : 'text'}
              required
              min={modal.kind === 'service' ? 1 : undefined}
              value={f2}
              onChange={(e) => setF2(e.target.value)}
              placeholder={
                modal.kind === 'tournament'
                  ? 'اللعبة'
                  : modal.kind === 'lfg'
                  ? 'الرتبة المطلوبة'
                  : 'السعر ($)'
              }
              className="w-full h-11 px-3.5 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
            />
            <input
              type="text"
              value={f3}
              onChange={(e) => setF3(e.target.value)}
              placeholder={
                modal.kind === 'tournament'
                  ? 'التاريخ والوقت'
                  : modal.kind === 'lfg'
                  ? 'المنطقة ووقت اللعب'
                  : 'وصف مختصر'
              }
              className="w-full h-11 px-3.5 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
            />
            {modal.kind === 'tournament' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={trnMode}
                    onChange={(e) => setTrnMode(e.target.value as 'solo' | 'squad')}
                    className="w-full h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
                  >
                    <option value="squad">{t.squadMode}</option>
                    <option value="solo">{t.soloMode}</option>
                  </select>
                  <select
                    aria-label={t.tournamentCategoryLabel}
                    value={trnCategory}
                    onChange={(e) => setTrnCategory(e.target.value as TournamentCategory)}
                    className="w-full h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
                  >
                    <option value="friendly">{t.tournamentCatFriendly}</option>
                    <option value="official">{t.tournamentCatOfficial}</option>
                    <option value="qualifiers">{t.tournamentCatQualifiers}</option>
                  </select>
                </div>
                <input
                  type="text"
                  value={f4}
                  onChange={(e) => setF4(e.target.value)}
                  placeholder="الجائزة (اختياري)"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
                />
                {trnPhotoPreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-white/10">
                    <img
                      src={trnPhotoPreview}
                      alt="Tournament cover"
                      className="w-full max-h-40 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (trnPhotoPreview) URL.revokeObjectURL(trnPhotoPreview);
                        setTrnPhotoFile(null);
                        setTrnPhotoPreview(null);
                      }}
                      className="absolute top-2 end-2 min-h-[34px] min-w-[34px] rounded-full bg-black/75 text-white grid place-items-center"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="min-h-[44px] px-3 rounded-xl bg-[#1A1A29] hover:bg-white/10 border border-dashed border-white/20 text-xs font-bold text-slate-200 flex items-center justify-center gap-2 cursor-pointer">
                    <ImagePlus className="w-4 h-4 text-violet-400 shrink-0" />
                    <span>{t.tournamentPhotoOptional}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        if (file.size > 10 * 1024 * 1024) {
                          showToast(t.fileTooLargeImage);
                          return;
                        }
                        if (trnPhotoPreview) URL.revokeObjectURL(trnPhotoPreview);
                        setTrnPhotoFile(file);
                        setTrnPhotoPreview(URL.createObjectURL(file));
                      }}
                    />
                  </label>
                )}
              </>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[48px] rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-sm"
            >
              {busy ? '...' : t.publish}
            </button>
          </form>
        </Sheet>
      )}

      {modal.type === 'order' && (
        <Sheet title={`${modal.service.title} · $${modal.service.price}`} onClose={onClose}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t.paymentMethod}</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">{t.escrowNote}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleConfirmOrder(modal.service)}
              className="w-full min-h-[48px] rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-sm"
            >
              {busy ? '...' : t.confirmPay}
            </button>
          </div>
        </Sheet>
      )}

      {modal.type === 'badgeRequest' && (
        <Sheet title={t.badgeSubBtn} onClose={onClose}>
          <form onSubmit={handleSubmitBadgeRequest} className="space-y-3">
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-200 leading-relaxed">
              {lang === 'ar'
                ? 'تمنحك هذه الشارة شهرة وانتشارًا سريعًا فقط: تظهر منشوراتك في مقدمة «الكل» و«لك» وتتضاعف نقاط XP لتشتهر أسرع (بدون أي صلاحيات إدارية). أرسل طريقة الدفع ورقم العملية ليقوم المالك بتفعيلها.'
                : 'This badge solely boosts your fame and reach: your posts appear higher in feeds with 2x XP gain. Submit your payment details for Owner activation.'}
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t.paymentMethod}</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              required
              maxLength={160}
              value={badgeRefNote}
              onChange={(e) => setBadgeRefNote(e.target.value)}
              placeholder={
                lang === 'ar'
                  ? 'رقم العملية / اسم المرسل / ملاحظة الدفع'
                  : 'Transaction ID or sender note'
              }
              className="w-full h-11 px-3.5 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
            />
            <button
              type="submit"
              disabled={busy || !badgeRefNote.trim()}
              className="w-full min-h-[48px] rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-sm flex items-center justify-center gap-2"
            >
              <Award className="w-4 h-4" />
              <span>{busy ? '...' : t.send}</span>
            </button>
          </form>
        </Sheet>
      )}

      {modal.type === 'botInbox' && (
        <Sheet title={lang === 'ar' ? 'بوت شغف 🤖' : 'Shaghaf Bot'} onClose={onClose}>
          {sortedBotMessages.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              {lang === 'ar' ? 'لا توجد رسائل من البوت حاليًا.' : 'No messages from Shaghaf Bot yet.'}
            </p>
          ) : (
            <div className="space-y-3">
              {sortedBotMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-2xl p-4 border space-y-2 ${
                    msg.kind === 'ban'
                      ? 'bg-rose-500/10 border-rose-500/30'
                      : msg.kind === 'warning'
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : msg.kind === 'tournament'
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-[#1A1A29] border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-white flex items-center gap-1.5">
                      {msg.kind === 'tournament' && <Trophy className="w-4 h-4 text-emerald-400 shrink-0" />}
                      <span>{msg.title}</span>
                    </span>
                    {!msg.read ? (
                      <button
                        type="button"
                        onClick={() => markBotMessageRead(msg.id)}
                        className="text-[11px] font-bold text-violet-300 hover:underline flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'تحديد كمقروء' : 'Mark read'}</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-500">
                        {lang === 'ar' ? 'مقروءة' : 'Read'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-line">
                    {msg.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Sheet>
      )}

      {modal.type === 'editProfile' && (
        <Sheet title={t.editProfile} onClose={onClose}>
          <form onSubmit={handleSaveProfile} className="space-y-3">
            <div className="rounded-xl bg-violet-500/10 border border-violet-500/30 p-3 text-xs text-violet-200 leading-relaxed">
              {lang === 'ar'
                ? 'أكمل معرّف اللعبة (Game ID) والرتبة (Rank) ليتمكن بوت شغف من تسجيلك تلقائيًا في البطولات وإرسال كود وآيدي الروم.'
                : 'Fill in your Game ID and Rank so Shaghaf Bot can auto-fill tournament registrations and send your Room ID & Password.'}
            </div>
            <input
              type="text"
              maxLength={LIMITS.BIO_MAX}
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              placeholder={t.bio || 'Bio'}
              className="w-full h-11 px-3.5 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
            />
            <input
              type="text"
              maxLength={LIMITS.SKILLS_MAX}
              value={editSkills}
              onChange={(e) => setEditSkills(e.target.value)}
              placeholder={t.skills}
              className="w-full h-11 px-3.5 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  {t.gameId} <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={editGameId}
                  onChange={(e) => setEditGameId(e.target.value)}
                  placeholder={lang === 'ar' ? 'مثال: 184920114' : 'e.g. 184920114'}
                  className="w-full h-11 px-3.5 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  {t.rank} <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={editRank}
                  onChange={(e) => setEditRank(e.target.value)}
                  placeholder={lang === 'ar' ? 'مثال: Heroic / Ace' : 'e.g. Diamond'}
                  className="w-full h-11 px-3.5 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
                />
              </div>
            </div>
            <input
              type="text"
              maxLength={LIMITS.GAMES_MAX}
              value={editGames}
              onChange={(e) => setEditGames(e.target.value)}
              placeholder={t.favGames}
              className="w-full h-11 px-3.5 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
            />
            <button
              type="submit"
              className="w-full min-h-[48px] rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm"
            >
              {t.save}
            </button>
          </form>
        </Sheet>
      )}

      {modal.type === 'userOptions' && (
        <Sheet title={`${t.userOptions}: ${modal.tag}`} onClose={onClose}>
          <div className="space-y-2">
            <button
              type="button"
              onClick={async () => {
                if (!profile) return;
                try {
                  await addDoc(collection(db, 'reports'), {
                    reporterUid: uid,
                    reporterTag: profile.gamerTag,
                    targetUid: modal.uid,
                    targetTag: modal.tag,
                    reason: 'Reported from user profile',
                    createdAt: serverTimestamp(),
                  });
                  showToast('تم إرسال البلاغ للمشرفين');
                  onClose();
                } catch (err) {
                  handleFirestoreError(err, OperationType.CREATE, 'reports');
                }
              }}
              className="w-full min-h-[46px] px-4 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300 font-bold text-sm flex items-center justify-center gap-2"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>{t.reportUser}</span>
            </button>

            <button
              type="button"
              onClick={() => toggleMuteUser(modal.uid)}
              className="w-full min-h-[46px] px-4 rounded-xl bg-[#1A1A29] border border-white/10 text-slate-200 font-bold text-sm"
            >
              {mutedMap[modal.uid] ? t.unmuteUser : t.muteUser}
            </button>

            <button
              type="button"
              onClick={() => toggleBlockUser(modal.uid)}
              className="w-full min-h-[46px] px-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 font-bold text-sm flex items-center justify-center gap-2"
            >
              <Ban className="w-4 h-4" />
              <span>{blockedMap[modal.uid] ? t.unblockUser : t.blockUser}</span>
            </button>
          </div>
        </Sheet>
      )}

      {modal.type === 'ownerTools' && (
        <Sheet title={`${t.ownerTools}: ${modal.tag}`} onClose={onClose}>
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={async () => {
                const cur = flagsMap[modal.uid];
                const hasBadge = cur && cur.badge !== 'none';
                try {
                  await setDoc(doc(db, 'flags', modal.uid), {
                    uid: modal.uid,
                    gamerTag: modal.tag,
                    badge: hasBadge ? 'none' : 'gift',
                    boost: !hasBadge,
                    ban: cur?.ban || false,
                    updatedAt: serverTimestamp(),
                  });
                  showToast(hasBadge ? t.revokeBadge : t.grantBadge);
                } catch (err) {
                  handleFirestoreError(err, OperationType.WRITE, `flags/${modal.uid}`);
                }
              }}
              className="w-full min-h-[46px] px-4 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 font-bold text-sm"
            >
              {flagsMap[modal.uid]?.badge && flagsMap[modal.uid]?.badge !== 'none'
                ? t.revokeBadge
                : t.grantBadge}
            </button>

            <button
              type="button"
              onClick={() => setShowWarnBox((v) => !v)}
              className="w-full min-h-[46px] px-4 rounded-xl bg-blue-500/15 border border-blue-500/40 text-blue-300 font-bold text-sm"
            >
              {t.sendWarning}
            </button>

            {showWarnBox && (
              <div className="space-y-2 pt-1">
                <textarea
                  rows={3}
                  maxLength={LIMITS.WARNING_MAX}
                  value={warnText}
                  onChange={(e) => setWarnText(e.target.value)}
                  placeholder="نص التنبيه..."
                  className="w-full p-3 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white resize-none"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!warnText.trim()) return;
                    try {
                      await addDoc(collection(db, 'warns', modal.uid, 'items'), {
                        targetUid: modal.uid,
                        message: warnText.trim().slice(0, LIMITS.WARNING_MAX),
                        createdAt: serverTimestamp(),
                      });
                      setWarnText('');
                      setShowWarnBox(false);
                      showToast(t.sendWarning);
                    } catch (err) {
                      handleFirestoreError(err, OperationType.CREATE, `warns/${modal.uid}/items`);
                    }
                  }}
                  className="w-full min-h-[44px] rounded-xl bg-violet-600 text-white font-bold text-xs"
                >
                  {t.send}
                </button>
              </div>
            )}

            <div className="pt-2 border-t border-white/[0.08] space-y-2">
              <div className="text-xs font-bold text-rose-300">
                {lang === 'ar' ? 'تحديد نوع ومدة العقوبة' : 'Restriction Scope & Duration'}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={ownerBanScope}
                  onChange={(e) => setOwnerBanScope(e.target.value as 'chat' | 'full')}
                  className="h-11 px-2.5 rounded-xl bg-[#1A1A29] border border-white/10 text-xs text-white"
                >
                  <option value="chat">
                    {lang === 'ar' ? 'منع الرسائل فقط (ينشر فيديوهات)' : 'Mute Chat Only'}
                  </option>
                  <option value="full">
                    {lang === 'ar' ? 'حظر كامل' : 'Full Ban'}
                  </option>
                </select>
                <select
                  value={ownerBanDuration}
                  onChange={(e) => setOwnerBanDuration(e.target.value)}
                  className="h-11 px-2.5 rounded-xl bg-[#1A1A29] border border-white/10 text-xs text-white"
                >
                  {BAN_DURATIONS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.labels[lang]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const cur = flagsMap[modal.uid];
                    const dur = BAN_DURATIONS.find((d) => d.id === ownerBanDuration) || BAN_DURATIONS[2];
                    const untilMs = dur.ms > 0 ? Date.now() + dur.ms : 0;
                    try {
                      if (ownerBanScope === 'chat') {
                        const chatEnd =
                          dur.ms > 0 ? Date.now() + dur.ms : Date.now() + 365 * 86_400_000;
                        await setDoc(doc(db, 'flags', modal.uid), {
                          uid: modal.uid,
                          gamerTag: modal.tag,
                          badge: cur?.badge || 'none',
                          boost: cur?.boost || false,
                          ban: false,
                          banUntilMs: 0,
                          chatBanUntilMs: chatEnd,
                          banReason: `منع الرسائل (${dur.labels.ar})`,
                          updatedAt: serverTimestamp(),
                        });
                        showToast(`تم منع ${modal.tag} من الرسائل (${dur.labels[lang]})`);
                      } else {
                        await setDoc(doc(db, 'flags', modal.uid), {
                          uid: modal.uid,
                          gamerTag: modal.tag,
                          badge: cur?.badge || 'none',
                          boost: cur?.boost || false,
                          ban: true,
                          banUntilMs: untilMs,
                          chatBanUntilMs: cur?.chatBanUntilMs || 0,
                          banReason: `حظر كامل (${dur.labels.ar})`,
                          updatedAt: serverTimestamp(),
                        });
                        showToast(`تم حظر ${modal.tag} (${dur.labels[lang]})`);
                      }
                    } catch (err) {
                      handleFirestoreError(err, OperationType.WRITE, `flags/${modal.uid}`);
                    }
                  }}
                  className="flex-1 min-h-[44px] px-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold text-xs"
                >
                  {lang === 'ar' ? 'تطبيق العقوبة' : 'Apply'}
                </button>
                {(flagsMap[modal.uid]?.ban ||
                  (flagsMap[modal.uid]?.chatBanUntilMs &&
                    (flagsMap[modal.uid]?.chatBanUntilMs || 0) > Date.now())) && (
                  <button
                    type="button"
                    onClick={async () => {
                      const cur = flagsMap[modal.uid];
                      try {
                        await setDoc(doc(db, 'flags', modal.uid), {
                          uid: modal.uid,
                          gamerTag: modal.tag,
                          badge: cur?.badge || 'none',
                          boost: cur?.boost || false,
                          ban: false,
                          banUntilMs: 0,
                          chatBanUntilMs: 0,
                          banReason: '',
                          updatedAt: serverTimestamp(),
                        });
                        showToast(t.unbanUser);
                      } catch (err) {
                        handleFirestoreError(err, OperationType.WRITE, `flags/${modal.uid}`);
                      }
                    }}
                    className="min-h-[44px] px-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs"
                  >
                    {t.unbanUser}
                  </button>
                )}
              </div>
            </div>
          </div>
        </Sheet>
      )}

      {modal.type === 'notifications' && (
        <Sheet title={t.notifications} onClose={onClose}>
          {notifications.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">{t.noNotifications}</p>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {notifications.map((n) => (
                <div key={n.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-200">{n.text}</span>
                  <span className="text-xs text-slate-500 tabular-nums shrink-0">
                    {new Date(n.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Sheet>
      )}

      {modal.type === 'settings' && (
        <Sheet title={t.settings} onClose={onClose}>
          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t.language}</label>
              <select
                value={lang}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="w-full h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-white"
              >
                <option value="ar">العربية</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">{t.liteMode}</label>
              <select
                value={liteMode ? '1' : '0'}
                onChange={(e) => setLiteMode(e.target.value === '1')}
                className="w-full h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-white"
              >
                <option value="0">{t.disabled}</option>
                <option value="1">{t.enabled}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">{t.pageWallpaperTitle}</label>
              <select
                value={pageBgPref}
                onChange={(e) => {
                  setPageBgPref(e.target.value);
                  showToast(t.settingsSaved);
                }}
                className="w-full h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-white"
              >
                {PAGE_WALLPAPER_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.labels[lang]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">{t.dndMode}</label>
              <select
                value={dndMode ? '1' : '0'}
                onChange={(e) => setDndMode(e.target.value === '1')}
                className="w-full h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-white"
              >
                <option value="0">{t.disabled}</option>
                <option value="1">{t.enabled}</option>
              </select>
            </div>

            {profile && (
              <>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">{t.accountPrivacy}</label>
                  <select
                    value={profile.isPrivate ? '1' : '0'}
                    onChange={(e) =>
                      updateProfileFields({ isPrivate: e.target.value === '1' }).then(() =>
                        showToast(t.settingsSaved)
                      )
                    }
                    className="w-full h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-white"
                  >
                    <option value="0">{t.publicAcc}</option>
                    <option value="1">{t.privateAcc}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">{t.minorProt}</label>
                  <select
                    value={profile.isMinor ? '1' : '0'}
                    onChange={(e) =>
                      updateProfileFields({ isMinor: e.target.value === '1' }).then(() =>
                        showToast(t.settingsSaved)
                      )
                    }
                    className="w-full h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-white"
                  >
                    <option value="1">{t.enabled}</option>
                    <option value="0">{t.disabled}</option>
                  </select>
                </div>
              </>
            )}

            <div className="pt-2 space-y-2">
              <PWAInstallButton alwaysShowGuide />

              {onSwitchModal && (
                <button
                  type="button"
                  onClick={() => onSwitchModal({ type: 'badgeRequest' })}
                  className="w-full min-h-[46px] rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 font-bold flex items-center justify-center gap-2"
                >
                  <Award className="w-4 h-4" />
                  <span>{t.badgeSubBtn}</span>
                </button>
              )}

              <button
                type="button"
                onClick={async () => {
                  await logout();
                  onClose();
                }}
                className="w-full min-h-[46px] rounded-xl bg-[#1A1A29] border border-white/10 text-slate-200 font-bold"
              >
                {t.logout}
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (!deleteStep) {
                    setDeleteStep(true);
                    setTimeout(() => setDeleteStep(false), 4000);
                    return;
                  }
                  await deleteAccount();
                  onClose();
                }}
                className="w-full min-h-[46px] rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-300 font-bold"
              >
                {deleteStep ? t.deleteConfirm : t.deleteAccount}
              </button>
            </div>
          </div>
        </Sheet>
      )}

      {modal.type === 'wallpaper' && (
        <Sheet title={t.pageWallpaperTitle} onClose={onClose}>
          <div className="space-y-3">
            <p className="text-xs text-slate-300 leading-relaxed">{t.pageWallpaperHint}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {PAGE_WALLPAPER_PRESETS.map((preset) => {
                const active = pageBgPref === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setPageBgPref(preset.id);
                      showToast(t.settingsSaved);
                      onClose();
                    }}
                    className={`group relative rounded-2xl overflow-hidden border text-start transition-all min-h-[104px] flex items-end ${
                      active
                        ? 'border-violet-400 ring-2 ring-violet-500/50'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    {preset.id === 'solid' ? (
                      <div className="absolute inset-0 bg-gradient-to-br from-[#12121D] to-[#09090F]" />
                    ) : preset.collageImages ? (
                      <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-0.5 bg-[#09090F]">
                        {FULL_PAGE_COLLAGE_PHOTOS.map((src, idx) => (
                          <img
                            key={src + idx}
                            src={src}
                            alt=""
                            className="w-full h-full object-cover opacity-85"
                          />
                        ))}
                      </div>
                    ) : (
                      <img
                        src={preset.imageUrl}
                        alt={preset.labels[lang]}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#09090F]/95 via-[#09090F]/45 to-transparent" />
                    <div className="relative z-10 w-full p-2.5 flex items-center justify-between gap-1.5">
                      <span className="text-[11px] font-bold text-white leading-tight truncate">
                        {preset.labels[lang]}
                      </span>
                      {active ? (
                        <CheckCircle2 className="w-4 h-4 text-violet-400 shrink-0" />
                      ) : (
                        <ImageIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </Sheet>
      )}

      {modal.type === 'terms' && (
        <Sheet title={t.termsPrivacy} onClose={onClose}>
          <div className="text-xs text-slate-300 leading-7 space-y-1.5">
            <p>• نجمع الاسم المستعار والمنشورات والرسائل لتشغيل الخدمة فقط.</p>
            <p>• لا نبيع بياناتك لأي طرف ثالث.</p>
            <p>• يُمنع الإساءة والتنمر والمحتوى المخالف والاحتيال.</p>
            <p>• لمن دون 18 سنة حماية إضافية، ولا يشترون من السوق.</p>
            <p>• يمكنك حذف حسابك وبياناتك في أي وقت من الإعدادات.</p>
          </div>
        </Sheet>
      )}
    </>
  );
}

