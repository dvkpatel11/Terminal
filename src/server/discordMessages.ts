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
  if (msg.author.bot) return null;

  const text = msg.content || "";
  const hasAttachments = msg.attachments?.length > 0;
  const hasEmbeds = msg.embeds?.length > 0;

  if (!text && !hasAttachments && !hasEmbeds) return null;

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
  const contentType = classifyContent("", displayText);
  const engagementCount = msg.reactions?.reduce((sum, r) => sum + r.count, 0) || 0;
  const score = weightedScore(engagementCount, 0, "discord", contentType);

  return {
    id: msg.id,
    platform: "discord" as any,
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
