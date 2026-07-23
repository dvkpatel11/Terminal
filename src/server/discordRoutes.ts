import { Router } from "express";
import {
  setDiscordBotToken,
  getDiscordBotToken,
  hasDiscordBotToken,
  clearDiscordBotToken,
  verifyBotToken,
} from "./discordBot";
import { getGuilds, getChannels, getMessages } from "./discordApi";
import { normalizeDiscordMessage } from "./discordMessages";
import { getDiscordTrackedChannels, getSymbolConfig, type DiscordTrackedChannel } from "./symbolRegistry";

const router = Router();

// ─── Bot Token Management ──────────────────────────────────────

router.get("/api/discord/status", (_req, res) => {
  res.json({ configured: hasDiscordBotToken() });
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
    const config = getSymbolConfig();
    (config as any).discord = { trackedChannels: channels };

    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/api/discord/track/:channelId", (req, res) => {
  try {
    const channels = getDiscordTrackedChannels();
    const filtered = channels.filter((c) => c.channelId !== req.params.channelId);
    const config = getSymbolConfig();
    (config as any).discord = { trackedChannels: filtered };
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
