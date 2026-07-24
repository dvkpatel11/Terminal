import { resilientFetch } from "./providerUtils";

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
    const res = await resilientFetch(
      { name: "discord", retry: { maxAttempts: 2, baseDelayMs: 1000 }, circuitBreaker: { threshold: 5, cooldownMs: 60_000 } },
      "https://discord.com/api/v10/users/@me",
      { headers: { Authorization: `Bot ${token}` } },
    );
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
