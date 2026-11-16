import type { FriendTier, Language } from '../types';

export const LIMITS = {
  GAMER_TAG_MIN: 3,
  GAMER_TAG_MAX: 16,
  POST_MAX: 400,
  COMMENT_MAX: 300,
  STORY_MAX: 180,
  CLAN_NAME_MIN: 2,
  CLAN_NAME_MAX: 32,
  CLAN_TAG_MIN: 2,
  CLAN_TAG_MAX: 6,
  CLAN_DESC_MAX: 240,
  MESSAGE_MAX: 300,
  BIO_MAX: 160,
  SKILLS_MAX: 120,
  GAMES_MAX: 120,
  SERVICE_TITLE_MAX: 80,
  SERVICE_DESC_MAX: 240,
  REPORT_MAX: 240,
  WARNING_MAX: 240,
};

export interface ServerItem {
  id: string;
  code: string;
  labels: Record<Language, string>;
}

export const SERVERS: ServerItem[] = [
  { id: 'ALL', code: 'ALL', labels: { ar: 'الكل', en: 'All', fr: 'Tous' } },
  { id: 'FOR_YOU', code: 'YOU', labels: { ar: 'لك', en: 'For You', fr: 'Pour vous' } },
  { id: 'Clans & LFG', code: 'CLAN', labels: { ar: 'كلانات وفرق', en: 'Clans & LFG', fr: 'Clans & LFG' } },
  { id: 'MENA', code: 'MENA', labels: { ar: 'الشرق الأوسط وشمال أفريقيا', en: 'MENA', fr: 'MENA' } },
  { id: 'Global', code: 'GLB', labels: { ar: 'عالمي', en: 'Global', fr: 'Monde' } },
  { id: 'Free Fire', code: 'FF', labels: { ar: 'Free Fire', en: 'Free Fire', fr: 'Free Fire' } },
  { id: 'PUBG Mobile', code: 'PUBG', labels: { ar: 'PUBG Mobile', en: 'PUBG Mobile', fr: 'PUBG Mobile' } },
  { id: 'THE FINALS', code: 'TF', labels: { ar: 'THE FINALS', en: 'THE FINALS', fr: 'THE FINALS' } },
  { id: 'Warzone', code: 'WZ', labels: { ar: 'Warzone', en: 'Warzone', fr: 'Warzone' } },
  { id: 'Fortnite', code: 'FN', labels: { ar: 'Fortnite', en: 'Fortnite', fr: 'Fortnite' } },
  { id: 'Valorant', code: 'VAL', labels: { ar: 'Valorant', en: 'Valorant', fr: 'Valorant' } },
  { id: 'Apex Legends', code: 'APX', labels: { ar: 'Apex Legends', en: 'Apex Legends', fr: 'Apex Legends' } },
  { id: 'Call of Duty', code: 'COD', labels: { ar: 'Call of Duty', en: 'Call of Duty', fr: 'Call of Duty' } },
  { id: 'CS2', code: 'CS2', labels: { ar: 'CS2', en: 'CS2', fr: 'CS2' } },
  { id: 'League of Legends', code: 'LoL', labels: { ar: 'League of Legends', en: 'League of Legends', fr: 'League of Legends' } },
  { id: 'Rocket League', code: 'RL', labels: { ar: 'Rocket League', en: 'Rocket League', fr: 'Rocket League' } },
  { id: 'Mobile Legends', code: 'ML', labels: { ar: 'Mobile Legends', en: 'Mobile Legends', fr: 'Mobile Legends' } },
  { id: 'EA FC', code: 'FC', labels: { ar: 'EA FC', en: 'EA FC', fr: 'EA FC' } },
  { id: 'Editors', code: 'EDT', labels: { ar: 'مونتاج', en: 'Editors', fr: 'Montage' } },
  { id: 'Dev & Design', code: 'DEV', labels: { ar: 'تصميم وبرمجة', en: 'Dev & Design', fr: 'Dev & Design' } },
];

export const REGIONS = ['MENA', 'Europe', 'North America', 'Asia', 'Africa', 'Global'];

export const STORY_GRADIENTS = [
  'from-violet-700 via-indigo-700 to-blue-700',
  'from-orange-600 via-red-600 to-rose-700',
  'from-emerald-600 via-teal-700 to-cyan-700',
  'from-amber-600 via-orange-700 to-red-700',
];

export const TIER_META: Record<
  FriendTier,
  { order: number; ringColor: string; labels: Record<Language, string> }
