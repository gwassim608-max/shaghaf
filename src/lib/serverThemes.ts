import type { Language } from '../types';

export interface ServerTheme {
  id: string;
  imageUrl: string;
  collageImages?: string[];
  accentFrom: string;
  accentTo: string;
  subtitle: Record<Language, string>;
}

export const ALL_COLLAGE_IMAGES = [
  '/backgrounds/free_fire.jpg',
  '/backgrounds/pubg_mobile.jpg',
  '/backgrounds/the_finals.jpg',
  '/backgrounds/valorant.jpg',
  '/backgrounds/warzone_fortnite.jpg',
  '/api/server-bg/CS2.svg',
  '/api/server-bg/EAFC.svg',
  '/api/server-bg/APEX.svg',
];

const SERVER_THEME_MAP: Record<string, ServerTheme> = {
  ALL: {
    id: 'ALL',
    imageUrl: '/backgrounds/the_finals.jpg',
    collageImages: ALL_COLLAGE_IMAGES,
    accentFrom: '#7C3AED',
    accentTo: '#F59E0B',
    subtitle: {
      ar: 'ساحة شغف المدمجة — جميع السيرفرات والألعاب في خلفية واحدة',
      en: 'Unified Shaghaf Hub — All game servers blended together',
      fr: 'Hub Shaghaf unifié — Tous les serveurs réunis',
    },
  },
  FOR_YOU: {
    id: 'FOR_YOU',
    imageUrl: '/api/server-bg/FOR_YOU.svg',
    accentFrom: '#7C3AED',
    accentTo: '#EC4899',
    subtitle: {
      ar: 'مختارات مخصصة لألعابك المفضلة وأبرز المنشورات',
      en: 'Curated picks tailored to your favorite games',
      fr: 'Sélection personnalisée selon vos jeux préférés',
    },
  },
  'Free Fire': {
    id: 'Free Fire',
    imageUrl: '/backgrounds/free_fire.jpg',
    accentFrom: '#F59E0B',
    accentTo: '#EF4444',
    subtitle: {
      ar: 'ساحة Free Fire — سكوادات، كلاش سكواد، وهيدشوت',
      en: 'Free Fire — Squads, Clash Squad & Booyah highlights',
      fr: 'Free Fire — Escouades, Clash Squad et Booyah',
    },
  },
  'PUBG Mobile': {
    id: 'PUBG Mobile',
    imageUrl: '/backgrounds/pubg_mobile.jpg',
    accentFrom: '#D97706',
    accentTo: '#475569',
    subtitle: {
      ar: 'ساحة PUBG Mobile — إيرانغل، سكريمات، وتشيكن دينر',
      en: 'PUBG Mobile — Erangel scrims & Chicken Dinners',
      fr: 'PUBG Mobile — Scrims Erangel et Chicken Dinners',
    },
  },
  'THE FINALS': {
    id: 'THE FINALS',
    imageUrl: '/backgrounds/the_finals.jpg',
    accentFrom: '#DC2626',
    accentTo: '#F59E0B',
    subtitle: {
      ar: 'ساحة THE FINALS — بطولات Cashout، World Tour، وتحديثات Embark الرسمية',
      en: 'THE FINALS — Official Cashout, World Tour & Embark updates',
      fr: 'THE FINALS — Cashout, World Tour et mises à jour Embark',
    },
  },
  Valorant: {
    id: 'Valorant',
    imageUrl: '/backgrounds/valorant.jpg',
    accentFrom: '#EF4444',
    accentTo: '#06B6D4',
    subtitle: {
      ar: 'ساحة Valorant — رانكد، تكتيكات VCT، ولقطات Ace',
      en: 'Valorant — Ranked, VCT tactics & Ace clips',
      fr: 'Valorant — Classé, tactiques VCT et clips Ace',
    },
  },
  Warzone: {
    id: 'Warzone',
    imageUrl: '/backgrounds/warzone_fortnite.jpg',
    accentFrom: '#10B981',
    accentTo: '#3B82F6',
    subtitle: {
      ar: 'ساحة Warzone — ريسيرجنس، لوداوت، وبطولات COD',
      en: 'Warzone — Resurgence, loadouts & COD Esports',
      fr: 'Warzone — Resurgence, classes et e-sport COD',
    },
  },
  Fortnite: {
    id: 'Fortnite',
    imageUrl: '/backgrounds/warzone_fortnite.jpg',
    accentFrom: '#8B5CF6',
    accentTo: '#06B6D4',
    subtitle: {
      ar: 'ساحة Fortnite — فيكتوري رويال وFNCS التنافسية',
      en: 'Fortnite — Victory Cups & FNCS Competitive',
      fr: 'Fortnite — Victory Cups et FNCS',
    },
  },
  'Call of Duty': {
    id: 'Call of Duty',
    imageUrl: '/backgrounds/warzone_fortnite.jpg',
    accentFrom: '#F97316',
    accentTo: '#64748B',
    subtitle: {
      ar: 'ساحة Call of Duty — طور اللعب الجماعي وSearch & Destroy',
      en: 'Call of Duty — Multiplayer & Competitive S&D',
      fr: 'Call of Duty — Multijoueur et R&D compétitif',
    },
  },
  'Apex Legends': {
    id: 'Apex Legends',
    imageUrl: '/api/server-bg/APEX.svg',
    accentFrom: '#DC2626',
    accentTo: '#F59E0B',
    subtitle: {
      ar: 'ساحة Apex Legends — ALGS وتحديات الرانكد',
      en: 'Apex Legends — ALGS & Ranked Arenas',
      fr: 'Apex Legends — ALGS et Arènes classées',
    },
  },
  CS2: {
    id: 'CS2',
    imageUrl: '/api/server-bg/CS2.svg',
    accentFrom: '#F59E0B',
    accentTo: '#1D4ED8',
    subtitle: {
      ar: 'ساحة CS2 — بطولات Major وFaceit Premier',
      en: 'CS2 — Majors & Premier competitive lobbies',
      fr: 'CS2 — Majors et matchs Premier',
    },
  },
  'League of Legends': {
    id: 'League of Legends',
    imageUrl: '/api/server-bg/LOL.svg',
    accentFrom: '#0284C7',
    accentTo: '#D97706',
    subtitle: {
      ar: 'ساحة League of Legends — سولو كيو وبطولات Worlds',
      en: 'League of Legends — SoloQ & Worlds Esports',
      fr: 'League of Legends — SoloQ et Worlds',
    },
  },
  'Rocket League': {
    id: 'Rocket League',
    imageUrl: '/api/server-bg/RL.svg',
    accentFrom: '#2563EB',
    accentTo: '#F97316',
    subtitle: {
      ar: 'ساحة Rocket League — RLCS وأهداف هوائية',
      en: 'Rocket League — RLCS & Aerial goals',
      fr: 'Rocket League — RLCS et buts aériens',
    },
  },
  'Mobile Legends': {
    id: 'Mobile Legends',
    imageUrl: '/api/server-bg/ML.svg',
    accentFrom: '#6366F1',
    accentTo: '#EC4899',
    subtitle: {
      ar: 'ساحة Mobile Legends — Mythic وسكوادات MPL',
      en: 'Mobile Legends — Mythic & MPL squads',
      fr: 'Mobile Legends — Mythic et équipes MPL',
    },
  },
  'EA FC': {
    id: 'EA FC',
    imageUrl: '/api/server-bg/EAFC.svg',
    accentFrom: '#16A34A',
    accentTo: '#0EA5E9',
    subtitle: {
      ar: 'ساحة EA FC — دوري FC Pro وUltimate Team',
      en: 'EA FC — FC Pro & Ultimate Team battles',
      fr: 'EA FC — FC Pro et Ultimate Team',
    },
  },
  'Clans & LFG': {
    id: 'Clans & LFG',
    imageUrl: '/api/server-bg/CLAN.svg',
    accentFrom: '#7C3AED',
    accentTo: '#3B82F6',
    subtitle: {
      ar: 'البحث عن فرق وكلانات وتكوين سكوادات جاهزة',
      en: 'Recruit clans and build active squads',
      fr: 'Recruter des clans et former des escouades',
    },
  },
  MENA: {
    id: 'MENA',
    imageUrl: '/api/server-bg/MENA.svg',
    accentFrom: '#059669',
    accentTo: '#F59E0B',
    subtitle: {
      ar: 'مجتمع لاعبي الشرق الأوسط وشمال أفريقيا',
      en: 'Middle East & North Africa Gaming Hub',
      fr: 'Communauté Gaming MENA',
    },
  },
  Global: {
    id: 'Global',
    imageUrl: '/api/server-bg/GLOBAL.svg',
    accentFrom: '#2563EB',
    accentTo: '#7C3AED',
    subtitle: {
      ar: 'ساحة اللاعبين العالمية لجميع البطولات والتحديات',
      en: 'Global Esports & Gaming Community',
      fr: 'Communauté Gaming Mondiale',
    },
  },
  Editors: {
    id: 'Editors',
    imageUrl: '/api/server-bg/EDITORS.svg',
    accentFrom: '#EC4899',
    accentTo: '#8B5CF6',
    subtitle: {
      ar: 'مونتاج، لقطات إبداعية، وتأثيرات الألعاب',
      en: 'Gaming edits, montages & highlight VFX',
      fr: 'Montages gaming et effets visuels',
    },
  },
  'Dev & Design': {
    id: 'Dev & Design',
    imageUrl: '/api/server-bg/DEV.svg',
    accentFrom: '#06B6D4',
    accentTo: '#6366F1',
    subtitle: {
      ar: 'تصميم شعارات الكلانات وبرمجة أدوات اللاعبين',
      en: 'Clan branding, overlays & gaming dev',
      fr: 'Design de clans et développement gaming',
    },
  },
};

