import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  AlertTriangle,
  Award,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Crown,
  ExternalLink,
  KeyRound,
  Play,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Star,
  Ticket,
  Trophy,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { getGameCoverImage } from '../lib/serverThemes';
import type {
  LfgPost,
  MarketOrder,
  ServiceListing,
  Squad,
  SquadMemberEntry,
  Tournament,
  TournamentCategory,
  TournamentParticipant,
  TournamentTicket,
} from '../types';
import { BadgeIcon } from './BadgeIcon';
import { InAppVideoPlayer } from './InAppVideoPlayer';
import { SquadLineupModal, SquadManagerModal } from './SquadModals';

interface ArenaHubViewProps {
  onOpenCreate: (kind: 'tournament' | 'lfg' | 'service') => void;
  onOpenOrder: (service: ServiceListing) => void;
  onOpenProfile: (uid: string, tag?: string) => void;
  onOpenEditProfile: () => void;
}

interface OfficialBotTournament {
  id: string;
  title: string;
  game: string;
  mode: 'solo' | 'squad';
  category?: TournamentCategory;
  dateLabel: string;
  prize: string;
  officialSource: string;
  imageUrl?: string;
  videoUrl?: string;
  sourceUrl?: string;
}

function inferTournamentCategory(trn: Tournament): TournamentCategory {
  if (trn.category === 'friendly' || trn.category === 'official' || trn.category === 'qualifiers') {
    return trn.category;
  }
  const txt = `${trn.title} ${trn.officialSource || ''}`.toLowerCase();
  if (/تصفي|qualif|challenger|pmco|world tour/.test(txt)) return 'qualifiers';
  if (trn.isBot || /رسمي|official|major|pro/.test(txt)) return 'official';
  return 'friendly';
}

function stableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildTournamentRules(game: string, mode: 'solo' | 'squad', gameId: string, rank: string): string[] {
  const gameLower = game.toLowerCase();
  const safeId = gameId || 'المسجل بالحساب';
  const safeRank = rank || 'الرتبة المسجلة';
  if (gameLower.includes('free fire')) {
    return [
      `الدخول بالمعرّف المسجّل فقط (${safeId}) وعدم تبديل الحساب أثناء الروم.`,
      'يُمنع منعًا باتًا استخدام الهاك أو السكربتات أو استغلال الغليتشات (حظر وإقصاء فوري).',
      mode === 'squad'
        ? 'الالتزام بتشكيلة السكواد الكاملة وعدم التحالف بين الفرق (Teaming).'
        : 'طور فردي: يُمنع أي تحالف أو مساعدة بين اللاعبين داخل الخريطة.',
      'التواجد داخل اللوبي قبل الإقلاع بـ 10 دقائق؛ يُغلق الروم تلقائيًا عند بدء المباراة.',
      'حفظ لقطة شاشة (Screenshot) للنتيجة النهائية عند انتهاء الجولات.',
    ];
  }
  if (gameLower.includes('finals')) {
    return [
      `التسجيل معتمد بمعرّف Embark الخاص بك (${safeId}) ورتبة (${safeRank}).`,
      'مواجهات Cashout بنظام 3v3v3v3؛ يُمنع الخروج المتعمد أو استخدام برامج خارجية.',
      'تفعيل اللعب المشترك (Crossplay ON) قبل الانضمام للوبي الخاص بـ 15 دقيقة.',
      'احترام قواعد اللعب النظيف وعدم استغلال أخطاء الخرائط.',
    ];
  }
  if (gameLower.includes('pubg')) {
    return [
      `الدخول بـ PUBG ID المطابق لملفك (${safeId}) وبمنظور البطولة المحدد.`,
      'ممنوع استخدام المحاكيات في بطولات الموبايل أو أي أدوات مساعدة خارجية.',
      'يبدأ فتح الروم قبل الموعد بـ 15 دقيقة والإقلاع في الموعد المحدد تمامًا.',
      'عدم التحالف مع الخصوم والالتزام بتعليمات منظمي البطولة.',
    ];
  }
  return [
    `الدخول بمعرّف اللعبة المسجّل في ملفك (${safeId}) ورتبة (${safeRank}).`,
    'منع الغش أو البرامج الخارجية أو التحالف غير المسموح به.',
    'الحضور في الروم قبل الموعد بـ 15 دقيقة والانتظار حتى إشارة الانطلاق.',
    'تصوير شاشة النتيجة النهائية لتوثيق الفوز والمكافآت.',
  ];
}

function buildFallbackTicket(
  tournament: Tournament,
  uid: string,
  gamerTag: string,
  gameId: string,
  rank: string,
  participant?: TournamentParticipant
): TournamentTicket {
  const mode: 'solo' | 'squad' = tournament.mode === 'solo' ? 'solo' : 'squad';
  const trnSeed = stableHash(tournament.id || tournament.title || tournament.game);
  const playerSeed = stableHash(`${tournament.id}:${uid}`);
  const gameLower = (tournament.game || '').toLowerCase();
  const gamePrefix = gameLower.includes('free fire')
    ? 'FF'
    : gameLower.includes('pubg')
    ? 'PM'
    : gameLower.includes('finals')
    ? 'TF'
    : gameLower.includes('valorant')
    ? 'VAL'
    : gameLower.includes('fortnite')
    ? 'FN'
    : gameLower.includes('warzone')
    ? 'WZ'
    : gameLower.includes('fc')
    ? 'FC'
    : 'SHG';

  const roomNumA = 1000 + (trnSeed % 9000);
  const roomNumB = 1000 + ((trnSeed >> 8) % 9000);
  const finalGameId = (participant?.gameId || gameId || gamerTag || 'Player').slice(0, 40);
  const finalRank = (participant?.rank || rank || 'Competitor').slice(0, 40);

  return {
    tournamentId: tournament.id,
    title: tournament.title,
    game: tournament.game,
    mode,
    officialSource: tournament.officialSource || 'Shaghaf Official Arena',
    sourceUrl: tournament.sourceUrl?.startsWith('https://') ? tournament.sourceUrl : undefined,
    registrationCode: participant?.registrationCode || `${gamePrefix}-${String((playerSeed % 90000) + 10000)}`,
    roomId: participant?.roomId || `${gamePrefix}-${roomNumA}-${roomNumB}`,
    roomCode: participant?.roomCode || `SHG${100 + ((trnSeed >> 4) % 899)}`,
    matchTime: participant?.matchTime || tournament.dateLabel || 'اليوم · 20:00',
    waitTime: 'يُفتح الروم قبل الموعد بـ 15 دقيقة · ينتظرك المنظمون حتى قبل الإقلاع بـ 5 دقائق',
    rules: buildTournamentRules(tournament.game, mode, finalGameId, finalRank),
    filledProfile: {
      gamerTag: participant?.squadName
        ? `[${participant.squadTag || 'SQD'}] ${participant.squadName}`
        : participant?.gamerTag || gamerTag,
      gameId: finalGameId,
      rank: finalRank,
    },
    ...(participant?.squadName && Array.isArray(participant.selectedMembers)
      ? {
          squad: {
            id: participant.squadId || 'squad',
            name: participant.squadName,
            tag: participant.squadTag || 'SQD',
            selectedMembers: participant.selectedMembers,
          },
        }
      : {}),
    createdAtMs: Date.now(),
  };
}

