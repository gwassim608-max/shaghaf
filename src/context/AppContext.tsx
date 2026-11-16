import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  deleteUser,
  type User,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  isOwnerEmail,
  OperationType,
} from '../lib/firebase';
import {
  detectContentViolation,
  detectServerTopicMismatch,
  formatRemainingTime,
  GENERAL_OPEN_SERVERS,
  getPenaltyDuration,
  hasProfanity,
  LIMITS,
  MAX_XP,
  toNameKey,
  USER_MAX_XP,
  type AutoModState,
} from '../lib/constants';
import { getCopy } from '../lib/i18n';
import type {
  AdminWarning,
  AppNotification,
  BotMessage,
  FriendLink,
  Language,
  UserFlag,
  UserPrivate,
  UserPublic,
} from '../types';

export type CallState = 'idle' | 'calling' | 'ringing' | 'connected';

interface PendingOffer {
  fromUid: string;
  fromTag: string;
  sdp: RTCSessionDescriptionInit;
}

interface AppContextValue {
  authReady: boolean;
  profileLoaded: boolean;
  firebaseUser: User | null;
  profile: UserPublic | null;
  privateData: UserPrivate | null;
  flagsMap: Record<string, UserFlag>;
  friendsMap: Record<string, FriendLink>;
  blockedMap: Record<string, boolean>;
  mutedMap: Record<string, boolean>;
  adminWarnings: AdminWarning[];
  botMessages: BotMessage[];
  notifications: AppNotification[];
  onlineUids: string[];
  playingMap: Record<string, string>;
  totalUsersCount: number;
  newsRefreshTick: number;
  callState: CallState;
  callPeer: { uid: string; tag: string } | null;
  callMuted: boolean;
  callStartedAt: number | null;
  lang: Language;
  t: Record<string, string>;
  isOwner: boolean;
  isBanned: boolean;
  isChatMuted: boolean;
  banUntilMs: number;
  chatBanUntilMs: number;
  liteMode: boolean;
  dndMode: boolean;
  pageBgPref: string;
  autoMod: AutoModState;
  autoModPopup: { label: string; remaining: number } | null;
  toastMsg: string | null;
  showToast: (msg: string) => void;
  setLanguage: (l: Language) => Promise<void>;
  setLiteMode: (v: boolean) => Promise<void>;
  setDndMode: (v: boolean) => Promise<void>;
  setPageBgPref: (pref: string) => void;
  setPlayingGame: (game: string) => Promise<void>;
  signInWithGoogle: (isMinor: boolean) => Promise<void>;
  registerGamerTag: (tag: string, isMinor: boolean) => Promise<boolean>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  updateProfileFields: (patch: Partial<UserPublic>) => Promise<void>;
  addXp: (amount: number) => Promise<void>;
  checkTextModeration: (text: string, scope?: 'chat' | 'post') => boolean;
  moderateSubmission: (
    kind: 'post' | 'video',
    text: string,
    fileName?: string,
    server?: string
  ) => Promise<{ ok: boolean; reason?: string; isTopic?: boolean }>;
  enforceExistingModeration: (
    kind: 'post' | 'video',
    docId: string,
    authorUid: string,
    authorTag: string,
    text: string,
    server?: string
  ) => Promise<void>;
  dismissAutoModPopup: () => void;
  dismissAdminWarning: (warnId: string) => Promise<void>;
  markBotMessageRead: (msgId: string) => Promise<void>;
  toggleBlockUser: (uid: string) => void;
  toggleMuteUser: (uid: string) => void;
  pushNotification: (text: string, fromUid?: string) => void;
  markNotificationsRead: () => void;
  startVoiceCall: (targetUid: string, targetTag: string) => Promise<void>;
  acceptVoiceCall: () => Promise<void>;
  rejectVoiceCall: () => void;
  endVoiceCall: () => void;
  toggleCallMute: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, val: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // ignore storage quota
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserPublic | null>(null);
  const [privateData, setPrivateData] = useState<UserPrivate | null>(null);
  const [flagsMap, setFlagsMap] = useState<Record<string, UserFlag>>({});
  const [friendsMap, setFriendsMap] = useState<Record<string, FriendLink>>({});
  const [adminWarnings, setAdminWarnings] = useState<AdminWarning[]>([]);
  const [botMessages, setBotMessages] = useState<BotMessage[]>([]);

  const [onlineUids, setOnlineUids] = useState<string[]>([]);
  const [playingMap, setPlayingMap] = useState<Record<string, string>>({});
  const [totalUsersCount, setTotalUsersCount] = useState(0);
  const [newsRefreshTick, setNewsRefreshTick] = useState(0);