> = {
  bro: {
    order: 0,
    ringColor: '#F97316',
    labels: { ar: 'Bro', en: 'Bro', fr: 'Bro' },
  },
  good: {
    order: 1,
    ringColor: '#3B82F6',
    labels: { ar: 'صديق جيد', en: 'Good friend', fr: 'Bon ami' },
  },
  normal: {
    order: 2,
    ringColor: '#10B981',
    labels: { ar: 'صديق عادي', en: 'Friend', fr: 'Ami' },
  },
};

export const PAYMENT_METHODS = ['Flouci', 'D17', 'e-Dinar', 'PayPal', 'Bank Card'];

export function toNameKey(tag: string): string {
  const bytes = new TextEncoder().encode(tag.trim().toLowerCase());
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `tag_${hex}`;
}

export function getDmThreadId(uidA: string, uidB: string): string {
  const sorted = [uidA, uidB].sort();
  return `dm_${sorted[0]}_${sorted[1]}`.slice(0, 128);
}

export const MAX_LEVEL = 999;
export const MAX_XP = 99_999_999;
export const USER_MAX_XP = 10_000_000;

export function calcLevel(xp: number): number {
  return Math.min(MAX_LEVEL, Math.floor(Math.sqrt(Math.max(0, xp) / 25)) + 1);
}

export function formatXp(xp: number): string {
  if (xp >= MAX_XP) return 'MAX';
  return `${xp.toLocaleString()} XP`;
}

const normalizeMod = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/(.)\1+/g, '$1');

const BAD_WORDS = [
  'زب',
  'زبي',
  'كس',
  'قحبة',
  'طبونة',
  'شرموطة',
  'عرص',
  'متناك',
  'منيوك',
  'نيك',
  'كلب ابن',
  'zebi',
  'tobouna',
  't7in',
  '9a7ba',
  'kahba',
  'nik',
  'fuck',
  'bitch',
  'shit',
  'whore',
  'slut',
  'putain',
  'salope',
  'encule',
].map(normalizeMod);

const NSFW_WORDS = [
  'سكس',
  'اباحي',
  'إباحي',
  'بورن',
  'عاري',
  'عارية',
  'عري',
  'مؤخرة',
  'ثدي',
  'porn',
  'xxx',
  'nsfw',
  'nude',
  'nudes',
  'hentai',
  'onlyfans',
  'sex',
  'boobs',
  'dick',
  'pussy',
  'pornhub',
  'xvideos',
].map(normalizeMod);

const SEP_REGEX = /[^a-z0-9\u0621-\u064A]+/g;

export function detectContentViolation(
  text: string,
  lang: Language = 'ar'
): { violated: boolean; kind: 'none' | 'profanity' | 'nsfw'; reason: string } {
  const normalized = normalizeMod(text);
  const tokens = normalized.split(SEP_REGEX);
  const compact = normalized.replace(SEP_REGEX, '');

  const isNsfw =
    tokens.some((w) => NSFW_WORDS.includes(w)) ||
    NSFW_WORDS.some((b) => b.length >= 4 && compact.includes(b));
  if (isNsfw) {
    return {
      violated: true,
      kind: 'nsfw',
      reason:
        lang === 'ar'
          ? 'محتوى إباحي أو غير لائق (+18 / NSFW)'
          : lang === 'fr'
          ? 'Contenu explicite ou inapproprié (NSFW)'
          : 'Explicit or NSFW content detected',
    };
  }

  const isBad =
    tokens.some((w) => BAD_WORDS.includes(w)) ||
    BAD_WORDS.some((b) => b.length >= 5 && compact.includes(b));
  if (isBad) {
    return {
      violated: true,
      kind: 'profanity',
      reason:
        lang === 'ar'
          ? 'ألفاظ مسيئة أو سبّ مخالف لقوانين شغف'
          : lang === 'fr'
          ? 'Langage offensant contraire aux règles de Shaghaf'
          : 'Profanity or abusive language detected',
    };
  }

  return { violated: false, kind: 'none', reason: '' };
}

export function hasProfanity(text: string): boolean {
  return detectContentViolation(text, 'ar').violated;
}

export function extractHashtags(text: string): string[] {
  const matches = text.match(/#([\p{L}\p{N}_]{2,30})/gu) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of matches) {
    const clean = raw.slice(1).toLowerCase();
    if (!seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
      if (out.length >= 10) break;
    }
  }
  return out;
}

export const OFFICIAL_HASHTAG_KEYS = ['شغف', 'shaghaf'];

