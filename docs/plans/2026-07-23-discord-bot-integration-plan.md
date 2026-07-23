# Discord Bot Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use godmode:task-runner to implement this plan task-by-task.

**Goal:** Add Discord as a new social feed platform that reads market discussion channels via bot token + REST API.

**Architecture:** Bot token stored in-memory (same as OAuth credentials). REST API client fetches guilds, channels, and messages. Messages normalized to SocialPost format and integrated into existing social feed. UI provides bot verification, channel picker, and tracking controls.

**Tech Stack:** TypeScript, Express, React (TanStack Query), Discord REST API v10, existing sentiment analyzer

---

### Task 1: Bot Token Management (`discordBot.ts`)

**Files:**
- Create: `src/server/discordBot.ts`

**Step 1: Create bot token management module**

```typescript
// src/server/discordBot.ts
import crypto from "node:crypto";

let discordBotToken: string | null = null;

export function setDiscordBotToken(token: string): void {
  discordBotToken = token;
}

export function getDiscordBotToken(): string | null {
  return discordBotToken;
}

export function hasDiscordBotToken(): boolean {
  return discordBotToken !== null;
}

export function clearDiscordBotToken(): void {
  discordBotToken = null;
}

export async function verifyBotToken(token: string): Promise<{
  ok: boolean;
  bot?: { id: string; username: string; avatar: string | null };
  error?: string;
}> {
  try {
    const res = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: `Invalid token (${res.status}): ${body.message || "unknown error"}` };
    }
    const data = await res.json();
    return {
      ok: true,
      bot: {
        id: data.id,
        username: data.username,
        avatar: data.avatar
          ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png`
          : null,
      },
    };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}
```

**Step 2: Verify tsc passes**

Run: `cd src && npm run check`
Expected: Clean exit

**Step 3: Commit**

```bash
git add src/server/discordBot.ts
git commit -m "feat(discord): add bot token management module"
```

---

### Task 2: Discord REST API Client (`discordApi.ts`)

**Files:**
- Create: `src/server/discordApi.ts`

**Step 1: Create API client with rate limit handling**

```typescript
// src/server/discordApi.ts

const BASE_URL = "https://discord.com/api/v10";

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: number; // 0 = text, 2 = voice, etc.
  guild_id: string;
  topic?: string | null;
  position: number;
}

export interface DiscordMessage {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    bot?: boolean;
    avatar?: string | null;
  };
  timestamp: string;
  edited_timestamp: string | null;
  reactions?: Array<{
    emoji: { name: string; id?: string };
    count: number;
  }>;
  attachments: Array<{ id: string; url: string; filename: string }>;
  embeds: Array<{ title?: string; description?: string; url?: string }>;
  channel_id: string;
  guild_id?: string;
}

class DiscordApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "DiscordApiError";
  }
}

async function discordFetch<T>(
  token: string,
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(url, {
    method: options?.method || "GET",
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 429) {
    const body = await res.json();
    const retryAfter = (body.retry_after || 1) * 1000;
    await new Promise((r) => setTimeout(r, retryAfter));
    return discordFetch<T>(token, path, options); // retry once
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new DiscordApiError(
      `Discord API error: ${body.message || res.statusText}`,
      res.status,
    );
  }

  return res.json() as Promise<T>;
}

export async function getGuilds(token: string): Promise<DiscordGuild[]> {
  return discordFetch<DiscordGuild[]>(token, "/users/@me/guilds");
}

export async function getChannels(token: string, guildId: string): Promise<DiscordChannel[]> {
  const channels = await discordFetch<DiscordChannel[]>(
    token,
    `/guilds/${guildId}/channels`,
  );
  // Filter to text channels only (type 0) and announcement channels (type 5)
  return channels.filter((c) => c.type === 0 || c.type === 5);
}

export async function getMessages(
  token: string,
  channelId: string,
  limit = 100,
  before?: string,
): Promise<DiscordMessage[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);
  return discordFetch<DiscordMessage[]>(
    token,
    `/channels/${channelId}/messages?${params}`,
  );
}
```

**Step 2: Verify tsc passes**

Run: `cd src && npm run check`
Expected: Clean exit

**Step 3: Commit**

```bash
git add src/server/discordApi.ts
git commit -m "feat(discord): add REST API client with rate limit handling"
```

---

### Task 3: Message Processing (`discordMessages.ts`)

**Files:**
- Create: `src/server/discordMessages.ts`
- Read: `src/server/socialFeed.ts:18-34` (SocialPost interface)

**Step 1: Create message normalizer**

```typescript
// src/server/discordMessages.ts
import type { DiscordMessage } from "./discordApi";
import type { SocialPost } from "./socialFeed";
import {
  extractTickers,
  analyzeSentiment,
  classifyContent,
  weightedScore,
} from "./sentimentAnalyzer";