  const [callState, setCallState] = useState<CallState>('idle');
  const [callPeer, setCallPeer] = useState<{ uid: string; tag: string } | null>(null);
  const [callMuted, setCallMuted] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);

  const [lang, setLangState] = useState<Language>(() => {
    const saved = loadJson<Language | null>('sg_lang', null);
    if (saved === 'ar' || saved === 'en' || saved === 'fr') return saved;
    return 'ar';
  });
  const [liteMode, setLiteModeState] = useState<boolean>(() => loadJson('sg_lite', false));
  const [dndMode, setDndModeState] = useState<boolean>(() => loadJson('sg_dnd', false));
  const [pageBgPref, setPageBgPrefState] = useState<string>(() =>
    loadJson<string>('sg_page_bg', 'auto')
  );
  const [blockedMap, setBlockedMap] = useState<Record<string, boolean>>(() =>
    loadJson('sg_blk', {})
  );
  const [mutedMap, setMutedMap] = useState<Record<string, boolean>>(() =>
    loadJson('sg_mute', {})
  );
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    loadJson('sg_notifs', [])
  );
  const [autoMod, setAutoMod] = useState<AutoModState>(() =>
    loadJson('sg_mod', { count: 0, untilMs: 0 })
  );
  const [autoModPopup, setAutoModPopup] = useState<{ label: string; remaining: number } | null>(
    null
  );
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingOfferRef = useRef<PendingOffer | null>(null);
  const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const callPeerRef = useRef<{ uid: string; tag: string } | null>(null);
  const moderatedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    callPeerRef.current = callPeer;
  }, [callPeer]);

  const t = getCopy(lang);

  const isOwner = Boolean(
    firebaseUser &&
      isOwnerEmail(firebaseUser.email) &&
      firebaseUser.emailVerified === true
  );

  const myFlag = firebaseUser ? flagsMap[firebaseUser.uid] : undefined;
  const nowMs = Date.now();
  const flagBanUntil = myFlag?.banUntilMs || 0;
  const flagBanActive = Boolean(myFlag?.ban) && (flagBanUntil === 0 || flagBanUntil > nowMs);
  const banUntilMs = !isOwner && flagBanActive ? flagBanUntil : 0;
  const chatBanUntilMs =
    !isOwner && myFlag?.chatBanUntilMs && myFlag.chatBanUntilMs > nowMs
      ? myFlag.chatBanUntilMs
      : 0;

  const explicitlyUnbanned = Boolean(myFlag && myFlag.ban === false && myFlag.banReason === '');
  const isBanned = !isOwner && (flagBanActive || (!explicitlyUnbanned && autoMod.count >= 5));
  const isChatMuted =
    !isOwner &&
    (isBanned ||
      chatBanUntilMs > nowMs ||
      (!explicitlyUnbanned && autoMod.untilMs > nowMs));

  const setPageBgPref = useCallback((pref: string) => {
    const clean = (pref || 'auto').trim().slice(0, 40);
    setPageBgPrefState(clean);
    saveJson('sg_page_bg', clean);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const timer = setTimeout(() => setToastMsg(null), 3500);
    return () => clearTimeout(timer);
  }, [toastMsg]);

  // Sync HTML lang, dir, and lite mode
  useEffect(() => {
    const el = document.documentElement;
    el.lang = lang;
    el.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = 'شغف | gwassim_097';
    saveJson('sg_lang', lang);
  }, [lang]);

  useEffect(() => {
    document.documentElement.classList.toggle('lite', liteMode);
    saveJson('sg_lite', liteMode);
  }, [liteMode]);

  useEffect(() => {
    saveJson('sg_dnd', dndMode);
  }, [dndMode]);

  const cleanupCall = useCallback(() => {
    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
      } catch {
        // ignore
      }
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((tr) => tr.stop());
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    pendingOfferRef.current = null;
    iceQueueRef.current = [];
    setCallState('idle');
    setCallPeer(null);
    setCallMuted(false);
    setCallStartedAt(null);
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setProfile(null);
        setProfileLoaded(true);
        setPrivateData(null);
        setFriendsMap({});
        setAdminWarnings([]);
        cleanupCall();
      } else {
        setProfileLoaded(false);
      }
    });
    return () => unsub();
  }, [cleanupCall]);

  // Firestore listeners once authenticated
  useEffect(() => {
    if (!firebaseUser) return;
    const uid = firebaseUser.uid;

    const unsubProfile = onSnapshot(
      doc(db, 'users_public', uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserPublic);
        } else {
          setProfile(null);
        }
        setProfileLoaded(true);
      },
      (err) => {
        setProfileLoaded(true);
        handleFirestoreError(err, OperationType.GET, `users_public/${uid}`);
      }
    );

    const unsubTotalUsers = onSnapshot(
      collection(db, 'users_public'),
      (snap) => {
        setTotalUsersCount(snap.size);
        const fsPlaying: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as UserPublic;
          if (data.playingGame) fsPlaying[data.uid] = data.playingGame;
        });
        setPlayingMap((prev) => ({ ...fsPlaying, ...prev }));
      },
      () => {
        // Ignore count listener error if restricted
      }
    );

    const unsubPrivate = onSnapshot(
      doc(db, 'users_private', uid),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data() as UserPrivate;
          setPrivateData(d);
          if (d.language) setLangState(d.language);
          setLiteModeState(Boolean(d.liteMode));
          setDndModeState(Boolean(d.dndMode));
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users_private/${uid}`)
    );

    const unsubFlags = onSnapshot(
      collection(db, 'flags'),
      (snap) => {
        const next: Record<string, UserFlag> = {};
        snap.docs.forEach((d) => {
          next[d.id] = d.data() as UserFlag;
        });
        setFlagsMap(next);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'flags')
    );

    const unsubFriends = onSnapshot(
      query(collection(db, 'users_public', uid, 'friends'), where('ownerUid', '==', uid)),
      (snap) => {
        const next: Record<string, FriendLink> = {};
        snap.docs.forEach((d) => {
          next[d.id] = d.data() as FriendLink;
        });
        setFriendsMap(next);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users_public/${uid}/friends`)
    );

    const unsubWarns = onSnapshot(
      query(collection(db, 'warns', uid, 'items'), where('targetUid', '==', uid)),
      (snap) => {
        setAdminWarnings(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AdminWarning, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `warns/${uid}/items`)
    );

    const unsubBotMsgs = onSnapshot(
      query(collection(db, 'bot_messages', uid, 'items'), where('targetUid', '==', uid)),
      (snap) => {
        setBotMessages(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BotMessage, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `bot_messages/${uid}/items`)
    );

    return () => {
      unsubProfile();
      unsubTotalUsers();
      unsubPrivate();
      unsubFlags();
      unsubFriends();
      unsubWarns();
      unsubBotMsgs();
    };
  }, [firebaseUser]);

  // Real-Time WebSocket for Presence, Playing Game Status, and WebRTC Call Signaling
  useEffect(() => {
    if (!firebaseUser || !profile) return;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1500;

    const connect = async () => {
      if (closed) return;
      try {
        const token = await firebaseUser.getIdToken();
        if (closed) return;
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
        wsRef.current = ws;

        ws.onopen = () => {
          retryDelay = 1500;
          ws.send(
            JSON.stringify({
              type: 'auth',
              token,
              gamerTag: profile.gamerTag,
              playingGame: profile.playingGame || '',
            })
          );
        };

        ws.onmessage = async (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
            const type = String(msg.type || '');

            if (type === 'presence:state') {
              const uids = Array.isArray(msg.onlineUids)
                ? (msg.onlineUids as string[])
                : [];
              const pMap = (msg.playingMap || {}) as Record<string, string>;
              setOnlineUids(uids);
              setPlayingMap((prev) => ({ ...prev, ...pMap }));
              return;
            }

            if (type === 'call:offer') {
              const fromUid = String(msg.fromUid || '');
              const fromTag = String(msg.fromTag || 'Player');
              const sdp = msg.sdp as RTCSessionDescriptionInit;
              if (!fromUid || !sdp) return;
              if (pcRef.current) {
                ws.send(JSON.stringify({ type: 'call:reject', toUid: fromUid }));
                return;
              }
              pendingOfferRef.current = { fromUid, fromTag, sdp };
              setCallPeer({ uid: fromUid, tag: fromTag });
              setCallState('ringing');
              return;
            }

            if (type === 'call:answer') {
              const sdp = msg.sdp as RTCSessionDescriptionInit;
              if (pcRef.current && sdp) {
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
                for (const c of iceQueueRef.current) {
                  await pcRef.current.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
                }
                iceQueueRef.current = [];
                setCallState('connected');
                setCallStartedAt(Date.now());
              }
              return;
            }

            if (type === 'call:ice') {
              const cand = msg.candidate as RTCIceCandidateInit | undefined;
              if (!cand) return;
              if (pcRef.current && pcRef.current.remoteDescription) {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
              } else {
                iceQueueRef.current.push(cand);
              }
              return;
            }

            if (type === 'call:reject' || type === 'call:end') {
              cleanupCall();
              showToast(t.endCall);
              return;
            }

            if (type === 'news:update') {
              setNewsRefreshTick((n) => n + 1);
              return;
            }

            if (type === 'call:unavailable') {
              cleanupCall();
              showToast(t.callUnavailable);
            }
          } catch {
            // ignore malformed frame
          }
        };

        ws.onclose = () => {
          if (wsRef.current === ws) wsRef.current = null;
          if (!closed) {
            retryTimer = setTimeout(connect, retryDelay);
            retryDelay = Math.min(10000, retryDelay * 1.5);
          }
        };
      } catch {
        if (!closed) {
          retryTimer = setTimeout(connect, retryDelay);
        }
      }
    };

    void connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [firebaseUser, profile?.gamerTag, cleanupCall, showToast, t.callUnavailable, t.endCall]);

  // Ensure founder flag & Level 999 / MAX XP when owner signs in
  useEffect(() => {
    if (!firebaseUser || !profile) return;
    if (isOwner) {
      const flagRef = doc(db, 'flags', firebaseUser.uid);
      getDoc(flagRef)
        .then((snap) => {
          if (!snap.exists() || snap.data().badge !== 'own') {
            return setDoc(flagRef, {
              uid: firebaseUser.uid,
              gamerTag: profile.gamerTag,
              badge: 'own',
              boost: true,
              ban: false,
              banUntilMs: 0,
              chatBanUntilMs: 0,
              updatedAt: serverTimestamp(),
            });
          }
        })
        .catch(() => {});

      if ((profile.xp || 0) < MAX_XP) {
        updateDoc(doc(db, 'users_public', firebaseUser.uid), {
          xp: MAX_XP,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    }
  }, [firebaseUser, profile, isOwner]);

  const signInWithGoogle = async (isMinorSelected: boolean) => {
    saveJson('sg_pending_minor', isMinorSelected);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        showToast(lang === 'ar' ? 'تم إغلاق نافذة تسجيل الدخول' : 'Sign-in window closed');
      } else if (code === 'auth/popup-blocked') {
        showToast(
          lang === 'ar'
            ? 'المتصفح حظر نافذة Google. اسمح بالنوافذ المنبثقة أو افتح التطبيق في تبويب مستقل.'
            : 'Popup blocked. Allow popups or open the app in a new tab.'
        );
      } else {
        showToast(
          lang === 'ar'
            ? `تعذر تسجيل الدخول (${code || 'خطأ غير معروف'})`
            : `Google sign-in failed (${code || 'unknown'})`
        );
      }
    }
  };

  const seedStarterRooms = async (uid: string, tag: string) => {
    const starterRooms = [
      {
        id: 'room_general',
        name: 'الساحة العامة',
        tag: 'SHG',
        game: 'Global',
        region: 'MENA',
        description: 'الغرفة الرئيسية لتجمع اللاعبين وصناع المحتوى في شغف.',
      },
      {
        id: 'room_free_fire',
        name: 'كلانات Free Fire',
        tag: 'FF',
        game: 'Free Fire',
        region: 'MENA',
        description: 'تنظيم سكوادات وبطولات فري فاير.',
      },
      {
        id: 'room_pubg',
        name: 'تحديات PUBG Mobile',
        tag: 'PUBG',
        game: 'PUBG Mobile',
        region: 'MENA',
        description: 'رومات باتل رويال وتجميع الفرق التنافسية.',
      },
      {
        id: 'room_valorant',
        name: 'سيرفر Valorant',
        tag: 'VAL',
        game: 'Valorant',
        region: 'MENA',
        description: 'تشكيل فرق الرانكد والبطولات.',
      },
    ];
    await Promise.allSettled(
      starterRooms.map(async (rm) => {
        const cRef = doc(db, 'clans', rm.id);
        const snap = await getDoc(cRef);
        if (!snap.exists()) {
          await setDoc(cRef, {
            name: rm.name,
            tag: rm.tag,
            game: rm.game,
            region: rm.region,
            minRank: '',
            description: rm.description,
            ownerUid: uid,
            ownerTag: tag,
            isPublic: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await setDoc(doc(db, 'clans', rm.id, 'members', uid), {
            uid,
            gamerTag: tag,
            role: 'owner',
            joinedAt: serverTimestamp(),
          });
        }
      })
    );
  };

  const registerGamerTag = async (rawTag: string, isMinor: boolean): Promise<boolean> => {
    if (!firebaseUser) return false;
    const tag = rawTag.trim();
    if (
      tag.length < LIMITS.GAMER_TAG_MIN ||
      tag.length > LIMITS.GAMER_TAG_MAX ||
      !/^[\p{L}\p{N}_ -]+$/u.test(tag)
    ) {
      showToast(t.tagInvalid);
      return false;
    }
    if (hasProfanity(tag) || tag === 'مؤسس شغف') {
      showToast(t.tagBanned);
      return false;
    }

    const uid = firebaseUser.uid;
    const key = toNameKey(tag);
    try {
      await runTransaction(db, async (tx) => {
        const nameRef = doc(db, 'names', key);
        const existingName = await tx.get(nameRef);
        if (existingName.exists()) {
          throw new Error('TAKEN');
        }
        tx.set(nameRef, {
          uid,
          displayName: tag,
          createdAt: serverTimestamp(),
        });
        tx.set(doc(db, 'users_public', uid), {
          uid,
          gamerTag: tag,
          bio: '',
          skills: '',
          gameId: '',
          rank: '',
          favoriteGames: 'Free Fire, PUBG Mobile',
          playingGame: '',
          isPrivate: false,
          isMinor,
          xp: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        tx.set(doc(db, 'users_private', uid), {
          uid,
          email: firebaseUser.email || '',
          language: lang,
          liteMode,
          dndMode,
          updatedAt: serverTimestamp(),
        });
      });

      void seedStarterRooms(uid, tag);
      void addDoc(collection(db, 'bot_messages', uid, 'items'), {
        targetUid: uid,
        title:
          lang === 'ar'
            ? 'أهلًا بك في شغف! رسالة من بوت شغف'
            : 'Welcome to Shaghaf! Message from Shaghaf Bot',
        body:
          lang === 'ar'
            ? `مرحبًا ${tag}! إليك طريقة استعمال التطبيق:\n1. الرئيسية: تصفّح السيرفرات، استعمل #شغف لإظهار منشورك للجميع، وشارك الفيديوهات المحفوظة.\n2. الكلانات والدردشة: انضم للكلانات أو اتصل صوتيًا بأصدقائك أثناء اللعب.\n3. البطولات والسوق: سجّل في بطولات البوت الرسمية أو اطلب المهارات بأمان.\n4. قواعد البوت: يمنع البوت المنشورات والفيديوهات المسيئة أو الإباحية ويحذفها فورًا مع عقوبة خفيفة.`
            : `Welcome ${tag}! Explore game servers, use #Shaghaf, upload saved clips or repost videos, join voice calls with friends while gaming, and register in official bot tournaments.`,
        kind: 'welcome',
        read: false,
        createdAt: serverTimestamp(),
      }).catch(() => {});
      return true;
    } catch (err: unknown) {
      if ((err as Error).message === 'TAKEN') {
        showToast(t.tagTaken);
        return false;
      }
      showToast(lang === 'ar' ? 'تعذر حفظ الحساب، حاول مرة أخرى' : 'Could not save account');
      console.error(err);
      return false;
    }
  };

  const updateProfileFields = async (patch: Partial<UserPublic>) => {
    if (!firebaseUser) return;
    const path = `users_public/${firebaseUser.uid}`;
    try {
      await updateDoc(doc(db, 'users_public', firebaseUser.uid), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const setPlayingGame = async (game: string) => {
    if (!firebaseUser) return;
    const clean = game.trim().slice(0, 40);
    setPlayingMap((prev) => ({ ...prev, [firebaseUser.uid]: clean }));
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'presence:game', playingGame: clean }));
    }
    try {
      await updateDoc(doc(db, 'users_public', firebaseUser.uid), {
        playingGame: clean,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // non-critical presence sync
    }
  };

  const addXp = async (amount: number) => {
    if (!firebaseUser || !profile) return;
    if (isOwner) {
      if ((profile.xp || 0) >= MAX_XP) return;
      try {
        await updateDoc(doc(db, 'users_public', firebaseUser.uid), {
          xp: MAX_XP,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // non-critical XP update
      }
      return;
    }
    const myFl = flagsMap[firebaseUser.uid];
    const hasFameBadge = Boolean(myFl?.boost || myFl?.badge === 'sub' || myFl?.badge === 'gift');
    const gained = hasFameBadge ? amount * 2 : amount;
    const nextXp = Math.min(USER_MAX_XP, Math.max(0, (profile.xp || 0) + gained));
    try {
      await updateDoc(doc(db, 'users_public', firebaseUser.uid), {
        xp: nextXp,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // non-critical XP update
    }
  };

  const setLanguage = async (next: Language) => {
    setLangState(next);
    if (firebaseUser && privateData) {
      try {
        await updateDoc(doc(db, 'users_private', firebaseUser.uid), {
          language: next,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users_private/${firebaseUser.uid}`);
      }
    }
  };

  const setLiteMode = async (v: boolean) => {
    setLiteModeState(v);
    if (firebaseUser && privateData) {
      try {
        await updateDoc(doc(db, 'users_private', firebaseUser.uid), {
          liteMode: v,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users_private/${firebaseUser.uid}`);
      }
    }
  };

  const setDndMode = async (v: boolean) => {
    setDndModeState(v);
    if (firebaseUser && privateData) {
      try {
        await updateDoc(doc(db, 'users_private', firebaseUser.uid), {
          dndMode: v,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users_private/${firebaseUser.uid}`);
      }
    }
  };

  const checkTextModeration = (text: string, scope: 'chat' | 'post' = 'chat'): boolean => {
    if (isOwner) return true;

    if (isBanned) {
      const rem = banUntilMs > 0 ? ` (${formatRemainingTime(banUntilMs, lang)})` : '';
      showToast(`${t.bannedAlert}${rem}`);
      return false;
    }

    if (scope !== 'post' && chatBanUntilMs > Date.now()) {
      showToast(`${t.chatMutedAlert} ${formatRemainingTime(chatBanUntilMs, lang)}`);
      return false;
    }

    const remMs = autoMod.untilMs - Date.now();
    if (remMs > 0) {
      showToast(`${t.mutedAlert} ${formatRemainingTime(autoMod.untilMs, lang)}`);
      return false;
    }

    const check = detectContentViolation(text, lang);
    if (check.violated) {
      const nextCount = autoMod.count + 1;
      const { ms, label } = getPenaltyDuration(nextCount, lang);
      const nextState: AutoModState = {
        count: nextCount,
        untilMs: ms > 0 ? Date.now() + ms : 0,
      };
      setAutoMod(nextState);
      saveJson('sg_mod', nextState);
      setAutoModPopup({ label, remaining: Math.max(0, 5 - nextCount) });

      if (firebaseUser && profile) {
        const isAutoBanned = nextCount >= 5;
        void addDoc(collection(db, 'bot_messages', firebaseUser.uid, 'items'), {
          targetUid: firebaseUser.uid,
          title: isAutoBanned ? 'حظر تلقائي من بوت شغف' : 'تنبيه من بوت شغف',
          body: isAutoBanned
            ? `تم حظرك تلقائيًا بسبب: ${check.reason}`
            : `رصد بوت شغف مخالفة (${check.reason}). العقوبة الحالية: ${label}. المتبقي قبل الحظر النهائي: ${Math.max(0, 5 - nextCount)} فرص.`,
          kind: isAutoBanned ? 'ban' : 'warning',
          read: false,
          createdAt: serverTimestamp(),
        }).catch(() => {});

        void addDoc(collection(db, 'reports'), {
          reporterUid: firebaseUser.uid,
          reporterTag: profile.gamerTag,
          targetUid: firebaseUser.uid,
          targetTag: profile.gamerTag,
          reason: `[AUTO-BOT] مخالفة رقم ${nextCount}: ${check.reason} (${label})`,
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }
      return false;
    }
    return true;
  };

  // Auto-Moderation Bot for Posts, Photos, and Videos (profanity/NSFW + off-topic server guard)
  const moderateSubmission = async (
    kind: 'post' | 'video',
    text: string,
    fileName = '',
    server = 'ALL'
  ): Promise<{ ok: boolean; reason?: string; isTopic?: boolean }> => {
    if (isBanned && !isOwner) {
      const rem = banUntilMs > 0 ? ` (${formatRemainingTime(banUntilMs, lang)})` : '';
      const msg = `${t.bannedAlert}${rem}`;
      showToast(msg);
      return { ok: false, reason: msg };
    }

    const combined = `${text} ${fileName}`;
    let violationReason = '';
    let isTopicViolation = false;

    if (!isOwner) {
      const check = detectContentViolation(combined, lang);
      if (check.violated) {
        violationReason = check.reason;
      }
    }

    if (!violationReason && server && !GENERAL_OPEN_SERVERS.has(server)) {
      const topicCheck = detectServerTopicMismatch(server, text, lang);
      if (topicCheck.violated) {
        violationReason = topicCheck.reason;
        isTopicViolation = true;
      }
    }

    // Also consult backend 24/7 AI/rules moderation bot
    if (!violationReason && firebaseUser) {
      try {
        const token = await firebaseUser.getIdToken();
        const modRes = await fetch('/api/moderate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ text, server, kind, lang }),
          signal: AbortSignal.timeout(4000),
        });
        if (modRes.ok) {
          const modData = (await modRes.json()) as {
            violated?: boolean;
            kind?: string;
            reason?: string;
          };
          if (modData.violated && modData.reason) {
            violationReason = modData.reason;
            isTopicViolation = modData.kind === 'off_topic';
          }
        }
      } catch {
        // Keep client-side checks if server moderation is temporarily unreachable
      }
    }

    if (!violationReason) return { ok: true };

    // For Owner: block off-topic posts cleanly with bot reason without XP penalty/ban
    if (isOwner) {
      const msg =
        lang === 'ar'
          ? `🤖 بوت شغف: ${violationReason}`
          : `🤖 Shaghaf Bot: ${violationReason}`;
      showToast(msg);
      return { ok: false, reason: msg, isTopic: isTopicViolation };
    }

    if (!isTopicViolation) {
      const nextCount = autoMod.count + 1;
      const shortCooldownMs = Math.max(15 * 60_000, getPenaltyDuration(nextCount, lang).ms);
      const nextState: AutoModState = {
        count: nextCount,
        untilMs: Date.now() + shortCooldownMs,
      };
      setAutoMod(nextState);
      saveJson('sg_mod', nextState);
    }

    if (firebaseUser && profile) {
      const xpPenalty = isTopicViolation ? 5 : 15;
      const nextXp = Math.max(0, (profile.xp || 0) - xpPenalty);
      updateDoc(doc(db, 'users_public', firebaseUser.uid), {
        xp: nextXp,
        updatedAt: serverTimestamp(),
      }).catch(() => {});

      const kindLabel =
        kind === 'video'
          ? lang === 'ar'
            ? 'الفيديو'
            : 'video'
          : lang === 'ar'
          ? 'المنشور'
          : 'post';

      void addDoc(collection(db, 'bot_messages', firebaseUser.uid, 'items'), {
        targetUid: firebaseUser.uid,
        title: lang === 'ar' ? `حذف ${kindLabel} بواسطة بوت شغف 🤖` : `Content removed by Shaghaf Bot`,
        body:
          lang === 'ar'
            ? `قام بوت شغف برفض/حذف ${kindLabel} تلقائيًا.\nالسبب: ${violationReason}\nالعقوبة: خصم ${xpPenalty} XP.`
            : `Shaghaf Bot removed your ${kindLabel}.\nReason: ${violationReason}\nPenalty: -${xpPenalty} XP.`,
        kind: 'warning',
        read: false,
        createdAt: serverTimestamp(),
      }).catch(() => {});

      void addDoc(collection(db, 'reports'), {
        reporterUid: firebaseUser.uid,
        reporterTag: profile.gamerTag,
        targetUid: firebaseUser.uid,
        targetTag: profile.gamerTag,
        reason: `[AUTO-BOT ${kind.toUpperCase()}] ${violationReason}`.slice(0, 240),
        createdAt: serverTimestamp(),
      }).catch(() => {});
    }

    const botMsg =
      lang === 'ar'
        ? `🤖 رفض البوت المحتوى: ${violationReason}`
        : `🤖 Removed by Bot: ${violationReason}`;
    showToast(botMsg);
    return { ok: false, reason: botMsg, isTopic: isTopicViolation };
  };

  // Sweep existing violating or off-topic posts/videos across all servers
  const enforceExistingModeration = useCallback(
    async (
      kind: 'post' | 'video',
      docId: string,
      authorUid: string,
      _authorTag: string,
      text: string,
      server?: string
    ) => {
      if (!firebaseUser) return;
      if (firebaseUser.uid !== authorUid && !isOwner) return;

      const key = `${kind}:${docId}:${server || ''}`;
      if (moderatedIdsRef.current.has(key)) return;

      const authorIsOwner =
        flagsMap[authorUid]?.badge === 'own' || (authorUid === firebaseUser.uid && isOwner);

      let violationReason = '';
      let isTopicViolation = false;

      if (!authorIsOwner) {
        const contentCheck = detectContentViolation(text, lang);
        if (contentCheck.violated) {
          violationReason = contentCheck.reason;
        }
      }

      if (!violationReason && server && !GENERAL_OPEN_SERVERS.has(server)) {
        const topicCheck = detectServerTopicMismatch(server, text, lang);
        if (topicCheck.violated) {
          violationReason = topicCheck.reason;
          isTopicViolation = true;
        }
      }

      if (!violationReason) return;

      moderatedIdsRef.current.add(key);
      const col = kind === 'video' ? 'videos' : 'posts';
      try {
        await deleteDoc(doc(db, col, docId));
        if (!authorIsOwner) {
          await addDoc(collection(db, 'bot_messages', authorUid, 'items'), {
            targetUid: authorUid,
            title: lang === 'ar' ? 'حذف محتوى مخالف من بوت شغف 🤖' : 'Removed by Shaghaf Bot',
            body:
              lang === 'ar'
                ? `تم حذف ${kind === 'video' ? 'فيديو' : 'منشور'} تلقائيًا بواسطة بوت شغف.\nالسبب: ${violationReason}`
                : `Your ${kind} was removed by Shaghaf Bot.\nReason: ${violationReason}`,
            kind: 'warning',
            read: false,
            createdAt: serverTimestamp(),
          });
        }
        if (isTopicViolation && firebaseUser.uid === authorUid) {
          showToast(
            lang === 'ar'
              ? `🤖 حذف البوت منشورًا خارج موضوع السيرفر: ${violationReason}`
              : `🤖 Bot removed off-topic post: ${violationReason}`
          );
        }
      } catch {
        // ignore if already deleted or lacking permission
      }
    },
    [firebaseUser, flagsMap, isOwner, lang]
  );

  // WebRTC Voice Call Methods
  const setupPeerConnection = useCallback(
    async (targetUid: string): Promise<RTCPeerConnection> => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (ev) => {
        if (ev.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'call:ice',
              toUid: targetUid,
              candidate: ev.candidate.toJSON(),
            })
          );
        }
      };

      pc.ontrack = (ev) => {
        if (remoteAudioRef.current && ev.streams[0]) {
          remoteAudioRef.current.srcObject = ev.streams[0];
          void remoteAudioRef.current.play().catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setCallState('connected');
          setCallStartedAt((prev) => prev || Date.now());
        } else if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed' ||
          pc.connectionState === 'disconnected'
        ) {
          cleanupCall();
        }
      };

      return pc;
    },
    [cleanupCall]
  );

  const startVoiceCall = async (targetUid: string, targetTag: string) => {
    if (!firebaseUser || !profile) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      showToast(lang === 'ar' ? 'جاري الاتصال بالخادم، حاول بعد لحظة' : 'Connecting...');
      return;
    }
    if (pcRef.current) {
      showToast(lang === 'ar' ? 'لديك مكالمة نشطة بالفعل' : 'Call already active');
      return;
    }
    try {
      setCallPeer({ uid: targetUid, tag: targetTag });
      setCallState('calling');
      const pc = await setupPeerConnection(targetUid);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsRef.current.send(
        JSON.stringify({
          type: 'call:offer',
          toUid: targetUid,
          fromTag: profile.gamerTag,
          sdp: offer,
        })
      );
    } catch {
      cleanupCall();
      showToast(
        lang === 'ar'
          ? 'يرجى السماح بصلاحية الميكروفون لإجراء المكالمة الصوتية'
          : 'Microphone permission is required for voice calls'
      );
    }
  };

  const acceptVoiceCall = async () => {
    const offer = pendingOfferRef.current;
    if (!offer || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      cleanupCall();
      return;
    }
    try {
      const pc = await setupPeerConnection(offer.fromUid);
      await pc.setRemoteDescription(new RTCSessionDescription(offer.sdp));
      for (const c of iceQueueRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }
      iceQueueRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      wsRef.current.send(
        JSON.stringify({
          type: 'call:answer',
          toUid: offer.fromUid,
          sdp: answer,
        })
      );
      pendingOfferRef.current = null;
      setCallState('connected');
      setCallStartedAt(Date.now());
    } catch {
      cleanupCall();
      showToast(
        lang === 'ar'
          ? 'تعذر فتح الميكروفون للرد على المكالمة'
          : 'Could not access microphone'
      );
    }
  };

  const rejectVoiceCall = () => {
    const targetUid = pendingOfferRef.current?.fromUid || callPeerRef.current?.uid;
    if (targetUid && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'call:reject', toUid: targetUid }));
    }
    cleanupCall();
  };

  const endVoiceCall = () => {
    const targetUid = callPeerRef.current?.uid || pendingOfferRef.current?.fromUid;
    if (targetUid && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'call:end', toUid: targetUid }));
    }
    cleanupCall();
  };

  const toggleCallMute = () => {
    if (!localStreamRef.current) return;
    const next = !callMuted;
    localStreamRef.current.getAudioTracks().forEach((tr) => {
      tr.enabled = !next;
    });
    setCallMuted(next);
  };

  const dismissAutoModPopup = () => setAutoModPopup(null);

  const dismissAdminWarning = async (warnId: string) => {
    if (!firebaseUser) return;
    const path = `warns/${firebaseUser.uid}/items/${warnId}`;
    try {
      await deleteDoc(doc(db, 'warns', firebaseUser.uid, 'items', warnId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const markBotMessageRead = async (msgId: string) => {
    if (!firebaseUser) return;
    setBotMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, read: true } : m))
    );
    const path = `bot_messages/${firebaseUser.uid}/items/${msgId}`;
    try {
      await updateDoc(doc(db, 'bot_messages', firebaseUser.uid, 'items', msgId), {
        read: true,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const toggleBlockUser = (uid: string) => {
    setBlockedMap((prev) => {
      const next = { ...prev };
      if (next[uid]) delete next[uid];
      else next[uid] = true;
      saveJson('sg_blk', next);
      return next;
    });
  };

  const toggleMuteUser = (uid: string) => {
    setMutedMap((prev) => {
      const next = { ...prev };
      if (next[uid]) delete next[uid];
      else next[uid] = true;
      saveJson('sg_mute', next);
      return next;
    });
  };

  const pushNotification = (text: string, fromUid?: string) => {
    if (fromUid && mutedMap[fromUid]) return;
    setNotifications((prev) => {
      const next = [{ id: String(Date.now()), text, ts: Date.now(), read: false }, ...prev].slice(
        0,
        25
      );
      saveJson('sg_notifs', next);
      return next;
    });
    if (!dndMode) showToast(text);
  };

  const markNotificationsRead = () => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      saveJson('sg_notifs', next);
      return next;
    });
  };

  const logout = async () => {
    cleanupCall();
    await signOut(auth);
  };

  const deleteAccount = async () => {
    if (!firebaseUser || !profile) return;
    const uid = firebaseUser.uid;
    try {
      await deleteDoc(doc(db, 'names', toNameKey(profile.gamerTag)));
      await deleteDoc(doc(db, 'users_private', uid));
      await deleteDoc(doc(db, 'users_public', uid));
      await deleteUser(firebaseUser);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users_public/${uid}`);
    }
  };

  return (
    <AppContext.Provider
      value={{
        authReady,
        profileLoaded,
        firebaseUser,
        profile,
        privateData,
        flagsMap,
        friendsMap,
        blockedMap,
        mutedMap,
        adminWarnings,
        botMessages,
        notifications,
        onlineUids,
        playingMap,
        totalUsersCount,
        newsRefreshTick,
        callState,
        callPeer,
        callMuted,
        callStartedAt,
        lang,
        t,
        isOwner,
        isBanned,
        isChatMuted,
        banUntilMs,
        chatBanUntilMs,
        liteMode,
        dndMode,
        pageBgPref,
        autoMod,
        autoModPopup,
        toastMsg,
        showToast,
        setLanguage,
        setLiteMode,
        setDndMode,
        setPageBgPref,
        setPlayingGame,
        signInWithGoogle,
        registerGamerTag,
        logout,
        deleteAccount,
        updateProfileFields,
        addXp,
        checkTextModeration,
        moderateSubmission,
        enforceExistingModeration,
        dismissAutoModPopup,
        dismissAdminWarning,
        markBotMessageRead,
        toggleBlockUser,
        toggleMuteUser,
        pushNotification,
        markNotificationsRead,
        startVoiceCall,
        acceptVoiceCall,
        rejectVoiceCall,
        endVoiceCall,
        toggleCallMute,
      }}
    >
      {children}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
