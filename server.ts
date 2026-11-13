import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import express, { type Request, type Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const rootDir = process.cwd();
const distDir = path.resolve(rootDir, 'dist');
const uploadsDir = path.resolve(rootDir, 'uploads');

fs.mkdirSync(uploadsDir, { recursive: true });

let firebaseApiKey = '';
try {
  const cfgRaw = fs.readFileSync(path.resolve(rootDir, 'firebase-applet-config.json'), 'utf-8');
  const cfg = JSON.parse(cfgRaw) as { apiKey?: string };
  firebaseApiKey = cfg.apiKey || '';
} catch {
  firebaseApiKey = '';
}

const IMAGE_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const VIDEO_MIME_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
  'video/ogg': 'ogv',
};

const OWNER_EMAILS = ['gwassim608@gmail.com', 'wassimzouaui604@gmail.com'];

interface VerifiedFirebaseUser {
  uid: string;
  email: string;
}

async function verifyFirebaseUser(authHeader: string | undefined): Promise<VerifiedFirebaseUser | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice(7).trim();
  if (!idToken || idToken.length > 4096 || !firebaseApiKey) return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      users?: Array<{
        localId?: string;
        email?: string;
        emailVerified?: boolean;
        disabled?: boolean;
      }>;
    };
    const user = data.users?.[0];
    if (!user?.localId || user.disabled || user.emailVerified !== true) return null;
    return {
      uid: user.localId,
      email: (user.email || '').toLowerCase(),
    };
  } catch {
    return null;
  }
}

async function verifyFirebaseBearer(authHeader: string | undefined): Promise<string | null> {
  const verified = await verifyFirebaseUser(authHeader);
  return verified?.uid || null;
}

function getClientIp(req: http.IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function createRateLimiter(windowMs: number, maxHits: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits.entries()) {
      if (now >= v.resetAt) hits.delete(k);
    }
  }, Math.max(30_000, windowMs));
  cleanupTimer.unref();

  return (key: string): boolean => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (entry.count >= maxHits) return false;
    entry.count += 1;
    return true;
  };
}

function hasUnsafeTextSignature(buf: Buffer): boolean {
  const head = buf.subarray(0, 64).toString('utf8').trimStart().toLowerCase();
  return (
    head.startsWith('<!doctype') ||
    head.startsWith('<html') ||
    head.startsWith('<script') ||
    head.startsWith('<svg') ||
    head.startsWith('<?xml') ||
    (buf.length >= 2 && buf[0] === 0x4d && buf[1] === 0x5a) || // PE/EXE MZ
    (buf.length >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) // ELF
  );
}

function isValidMediaSignature(buf: Buffer, kind: 'image' | 'video'): boolean {
  if (buf.length < 4 || hasUnsafeTextSignature(buf)) return false;
  if (kind === 'image') {
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const isGif = buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38;
    const isWebp =
      buf.length >= 12 &&
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP';
    return isJpeg || isPng || isGif || isWebp;
  }
  const isFtyp = buf.length >= 8 && buf.subarray(4, 8).toString('ascii') === 'ftyp'; // MP4/MOV/M4V/3GP
  const isQtMoov =
    buf.length >= 8 &&
    ['moov', 'mdat', 'wide', 'free'].includes(buf.subarray(4, 8).toString('ascii'));
  const isWebm = buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
  const isOgg = buf.subarray(0, 4).toString('ascii') === 'OggS';
  const isAvi =
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'AVI ';
  return isFtyp || isQtMoov || isWebm || isOgg || isAvi;
}

interface MemeItem {
  id: string;
  titleAr: string;
  titleEn: string;
  badge: string;
  caption: string;
  sub: string;
  c1: string;
  c2: string;
  tags: string[];
}

const SFW_GAMING_MEMES: MemeItem[] = [
  {
    id: 'booyah_win',
    titleAr: 'بوياه! فوز ساحق',
    titleEn: 'BOOYAH Victory',
    badge: 'VICTORY',
    caption: 'BOOYAH!',
    sub: 'بـويـاه يـا أسـطـورة',
    c1: '#7C3AED',
    c2: '#F59E0B',
    tags: ['booyah', 'win', 'victory', 'فوز', 'بوياه', 'فري فاير', 'free fire'],
  },
  {
    id: 'gg_wp',
    titleAr: 'لعب نظيف GG WP',
    titleEn: 'GG WP Respect',
    badge: 'RESPECT',
    caption: 'GG WP!',
    sub: 'لـعـب أسـطـوري واحـتـرام',
    c1: '#2563EB',
    c2: '#10B981',
    tags: ['gg', 'wp', 'respect', 'جيد', 'مباراة', 'تحية'],
  },
  {
    id: 'clutch_king',
    titleAr: 'كلتش 1 ضد 4',
    titleEn: '1v4 Clutch King',
    badge: 'CLUTCH',
    caption: '1v4 CLUTCH!',
    sub: 'كـفـووو شـلـت الـسـكـواد',
    c1: '#DC2626',
    c2: '#F97316',
    tags: ['clutch', 'كفو', 'سكواد', '1v4', 'اسطورة', 'لقطة'],
  },
  {
    id: 'one_tap',
    titleAr: 'ون تاب هيدشوت',
    titleEn: 'One Tap Headshot',
    badge: 'AIM 100%',
    caption: 'ONE TAP!',
    sub: 'هـيـدشـوت مـن الـلـقـطـة الأولـى',
    c1: '#9333EA',
    c2: '#EC4899',
    tags: ['headshot', 'onetap', 'aim', 'ون تاب', 'هيدشوت', 'قنص'],
  },
  {
    id: 'squad_up',
    titleAr: 'ادخل السكواد الآن',
    titleEn: 'Squad Up Now',
    badge: 'TEAM UP',
    caption: 'SQUAD UP!',
    sub: 'الـفـريـق بـانـتـظـارك الآن',
    c1: '#059669',
    c2: '#3B82F6',
    tags: ['squad', 'team', 'سكواد', 'فريق', 'كلان', 'دخول'],
  },
  {
    id: 'lag_panic',
    titleAr: 'لاق 999+ يا ساتر',
    titleEn: 'Ping 999+ Lag',
    badge: 'PING 999',
    caption: 'LAG 999ms!',
    sub: 'الـنـت وقـف فـي الـفـايـت',
    c1: '#B91C1C',
    c2: '#7C2D12',
    tags: ['lag', 'ping', 'لاق', 'بنق', 'ميمز', 'مضحك'],
  },
  {
    id: 'revive_pls',
    titleAr: 'ريفايف بسرعة!',
    titleEn: 'Revive Me Pls!',
    badge: 'SOS',
    caption: 'REVIVE PLS!',
    sub: 'أنـقـذنـي قـبـل الـفـنـش',
    c1: '#EA580C',
    c2: '#EAB308',
    tags: ['revive', 'help', 'ريفايف', 'انقذني', 'pubg', 'فري فاير'],
  },
  {
    id: 'winner_dinner',
    titleAr: 'وينر وينر تشيكن دينر',
    titleEn: 'Chicken Dinner',
    badge: 'CHAMPION',
    caption: '#1 WINNER!',
    sub: 'تـشـيـكـن ديـنـر مـسـتـحـق',
    c1: '#D97706',
    c2: '#16A34A',
    tags: ['winner', 'pubg', 'ببجي', 'فوز', 'بطل', 'مركز اول'],
  },
  {
    id: 'mvp_star',
    titleAr: 'أفضل لاعب MVP',
    titleEn: 'Match MVP',
    badge: 'TOP FRAG',
    caption: 'MVP!',
    sub: 'نـجـم الـمـواجـهـة بـلا مـنـازع',
    c1: '#4F46E5',
    c2: '#06B6D4',
    tags: ['mvp', 'star', 'pro', 'محترف', 'نجم'],
  },
  {
    id: 'duel_1v1',
    titleAr: 'تحدي 1 ضد 1',
    titleEn: '1v1 Challenge',
    badge: 'DUEL',
    caption: '1v1 ME!',
    sub: 'تـحـدي روم مـفـتـوح الآن',
    c1: '#7E22CE',
    c2: '#2563EB',
    tags: ['1v1', 'duel', 'روم', 'تحدي', 'مواجهة'],
  },
  {
    id: 'nice_clip',
    titleAr: 'لقطة خرافية!',
    titleEn: 'Insane Clip',
    badge: 'HIGHLIGHT',
    caption: 'NICE CLIP!',
    sub: 'لـقـطـة تـسـتـحـق الـنـشـر',
    c1: '#0284C7',
    c2: '#7C3AED',
    tags: ['clip', 'highlight', 'فيديو', 'لقطة', 'مونتاج'],
  },
  {
    id: 'ready_go',
    titleAr: 'جاهز للرانكد',
    titleEn: 'Ready for Ranked',
    badge: 'RANKED',
    caption: 'LET’S GO!',
    sub: 'مـسـتـعـد لـرفـع الـرانـك',
    c1: '#0D9488',
    c2: '#6366F1',
    tags: ['ready', 'ranked', 'جاهز', 'رانكد', 'انطلاق'],
  },
];