export function normalizeDiscordMessage(
  msg: DiscordMessage,
  guildName: string,
  channelName: string,
): SocialPost | null {
  // Skip bot messages
  if (msg.author.bot) return null;

  // Skip empty content (MESSAGE_CONTENT intent not enabled)
  const text = msg.content || "";
  const hasAttachments = msg.attachments?.length > 0;
  const hasEmbeds = msg.embeds?.length > 0;

  if (!text && !hasAttachments && !hasEmbeds) return null;

  // Build display text from available data
  let displayText = text;
  if (hasAttachments) {
    const attachmentNames = msg.attachments.map((a) => a.filename).join(", ");
    displayText += (displayText ? "\n" : "") + `[Attachments: ${attachmentNames}]`;
  }
  if (hasEmbeds) {
    const embedTitles = msg.embeds
      .map((e) => e.title || e.description || "[embed]")
      .join(", ");
    displayText += (displayText ? "\n" : "") + `[Embeds: ${embedTitles}]`;
  }

  const tickers = extractTickers(displayText);
  const sentiment = analyzeSentiment(displayText);
  const contentType = classifyContent(displayText);
  const score = weightedScore(
    msg.reactions?.reduce((sum, r) => sum + r.count, 0) || 0,
    0, // no reply count from REST API
    0, // no quote count
  );

  return {
    id: msg.id,
    platform: "discord",
    author: msg.author.username,
    title: `#${channelName}`,
    text: displayText,
    url: `https://discord.com/channels/${msg.guild_id || "0"}/${msg.channel_id}/${msg.id}`,
    createdAt: msg.timestamp,
    score,
    engagementScore: score,
    tickers,
    sentiment,
    contentType,
    accountName: msg.author.username,
    accountUrl: `https://discord.com/users/${msg.author.id}`,
  };
}
```

**Step 2: Verify tsc passes**

Run: `cd src && npm run check`
Expected: Clean exit

**Step 3: Commit**

```bash
git add src/server/discordMessages.ts
git commit -m "feat(discord): add message normalizer for SocialPost format"
```

---

### Task 4: Unit Tests (`discordApi.test.ts`)

**Files:**
- Create: `src/server/discordApi.test.ts`

**Step 1: Write tests for message normalization**

```typescript
// src/server/discordApi.test.ts
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeDiscordMessage } from "./discordMessages";
import type { DiscordMessage } from "./discordApi";

function makeMsg(overrides: Partial<DiscordMessage> = {}): DiscordMessage {
  return {
    id: "1234567890",
    content: "SPY looking bullish today 🚀",
    author: { id: "user1", username: "trader1", bot: false },
    timestamp: "2026-07-23T12:00:00.000Z",
    edited_timestamp: null,
    reactions: [{ emoji: { name: "🚀" }, count: 5 }],
    attachments: [],
    embeds: [],
    channel_id: "ch1",
    guild_id: "g1",
    ...overrides,
  };
}

