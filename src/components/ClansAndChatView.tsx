import { useEffect, useRef, useState, type FormEvent } from 'react';
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
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Bot,
  Check,
  Crown,
  Gamepad2,
  LogOut,
  MessageCircle,
  Phone,
  Plus,
  Send,
  Shield,
  ShieldCheck,
  Smile,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getDmThreadId, LIMITS, TIER_META } from '../lib/constants';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { Clan, ClanMember, ClanMessage, DmMessage, DmThread } from '../types';
import { BadgeIcon } from './BadgeIcon';
import { MemePicker, type MemeChoice } from './MemePicker';

interface ClansAndChatViewProps {
  initialDmTarget: { uid: string; tag: string } | null;
  onClearDmTarget: () => void;
  onOpenCreateClan: () => void;
  onOpenProfile: (uid: string, tag?: string) => void;
}

export function ClansAndChatView({
  initialDmTarget,
  onClearDmTarget,
  onOpenCreateClan,
  onOpenProfile,
}: ClansAndChatViewProps) {
  const {
    firebaseUser,
    profile,
    friendsMap,
    flagsMap,
    blockedMap,
    onlineUids,
    playingMap,
    lang,
    t,
    isOwner,
    showToast,
    checkTextModeration,
    addXp,
    startVoiceCall,
  } = useApp();

  const [subTab, setSubTab] = useState<'clans' | 'friends' | 'assistant'>(
    initialDmTarget ? 'friends' : 'clans'
  );
  const [clans, setClans] = useState<Clan[]>([]);
  const [selectedClanId, setSelectedClanId] = useState<string>('room_general');
  const [clanMembers, setClanMembers] = useState<ClanMember[]>([]);
  const [clanMsgs, setClanMsgs] = useState<ClanMessage[]>([]);
  const [showRoster, setShowRoster] = useState(false);
  const [clanInput, setClanInput] = useState('');
  const [showClanMemes, setShowClanMemes] = useState(false);

  const [dmThreads, setDmThreads] = useState<DmThread[]>([]);
  const [activeDmPartner, setActiveDmPartner] = useState<{ uid: string; tag: string } | null>(
    initialDmTarget
  );
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [showGroupBuilder, setShowGroupBuilder] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [selectedGroupUids, setSelectedGroupUids] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [dmMsgs, setDmMsgs] = useState<DmMessage[]>([]);
  const [dmInput, setDmInput] = useState('');
  const [showDmMemes, setShowDmMemes] = useState(false);

  const [botMessages, setBotMessages] = useState<{ me: boolean; text: string }[]>([
    { me: false, text: t.assistantIntro },
  ]);
  const [botInput, setBotInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialDmTarget) {
      setSubTab('friends');
      setActiveGroupId(null);
      setActiveDmPartner(initialDmTarget);
      onClearDmTarget();
    }
  }, [initialDmTarget, onClearDmTarget]);

  // Listen to public clans + user-owned clans
  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(
      query(collection(db, 'clans'), where('isPublic', '==', true), limit(50)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Clan, 'id'>) }));
        setClans(list);
        if (list.length > 0 && !list.some((c) => c.id === selectedClanId)) {
          setSelectedClanId(list[0].id);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'clans')
    );
    return () => unsub();
  }, [firebaseUser, selectedClanId]);

  const selectedClan = clans.find((c) => c.id === selectedClanId) || clans[0] || null;

  // Listen to selected clan members & messages
  useEffect(() => {
    if (!firebaseUser || !selectedClan) return;
    const cid = selectedClan.id;
    const unsubMembers = onSnapshot(
      collection(db, 'clans', cid, 'members'),
      (snap) => {
        setClanMembers(snap.docs.map((d) => d.data() as ClanMember));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `clans/${cid}/members`)
    );
    const unsubMessages = onSnapshot(
      query(collection(db, 'clans', cid, 'messages'), orderBy('createdAt', 'asc'), limit(100)),
      (snap) => {
        setClanMsgs(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClanMessage, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `clans/${cid}/messages`)
    );
    return () => {
      unsubMembers();
      unsubMessages();
    };
  }, [firebaseUser, selectedClan]);

  // Listen to user's DM threads
  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(
      query(collection(db, 'dms'), where('participants', 'array-contains', firebaseUser.uid)),
      (snap) => {
        setDmThreads(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DmThread, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'dms')
    );
    return () => unsub();
  }, [firebaseUser]);

  // Listen to active 1-on-1 DM or Group Chat messages
  useEffect(() => {
    if (!firebaseUser) {
      setDmMsgs([]);
      return;
    }
    const threadId = activeGroupId
      ? activeGroupId
      : activeDmPartner
      ? getDmThreadId(firebaseUser.uid, activeDmPartner.uid)
      : null;

    if (!threadId) {
      setDmMsgs([]);
      return;
    }
    const threadExists = dmThreads.some((th) => th.id === threadId);
    if (!threadExists) {
      setDmMsgs([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'dms', threadId, 'messages'), orderBy('createdAt', 'asc'), limit(100)),
      (snap) => {
        setDmMsgs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DmMessage, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `dms/${threadId}/messages`)
    );
    return () => unsub();
  }, [firebaseUser, activeDmPartner, activeGroupId, dmThreads]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [clanMsgs.length, dmMsgs.length, botMessages.length]);

  if (!firebaseUser || !profile) return null;
  const uid = firebaseUser.uid;
  const myMember = clanMembers.find((m) => m.uid === uid);
  const canModerateClan = Boolean(
    isOwner ||
      (selectedClan && selectedClan.ownerUid === uid) ||
      myMember?.role === 'owner' ||
      myMember?.role === 'mod'
  );

  const handleJoinClan = async () => {
    if (!selectedClan) return;
    try {
      await setDoc(doc(db, 'clans', selectedClan.id, 'members', uid), {
        uid,
        gamerTag: profile.gamerTag,
        role: selectedClan.ownerUid === uid ? 'owner' : 'member',
        joinedAt: serverTimestamp(),
      });
      addXp(5);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `clans/${selectedClan.id}/members/${uid}`);
    }
  };

  const handleLeaveClan = async () => {
    if (!selectedClan) return;
    try {
      await deleteDoc(doc(db, 'clans', selectedClan.id, 'members', uid));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `clans/${selectedClan.id}/members/${uid}`);
    }
  };

  const handleToggleMemberRole = async (member: ClanMember) => {
    if (!selectedClan) return;
    const nextRole = member.role === 'mod' ? 'member' : 'mod';
    try {
      await updateDoc(doc(db, 'clans', selectedClan.id, 'members', member.uid), {
        role: nextRole,
      });
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `clans/${selectedClan.id}/members/${member.uid}`
      );
    }
  };

  const sendClanPayload = async (text: string, mediaUrl?: string) => {
    if (!selectedClan) return;
    if (!checkTextModeration(text || 'gif', 'chat')) return;
    if (text && !(await verifyServerModeration(text))) return;
    try {
      if (!myMember) {
        await setDoc(doc(db, 'clans', selectedClan.id, 'members', uid), {
          uid,
          gamerTag: profile.gamerTag,
          role: selectedClan.ownerUid === uid ? 'owner' : 'member',
          joinedAt: serverTimestamp(),
        });
      }
      const payload: Record<string, unknown> = {
        authorUid: uid,
        authorTag: profile.gamerTag,
        text: text.slice(0, LIMITS.MESSAGE_MAX),
        createdAt: serverTimestamp(),
      };
      if (mediaUrl) payload.mediaUrl = mediaUrl;
      await addDoc(collection(db, 'clans', selectedClan.id, 'messages'), payload);
      setClanInput('');
      setShowClanMemes(false);
      addXp(2);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `clans/${selectedClan.id}/messages`);
    }
  };

  const handleSendClanMsg = async (e: FormEvent) => {
    e.preventDefault();
    const text = clanInput.trim();
    if (!text) return;
    await sendClanPayload(text);
  };

  const handleSelectClanMeme = async (meme: MemeChoice) => {
    const label = lang === 'ar' ? meme.titleAr : meme.titleEn;
    await sendClanPayload(label, meme.url);
  };

  const activeGroupThread = activeGroupId
    ? dmThreads.find((th) => th.id === activeGroupId && th.isGroup) || null
    : null;

  const verifyServerModeration = async (text: string): Promise<boolean> => {
    if (isOwner || !text.trim() || !firebaseUser) return true;
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/moderate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return true;
      const data = (await res.json()) as { violated?: boolean; exempt?: boolean; reason?: string };
      if (data.exempt || !data.violated) return true;
      showToast(data.reason || t.autoModTitle);
      return false;
    } catch {
      return true;
    }
  };

  const openDmWith = (partnerUid: string, partnerTag: string) => {
    if (blockedMap[partnerUid]) {
      showToast(t.blockedUser);
      return;
    }
    if (profile.isMinor && !friendsMap[partnerUid]) {
      showToast(t.minorDmBlocked);
      return;
    }
    setActiveGroupId(null);
    setActiveDmPartner({ uid: partnerUid, tag: partnerTag });
    setShowDmMemes(false);
  };

  const openGroupThread = (groupId: string) => {
    setActiveDmPartner(null);
    setActiveGroupId(groupId);
    setShowDmMemes(false);
  };

  const handleCreateGroupChat = async (e: FormEvent) => {
    e.preventDefault();
    if (creatingGroup) return;
    const cleanName = groupNameInput.trim();
    if (cleanName.length < 2 || selectedGroupUids.length < 1) return;
    if (!checkTextModeration(cleanName, 'chat')) return;

    const participantSet = Array.from(new Set([uid, ...selectedGroupUids])).slice(0, 30);
    if (participantSet.length < 2) return;

    const tagMap: Record<string, string> = { [uid]: profile.gamerTag };
    participantSet.forEach((pUid) => {
      if (pUid === uid) return;
      const friendTag = friendsMap[pUid]?.friendTag;
      if (friendTag) {
        tagMap[pUid] = friendTag;
        return;
      }
      const existingThread = dmThreads.find((th) => th.participantTags?.[pUid]);
      tagMap[pUid] = existingThread?.participantTags[pUid] || 'Player';
    });

    const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setCreatingGroup(true);
    try {
      await setDoc(doc(db, 'dms', groupId), {
        participants: participantSet,
        participantTags: tagMap,
        isGroup: true,
        groupName: cleanName.slice(0, 50),
        creatorUid: uid,
        lastMessage:
          lang === 'ar'
            ? `أنشأ ${profile.gamerTag} مجموعة ${cleanName.slice(0, 30)}`
            : `${profile.gamerTag} created ${cleanName.slice(0, 30)}`,
        updatedAt: serverTimestamp(),
      });
      setGroupNameInput('');
      setSelectedGroupUids([]);
      setShowGroupBuilder(false);
      setActiveDmPartner(null);
      setActiveGroupId(groupId);
      addXp(10);
      showToast(t.groupCreated);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `dms/${groupId}`);
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleLeaveOrDeleteGroup = async (group: DmThread) => {
    try {
      if (group.participants.length <= 2 && (group.creatorUid === uid || isOwner)) {
        await deleteDoc(doc(db, 'dms', group.id));
        setActiveGroupId(null);
        return;
      }
      const remaining = group.participants.filter((p) => p !== uid);
      if (remaining.length < 2) {
        await deleteDoc(doc(db, 'dms', group.id));
        setActiveGroupId(null);
        return;
      }
      const nextTags = { ...group.participantTags };
      delete nextTags[uid];
      await updateDoc(doc(db, 'dms', group.id), {
        participants: remaining,
        participantTags: nextTags,
        lastMessage:
          lang === 'ar' ? `غادر ${profile.gamerTag} المجموعة` : `${profile.gamerTag} left the group`,
        updatedAt: serverTimestamp(),
      });
      setActiveGroupId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `dms/${group.id}`);
    }
  };

  const sendDmPayload = async (text: string, mediaUrl?: string) => {
    if (!activeGroupThread && !activeDmPartner) return;
    if (!checkTextModeration(text || 'gif', 'chat')) return;
    if (text && !(await verifyServerModeration(text))) return;

    const threadId = activeGroupThread
      ? activeGroupThread.id
      : getDmThreadId(uid, activeDmPartner!.uid);
    const threadRef = doc(db, 'dms', threadId);
    const exists = dmThreads.some((th) => th.id === threadId);
    const preview = (mediaUrl ? `🎞️ ${text}` : text).slice(0, LIMITS.MESSAGE_MAX);

    try {
      if (!exists && activeDmPartner) {
        await setDoc(threadRef, {
          participants: [uid, activeDmPartner.uid].sort(),
          participantTags: {
            [uid]: profile.gamerTag,
            [activeDmPartner.uid]: activeDmPartner.tag,
          },
          lastMessage: preview,
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(threadRef, {
          lastMessage: activeGroupThread ? `${profile.gamerTag}: ${preview}`.slice(0, LIMITS.MESSAGE_MAX) : preview,
          updatedAt: serverTimestamp(),
        });
      }
      const payload: Record<string, unknown> = {
        senderUid: uid,
        senderTag: profile.gamerTag,
        text: text.slice(0, LIMITS.MESSAGE_MAX),
        createdAt: serverTimestamp(),
      };
      if (mediaUrl) payload.mediaUrl = mediaUrl;
      await addDoc(collection(db, 'dms', threadId, 'messages'), payload);
      setDmInput('');
      setShowDmMemes(false);
      addXp(2);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `dms/${threadId}`);
    }
  };

  const handleSendDm = async (e: FormEvent) => {
    e.preventDefault();
    const text = dmInput.trim();
    if (!text) return;
    await sendDmPayload(text);
  };

  const handleSelectDmMeme = async (meme: MemeChoice) => {
    const label = lang === 'ar' ? meme.titleAr : meme.titleEn;
    await sendDmPayload(label, meme.url);
  };

  const handleBotSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = botInput.trim();
    if (!q) return;
    const lower = q.toLowerCase();
    let reply =
      lang === 'ar'
        ? 'أجيب فقط عن ميزات تطبيق شغف. اكتب «دعم بشري» للتواصل مع المشرفين.'
        : lang === 'fr'
        ? 'Je réponds uniquement sur Shaghaf. Écrivez « support humain » pour un modérateur.'
        : 'I only answer about Shaghaf features. Type "human support" to reach a moderator.';

    if (/دعم|مشرف|support|human|humain|mod/.test(lower)) {
      reply =
        lang === 'ar'
          ? 'تم تسجيل طلب الدعم البشري. يمكنك أيضًا الإبلاغ عن أي حساب من زر الخيارات.'
          : 'Human support request noted. You can also report accounts from profile options.';
    } else if (/كلان|فريق|clan|squad|team|équipe/.test(lower)) {
      reply =
        lang === 'ar'
          ? 'من تبويب «الكلانات والرومات» يمكنك إنشاء كلان خاص أو عام وتعيين مشرفين والتنسيق مع فريقك لحظيًا.'
          : 'In Clans & Rooms you can create a clan, assign moderators, and coordinate live with your squad.';
    } else if (/بطول|سوق|tournament|market|tournoi/.test(lower)) {
      reply =
        lang === 'ar'
          ? 'من تبويب «البطولات والسوق» يمكنك التسجيل في بطولات الباتل رويال أو طلب خدمات المونتاج والتصميم بنظام الضمان.'
          : 'Use the Arena & Market tab to join Battle Royale tournaments, post LFG requests, or order skills safely.';
    } else if (/صديق|bro|friend|ami/.test(lower)) {
      reply =
        lang === 'ar'
          ? 'افتح ملف أي لاعب واضغط «إضافة صديق» لتصنيفه كـ Bro أو صديق جيد أو عادي.'
          : 'Open any player profile and tap Add Friend to classify them as Bro, Good friend, or Friend.';
    } else if (/خصوص|قاصر|privacy|minor|confid/.test(lower)) {
      reply =
        lang === 'ar'
          ? 'من الإعدادات يمكنك تفعيل الحساب الخاص وحماية القاصرين لمنع رسائل الغرباء.'
          : 'In Settings you can set your account to Private and enable Minor Protection.';
    }

    setBotMessages((prev) => [...prev, { me: true, text: q }, { me: false, text: reply }]);
    setBotInput('');
  };

  const sortedFriends = Object.values(friendsMap)
    .filter((f) => !blockedMap[f.friendUid])
    .sort((a, b) => TIER_META[a.tier].order - TIER_META[b.tier].order);

  return (
    <div className="space-y-4">
      {/* Sub-navigation */}
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#12121D] border border-white/[0.08]">
        <button
          type="button"
          onClick={() => setSubTab('clans')}
          className={`min-h-[44px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
            subTab === 'clans' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4 shrink-0" />
          <span className="truncate">{t.clansTab}</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('friends')}
          className={`min-h-[44px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
            subTab === 'friends' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:text-white'
          }`}
        >
          <MessageCircle className="w-4 h-4 shrink-0" />
          <span className="truncate">{t.friendsTab}</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('assistant')}
          className={`min-h-[44px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
            subTab === 'assistant' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:text-white'
          }`}
        >
          <Bot className="w-4 h-4 shrink-0" />
          <span className="truncate">{t.assistantTab}</span>
        </button>
      </div>

      {/* Clans & Rooms Workspace */}
      {subTab === 'clans' && (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          {/* Clans Sidebar */}
          <div className="rounded-2xl bg-[#12121D] border border-white/[0.08] p-3 space-y-2.5">
            <button
              type="button"
              onClick={onOpenCreateClan}
              className="w-full min-h-[44px] px-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{t.createClan}</span>
            </button>

            <div className="space-y-1 max-h-[260px] lg:max-h-[460px] overflow-y-auto no-scrollbar">
              {clans.map((clan) => {
                const active = selectedClan?.id === clan.id;
                return (
                  <button
                    key={clan.id}
                    type="button"
                    onClick={() => {
                      setSelectedClanId(clan.id);
                      setShowRoster(false);
                    }}
                    className={`w-full min-h-[52px] px-3 py-2 rounded-xl text-start flex items-center justify-between gap-2 transition-colors ${
                      active
                        ? 'bg-violet-600/20 border border-violet-500/40 text-white'
                        : 'hover:bg-white/5 text-slate-300 border border-transparent'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">
                        [{clan.tag}] {clan.name}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {clan.game} · {clan.region}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Clan Chat & Roster */}
          {selectedClan && (
            <div className="rounded-2xl bg-[#12121D] border border-white/[0.08] flex flex-col h-[520px] lg:h-[580px] overflow-hidden">
              <div className="p-4 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-black text-base text-white truncate">
                    [{selectedClan.tag}] {selectedClan.name}
                  </h3>
                  <p className="text-xs text-slate-400 truncate">
                    {selectedClan.game} · {selectedClan.region}
                    {selectedClan.minRank ? ` · ${selectedClan.minRank}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowRoster((v) => !v)}
                    className="min-h-[40px] px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-xs font-bold text-slate-200 hover:text-white flex items-center gap-1.5"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span className="tabular-nums">
                      {t.members} ({clanMembers.length})
                    </span>
                  </button>

                  {myMember ? (
                    selectedClan.ownerUid !== uid && (
                      <button
                        type="button"
                        onClick={handleLeaveClan}
                        className="min-h-[40px] px-3 rounded-xl border border-white/15 text-xs font-bold text-slate-300 hover:text-white"
                      >
                        {t.leaveClan}
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={handleJoinClan}
                      className="min-h-[40px] px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center gap-1"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{t.joinClan}</span>
                    </button>
                  )}
                </div>
              </div>

              {showRoster ? (
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {selectedClan.description && (
                    <p className="text-xs text-slate-300 pb-3 border-b border-white/[0.06]">
                      {selectedClan.description}
                    </p>
                  )}
                  {clanMembers.map((m) => (
                    <div
                      key={m.uid}
                      className="flex items-center justify-between gap-2 py-2.5 border-b border-white/[0.06]"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenProfile(m.uid, m.gamerTag)}
                        className="flex items-center gap-2.5 text-start min-h-[40px]"
                      >
                        <span className="w-9 h-9 rounded-full bg-violet-600/30 grid place-items-center font-bold text-sm text-white">
                          {m.gamerTag.charAt(0).toUpperCase()}
                        </span>
                        <span>
                          <span className="font-bold text-sm text-white flex items-center gap-1">
                            {m.gamerTag}
                            <BadgeIcon kind={flagsMap[m.uid]?.badge} />
                          </span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            {m.role === 'owner' && <Crown className="w-3 h-3 text-amber-400" />}
                            {m.role === 'mod' && <Shield className="w-3 h-3 text-blue-400" />}
                            {m.role === 'owner'
                              ? t.ownerRole
                              : m.role === 'mod'
                              ? t.modRole
                              : t.memberRole}
                          </span>
                        </span>
                      </button>

                      {(selectedClan.ownerUid === uid || isOwner) && m.uid !== uid && (
                        <button
                          type="button"
                          onClick={() => handleToggleMemberRole(m)}
                          className="min-h-[36px] px-3 rounded-lg border border-white/15 text-xs font-semibold text-slate-200 hover:bg-white/5"
                        >
                          {m.role === 'mod' ? t.demoteMod : t.promoteMod}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                    {clanMsgs.length === 0 ? (
                      <div className="h-full grid place-items-center text-xs text-slate-400">
                        {t.noMessages}
                      </div>
                    ) : (
                      clanMsgs
                        .filter((m) => !blockedMap[m.authorUid])
                        .map((m) => {
                          const isMe = m.authorUid === uid;
                          return (
                            <div
                              key={m.id}
                              className={`flex flex-col ${isMe ? 'items-start' : 'items-end'}`}
                            >
                              <div
                                className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm ${
                                  isMe
                                    ? 'bg-violet-600 text-white'
                                    : 'bg-[#1A1A29] border border-white/[0.08] text-slate-100'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3 text-[11px] opacity-80 mb-0.5">
                                  <button
                                    type="button"
                                    onClick={() => onOpenProfile(m.authorUid, m.authorTag)}
                                    className="font-bold hover:underline flex items-center gap-1"
                                  >
                                    {m.authorTag}
                                    <BadgeIcon kind={flagsMap[m.authorUid]?.badge} className="w-3.5 h-3.5" />
                                  </button>
                                  {(canModerateClan || isMe) && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        deleteDoc(
                                          doc(db, 'clans', selectedClan.id, 'messages', m.id)
                                        ).catch(() => {})
                                      }
                                      aria-label="Delete message"
                                      className="hover:text-rose-300"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                                {m.mediaUrl && (
                                  <img
                                    src={m.mediaUrl}
                                    alt={m.text || 'Meme'}
                                    loading="lazy"
                                    className="mt-1.5 rounded-xl w-52 max-w-full border border-white/10"
                                  />
                                )}
                                {m.text && !m.mediaUrl && (
                                  <p className="break-words leading-relaxed">{m.text}</p>
                                )}
                              </div>
                            </div>
                          );
                        })
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {showClanMemes && (
                    <div className="p-2.5 border-t border-white/[0.08] bg-[#0B0B13]">
                      <MemePicker
                        onSelect={handleSelectClanMeme}
                        onClose={() => setShowClanMemes(false)}
                      />
                    </div>
                  )}

                  <form
                    onSubmit={handleSendClanMsg}
                    className="p-3 border-t border-white/[0.08] bg-[#0E0E17] flex items-center gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => setShowClanMemes((v) => !v)}
                      aria-label={t.gifMemesBtn}
                      className={`min-h-[44px] min-w-[44px] rounded-xl border grid place-items-center shrink-0 ${
                        showClanMemes
                          ? 'bg-violet-600/25 border-violet-500 text-violet-300'
                          : 'bg-[#1A1A29] border-white/10 text-amber-300 hover:bg-white/10'
                      }`}
                    >
                      <Smile className="w-4 h-4" />
                    </button>
                    <input
                      type="text"
                      value={clanInput}
                      onChange={(e) => setClanInput(e.target.value)}
                      maxLength={LIMITS.MESSAGE_MAX}
                      placeholder={t.writeMessage}
                      className="flex-1 h-11 px-3.5 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                    />
                    <button
                      type="submit"
                      aria-label={t.send}
                      className="min-h-[44px] min-w-[44px] rounded-xl bg-violet-600 hover:bg-violet-500 text-white grid place-items-center shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Friends, Direct Messages & Group Chats */}
      {subTab === 'friends' && (() => {
        const groupThreads = dmThreads.filter((th) => th.isGroup);
        const directThreads = dmThreads.filter((th) => !th.isGroup);

        // Candidate members for creating group chats (friends + recent DM partners)
        const candidateMap = new Map<string, string>();
        sortedFriends.forEach((f) => candidateMap.set(f.friendUid, f.friendTag));
        directThreads.forEach((th) => {
          const otherUid = th.participants.find((p) => p !== uid);
          if (otherUid && !blockedMap[otherUid] && !candidateMap.has(otherUid)) {
            candidateMap.set(otherUid, th.participantTags?.[otherUid] || 'Player');
          }
        });
        const candidateList = Array.from(candidateMap.entries()).map(([cUid, cTag]) => ({
          uid: cUid,
          tag: cTag,
        }));

        const hasActiveConversation = Boolean(activeGroupThread || activeDmPartner);

        return (
          <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-4">
            <div className="rounded-2xl bg-[#12121D] border border-white/[0.08] p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-300 px-1">{t.directChatsTitle}</span>
                <button
                  type="button"
                  onClick={() => setShowGroupBuilder((v) => !v)}
                  className="min-h-[38px] px-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                >
                  {showGroupBuilder ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>{t.createGroupChat}</span>
                </button>
              </div>

              {/* Instagram/Facebook-style Group Builder */}
              {showGroupBuilder && (
                <form
                  onSubmit={handleCreateGroupChat}
                  className="rounded-xl bg-[#1A1A29] border border-violet-500/35 p-3 space-y-2.5"
                >
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={50}
                    value={groupNameInput}
                    onChange={(e) => setGroupNameInput(e.target.value)}
                    placeholder={t.groupChatName}
                    className="w-full h-10 px-3 rounded-xl bg-[#0E0E17] border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                  />
                  <div className="text-[11px] font-semibold text-slate-400">
                    {t.selectGroupMembers}
                  </div>
                  {candidateList.length === 0 ? (
                    <p className="text-[11px] text-slate-400">{t.friendsEmpty}</p>
                  ) : (
                    <div className="max-h-36 overflow-y-auto space-y-1 no-scrollbar">
                      {candidateList.map((cand) => {
                        const checked = selectedGroupUids.includes(cand.uid);
                        return (
                          <button
                            key={cand.uid}
                            type="button"
                            onClick={() =>
                              setSelectedGroupUids((prev) =>
                                checked
                                  ? prev.filter((id) => id !== cand.uid)
                                  : prev.length < 29
                                  ? [...prev, cand.uid]
                                  : prev
                              )
                            }
                            className={`w-full min-h-[36px] px-2.5 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 ${
                              checked
                                ? 'bg-violet-600/25 border border-violet-500/50 text-white'
                                : 'bg-[#0E0E17] border border-white/[0.06] text-slate-300'
                            }`}
                          >
                            <span className="truncate">{cand.tag}</span>
                            {checked && <Check className="w-3.5 h-3.5 text-violet-300 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={
                      creatingGroup ||
                      groupNameInput.trim().length < 2 ||
                      selectedGroupUids.length < 1
                    }
                    className="w-full min-h-[40px] rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold"
                  >
                    {creatingGroup ? '...' : t.createGroupChat}
                  </button>
                </form>
              )}

              {sortedFriends.length === 0 && dmThreads.length === 0 ? (
                <p className="p-4 text-xs text-slate-400 text-center leading-relaxed">
                  {t.friendsEmpty}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-[420px] overflow-y-auto no-scrollbar">
                  {/* Group Chats */}
                  {groupThreads.map((grp) => {
                    const active = activeGroupId === grp.id;
                    return (
                      <button
                        key={grp.id}
                        type="button"
                        onClick={() => openGroupThread(grp.id)}
                        className={`w-full min-h-[58px] px-3 py-2 rounded-xl flex items-center gap-3 text-start transition-colors ${
                          active
                            ? 'bg-violet-600/20 border border-violet-500/40'
                            : 'hover:bg-white/5 border border-transparent'
                        }`}
                      >
                        <span className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center text-white shrink-0">
                          <Users className="w-4 h-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-bold text-sm text-white flex items-center justify-between gap-2">
                            <span className="truncate">{grp.groupName || t.groupBadge}</span>
                            <span className="text-[11px] font-semibold text-violet-300 tabular-nums shrink-0">
                              {grp.participants.length}
                            </span>
                          </span>
                          <span className="text-xs text-slate-400 block truncate mt-0.5">
                            {grp.lastMessage || `${t.groupBadge} · ${grp.participants.length}`}
                          </span>
                        </span>
                      </button>
                    );
                  })}

                  {/* Friends & 1-on-1 DMs */}
                  {sortedFriends.map((f) => {
                    const active = !activeGroupId && activeDmPartner?.uid === f.friendUid;
                    const friendOnline = onlineUids.includes(f.friendUid);
                    const friendPlaying = playingMap[f.friendUid];
                    return (
                      <button
                        key={f.friendUid}
                        type="button"
                        onClick={() => openDmWith(f.friendUid, f.friendTag)}
                        className={`w-full min-h-[58px] px-3 py-2 rounded-xl flex items-center gap-3 text-start transition-colors ${
                          active
                            ? 'bg-violet-600/20 border border-violet-500/40'
                            : 'hover:bg-white/5 border border-transparent'
                        }`}
                      >
                        <span
                          className="relative w-10 h-10 rounded-full bg-[#1A1A29] grid place-items-center font-black text-sm text-white shrink-0"
                          style={{
                            boxShadow: `0 0 0 2px #12121D, 0 0 0 4px ${TIER_META[f.tier].ringColor}`,
                          }}
                        >
                          {f.friendTag.charAt(0).toUpperCase()}
                          <span
                            className={`absolute -bottom-0.5 -end-0.5 w-3 h-3 rounded-full border-2 border-[#12121D] ${
                              friendOnline ? 'bg-emerald-400' : 'bg-rose-500'
                            }`}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-bold text-sm text-white flex items-center gap-1 truncate">
                            <span className="truncate">{f.friendTag}</span>
                            <BadgeIcon kind={flagsMap[f.friendUid]?.badge} />
                          </span>
                          {friendPlaying ? (
                            <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1 truncate mt-0.5">
                              <Gamepad2 className="w-3 h-3 shrink-0" />
                              <span className="truncate">
                                {t.playingNow}: {friendPlaying}
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 flex items-center gap-1.5">
                              <span>{TIER_META[f.tier].labels[lang]}</span>
                              <span aria-hidden="true">·</span>
                              <span className={friendOnline ? 'text-emerald-400' : 'text-rose-400'}>
                                {friendOnline ? t.onlineNow : t.offlineNow}
                              </span>
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}

                  {/* Non-friend direct message threads */}
                  {directThreads
                    .filter((th) => {
                      const other = th.participants.find((p) => p !== uid);
                      return other && !friendsMap[other] && !blockedMap[other];
                    })
                    .map((th) => {
                      const otherUid = th.participants.find((p) => p !== uid) || '';
                      const otherTag = th.participantTags?.[otherUid] || 'Player';
                      const active = !activeGroupId && activeDmPartner?.uid === otherUid;
                      const online = onlineUids.includes(otherUid);
                      return (
                        <button
                          key={th.id}
                          type="button"
                          onClick={() => openDmWith(otherUid, otherTag)}
                          className={`w-full min-h-[58px] px-3 py-2 rounded-xl flex items-center gap-3 text-start transition-colors ${
                            active
                              ? 'bg-violet-600/20 border border-violet-500/40'
                              : 'hover:bg-white/5 border border-transparent'
                          }`}
                        >
                          <span className="relative w-10 h-10 rounded-full bg-[#1A1A29] grid place-items-center font-black text-sm text-white shrink-0">
                            {otherTag.charAt(0).toUpperCase()}
                            <span
                              className={`absolute -bottom-0.5 -end-0.5 w-3 h-3 rounded-full border-2 border-[#12121D] ${
                                online ? 'bg-emerald-400' : 'bg-rose-500'
                              }`}
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="font-bold text-sm text-white flex items-center gap-1 truncate">
                              <span className="truncate">{otherTag}</span>
                              <BadgeIcon kind={flagsMap[otherUid]?.badge} />
                            </span>
                            <span className="text-xs text-slate-400 block truncate">
                              {th.lastMessage || (online ? t.onlineNow : t.offlineNow)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-[#12121D] border border-white/[0.08] flex flex-col h-[520px] overflow-hidden">
              {!hasActiveConversation ? (
                <div className="flex-1 grid place-items-center text-sm text-slate-400 p-6 text-center">
                  {t.friendsEmpty}
                </div>
              ) : (
                <>
                  {/* Conversation Header */}
                  <div className="p-4 border-b border-white/[0.08] flex items-center justify-between gap-2">
                    {activeGroupThread ? (
                      <>
                        <div className="min-w-0">
                          <div className="font-black text-base text-white flex items-center gap-2">
                            <Users className="w-4 h-4 text-violet-400 shrink-0" />
                            <span className="truncate">{activeGroupThread.groupName}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate mt-0.5">
                            {activeGroupThread.participants
                              .map((p) => activeGroupThread.participantTags?.[p] || p.slice(0, 6))
                              .join(' · ')}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleLeaveOrDeleteGroup(activeGroupThread)}
                          className="min-h-[40px] px-3 rounded-xl border border-white/15 text-xs font-bold text-slate-300 hover:text-rose-300 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>{t.leaveGroup}</span>
                        </button>
                      </>
                    ) : (
                      activeDmPartner && (
                        <>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => onOpenProfile(activeDmPartner.uid, activeDmPartner.tag)}
                              className="font-black text-base text-white hover:underline flex items-center gap-1.5"
                            >
                              <span
                                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                  onlineUids.includes(activeDmPartner.uid)
                                    ? 'bg-emerald-400'
                                    : 'bg-rose-500'
                                }`}
                              />
                              <span className="truncate">{activeDmPartner.tag}</span>
                              <BadgeIcon kind={flagsMap[activeDmPartner.uid]?.badge} />
                            </button>
                            {playingMap[activeDmPartner.uid] && (
                              <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1 mt-0.5">
                                <Gamepad2 className="w-3 h-3 shrink-0" />
                                <span>
                                  {t.playingNow}: {playingMap[activeDmPartner.uid]}
                                </span>
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              void startVoiceCall(activeDmPartner.uid, activeDmPartner.tag)
                            }
                            className="min-h-[40px] px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                          >
                            <Phone className="w-4 h-4" />
                            <span>{t.voiceCall}</span>
                          </button>
                        </>
                      )
                    )}
                  </div>

                  {/* 24/7 Moderation Bot Protection Strip */}
                  <div className="px-4 py-1.5 bg-[#0E0E17] border-b border-white/[0.06] text-[11px] text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate">
                      {lang === 'ar'
                        ? 'بوت الحماية يعمل 24/7 تلقائيًا في الخاص والمجموعات'
                        : lang === 'fr'
                        ? 'Bot de modération actif 24h/24 en privé et groupes'
                        : 'Moderation Bot active 24/7 across DMs & Group Chats'}
                    </span>
                  </div>

                  {/* Messages Stream */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                    {dmMsgs.length === 0 ? (
                      <div className="h-full grid place-items-center text-xs text-slate-400">
                        {t.noMessages}
                      </div>
                    ) : (
                      dmMsgs
                        .filter((m) => !blockedMap[m.senderUid])
                        .map((m) => {
                          const isMe = m.senderUid === uid;
                          return (
                            <div
                              key={m.id}
                              className={`flex ${isMe ? 'justify-start' : 'justify-end'}`}
                            >
                              <div
                                className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm break-words ${
                                  isMe
                                    ? 'bg-violet-600 text-white'
                                    : 'bg-[#1A1A29] border border-white/[0.08] text-slate-100'
                                }`}
                              >
                                {activeGroupThread && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenProfile(m.senderUid, m.senderTag)}
                                    className="text-[11px] font-bold opacity-85 hover:underline flex items-center gap-1 mb-0.5"
                                  >
                                    <span>{m.senderTag}</span>
                                    <BadgeIcon
                                      kind={flagsMap[m.senderUid]?.badge}
                                      className="w-3 h-3"
                                    />
                                  </button>
                                )}
                                {m.mediaUrl ? (
                                  <img
                                    src={m.mediaUrl}
                                    alt={m.text || 'Meme'}
                                    loading="lazy"
                                    className="rounded-xl w-52 max-w-full border border-white/10"
                                  />
                                ) : (
                                  m.text
                                )}
                              </div>
                            </div>
                          );
                        })
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {showDmMemes && (
                    <div className="p-2.5 border-t border-white/[0.08] bg-[#0B0B13]">
                      <MemePicker
                        onSelect={handleSelectDmMeme}
                        onClose={() => setShowDmMemes(false)}
                      />
                    </div>
                  )}

                  <form
                    onSubmit={handleSendDm}
                    className="p-3 border-t border-white/[0.08] bg-[#0E0E17] flex items-center gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => setShowDmMemes((v) => !v)}
                      aria-label={t.gifMemesBtn}
                      className={`min-h-[44px] min-w-[44px] rounded-xl border grid place-items-center shrink-0 ${
                        showDmMemes
                          ? 'bg-violet-600/25 border-violet-500 text-violet-300'
                          : 'bg-[#1A1A29] border-white/10 text-amber-300 hover:bg-white/10'
                      }`}
                    >
                      <Smile className="w-4 h-4" />
                    </button>
                    <input
                      type="text"
                      value={dmInput}
                      onChange={(e) => setDmInput(e.target.value)}
                      maxLength={LIMITS.MESSAGE_MAX}
                      placeholder={t.writeMessage}
                      className="flex-1 h-11 px-3.5 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                    />
                    <button
                      type="submit"
                      aria-label={t.send}
                      className="min-h-[44px] min-w-[44px] rounded-xl bg-violet-600 hover:bg-violet-500 text-white grid place-items-center shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Shaghaf Assistant */}
      {subTab === 'assistant' && (
        <div className="rounded-2xl bg-[#12121D] border border-white/[0.08] flex flex-col h-[500px] overflow-hidden">
          <div className="p-4 border-b border-white/[0.08]">
            <h3 className="font-bold text-base text-white">{t.assistantTab}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{t.assistantIntro}</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {botMessages.map((m, i) => (
              <div key={i} className={`flex ${m.me ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.me
                      ? 'bg-violet-600 text-white'
                      : 'bg-indigo-950/80 border border-indigo-500/30 text-slate-100'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <form
            onSubmit={handleBotSubmit}
            className="p-3 border-t border-white/[0.08] bg-[#0E0E17] flex items-center gap-2"
          >
            <input
              type="text"
              value={botInput}
              onChange={(e) => setBotInput(e.target.value)}
              placeholder={t.assistantPlaceholder}
              className="flex-1 h-11 px-3.5 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
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
    </div>
  );
}