export function hasOfficialHashtag(text: string, hashtags?: string[]): boolean {
  const list = hashtags && hashtags.length > 0 ? hashtags : extractHashtags(text);
  return list.some((h) => OFFICIAL_HASHTAG_KEYS.includes(h.toLowerCase()));
}

export const PLAYABLE_GAMES = [
  'Free Fire',
  'PUBG Mobile',
  'THE FINALS',
  'Valorant',
  'Warzone',
  'Fortnite',
  'Call of Duty',
  'Apex Legends',
  'CS2',
  'Mobile Legends',
  'EA FC',
  'Rocket League',
];

export const BAN_DURATIONS: { id: string; ms: number; labels: Record<Language, string> }[] = [
  { id: '1d', ms: 86_400_000, labels: { ar: '1 يوم', en: '1 day', fr: '1 jour' } },
  { id: '3d', ms: 3 * 86_400_000, labels: { ar: '3 أيام', en: '3 days', fr: '3 jours' } },
  { id: '1w', ms: 7 * 86_400_000, labels: { ar: '1 أسبوع', en: '1 week', fr: '1 semaine' } },
  { id: '2w', ms: 14 * 86_400_000, labels: { ar: 'أسبوعان', en: '2 weeks', fr: '2 semaines' } },
  { id: '1m', ms: 30 * 86_400_000, labels: { ar: '1 شهر', en: '1 month', fr: '1 mois' } },
  { id: 'perm', ms: 0, labels: { ar: 'دائم', en: 'Permanent', fr: 'Permanent' } },
];

export function formatRemainingTime(untilMs: number, lang: Language): string {
  const rem = Math.max(0, untilMs - Date.now());
  if (rem === 0) return '';
  const mins = Math.ceil(rem / 60_000);
  if (mins < 60) return lang === 'ar' ? `${mins} دقيقة` : `${mins}m`;
  const hours = Math.ceil(mins / 60);
  if (hours < 24) return lang === 'ar' ? `${hours} ساعة` : `${hours}h`;
  const days = Math.ceil(hours / 24);
  return lang === 'ar' ? `${days} يوم` : `${days}d`;
}

export interface AutoModState {
  count: number;
  untilMs: number;
}

export function getPenaltyDuration(count: number, lang: Language): { ms: number; label: string } {
  const labels: Record<Language, string[]> = {
    ar: ['تحذير فقط', '1 ساعة', '1 يوم', '1 أسبوع', 'أسبوعان فأكثر'],
    en: ['Warning only', '1 hour', '1 day', '1 week', '2+ weeks'],
    fr: ['Avertissement seul', '1 heure', '1 jour', '1 semaine', '2+ semaines'],
  };
  const durations = [0, 3600_000, 86400_000, 604800_000];
  const idx = Math.min(count - 1, 4);
  const ms = count <= 4 ? durations[count - 1] : 604800_000 * 2 * (count - 4);
  return { ms, label: labels[lang][idx] };
}

export const GENERAL_OPEN_SERVERS = new Set(['ALL', 'FOR_YOU', 'Clans & LFG', 'MENA', 'Global', '']);

