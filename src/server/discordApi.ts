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
  type: number;
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
    return discordFetch<T>(token, path, options);
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
