export type ThreatLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function sentimentColor(sentiment?: string): string {
  switch (sentiment) {
    case "positive":
      return "text-up";
    case "negative":
      return "text-down";
    default:
      return "text-cyan";
  }
}

export function sentimentBorderColor(sentiment?: string): string {
  switch (sentiment) {
    case "positive":
      return "border-l-up";
    case "negative":
      return "border-l-down";
    default:
      return "border-l-cyan";
  }
}

const THREAT_PATTERNS: Array<{ level: ThreatLevel; pattern: RegExp }> = [
  {
    level: "CRITICAL",
    pattern: /\b(recession|crash|collapse|default|war|emergency|circuit breaker|flash crash)\b/i,
  },
  {
    level: "HIGH",
    pattern: /\b(rate hike|rate cut|earnings miss|downgrade|layoff|tariff|sanction|bankrupt)\b/i,
  },
  {
    level: "MEDIUM",
    pattern: /\b(inflation|gdp|jobs report|fed speech|fomc|cpi|ppi|retail sales)\b/i,
  },
  {
    level: "LOW",
    pattern: /\b(upgrade|beat|record|expansion|rally|surge|soar|bull)\b/i,
  },
];

export function classifyThreat(text: string): ThreatLevel {
  for (const { level, pattern } of THREAT_PATTERNS) {
    if (pattern.test(text)) return level;
  }
  return "INFO";
}
