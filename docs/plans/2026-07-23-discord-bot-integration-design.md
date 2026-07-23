# Discord Bot Integration — Design

**Date:** 2026-07-23
**Status:** Approved
**Approach:** Bot Token + REST API (Phase 1), Gateway WebSocket (Phase 2)

---

## Context

The user wants to track market discussions from Discord channels they're in. Discord's OAuth `messages.read` scope only works for local RPC — it cannot read channel messages via the REST API. All legitimate Discord scrapers use a **bot token** for auth. The bot must be added to the target servers with `Read Message History` + `View Channel` permissions.

## Goals

1. Add Discord as a new platform in the social feed alongside Reddit/X/Truth Social
2. Bot token managed via Settings UI (same pattern as OAuth credentials)
3. Channel picker: bot lists its servers + channels, user toggles which to track
4. Fetch messages from tracked channels and normalize into `SocialPost` format
5. Graceful fallback when `MESSAGE_CONTENT` intent is not enabled (metadata only, no text)

## Non-Goals (Phase 1)

- Real-time Gateway streaming (Phase 2 enhancement)
- Sending messages / interacting with Discord
- Thread/forum scraping
- DM access

---

## Architecture

### Bot Token Flow

```
User creates Discord bot → adds bot to servers → pastes bot token in Settings
    → Bot lists guilds via REST (GET /users/@me/guilds)
    → User picks channels to track
    → Server fetches messages via REST (GET /channels/{id}/messages)
    → Messages normalized to SocialPost → aggregated in social feed
```

### REST API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /users/@me` | Verify bot token, get bot info |
| `GET /users/@me/guilds` | List servers the bot is in |
| `GET /guilds/{id}/channels` | List channels in a server |
| `GET /channels/{id}/messages` | Fetch message history |

### Intents

- `MESSAGE_CONTENT` (1 << 15) — privileged, must be enabled in Discord Developer Portal
- If not enabled: Gateway connects but messages arrive with empty `content`
- REST API also requires this for `message.content` field to be populated
- Fallback: show message metadata (author, timestamp, reactions, embeds) without text body

---

## Components

### 1. `src/server/discordBot.ts` — Bot Token Management

- In-memory credential store (same as OAuth `setAppCredentials` pattern)
- `setDiscordBotToken(token)` / `getDiscordBotToken()` / `hasDiscordBotToken()`
- `verifyBotToken(token)` — calls `GET /users/@me` to validate
- Auto-generates encryption key in dev (same pattern as OAuth)

### 2. `src/server/discordApi.ts` — REST API Client

- Thin wrapper around Discord REST API v10
- Base URL: `https://discord.com/api/v10`
- Auth header: `Bot {token}`
- Rate limit handling: respect `X-RateLimit-*` headers, backoff on 429
- Methods:
  - `getBotInfo()` — verify token
  - `getGuilds()` — list servers
  - `getChannels(guildId)` — list channels (text only, type 0)
  - `getMessages(channelId, limit?, before?)` — fetch message history

### 3. `src/server/discordMessages.ts` — Message Processing

- Fetches messages from tracked channels
- Normalizes Discord message format to `SocialPost`:
  - `author` → `accountName`
  - `content` → `text`
  - `timestamp` → `publishedAt`
  - `reactions` → engagement score
  - `channel_id` → `identifier`
  - `guild_id` → metadata
- Filters: skip bot messages, skip empty content
- Stores last fetched message ID per channel for incremental fetches
- Runs sentiment analysis via existing `sentimentAnalyzer.ts`

### 4. `src/server/discordRoutes.ts` — REST Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/discord/status` | Bot connection status, guild count |
| `POST` | `/api/discord/token` | Set bot token (body: `{token}`) |
| `DELETE` | `/api/discord/token` | Remove bot token |
| `GET` | `/api/discord/guilds` | List bot's servers |
| `GET` | `/api/discord/guilds/:id/channels` | List channels in server |
| `POST` | `/api/discord/track` | Start tracking a channel |
| `DELETE` | `/api/discord/track/:channelId` | Stop tracking a channel |
| `GET` | `/api/discord/tracked` | List tracked channels |
| `POST` | `/api/discord/fetch` | Manual fetch messages now |

### 5. `src/client/src/components/terminal/DiscordTab.tsx` — UI

