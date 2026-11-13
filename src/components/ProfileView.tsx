import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { Edit3, MessageCircle, MoreHorizontal, Shield, UserPlus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { calcLevel, formatXp, TIER_META } from '../lib/constants';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { FriendTier, ServiceListing, UserPublic } from '../types';
import { BadgeIcon } from './BadgeIcon';

interface ProfileViewProps {
  targetUid: string;
  fallbackTag?: string;
  onStartDm: (uid: string, tag: string) => void;
  onOpenEditProfile: () => void;
  onOpenOwnerTools: (uid: string, tag: string) => void;
  onOpenUserOptions: (uid: string, tag: string) => void;
}

export function ProfileView({
  targetUid,
  fallbackTag,
  onStartDm,
  onOpenEditProfile,
  onOpenOwnerTools,
  onOpenUserOptions,
}: ProfileViewProps) {
  const { firebaseUser, profile: myProfile, flagsMap, friendsMap, lang, t, isOwner, showToast } =
    useApp();
  const [viewedUser, setViewedUser] = useState<UserPublic | null>(null);
  const [services, setServices] = useState<ServiceListing[]>([]);
  const [showTierPicker, setShowTierPicker] = useState(false);

  const isMe = firebaseUser?.uid === targetUid;

  useEffect(() => {
    if (isMe && myProfile) {
      setViewedUser(myProfile);
      return;
    }
    const unsub = onSnapshot(
      doc(db, 'users_public', targetUid),
      (snap) => {
        if (snap.exists()) {
          setViewedUser(snap.data() as UserPublic);
        } else {
          setViewedUser(null);
        }
      },
      () => {
        // private profile or inaccessible
        setViewedUser(null);
      }
    );
    return () => unsub();
  }, [targetUid, isMe, myProfile]);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'services'), where('visibility', '==', 'public')),
      (snap) =>
        setServices(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<ServiceListing, 'id'>) }))
            .filter((s) => s.sellerUid === targetUid)
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'services')
    );
    return () => unsub();
  }, [targetUid]);

  if (!firebaseUser) return null;

  const displayTag = viewedUser?.gamerTag || fallbackTag || 'Player';
  const flag = flagsMap[targetUid];
  const effectiveBadge = flag?.badge || (isMe && isOwner ? 'own' : undefined);
  const friendLink = friendsMap[targetUid];
  const level = calcLevel(viewedUser?.xp || 0);

  const handleSetFriendTier = async (tier: FriendTier) => {
    const uid = firebaseUser.uid;
    try {
      await setDoc(doc(db, 'users_public', uid, 'friends', targetUid), {
        ownerUid: uid,
        friendUid: targetUid,
        friendTag: displayTag,
        tier,
        updatedAt: serverTimestamp(),
      });
      setShowTierPicker(false);
      showToast(`${displayTag} · ${TIER_META[tier].labels[lang]}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users_public/${uid}/friends/${targetUid}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-[#12121D] border border-white/[0.08] p-6 text-center space-y-4">
        <div
          className="w-20 h-20 rounded-full mx-auto bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center font-black text-3xl text-white"
          style={
            friendLink
              ? {
                  boxShadow: `0 0 0 3px #12121D, 0 0 0 6px ${
                    TIER_META[friendLink.tier].ringColor
                  }`,
                }
              : undefined
          }
        >
          {displayTag.charAt(0).toUpperCase()}
        </div>

        <div>
          <h2 className="text-2xl font-black text-white flex items-center justify-center gap-1.5">
            <span>{displayTag}</span>
            <BadgeIcon kind={effectiveBadge} className="w-5 h-5" />
          </h2>
          {viewedUser?.bio && (
            <p className="text-sm text-slate-300 mt-1 max-w-md mx-auto">{viewedUser.bio}</p>
          )}
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-center gap-2">
            <span className="tabular-nums">
              {t.level} {level} · {formatXp(viewedUser?.xp || 0)}
            </span>
            {friendLink && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-slate-200 font-semibold">
                  {t.friendTierLabel}: {TIER_META[friendLink.tier].labels[lang]}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          {isMe ? (
            <button
              type="button"
              onClick={onOpenEditProfile}
              className="min-h-[44px] px-5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-2"
            >
              <Edit3 className="w-4 h-4" />
              <span>{t.editProfile}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowTierPicker((v) => !v)}
                className="min-h-[44px] px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>{t.addFriend}</span>
              </button>

              <button
                type="button"
                onClick={() => onStartDm(targetUid, displayTag)}
                className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{t.startDm}</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenUserOptions(targetUid, displayTag)}
                aria-label={t.userOptions}
                className="min-h-[44px] min-w-[44px] rounded-xl bg-[#1A1A29] border border-white/10 text-slate-300 hover:text-white grid place-items-center"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {isOwner && (
                <button
                  type="button"
                  onClick={() => onOpenOwnerTools(targetUid, displayTag)}
                  className="min-h-[44px] px-4 rounded-xl border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-xs font-bold flex items-center gap-1.5"
                >
                  <Shield className="w-4 h-4" />
                  <span>{t.ownerTools}</span>
                </button>
              )}
            </>
          )}
        </div>

        {showTierPicker && !isMe && (
          <div className="pt-2 grid grid-cols-3 gap-2 max-w-md mx-auto">
            {(['normal', 'good', 'bro'] as FriendTier[]).map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => handleSetFriendTier(tier)}
                className="min-h-[44px] px-3 rounded-xl text-xs font-bold text-white border border-white/15 hover:opacity-90"
                style={{ backgroundColor: TIER_META[tier].ringColor }}
              >
                {TIER_META[tier].labels[lang]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Gamer Specs & Portfolio */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-[#12121D] border border-white/[0.08] p-5 space-y-3">
          {viewedUser?.gameId && (
            <div className="flex items-center justify-between py-2 border-b border-white/[0.06] text-sm">
              <span className="text-slate-400">{t.gameId}</span>
              <span className="font-bold text-white tabular-nums">{viewedUser.gameId}</span>
            </div>
          )}
          {viewedUser?.rank && (
            <div className="flex items-center justify-between py-2 border-b border-white/[0.06] text-sm">
              <span className="text-slate-400">{t.rank}</span>
              <span className="font-bold text-white">{viewedUser.rank}</span>
            </div>
          )}
          {viewedUser?.favoriteGames && (
            <div className="flex items-center justify-between py-2 border-b border-white/[0.06] text-sm gap-4">
              <span className="text-slate-400 shrink-0">{t.favGames}</span>
              <span className="font-semibold text-white text-end">{viewedUser.favoriteGames}</span>
            </div>
          )}
          {viewedUser?.skills && (
            <div className="pt-1">
              <div className="text-xs text-slate-400 mb-1">{t.skills}</div>
              <p className="text-sm text-slate-200">{viewedUser.skills}</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-[#12121D] border border-white/[0.08] p-5 space-y-3">
          <h3 className="font-bold text-sm text-white">{t.portfolio}</h3>
          {services.length === 0 ? (
            <p className="text-xs text-slate-400">{t.noPortfolio}</p>
          ) : (
            <div className="space-y-2">
              {services.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between py-2 border-b border-white/[0.06] text-sm"
                >
                  <span className="text-slate-200">{s.title}</span>
                  <span className="font-bold text-amber-400 tabular-nums">${s.price}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