export function getServerTheme(serverId: string): ServerTheme {
  return (
    SERVER_THEME_MAP[serverId] || {
      id: serverId,
      imageUrl: '/api/server-bg/GLOBAL.svg',
      accentFrom: '#7C3AED',
      accentTo: '#3B82F6',
      subtitle: {
        ar: serverId,
        en: serverId,
        fr: serverId,
      },
    }
  );
}

export function getGameCoverImage(gameName: string): string {
  const lower = gameName.toLowerCase();
  if (lower.includes('finals')) return '/backgrounds/the_finals.jpg';
  if (lower.includes('free fire')) return '/backgrounds/free_fire.jpg';
  if (lower.includes('pubg')) return '/backgrounds/pubg_mobile.jpg';
  if (lower.includes('valorant')) return '/backgrounds/valorant.jpg';
  if (lower.includes('fortnite') || lower.includes('warzone') || lower.includes('call of duty')) {
    return '/backgrounds/warzone_fortnite.jpg';
  }
  if (lower.includes('apex')) return '/api/server-bg/APEX.svg';
  if (lower.includes('cs2') || lower.includes('counter')) return '/api/server-bg/CS2.svg';
  if (lower.includes('fc') || lower.includes('fifa')) return '/api/server-bg/EAFC.svg';
  if (lower.includes('league')) return '/api/server-bg/LOL.svg';
  if (lower.includes('rocket')) return '/api/server-bg/RL.svg';
  if (lower.includes('mobile legends')) return '/api/server-bg/ML.svg';
  return '/api/server-bg/GLOBAL.svg';
}