const SERVER_TOPIC_KEYWORDS: Record<string, string[]> = {
  'Free Fire': [
    'free fire', 'freefire', 'ff', 'garena', 'فري فاير', 'فريفاير', 'كارينا',
    'booyah', 'بويا', 'بوياه', 'bermuda', 'برمودا', 'clash squad', 'كلاش سكواد',
    'alok', 'الوك', 'chrono', 'كرونو', 'lone wolf', 'لون ولف', 'diamonds', 'جواهر',
    'ون تاب', 'one tap', 'هيدشوت', 'رومات فري',
  ],
  'PUBG Mobile': [
    'pubg', 'pubgm', 'ببجي', 'بابجي', 'erangel', 'ارنغل', 'ايرانغل', 'livik', 'ليفيك',
    'miramar', 'ميرامار', 'pmco', 'pmgc', 'uc', 'شدات', 'conqueror', 'كونكر',
    'chicken dinner', 'تشيكن دينر', 'm416', 'ام فور',
  ],
  'THE FINALS': [
    'the finals', 'ذا فاينلز', 'فاينلز', 'embark', 'cashout', 'كاش اوت',
    'world tour', 'multibucks', 'ospuze', 'cns', 'heavy build', 'medium build', 'light build',
  ],
  Warzone: [
    'warzone', 'وارزون', 'verdansk', 'فردانسك', 'rebirth', 'ريبرث', 'gulag', 'قولاغ',
    'urzikstan', 'loadout', 'لود اوت', 'resurgence', 'cod points',
  ],
  Fortnite: [
    'fortnite', 'فورتنايت', 'فورت نايت', 'vbucks', 'v-bucks', 'في باكس', 'zero build',
    'battle bus', 'tilted', 'fncs', 'victory cup', 'epic games',
  ],
  Valorant: [
    'valorant', 'فالورانت', 'فالورنت', 'vct', 'riot', 'spike', 'سبايك',
    'radiant', 'immortal', 'jett', 'جيت', 'reyna', 'رينا', 'vandal', 'phantom', 'premier',
  ],
  'Apex Legends': [
    'apex', 'apex legends', 'ابيكس', 'أبيكس', 'algs', 'wraith', 'octane',
    'pathfinder', 'heirloom', 'kings canyon', 'olympus', 'respawn',
  ],
  'Call of Duty': [
    'call of duty', 'cod', 'codm', 'كول اوف ديوتي', 'كود موبايل', 'nuketown',
    'search and destroy', 'bo6', 'mw3', 'black ops', 'modern warfare',
  ],
  CS2: [
    'cs2', 'csgo', 'counter strike', 'counter-strike', 'كونتر سترايك', 'كاونتر',
    'dust2', 'mirage', 'awp', 'faceit', 'valve', 'inferno', 'ak47',
  ],
  'League of Legends': [
    'league of legends', 'lol', 'ليج اوف ليجندز', 'لول', 'summoner', 'rift',
    'worlds', 'yasuo', 'faker', 'adc', 'jungle', 'baron', 'tft',
  ],
  'Rocket League': [
    'rocket league', 'روكت ليق', 'روكت ليج', 'rlcs', 'flip reset',
    'fennec', 'dominus', 'grand champ', 'supersonic',
  ],
  'Mobile Legends': [
    'mobile legends', 'mlbb', 'موبايل ليجندز', 'mpl', 'mythic',
    'land of dawn', 'savage', 'moonton', 'gusion',
  ],
  'EA FC': [
    'ea fc', 'eafc', 'fc25', 'fc 25', 'fc26', 'fc 26', 'fifa', 'فيفا',
    'ultimate team', 'fut', 'pro clubs', 'career mode', 'fc points', 'sbc',
  ],
  Editors: [
    'مونتاج', 'اديت', 'إيديت', 'edit', 'edits', 'editor', 'montage', 'amv', 'vfx',
    'after effects', 'افتر افكت', 'premiere', 'بريمير', 'capcut', 'كاب كت',
    'alight motion', 'twixtor', 'velocity', 'lut', 'color grading', 'thumbnail', '60fps',
  ],
  'Dev & Design': [
    'برمجة', 'برمجه', 'مطور', 'تطوير', 'كود برمجي', 'خوارزمية', 'تطبيقات', 'مواقع',
    'تطوير مواقع', 'تصميم', 'جرافيك', 'واجهة', 'programming', 'coding', 'developer',
    'javascript', 'typescript', 'python', 'بايثون', 'react', 'nextjs', 'html', 'css',
    'nodejs', 'node.js', 'c++', 'php', 'sql', 'database', 'قاعدة بيانات', 'ui/ux',
    'figma', 'فيغما', 'photoshop', 'فوتوشوب', 'illustrator', 'unity', 'unreal',
    'blender', 'github', 'flutter', 'dart', 'backend', 'frontend',
  ],
};

const NON_GAME_OFF_TOPIC_KEYWORDS: Array<{ topicAr: string; topicEn: string; terms: string[] }> = [
  {
    topicAr: 'البرمجة وتطوير المواقع (مكانه سيرفر Dev & Design)',
    topicEn: 'Programming & Dev (belongs in Dev & Design)',
    terms: [
      'برمجة', 'برمجه', 'كود برمجي', 'تعلم البرمجة', 'مطور مواقع', 'تطوير مواقع',
      'تطوير تطبيقات', 'بايثون', 'جافاسكريبت', 'جافا سكريبت', 'تايب سكريبت',
      'رياكت', 'python', 'javascript', 'typescript', 'html', 'css', 'reactjs',
      'nodejs', 'sql', 'database', 'قاعدة بيانات', 'github', 'flutter', 'php',
      'algorithm', 'خوارزمية', 'برمج', 'كود html',
    ],
  },
  {
    topicAr: 'الطبخ ووصفات الطعام',
    topicEn: 'Cooking & recipes',
    terms: ['طبخ', 'وصفة طبخ', 'مطبخ', 'مقادير الكيك', 'عجينة', 'طهي', 'recipe', 'cooking'],
  },
  {
    topicAr: 'العملات الرقمية والتداول',
    topicEn: 'Crypto & trading',
    terms: ['بيتكوين', 'كريبتو', 'تداول فوركس', 'عملات رقمية', 'bitcoin', 'crypto', 'forex', 'usdt'],
  },
  {
    topicAr: 'الواجبات الدراسية',
    topicEn: 'School homework',
    terms: ['واجب مدرسي', 'حل تمرين رياضيات', 'إعراب', 'معادلة فيزياء', 'امتحان كيمياء'],
  },
];

