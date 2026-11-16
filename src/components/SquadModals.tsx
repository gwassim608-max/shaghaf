import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Bot,
  Check,
  CheckCircle2,
  Crown,
  Edit3,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SERVERS } from '../lib/constants';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { Squad, SquadMemberEntry, Tournament, UserPublic } from '../types';

function createEmptySlot(slot: number): SquadMemberEntry {
  return {
    slot,
    uid: '',
    gamerTag: '',
    gameId: '',
    rank: '',
    role: slot === 1 ? 'leader' : 'player',
  };
}

function isSlotValid(m: SquadMemberEntry): boolean {
  return (
    m.gamerTag.trim().length >= 2 &&
    m.gameId.trim().length >= 1 &&
    m.rank.trim().length >= 1
  );
}

interface SquadManagerModalProps {
  open: boolean;
  ledSquads: Squad[];
  memberSquads: Squad[];
  defaultGame?: string;
  pendingTournamentTitle?: string;
  onClose: () => void;
  onSquadReady?: (squad: Squad) => void;
}

export function SquadManagerModal({
  open,
  ledSquads,
  memberSquads,
  defaultGame,
  pendingTournamentTitle,
  onClose,
  onSquadReady,
}: SquadManagerModalProps) {
  const { firebaseUser, profile, friendsMap, t, lang, showToast } = useApp();
  const [publicUsers, setPublicUsers] = useState<UserPublic[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [editingSquadId, setEditingSquadId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [game, setGame] = useState(defaultGame || 'Free Fire');
  const [members, setMembers] = useState<SquadMemberEntry[]>([
    createEmptySlot(1),
    createEmptySlot(2),
    createEmptySlot(3),
    createEmptySlot(4),
    createEmptySlot(5),
    createEmptySlot(6),
  ]);

  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
  const [playerSearch, setPlayerSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const gameChoices = useMemo(() => {
    const excluded = new Set(['ALL', 'FOR_YOU', 'Clans & LFG', 'MENA', 'Global', 'Editors', 'Dev & Design']);
    const games = SERVERS.filter((s) => !excluded.has(s.id)).map((s) => s.id);
    if (defaultGame && !games.includes(defaultGame)) {
      return [defaultGame, ...games];
    }
    return games;
  }, [defaultGame]);

  useEffect(() => {
    if (!open || !firebaseUser) return;
    const q = query(
      collection(db, 'users_public'),
      where('isPrivate', '==', false),
      limit(80)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPublicUsers(snap.docs.map((d) => d.data() as UserPublic));
      },
      () => {}
    );
    return () => unsub();
  }, [open, firebaseUser]);

  const startNewSquad = () => {
    if (!firebaseUser || !profile) return;
    setEditingSquadId(null);
    setName('');
    setTag('');
    setGame(defaultGame || 'Free Fire');
    const leaderSlot: SquadMemberEntry = {
      slot: 1,
      uid: firebaseUser.uid,
      gamerTag: (profile.gamerTag || 'Leader').slice(0, 24),
      gameId: (profile.gameId || '').slice(0, 40),
      rank: (profile.rank || '').slice(0, 40),
      role: 'leader',
    };
    setMembers([
      leaderSlot,
      createEmptySlot(2),
      createEmptySlot(3),
      createEmptySlot(4),
      createEmptySlot(5),
      createEmptySlot(6),
    ]);
    setPickingSlot(null);
    setPlayerSearch('');
    setViewMode('form');
  };

  const startEditSquad = (sq: Squad) => {
    setEditingSquadId(sq.id);
    setName(sq.name);
    setTag(sq.tag);
    setGame(sq.game || defaultGame || 'Free Fire');
    const padded = Array.from({ length: 6 }, (_, i) => {
      const existing = sq.members[i];
      if (existing) {
        return {
          slot: i + 1,
          uid: existing.uid || '',
          gamerTag: existing.gamerTag || '',
          gameId: existing.gameId || '',
          rank: existing.rank || '',
          role: (i === 0 ? 'leader' : 'player') as 'leader' | 'player',
        };
      }
      return createEmptySlot(i + 1);
    });
    setMembers(padded);
    setPickingSlot(null);
    setPlayerSearch('');
    setViewMode('form');
  };

  useEffect(() => {
    if (!open) return;
    if (pendingTournamentTitle && ledSquads.length === 0) {
      startNewSquad();
    } else {
      setViewMode('list');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingTournamentTitle]);

  if (!open || !firebaseUser || !profile) return null;

  const uid = firebaseUser.uid;
  const completedCount = members.filter(isSlotValid).length;
  const formValid =
    name.trim().length >= 2 &&
    tag.trim().length >= 2 &&
    game.trim().length >= 2 &&
    completedCount === 6;

  const searchablePlayers = publicUsers
    .filter((u) => u.uid !== uid)
    .sort((a, b) => {
      const aFriend = friendsMap[a.uid] ? 1 : 0;
      const bFriend = friendsMap[b.uid] ? 1 : 0;
      return bFriend - aFriend;
    })
    .filter((u) => {
      const q = playerSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        u.gamerTag.toLowerCase().includes(q) ||
        (u.gameId || '').toLowerCase().includes(q)
      );
    });

  const updateSlot = (slotIdx: number, patch: Partial<SquadMemberEntry>) => {
    setMembers((prev) =>
      prev.map((m, idx) => (idx === slotIdx ? { ...m, ...patch } : m))
    );
  };

  const pickPublicPlayer = (slotIdx: number, u: UserPublic) => {
    updateSlot(slotIdx, {
      uid: u.uid,
      gamerTag: u.gamerTag.slice(0, 24),
      gameId: (u.gameId || u.gamerTag).slice(0, 40),
      rank: (u.rank || 'Competitor').slice(0, 40),
    });
    setPickingSlot(null);
    setPlayerSearch('');
  };

  const handleSave = async () => {
    if (!formValid || saving) return;
    setSaving(true);
    try {
      const normalizedMembers: SquadMemberEntry[] = members.map((m, idx) => ({
        slot: idx + 1,
        uid: idx === 0 ? uid : m.uid.trim().slice(0, 128),
        gamerTag: m.gamerTag.trim().slice(0, 24),
        gameId: m.gameId.trim().slice(0, 40),
        rank: m.rank.trim().slice(0, 40),
        role: idx === 0 ? 'leader' : 'player',
      }));

      const uidSet = new Set<string>([uid]);
      normalizedMembers.forEach((m) => {
        if (m.uid) uidSet.add(m.uid);
      });
      const memberUids = Array.from(uidSet).slice(0, 6);

      const safeLeaderTag = (profile.gamerTag || 'Player').trim().slice(0, 16);
      const leaderTag = safeLeaderTag.length >= 3 ? safeLeaderTag : `${safeLeaderTag}___`.slice(0, 3);

      const cleanName = name.trim().slice(0, 40);
      const cleanTag = tag.trim().toUpperCase().slice(0, 8);
      const cleanGame = game.trim().slice(0, 40);

      if (editingSquadId) {
        await updateDoc(doc(db, 'squads', editingSquadId), {
          name: cleanName,
          tag: cleanTag,
          game: cleanGame,
          memberUids,
          members: normalizedMembers,
          updatedAt: serverTimestamp(),
        });
        showToast(t.squadSavedToast);
        if (onSquadReady) {
          onSquadReady({
            id: editingSquadId,
            name: cleanName,
            tag: cleanTag,
            game: cleanGame,
            leaderUid: uid,
            leaderTag,
            memberUids,
            members: normalizedMembers,
          });
          return;
        }
        setViewMode('list');
      } else {
        const ref = await addDoc(collection(db, 'squads'), {
          name: cleanName,
          tag: cleanTag,
          game: cleanGame,
          leaderUid: uid,
          leaderTag,
          memberUids,
          members: normalizedMembers,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        showToast(t.squadSavedToast);
        const createdSquad: Squad = {
          id: ref.id,
          name: cleanName,
          tag: cleanTag,
          game: cleanGame,
          leaderUid: uid,
          leaderTag,
          memberUids,
          members: normalizedMembers,
        };
        if (onSquadReady) {
          onSquadReady(createdSquad);
          return;
        }
        setViewMode('list');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'squads');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (squadId: string) => {
    try {
      await deleteDoc(doc(db, 'squads', squadId));
      showToast(t.squadDeletedToast);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `squads/${squadId}`);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-2xl bg-[#12121D] border border-violet-500/35 rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="w-5 h-5 text-violet-400 shrink-0" />
            <h2 className="font-bold text-base text-white truncate">
              {viewMode === 'form'
                ? editingSquadId
                  ? t.editSquadTitle
                  : t.createSquadTitle
                : t.mySquadsTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="min-h-[44px] min-w-[44px] grid place-items-center text-slate-400 hover:text-white shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {pendingTournamentTitle && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/35 p-3.5 text-xs space-y-1">
              <div className="font-bold text-amber-300">{t.squadNeedTitle}</div>
              <p className="text-slate-200 leading-relaxed">{t.squadNeedDesc}</p>
            </div>
          )}

          {viewMode === 'list' ? (
            <div className="space-y-4">
              {ledSquads.length === 0 && memberSquads.length > 0 && (
                <div className="rounded-xl bg-sky-500/10 border border-sky-500/30 p-3 text-xs text-sky-200">
                  {t.squadMemberOnlyNotice}
                </div>
              )}

              {ledSquads.map((sq) => (
                <div
                  key={sq.id}
                  className="rounded-2xl bg-[#1A1A29] border border-violet-500/30 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-violet-600/30 border border-violet-500/40 text-violet-200 text-xs font-black">
                        [{sq.tag}]
                      </span>
                      <strong className="text-sm text-white">{sq.name}</strong>
                      <span className="text-xs text-slate-400">· {sq.game}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => startEditSquad(sq)}
                        className="min-h-[36px] px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-200 flex items-center gap-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{t.editSquadTitle}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(sq.id)}
                        aria-label={t.squadDeleteBtn}
                        className="min-h-[36px] min-w-[36px] grid place-items-center rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                    {sq.members.map((m) => (
                      <div
                        key={m.slot}
                        className="rounded-lg bg-black/30 border border-white/[0.06] px-2.5 py-2"
                      >
                        <div className="flex items-center gap-1 font-bold text-white truncate">
                          {m.role === 'leader' && (
                            <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                          )}
                          <span className="truncate">{m.gamerTag}</span>
                        </div>
                        <div className="text-slate-400 truncate mt-0.5">
                          {m.gameId} · {m.rank}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {memberSquads.filter((sq) => sq.leaderUid !== uid).map((sq) => (
                <div
                  key={sq.id}
                  className="rounded-2xl bg-[#1A1A29] border border-white/10 p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-white/10 text-slate-200 text-xs font-bold">
                        [{sq.tag}]
                      </span>
                      <strong className="text-sm text-white">{sq.name}</strong>
                    </div>
                    <span className="text-xs text-amber-300 flex items-center gap-1">
                      <Crown className="w-3.5 h-3.5" />
                      <span>{sq.leaderTag}</span>
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {sq.game} · {sq.members.length}/6
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={startNewSquad}
                className="w-full min-h-[48px] px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>{t.squadCreateNewBtn}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-violet-500/10 border border-violet-500/30 p-3 text-xs text-violet-200 leading-relaxed">
                {t.squadSixRequiredNote}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="space-y-1 text-xs">
                  <span className="text-slate-300 font-semibold">{t.squadNameLabel}</span>
                  <input
                    type="text"
                    maxLength={40}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Shaghaf Legends"
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white focus:outline-none focus:border-violet-500"
                  />
                </label>

                <label className="space-y-1 text-xs">
                  <span className="text-slate-300 font-semibold">{t.squadTagLabel}</span>
                  <input
                    type="text"
                    maxLength={8}
                    value={tag}
                    onChange={(e) => setTag(e.target.value.toUpperCase())}
                    placeholder="SHG"
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white uppercase focus:outline-none focus:border-violet-500"
                  />
                </label>

                <label className="space-y-1 text-xs">
                  <span className="text-slate-300 font-semibold">{t.squadGameLabel}</span>
                  <select
                    value={game}
                    onChange={(e) => setGame(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white focus:outline-none focus:border-violet-500"
                  >
                    {gameChoices.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* 6-Player Roster Progress */}
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="font-bold text-white">{t.squadRosterProgress}</span>
                <span
                  className={`font-black tabular-nums ${
                    completedCount === 6 ? 'text-emerald-400' : 'text-amber-300'
                  }`}
                >
                  {completedCount} / 6
                </span>
              </div>

              <div className="space-y-3">
                {members.map((m, idx) => {
                  const slotOk = isSlotValid(m);
                  const isLeaderSlot = idx === 0;
                  const isPicking = pickingSlot === idx;
                  return (
                    <div
                      key={m.slot}
                      className={`rounded-xl p-3 border space-y-2.5 ${
                        slotOk
                          ? 'bg-[#1A1A29] border-emerald-500/35'
                          : 'bg-[#1A1A29]/70 border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5 font-bold text-white">
                          {isLeaderSlot ? (
                            <>
                              <Crown className="w-4 h-4 text-amber-400" />
                              <span>1. {t.squadLeaderSlotLabel}</span>
                            </>
                          ) : (
                            <>
                              <Users className="w-3.5 h-3.5 text-violet-400" />
                              <span>
                                {idx + 1}. {t.squadMemberSlotLabel} {idx + 1}
                              </span>
                            </>
                          )}
                          {m.uid && !isLeaderSlot && (
                            <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 text-[10px]">
                              ✓ Shaghaf
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {!isLeaderSlot && (
                            <button
                              type="button"
                              onClick={() => {
                                setPickingSlot(isPicking ? null : idx);
                                setPlayerSearch('');
                              }}
                              className="min-h-[32px] px-2.5 rounded-lg bg-violet-600/80 hover:bg-violet-500 text-white text-[11px] font-bold flex items-center gap-1"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              <span>{t.squadPickPlayerLabel}</span>
                            </button>
                          )}
                          {slotOk && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                        </div>
                      </div>

                      {isPicking && (
                        <div className="rounded-xl bg-[#0F0F1A] border border-violet-500/30 p-2.5 space-y-2">
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
                            <input
                              type="text"
                              value={playerSearch}
                              onChange={(e) => setPlayerSearch(e.target.value)}
                              placeholder={t.squadSearchPlayerPlaceholder}
                              className="w-full min-h-[36px] ps-8 pe-3 rounded-lg bg-[#1A1A29] border border-white/10 text-xs text-white focus:outline-none focus:border-violet-500"
                            />
                          </div>
                          <div className="max-h-36 overflow-y-auto space-y-1">
                            {searchablePlayers.slice(0, 15).map((u) => (
                              <button
                                key={u.uid}
                                type="button"
                                onClick={() => pickPublicPlayer(idx, u)}
                                className="w-full text-start px-2.5 py-2 rounded-lg hover:bg-violet-600/25 flex items-center justify-between gap-2 text-xs text-white"
                              >
                                <span className="font-bold flex items-center gap-1.5">
                                  <span>{u.gamerTag}</span>
                                  {friendsMap[u.uid] && (
                                    <span className="text-[10px] text-emerald-400">
                                      ({lang === 'ar' ? 'صديق' : 'Friend'})
                                    </span>
                                  )}
                                </span>
                                <span className="text-[11px] text-slate-400 truncate">
                                  {u.gameId || 'ID'} · {u.rank || 'Rank'}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          maxLength={24}
                          disabled={isLeaderSlot}
                          value={m.gamerTag}
                          onChange={(e) =>
                            updateSlot(idx, { gamerTag: e.target.value, uid: '' })
                          }
                          placeholder={t.squadMemberNameLabel}
                          className="min-h-[38px] px-2.5 rounded-lg bg-[#0F0F1A] border border-white/10 text-xs text-white disabled:opacity-70 focus:outline-none focus:border-violet-500"
                        />
                        <input
                          type="text"
                          maxLength={40}
                          value={m.gameId}
                          onChange={(e) => updateSlot(idx, { gameId: e.target.value })}
                          placeholder={t.gameId}
                          className="min-h-[38px] px-2.5 rounded-lg bg-[#0F0F1A] border border-white/10 text-xs text-white focus:outline-none focus:border-violet-500"
                        />
                        <input
                          type="text"
                          maxLength={40}
                          value={m.rank}
                          onChange={(e) => updateSlot(idx, { rank: e.target.value })}
                          placeholder={t.rank}
                          className="min-h-[38px] px-2.5 rounded-lg bg-[#0F0F1A] border border-white/10 text-xs text-white focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 pt-2">
                {ledSquads.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className="min-h-[46px] px-4 rounded-xl bg-[#1A1A29] border border-white/10 text-xs font-bold text-slate-300"
                  >
                    {t.cancel}
                  </button>
                )}
                <button
                  type="button"
                  disabled={!formValid || saving}
                  onClick={() => void handleSave()}
                  className="flex-1 min-h-[46px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>{formValid ? t.squadSaveBtn : `${t.squadSaveIncomplete} (${completedCount}/6)`}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface SquadLineupModalProps {
  tournament: Tournament | null;
  ledSquads: Squad[];
  busy: boolean;
  onClose: () => void;
  onManageSquads: () => void;
  onConfirm: (squad: Squad, selectedMembers: SquadMemberEntry[]) => Promise<void>;
}

export function SquadLineupModal({
  tournament,
  ledSquads,
  busy,
  onClose,
  onManageSquads,
  onConfirm,
}: SquadLineupModalProps) {
  const { t } = useApp();
  const [selectedSquadId, setSelectedSquadId] = useState<string>('');
  const [selectedSlots, setSelectedSlots] = useState<number[]>([1, 2, 3, 4]);

  useEffect(() => {
    if (!tournament || ledSquads.length === 0) return;
    const matchByGame = ledSquads.find(
      (s) => s.game.toLowerCase() === tournament.game.toLowerCase()
    );
    setSelectedSquadId((matchByGame || ledSquads[0]).id);
    setSelectedSlots([1, 2, 3, 4]);
  }, [tournament, ledSquads]);

  if (!tournament || ledSquads.length === 0) return null;

  const activeSquad = ledSquads.find((s) => s.id === selectedSquadId) || ledSquads[0];
  const chosenMembers = activeSquad.members.filter((m) =>
    selectedSlots.includes(m.slot)
  );

  const toggleSlot = (slot: number) => {
    setSelectedSlots((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot].sort((a, b) => a - b)
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg bg-[#12121D] border border-violet-500/40 rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Crown className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-bold text-base text-white truncate">{t.squadLineupTitle}</h2>
              <p className="text-[11px] text-violet-300 truncate">{tournament.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="min-h-[44px] min-w-[44px] grid place-items-center text-slate-400 hover:text-white shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">{t.squadLineupSubtitle}</p>

          {ledSquads.length > 1 && (
            <label className="block space-y-1 text-xs">
              <span className="text-slate-300 font-bold">{t.squadChooseWhichLabel}</span>
              <select
                value={activeSquad.id}
                onChange={(e) => setSelectedSquadId(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
              >
                {ledSquads.map((sq) => (
                  <option key={sq.id} value={sq.id}>
                    [{sq.tag}] {sq.name} ({sq.game})
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-white">
              {t.squadSelectedCountLabel}:{' '}
              <span className="text-emerald-400 tabular-nums">{chosenMembers.length} / 6</span>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedSlots([1, 2, 3, 4])}
                className="min-h-[32px] px-2.5 rounded-lg bg-[#1A1A29] hover:bg-white/10 border border-white/10 text-[11px] font-bold text-slate-200"
              >
                {t.squadSelectFourBtn}
              </button>
              <button
                type="button"
                onClick={() => setSelectedSlots([1, 2, 3, 4, 5, 6])}
                className="min-h-[32px] px-2.5 rounded-lg bg-[#1A1A29] hover:bg-white/10 border border-white/10 text-[11px] font-bold text-slate-200"
              >
                {t.squadSelectAllSixBtn}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {activeSquad.members.map((m) => {
              const checked = selectedSlots.includes(m.slot);
              return (
                <button
                  key={m.slot}
                  type="button"
                  onClick={() => toggleSlot(m.slot)}
                  className={`w-full text-start rounded-xl p-3 border flex items-center justify-between gap-3 transition-colors ${
                    checked
                      ? 'bg-violet-600/20 border-violet-500/60 text-white'
                      : 'bg-[#1A1A29] border-white/10 text-slate-300 hover:border-white/25'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-bold truncate">
                      {m.role === 'leader' && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                      <span className="truncate">{m.gamerTag}</span>
                      {m.uid && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                          Shaghaf
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                      ID: {m.gameId} · {m.rank}
                    </div>
                  </div>
                  <div
                    className={`w-6 h-6 rounded-lg border grid place-items-center shrink-0 ${
                      checked
                        ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                        : 'border-white/20 bg-black/30'
                    }`}
                  >
                    {checked && <Check className="w-4 h-4 stroke-[3]" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Auto-fill confirmation preview */}
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 space-y-1.5 text-xs">
            <div className="font-bold text-emerald-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                [{activeSquad.tag}] {activeSquad.name}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">{t.squadAutoFillPreview}</p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onManageSquads}
              className="min-h-[46px] px-3.5 rounded-xl bg-[#1A1A29] hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200"
            >
              {t.manageSquadBtn}
            </button>
            <button
              type="button"
              disabled={busy || chosenMembers.length === 0}
              onClick={() => void onConfirm(activeSquad, chosenMembers)}
              className="flex-1 min-h-[46px] px-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Bot className="w-4 h-4 shrink-0" />
              <span>
                {busy
                  ? t.botRegisteringBtn
                  : chosenMembers.length === 0
                  ? t.squadPickAtLeastOne
                  : t.squadConfirmRegisterBtn}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