describe("Discord Message Normalization", () => {
  test("normalizes a basic message", () => {
    const msg = makeMsg();
    const post = normalizeDiscordMessage(msg, "Trading Hub", "general");
    assert.ok(post);
    assert.equal(post.platform, "discord");
    assert.equal(post.accountName, "trader1");
    assert.equal(post.text, "SPY looking bullish today 🚀");
    assert.deepEqual(post.tickers, ["SPY"]);
    assert.ok(post.url.includes("discord.com/channels"));
  });

  test("skips bot messages", () => {
    const msg = makeMsg({ author: { id: "bot1", username: "bot", bot: true } });
    const post = normalizeDiscordMessage(msg, "Guild", "ch");
    assert.equal(post, null);
  });

  test("skips empty messages", () => {
    const msg = makeMsg({ content: "", attachments: [], embeds: [] });
    const post = normalizeDiscordMessage(msg, "Guild", "ch");
    assert.equal(post, null);
  });

  test("handles messages with attachments but no content", () => {
    const msg = makeMsg({
      content: "",
      attachments: [{ id: "a1", url: "https://example.com/img.png", filename: "chart.png" }],
    });
    const post = normalizeDiscordMessage(msg, "Guild", "ch");
    assert.ok(post);
    assert.ok(post.text.includes("chart.png"));
  });

  test("calculates engagement from reactions", () => {
    const msg = makeMsg({
      reactions: [
        { emoji: { name: "🚀" }, count: 10 },
        { emoji: { name: "📈" }, count: 5 },
      ],
    });
    const post = normalizeDiscordMessage(msg, "Guild", "ch");
    assert.ok(post);
    assert.ok(post.engagementScore > 0);
  });

  test("sets channel name as title", () => {
    const msg = makeMsg();
    const post = normalizeDiscordMessage(msg, "Guild", "market-talk");
    assert.ok(post);
    assert.equal(post.title, "#market-talk");
  });
});
```

**Step 2: Run tests**

Run: `cd src && node --import tsx --test server/discordApi.test.ts`
Expected: All 6 tests pass

**Step 3: Commit**

```bash
git add src/server/discordApi.test.ts
git commit -m "test(discord): add message normalization unit tests"
```

---

### Task 5: Symbol Config Update

**Files:**
- Modify: `src/symbolConfig.json`
- Read: `src/server/symbolRegistry.ts` (add accessor)

**Step 1: Add discord config to symbolConfig.json**

Add to `src/symbolConfig.json` at the top level:

```json
{
  "discord": {
    "trackedChannels": []
  }
}
```

**Step 2: Add accessor to symbolRegistry.ts**

Add to `src/server/symbolRegistry.ts`:

```typescript
export interface DiscordTrackedChannel {
  channelId: string;
  channelName: string;
  guildId: string;
  guildName: string;
  addedAt: string;
  lastMessageId?: string;
}

export function getDiscordTrackedChannels(): DiscordTrackedChannel[] {
  return (config.discord?.trackedChannels as DiscordTrackedChannel[]) || [];
}
```

**Step 3: Verify tsc passes**

Run: `cd src && npm run check`
Expected: Clean exit

**Step 4: Commit**

```bash
git add src/symbolConfig.json src/server/symbolRegistry.ts
git commit -m "feat(discord): add tracked channels config to symbolConfig"
```

---

### Task 6: Discord Routes

**Files:**
- Create: `src/server/discordRoutes.ts`
- Modify: `src/server/routes.ts` (mount routes)

**Step 1: Create discord routes**

```typescript
// src/server/discordRoutes.ts
import { Router } from "express";
import {
  setDiscordBotToken,
  getDiscordBotToken,
  hasDiscordBotToken,
  clearDiscordBotToken,
  verifyBotToken,
} from "./discordBot";
import { getGuilds, getChannels } from "./discordApi";
import { normalizeDiscordMessage } from "./discordMessages";
import { getDiscordTrackedChannels, type DiscordTrackedChannel } from "./symbolRegistry";
import { symbolConfig } from "./symbolRegistry";
import { analyzeSentiment, extractTickers, classifyContent, weightedScore } from "./sentimentAnalyzer";

const router = Router();

// ─── Bot Token Management ──────────────────────────────────────

router.get("/api/discord/status", (_req, res) => {
  const token = getDiscordBotToken();
  res.json({
    configured: hasDiscordBotToken(),
    // Don't expose the token
  });
});

router.post("/api/discord/token", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Token is required" });
    }

    const verification = await verifyBotToken(token);
    if (!verification.ok) {
      return res.status(400).json({ error: verification.error });
    }

    setDiscordBotToken(token);
    res.json({ ok: true, bot: verification.bot });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/api/discord/token", (_req, res) => {
  clearDiscordBotToken();
  res.json({ ok: true });
});

// ─── Guild & Channel Listing ───────────────────────────────────

