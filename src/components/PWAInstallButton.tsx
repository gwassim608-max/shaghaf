import { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton({
  compact = false,
  alwaysShowGuide = false,
}: {
  compact?: boolean;
  alwaysShowGuide?: boolean;
}) {
  const { lang } = useApp();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const label =
    lang === 'ar'
      ? 'تثبيت التطبيق'
      : lang === 'fr'
      ? 'Installer l’app'
      : 'Install App';

  const handleClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (ok) return;
    }
    setShowGuide(true);
  };

  if (!isInstallable && !isIOS && !alwaysShowGuide) {
    return null;
  }

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={handleClick}
          aria-label={label}
          className="min-h-[44px] min-w-[44px] rounded-xl bg-violet-600/15 border border-violet-500/35 text-violet-300 grid place-items-center"
        >
          <Download className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className="w-full min-h-[44px] px-3 rounded-xl bg-violet-600/15 hover:bg-violet-600/25 border border-violet-500/35 text-sm font-bold text-violet-200 flex items-center gap-2.5 transition-colors"
        >
          <Download className="w-4 h-4 text-violet-400 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      )}

      {showGuide && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[#12121D] border border-white/10 p-6 space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/40 text-violet-300 grid place-items-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </span>
                <h3 className="text-base font-black text-white">{label}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close"
                className="min-h-[40px] min-w-[40px] rounded-xl text-slate-400 hover:text-white hover:bg-white/5 grid place-items-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isIOS ? (
              <div className="text-sm text-slate-200 leading-relaxed space-y-2">
                <p>
                  {lang === 'ar'
                    ? '1. افتح التطبيق في متصفح Safari واضغط على زر المشاركة في الأسفل.'
                    : '1. Tap the Share button in Safari.'}
                </p>
                <p>
                  {lang === 'ar'
                    ? '2. اختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).'
                    : '2. Scroll down and tap Add to Home Screen.'}
                </p>
                <p className="text-xs text-slate-400">
                  {lang === 'ar'
                    ? 'سيعمل التطبيق بأيقونته الكاملة وبحسابك المالك مباشرة.'
                    : 'The app will launch standalone with your Owner account.'}
                </p>
              </div>
            ) : (
              <div className="text-sm text-slate-200 leading-relaxed space-y-2">
                <p>
                  {lang === 'ar'
                    ? '1. افتح رابط التطبيق في متصفح Chrome على هاتفك.'
                    : '1. Open the app URL in Chrome on your phone or desktop.'}
                </p>
                <p>
                  {lang === 'ar'
                    ? '2. اضغط على قائمة النقاط الثلاث (⋮) بالأعلى واختر «تثبيت التطبيق» أو «الإضافة إلى الشاشة الرئيسية».'
                    : '2. Open the browser menu (⋮) and tap Install App / Add to Home Screen.'}
                </p>
                <p className="text-xs text-slate-400">
                  {lang === 'ar'
                    ? 'بعد التثبيت، يظهر شغف كتطبيق مستقل ويمكنك مشاركة الفيديوهات إليه مباشرة من YouTube وTikTok.'
                    : 'Once installed, Shaghaf opens as a standalone app and appears in your share sheet for videos.'}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full min-h-[46px] rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm"
            >
              {lang === 'ar' ? 'فهمت' : 'Got it'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator() {
  const { lang } = useApp();
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-16 lg:bottom-4 start-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-lg"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>
        {lang === 'ar'
          ? 'وضع عدم الاتصال — يتم عرض البيانات المحفوظة'
          : lang === 'fr'
          ? 'Hors ligne — données en cache'
          : 'Offline Mode — Cached data'}
      </span>
    </div>
  );
}
