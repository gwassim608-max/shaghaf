import { useState, type FormEvent } from 'react';
import { ShieldCheck, Swords, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { LIMITS } from '../lib/constants';
import type { Language } from '../types';

interface AuthViewProps {
  onOpenTerms: () => void;
}

export function AuthView({ onOpenTerms }: AuthViewProps) {
  const { firebaseUser, profile, lang, t, setLanguage, signInWithGoogle, registerGamerTag, logout } =
    useApp();
  const [isMinor, setIsMinor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tag, setTag] = useState('');
  const [imgCoverOk, setImgCoverOk] = useState(true);
  const [imgLogoOk, setImgLogoOk] = useState(true);

  const needsTag = Boolean(firebaseUser && !profile);

  const handleGoogle = async () => {
    setBusy(true);
    const guardTimer = setTimeout(() => setBusy(false), 15000);
    try {
      await signInWithGoogle(isMinor);
    } finally {
      clearTimeout(guardTimer);
      setBusy(false);
    }
  };

  const handleTagSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await registerGamerTag(tag, isMinor);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#09090F] text-[#F8FAFC] flex items-center justify-center p-4 lg:p-8 overflow-hidden">
      {/* Full-Page Background on Auth Screen */}
      <div aria-hidden="true" className="fixed inset-0 z-0 pointer-events-none">
        <img
          src="/assets/aistudio/shaghaf-cover_9b6d74ed.png"
          alt=""
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-45 scale-105 blur-[2px]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#09090F]/70 via-[#09090F]/65 to-[#09090F]/90" />
      </div>

      <div className="relative z-10 w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 rounded-3xl overflow-hidden border border-white/15 bg-[#12121D]/85 backdrop-blur-md items-stretch shadow-2xl">
        {/* Visual Hero Showcase */}
        <div className="relative min-h-[260px] lg:min-h-[600px] flex flex-col justify-between p-6 lg:p-10 bg-[#0D0D16]">
          {imgCoverOk ? (
            <img
              src="/assets/aistudio/shaghaf-cover_9b6d74ed.png"
              alt="شغف مجتمع اللاعبين والكلانات"
              referrerPolicy="no-referrer"
              onError={() => setImgCoverOk(false)}
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-violet-950 via-[#0D0D16] to-blue-950" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#09090F] via-[#09090F]/70 to-[#09090F]/35" />

          {/* Top language switcher */}
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {imgLogoOk ? (
                <img
                  src="/assets/aistudio/bg_c136e6ea.jpg"
                  alt="شعار شغف"
                  referrerPolicy="no-referrer"
                  onError={() => setImgLogoOk(false)}
                  className="w-11 h-11 rounded-xl object-cover border border-amber-400/40"
                />
              ) : (
                <div className="w-11 h-11 rounded-xl bg-violet-600 grid place-items-center font-black text-lg">
                  ش
                </div>
              )}
              <span className="text-xl font-black tracking-tight text-white">{t.brand}</span>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#09090F]/80 border border-white/10 backdrop-blur-md">
              {(['ar', 'en', 'fr'] as Language[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLanguage(code)}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                    lang === code
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {code === 'ar' ? 'العربية' : code === 'en' ? 'English' : 'Français'}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom hero copy */}
          <div className="relative z-10 mt-16 lg:mt-0 space-y-4">
            <h1 className="text-3xl lg:text-5xl font-black leading-tight text-white [text-wrap:balance]">
              {t.tagline}
            </h1>
            <p className="text-sm lg:text-base text-slate-300 max-w-xl leading-relaxed">
              {t.heroSubtitle}
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <Users className="w-4 h-4 text-violet-400" />
                {t.featureClans}
              </span>
              <span aria-hidden="true" className="text-slate-500">
                ·
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Swords className="w-4 h-4 text-blue-400" />
                {t.featureEsports}
              </span>
              <span aria-hidden="true" className="text-slate-500">
                ·
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                {t.featureSocial}
              </span>
            </div>
          </div>
        </div>

        {/* Auth / Onboarding Form Panel */}
        <div className="p-6 lg:p-12 flex flex-col justify-center bg-[#12121D]">
          {!needsTag ? (
            <div className="max-w-md w-full mx-auto space-y-6">
              <div>
                <h2 className="text-2xl font-black text-white">{t.brand}</h2>
                <p className="text-sm text-slate-400 mt-1">{t.heroSubtitle}</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="age-select" className="block text-xs font-medium text-slate-300">
                  {t.ageLabel}
                </label>
                <select
                  id="age-select"
                  value={isMinor ? '1' : '0'}
                  onChange={(e) => setIsMinor(e.target.value === '1')}
                  className="w-full h-12 px-4 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="0">{t.ageAdult}</option>
                  <option value="1">{t.ageMinor}</option>
                </select>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={handleGoogle}
                className="w-full min-h-[52px] px-6 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-bold text-base flex items-center justify-center gap-3 transition-transform active:scale-[0.99] disabled:opacity-60"
              >
                <span className="w-6 h-6 rounded-full bg-white text-slate-900 text-xs font-black grid place-items-center">
                  G
                </span>
                <span>{busy ? t.signingIn : t.continueGoogle}</span>
              </button>

              <p className="text-xs text-slate-400 text-center">
                <button
                  type="button"
                  onClick={onOpenTerms}
                  className="underline hover:text-white transition-colors min-h-[40px] px-2"
                >
                  {t.termsAccept}
                </button>
              </p>
            </div>
          ) : (
            <form onSubmit={handleTagSubmit} className="max-w-md w-full mx-auto space-y-5">
              <div>
                <h2 className="text-2xl font-black text-white">{t.chooseTagTitle}</h2>
                <p className="text-sm text-slate-400 mt-1">{t.chooseTagHint}</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="gamer-tag-input" className="block text-xs font-medium text-slate-300">
                  {t.chooseTagTitle}
                </label>
                <input
                  id="gamer-tag-input"
                  type="text"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  maxLength={LIMITS.GAMER_TAG_MAX}
                  placeholder={t.tagPlaceholder}
                  autoComplete="off"
                  className="w-full h-12 px-4 rounded-xl bg-[#1A1A29] border border-white/10 text-base text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="age-select-tag" className="block text-xs font-medium text-slate-300">
                  {t.ageLabel}
                </label>
                <select
                  id="age-select-tag"
                  value={isMinor ? '1' : '0'}
                  onChange={(e) => setIsMinor(e.target.value === '1')}
                  className="w-full h-12 px-4 rounded-xl bg-[#1A1A29] border border-white/10 text-sm text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="0">{t.ageAdult}</option>
                  <option value="1">{t.ageMinor}</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-[52px] px-6 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-bold text-base transition-transform active:scale-[0.99] disabled:opacity-60"
              >
                {t.startPlaying}
              </button>

              <button
                type="button"
                onClick={logout}
                className="w-full min-h-[44px] text-xs text-slate-400 hover:text-white transition-colors"
              >
                {t.logout}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