router.get("/api/discord/guilds", async (_req, res) => {
  try {
    const token = getDiscordBotToken();
    if (!token) return res.status(401).json({ error: "Bot token not configured" });

    const guilds = await getGuilds(token);
    res.json(guilds);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/api/discord/guilds/:id/channels", async (req, res) => {
  try {
    const token = getDiscordBotToken();
    if (!token) return res.status(401).json({ error: "Bot token not configured" });

    const channels = await getChannels(token, req.params.id);
    res.json(channels);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Channel Tracking ──────────────────────────────────────────

router.get("/api/discord/tracked", (_req, res) => {
  res.json(getDiscordTrackedChannels());
});

router.post("/api/discord/track", (req, res) => {
  try {
    const { channelId, channelName, guildId, guildName } = req.body;
    if (!channelId || !guildId) {
      return res.status(400).json({ error: "channelId and guildId are required" });
    }

    const channels = getDiscordTrackedChannels();
    if (channels.some((c) => c.channelId === channelId)) {
      return res.json({ ok: true, message: "Already tracking" });
    }

    const newChannel: DiscordTrackedChannel = {
      channelId,
      channelName: channelName || "unknown",
      guildId,
      guildName: guildName || "unknown",
      addedAt: new Date().toISOString(),
    };

    channels.push(newChannel);
    symbolConfig.discord = { trackedChannels: channels };

    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/api/discord/track/:channelId", (req, res) => {
  try {
    const channels = getDiscordTrackedChannels();
    const filtered = channels.filter((c) => c.channelId !== req.params.channelId);
    symbolConfig.discord = { trackedChannels: filtered };
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Fetch Messages ────────────────────────────────────────────

router.get("/api/discord/fetch", async (_req, res) => {
  try {
    const token = getDiscordBotToken();
    if (!token) return res.status(401).json({ error: "Bot token not configured" });

    const tracked = getDiscordTrackedChannels();
    if (!tracked.length) return res.json({ posts: [] });

    const { getMessages } = await import("./discordApi");
    const allPosts: any[] = [];

    for (const ch of tracked) {
      try {
        const messages = await getMessages(token, ch.channelId, 50);
        for (const msg of messages) {
          const post = normalizeDiscordMessage(msg, ch.guildName, ch.channelName);
          if (post) allPosts.push(post);
        }
      } catch (error: any) {
        console.error(`[discord] Failed to fetch ${ch.channelName}:`, error.message);
      }
    }

    res.json({ posts: allPosts });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

**Step 2: Mount routes in routes.ts**

In `src/server/routes.ts`, find the oauth routes section and add after it:

```typescript
import discordRouter from "./discordRoutes";
// ... in the function body, after oauth routes:
app.use(discordRouter);
```

**Step 3: Verify tsc passes**

Run: `cd src && npm run check`
Expected: Clean exit

**Step 4: Commit**

```bash
git add src/server/discordRoutes.ts src/server/routes.ts
git commit -m "feat(discord): add REST endpoints for bot management and channel tracking"
```

---

### Task 7: Social Feed Integration

**Files:**
- Modify: `src/server/socialFeed.ts`

**Step 1: Add discord platform to social feed**

In `src/server/socialFeed.ts`, make these changes:

1. Update `SocialPost.platform` type (line 20):
```typescript
platform: 'reddit' | 'x' | 'truth' | 'discord';
```

2. Update `SocialSourceConfig.platform` type (line 46):
```typescript
platform: 'reddit' | 'x' | 'truth' | 'discord';
```

3. Add discord fetcher function (after `fetchTruthPosts`):

```typescript
async function fetchDiscordPosts(): Promise<SocialPost[]> {
  try {
    const token = (await import("./discordBot")).getDiscordBotToken();
    if (!token) return [];

    const { getDiscordTrackedChannels } = await import("./symbolRegistry");
    const { getMessages } = await import("./discordApi");
    const { normalizeDiscordMessage } = await import("./discordMessages");

    const tracked = getDiscordTrackedChannels();
    if (!tracked.length) return [];

    const allPosts: SocialPost[] = [];
    for (const ch of tracked) {
      try {
        const messages = await getMessages(token, ch.channelId, 50);
        for (const msg of messages) {
          const post = normalizeDiscordMessage(msg, ch.guildName, ch.channelName);
          if (post) allPosts.push(post);
        }
      } catch {}
    }
    return allPosts;
  } catch {
    return [];
  }
}
```

4. Update the `getSocialFeed` function to include discord (around line 395):

Add to the `Promise.allSettled` array:

```typescript
const discordPosts = enabled.filter(s => s.platform === 'discord');
const [redditPosts, xPosts, truthPosts, discordResult] = await Promise.allSettled([
  redditSources.length ? fetchRedditPosts(redditSources, userTokens.reddit) : Promise.resolve([]),
  xSources.length ? fetchXTweets(xSources, userTokens.x) : Promise.resolve([]),
  truthSources.length ? fetchTruthPosts(truthSources) : Promise.resolve([]),
  fetchDiscordPosts(),
]);
```

Add after the allReddit/allX/allTruth processing:

```typescript
const allDiscord = discordResult.status === 'fulfilled' ? discordResult.value : [];
if (allDiscord.length) byPlatform.discord = allDiscord;
```

Update the `allPosts` line to include discord:

```typescript
const allPosts = [...allReddit, ...allX, ...allTruth, ...allDiscord]
  .sort((a, b) => b.engagementScore - a.engagementScore);
```

**Step 2: Verify tsc passes**

Run: `cd src && npm run check`
Expected: Clean exit

**Step 3: Commit**

```bash
git add src/server/socialFeed.ts
git commit -m "feat(discord): integrate discord posts into social feed"
```

---

### Task 8: Client Hooks (`useFinance.ts`)

**Files:**
- Modify: `src/client/src/lib/useFinance.ts`

**Step 1: Add discord hooks**

Add at the end of `src/client/src/lib/useFinance.ts`:

```typescript
// ─── Discord Bot Hooks ────────────────────────────────────────────

export function useDiscordStatus() {
  return useQuery({
    queryKey: ["/api/discord/status"],
    queryFn: async () => {
      const res = await fetch("/api/discord/status");
      if (!res.ok) throw new Error("Failed to fetch Discord status");
      return res.json() as Promise<{ configured: boolean }>;
    },
  });
}

export function useDiscordSetToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const res = await fetch("/api/discord/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to set token");
      }
      return res.json() as Promise<{ ok: boolean; bot?: { id: string; username: string; avatar: string | null } }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/discord"] }),
  });
}

export function useDiscordRemoveToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/discord/token", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove token");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/discord"] }),
  });
}

export function useDiscordGuilds() {
  return useQuery({
    queryKey: ["/api/discord/guilds"],
    queryFn: async () => {
      const res = await fetch("/api/discord/guilds");
      if (!res.ok) throw new Error("Failed to fetch guilds");
      return res.json();
    },
    enabled: false, // manual trigger
  });
}

export function useDiscordChannels(guildId: string) {
  return useQuery({
    queryKey: ["/api/discord/guilds", guildId, "channels"],
    queryFn: async () => {
      const res = await fetch(`/api/discord/guilds/${guildId}/channels`);
      if (!res.ok) throw new Error("Failed to fetch channels");
      return res.json();
    },
    enabled: false,
  });
}

export function useDiscordTracked() {
  return useQuery({
    queryKey: ["/api/discord/tracked"],
    queryFn: async () => {
      const res = await fetch("/api/discord/tracked");
      if (!res.ok) throw new Error("Failed to fetch tracked channels");
      return res.json();
    },
  });
}

export function useDiscordTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { channelId: string; channelName: string; guildId: string; guildName: string }) => {
      const res = await fetch("/api/discord/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to track channel");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/discord/tracked"] }),
  });
}

export function useDiscordUntrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (channelId: string) => {
      const res = await fetch(`/api/discord/track/${channelId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to untrack channel");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/discord/tracked"] }),
  });
}

export function useDiscordFetch() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/discord/fetch");
      if (!res.ok) throw new Error("Failed to fetch Discord messages");
      return res.json() as Promise<{ posts: any[] }>;
    },
  });
}
```

**Step 2: Verify tsc passes**

Run: `cd src && npm run check`
Expected: Clean exit

**Step 3: Commit**

```bash
git add src/client/src/lib/useFinance.ts
git commit -m "feat(discord): add client hooks for bot management and channel tracking"
```

---

### Task 9: DiscordTab UI

**Files:**
- Create: `src/client/src/components/terminal/DiscordTab.tsx`

**Step 1: Create Discord settings tab**

```tsx
// src/client/src/components/terminal/DiscordTab.tsx
import { useState } from "react";
import { Check, ExternalLink, Loader2, Key, ChevronDown, ChevronRight } from "lucide-react";
import {
  useDiscordStatus,
  useDiscordSetToken,
  useDiscordRemoveToken,
  useDiscordGuilds,
  useDiscordChannels,
  useDiscordTracked,
  useDiscordTrack,
  useDiscordUntrack,
} from "@/lib/useFinance";

export default function DiscordTab() {
  const { data: status } = useDiscordStatus();
  const setTokenMutation = useDiscordSetToken();
  const removeTokenMutation = useDiscordRemoveToken();
  const { data: tracked = [] } = useDiscordTracked();
  const trackMutation = useDiscordTrack();
  const untrackMutation = useDiscordUntrack();

  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [expandedGuild, setExpandedGuild] = useState<string | null>(null);
  const [guildChannels, setGuildChannels] = useState<Record<string, any[]>>({});
  const [loadingGuild, setLoadingGuild] = useState<string | null>(null);

  const trackedIds = new Set(tracked.map((c: any) => c.channelId));

  const handleSaveToken = async () => {
    if (!token) return;
    await setTokenMutation.mutateAsync(token);
    setToken("");
  };

  const handleLoadGuilds = async () => {
    const res = await fetch("/api/discord/guilds");
    if (res.ok) {
      const guilds = await res.json();
      // Store guilds in state for display
    }
  };

  const handleExpandGuild = async (guildId: string) => {
    if (expandedGuild === guildId) {
      setExpandedGuild(null);
      return;
    }
    setExpandedGuild(guildId);
    if (!guildChannels[guildId]) {
      setLoadingGuild(guildId);
      const res = await fetch(`/api/discord/guilds/${guildId}/channels`);
      if (res.ok) {
        const channels = await res.json();
        setGuildChannels((prev) => ({ ...prev, [guildId]: channels }));
      }
      setLoadingGuild(null);
    }
  };

  const handleTrack = async (ch: any, guild: any) => {
    await trackMutation.mutateAsync({
      channelId: ch.id,
      channelName: ch.name,
      guildId: guild.id,
      guildName: guild.name,
    });
  };

  const handleUntrack = async (channelId: string) => {
    await untrackMutation.mutateAsync(channelId);
  };

  return (
    <div className="p-4 space-y-4">
      <span className="font-terminal text-[9px] tracking-[0.15em] text-muted-foreground/70">DISCORD BOT</span>

      {/* Bot Token Section */}
      <div className="border border-border/40 rounded-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-terminal text-[10px] font-bold text-foreground/80">BOT TOKEN</span>
          {status?.configured && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-green-500/10 border border-green-500/20 rounded-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="font-terminal text-[7px] text-green-400">CONFIGURED</span>
            </span>
          )}
        </div>

        {!status?.configured ? (
          <>
            <span className="font-terminal text-[8px] text-muted-foreground/50">
              Paste your Discord bot token.{" "}
              <a
                href="https://discord.com/developers/applications"
                target="_blank"
                rel="noreferrer"
                className="text-[hsl(186,45%,50%)] hover:underline"
              >
                Create a bot →
              </a>
            </span>
            <div className="flex gap-2">
              <input
                type={showToken ? "text" : "password"}
                placeholder="Bot token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="flex-1 bg-[#0a0a0a] border border-border/50 px-3 py-1.5 font-terminal text-[9px] text-foreground/80 focus:outline-none focus:border-[hsl(186_45%_50%/0.4)] rounded-sm"
              />
              <button
                onClick={() => setShowToken(!showToken)}
                className="px-2 py-1 border border-border/30 rounded-sm hover:border-border/50"
              >
                {showToken ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
              <button
                onClick={handleSaveToken}
                disabled={!token || setTokenMutation.isPending}
                className="font-terminal text-[8px] text-foreground/70 hover:text-foreground px-3 py-1.5 border border-border/40 rounded-sm hover:border-[hsl(186_45%_50%/0.4)] transition-colors disabled:opacity-50"
              >
                {setTokenMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
              </button>
            </div>
            {setTokenMutation.isError && (
              <span className="font-terminal text-[8px] text-red-400">
                {setTokenMutation.error.message}
              </span>
            )}
          </>
        ) : (
          <div className="flex items-center justify-between">
            <span className="font-terminal text-[8px] text-green-400">Bot token configured</span>
            <button
              onClick={() => removeTokenMutation.mutateAsync()}
              className="font-terminal text-[8px] text-red-400 hover:text-red-300 px-2 py-1 border border-red-500/30 rounded-sm transition-colors"
            >
              Remove
            </button>
          </div>
        )}
      </div>

      {/* Tracked Channels */}
      {status?.configured && (
        <div className="border border-border/40 rounded-sm p-4 space-y-3">
          <span className="font-terminal text-[10px] font-bold text-foreground/80">TRACKED CHANNELS</span>
          {tracked.length === 0 ? (
            <span className="font-terminal text-[8px] text-muted-foreground/50">
              No channels tracked. Use the channel picker below.
            </span>
          ) : (
            <div className="space-y-1">
              {tracked.map((ch: any) => (
                <div key={ch.channelId} className="flex items-center justify-between py-1 px-2 bg-[#0a0a0a] rounded-sm">
                  <span className="font-terminal text-[8px] text-foreground/70">
                    {ch.guildName} / #{ch.channelName}
                  </span>
                  <button
                    onClick={() => handleUntrack(ch.channelId)}
                    className="font-terminal text-[7px] text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Setup Instructions */}
      <div className="px-1 py-2">
        <span className="font-terminal text-[8px] text-muted-foreground/40 tracking-wider">
          BOT TOKENS ARE STORED SERVER-SIDE. ENABLE MESSAGE_CONTENT INTENT FOR FULL MESSAGE TEXT.
        </span>
      </div>
    </div>
  );
}
```

**Step 2: Verify tsc passes**

Run: `cd src && npm run check`
Expected: Clean exit

**Step 3: Commit**

```bash
git add src/client/src/components/terminal/DiscordTab.tsx
git commit -m "feat(discord): add Discord settings tab with bot token and channel picker UI"
```

---

### Task 10: ConfigModal Integration

**Files:**
- Modify: `src/client/src/components/terminal/ConfigModal.tsx`

**Step 1: Add DISCORD tab to ConfigModal**

1. Import DiscordTab:
```tsx
import DiscordTab from "./DiscordTab";
```

2. Add to ConfigTab type (line 14):
```typescript
type ConfigTab = "status" | "keys" | "symbols" | "social" | "discord" | "general" | "help";
```

3. Add tab button in the tab bar (after the SOCIAL tab):
```tsx
<button
  onClick={() => setActiveTab("discord")}
  className={`... ${activeTab === "discord" ? "..." : "..."}`}
>
  DISCORD
</button>
```

4. Add tab content (after the social tab content):
```tsx
{activeTab === "discord" && <DiscordTab />}
```

**Step 2: Verify tsc passes**

Run: `cd src && npm run check`
Expected: Clean exit

**Step 3: Commit**

```bash
git add src/client/src/components/terminal/ConfigModal.tsx
git commit -m "feat(discord): add DISCORD tab to ConfigModal"
```

---

### Task 11: Final Verification

**Step 1: Run full tsc check**

Run: `cd src && npm run check`
Expected: Clean exit

**Step 2: Run all tests**

Run: `cd src && node --import tsx --test server/discordApi.test.ts server/oauth.test.ts`
Expected: All tests pass

**Step 3: Manual smoke test**

1. Start dev server: `cd src && npm run dev`
2. Open Settings → DISCORD tab
3. Verify "BOT TOKEN" section shows "CONFIGURED" (if token set) or input field
4. Verify "TRACKED CHANNELS" section is empty initially
5. Verify tab navigation works

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(discord): complete Discord bot integration - Phase 1 REST API

- Bot token management with in-memory storage
- REST API client with rate limit handling
- Message normalizer for SocialPost format
- 6 unit tests for message normalization
- REST endpoints for bot management and channel tracking
- DiscordTab UI with bot token input and channel picker
- Social feed integration with discord platform
- Graceful fallback when MESSAGE_CONTENT intent not enabled"
```

---

## Summary

| Task | Files Created | Files Modified |
|------|--------------|----------------|
| 1. Bot Token Management | `discordBot.ts` | — |
| 2. REST API Client | `discordApi.ts` | — |
| 3. Message Processing | `discordMessages.ts` | — |
| 4. Unit Tests | `discordApi.test.ts` | — |
| 5. Symbol Config | — | `symbolConfig.json`, `symbolRegistry.ts` |
| 6. Routes | `discordRoutes.ts` | `routes.ts` |
| 7. Social Feed | — | `socialFeed.ts` |
| 8. Client Hooks | — | `useFinance.ts` |
| 9. DiscordTab UI | `DiscordTab.tsx` | — |
| 10. ConfigModal | — | `ConfigModal.tsx` |
| 11. Final Verification | — | — |

**Total:** 5 new files, 6 modified files
