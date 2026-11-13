# Shaghaf Security Specification

## 1. Data Invariants
1. **Identity Integrity**: Every user-authored record (`posts`, `comments`, `stories`, `clans`, `services`, `lfg`, `tournaments`, `orders`, `reports`) must bind `authorUid` / `ownerUid` / `sellerUid` / `buyerUid` / `reporterUid` strictly to `request.auth.uid`.
2. **PII Isolation**: User email addresses and private preferences live exclusively in `/users_private/{userId}`, readable and writable only by `userId == request.auth.uid`. Public profiles live in `/users_public/{userId}` with no email or phone fields.
3. **RBAC & Moderation Isolation**: Badges (`own`, `gift`, `sub`), featured boosts, and bans live exclusively in `/flags/{userId}`, writable only by verified Admin (`wassimzouaui604@gmail.com` with `email_verified == true` or `/admins/{uid}`). Users cannot self-assign badges, boosts, or unban themselves.
4. **Banned User Gate**: Users flagged with `ban == true` in `/flags/{request.auth.uid}` cannot create posts, stories, comments, clan messages, or DMs.
5. **Terminal Order Locking & Escrow**: Market orders transition strictly `escrow -> delivered` (by seller) and `delivered -> completed` (by buyer). Once `completed`, status cannot revert; buyer may submit a single numeric `rating` (1..5) once.
6. **Subcollection Membership Gates**: Clan private messages require membership in `/clans/{clanId}/members/{uid}` unless `isPublic == true`. DM messages require `request.auth.uid in parentThread.participants`.
7. **Server Timestamps**: All `createdAt`, `updatedAt`, `joinedAt` fields must equal `request.time`.

## 2. The "Dirty Dozen" Attack Payloads
1. **Shadow Update on UserPublic**: `{ "uid": "u1", "gamerTag": "pro", "isPrivate": false, "isMinor": false, "xp": 0, "isAdmin": true, "createdAt": SERVER, "updatedAt": SERVER }` -> DENIED (extra key `isAdmin`).
2. **Self-Badge Escalation on Flags**: User writes `/flags/u1` with `{ "uid": "u1", "badge": "own", "boost": true, "ban": false }` -> DENIED (not admin).
3. **Spoofed Author UID on Post**: User `u1` creates `/posts/p1` with `authorUid: "u2"` -> DENIED (`authorUid != request.auth.uid`).
4. **Banned User Posting**: User `u_banned` (with `/flags/u_banned.ban == true`) creates a post -> DENIED (`notBanned()` fails).
5. **ID Poisoning Attack**: User creates `/posts/` + 200-char ID -> DENIED (`isValidId` fails).
6. **Oversized Payload (Denial of Wallet)**: User creates post with `content` of 5,000 chars -> DENIED (`content.size() <= 400`).
7. **PII Read Leak**: User `u1` reads `/users_private/u2` -> DENIED (`uid != userId`).
8. **Private Profile List Scraping**: User `u1` queries `/users_public` expecting private profiles -> DENIED for private docs (`resource.data.isPrivate == false`).
9. **Client Timestamp Forgery**: User creates post with `createdAt: "2020-01-01"` -> DENIED (`createdAt == request.time`).
10. **Order State Shortcutting**: Buyer marks `/orders/o1` directly from `escrow` to `completed` without seller delivery, or edits `price` -> DENIED.
11. **Unauthorized DM Read**: User `u3` reads `/dms/u1_u2/messages/m1` -> DENIED (`u3` not in `participants`).
12. **Unverified Email Admin Spoof**: Token has `email: "wassimzouaui604@gmail.com"` with `email_verified: false` attempting `/flags/u1` write -> DENIED.