export interface PageWallpaperPreset {
  id: string;
  imageUrl?: string;
  collageImages?: string[];
  accentColor: string;
  labels: Record<Language, string>;
}

export const FULL_PAGE_COLLAGE_PHOTOS = [
  '/backgrounds/free_fire.jpg',
  '/backgrounds/pubg_mobile.jpg',
  '/backgrounds/the_finals.jpg',
  '/backgrounds/valorant.jpg',
  '/backgrounds/warzone_fortnite.jpg',
  '/assets/aistudio/shaghaf-cover_9b6d74ed.png',
];

export const PAGE_WALLPAPER_PRESETS: PageWallpaperPreset[] = [
  {
    id: 'auto',
    imageUrl: '/backgrounds/the_finals.jpg',
    collageImages: FULL_PAGE_COLLAGE_PHOTOS,
    accentColor: '#7C3AED',
    labels: {
      ar: 'تلقائي حسب السيرفر',
      en: 'Auto by Server',
      fr: 'Auto selon le serveur',
    },
  },
  {
    id: 'mosaic',
    imageUrl: '/backgrounds/the_finals.jpg',
    collageImages: FULL_PAGE_COLLAGE_PHOTOS,
    accentColor: '#8B5CF6',
    labels: {
      ar: 'تشكيلة كل الألعاب',
      en: 'All Games Collage',
      fr: 'Collage tous jeux',
    },
  },
  {
    id: 'shaghaf',
    imageUrl: '/assets/aistudio/shaghaf-cover_9b6d74ed.png',
    accentColor: '#7C3AED',
    labels: {
      ar: 'ساحة شغف الرئيسية',
      en: 'Shaghaf Arena',
      fr: 'Arène Shaghaf',
    },
  },
  {
    id: 'free_fire',
    imageUrl: '/backgrounds/free_fire.jpg',
    accentColor: '#F59E0B',
    labels: { ar: 'Free Fire', en: 'Free Fire', fr: 'Free Fire' },
  },
  {
    id: 'pubg_mobile',
    imageUrl: '/backgrounds/pubg_mobile.jpg',
    accentColor: '#D97706',
    labels: { ar: 'PUBG Mobile', en: 'PUBG Mobile', fr: 'PUBG Mobile' },
  },
  {
    id: 'the_finals',
    imageUrl: '/backgrounds/the_finals.jpg',
    accentColor: '#DC2626',
    labels: { ar: 'THE FINALS', en: 'THE FINALS', fr: 'THE FINALS' },
  },
  {
    id: 'valorant',
    imageUrl: '/backgrounds/valorant.jpg',
    accentColor: '#EF4444',
    labels: { ar: 'Valorant', en: 'Valorant', fr: 'Valorant' },
  },
  {
    id: 'warzone_fortnite',
    imageUrl: '/backgrounds/warzone_fortnite.jpg',
    accentColor: '#10B981',
    labels: {
      ar: 'Warzone & Fortnite',
      en: 'Warzone & Fortnite',
      fr: 'Warzone & Fortnite',
    },
  },
  {
    id: 'solid',
    accentColor: '#7C3AED',
    labels: {
      ar: 'داكن صافي (بدون صورة)',
      en: 'Dark Minimal (No Image)',
      fr: 'Sombre minimaliste',
    },
  },
];

export function resolvePageWallpaper(
  pref: string,
  selectedServer: string
): {
  mode: 'single' | 'mosaic' | 'solid';
  imageUrl?: string;
  collageImages?: string[];
  accentColor: string;
} {
  if (pref === 'solid') {
    return { mode: 'solid', accentColor: '#7C3AED' };
  }
  if (pref === 'mosaic') {
    return {
      mode: 'mosaic',
      collageImages: FULL_PAGE_COLLAGE_PHOTOS,
      accentColor: '#7C3AED',
    };
  }
  const explicit = PAGE_WALLPAPER_PRESETS.find((p) => p.id === pref && p.id !== 'auto');
  if (explicit?.imageUrl) {
    return {
      mode: 'single',
      imageUrl: explicit.imageUrl,
      accentColor: explicit.accentColor,
    };
  }
  // Auto by active server
  const theme = getServerTheme(selectedServer);
  if (selectedServer === 'ALL') {
    return {
      mode: 'mosaic',
      collageImages: FULL_PAGE_COLLAGE_PHOTOS,
      accentColor: theme.accentFrom,
    };
  }
  return {
    mode: 'single',
    imageUrl: theme.imageUrl,
    accentColor: theme.accentFrom,
  };
}

