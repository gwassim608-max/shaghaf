import { useEffect, useState } from 'react';
import { Search, ShieldCheck, Smile, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

export interface MemeChoice {
  id: string;
  titleAr: string;
  titleEn: string;
  url: string;
}

export function MemePicker({
  onSelect,
  onClose,
}: {
  onSelect: (meme: MemeChoice) => void;
  onClose: () => void;
}) {
  const { lang, t } = useApp();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MemeChoice[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/gifs?q=${encodeURIComponent(query.trim())}`);
        if (!res.ok) return;
        const data = (await res.json()) as { blocked?: boolean; items?: MemeChoice[] };
        if (!active) return;
        setBlocked(Boolean(data.blocked));
        setItems(data.items || []);
      } catch {
        // ignore transient network error
      } finally {
        if (active) setLoading(false);
      }
    }, 150);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="rounded-2xl bg-[#161625] border border-violet-500/35 p-3 space-y-2.5 shadow-xl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-violet-300">
          <Smile className="w-4 h-4 shrink-0" />
          <span>{t.gifMemesTitle}</span>
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.close}
          className="min-h-[32px] min-w-[32px] rounded-lg text-slate-400 hover:text-white grid place-items-center"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <label className="h-10 px-3 rounded-xl bg-[#0E0E17] border border-white/10 flex items-center gap-2 focus-within:border-violet-500">
        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.gifSearchPlaceholder}
          className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
        />
      </label>

      {blocked ? (
        <div className="py-6 text-center text-xs font-semibold text-rose-400">
          {t.gifNsfwBlocked}
        </div>
      ) : loading && items.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400">...</div>
      ) : items.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400">
          {lang === 'ar' ? 'لا توجد نتائج مطابقة' : 'No matching memes'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-0.5">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className="group rounded-xl overflow-hidden border border-white/10 hover:border-violet-400 bg-[#09090F] text-start transition-colors"
            >
              <img
                src={item.url}
                alt={lang === 'ar' ? item.titleAr : item.titleEn}
                loading="lazy"
                className="w-full aspect-video object-cover"
              />
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-200 truncate group-hover:text-violet-300">
                {lang === 'ar' ? item.titleAr : item.titleEn}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