Two sections:

**Bot Status**
- Bot token input (masked, same pattern as OAuth credentials)
- "Verify" button — validates token, shows bot username/avatar
- Connection status indicator (green/red)

**Channel Picker**
- After token verified, loads guilds via `/api/discord/guilds`
- Each guild expands to show text channels
- Toggle to track/untrack each channel
- Shows message count and last fetched time per tracked channel

### 6. Social Feed Integration

- `src/server/socialFeed.ts` — add `discord` platform
- `SocialSourceConfig` gets `platform: 'discord'` variant
- Discord posts feed into `SocialFeedResponse.byPlatform.discord`
- Existing sentiment analysis works unchanged

---

## Data Model

### No new DB tables needed

Tracked channels stored in `symbolConfig.json`:

```json
{
  "discord": {
    "trackedChannels": [
      {
        "channelId": "1234567890",
        "channelName": "market-discussion",
        "guildId": "9876543210",
        "guildName": "Trading Community",
        "addedAt": "2026-07-23T00:00:00Z",
        "lastMessageId": "111222333444"
      }
    ]
  }
}
```

### SocialPost extension

Discord posts use the same `SocialPost` interface:

```typescript
{
  platform: 'discord',
  id: message.id,
  text: message.content,
  accountName: message.author.username,
  accountHandle: message.author.id,
  publishedAt: new Date(message.timestamp),
  url: `https://discord.com/channels/${guildId}/${channelId}/${message.id}`,
  engagementScore: calculateReactions(message.reactions),
  metadata: {
    guildId,
    guildName,
    channelId,
    channelName,
    attachments: message.attachments?.length || 0,
    embeds: message.embeds?.length || 0,
  }
}
```

---

## Graceful Fallback

| Scenario | Behavior |
|----------|----------|
| No bot token | Show "Add Bot Token" button in Settings, red status |
| Invalid token | Error message, red status |
| Token valid, MESSAGE_CONTENT not enabled | Bot lists guilds/channels, messages show metadata only (no text), warning banner |
| Token valid, MESSAGE_CONTENT enabled | Full message content, sentiment analysis works |
| Channel not accessible | Skip with warning, don't break other channels |
| Rate limited | Backoff and retry, don't spam |

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/server/discordBot.ts` | **New** | Bot token management, verification |
| `src/server/discordApi.ts` | **New** | Discord REST API client with rate limiting |
| `src/server/discordMessages.ts` | **New** | Message fetching, normalization to SocialPost |
| `src/server/discordRoutes.ts` | **New** | REST endpoints for bot management + channel tracking |
| `src/server/routes.ts` | **Modify** | Mount discord routes |
| `src/server/socialFeed.ts` | **Modify** | Add discord platform fetcher |
| `src/symbolConfig.json` | **Modify** | Add `discord.trackedChannels` config |
| `src/client/src/components/terminal/DiscordTab.tsx` | **New** | Bot status + channel picker UI |
| `src/client/src/components/terminal/ConfigModal.tsx` | **Modify** | Add DISCORD tab |
| `src/client/src/lib/useFinance.ts` | **Modify** | Add discord hooks |
| `src/server/discordApi.test.ts` | **New** | Unit tests for API client + message normalization |

---

## Testing Strategy

1. **Unit tests** (`discordApi.test.ts`):
   - Message normalization (Discord format → SocialPost)
   - Rate limit header parsing
   - Empty content handling (MESSAGE_CONTENT not enabled)

2. **Integration test** (manual):
   - Create Discord bot, add to test server
   - Paste token in Settings, verify connection
   - Pick a channel, fetch messages
   - Confirm messages appear in social feed with sentiment

3. **Fallback test**:
   - Disable MESSAGE_CONTENT intent
   - Verify bot still lists guilds/channels
   - Verify messages show metadata without text body
   - Verify warning banner appears

---

## Setup Guide (for user)

1. Go to https://discord.com/developers/applications → New Application
2. Bot tab → Reset Token → copy token
3. Enable **Message Content Intent** under Privileged Gateway Intents
4. OAuth2 → URL Generator → select `bot` scope
5. Permissions: `View Channel` + `Read Message History`
6. Open generated URL → add bot to your server(s)
7. In app: Settings → DISCORD → paste bot token → Verify
8. Pick channels to track from the channel picker