function TournamentCard({
  tournament,
  cachedTicket,
  onOpenProfile,
  onSaveTicket,
  onRemoveTicket,
  onOpenTicket,
  onIncompleteProfile,
  onRequestSquadRegister,
}: {
  tournament: Tournament;
  cachedTicket?: TournamentTicket;
  onOpenProfile: (uid: string, tag?: string) => void;
  onSaveTicket: (ticket: TournamentTicket) => void;
  onRemoveTicket: (tournamentId: string) => void;
  onOpenTicket: (ticket: TournamentTicket) => void;
  onIncompleteProfile: (missingFields: string[], tournamentTitle: string) => void;
  onRequestSquadRegister: (tournament: Tournament) => void;
}) {
  const { firebaseUser, profile, flagsMap, lang, t, addXp, showToast, isBanned } = useApp();
  const [participants, setParticipants] = useState<TournamentParticipant[]>([]);
  const [participantsLoaded, setParticipantsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    setParticipants([]);
    setParticipantsLoaded(false);
    const unsub = onSnapshot(
      collection(db, 'tournaments', tournament.id, 'participants'),
      (snap) => {
        setParticipants(snap.docs.map((d) => d.data() as TournamentParticipant));
        setParticipantsLoaded(true);
      },
      () => {
        setParticipants([]);
        setParticipantsLoaded(true);
      }
    );
    return () => unsub();
  }, [tournament.id]);

  if (!firebaseUser || !profile) return null;
  const uid = firebaseUser.uid;
  const myParticipant = participantsLoaded
    ? participants.find((p) => p.uid === uid) ||
      participants.find(
        (p) =>
          Array.isArray(p.selectedMembers) &&
          p.selectedMembers.some((m) => m.uid === uid)
      )
    : undefined;
  const joined = Boolean(myParticipant);
  const isLeaderRegistrant = !myParticipant || myParticipant.uid === uid;
  const isSquadTournament = tournament.mode !== 'solo';
  const coverUrl = tournament.imageUrl || getGameCoverImage(tournament.game);
  const category = inferTournamentCategory(tournament);
  const categoryLabel =
    category === 'official'
      ? t.tournamentCatOfficial
      : category === 'qualifiers'
      ? t.tournamentCatQualifiers
      : t.tournamentCatFriendly;

  const requestBotTicket = async (viewPass = false): Promise<TournamentTicket | null> => {
    const gamerTag = (profile.gamerTag || firebaseUser.displayName || 'Player').trim();
    const gameId = (profile.gameId || myParticipant?.gameId || '').trim();
    const rank = (profile.rank || myParticipant?.rank || '').trim();

    if (!viewPass) {
      const missing: string[] = [];
      if (!gamerTag || gamerTag.length < 3) missing.push('gamerTag');
      if (!gameId) missing.push('gameId');
      if (!rank) missing.push('rank');

      if (missing.length > 0) {
        onIncompleteProfile(missing, tournament.title);
        return null;
      }
    }

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/tournaments/bot-register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tournamentId: tournament.id,
          title: tournament.title,
          game: tournament.game,
          mode: tournament.mode === 'solo' ? 'solo' : 'squad',
          dateLabel: tournament.dateLabel,
          officialSource: tournament.officialSource || 'Shaghaf Official Arena',
          sourceUrl: tournament.sourceUrl || '',
          gamerTag,
          gameId: gameId || 'Player',
          rank: rank || 'Ranked',
          viewPass,
        }),
      });

      if (res.status === 422 && !viewPass) {
        const errData = (await res.json().catch(() => ({}))) as { missingFields?: string[] };
        onIncompleteProfile(
          Array.isArray(errData.missingFields) && errData.missingFields.length > 0
            ? errData.missingFields
            : ['gameId', 'rank'],
          tournament.title
        );
        return null;
      }

      if (res.ok) {
        const payload = (await res.json()) as { ok?: boolean; ticket?: TournamentTicket };
        if (payload.ok && payload.ticket) {
          return payload.ticket;
        }
      }
    } catch {
      // Fallback below when viewing pass or server is unreachable
    }

    return buildFallbackTicket(tournament, uid, gamerTag, gameId, rank, myParticipant);
  };

  const handleOpenPass = async () => {
    if (myParticipant?.roomId && myParticipant?.roomCode) {
      const firestoreTicket = buildFallbackTicket(
        tournament,
        uid,
        profile.gamerTag,
        profile.gameId || '',
        profile.rank || '',
        myParticipant
      );
      onSaveTicket(firestoreTicket);
      onOpenTicket(firestoreTicket);
      return;
    }
    if (cachedTicket) {
      onOpenTicket(cachedTicket);
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const ticket =
        (await requestBotTicket(true)) ||
        buildFallbackTicket(
          tournament,
          uid,
          profile.gamerTag,
          profile.gameId || '',
          profile.rank || '',
          myParticipant
        );
      // Persist missing room info cleanly into Firestore participant doc
      if (joined) {
        const pRef = doc(db, 'tournaments', tournament.id, 'participants', uid);
        const rawTag = (profile.gamerTag || 'Player').trim().slice(0, 16);
        const safeTag = rawTag.length >= 3 ? rawTag : `${rawTag}___`.slice(0, 3);
        void setDoc(pRef, {
          uid,
          gamerTag: safeTag,
          roomId: ticket.roomId.slice(0, 64),
          roomCode: ticket.roomCode.slice(0, 64),
          registrationCode: ticket.registrationCode.slice(0, 64),
          matchTime: ticket.matchTime.slice(0, 80),
          gameId: ticket.filledProfile.gameId.slice(0, 40),
          rank: ticket.filledProfile.rank.slice(0, 40),
          joinedAt: serverTimestamp(),
        }).catch(() => {});
      }
      onSaveTicket(ticket);
      onOpenTicket(ticket);
    } finally {
      setBusy(false);
    }
  };

  const toggleRegister = async () => {
    if (busy) return;
    if (isBanned) {
      showToast(t.bannedAlert);
      return;
    }

    if (joined) {
      if (!isLeaderRegistrant) {
        void handleOpenPass();
        return;
      }
      setBusy(true);
      const pRef = doc(db, 'tournaments', tournament.id, 'participants', uid);
      try {
        await deleteDoc(pRef);
        setParticipants((prev) => prev.filter((p) => p.uid !== uid));
        onRemoveTicket(tournament.id);
        showToast(t.tournamentUnregisteredToast);
      } catch (err) {
        showToast(t.tournamentRegisterError);
        console.error('Tournament unregister error:', err);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (isSquadTournament) {
      onRequestSquadRegister(tournament);
      return;
    }

    setBusy(true);
    const tRef = doc(db, 'tournaments', tournament.id);
    const pRef = doc(db, 'tournaments', tournament.id, 'participants', uid);

    try {
      const ticket = await requestBotTicket(false);
      if (!ticket) {
        setBusy(false);
        return;
      }

      const snap = await getDoc(tRef);
      if (!snap.exists()) {
        const safeTitle = (tournament.title || 'Tournament').trim().slice(0, 80);
        const safeGame = (tournament.game || 'Game').trim().slice(0, 40);
        const safeDate = (tournament.dateLabel || '2026').trim().slice(0, 40);
        const rawTag = (profile.gamerTag || 'Player').trim().slice(0, 16);
        const safeTag = rawTag.length >= 3 ? rawTag : `${rawTag}___`.slice(0, 3);
        const baseDoc: Record<string, unknown> = {
          creatorUid: uid,
          creatorTag: safeTag,
          title: safeTitle.length >= 3 ? safeTitle : `${safeTitle} Cup`,
          game: safeGame.length >= 2 ? safeGame : 'Gaming',
          dateLabel: safeDate.length >= 1 ? safeDate : 'TBD',
          prize: (tournament.prize || '').slice(0, 40),
          mode: tournament.mode === 'solo' ? 'solo' : 'squad',
          category,
          isBot: Boolean(tournament.isBot),
          officialSource: (tournament.officialSource || '').slice(0, 60),
          imageUrl: coverUrl.slice(0, 1000),
          visibility: 'public',
          createdAt: serverTimestamp(),
        };
        if (
          tournament.videoUrl &&
          (tournament.videoUrl.startsWith('https://') ||
            tournament.videoUrl.startsWith('/uploads/'))
        ) {
          baseDoc.videoUrl = tournament.videoUrl.slice(0, 1000);
        }
        if (tournament.sourceUrl && tournament.sourceUrl.startsWith('https://')) {
          baseDoc.sourceUrl = tournament.sourceUrl.slice(0, 500);
        }
        await setDoc(tRef, baseDoc);
      }

      const rawTag = (profile.gamerTag || 'Player').trim().slice(0, 16);
      const safeTag = rawTag.length >= 3 ? rawTag : `${rawTag}___`.slice(0, 3);
      const participantPayload: TournamentParticipant = {
        uid,
        gamerTag: safeTag,
        roomId: ticket.roomId.slice(0, 64),
        roomCode: ticket.roomCode.slice(0, 64),
        registrationCode: ticket.registrationCode.slice(0, 64),
        matchTime: ticket.matchTime.slice(0, 80),
        gameId: ticket.filledProfile.gameId.slice(0, 40),
        rank: ticket.filledProfile.rank.slice(0, 40),
        joinedAt: serverTimestamp(),
      };
      await setDoc(pRef, participantPayload);

      const rulesPreview = ticket.rules
        .slice(0, 3)
        .map((r, i) => `${i + 1}. ${r}`)
        .join('\n');
      const botBody = [
        `${ticket.title} (${ticket.game})`,
        `ID: ${ticket.roomId} | Code: ${ticket.roomCode}`,
        `${t.entryCodeLabel}: ${ticket.registrationCode}`,
        `${t.matchTimeLabel}: ${ticket.matchTime}`,
        `${t.waitTimeLabel}: ${ticket.waitTime}`,
        `${t.tournamentRulesLabel}:\n${rulesPreview}`,
      ]
        .join('\n')
        .slice(0, 880);

      try {
        await addDoc(collection(db, 'bot_messages', uid, 'items'), {
          targetUid: uid,
          title: `${t.botPassTitle}: ${tournament.game}`.slice(0, 80),
          body: botBody,
          kind: 'tournament',
          read: true,
          createdAt: serverTimestamp(),
        });
      } catch {
        // Non-blocking if inbox archive fails
      }

      setParticipants((prev) =>
        prev.some((p) => p.uid === uid) ? prev : [...prev, participantPayload]
      );
      onSaveTicket(ticket);
      onOpenTicket(ticket);
      void addXp(10);
      showToast(t.tournamentRegisteredToast);
    } catch (err) {
      showToast(t.tournamentRegisterError);
      console.error('Tournament register error:', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`rounded-2xl bg-[#12121D] border overflow-hidden flex flex-col justify-between ${
        tournament.isBot ? 'border-violet-500/35' : 'border-white/[0.08]'
      }`}
    >
      {/* Tournament Cover Photo or Official Video Player (when available) */}
      <div className="relative aspect-video bg-[#0B0B13] overflow-hidden">
        {showVideo && tournament.videoUrl ? (
          <InAppVideoPlayer
            coverUrl={coverUrl}
            videoUrl={tournament.videoUrl}
            lang={lang}
            onClose={() => setShowVideo(false)}
          />
        ) : (
          <>
            <img
              src={coverUrl}
              alt={tournament.title}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#12121D] via-black/30 to-transparent" />
            <div className="absolute bottom-2.5 inset-x-3.5 flex items-center justify-between gap-2 text-xs font-bold">
              <span className="text-white drop-shadow">
                {tournament.game} ·{' '}
                <span className={tournament.mode === 'solo' ? 'text-emerald-300' : 'text-amber-300'}>
                  {tournament.mode === 'solo' ? t.soloMode : t.squadMode}
                </span>
              </span>
              {tournament.videoUrl && (
                <button
                  type="button"
                  onClick={() => setShowVideo(true)}
                  className="min-h-[34px] px-3 rounded-lg bg-violet-600/95 hover:bg-violet-500 text-white text-[11px] font-bold flex items-center gap-1 whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{t.watchInAppVideo}</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-base text-white leading-snug">{tournament.title}</h3>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-md border shrink-0 whitespace-nowrap ${
                category === 'official'
                  ? 'bg-amber-500/15 border-amber-500/35 text-amber-300'
                  : category === 'qualifiers'
                  ? 'bg-sky-500/15 border-sky-500/35 text-sky-300'
                  : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
              }`}
            >
              {categoryLabel}
            </span>
          </div>

          {tournament.isBot && (
            <div className="text-[11px] text-violet-300 font-bold flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 shrink-0" />
              <span>{tournament.officialSource || 'Shaghaf Bot'}</span>
            </div>
          )}

          <div className="text-xs text-slate-400 flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-slate-300 font-medium">
              <Calendar className="w-3.5 h-3.5 text-violet-400" />
              <span>{tournament.dateLabel}</span>
            </span>
            {tournament.prize && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-400 font-semibold">{tournament.prize}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {participants.length} {t.participants}
            </span>
          </div>

          {!tournament.isBot && (
            <button
              type="button"
              onClick={() => onOpenProfile(tournament.creatorUid, tournament.creatorTag)}
              className="text-xs text-slate-300 hover:text-white flex items-center gap-1"
            >
              <span>{tournament.creatorTag}</span>
              <BadgeIcon kind={flagsMap[tournament.creatorUid]?.badge} className="w-3.5 h-3.5" />
            </button>
          )}
          {joined && myParticipant?.squadName && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-[11px] text-emerald-200 flex items-center justify-between gap-2">
              <span className="font-bold truncate">
                [{myParticipant.squadTag || 'SQD'}] {myParticipant.squadName}
              </span>
              {Array.isArray(myParticipant.selectedMembers) && (
                <span className="text-emerald-300 font-semibold shrink-0 tabular-nums">
                  {myParticipant.selectedMembers.length}/6
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={toggleRegister}
            className={`flex-1 min-w-[130px] min-h-[44px] px-4 rounded-xl text-xs font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5 ${
              joined
                ? 'bg-[#1A1A29] border border-white/15 text-slate-200 hover:bg-white/10'
                : 'bg-violet-600 hover:bg-violet-500 text-white'
            }`}
          >
            {busy ? (
              <span>{t.botRegisteringBtn}</span>
            ) : joined ? (
              <span>{isLeaderRegistrant ? t.unregisterTournament : t.botPassBtn}</span>
            ) : (
              <>
                {isSquadTournament ? (
                  <Users className="w-4 h-4 shrink-0" />
                ) : (
                  <Bot className="w-4 h-4 shrink-0" />
                )}
                <span>{t.registerTournament}</span>
              </>
            )}
          </button>

          {joined && (
            <button
              type="button"
              disabled={busy}
              onClick={handleOpenPass}
              className="min-h-[44px] px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Ticket className="w-4 h-4" />
              <span>{t.botPassBtn}</span>
            </button>
          )}

          {tournament.sourceUrl && (
            <a
              href={tournament.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t.openOfficialSource}
              className="min-h-[44px] px-3 rounded-xl bg-[#1A1A29] hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5 text-violet-400" />
              <span className="hidden sm:inline">{t.openOfficialSource}</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function ArenaHubView({
  onOpenCreate,
  onOpenOrder,
  onOpenProfile,
  onOpenEditProfile,
}: ArenaHubViewProps) {
  const { firebaseUser, profile, flagsMap, blockedMap, lang, t, showToast, addXp, isBanned } = useApp();
  const [tab, setTab] = useState<'tournaments' | 'lfg' | 'market'>('tournaments');
  const [tournamentCategory, setTournamentCategory] = useState<'all' | TournamentCategory>('all');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [officialTournaments, setOfficialTournaments] = useState<OfficialBotTournament[]>([]);
  const [lfgList, setLfgList] = useState<LfgPost[]>([]);
  const [services, setServices] = useState<ServiceListing[]>([]);
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [ledSquads, setLedSquads] = useState<Squad[]>([]);
  const [memberSquads, setMemberSquads] = useState<Squad[]>([]);

  const [squadManagerOpen, setSquadManagerOpen] = useState(false);
  const [pendingSquadTournament, setPendingSquadTournament] = useState<Tournament | null>(null);
  const [squadLineupTournament, setSquadLineupTournament] = useState<Tournament | null>(null);
  const [squadRegBusy, setSquadRegBusy] = useState(false);

  const [ticketsMap, setTicketsMap] = useState<Record<string, TournamentTicket>>({});
  const [activeTicket, setActiveTicket] = useState<TournamentTicket | null>(null);
  const [incompleteModal, setIncompleteModal] = useState<{
    missingFields: string[];
    tournamentTitle: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    try {
      const raw = localStorage.getItem(`sg_trn_tickets_${firebaseUser.uid}`);
      if (raw) {
        setTicketsMap(JSON.parse(raw) as Record<string, TournamentTicket>);
      }
    } catch {
      // ignore storage errors
    }
  }, [firebaseUser]);

  const saveTicket = (ticket: TournamentTicket) => {
    if (!firebaseUser) return;
    setTicketsMap((prev) => {
      const next = { ...prev, [ticket.tournamentId]: ticket };
      try {
        localStorage.setItem(`sg_trn_tickets_${firebaseUser.uid}`, JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
      return next;
    });
  };

  const removeTicket = (tournamentId: string) => {
    if (!firebaseUser) return;
    setTicketsMap((prev) => {
      if (!(tournamentId in prev)) return prev;
      const next = { ...prev };
      delete next[tournamentId];
      try {
        localStorage.setItem(`sg_trn_tickets_${firebaseUser.uid}`, JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
      return next;
    });
  };

  const copyField = (key: string, value: string) => {
    void navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    showToast(`${t.copiedValue} (${value})`);
    setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 2000);
  };

  useEffect(() => {
    let active = true;
    fetch('/api/tournaments/official')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { items?: OfficialBotTournament[] } | null) => {
        if (active && data?.items) {
          setOfficialTournaments(data.items);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    const uid = firebaseUser.uid;

    const tsMs = (v: unknown) => {
      const obj = v as { toMillis?: () => number } | undefined;
      return typeof obj?.toMillis === 'function' ? obj.toMillis() : Date.now();
    };

    const unsubTrn = onSnapshot(
      query(collection(db, 'tournaments'), where('visibility', '==', 'public'), limit(60)),
      (snap) =>
        setTournaments(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Tournament, 'id'>) }))
            .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt))
        ),
      (err) => console.error('tournaments listener error:', err)
    );

    const unsubLfg = onSnapshot(
      query(collection(db, 'lfg'), where('visibility', '==', 'public'), limit(40)),
      (snap) =>
        setLfgList(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<LfgPost, 'id'>) }))
            .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt))
        ),
      (err) => console.error('lfg listener error:', err)
    );

    const unsubSrv = onSnapshot(
      query(collection(db, 'services'), where('visibility', '==', 'public'), limit(50)),
      (snap) =>
        setServices(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<ServiceListing, 'id'>) }))
            .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt))
        ),
      (err) => console.error('services listener error:', err)
    );

    const unsubBuyerOrders = onSnapshot(
      query(collection(db, 'orders'), where('buyerUid', '==', uid)),
      (snap) => {
        const buyer = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<MarketOrder, 'id'>),
        }));
        setOrders((prev) => {
          const sellerOnly = prev.filter((o) => o.buyerUid !== uid);
          return [...buyer, ...sellerOnly];
        });
      },
      (err) => console.error('buyer orders listener error:', err)
    );

    const unsubSellerOrders = onSnapshot(
      query(collection(db, 'orders'), where('sellerUid', '==', uid)),
      (snap) => {
        const seller = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<MarketOrder, 'id'>),
        }));
        setOrders((prev) => {
          const map = new Map<string, MarketOrder>();
          prev.forEach((o) => map.set(o.id, o));
          seller.forEach((o) => map.set(o.id, o));
          return Array.from(map.values());
        });
      },
      (err) => console.error('seller orders listener error:', err)
    );

    const unsubLedSquads = onSnapshot(
      query(collection(db, 'squads'), where('leaderUid', '==', uid)),
      (snap) => {
        setLedSquads(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Squad, 'id'>) }))
            .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt))
        );
      },
      (err) => console.error('led squads listener error:', err)
    );

    const unsubMemberSquads = onSnapshot(
      query(collection(db, 'squads'), where('memberUids', 'array-contains', uid)),
      (snap) => {
        setMemberSquads(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Squad, 'id'>) }))
            .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt))
        );
      },
      (err) => console.error('member squads listener error:', err)
    );

    return () => {
      unsubTrn();
      unsubLfg();
      unsubSrv();
      unsubBuyerOrders();
      unsubSellerOrders();
      unsubLedSquads();
      unsubMemberSquads();
    };
  }, [firebaseUser]);

  if (!firebaseUser) return null;
  const uid = firebaseUser.uid;

  const handleRequestSquadRegister = (tournament: Tournament) => {
    if (isBanned) {
      showToast(t.bannedAlert);
      return;
    }
    if (ledSquads.length === 0) {
      setPendingSquadTournament(tournament);
      setSquadManagerOpen(true);
      return;
    }
    setSquadLineupTournament(tournament);
  };

  const handleConfirmSquadLineup = async (
    squad: Squad,
    selectedMembers: SquadMemberEntry[]
  ) => {
    const tournament = squadLineupTournament;
    if (!tournament || !profile || squadRegBusy) return;
    if (selectedMembers.length === 0) {
      showToast(t.squadPickAtLeastOne);
      return;
    }

    setSquadRegBusy(true);
    try {
      const rawTag = (profile.gamerTag || 'Player').trim().slice(0, 16);
      const safeTag = rawTag.length >= 3 ? rawTag : `${rawTag}___`.slice(0, 3);
      const leaderEntry = selectedMembers[0] || squad.members[0];

      let ticket: TournamentTicket | null = null;
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch('/api/tournaments/bot-register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            tournamentId: tournament.id,
            title: tournament.title,
            game: tournament.game,
            mode: 'squad',
            dateLabel: tournament.dateLabel,
            officialSource: tournament.officialSource || 'Shaghaf Official Arena',
            sourceUrl: tournament.sourceUrl || '',
            gamerTag: safeTag,
            gameId: leaderEntry?.gameId || profile.gameId || safeTag,
            rank: leaderEntry?.rank || profile.rank || 'Competitor',
            squadId: squad.id,
            squadName: squad.name,
            squadTag: squad.tag,
            selectedMembers,
          }),
        });
        if (res.ok) {
          const payload = (await res.json()) as { ok?: boolean; ticket?: TournamentTicket };
          if (payload.ok && payload.ticket) {
            ticket = payload.ticket;
          }
        }
      } catch {
        // Fallback below
      }

      if (!ticket) {
        ticket = buildFallbackTicket(
          tournament,
          uid,
          safeTag,
          leaderEntry?.gameId || profile.gameId || safeTag,
          leaderEntry?.rank || profile.rank || 'Competitor',
          {
            uid,
            gamerTag: safeTag,
            squadId: squad.id,
            squadName: squad.name,
            squadTag: squad.tag,
            selectedMembers,
          }
        );
      }

      const tRef = doc(db, 'tournaments', tournament.id);
      const pRef = doc(db, 'tournaments', tournament.id, 'participants', uid);
      const tSnap = await getDoc(tRef);
      if (!tSnap.exists()) {
        const safeTitle = (tournament.title || 'Tournament').trim().slice(0, 80);
        const safeGame = (tournament.game || 'Game').trim().slice(0, 40);
        const safeDate = (tournament.dateLabel || '2026').trim().slice(0, 40);
        const coverUrl = tournament.imageUrl || getGameCoverImage(tournament.game);
        const baseDoc: Record<string, unknown> = {
          creatorUid: uid,
          creatorTag: safeTag,
          title: safeTitle.length >= 3 ? safeTitle : `${safeTitle} Cup`,
          game: safeGame.length >= 2 ? safeGame : 'Gaming',
          dateLabel: safeDate.length >= 1 ? safeDate : 'TBD',
          prize: (tournament.prize || '').slice(0, 40),
          mode: 'squad',
          category: inferTournamentCategory(tournament),
          isBot: Boolean(tournament.isBot),
          officialSource: (tournament.officialSource || '').slice(0, 60),
          imageUrl: coverUrl.slice(0, 1000),
          visibility: 'public',
          createdAt: serverTimestamp(),
        };
        if (
          tournament.videoUrl &&
          (tournament.videoUrl.startsWith('https://') ||
            tournament.videoUrl.startsWith('/uploads/'))
        ) {
          baseDoc.videoUrl = tournament.videoUrl.slice(0, 1000);
        }
        if (tournament.sourceUrl && tournament.sourceUrl.startsWith('https://')) {
          baseDoc.sourceUrl = tournament.sourceUrl.slice(0, 500);
        }
        await setDoc(tRef, baseDoc);
      }

      const participantDoc: TournamentParticipant = {
        uid,
        gamerTag: safeTag,
        roomId: ticket.roomId.slice(0, 64),
        roomCode: ticket.roomCode.slice(0, 64),
        registrationCode: ticket.registrationCode.slice(0, 64),
        matchTime: ticket.matchTime.slice(0, 80),
        gameId: (leaderEntry?.gameId || profile.gameId || safeTag).slice(0, 40),
        rank: (leaderEntry?.rank || profile.rank || 'Competitor').slice(0, 40),
        squadId: squad.id.slice(0, 128),
        squadName: squad.name.slice(0, 40),
        squadTag: squad.tag.slice(0, 10),
        selectedMembers: selectedMembers.slice(0, 6),
        joinedAt: serverTimestamp(),
      };
      await setDoc(pRef, participantDoc);

      const lineupLines = selectedMembers
        .map((m, idx) => `${idx + 1}. ${m.gamerTag} (${m.gameId})`)
        .join('\n');
      const botBody = [
        `[${squad.tag}] ${squad.name} → ${ticket.title}`,
        `ID: ${ticket.roomId} | Code: ${ticket.roomCode}`,
        `${t.entryCodeLabel}: ${ticket.registrationCode}`,
        `${t.matchTimeLabel}: ${ticket.matchTime}`,
        `${t.squadTicketRosterTitle}:\n${lineupLines}`,
      ]
        .join('\n')
        .slice(0, 880);

      // Dispatch ticket via Shaghaf Bot to Leader AND every selected member with a Shaghaf UID
      const recipientUids = Array.from(
        new Set([
          uid,
          ...selectedMembers.map((m) => m.uid).filter((id) => id && id.length > 0),
        ])
      );

      await Promise.all(
        recipientUids.map((targetUid) =>
          addDoc(collection(db, 'bot_messages', targetUid, 'items'), {
            targetUid,
            squadId: squad.id,
            title: `${t.botPassTitle}: [${squad.tag}] ${squad.name}`.slice(0, 80),
            body: botBody,
            kind: 'tournament',
            read: targetUid === uid,
            createdAt: serverTimestamp(),
          }).catch(() => null)
        )
      );

      saveTicket(ticket);
      setSquadLineupTournament(null);
      setActiveTicket(ticket);
      void addXp(15);
      showToast(t.squadRegisteredToast);
    } catch (err) {
      showToast(t.tournamentRegisterError);
      console.error('Squad tournament registration error:', err);
    } finally {
      setSquadRegBusy(false);
    }
  };

  const updateOrderStatus = async (order: MarketOrder, status: 'delivered' | 'completed') => {
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status,
        updatedAt: serverTimestamp(),
      });
      if (status === 'completed') addXp(25);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const rateOrder = async (order: MarketOrder, rating: number) => {
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        rating,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#12121D] border border-white/[0.08] flex-1 min-w-[260px]">
          <button
            type="button"
            onClick={() => setTab('tournaments')}
            className={`min-h-[44px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
              tab === 'tournaments' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Trophy className="w-4 h-4 shrink-0" />
            <span className="truncate">{t.tournamentsTab}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('lfg')}
            className={`min-h-[44px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
              tab === 'lfg' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="truncate">{t.lfgTab}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('market')}
            className={`min-h-[44px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
              tab === 'market' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-4 h-4 shrink-0" />
            <span className="truncate">{t.marketTab}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {tab === 'tournaments' && (
            <button
              type="button"
              onClick={() => {
                setPendingSquadTournament(null);
                setSquadManagerOpen(true);
              }}
              className={`min-h-[44px] px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                ledSquads.length > 0
                  ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30'
                  : 'bg-[#12121D] border-violet-500/40 text-violet-300 hover:bg-violet-600/20'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>{t.manageSquadBtn}</span>
              {ledSquads.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/25 text-[10px] font-black tabular-nums">
                  {ledSquads.length}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              onOpenCreate(tab === 'tournaments' ? 'tournament' : tab === 'lfg' ? 'lfg' : 'service')
            }
            className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>
              {tab === 'tournaments'
                ? t.createTournament
                : tab === 'lfg'
                ? t.createLfg
                : t.createService}
            </span>
          </button>
        </div>
      </div>

      {/* Tournaments */}
      {tab === 'tournaments' && (() => {
        const mergedMap = new Map<string, Tournament>();
        officialTournaments.forEach((bt) => {
          mergedMap.set(bt.id, {
            id: bt.id,
            creatorUid: 'shaghaf_bot',
            creatorTag: 'Shaghaf Bot',
            title: bt.title,
            game: bt.game,
            mode: bt.mode,
            category: bt.category,
            dateLabel: bt.dateLabel,
            prize: bt.prize,
            isBot: true,
            officialSource: bt.officialSource,
            imageUrl: bt.imageUrl,
            videoUrl: bt.videoUrl,
            sourceUrl: bt.sourceUrl,
            visibility: 'public',
            createdAt: null,
          });
        });
        tournaments.forEach((trn) => {
          const prev = mergedMap.get(trn.id);
          mergedMap.set(trn.id, prev ? { ...prev, ...trn, category: trn.category || prev.category } : trn);
        });
        const allTournaments = Array.from(mergedMap.values());
        const counts: Record<'all' | TournamentCategory, number> = {
          all: allTournaments.length,
          friendly: allTournaments.filter((trn) => inferTournamentCategory(trn) === 'friendly').length,
          official: allTournaments.filter((trn) => inferTournamentCategory(trn) === 'official').length,
          qualifiers: allTournaments.filter((trn) => inferTournamentCategory(trn) === 'qualifiers').length,
        };
        const filteredTournaments =
          tournamentCategory === 'all'
            ? allTournaments
            : allTournaments.filter((trn) => inferTournamentCategory(trn) === tournamentCategory);
        const botList = filteredTournaments.filter((trn) => trn.isBot);
        const communityList = filteredTournaments.filter((trn) => !trn.isBot);

        const categoryFilters: Array<{ id: 'all' | TournamentCategory; label: string }> = [
          { id: 'all', label: t.tournamentCatAll },
          { id: 'friendly', label: t.tournamentCatFriendly },
          { id: 'official', label: t.tournamentCatOfficial },
          { id: 'qualifiers', label: t.tournamentCatQualifiers },
        ];

        return (
          <div className="space-y-5">
            {/* Tournament Sub-Category Filters */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {categoryFilters.map((cat) => {
                const active = tournamentCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setTournamentCategory(cat.id)}
                    className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 border flex items-center gap-2 transition-colors ${
                      active
                        ? 'bg-violet-600 border-violet-500 text-white'
                        : 'bg-[#12121D] border-white/[0.08] text-slate-300 hover:text-white hover:border-white/20'
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span
                      className={`text-[11px] tabular-nums ${
                        active ? 'text-violet-100' : 'text-slate-400'
                      }`}
                    >
                      ({counts[cat.id]})
                    </span>
                  </button>
                );
              })}
            </div>

            {filteredTournaments.length === 0 ? (
              <div className="rounded-2xl bg-[#12121D] border border-white/[0.08] p-8 text-center text-sm text-slate-400">
                {t.noTournamentsInCategory}
              </div>
            ) : (
              <>
                {botList.length > 0 && (
                  <section className="space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-violet-300">
                      <Bot className="w-4 h-4 text-violet-400" />
                      <span>{t.officialTournamentsTitle}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {botList.map((trn) => (
                        <TournamentCard
                          key={trn.id}
                          tournament={trn}
                          cachedTicket={ticketsMap[trn.id]}
                          onOpenProfile={onOpenProfile}
                          onSaveTicket={saveTicket}
                          onRemoveTicket={removeTicket}
                          onOpenTicket={setActiveTicket}
                          onIncompleteProfile={(missingFields, tournamentTitle) =>
                            setIncompleteModal({ missingFields, tournamentTitle })
                          }
                          onRequestSquadRegister={handleRequestSquadRegister}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {communityList.length > 0 && (
                  <section className="space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                      <Trophy className="w-4 h-4 text-amber-400" />
                      <span>{t.tournamentsTab}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {communityList.map((trn) => (
                        <TournamentCard
                          key={trn.id}
                          tournament={trn}
                          cachedTicket={ticketsMap[trn.id]}
                          onOpenProfile={onOpenProfile}
                          onSaveTicket={saveTicket}
                          onRemoveTicket={removeTicket}
                          onOpenTicket={setActiveTicket}
                          onIncompleteProfile={(missingFields, tournamentTitle) =>
                            setIncompleteModal({ missingFields, tournamentTitle })
                          }
                          onRequestSquadRegister={handleRequestSquadRegister}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* LFG */}
      {tab === 'lfg' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {lfgList
            .filter((l) => !blockedMap[l.authorUid])
            .map((item) => (
              <div
                key={item.id}
                className="rounded-2xl bg-[#12121D] border border-white/[0.08] p-4 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenProfile(item.authorUid, item.authorTag)}
                      className="font-bold text-base text-white hover:underline flex items-center gap-1.5"
                    >
                      <span>{item.authorTag}</span>
                      <BadgeIcon kind={flagsMap[item.authorUid]?.badge} />
                    </button>
                    <span className="text-xs font-bold text-violet-400">{item.game}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">
                    {t.rank}: {item.rank} · {item.schedule}
                  </p>
                </div>

                {item.authorUid !== uid && (
                  <button
                    type="button"
                    onClick={() => {
                      showToast(`${t.joinSent} ${item.authorTag}`);
                      addXp(3);
                    }}
                    className="min-h-[44px] px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold"
                  >
                    {t.joinSquad}
                  </button>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Skill Market & Escrow Orders */}
      {tab === 'market' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {services
              .filter((s) => !blockedMap[s.sellerUid])
              .map((srv) => (
                <div
                  key={srv.id}
                  className="rounded-2xl bg-[#12121D] border border-white/[0.08] p-4 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-bold text-base text-white">{srv.title}</h3>
                      <span className="font-bold text-amber-400 tabular-nums whitespace-nowrap">
                        ${srv.price}
                      </span>
                    </div>
                    {srv.description && (
                      <p className="mt-1.5 text-xs text-slate-300 leading-relaxed">
                        {srv.description}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenProfile(srv.sellerUid, srv.sellerTag)}
                      className="mt-2 text-xs text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      <span>{srv.sellerTag}</span>
                      <BadgeIcon kind={flagsMap[srv.sellerUid]?.badge} className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {srv.sellerUid !== uid && (
                    <button
                      type="button"
                      onClick={() => onOpenOrder(srv)}
                      className="min-h-[44px] px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold"
                    >
                      {t.orderNow}
                    </button>
                  )}
                </div>
              ))}
          </div>

          {orders.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-white/[0.08]">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                <span>{t.myOrders}</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {orders.map((ord) => {
                  const statusLabel =
                    ord.status === 'escrow'
                      ? t.escrowStatus
                      : ord.status === 'delivered'
                      ? t.deliveredStatus
                      : t.completedStatus;
                  return (
                    <div
                      key={ord.id}
                      className="rounded-2xl bg-[#12121D] border border-white/[0.08] p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-sm text-white">{ord.serviceTitle}</strong>
                        <span className="text-sm font-bold text-amber-400 tabular-nums">
                          ${ord.price}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        {statusLabel} · {ord.paymentMethod} · {ord.sellerTag}
                      </p>

                      {ord.status === 'escrow' && ord.sellerUid === uid && (
                        <button
                          type="button"
                          onClick={() => updateOrderStatus(ord, 'delivered')}
                          className="w-full min-h-[42px] px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
                        >
                          {t.simulateDelivery}
                        </button>
                      )}

                      {ord.status === 'delivered' && ord.buyerUid === uid && (
                        <button
                          type="button"
                          onClick={() => updateOrderStatus(ord, 'completed')}
                          className="w-full min-h-[42px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                        >
                          {t.confirmReceipt}
                        </button>
                      )}

                      {ord.status === 'completed' && ord.buyerUid === uid && !ord.rating && (
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-xs text-slate-300">{t.rateSeller}:</span>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => rateOrder(ord, star)}
                                className="min-h-[36px] min-w-[36px] rounded-lg bg-[#1A1A29] hover:bg-amber-500/20 text-amber-400 text-xs font-bold grid place-items-center"
                              >
                                {star}★
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {ord.rating && (
                        <div className="text-xs text-amber-400 font-bold flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-current" />
                          <span className="tabular-nums">{ord.rating} / 5</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Incomplete Profile Alert from Shaghaf Bot */}
      {incompleteModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setIncompleteModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-[#12121D] border border-amber-500/40 rounded-t-3xl sm:rounded-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                <h2 className="font-bold text-base text-white">{t.botIncompleteTitle}</h2>
              </div>
              <button
                type="button"
                onClick={() => setIncompleteModal(null)}
                aria-label={t.close}
                className="min-h-[44px] min-w-[44px] grid place-items-center text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                {t.botIncompleteDesc}
              </p>

              <div className="rounded-xl bg-[#1A1A29] border border-white/10 p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">{t.gamerTag}</span>
                  {profile?.gamerTag && !incompleteModal.missingFields.includes('gamerTag') ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{profile.gamerTag}</span>
                    </span>
                  ) : (
                    <span className="text-rose-400 font-bold">
                      {lang === 'ar' ? 'ناقص ✗' : 'Missing ✗'}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-300">{t.gameId}</span>
                  {profile?.gameId?.trim() && !incompleteModal.missingFields.includes('gameId') ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{profile.gameId}</span>
                    </span>
                  ) : (
                    <span className="text-rose-400 font-bold">
                      {lang === 'ar' ? 'غير مضاف ✗' : 'Missing ✗'}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-300">{t.rank}</span>
                  {profile?.rank?.trim() && !incompleteModal.missingFields.includes('rank') ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{profile.rank}</span>
                    </span>
                  ) : (
                    <span className="text-rose-400 font-bold">
                      {lang === 'ar' ? 'غير مضاف ✗' : 'Missing ✗'}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIncompleteModal(null);
                    onOpenEditProfile();
                  }}
                  className="flex-1 min-h-[48px] px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold flex items-center justify-center gap-2"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>{t.botCompleteProfileBtn}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bot Official Registration Confirmation & Room Pass Modal */}
      {activeTicket && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setActiveTicket(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg bg-[#12121D] border border-emerald-500/40 rounded-t-3xl sm:rounded-2xl max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Bot className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <h2 className="font-bold text-base text-white truncate">{t.botPassTitle}</h2>
                  <p className="text-[11px] text-emerald-300 truncate">{activeTicket.officialSource}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTicket(null)}
                aria-label={t.close}
                className="min-h-[44px] min-w-[44px] grid place-items-center text-slate-400 hover:text-white shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {/* Auto-filled official enrollment confirmation */}
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3.5 space-y-2">
                <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>{t.botPassOfficialFilled}</span>
                </div>
                <div className="text-sm font-black text-white">{activeTicket.title}</div>
                {activeTicket.squad ? (
                  <div className="space-y-2 pt-1">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-black text-amber-300">
                        [{activeTicket.squad.tag}] {activeTicket.squad.name}
                      </span>
                      <span className="text-[11px] text-emerald-300 font-semibold">
                        ✓ {t.squadNotifiedBadge}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300 font-bold">
                      {t.squadTicketRosterTitle} ({activeTicket.squad.selectedMembers.length}/6):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
                      {activeTicket.squad.selectedMembers.map((m) => (
                        <div
                          key={m.slot}
                          className="rounded-lg bg-black/30 px-2.5 py-1.5 flex items-center justify-between gap-2"
                        >
                          <span className="font-bold text-white flex items-center gap-1 truncate">
                            {m.role === 'leader' && (
                              <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                            )}
                            <span className="truncate">{m.gamerTag}</span>
                          </span>
                          <span className="text-slate-300 truncate shrink-0">
                            {m.gameId} · {m.rank}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                    <div className="rounded-lg bg-black/30 px-2.5 py-1.5">
                      <div className="text-slate-400">{t.gamerTag}</div>
                      <div className="font-bold text-white truncate">{activeTicket.filledProfile.gamerTag}</div>
                    </div>
                    <div className="rounded-lg bg-black/30 px-2.5 py-1.5">
                      <div className="text-slate-400">{t.gameId}</div>
                      <div className="font-bold text-white truncate tabular-nums">
                        {activeTicket.filledProfile.gameId}
                      </div>
                    </div>
                    <div className="rounded-lg bg-black/30 px-2.5 py-1.5">
                      <div className="text-slate-400">{t.rank}</div>
                      <div className="font-bold text-amber-300 truncate">{activeTicket.filledProfile.rank}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Room ID & Room Code (Copyable) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-[#1A1A29] border border-violet-500/35 p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      <KeyRound className="w-3.5 h-3.5 text-violet-400" />
                      <span>{t.roomIdLabel}</span>
                    </div>
                    <div className="text-sm font-black text-white tracking-wider tabular-nums mt-0.5 truncate">
                      {activeTicket.roomId}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyField('roomId', activeTicket.roomId)}
                    className="min-h-[38px] px-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1 shrink-0"
                  >
                    {copiedKey === 'roomId' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{t.copyLabel}</span>
                  </button>
                </div>

                <div className="rounded-xl bg-[#1A1A29] border border-amber-500/35 p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Ticket className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t.roomCodeLabel}</span>
                    </div>
                    <div className="text-sm font-black text-amber-300 tracking-wider tabular-nums mt-0.5 truncate">
                      {activeTicket.roomCode}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyField('roomCode', activeTicket.roomCode)}
                    className="min-h-[38px] px-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1 shrink-0"
                  >
                    {copiedKey === 'roomCode' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{t.copyLabel}</span>
                  </button>
                </div>
              </div>

              {/* Entry Code, Match Schedule & Check-in Wait Window */}
              <div className="rounded-xl bg-[#1A1A29] border border-white/10 p-3.5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">{t.entryCodeLabel}</span>
                  <button
                    type="button"
                    onClick={() => copyField('entryCode', activeTicket.registrationCode)}
                    className="font-black text-violet-300 tabular-nums flex items-center gap-1 hover:underline"
                  >
                    <span>{activeTicket.registrationCode}</span>
                    <Copy className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex items-start justify-between gap-2 pt-2 border-t border-white/[0.06]">
                  <span className="text-slate-400 flex items-center gap-1 shrink-0">
                    <Calendar className="w-3.5 h-3.5 text-violet-400" />
                    <span>{t.matchTimeLabel}</span>
                  </span>
                  <span className="font-bold text-white text-end tabular-nums">
                    {activeTicket.matchTime}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2 pt-2 border-t border-white/[0.06]">
                  <span className="text-slate-400 flex items-center gap-1 shrink-0">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t.waitTimeLabel}</span>
                  </span>
                  <span className="font-semibold text-emerald-300 text-end leading-relaxed">
                    {activeTicket.waitTime}
                  </span>
                </div>
              </div>

              {/* Tournament Specific Rules */}
              <div className="rounded-xl bg-[#1A1A29] border border-white/10 p-3.5 space-y-2">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>{t.tournamentRulesLabel}</span>
                </div>
                <ol className="space-y-1.5 text-xs text-slate-200 leading-relaxed list-decimal list-inside">
                  {activeTicket.rules.map((rule, idx) => (
                    <li key={idx}>{rule}</li>
                  ))}
                </ol>
              </div>

              <div className="flex items-center gap-2 pt-1">
                {activeTicket.sourceUrl && (
                  <a
                    href={activeTicket.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[46px] px-4 rounded-xl bg-[#1A1A29] hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-4 h-4 text-violet-400" />
                    <span>{t.openOfficialSource}</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTicket(null)}
                  className="flex-1 min-h-[46px] rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold"
                >
                  {t.close}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6-Player Squad Manager Modal */}
      <SquadManagerModal
        open={squadManagerOpen}
        ledSquads={ledSquads}
        memberSquads={memberSquads}
        defaultGame={pendingSquadTournament?.game}
        pendingTournamentTitle={pendingSquadTournament?.title}
        onClose={() => {
          setSquadManagerOpen(false);
          setPendingSquadTournament(null);
        }}
        onSquadReady={(createdSquad) => {
          setLedSquads((prev) =>
            prev.some((s) => s.id === createdSquad.id) ? prev : [createdSquad, ...prev]
          );
          setSquadManagerOpen(false);
          if (pendingSquadTournament) {
            setSquadLineupTournament(pendingSquadTournament);
            setPendingSquadTournament(null);
          }
        }}
      />

      {/* Squad Leader Participant Lineup Selector Modal */}
      <SquadLineupModal
        tournament={squadLineupTournament}
        ledSquads={ledSquads}
        busy={squadRegBusy}
        onClose={() => setSquadLineupTournament(null)}
        onManageSquads={() => {
          setPendingSquadTournament(squadLineupTournament);
          setSquadLineupTournament(null);
          setSquadManagerOpen(true);
        }}
        onConfirm={handleConfirmSquadLineup}
      />
    </div>
  );
}
