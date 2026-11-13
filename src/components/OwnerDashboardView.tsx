import { useEffect, useState, type FormEvent } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Award,
  Ban,
  Bot,
  Check,
  Crown,
  LogIn,
  Search,
  Shield,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  BAN_DURATIONS,
  calcLevel,
  formatRemainingTime,
  formatXp,
  LIMITS,
  MAX_XP,
} from '../lib/constants';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { BadgeKind, BadgeRequest, Post, UserPublic, UserReport } from '../types';
import { BadgeIcon } from './BadgeIcon';

interface OwnerDashboardViewProps {
  onOpenProfile: (uid: string, tag?: string) => void;
}

export function OwnerDashboardView({ onOpenProfile }: OwnerDashboardViewProps) {
  const { firebaseUser, isOwner, flagsMap, showToast } = useApp();
  const [subTab, setSubTab] = useState<'accounts' | 'requests' | 'reports'>('accounts');
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [badgeRequests, setBadgeRequests] = useState<BadgeRequest[]>([]);
  const [reports, setReports] = useState<UserReport[]>([]);
  const [search, setSearch] = useState('');

  // Account Control Drawer ("الدخول إلى الحساب والتحكم فيه")
  const [controlledUser, setControlledUser] = useState<UserPublic | null>(null);
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [editBio, setEditBio] = useState('');
  const [editRank, setEditRank] = useState('');
  const [editXp, setEditXp] = useState('0');
  const [warnMsg, setWarnMsg] = useState('');
  const [banDurationId, setBanDurationId] = useState('1w');
  const [banScope, setBanScope] = useState<'full' | 'chat'>('chat');

  useEffect(() => {
    if (!isOwner) return;

    const unsubUsers = onSnapshot(
      collection(db, 'users_public'),
      (snap) => {
        setUsers(snap.docs.map((d) => d.data() as UserPublic));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users_public')
    );

    const unsubRequests = onSnapshot(
      collection(db, 'badge_requests'),
      (snap) => {
        setBadgeRequests(snap.docs.map((d) => d.data() as BadgeRequest));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'badge_requests')
    );

    const unsubReports = onSnapshot(
      collection(db, 'reports'),
      (snap) => {
        setReports(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<UserReport, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'reports')
    );

    return () => {
      unsubUsers();
      unsubRequests();
      unsubReports();
    };
  }, [isOwner]);

  useEffect(() => {
    if (!controlledUser) {
      setUserPosts([]);
      return;
    }
    setEditBio(controlledUser.bio || '');
    setEditRank(controlledUser.rank || '');
    setEditXp(String(controlledUser.xp || 0));

    const unsub = onSnapshot(
      query(collection(db, 'posts'), where('visibility', '==', 'public')),
      (snap) => {
        setUserPosts(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Post, 'id'>) }))
            .filter((p) => p.authorUid === controlledUser.uid)
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'posts')
    );
    return () => unsub();
  }, [controlledUser]);

  if (!isOwner) return null;

  const setBadge = async (u: UserPublic, badge: BadgeKind, boost: boolean) => {
    const cur = flagsMap[u.uid];
    try {
      await setDoc(doc(db, 'flags', u.uid), {
        uid: u.uid,
        gamerTag: u.gamerTag,
        badge,
        boost,
        ban: cur?.ban || false,
        updatedAt: serverTimestamp(),
      });
      showToast(
        badge === 'none'
          ? `تم سحب الشارة من ${u.gamerTag}`
          : `تم منح ${u.gamerTag} شارة (${badge})`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `flags/${u.uid}`);
    }
  };

  const applyRestriction = async (
    uid: string,
    tag: string,
    scope: 'full' | 'chat' | 'clear',
    durationId = '1w'
  ) => {
    const cur = flagsMap[uid];
    const dur = BAN_DURATIONS.find((d) => d.id === durationId) || BAN_DURATIONS[2];
    const untilMs = dur.ms > 0 ? Date.now() + dur.ms : 0;
    try {
      if (scope === 'clear') {
        await setDoc(doc(db, 'flags', uid), {
          uid,
          gamerTag: tag,
          badge: cur?.badge || 'none',
          boost: cur?.boost || false,
          ban: false,
          banUntilMs: 0,
          chatBanUntilMs: 0,
          banReason: '',
          updatedAt: serverTimestamp(),
        });
        showToast(`تم فك جميع قيود الحظر والكتم عن ${tag}`);
      } else if (scope === 'chat') {
        const chatEnd = dur.ms > 0 ? Date.now() + dur.ms : Date.now() + 365 * 86_400_000;
        await setDoc(doc(db, 'flags', uid), {
          uid,
          gamerTag: tag,
          badge: cur?.badge || 'none',
          boost: cur?.boost || false,
          ban: false,
          banUntilMs: 0,
          chatBanUntilMs: chatEnd,
          banReason: `منع الرسائل (${dur.labels.ar})`,
          updatedAt: serverTimestamp(),
        });
        showToast(`تم منع ${tag} من الرسائل لمدة ${dur.labels.ar} (يستطيع نشر الفيديوهات)`);
      } else {
        await setDoc(doc(db, 'flags', uid), {
          uid,
          gamerTag: tag,
          badge: cur?.badge || 'none',
          boost: cur?.boost || false,
          ban: true,
          banUntilMs: untilMs,
          chatBanUntilMs: cur?.chatBanUntilMs || 0,
          banReason: `حظر كامل (${dur.labels.ar})`,
          updatedAt: serverTimestamp(),
        });
        showToast(`تم حظر ${tag} بالكامل (${dur.labels.ar})`);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `flags/${uid}`);
    }
  };

  const toggleBan = async (uid: string, tag: string) => {
    const cur = flagsMap[uid];
    const hasActiveRestriction = Boolean(
      cur?.ban || (cur?.chatBanUntilMs && cur.chatBanUntilMs > Date.now())
    );
    await applyRestriction(uid, tag, hasActiveRestriction ? 'clear' : 'full', 'perm');
  };

  const handleRequestAction = async (req: BadgeRequest, approve: boolean) => {
    try {
      await updateDoc(doc(db, 'badge_requests', req.uid), {
        status: approve ? 'approved' : 'rejected',
        updatedAt: serverTimestamp(),
      });
      if (approve) {
        const cur = flagsMap[req.uid];
        await setDoc(doc(db, 'flags', req.uid), {
          uid: req.uid,
          gamerTag: req.gamerTag,
          badge: 'sub',
          boost: true,
          ban: cur?.ban || false,
          updatedAt: serverTimestamp(),
        });
        await addDoc(collection(db, 'bot_messages', req.uid, 'items'), {
          targetUid: req.uid,
          title: 'تم تفعيل شارة التوثيق!',
          body: 'وافق المالك على اشتراكك، وتم تفعيل شارة التوثيق وأولوية الظهور لحسابك.',
          kind: 'welcome',
          read: false,
          createdAt: serverTimestamp(),
        });
      }
      showToast(approve ? `تم تفعيل شارة ${req.gamerTag}` : `تم رفض طلب ${req.gamerTag}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `badge_requests/${req.uid}`);
    }
  };

  const handleSaveUserControl = async (e: FormEvent) => {
    e.preventDefault();
    if (!controlledUser) return;
    const parsedXp = Math.max(0, Math.min(MAX_XP, parseInt(editXp, 10) || 0));
    try {
      await updateDoc(doc(db, 'users_public', controlledUser.uid), {
        bio: editBio.trim().slice(0, LIMITS.BIO_MAX),
        rank: editRank.trim().slice(0, 40),
        xp: parsedXp,
        updatedAt: serverTimestamp(),
      });
      showToast(`تم تحديث حساب ${controlledUser.gamerTag}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users_public/${controlledUser.uid}`);
    }
  };

  const handleSendDirectWarning = async () => {
    if (!controlledUser || !warnMsg.trim()) return;
    try {
      await addDoc(collection(db, 'warns', controlledUser.uid, 'items'), {
        targetUid: controlledUser.uid,
        message: warnMsg.trim().slice(0, LIMITS.WARNING_MAX),
        createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'bot_messages', controlledUser.uid, 'items'), {
        targetUid: controlledUser.uid,
        title: 'تنبيه من المالك وبوت شغف',
        body: warnMsg.trim().slice(0, LIMITS.WARNING_MAX),
        kind: 'warning',
        read: false,
        createdAt: serverTimestamp(),
      });
      setWarnMsg('');
      showToast(`تم إرسال التنبيه إلى ${controlledUser.gamerTag}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `warns/${controlledUser.uid}/items`);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return `${u.gamerTag} ${u.uid} ${u.rank || ''}`.toLowerCase().includes(q);
  });

  const pendingRequestsCount = badgeRequests.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="rounded-2xl bg-[#12121D] border border-amber-500/35 p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400 grid place-items-center shrink-0">
            <Crown className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white">لوحة تحكم المالك</h2>
            <p className="text-xs text-slate-400">
              إدارة جميع الحسابات · منح وسحب الشارات · متابعة البوت والبلاغات
            </p>
          </div>
        </div>
        <div className="text-xs text-amber-300 font-bold tabular-nums">
          {users.length} حساب · {pendingRequestsCount} طلب شارة · {reports.length} بلاغ
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#12121D] border border-white/[0.08]">
        <button
          type="button"
          onClick={() => setSubTab('accounts')}
          className={`min-h-[44px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap ${
            subTab === 'accounts' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4 shrink-0" />
          <span>الحسابات ({users.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('requests')}
          className={`min-h-[44px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap ${
            subTab === 'requests' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
          }`}
        >
          <Award className="w-4 h-4 shrink-0" />
          <span>طلبات الشارة ({pendingRequestsCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('reports')}
          className={`min-h-[44px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap ${
            subTab === 'reports' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
          }`}
        >
          <Bot className="w-4 h-4 shrink-0" />
          <span>البوت والبلاغات ({reports.length})</span>
        </button>
      </div>

      {/* All Accounts Tab */}
      {subTab === 'accounts' && (
        <div className="space-y-3">
          <label className="h-12 px-3.5 rounded-xl bg-[#12121D] border border-white/[0.08] flex items-center gap-2.5">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم المستعار أو المعرف..."
              className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredUsers.map((u) => {
              const fl = flagsMap[u.uid];
              const badge = fl?.badge || 'none';
              return (
                <div
                  key={u.uid}
                  className="rounded-2xl bg-[#12121D] border border-white/[0.08] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenProfile(u.uid, u.gamerTag)}
                      className="flex items-center gap-2.5 text-start"
                    >
                      <span className="w-10 h-10 rounded-full bg-violet-600/30 grid place-items-center font-black text-sm text-white">
                        {u.gamerTag.charAt(0).toUpperCase()}
                      </span>
                      <span>
                        <span className="font-bold text-sm text-white flex items-center gap-1">
                          {u.gamerTag}
                          <BadgeIcon kind={badge} />
                        </span>
                        <span className="text-[11px] text-slate-400 tabular-nums">
                          Lv.{calcLevel(u.xp)} · {formatXp(u.xp)}
                          {fl?.ban
                            ? fl.banUntilMs && fl.banUntilMs > Date.now()
                              ? ` · محظور (${formatRemainingTime(fl.banUntilMs, 'ar')})`
                              : ' · محظور دائمًا'
                            : fl?.chatBanUntilMs && fl.chatBanUntilMs > Date.now()
                            ? ` · ممنوع من الرسائل (${formatRemainingTime(fl.chatBanUntilMs, 'ar')})`
                            : ''}
                        </span>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setControlledUser(u)}
                      className="min-h-[38px] px-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>دخول وتحكم</span>
                    </button>
                  </div>

                  {/* Quick Badge & Ban Controls */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/[0.06]">
                    {u.uid !== firebaseUser?.uid && (
                      <>
                        <button
                          type="button"
                          onClick={() => setBadge(u, 'sub', true)}
                          className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold border ${
                            badge === 'sub'
                              ? 'bg-violet-600 border-violet-500 text-white'
                              : 'border-white/10 text-slate-300 hover:bg-white/5'
                          }`}
                        >
                          شارة اشتراك
                        </button>
                        <button
                          type="button"
                          onClick={() => setBadge(u, 'gift', true)}
                          className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold border ${
                            badge === 'gift'
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : 'border-white/10 text-slate-300 hover:bg-white/5'
                          }`}
                        >
                          <Sparkles className="w-3 h-3 inline me-1" />
                          شارة هدية
                        </button>
                        {badge !== 'none' && (
                          <button
                            type="button"
                            onClick={() => setBadge(u, 'none', false)}
                            className="min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold border border-white/10 text-slate-400 hover:text-white"
                          >
                            سحب الشارة
                          </button>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleBan(u.uid, u.gamerTag)}
                      className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold border ms-auto ${
                        fl?.ban || (fl?.chatBanUntilMs && fl.chatBanUntilMs > Date.now())
                          ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-rose-500/15 border-rose-500/35 text-rose-300'
                      }`}
                    >
                      {fl?.ban || (fl?.chatBanUntilMs && fl.chatBanUntilMs > Date.now())
                        ? 'فك القيد'
                        : 'حظر دائم'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Badge Subscription Requests Tab */}
      {subTab === 'requests' && (
        <div className="space-y-3">
          {badgeRequests.length === 0 ? (
            <div className="rounded-2xl bg-[#12121D] border border-white/[0.08] p-8 text-center text-sm text-slate-400">
              لا توجد طلبات شارة توثيق حاليًا.
            </div>
          ) : (
            badgeRequests.map((req) => (
              <div
                key={req.uid}
                className="rounded-2xl bg-[#12121D] border border-white/[0.08] p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <div className="font-bold text-sm text-white">{req.gamerTag}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {req.paymentMethod} · {req.referenceNote || 'بدون مرجع'} · الحالة:{' '}
                    <span className="text-amber-300 font-semibold">{req.status}</span>
                  </div>
                </div>

                {req.status === 'pending' && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRequestAction(req, true)}
                      className="min-h-[40px] px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1"
                    >
                      <Check className="w-4 h-4" />
                      <span>موافقة ومنح الشارة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRequestAction(req, false)}
                      className="min-h-[40px] px-3.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-300 text-xs font-bold flex items-center gap-1"
                    >
                      <X className="w-4 h-4" />
                      <span>رفض</span>
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Bot Alerts & Reports Tab */}
      {subTab === 'reports' && (
        <div className="space-y-3">
          {reports.length === 0 ? (
            <div className="rounded-2xl bg-[#12121D] border border-white/[0.08] p-8 text-center text-sm text-slate-400">
              لا توجد بلاغات أو تنبيهات من البوت حاليًا.
            </div>
          ) : (
            reports.map((rep) => (
              <div
                key={rep.id}
                className="rounded-2xl bg-[#12121D] border border-white/[0.08] p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="font-bold text-sm text-white flex items-center gap-2">
                    <span>{rep.targetTag}</span>
                    <span className="text-xs font-normal text-slate-400">
                      (بواسطة: {rep.reporterTag})
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">{rep.reason}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleBan(rep.targetUid, rep.targetTag)}
                    className="min-h-[40px] px-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-300 text-xs font-bold flex items-center gap-1"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>{flagsMap[rep.targetUid]?.ban ? 'فك الحظر' : 'حظر'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      deleteDoc(doc(db, 'reports', rep.id)).catch(() => {})
                    }
                    className="min-h-[40px] px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-slate-300 text-xs font-bold"
                  >
                    حذف البلاغ
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Account Control Modal ("الدخول إلى الحساب والتحكم فيه") */}
      {controlledUser && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setControlledUser(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-[#12121D] border border-amber-500/35 p-6 space-y-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-black text-white">
                  التحكم في حساب: {controlledUser.gamerTag}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setControlledUser(null)}
                className="min-h-[40px] min-w-[40px] rounded-xl text-slate-400 hover:text-white grid place-items-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUserControl} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">الرتبة</label>
                  <input
                    type="text"
                    value={editRank}
                    onChange={(e) => setEditRank(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">نقاط XP</label>
                  <input
                    type="number"
                    value={editXp}
                    onChange={(e) => setEditXp(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">النبذة (Bio)</label>
                <input
                  type="text"
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
                />
              </div>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold"
              >
                حفظ تعديلات الحساب
              </button>
            </form>

            {/* Timed & Scoped Ban Controls */}
            {controlledUser.uid !== firebaseUser?.uid && (
              <div className="pt-3 border-t border-white/[0.08] space-y-2.5">
                <div className="text-xs font-bold text-rose-300">
                  إدارة الحظر وتقييد الرسائل بالمدة
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={banScope}
                    onChange={(e) => setBanScope(e.target.value as 'full' | 'chat')}
                    className="h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-xs text-white"
                  >
                    <option value="chat">منع الرسائل والتعليقات فقط (ينشر فيديوهات عادي)</option>
                    <option value="full">حظر كامل (منع النشر والرسائل)</option>
                  </select>
                  <select
                    value={banDurationId}
                    onChange={(e) => setBanDurationId(e.target.value)}
                    className="h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-xs text-white"
                  >
                    {BAN_DURATIONS.map((d) => (
                      <option key={d.id} value={d.id}>
                        المدة: {d.labels.ar}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      applyRestriction(
                        controlledUser.uid,
                        controlledUser.gamerTag,
                        banScope,
                        banDurationId
                      )
                    }
                    className="min-h-[42px] px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                  >
                    تطبيق العقوبة
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      applyRestriction(controlledUser.uid, controlledUser.gamerTag, 'clear')
                    }
                    className="min-h-[42px] px-4 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold"
                  >
                    فك الحظر / إزالة الكتم
                  </button>
                </div>
              </div>
            )}

            {/* Send Warning */}
            <div className="pt-3 border-t border-white/[0.08] space-y-2">
              <label className="block text-xs font-bold text-slate-300">
                إرسال تنبيه مباشر من المالك والبوت
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={warnMsg}
                  onChange={(e) => setWarnMsg(e.target.value)}
                  placeholder="اكتب نص التنبيه..."
                  className="flex-1 h-11 px-3 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white"
                />
                <button
                  type="button"
                  onClick={handleSendDirectWarning}
                  className="min-h-[44px] px-4 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold"
                >
                  إرسال
                </button>
              </div>
            </div>

            {/* User Posts Moderation */}
            <div className="pt-3 border-t border-white/[0.08] space-y-2">
              <div className="text-xs font-bold text-slate-300">
                منشورات الحساب ({userPosts.length})
              </div>
              {userPosts.length === 0 ? (
                <p className="text-xs text-slate-500">لا توجد منشورات لهذا الحساب.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {userPosts.map((p) => (
                    <div
                      key={p.id}
                      className="p-3 rounded-xl bg-[#1A1A29] flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="text-slate-200 truncate">{p.content}</span>
                      <button
                        type="button"
                        onClick={() => deleteDoc(doc(db, 'posts', p.id)).catch(() => {})}
                        className="text-rose-400 hover:text-rose-300 shrink-0 p-1"
                        aria-label="Delete user post"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
