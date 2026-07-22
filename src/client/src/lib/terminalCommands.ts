import type { ViewMode } from "./terminalTypes";
import { VIEW_ALIASES } from "./panelRegistry";

export interface ParsedTerminalCommand {
  raw: string;
  symbol?: string;
  view: ViewMode;
}

export function getCommandAliasView(token: string | undefined): ViewMode | null {
  if (!token) return null;
  return VIEW_ALIASES[token.toUpperCase()] ?? null;
}

export function parseTerminalCommand(input: string): ParsedTerminalCommand | null {
  const raw = input.trim().toUpperCase().replace(/\s+/g, " ");
  if (!raw) return null;

  const tokens = raw.split(" ");

  // Single token: could be a command (CC, INTEL) or a symbol (AAPL)
  if (tokens.length === 1) {
    const view = getCommandAliasView(tokens[0]);
    if (view) return { raw, view };
    return { raw, symbol: tokens[0], view: "intel" };
  }

  // Two tokens: try SYMBOL CODE, then CODE SYMBOL
  const [first, second] = tokens;

  // Try SYMBOL CODE (e.g., "AAPL GP")
  const secondView = getCommandAliasView(second);
  if (secondView) {
    return { raw, symbol: first, view: secondView };
  }

  // Try CODE SYMBOL (e.g., "GP AAPL")
  const firstView = getCommandAliasView(first);
  if (firstView) {
    return { raw, symbol: second, view: firstView };
  }

  // Default: treat first as symbol
  return { raw, symbol: first, view: "intel" };
}
