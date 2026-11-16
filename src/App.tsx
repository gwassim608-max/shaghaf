import React, { useEffect, useState } from 'react';
import {
  Award,
  Bell,
  Bot,
  Crown,
  Gamepad2,
  Home,
  Image as ImageIcon,
  Mic,
  MicOff,
  Newspaper,
  Phone,
  PhoneOff,
  PlayCircle,
  Plus,
  Radio,
  Settings,
  Swords,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthView } from './components/AuthView';
import { FeedView } from './components/FeedView';
import { NewsView } from './components/NewsView';
import { VideosView } from './components/VideosView';
import { ClansAndChatView } from './components/ClansAndChatView';
import { ArenaHubView } from './components/ArenaHubView';
import { LiveView } from './components/LiveView';
import { ProfileView } from './components/ProfileView';
import { OwnerDashboardView } from './components/OwnerDashboardView';
import { BadgeIcon } from './components/BadgeIcon';
import { Modals, type ActiveModal } from './components/Modals';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { calcLevel, formatXp, PLAYABLE_GAMES } from './lib/constants';
import { resolvePageWallpaper } from './lib/serverThemes';
import type { NavTab } from './types';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#09090F] text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-[#12121D] border border-white/10 p-6 text-center space-y-4">
            <h2 className="text-lg font-bold">حدث خطأ غير متوقع</h2>
            <p className="text-xs text-slate-400 break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-5 rounded-xl bg-violet-600 text-white text-sm font-bold"
            >
              إعادة التحميل
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function VoiceCallFloatingBar() {
  const {
    callState,
    callPeer,
    callMuted,
    callStartedAt,
    t,
    lang,
    acceptVoiceCall,
    rejectVoiceCall,
    endVoiceCall,
    toggleCallMute,
  } = useApp();
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (callState !== 'connected' || !callStartedAt) {
      setElapsedSec(0);
      return;
    }
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - callStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [callState, callStartedAt]);

  if (callState === 'idle' || !callPeer) return null;

  const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const secs = String(elapsedSec % 60).padStart(2, '0');

  return (
    <div className="fixed bottom-16 lg:bottom-5 inset-x-4 sm:inset-x-auto sm:end-5 z-50 sm:w-80 rounded-2xl bg-[#161627] border border-emerald-500/45 p-3.5 shadow-2xl flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[11px] font-bold text-emerald-400">
          {callState === 'ringing'
            ? t.incomingCall
            : callState === 'calling'
            ? t.callingFriend
            : lang === 'ar'
            ? 'مكالمة صوتية نشطة'
            : 'Active Voice Call'}
        </div>
        <div className="font-black text-sm text-white truncate flex items-center gap-2">
          <span className="truncate">{callPeer.tag}</span>
          {callState === 'connected' && (
            <span className="text-xs font-semibold text-emerald-300 tabular-nums shrink-0">
              {mins}:{secs}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {callState === 'ringing' ? (
          <>
            <button
              type="button"
              onClick={acceptVoiceCall}
              aria-label={t.acceptCall}
              className="min-h-[40px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>{t.acceptCall}</span>
            </button>
            <button
              type="button"
              onClick={rejectVoiceCall}
              aria-label={t.rejectCall}
              className="min-h-[40px] min-w-[40px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white grid place-items-center"
            >
              <PhoneOff className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            {callState === 'connected' && (
              <button
                type="button"
                onClick={toggleCallMute}
                aria-label={callMuted ? t.unmuteMic : t.muteMic}
                className={`min-h-[40px] min-w-[40px] rounded-xl grid place-items-center border ${
                  callMuted
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-[#1A1A29] border-white/10 text-slate-200'
                }`}
              >
                {callMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={endVoiceCall}
              aria-label={t.endCall}
              className="min-h-[40px] px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              <span>{t.endCall}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ShaghafShell() {
  const {
    authReady,
    profileLoaded,
    firebaseUser,
    profile,
    flagsMap,
    botMessages,
    notifications,
    onlineUids,
    playingMap,
    totalUsersCount,
    dndMode,
    liteMode,
    pageBgPref,
    isOwner,
    lang,
    t,
    toastMsg,
    markNotificationsRead,
    setPlayingGame,
  } = useApp();

  const [tab, setTab] = useState<NavTab>('home');
  const [selectedServer, setSelectedServer] = useState('ALL');
  const [viewedProfile, setViewedProfile] = useState<{ uid: string; tag?: string } | null>(null);
  const [dmTarget, setDmTarget] = useState<{ uid: string; tag: string } | null>(null);
  const [modal, setModal] = useState<ActiveModal>(null);

  // Handle Web Share Target links shared to Shaghaf PWA from YouTube/TikTok/browser
  useEffect(() => {
    if (!firebaseUser || !profile) return;
    const params = new URLSearchParams(window.location.search);
    const shareTitle = (params.get('share_title') || '').trim();
    const shareText = (params.get('share_text') || '').trim();
    const shareUrl = (params.get('share_url') || '').trim();
    if (!shareTitle && !shareText && !shareUrl) return;

    const urlMatch = `${shareUrl} ${shareText}`.match(/https:\/\/\S+/i);
    const extractedUrl = urlMatch ? urlMatch[0] : '';
    const cleanTitle =
      shareTitle ||
      shareText
        .replace(/https:\/\/\S+/gi, '')
        .trim()
        .slice(0, 140);

    setTab('videos');
    setModal({
      type: 'video',
      defaultServer: selectedServer,
      initialTitle: cleanTitle,
      initialUrl: extractedUrl,
    });
    window.history.replaceState({}, '', window.location.pathname);
  }, [firebaseUser, profile, selectedServer]);

  if (!authReady || (firebaseUser && !profileLoaded)) {
    return (
      <div className="min-h-screen bg-[#09090F] grid place-items-center text-slate-400 text-sm">
        {t.brand}...
      </div>
    );
  }

  if (!firebaseUser || !profile) {
    return (
      <>
        <AuthView onOpenTerms={() => setModal({ type: 'terms' })} />
        <Modals modal={modal} onClose={() => setModal(null)} onSwitchModal={setModal} />
        {toastMsg && (
          <div
            role="status"
            className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl bg-[#12121D] border border-violet-500/60 text-sm text-white"
          >
            {toastMsg}
          </div>
        )}
      </>
    );
  }

  const unreadNotifs = !dndMode && notifications.some((n) => !n.read);
  const unreadBotCount = botMessages.filter((m) => !m.read).length;
  const myBadge = flagsMap[firebaseUser.uid]?.badge || (isOwner ? 'own' : 'none');

  const openProfile = (uid: string, tag?: string) => {
    setViewedProfile({ uid, tag });
    setTab('profile');
  };

  const pageWallpaper = resolvePageWallpaper(pageBgPref, selectedServer);

  const navItems: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: t.navHome, icon: <Home className="w-5 h-5" /> },
    { id: 'news', label: t.navNews, icon: <Newspaper className="w-5 h-5" /> },
    { id: 'clans', label: t.navClans, icon: <Users className="w-5 h-5" /> },
    { id: 'arena', label: t.navArena, icon: <Swords className="w-5 h-5" /> },
    { id: 'live', label: t.navLive, icon: <Radio className="w-5 h-5" /> },
    { id: 'profile', label: t.navProfile, icon: <UserIcon className="w-5 h-5" /> },
    ...(isOwner
      ? [{ id: 'owner' as NavTab, label: t.navOwner, icon: <Crown className="w-5 h-5" /> }]
      : []),
  ];

  const mobileNavItems: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: t.navHome, icon: <Home className="w-5 h-5" /> },
    { id: 'news', label: t.navNews, icon: <Newspaper className="w-5 h-5" /> },
    { id: 'clans', label: t.navClans, icon: <Users className="w-5 h-5" /> },
    { id: 'arena', label: t.navArena, icon: <Swords className="w-5 h-5" /> },
    { id: 'profile', label: t.navProfile, icon: <UserIcon className="w-5 h-5" /> },
    ...(isOwner
      ? [{ id: 'owner' as NavTab, label: t.navOwner, icon: <Crown className="w-5 h-5" /> }]
      : []),
  ];

  return (
    <div className="relative min-h-screen text-[#F8FAFC] flex flex-col">
      {/* Full-Page Fixed Viewport Wallpaper */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[#09090F]"
      >
        {pageWallpaper.mode === 'mosaic' && !liteMode && pageWallpaper.collageImages ? (
          <div className="absolute inset-0 grid grid-cols-2 sm:grid-cols-3 grid-rows-3 sm:grid-rows-2 gap-0">
            {pageWallpaper.collageImages.map((imgUrl, idx) => (
              <div key={imgUrl + idx} className="relative overflow-hidden">
                <img
                  src={imgUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover opacity-55 scale-105"
                />
              </div>
            ))}
          </div>
        ) : pageWallpaper.mode !== 'solid' && pageWallpaper.imageUrl ? (
          <img
            src={pageWallpaper.imageUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-55 transition-opacity duration-500"
          />
        ) : null}

        {/* Calibrated Readability Scrim + Server Accent Atmospheric Glow */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(9,9,15,0.58) 0%, rgba(9,9,15,0.68) 45%, rgba(9,9,15,0.88) 100%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at top center, ${pageWallpaper.accentColor}29 0%, transparent 55%)`,
          }}
        />
      </div>

      {/* 3-Zone Top Bar Contract (Desktop & Mobile <= 56px) */}
      <header className="sticky top-0 z-30 h-14 border-b border-white/[0.08] bg-[#09090F]/72 backdrop-blur-md">
        <div className="max-w-7xl mx-auto h-full px-4 lg:px-6 flex items-center justify-between gap-6">
          {/* Zone 1: Brand wordmark */}
          <button
            type="button"
            onClick={() => setTab('home')}
            className="text-base sm:text-xl font-black tracking-tight text-white whitespace-nowrap shrink-0"
          >
            {t.brand}
          </button>

          {/* Zone 2: Desktop Single-line Nav Links */}
          <nav className="hidden lg:flex items-center gap-6">
            {navItems.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === 'profile') setViewedProfile({ uid: firebaseUser.uid });
                    setTab(item.id);
                  }}
                  className={`text-sm font-semibold whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                    active
                      ? item.id === 'owner'
                        ? 'text-amber-400 border-amber-400'
                        : 'text-white border-violet-500'
                      : item.id === 'owner'
                      ? 'text-amber-400/80 border-transparent hover:text-amber-300'
                      : 'text-slate-400 border-transparent hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <button
            type="button"
            onClick={() => setModal({ type: 'post', defaultServer: selectedServer })}
            className="min-h-[40px] px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{t.newPost}</span>
          </button>
        </div>
      </header>

      {/* Main Responsive Workspace */}
      <div className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 lg:px-6 py-4 lg:py-6 pb-20 lg:pb-8 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
        {/* Left/Right Contextual Sidebar (Desktop) */}
        <aside className="hidden lg:block space-y-4 sticky top-20">
          <div className="rounded-2xl bg-[#12121D]/78 backdrop-blur-md border border-white/[0.08] p-4 space-y-4">
            <div className="flex items-center gap-3">
              <img
                src="/assets/aistudio/bg_c136e6ea.jpg"
                alt="شعار شغف"
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-xl object-cover border border-amber-400/30 shrink-0"
              />
              <div className="min-w-0">
                <div className="font-black text-base text-white flex items-center gap-1.5">
                  <span className="truncate">{profile.gamerTag}</span>
                  <BadgeIcon kind={myBadge} />
                </div>
                <div className="text-xs text-slate-400 tabular-nums">
                  {t.level} {calcLevel(profile.xp)} · {formatXp(profile.xp)}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-white/[0.06] space-y-1">
              {isOwner && (
                <button
                  type="button"
                  onClick={() => setTab('owner')}
                  className={`w-full min-h-[44px] px-3 rounded-xl text-sm font-bold flex items-center gap-2.5 ${
                    tab === 'owner'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35'
                      : 'text-amber-300 hover:bg-amber-500/10'
                  }`}
                >
                  <Crown className="w-4 h-4 shrink-0" />
                  <span>{t.navOwner}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setTab('videos')}
                className={`w-full min-h-[44px] px-3 rounded-xl text-sm font-bold flex items-center gap-2.5 ${
                  tab === 'videos'
                    ? 'bg-violet-600/20 text-violet-300 border border-violet-500/35'
                    : 'text-slate-200 hover:bg-white/5'
                }`}
              >
                <PlayCircle className="w-4 h-4 text-violet-400 shrink-0" />
                <span>{t.watchVideos}</span>
              </button>

              <button
                type="button"
                onClick={() => setModal({ type: 'botInbox' })}
                className="w-full min-h-[44px] px-3 rounded-xl hover:bg-white/5 text-sm font-medium text-slate-200 flex items-center justify-between"
              >
                <span className="flex items-center gap-2.5">
                  <Bot className="w-4 h-4 text-violet-400" />
                  <span>{lang === 'ar' ? 'بوت شغف' : 'Shaghaf Bot'}</span>
                </span>
                {unreadBotCount > 0 && (
                  <span className="text-[11px] font-bold text-violet-300 tabular-nums">
                    {unreadBotCount}
                  </span>
                )}
              </button>

              {!isOwner && myBadge === 'none' && (
                <button
                  type="button"
                  onClick={() => setModal({ type: 'badgeRequest' })}
                  className="w-full min-h-[44px] px-3 rounded-xl hover:bg-amber-500/10 text-sm font-medium text-amber-300 flex items-center gap-2.5"
                >
                  <Award className="w-4 h-4 shrink-0" />
                  <span className="truncate">{t.badgeSubBtn}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  markNotificationsRead();
                  setModal({ type: 'notifications' });
                }}
                className="w-full min-h-[44px] px-3 rounded-xl hover:bg-white/5 text-sm font-medium text-slate-200 flex items-center justify-between"
              >
                <span className="flex items-center gap-2.5">
                  <Bell className="w-4 h-4 text-slate-400" />
                  <span>{t.notifications}</span>
                </span>
                {unreadNotifs && (
                  <span className="text-[11px] font-bold text-rose-400 tabular-nums">
                    {notifications.filter((n) => !n.read).length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setModal({ type: 'settings' })}
                className="w-full min-h-[44px] px-3 rounded-xl hover:bg-white/5 text-sm font-medium text-slate-200 flex items-center gap-2.5"
              >
                <Settings className="w-4 h-4 text-slate-400" />
                <span>{t.settings}</span>
              </button>

              <PWAInstallButton />
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden border border-white/[0.08] bg-[#12121D]/78 backdrop-blur-md">
            <img
              src="/assets/aistudio/shaghaf-cover_9b6d74ed.png"
              alt="Shaghaf Gaming Arena"
              referrerPolicy="no-referrer"
              className="w-full h-32 object-cover"
            />
            <div className="p-4 space-y-2">
              <div className="font-bold text-sm text-white">{t.brand}</div>
              <p className="text-xs text-slate-400 leading-relaxed">{t.tagline}</p>
            </div>
          </div>
        </aside>

        {/* Active View */}
        <main className="min-w-0">
          {/* Top-Right Community Live Counters + Active Playing Game Status + Wallpaper Picker */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 rounded-2xl bg-[#12121D]/78 backdrop-blur-md border border-white/[0.08] px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-3 text-xs font-bold tabular-nums">
              <span className="text-slate-200 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <span>{t.totalAccounts}:</span>
                <span className="text-white">{Math.max(totalUsersCount, onlineUids.length)}</span>
              </span>
              <span className="text-emerald-400 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block shrink-0" />
                <span>{t.onlineNow}:</span>
                <span>{onlineUids.length}</span>
              </span>
              <span className="text-rose-400 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shrink-0" />
                <span>{t.offlineNow}:</span>
                <span>{Math.max(0, totalUsersCount - onlineUids.length)}</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModal({ type: 'wallpaper' })}
                aria-label={t.pageWallpaperTitle}
                title={t.pageWallpaperTitle}
                className="h-9 px-2.5 rounded-xl bg-[#1A1A29]/90 hover:bg-violet-600/20 border border-white/10 hover:border-violet-400/50 text-xs font-bold text-violet-300 flex items-center gap-1.5 whitespace-nowrap"
              >
                <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{t.pageWallpaperBtn}</span>
              </button>

              <label className="flex items-center gap-1.5 text-xs text-slate-300">
                <Gamepad2 className="w-4 h-4 text-violet-400 shrink-0" />
                <select
                  aria-label={t.selectPlayingGame}
                  value={playingMap[firebaseUser.uid] || profile.playingGame || ''}
                  onChange={(e) => void setPlayingGame(e.target.value)}
                  className="h-9 px-2.5 rounded-xl bg-[#1A1A29]/90 border border-white/10 text-xs font-semibold text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="">{t.selectPlayingGame}</option>
                  {PLAYABLE_GAMES.map((g) => (
                    <option key={g} value={g}>
                      {t.playingNow}: {g}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* Mobile Utility Strip (Bot + Notifications + Settings) */}
          <div className="flex lg:hidden items-center justify-between mb-3">
            <div className="text-xs text-slate-300 font-semibold flex items-center gap-1.5 tabular-nums min-w-0">
              <span className="truncate">{profile.gamerTag}</span>
              <BadgeIcon kind={myBadge} className="w-3.5 h-3.5" />
              <span className="text-slate-400 shrink-0">
                · {t.level} {calcLevel(profile.xp)}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <PWAInstallButton compact />
              <button
                type="button"
                onClick={() => setTab('videos')}
                aria-label={t.watchVideos}
                className={`min-h-[44px] min-w-[44px] rounded-xl border grid place-items-center ${
                  tab === 'videos'
                    ? 'bg-violet-600/25 border-violet-500/50 text-violet-300'
                    : 'bg-[#12121D] border-white/[0.08] text-violet-300'
                }`}
              >
                <PlayCircle className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setTab('live')}
                aria-label={t.navLive}
                className={`min-h-[44px] min-w-[44px] rounded-xl border grid place-items-center ${
                  tab === 'live'
                    ? 'bg-rose-600/25 border-rose-500/50 text-rose-300'
                    : 'bg-[#12121D] border-white/[0.08] text-rose-300'
                }`}
              >
                <Radio className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setModal({ type: 'botInbox' })}
                aria-label={lang === 'ar' ? 'بوت شغف' : 'Shaghaf Bot'}
                className="min-h-[44px] min-w-[44px] rounded-xl bg-[#12121D] border border-white/[0.08] grid place-items-center text-violet-300 relative"
              >
                <Bot className="w-4 h-4" />
                {unreadBotCount > 0 && (
                  <span className="absolute top-2.5 end-2.5 w-2 h-2 rounded-full bg-violet-400" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  markNotificationsRead();
                  setModal({ type: 'notifications' });
                }}
                aria-label={t.notifications}
                className="min-h-[44px] min-w-[44px] rounded-xl bg-[#12121D] border border-white/[0.08] grid place-items-center text-slate-200 relative"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifs && (
                  <span className="absolute top-2.5 end-2.5 w-2 h-2 rounded-full bg-rose-500" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setModal({ type: 'settings' })}
                aria-label={t.settings}
                className="min-h-[44px] min-w-[44px] rounded-xl bg-[#12121D] border border-white/[0.08] grid place-items-center text-slate-200"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {tab === 'home' && (
            <FeedView
              selectedServer={selectedServer}
              onSelectServer={setSelectedServer}
              onOpenProfile={openProfile}
              onOpenPostModal={() => setModal({ type: 'post', defaultServer: selectedServer })}
              onOpenStoryModal={() => setModal({ type: 'story' })}
              onOpenVideos={() => setTab('videos')}
              onOpenOwnerTools={(uid, tag) => setModal({ type: 'ownerTools', uid, tag })}
              onOpenUserOptions={(uid, tag) => setModal({ type: 'userOptions', uid, tag })}
            />
          )}

          {tab === 'news' && <NewsView onOpenArena={() => setTab('arena')} />}

          {tab === 'videos' && (
            <VideosView
              selectedServer={selectedServer}
              onSelectServer={setSelectedServer}
              onOpenProfile={openProfile}
              onOpenVideoModal={() => setModal({ type: 'video', defaultServer: selectedServer })}
              onOpenOwnerTools={(uid, tag) => setModal({ type: 'ownerTools', uid, tag })}
              onBackToFeed={() => setTab('home')}
            />
          )}

          {tab === 'clans' && (
            <ClansAndChatView
              initialDmTarget={dmTarget}
              onClearDmTarget={() => setDmTarget(null)}
              onOpenCreateClan={() => setModal({ type: 'clan' })}
              onOpenProfile={openProfile}
            />
          )}

          {tab === 'arena' && (
            <ArenaHubView
              onOpenCreate={(kind) => setModal({ type: 'arena', kind })}
              onOpenOrder={(service) => setModal({ type: 'order', service })}
              onOpenProfile={openProfile}
              onOpenEditProfile={() => setModal({ type: 'editProfile' })}
            />
          )}

          {tab === 'live' && <LiveView />}

          {tab === 'profile' && (
            <ProfileView
              targetUid={viewedProfile?.uid || firebaseUser.uid}
              fallbackTag={viewedProfile?.tag}
              onStartDm={(uid, tag) => {
                setDmTarget({ uid, tag });
                setTab('clans');
              }}
              onOpenEditProfile={() => setModal({ type: 'editProfile' })}
              onOpenOwnerTools={(uid, tag) => setModal({ type: 'ownerTools', uid, tag })}
              onOpenUserOptions={(uid, tag) => setModal({ type: 'userOptions', uid, tag })}
            />
          )}

          {tab === 'owner' && isOwner && <OwnerDashboardView onOpenProfile={openProfile} />}
        </main>
      </div>

      {/* Mobile Fixed Bottom Thumb Bar (56px height) */}
      <nav
        className={`lg:hidden fixed bottom-0 inset-x-0 z-40 h-14 border-t border-white/[0.08] bg-[#09090F]/90 backdrop-blur-md grid ${
          isOwner ? 'grid-cols-6' : 'grid-cols-5'
        } items-center`}
      >
        {mobileNavItems.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === 'profile') setViewedProfile({ uid: firebaseUser.uid });
                setTab(item.id);
              }}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-colors ${
                active
                  ? item.id === 'owner'
                    ? 'text-amber-400'
                    : 'text-violet-400'
                  : item.id === 'owner'
                  ? 'text-amber-400/75'
                  : 'text-slate-400'
              }`}
            >
              {item.icon}
              <span className="truncate max-w-[60px]">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <Modals modal={modal} onClose={() => setModal(null)} onSwitchModal={setModal} />
      <VoiceCallFloatingBar />
      <OfflineIndicator />

      {toastMsg && (
        <div
          role="status"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl bg-[#12121D] border border-violet-500/60 text-sm text-white max-w-[90vw] text-center"
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <ShaghafShell />
      </AppProvider>
    </ErrorBoundary>
  );
}
