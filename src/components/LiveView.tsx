import { useState } from 'react';
import { Radio } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function LiveView() {
  const { t, showToast } = useApp();
  const [streaming, setStreaming] = useState(false);

  const handleToggle = () => {
    setStreaming((prev) => {
      const next = !prev;
      showToast(next ? t.liveStreaming : t.liveReady);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-gradient-to-br from-rose-700 via-orange-600 to-amber-600 p-6 lg:p-8 text-center text-white">
        <div className="w-14 h-14 rounded-2xl bg-black/20 mx-auto grid place-items-center mb-4">
          <Radio className="w-7 h-7" />
        </div>
        <h2 className="text-2xl font-black">{t.liveTitle}</h2>
        <p className="text-sm text-white/90 max-w-lg mx-auto mt-2 leading-relaxed">{t.liveDesc}</p>
        <button
          type="button"
          onClick={handleToggle}
          className="mt-6 min-h-[48px] px-6 rounded-xl bg-white text-rose-700 font-black text-sm hover:bg-slate-100 transition-colors"
        >
          {streaming ? t.stopStream : t.startStream}
        </button>
      </div>

      <div className="rounded-2xl bg-[#12121D] border border-white/[0.08] p-8 text-center text-sm text-slate-300">
        {streaming ? t.liveStreaming : t.liveReady}
      </div>
    </div>
  );
}