function textMatchesTerm(normalizedText: string, tokens: string[], rawTerm: string): boolean {
  const term = normalizeMod(rawTerm).trim();
  if (!term) return false;
  if (term.includes(' ') || /[^a-z0-9\u0621-\u064A]/.test(term)) {
    return normalizedText.includes(term);
  }
  if (term.length <= 3) {
    return tokens.includes(term);
  }
  return tokens.includes(term) || normalizedText.includes(term);
}

export function detectServerTopicMismatch(
  serverId: string | undefined,
  text: string,
  lang: Language = 'ar'
): { violated: boolean; detectedTopic?: string; reason: string } {
  const server = (serverId || '').trim();
  if (!server || GENERAL_OPEN_SERVERS.has(server) || !(server in SERVER_TOPIC_KEYWORDS)) {
    return { violated: false, reason: '' };
  }

  const trimmed = text.trim();
  if (!trimmed) return { violated: false, reason: '' };

  const normalized = normalizeMod(trimmed);
  const tokens = normalized.split(SEP_REGEX).filter(Boolean);

  // If post explicitly relates to the current server, allow it
  const ownTerms = SERVER_TOPIC_KEYWORDS[server] || [];
  if (ownTerms.some((term) => textMatchesTerm(normalized, tokens, term))) {
    return { violated: false, reason: '' };
  }

  // Check if content clearly belongs to another specific server
  const otherServers = Object.entries(SERVER_TOPIC_KEYWORDS).filter(([id]) => id !== server);
  let matchedOther: { id: string; hits: number } | null = null;
  for (const [otherId, terms] of otherServers) {
    let hits = 0;
    for (const term of terms) {
      if (textMatchesTerm(normalized, tokens, term)) {
        hits += 1;
      }
    }
    if (hits > 0 && (!matchedOther || hits > matchedOther.hits)) {
      matchedOther = { id: otherId, hits };
    }
  }

  if (matchedOther) {
    // Allow montage/edit talk inside a game server if it mentions clips/gameplay, reject only if purely another game or Dev in Game
    const isGameServer = server !== 'Editors' && server !== 'Dev & Design';
    const allowEditorsInGame = isGameServer && matchedOther.id === 'Editors';
    if (!allowEditorsInGame) {
      const targetItem = SERVERS.find((s) => s.id === matchedOther.id);
      const targetLabel = targetItem ? targetItem.labels[lang] : matchedOther.id;
      const serverItem = SERVERS.find((s) => s.id === server);
      const serverLabel = serverItem ? serverItem.labels[lang] : server;
      return {
        violated: true,
        detectedTopic: matchedOther.id,
        reason:
          lang === 'ar'
            ? `هذا المنشور خارج موضوع سيرفر «${serverLabel}» ويناسب سيرفر «${targetLabel}» فقط`
            : lang === 'fr'
            ? `Ce post est hors sujet pour « ${serverLabel} » (plutôt pour « ${targetLabel} »)`
            : `Off-topic for ${serverLabel} server — post this in ${targetLabel} instead`,
      };
    }
  }

  // Check non-gaming off-topic categories inside game/editor servers
  if (server !== 'Dev & Design') {
    for (const cat of NON_GAME_OFF_TOPIC_KEYWORDS) {
      if (cat.terms.some((term) => textMatchesTerm(normalized, tokens, term))) {
        const serverItem = SERVERS.find((s) => s.id === server);
        const serverLabel = serverItem ? serverItem.labels[lang] : server;
        return {
          violated: true,
          detectedTopic: cat.topicEn,
          reason:
            lang === 'ar'
              ? `هذا السيرفر مخصص لـ «${serverLabel}» فقط وليس لنشر مواضيع ${cat.topicAr}`
              : lang === 'fr'
              ? `Ce serveur est réservé à « ${serverLabel} », pas à ${cat.topicEn}`
              : `This server is dedicated to ${serverLabel}, not ${cat.topicEn}`,
        };
      }
    }
  }

  return { violated: false, reason: '' };
}