const GIF_NSFW_BLOCKLIST = [
  'porn',
  'xxx',
  'nsfw',
  'nude',
  'sex',
  'hentai',
  'bikini',
  'boobs',
  'ass',
  'fuck',
  'dick',
  'pussy',
  'سكس',
  'اباحي',
  'إباحي',
  'عري',
  'شرموط',
  'قحبة',
  'زب',
  'كس',
];

function renderAnimatedMemeSvg(item: MemeItem): string {
  const safeCaption = item.caption.replace(/[<>&"]/g, '');
  const safeSub = item.sub.replace(/[<>&"]/g, '');
  const safeBadge = item.badge.replace(/[<>&"]/g, '');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 270" width="480" height="270">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${item.c1}">
        <animate attributeName="stop-color" values="${item.c1};${item.c2};${item.c1}" dur="4s" repeatCount="indefinite"/>
      </stop>
      <stop offset="100%" stop-color="#09090F"/>
    </linearGradient>
    <linearGradient id="shine" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="50%" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="480" height="270" rx="20" fill="url(#bg)"/>
  <rect x="10" y="10" width="460" height="250" rx="16" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>
  <circle cx="420" cy="54" r="34" fill="rgba(255,255,255,0.08)">
    <animate attributeName="r" values="28;38;28" dur="2.2s" repeatCount="indefinite"/>
  </circle>
  <circle cx="64" cy="215" r="24" fill="rgba(255,255,255,0.08)">
    <animate attributeName="r" values="20;28;20" dur="2.6s" repeatCount="indefinite"/>
  </circle>
  <rect x="-120" y="0" width="120" height="270" fill="url(#shine)">
    <animate attributeName="x" from="-140" to="520" dur="3.2s" repeatCount="indefinite"/>
  </rect>
  <rect x="28" y="26" width="118" height="30" rx="8" fill="rgba(9,9,15,0.72)" stroke="rgba(255,255,255,0.25)"/>
  <text x="87" y="46" text-anchor="middle" fill="#FDE68A" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="800">${safeBadge}</text>
  <g>
    <animateTransform attributeName="transform" type="scale" additive="sum" values="1;1.04;1" dur="1.6s" repeatCount="indefinite" origin="240 135"/>
    <text x="240" y="140" text-anchor="middle" fill="#FFFFFF" font-family="system-ui, -apple-system, sans-serif" font-size="42" font-weight="900" letter-spacing="1">${safeCaption}</text>
  </g>
  <rect x="52" y="168" width="376" height="44" rx="12" fill="rgba(9,9,15,0.68)"/>
  <text x="240" y="196" text-anchor="middle" fill="#F8FAFC" font-family="system-ui, -apple-system, sans-serif" font-size="19" font-weight="700">${safeSub}</text>
  <text x="240" y="244" text-anchor="middle" fill="rgba(255,255,255,0.55)" font-family="system-ui, sans-serif" font-size="11" font-weight="600">SHAGHAF SAFE MEMES</text>
</svg>`;
}

const STEAM_OFFICIAL_TRAILER_APPS: Record<string, number> = {
  'THE FINALS': 2073850,
  'PUBG Mobile': 578080,
  CS2: 730,
  'Apex Legends': 1172470,
  'Rocket League': 252950,
  Warzone: 1938090,
};

let officialTrailerCache: { data: Record<string, string>; fetchedAt: number } = {
  data: {},
  fetchedAt: 0,
};
let officialTrailerPromise: Promise<Record<string, string>> | null = null;

async function getOfficialSteamTrailers(): Promise<Record<string, string>> {
  if (
    officialTrailerCache.fetchedAt > 0 &&
    Date.now() - officialTrailerCache.fetchedAt < 60 * 60_000
  ) {
    return officialTrailerCache.data;
  }
  if (officialTrailerPromise) return officialTrailerPromise;

  officialTrailerPromise = (async () => {
    const nextMap: Record<string, string> = { ...officialTrailerCache.data };
    await Promise.allSettled(
      Object.entries(STEAM_OFFICIAL_TRAILER_APPS).map(async ([gameName, appId]) => {
        const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return;
        const json = (await res.json()) as Record<
          string,
          {
            success?: boolean;
            data?: {
              movies?: Array<{
                hls_h264?: string;
                mp4?: { max?: string; '480'?: string };
                webm?: { max?: string; '480'?: string };
              }>;
            };
          }
        >;
        const movies = json?.[String(appId)]?.data?.movies;
        const mv = Array.isArray(movies) ? movies[0] : undefined;
        const candidate =
          mv?.mp4?.max || mv?.mp4?.['480'] || mv?.webm?.max || mv?.webm?.['480'] || mv?.hls_h264;
        if (candidate && candidate.startsWith('https://')) {
          nextMap[gameName] = candidate;
        }
      })
    );
    officialTrailerCache = { data: nextMap, fetchedAt: Date.now() };
    return nextMap;
  })();

  try {
    return await officialTrailerPromise;
  } finally {
    officialTrailerPromise = null;
  }
}

function buildOfficialTournaments(trailers: Record<string, string> = {}) {
  const now = new Date();
  const formatDay = (daysAhead: number, hour: number, minute: number) => {
    const d = new Date(now.getTime() + daysAhead * 86_400_000);
    d.setHours(hour, minute, 0, 0);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} · ${hh}:${mi}`;
  };

  return [
    {
      id: 'bot_trn_tf_major',
      title: 'بطولة THE FINALS The Major الرسمية',
      game: 'THE FINALS',
      mode: 'squad' as const,
      category: 'official' as const,
      dateLabel: formatDay(1, 20, 0),
      prize: '$100,000 + Multibucks',
      officialSource: 'THE FINALS Esports',
      imageUrl: '/backgrounds/the_finals.jpg',
      videoUrl: trailers['THE FINALS'],
      sourceUrl: 'https://www.reachthefinals.com/esports',
    },
    {
      id: 'bot_trn_tf_worldtour',
      title: 'تصفيات THE FINALS World Tour Cashout',
      game: 'THE FINALS',
      mode: 'squad' as const,
      category: 'qualifiers' as const,
      dateLabel: formatDay(3, 21, 0),
      prize: '10,000 Multibucks + تأهل',
      officialSource: 'Embark Studios',
      imageUrl: '/backgrounds/the_finals.jpg',
      videoUrl: trailers['THE FINALS'],
      sourceUrl: 'https://www.reachthefinals.com/',
    },
    {
      id: 'bot_trn_ff_squad',
      title: 'بطولة Free Fire Clash Squad الرسمية',
      game: 'Free Fire',
      mode: 'squad' as const,
      category: 'official' as const,
      dateLabel: formatDay(2, 20, 0),
      prize: '5,000 Diamonds + لقب البطل',
      officialSource: 'Free Fire Official MENA',
      imageUrl: '/backgrounds/free_fire.jpg',
      sourceUrl: 'https://ff.garena.com/',
    },
    {
      id: 'bot_trn_ff_solo',
      title: 'تحدي Free Fire Lone Wolf الودي',
      game: 'Free Fire',
      mode: 'solo' as const,
      category: 'friendly' as const,
      dateLabel: formatDay(4, 21, 0),
      prize: '2,200 Diamonds',
      officialSource: 'Free Fire Community',
      imageUrl: '/backgrounds/free_fire.jpg',
      sourceUrl: 'https://ff.garena.com/',
    },
    {
      id: 'bot_trn_pubg_squad',
      title: 'تصفيات PUBG Mobile PMCO للسكواد',
      game: 'PUBG Mobile',
      mode: 'squad' as const,
      category: 'qualifiers' as const,
      dateLabel: formatDay(3, 19, 30),
      prize: '16,200 UC + تأهل رسمي',
      officialSource: 'PUBG Mobile Esports',
      imageUrl: '/backgrounds/pubg_mobile.jpg',
      videoUrl: trailers['PUBG Mobile'],
      sourceUrl: 'https://esports.pubgmobile.com/',
    },
    {
      id: 'bot_trn_pubg_solo',
      title: 'بطولة PUBG Mobile Solo Erangel الودية',
      game: 'PUBG Mobile',
      mode: 'solo' as const,
      category: 'friendly' as const,
      dateLabel: formatDay(5, 22, 0),
      prize: '4,050 UC',
      officialSource: 'PUBG Mobile Community',
      imageUrl: '/backgrounds/pubg_mobile.jpg',
      sourceUrl: 'https://www.pubgmobile.com/',
    },
    {
      id: 'bot_trn_val_squad',
      title: 'تصفيات Valorant Challengers (5v5)',
      game: 'Valorant',
      mode: 'squad' as const,
      category: 'qualifiers' as const,
      dateLabel: formatDay(6, 18, 0),
      prize: '10,000 VP للفريق',
      officialSource: 'Valorant VCT MENA',
      imageUrl: '/backgrounds/valorant.jpg',
      sourceUrl: 'https://valorantesports.com/',
    },
    {
      id: 'bot_trn_fn_solo',
      title: 'كأس Fortnite Victory Cup الرسمي',
      game: 'Fortnite',
      mode: 'solo' as const,
      category: 'official' as const,
      dateLabel: formatDay(2, 19, 0),
      prize: '5,600 V-Bucks',
      officialSource: 'Fortnite Competitive',
      imageUrl: '/backgrounds/warzone_fortnite.jpg',
      sourceUrl: 'https://www.fortnite.com/competitive',
    },
    {
      id: 'bot_trn_wz_squad',
      title: 'مواجهة Warzone Resurgence الودية',
      game: 'Warzone',
      mode: 'squad' as const,
      category: 'friendly' as const,
      dateLabel: formatDay(7, 21, 30),
      prize: '9,600 COD Points',
      officialSource: 'COD Squad Hub',
      imageUrl: '/backgrounds/warzone_fortnite.jpg',
      videoUrl: trailers['Warzone'],
      sourceUrl: 'https://www.callofduty.com/esports',
    },
    {
      id: 'bot_trn_eafc_solo',
      title: 'دوري EA FC Pro Ultimate الرسمي',
      game: 'EA FC',
      mode: 'solo' as const,
      category: 'official' as const,
      dateLabel: formatDay(3, 20, 30),
      prize: '12,000 FC Points',
      officialSource: 'EA Sports FC Pro',
      imageUrl: '/api/server-bg/EAFC.svg',
      sourceUrl: 'https://www.ea.com/games/ea-sports-fc/fc-pro',
    },
  ];
}

interface ServerBgConfig {
  code: string;
  title: string;
  tag: string;
  c1: string;
  c2: string;
  c3: string;
}

const SERVER_BG_THEMES: Record<string, ServerBgConfig> = {
  FOR_YOU: { code: 'FOR_YOU', title: 'FOR YOU', tag: 'CURATED ARENA', c1: '#5B21B6', c2: '#DB2777', c3: '#090910' },
  CLAN: { code: 'CLAN', title: 'CLANS & LFG', tag: 'SQUAD RECRUITMENT', c1: '#4C1D95', c2: '#2563EB', c3: '#090912' },
  MENA: { code: 'MENA', title: 'MENA HUB', tag: 'MIDDLE EAST & N. AFRICA', c1: '#065F46', c2: '#D97706', c3: '#090D10' },
  GLOBAL: { code: 'GLOBAL', title: 'GLOBAL ARENA', tag: 'WORLDWIDE PLAYERS', c1: '#1E3A8A', c2: '#6D28D9', c3: '#090912' },
  CS2: { code: 'CS2', title: 'COUNTER-STRIKE 2', tag: 'PREMIER & MAJOR', c1: '#B45309', c2: '#1D4ED8', c3: '#0A0D14' },
  APEX: { code: 'APEX', title: 'APEX LEGENDS', tag: 'ALGS CHAMPIONS', c1: '#991B1B', c2: '#EA580C', c3: '#10090B' },
  LOL: { code: 'LOL', title: 'LEAGUE OF LEGENDS', tag: 'RIFT & WORLDS', c1: '#0369A1', c2: '#CA8A04', c3: '#080E16' },
  RL: { code: 'RL', title: 'ROCKET LEAGUE', tag: 'RLCS SUPERSONIC', c1: '#1D4ED8', c2: '#EA580C', c3: '#090B14' },
  ML: { code: 'ML', title: 'MOBILE LEGENDS', tag: 'MYTHIC GLORY', c1: '#4338CA', c2: '#DB2777', c3: '#090914' },
  EAFC: { code: 'EAFC', title: 'EA SPORTS FC', tag: 'FC PRO ULTIMATE', c1: '#15803D', c2: '#0284C7', c3: '#07120E' },
  EDITORS: { code: 'EDITORS', title: 'VFX & EDITORS', tag: 'MONTAGE STUDIO', c1: '#9D174D', c2: '#6D28D9', c3: '#0D0914' },
  DEV: { code: 'DEV', title: 'DEV & DESIGN', tag: 'CREATOR LAB', c1: '#0E7490', c2: '#4F46E5', c3: '#080E14' },
};

function renderServerBgSvg(cfg: ServerBgConfig): string {
  const safeTitle = cfg.title.replace(/[<>&"]/g, '');
  const safeTag = cfg.tag.replace(/[<>&"]/g, '');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${cfg.c1}"/>
      <stop offset="52%" stop-color="${cfg.c3}"/>
      <stop offset="100%" stop-color="${cfg.c2}"/>
    </linearGradient>
    <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse">
      <path d="M 64 0 L 0 0 0 64" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1280" height="720" fill="url(#g)"/>
  <rect width="1280" height="720" fill="url(#grid)"/>
  <circle cx="1020" cy="180" r="240" fill="${cfg.c2}" fill-opacity="0.22"/>
  <circle cx="240" cy="560" r="260" fill="${cfg.c1}" fill-opacity="0.24"/>
  <polygon points="880,720 1120,0 1280,0 1280,720" fill="rgba(255,255,255,0.04)"/>
  <text x="80" y="610" fill="rgba(255,255,255,0.14)" font-family="system-ui, -apple-system, sans-serif" font-size="112" font-weight="900" letter-spacing="6">${safeTitle}</text>
  <text x="84" y="655" fill="rgba(255,255,255,0.34)" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="800" letter-spacing="4">${safeTag}</text>
</svg>`;
}

export interface NewsItem {
  id: string;
  game: string;
  category: 'tournament' | 'update';
  title: string;
  summary: string;
  imageUrl: string;
  videoUrl?: string;
  sourceName: string;
  sourceUrl: string;
  publishedAtMs: number;
  isLiveSteam?: boolean;
}

const STEAM_APP_FEEDS: Array<{ appId: number; game: string; imageUrl: string; sourceName: string }> = [
  { appId: 2073850, game: 'THE FINALS', imageUrl: '/backgrounds/the_finals.jpg', sourceName: 'Steam · Embark Studios' },
  { appId: 730, game: 'CS2', imageUrl: '/api/server-bg/CS2.svg', sourceName: 'Steam · Valve CS2' },
  { appId: 578080, game: 'PUBG Mobile', imageUrl: '/backgrounds/pubg_mobile.jpg', sourceName: 'Steam · Krafton PUBG' },
  { appId: 1172470, game: 'Apex Legends', imageUrl: '/api/server-bg/APEX.svg', sourceName: 'Steam · Respawn' },
  { appId: 1938090, game: 'Warzone', imageUrl: '/backgrounds/warzone_fortnite.jpg', sourceName: 'Steam · Call of Duty' },
  { appId: 2669320, game: 'EA FC', imageUrl: '/api/server-bg/EAFC.svg', sourceName: 'Steam · EA Sports FC' },
];

function stripBbCodeAndHtml(raw: string): string {
  return raw
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 260);
}

function extractOfficialDirectVideoFromText(raw: string): string | undefined {
  const match = raw.match(/https:\/\/\S+\.(?:mp4|webm|m3u8)(?:\?\S+)?/i);
  if (match?.[0]) return match[0].replace(/[),.;"']+$/, '');
  return undefined;
}

function extractImageFromSteamNews(raw: string): string | undefined {
  const expanded = raw.replace(/\{STEAM_CLAN_IMAGE\}/g, 'https://clan.fastly.steamstatic.com/images');
  const bbMatch = expanded.match(/\[img\](https:\/\/[^[\]\s"'<>]+)\[\/img\]/i);
  if (bbMatch?.[1]) return bbMatch[1];
  const htmlMatch = expanded.match(/<img[^>]+src=["'](https:\/\/[^"'\s<>]+)["']/i);
  if (htmlMatch?.[1]) return htmlMatch[1];
  const directMatch = expanded.match(/https:\/\/\S+\.(?:jpg|jpeg|png|webp)(?:\?\S+)?/i);
  if (directMatch?.[0]) return directMatch[0].replace(/[),.;"']+$/, '');
  return undefined;
}

const NEWS_PALETTES: Array<[string, string, string]> = [
  ['#7C3AED', '#F59E0B', '#0B0B14'],
  ['#DC2626', '#2563EB', '#090B12'],
  ['#059669', '#06B6D4', '#081014'],
  ['#DB2777', '#6D28D9', '#0F0914'],
  ['#EA580C', '#CA8A04', '#120C08'],
  ['#0284C7', '#4F46E5', '#080D16'],
  ['#16A34A', '#D97706', '#0A110C'],
  ['#9333EA', '#E11D48', '#100912'],
];

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function renderUniqueNewsArtSvg(newsId: string, item?: NewsItem): string {
  const seed = hashString(newsId);
  const [c1, c2, c3] = NEWS_PALETTES[seed % NEWS_PALETTES.length];
  const gameLabel = (item?.game || 'SHAGHAF').toUpperCase().replace(/[<>&"]/g, '').slice(0, 22);
  const badgeLabel =
    item?.category === 'tournament' ? 'OFFICIAL TOURNAMENT' : 'GAME PATCH & NEWS';
  const sourceLabel = (item?.sourceName || 'SHAGHAF NEWS BOT')
    .toUpperCase()
    .replace(/[<>&"]/g, '')
    .slice(0, 28);
  const cx1 = 220 + (seed % 760);
  const cy1 = 110 + ((seed >> 4) % 360);
  const cx2 = 160 + ((seed >> 8) % 920);
  const cy2 = 160 + ((seed >> 12) % 420);
  const angle = 20 + (seed % 50);
  const stripeX = 760 + (seed % 320);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}" stop-opacity="0.92"/>
      <stop offset="55%" stop-color="${c3}"/>
      <stop offset="100%" stop-color="${c2}" stop-opacity="0.88"/>
    </linearGradient>
    <pattern id="mesh" width="48" height="48" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})">
      <circle cx="4" cy="4" r="1.5" fill="rgba(255,255,255,0.12)"/>
    </pattern>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <rect width="1280" height="720" fill="url(#mesh)"/>
  <circle cx="${cx1}" cy="${cy1}" r="${180 + (seed % 110)}" fill="${c1}" fill-opacity="0.28"/>
  <circle cx="${cx2}" cy="${cy2}" r="${150 + ((seed >> 3) % 100)}" fill="${c2}" fill-opacity="0.24"/>
  <polygon points="${stripeX},0 ${stripeX + 260},0 ${stripeX + 80},720 ${stripeX - 180},720" fill="rgba(255,255,255,0.06)"/>
  <rect x="64" y="64" width="320" height="46" rx="12" fill="rgba(9,9,15,0.72)" stroke="rgba(255,255,255,0.24)"/>
  <text x="224" y="94" text-anchor="middle" fill="#FDE68A" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="800" letter-spacing="2">${badgeLabel}</text>
  <text x="64" y="420" fill="rgba(255,255,255,0.12)" font-family="system-ui, -apple-system, sans-serif" font-size="124" font-weight="900" letter-spacing="5">${gameLabel}</text>
  <text x="68" y="490" fill="#FFFFFF" font-family="system-ui, -apple-system, sans-serif" font-size="68" font-weight="900" letter-spacing="2">${gameLabel}</text>
  <text x="68" y="544" fill="rgba(255,255,255,0.78)" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="700" letter-spacing="2">${sourceLabel}</text>
</svg>`;
}

function assignUniqueNewsImages(items: NewsItem[]): NewsItem[] {
  const used = new Set<string>();
  return items.map((item) => {
    const candidate = item.imageUrl;
    if (candidate && !used.has(candidate)) {
      used.add(candidate);
      return item;
    }
    const uniqueUrl = `/api/news-art/${encodeURIComponent(item.id)}.svg`;
    used.add(uniqueUrl);
    return { ...item, imageUrl: uniqueUrl };
  });
}

function buildCuratedOfficialNews(trailers: Record<string, string> = {}): NewsItem[] {
  const baseMs = Date.now();
  return [
    {
      id: 'cur_tf_major_update',
      game: 'THE FINALS',
      category: 'tournament',
      title: 'انطلاق تصفيات THE FINALS The Major وجوائز Multibucks الرسمية',
      summary: 'تعلن Embark Studios عن جدول بطولات THE FINALS Major وطور World Tour التنافسي بمواجهات 3v3v3v3 Cashout وبث رسمي مباشر.',
      imageUrl: '/backgrounds/the_finals.jpg',
      videoUrl: trailers['THE FINALS'],
      sourceName: 'THE FINALS Official',
      sourceUrl: 'https://www.reachthefinals.com/esports',
      publishedAtMs: baseMs - 25 * 60_000,
    },
    {
      id: 'cur_ff_ob_update',
      game: 'Free Fire',
      category: 'update',
      title: 'تحديث Free Fire الجديد — تعديلات الأسلحة وخريطة Clash Squad',
      summary: 'أضافت Garena تحسينات جديدة على التوازن القتالي في Clash Squad وBattle Royale مع فعاليات جوائز مجانية للاعبين.',
      imageUrl: '/backgrounds/free_fire.jpg',
      sourceName: 'Free Fire Official',
      sourceUrl: 'https://ff.garena.com/news/',
      publishedAtMs: baseMs - 65 * 60_000,
    },
    {
      id: 'cur_pubgm_pmco',
      game: 'PUBG Mobile',
      category: 'tournament',
      title: 'فتح التسجيل في تصفيات PUBG Mobile MENA & Global Cup',
      summary: 'يمكن لفرق السكواد التسجيل الآن في تصفيات PMCO الإقليمية والمنافسة على جوائز UC والتأهل للنهائيات العالمية.',
      imageUrl: '/backgrounds/pubg_mobile.jpg',
      videoUrl: trailers['PUBG Mobile'],
      sourceName: 'PUBG Mobile Esports',
      sourceUrl: 'https://esports.pubgmobile.com/',
      publishedAtMs: baseMs - 110 * 60_000,
    },
    {
      id: 'cur_val_vct',
      game: 'Valorant',
      category: 'tournament',
      title: 'أخبار Valorant Challengers & تحديث العملاء التنافسي',
      summary: 'تفاصيل التغييرات التوازنية الجديدة في طور Premier وجدول مباريات VCT Challengers للشرق الأوسط وشمال أفريقيا.',
      imageUrl: '/backgrounds/valorant.jpg',
      sourceName: 'Valorant Esports',
      sourceUrl: 'https://valorantesports.com/',
      publishedAtMs: baseMs - 160 * 60_000,
    },
    {
      id: 'cur_fn_fncs',
      game: 'Fortnite',
      category: 'update',
      title: 'تحديث Fortnite التنافسي ومواعيد كأس Victory & FNCS',
      summary: 'تعرف على تعديلات الخريطة والأسلحة المصرح بها في بطولات Fortnite Competitive ومواعيد تصفيات نهاية الأسبوع.',
      imageUrl: '/backgrounds/warzone_fortnite.jpg',
      sourceName: 'Fortnite Competitive',
      sourceUrl: 'https://www.fortnite.com/competitive',
      publishedAtMs: baseMs - 210 * 60_000,
    },
    {
      id: 'cur_rl_rlcs',
      game: 'Rocket League',
      category: 'tournament',
      title: 'تحديات Rocket League Open & RLCS MENA Open Qualifiers',
      summary: 'جولة جديدة من تصفيات RLCS MENA الثلاثية المفتوحة مع نقاط تصنيف وجوائز رسمية.',
      imageUrl: '/api/server-bg/RL.svg',
      videoUrl: trailers['Rocket League'],
      sourceName: 'Rocket League Esports',
      sourceUrl: 'https://esports.rocketleague.com/',
      publishedAtMs: baseMs - 260 * 60_000,
    },
    {
      id: 'cur_lol_patch',
      game: 'League of Legends',
      category: 'update',
      title: 'ملخص تحديث League of Legends واستعدادات بطولات Worlds',
      summary: 'أبرز تعديلات الأبطال والعناصر في التحديث الأخير من Riot Games مع أخبار الفرق المتأهلة.',
      imageUrl: '/api/server-bg/LOL.svg',
      sourceName: 'LoL Esports',
      sourceUrl: 'https://lolesports.com/',
      publishedAtMs: baseMs - 320 * 60_000,
    },
    {
      id: 'cur_mlbb_mpl',
      game: 'Mobile Legends',
      category: 'tournament',
      title: 'منافسات Mobile Legends MENA & بطولات MPL الموسمية',
      summary: 'انطلاق مواجهات Mythic الرسمية وتحديث الأبطال الجدد في ساحة Land of Dawn.',
      imageUrl: '/api/server-bg/ML.svg',
      sourceName: 'MLBB Official',
      sourceUrl: 'https://m.mobilelegends.com/',
      publishedAtMs: baseMs - 390 * 60_000,
    },
  ];
}

function detectServerViolation(text: string): { violated: boolean; kind: 'none' | 'profanity' | 'nsfw'; reason: string } {
  const normalized = text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/(.)\1+/g, '$1');
  const tokens = normalized.split(/[^a-z0-9\u0621-\u064A]+/g);
  const compact = normalized.replace(/[^a-z0-9\u0621-\u064A]+/g, '');
  const nsfwList = ['سكس', 'اباحي', 'بورن', 'عاري', 'عاريه', 'عري', 'porn', 'xxx', 'nsfw', 'nude', 'nudes', 'hentai', 'onlyfans', 'sex', 'boobs', 'dick', 'pussy', 'pornhub', 'xvideos'];
  const badList = ['زب', 'زبي', 'كس', 'قحبه', 'طبونه', 'شرموطه', 'عرص', 'متناك', 'منيوك', 'نيك', 'zebi', 'kahba', 'nik', 'fuck', 'bitch', 'shit', 'whore', 'slut', 'putain', 'salope', 'encule'];
  if (tokens.some((w) => nsfwList.includes(w)) || nsfwList.some((b) => b.length >= 4 && compact.includes(b))) {
    return { violated: true, kind: 'nsfw', reason: 'محتوى إباحي أو غير لائق (+18 / NSFW)' };
  }
  if (tokens.some((w) => badList.includes(w)) || badList.some((b) => b.length >= 5 && compact.includes(b))) {
    return { violated: true, kind: 'profanity', reason: 'ألفاظ مسيئة أو سبّ مخالف لقوانين شغف' };
  }
  return { violated: false, kind: 'none', reason: '' };
}

interface OnlineUserEntry {
  sockets: Set<WebSocket>;
  gamerTag: string;
  playingGame: string;
}

interface ClientSocketMeta {
  uid: string | null;
  gamerTag: string;
  playingGame: string;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const allowApiRead = createRateLimiter(60_000, 120);
  const allowUploadAttempt = createRateLimiter(600_000, 25);

  app.use((_req: Request, res: Response, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), geolocation=(), payment=(), usb=(), microphone=(self)'
    );
    next();
  });

  const onlineUsers = new Map<string, OnlineUserEntry>();
  const socketMeta = new Map<WebSocket, ClientSocketMeta>();
  const wsIpCounts = new Map<string, number>();

  const broadcastPresence = () => {
    const onlineUids: string[] = [];
    const playingMap: Record<string, string> = {};
    for (const [uid, entry] of onlineUsers.entries()) {
      if (entry.sockets.size > 0) {
        onlineUids.push(uid);
        if (entry.playingGame) {
          playingMap[uid] = entry.playingGame;
        }
      }
    }
    const payload = JSON.stringify({
      type: 'presence:state',
      onlineUids,
      playingMap,
    });
    for (const [ws, meta] of socketMeta.entries()) {
      if (meta.uid && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  };

  const sendToUser = (targetUid: string, msg: Record<string, unknown>): boolean => {
    const entry = onlineUsers.get(targetUid);
    if (!entry || entry.sockets.size === 0) return false;
    const raw = JSON.stringify(msg);
    let sent = false;
    for (const sock of entry.sockets) {
      if (sock.readyState === WebSocket.OPEN) {
        sock.send(raw);
        sent = true;
      }
    }
    return sent;
  };

  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const clientIp = getClientIp(req);
    const activeFromIp = wsIpCounts.get(clientIp) || 0;
    if (activeFromIp >= 15) {
      ws.close(1008, 'Too many connections');
      return;
    }
    wsIpCounts.set(clientIp, activeFromIp + 1);
    socketMeta.set(ws, { uid: null, gamerTag: '', playingGame: '' });

    let msgCount = 0;
    let msgWindowStart = Date.now();

    ws.on('message', async (raw) => {
      try {
        const now = Date.now();
        if (now - msgWindowStart > 10_000) {
          msgWindowStart = now;
          msgCount = 0;
        }
        msgCount += 1;
        if (msgCount > 60) {
          ws.close(1008, 'Rate limit exceeded');
          return;
        }

        const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
        if (text.length > 32_768) return;
        const msg = JSON.parse(text) as Record<string, unknown>;
        const type = String(msg.type || '');
        const meta = socketMeta.get(ws);
        if (!meta) return;

        if (type === 'auth') {
          const token = String(msg.token || '');
          const verifiedUid = await verifyFirebaseBearer(`Bearer ${token}`);
          if (!verifiedUid) {
            ws.send(JSON.stringify({ type: 'auth:error' }));
            return;
          }
          const gamerTag = String(msg.gamerTag || '').slice(0, 16);
          const playingGame = String(msg.playingGame || '').slice(0, 40);

          if (meta.uid && meta.uid !== verifiedUid) {
            const prev = onlineUsers.get(meta.uid);
            prev?.sockets.delete(ws);
            if (prev && prev.sockets.size === 0) onlineUsers.delete(meta.uid);
          }

          meta.uid = verifiedUid;
          meta.gamerTag = gamerTag;
          meta.playingGame = playingGame;

          let entry = onlineUsers.get(verifiedUid);
          if (!entry) {
            entry = { sockets: new Set(), gamerTag, playingGame };
            onlineUsers.set(verifiedUid, entry);
          }
          entry.sockets.add(ws);
          if (gamerTag) entry.gamerTag = gamerTag;
          entry.playingGame = playingGame;

          ws.send(JSON.stringify({ type: 'auth:ok', uid: verifiedUid }));
          broadcastPresence();
          return;
        }

        if (!meta.uid) return;

        if (type === 'presence:game') {
          const playingGame = String(msg.playingGame || '').slice(0, 40);
          meta.playingGame = playingGame;
          const entry = onlineUsers.get(meta.uid);
          if (entry) {
            entry.playingGame = playingGame;
          }
          broadcastPresence();
          return;
        }

        if (
          type === 'call:offer' ||
          type === 'call:answer' ||
          type === 'call:ice' ||
          type === 'call:reject' ||
          type === 'call:end'
        ) {
          const toUid = String(msg.toUid || '').trim();
          if (!toUid || toUid === meta.uid || !/^[a-zA-Z0-9_\-]{1,128}$/.test(toUid)) return;
          const safeRelay: Record<string, unknown> = {
            type,
            toUid,
            fromUid: meta.uid,
            fromTag: meta.gamerTag || String(msg.fromTag || '').slice(0, 16),
          };
          if (msg.sdp !== undefined) safeRelay.sdp = msg.sdp;
          if (msg.candidate !== undefined) safeRelay.candidate = msg.candidate;
          const delivered = sendToUser(toUid, safeRelay);
          if (!delivered && type === 'call:offer') {
            ws.send(JSON.stringify({ type: 'call:unavailable', toUid }));
          }
        }
      } catch {
        // Ignore malformed WS payloads
      }
    });

    const cleanupSocket = () => {
      const nextCount = (wsIpCounts.get(clientIp) || 1) - 1;
      if (nextCount <= 0) wsIpCounts.delete(clientIp);
      else wsIpCounts.set(clientIp, nextCount);

      const meta = socketMeta.get(ws);
      socketMeta.delete(ws);
      if (meta?.uid) {
        const entry = onlineUsers.get(meta.uid);
        if (entry) {
          entry.sockets.delete(ws);
          if (entry.sockets.size === 0) {
            onlineUsers.delete(meta.uid);
          }
        }
        broadcastPresence();
      }
    };

    ws.on('close', cleanupSocket);
    ws.on('error', cleanupSocket);
  });

  // Curated strictly SFW Gaming Memes & Animated Reaction Cards
  app.get('/api/gifs', (req: Request, res: Response) => {
    if (!allowApiRead(`gifs:${getClientIp(req)}`)) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    const q = String(req.query.q || '').trim().toLowerCase().slice(0, 80);
    if (q && GIF_NSFW_BLOCKLIST.some((bad) => q.includes(bad))) {
      res.json({ blocked: true, items: [] });
      return;
    }
    const filtered = SFW_GAMING_MEMES.filter((item) => {
      if (!q) return true;
      return (
        item.titleAr.toLowerCase().includes(q) ||
        item.titleEn.toLowerCase().includes(q) ||
        item.caption.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }).map((item) => ({
      id: item.id,
      titleAr: item.titleAr,
      titleEn: item.titleEn,
      url: `/api/meme/${item.id}.svg`,
    }));
    res.json({ blocked: false, items: filtered });
  });

  app.get('/api/meme/:slug.svg', (req: Request, res: Response) => {
    const slug = String(req.params.slug || '');
    if (!/^[a-z0-9_]{1,40}$/i.test(slug)) {
      res.status(404).end();
      return;
    }
    const item = SFW_GAMING_MEMES.find((m) => m.id === slug);
    if (!item) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(renderAnimatedMemeSvg(item));
  });

  const broadcastAuthenticated = (msg: Record<string, unknown>) => {
    const raw = JSON.stringify(msg);
    for (const [ws, meta] of socketMeta.entries()) {
      if (meta.uid && ws.readyState === WebSocket.OPEN) {
        ws.send(raw);
      }
    }
  };

  let cachedNewsItems: NewsItem[] = assignUniqueNewsImages(buildCuratedOfficialNews());
  let lastNewsUpdatedAt = Date.now();
  let newsRefreshPromise: Promise<void> | null = null;

  const refreshNewsFeed = async () => {
    if (newsRefreshPromise) return newsRefreshPromise;
    newsRefreshPromise = (async () => {
      try {
        const fetched: NewsItem[] = [];
        await Promise.allSettled(
          STEAM_APP_FEEDS.map(async (feed) => {
            const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${feed.appId}&count=2&maxlength=500`;
            const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
            if (!res.ok) return;
            const json = (await res.json()) as {
              appnews?: {
                newsitems?: Array<{
                  gid?: string;
                  title?: string;
                  url?: string;
                  contents?: string;
                  date?: number;
                  feedlabel?: string;
                }>;
              };
            };
            const items = json.appnews?.newsitems || [];
            items.forEach((it) => {
              if (!it.gid || !it.title) return;
              const rawContent = it.contents || '';
              const summary = stripBbCodeAndHtml(rawContent) || it.title;
              const extractedImage = extractImageFromSteamNews(rawContent);
              const lowerAll = `${it.title} ${summary}`.toLowerCase();
              const isTournament = /tournament|championship|major|cup|esports|qualifier|open|finals|بطول|تصفيات/i.test(
                lowerAll
              );
              const safeUrl =
                it.url && it.url.startsWith('https://')
                  ? it.url
                  : it.url && it.url.startsWith('http://')
                  ? it.url.replace(/^http:\/\//i, 'https://')
                  : `https://store.steampowered.com/app/${feed.appId}/`;
              const itemId = `steam_${feed.appId}_${it.gid}`;
              fetched.push({
                id: itemId,
                game: feed.game,
                category: isTournament ? 'tournament' : 'update',
                title: it.title.slice(0, 140),
                summary,
                imageUrl: extractedImage || `/api/news-art/${encodeURIComponent(itemId)}.svg`,
                videoUrl: extractOfficialDirectVideoFromText(rawContent),
                sourceName: it.feedlabel || feed.sourceName,
                sourceUrl: safeUrl,
                publishedAtMs: (it.date || Math.floor(Date.now() / 1000)) * 1000,
                isLiveSteam: true,
              });
            });
          })
        );

        const trailers = await getOfficialSteamTrailers();
        const curated = buildCuratedOfficialNews(trailers);
        const combinedMap = new Map<string, NewsItem>();
        [...curated, ...fetched].forEach((item) => {
          if (!combinedMap.has(item.id)) {
            combinedMap.set(item.id, item);
          }
        });
        const sorted = Array.from(combinedMap.values()).sort(
          (a, b) => b.publishedAtMs - a.publishedAtMs
        );
        const nextList = assignUniqueNewsImages(sorted);
        const prevTopId = cachedNewsItems[0]?.id;
        cachedNewsItems = nextList;
        lastNewsUpdatedAt = Date.now();
        if (nextList[0]?.id && nextList[0].id !== prevTopId) {
          broadcastAuthenticated({ type: 'news:update', count: nextList.length });
        }
      } catch {
        // Retain last good cache on transient upstream failure
      } finally {
        newsRefreshPromise = null;
      }
    })();
    return newsRefreshPromise;
  };

  void refreshNewsFeed();
  const newsBotInterval = setInterval(() => {
    void refreshNewsFeed();
  }, 10 * 60_000);
  newsBotInterval.unref();

  // Official Game News & Tournaments Feed (24/7 Autonomous Bot)
  app.get('/api/news', async (req: Request, res: Response) => {
    if (!allowApiRead(`news:${getClientIp(req)}`)) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    const wantRefresh = req.query.refresh === '1';
    if (wantRefresh || Date.now() - lastNewsUpdatedAt > 10 * 60_000) {
      await refreshNewsFeed();
    }
    const gameFilter = String(req.query.game || '').trim().toLowerCase();
    const categoryFilter = String(req.query.category || '').trim().toLowerCase();
    const filtered = cachedNewsItems.filter((item) => {
      if (gameFilter && gameFilter !== 'all' && item.game.toLowerCase() !== gameFilter) {
        return false;
      }
      if (
        (categoryFilter === 'tournament' || categoryFilter === 'update') &&
        item.category !== categoryFilter
      ) {
        return false;
      }
      return true;
    });
    res.json({
      items: filtered,
      lastUpdatedAt: lastNewsUpdatedAt,
      botStatus: 'online_24_7',
    });
  });

  // Unique Per-Article News Artwork SVG
  app.get('/api/news-art/:id.svg', (req: Request, res: Response) => {
    const rawId = decodeURIComponent(String(req.params.id || '')).slice(0, 128);
    if (!/^[a-zA-Z0-9_.\-]{1,128}$/.test(rawId)) {
      res.status(404).end();
      return;
    }
    const item = cachedNewsItems.find((it) => it.id === rawId);
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(renderUniqueNewsArtSvg(rawId, item));
  });

  // Server SVG Theme Backdrops
  app.get('/api/server-bg/:code.svg', (req: Request, res: Response) => {
    const code = String(req.params.code || '').toUpperCase();
    const cfg = SERVER_BG_THEMES[code];
    if (!cfg) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(renderServerBgSvg(cfg));
  });

  // Server-side 24/7 Moderation Endpoint (strictly exempts Owner emails)
  app.post('/api/moderate', express.json({ limit: '16kb' }), async (req: Request, res: Response) => {
    if (!allowApiRead(`mod:${getClientIp(req)}`)) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    const verified = await verifyFirebaseUser(req.headers.authorization);
    if (!verified) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (OWNER_EMAILS.includes(verified.email)) {
      res.json({ violated: false, exempt: true, kind: 'none', reason: '' });
      return;
    }
    const text = String((req.body as { text?: unknown })?.text || '').slice(0, 1000);
    const check = detectServerViolation(text);
    res.json({ ...check, exempt: false });
  });

  // Official Game Tournaments Schedule Endpoint
  app.get('/api/tournaments/official', async (req: Request, res: Response) => {
    if (!allowApiRead(`trn:${getClientIp(req)}`)) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    const trailers = await getOfficialSteamTrailers();
    res.json({ items: buildOfficialTournaments(trailers) });
  });

  // Shaghaf Tournament Bot Auto-Fill & Official Lobby Ticket Endpoint
  app.post(
    '/api/tournaments/bot-register',
    express.json({ limit: '16kb' }),
    async (req: Request, res: Response) => {
      if (!allowApiRead(`botreg:${getClientIp(req)}`)) {
        res.status(429).json({ error: 'Too many requests' });
        return;
      }
      const verified = await verifyFirebaseUser(req.headers.authorization);
      if (!verified) {
        res.status(401).json({ ok: false, error: 'Unauthorized' });
        return;
      }

      const body = (req.body || {}) as Record<string, unknown>;
      const tournamentId = String(body.tournamentId || '').trim().slice(0, 128);
      const title = String(body.title || '').trim().slice(0, 80);
      const game = String(body.game || '').trim().slice(0, 40);
      const mode: 'solo' | 'squad' = body.mode === 'solo' ? 'solo' : 'squad';
      const dateLabel = String(body.dateLabel || '').trim().slice(0, 40);
      const officialSource = String(body.officialSource || 'Shaghaf Official Arena').trim().slice(0, 60);
      const sourceUrl = String(body.sourceUrl || '').trim().slice(0, 500);
      const gamerTag = String(body.gamerTag || '').trim().slice(0, 16);
      const gameId = String(body.gameId || '').trim().slice(0, 40);
      const rank = String(body.rank || '').trim().slice(0, 40);

      const missingFields: string[] = [];
      if (!gamerTag || gamerTag.length < 3) missingFields.push('gamerTag');
      if (!gameId) missingFields.push('gameId');
      if (!rank) missingFields.push('rank');

      if (missingFields.length > 0) {
        res.status(422).json({
          ok: false,
          incompleteProfile: true,
          missingFields,
        });
        return;
      }

      const trnSeed = hashString(tournamentId || title || game);
      const playerSeed = hashString(`${tournamentId}:${verified.uid}`);
      const gameLower = game.toLowerCase();

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
      const roomId = `${gamePrefix}-${roomNumA}-${roomNumB}`;
      const roomCode = `SHG${100 + ((trnSeed >> 4) % 899)}`;
      const registrationCode = `${gamePrefix}-${String(playerSeed % 90000 + 10000)}`;

      let rules: string[];
      if (gameLower.includes('free fire')) {
        rules = [
          `الدخول بالمعرّف المسجّل فقط (${gameId}) وعدم تبديل الحساب أثناء الروم.`,
          'يُمنع منعًا باتًا استخدام الهاك أو السكربتات أو استغلال الغليتشات (حظر وإقصاء فوري).',
          mode === 'squad'
            ? 'الالتزام بتشكيلة السكواد الكاملة وعدم التحالف بين الفرق (Teaming).'
            : 'طور فردي: يُمنع أي تحالف أو مساعدة بين اللاعبين داخل الخريطة.',
          'التواجد داخل اللوبي قبل الإقلاع بـ 10 دقائق؛ يُغلق الروم تلقائيًا عند بدء المباراة.',
          'حفظ لقطة شاشة (Screenshot) للنتيجة النهائية عند انتهاء الجولات.',
        ];
      } else if (gameLower.includes('finals')) {
        rules = [
          `التسجيل معتمد بمعرّف Embark الخاص بك (${gameId}) ورتبة (${rank}).`,
          'مواجهات Cashout بنظام 3v3v3v3؛ يُمنع الخروج المتعمد أو استخدام برامج خارجية.',
          'تفعيل اللعب المشترك (Crossplay ON) قبل الانضمام للوبي الخاص بـ 15 دقيقة.',
          'احترام قواعد اللعب النظيف وعدم استغلال أخطاء الخرائط.',
        ];
      } else if (gameLower.includes('pubg')) {
        rules = [
          `الدخول بـ PUBG ID المطابق لملفك (${gameId}) وبمنظور البطولة المحدد.`,
          'ممنوع استخدام المحاكيات في بطولات الموبايل أو أي أدوات مساعدة خارجية.',
          'يبدأ فتح الروم قبل الموعد بـ 15 دقيقة والإقلاع في الموعد المحدد تمامًا.',
          'عدم التحالف مع الخصوم والالتزام بتعليمات منظمي البطولة.',
        ];
      } else if (gameLower.includes('valorant')) {
        rules = [
          `الدخول بنفس Riot ID (${gameId}) وفي السيرفر التنافسي المحدد للمنطقة.`,
          'ممنوع برامج الغش (Vanguard نشط) أو استغلال الثغرات أو الخروج من المباراة.',
          'فترة الانتظار 15 دقيقة قبل الإقفال؛ أي فريق يتأخر يُحتسب منسحبًا.',
        ];
      } else {
        rules = [
          `الدخول بمعرّف اللعبة المسجّل في ملفك (${gameId}) ورتبة (${rank}).`,
          'منع الغش أو البرامج الخارجية أو التحالف غير المسموح به.',
          'الحضور في الروم قبل الموعد بـ 15 دقيقة والانتظار حتى إشارة الانطلاق.',
          'تصوير شاشة النتيجة النهائية لتوثيق الفوز والمكافآت.',
        ];
      }

      const ticket = {
        tournamentId,
        title,
        game,
        mode,
        officialSource,
        sourceUrl: sourceUrl.startsWith('https://') ? sourceUrl : undefined,
        registrationCode,
        roomId,
        roomCode,
        matchTime: dateLabel || 'اليوم · 20:00',
        waitTime: 'يُفتح الروم قبل الموعد بـ 15 دقيقة · ينتظرك المنظمون حتى قبل الإقلاع بـ 5 دقائق',
        rules,
        filledProfile: {
          gamerTag,
          gameId,
          rank,
        },
        createdAtMs: Date.now(),
      };

      res.json({ ok: true, ticket });
    }
  );

  // Serve uploaded user photos and videos securely with Range support for mobile playback
  app.use(
    '/uploads',
    express.static(uploadsDir, {
      maxAge: '7d',
      acceptRanges: true,
      dotfiles: 'deny',
      fallthrough: false,
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; media-src 'self'; img-src 'self'"
        );
      },
    })
  );

  // Streaming media upload endpoint (supports verified images up to 10MB and videos up to 1GB)
  app.post('/api/upload', async (req: Request, res: Response) => {
    const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    const MAX_VIDEO_BYTES = 1024 * 1024 * 1024; // 1 GB
    let targetPath = '';

    try {
      req.setTimeout(0);
      res.setTimeout(0);

      if (!allowUploadAttempt(`up_ip:${getClientIp(req)}`)) {
        req.resume();
        res.status(429).json({ error: 'Too many uploads, try again later' });
        return;
      }

      const uid = await verifyFirebaseBearer(req.headers.authorization);
      if (!uid) {
        req.resume();
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!allowUploadAttempt(`up_uid:${uid}`)) {
        req.resume();
        res.status(429).json({ error: 'Too many uploads, try again later' });
        return;
      }

      const kindHeader = String(req.headers['x-media-kind'] || '').toLowerCase();
      const contentType = String(req.headers['content-type'] || '')
        .split(';')[0]
        .trim()
        .toLowerCase();

      let ext = '';
      let kind: 'image' | 'video' = 'image';
      if (kindHeader === 'video' || contentType.startsWith('video/')) {
        kind = 'video';
        ext = VIDEO_MIME_EXT[contentType] || 'mp4';
      } else if (kindHeader === 'image' || contentType.startsWith('image/')) {
        kind = 'image';
        ext = IMAGE_MIME_EXT[contentType] || 'jpg';
      } else {
        req.resume();
        res.status(400).json({ error: 'Unsupported media type' });
        return;
      }

      const maxBytes = kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      const declaredLen = Number(req.headers['content-length'] || 0);
      if (Number.isFinite(declaredLen) && declaredLen > maxBytes) {
        req.resume();
        res.status(413).json({
          error: kind === 'video' ? 'Video exceeds 1GB limit' : 'Image exceeds 10MB limit',
        });
        return;
      }

      const filename = `${kind}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
      targetPath = path.join(uploadsDir, filename);

      let bytesReceived = 0;
      let headerChecked = false;
      const headChunks: Buffer[] = [];
      let headLen = 0;

      const limiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytesReceived += chunk.length;
          if (bytesReceived > maxBytes) {
            callback(new Error('LIMIT_EXCEEDED'));
            return;
          }
          if (!headerChecked) {
            headChunks.push(chunk);
            headLen += chunk.length;
            if (headLen >= 16) {
              const probe = Buffer.concat(headChunks, Math.min(headLen, 64));
              if (!isValidMediaSignature(probe, kind)) {
                callback(new Error('INVALID_MEDIA_SIGNATURE'));
                return;
              }
              headerChecked = true;
              headChunks.length = 0;
            }
          }
          callback(null, chunk);
        },
        flush(callback) {
          if (!headerChecked && headLen > 0) {
            const probe = Buffer.concat(headChunks, Math.min(headLen, 64));
            if (!isValidMediaSignature(probe, kind)) {
              callback(new Error('INVALID_MEDIA_SIGNATURE'));
              return;
            }
            headerChecked = true;
          }
          callback();
        },
      });

      const writeStream = fs.createWriteStream(targetPath);
      await pipeline(req, limiter, writeStream);

      if (bytesReceived === 0) {
        await fs.promises.unlink(targetPath).catch(() => {});
        res.status(400).json({ error: 'Empty file payload' });
        return;
      }

      res.json({ url: `/uploads/${filename}`, kind, size: bytesReceived });
    } catch (err) {
      if (targetPath) {
        await fs.promises.unlink(targetPath).catch(() => {});
      }
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'LIMIT_EXCEEDED') {
        if (!res.headersSent) {
          res.status(413).json({ error: 'File exceeds upload limit' });
        }
        return;
      }
      if (msg === 'INVALID_MEDIA_SIGNATURE') {
        if (!res.headersSent) {
          res.status(400).json({ error: 'Invalid or unsafe media file signature' });
        }
        return;
      }
      console.error('Upload error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Upload failed' });
      }
    }
  });

  // Use Vite middleware in development, static dist in production
  const isDev =
    process.env.NODE_ENV !== 'production' &&
    (process.env.npm_lifecycle_event === 'dev' ||
      process.argv.some((a) => a.includes('tsx')) ||
      !fs.existsSync(path.join(distDir, 'index.html')));

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
        res.status(404).end();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.requestTimeout = 0;
  server.listen(PORT, HOST, () => {
    console.log(`Shaghaf server running on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
