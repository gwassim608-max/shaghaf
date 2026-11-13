export type Language = 'ar' | 'en' | 'fr';

export type NavTab = 'home' | 'news' | 'clans' | 'arena' | 'live' | 'profile' | 'videos' | 'owner';

export type FriendTier = 'normal' | 'good' | 'bro';

export type BadgeKind = 'none' | 'gift' | 'sub' | 'own';

export type OrderStatus = 'escrow' | 'delivered' | 'completed';

export interface UserPublic {
  uid: string;
  gamerTag: string;
  bio?: string;
  skills?: string;
  gameId?: string;
  rank?: string;
  favoriteGames?: string;
  playingGame?: string;
  isPrivate: boolean;
  isMinor: boolean;
  xp: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserPrivate {
  uid: string;
  email?: string;
  language: Language;
  liteMode: boolean;
  dndMode: boolean;
  updatedAt?: unknown;
}

export interface UserFlag {
  uid: string;
  gamerTag: string;
  badge: BadgeKind;
  boost: boolean;
  ban: boolean;
  banUntilMs?: number;
  chatBanUntilMs?: number;
  banReason?: string;
  updatedAt?: unknown;
}

export interface FriendLink {
  ownerUid: string;
  friendUid: string;
  friendTag: string;
  tier: FriendTier;
  updatedAt?: unknown;
}

export interface Post {
  id: string;
  authorUid: string;
  authorTag: string;
  server: string;
  content: string;
  imageUrl?: string;
  hashtags?: string[];
  visibility: 'public';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PostComment {
  id: string;
  authorUid: string;
  authorTag: string;
  text: string;
  createdAt?: unknown;
}

export interface Story {
  id: string;
  authorUid: string;
  authorTag: string;
  text: string;
  themeIndex: number;
  expiresAtMs: number;
  visibility: 'public';
  createdAt?: unknown;
}

export interface Clan {
  id: string;
  name: string;
  tag: string;
  game: string;
  region: string;
  minRank?: string;
  description?: string;
  ownerUid: string;
  ownerTag: string;
  isPublic: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ClanMember {
  uid: string;
  gamerTag: string;
  role: 'owner' | 'mod' | 'member';
  joinedAt?: unknown;
}

export interface ClanMessage {
  id: string;
  authorUid: string;
  authorTag: string;
  text: string;
  mediaUrl?: string;
  createdAt?: unknown;
}

export interface DmThread {
  id: string;
  participants: string[];
  participantTags: Record<string, string>;
  lastMessage?: string;
  isGroup?: boolean;
  groupName?: string;
  creatorUid?: string;
  updatedAt?: unknown;
}

export interface DmMessage {
  id: string;
  senderUid: string;
  senderTag: string;
  text: string;
  mediaUrl?: string;
  createdAt?: unknown;
}

export interface ServiceListing {
  id: string;
  sellerUid: string;
  sellerTag: string;
  title: string;
  description?: string;
  price: number;
  visibility: 'public';
  createdAt?: unknown;
}

export interface MarketOrder {
  id: string;
  buyerUid: string;
  buyerTag: string;
  sellerUid: string;
  sellerTag: string;
  serviceId: string;
  serviceTitle: string;
  price: number;
  paymentMethod: string;
  status: OrderStatus;
  rating?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LfgPost {
  id: string;
  authorUid: string;
  authorTag: string;
  game: string;
  rank: string;
  schedule: string;
  visibility: 'public';
  createdAt?: unknown;
}

export type TournamentCategory = 'friendly' | 'official' | 'qualifiers';

export interface Tournament {
  id: string;
  creatorUid: string;
  creatorTag: string;
  title: string;
  game: string;
  dateLabel: string;
  prize?: string;
  mode?: 'solo' | 'squad';
  category?: TournamentCategory;
  isBot?: boolean;
  officialSource?: string;
  imageUrl?: string;
  videoUrl?: string;
  sourceUrl?: string;
  visibility: 'public';
  createdAt?: unknown;
}

export interface TournamentParticipant {
  uid: string;
  gamerTag: string;
  joinedAt?: unknown;
}

export interface TournamentTicket {
  tournamentId: string;
  title: string;
  game: string;
  mode: 'solo' | 'squad';
  officialSource: string;
  sourceUrl?: string;
  registrationCode: string;
  roomId: string;
  roomCode: string;
  matchTime: string;
  waitTime: string;
  rules: string[];
  filledProfile: {
    gamerTag: string;
    gameId: string;
    rank: string;
  };
  createdAtMs: number;
}

export interface AdminWarning {
  id: string;
  targetUid: string;
  message: string;
  createdAt?: unknown;
}

export interface UserReport {
  id: string;
  reporterUid: string;
  reporterTag: string;
  targetUid: string;
  targetTag: string;
  reason: string;
  createdAt?: unknown;
}

export interface AppNotification {
  id: string;
  text: string;
  ts: number;
  read: boolean;
}

export interface BadgeRequest {
  uid: string;
  gamerTag: string;
  paymentMethod: string;
  referenceNote?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BotMessage {
  id: string;
  targetUid: string;
  title: string;
  body: string;
  kind: 'welcome' | 'warning' | 'ban' | 'tournament';
  read: boolean;
  createdAt?: unknown;
}

export interface VideoPost {
  id: string;
  authorUid: string;
  authorTag: string;
  server: string;
  title: string;
  videoUrl: string;
  hashtags?: string[];
  repostFromTag?: string;
  visibility: 'public';
  createdAt?: unknown;
  updatedAt?: unknown;
}
