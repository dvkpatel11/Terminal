/**
 * Centralized prompt configuration loader.
 *
 * Reads prompts.json at startup and provides:
 *  - buildSystemPrompt(skill, context?) — constructs the full system prompt
 *  - getSkillConfig(skillId) — returns skill metadata (label, defaultPrompts)
 *  - getViewLabel(viewMode) — returns human-readable label for a ViewMode
 *
 * Hot-reload: call reloadPrompts() after editing prompts.json.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─── Types ─────────────────────────────────────────────────────────────────

interface SkillConfig {
  label: string;
  description: string;
  systemPrompt: string;
  defaultPrompts: string[];
}

interface PromptsConfig {
  version: number;
  base: string;
  contextTemplate: string;
  skills: Record<string, SkillConfig>;
  viewLabels: Record<string, string>;
}

// ─── Loader ────────────────────────────────────────────────────────────────

let _config: PromptsConfig | null = null;
let _dbSkills: Record<string, SkillConfig> = {};

function loadConfig(): PromptsConfig {
  if (_config) return _config;
  const configPath = resolve(process.cwd(), "prompts.json");
  const raw = readFileSync(configPath, "utf-8");
  _config = JSON.parse(raw) as PromptsConfig;
  return _config;
}

/** Reload prompts from disk (call after external edits). */
export function reloadPrompts(): void {
  _config = null;
  loadConfig();
}

/** Inject DB-backed skills (merged on top of file-based skills). */
export function setDbSkills(skills: Record<string, SkillConfig>): void {
  _dbSkills = skills;
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface PromptContext {
  symbol?: string;
  view?: string;
  quote?: { price: number; changePercent: number; volume: number };
  technicals?: { rsi14: number | null; macd: number | null; vwap: number | null; support: number | null; resistance: number | null };
}

/**
 * Build the full system prompt for a given skill and optional runtime context.
 *
 * @param skillId  Skill identifier (e.g. "analyst", "macro")
 * @param context  Optional runtime context to inject (symbol, view, live data)
 */
export function buildSystemPrompt(skillId?: string, context?: PromptContext): string {
  const config = loadConfig();
  let prompt = config.base;

  // Append skill-specific instructions (DB skills override file-based)
  if (skillId) {
    const skill = _dbSkills[skillId] ?? config.skills[skillId];
    if (skill) {
      prompt += skill.systemPrompt;
    }
  }

  // Inject runtime context if provided
  if (context && (context.symbol || context.view)) {
    let ctxBlock = config.contextTemplate;

    // Simple Handlebars-like {{#if x}}...{{/if}} substitution
    ctxBlock = renderTemplate(ctxBlock, {
      symbol: context.symbol ?? "",
      view: context.view ?? "",
      viewLabel: context.view ? (config.viewLabels[context.view] ?? context.view) : "",
      quote: context.quote
        ? { price: String(context.quote.price), changePercent: String(context.quote.changePercent.toFixed(2)), volume: String(context.quote.volume.toLocaleString()) }
        : null,
      technicals: context.technicals
        ? {
            rsi14: context.technicals.rsi14 != null ? String(context.technicals.rsi14.toFixed(1)) : "N/A",
            macd: context.technicals.macd != null ? String(context.technicals.macd.toFixed(3)) : "N/A",
            vwap: context.technicals.vwap != null ? String(context.technicals.vwap.toFixed(2)) : "N/A",
            support: context.technicals.support != null ? String(context.technicals.support.toFixed(2)) : "N/A",
            resistance: context.technicals.resistance != null ? String(context.technicals.resistance.toFixed(2)) : "N/A",
          }
        : null,
    });

    prompt += ctxBlock;
  }

  return prompt;
}

/**
 * Get skill metadata — DB skills override file-based skills.
 */
export function getSkillConfig(skillId: string): SkillConfig | undefined {
  return _dbSkills[skillId] ?? loadConfig().skills[skillId];
}

/**
 * Get all skill IDs and their labels — merges file-based + DB skills (DB wins on collision).
 */
export function getAllSkills(): Array<{ id: string; label: string; description: string; defaultPrompts: string[] }> {
  const config = loadConfig();
  const merged = new Map<string, { id: string; label: string; description: string; defaultPrompts: string[] }>();

  // File-based skills as base
  for (const [id, skill] of Object.entries(config.skills)) {
    merged.set(id, { id, label: skill.label, description: skill.description, defaultPrompts: skill.defaultPrompts });
  }

  // DB skills override
  for (const [id, skill] of Object.entries(_dbSkills)) {
    merged.set(id, {
      id,
      label: skill.label,
      description: skill.description,
      defaultPrompts: skill.defaultPrompts,
    });
  }

  return Array.from(merged.values());
}

/**
 * Get human-readable label for a ViewMode.
 */
export function getViewLabel(viewMode: string): string {
  return loadConfig().viewLabels[viewMode] ?? viewMode;
}

// ─── Template Engine ───────────────────────────────────────────────────────

interface TemplateVars {
  [key: string]: string | { [key: string]: string } | null;
}

/**
 * Minimal Handlebars-like template renderer.
 * Supports: {{var}}, {{#if var}}...{{/if}}, nested object access via dot notation.
 */
function renderTemplate(template: string, vars: TemplateVars): string {
  // Process {{#if var}}...{{/if}} blocks
  let result = template.replace(
    /\{\{#if\s+(\w+(?:\.\w+)*)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, varPath: string, content: string) => {
      const val = resolveVar(vars, varPath);
      if (val && val !== "" && val !== "null") {
        return content;
      }
      return "";
    },
  );

  // Process {{var}} interpolations
  result = result.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, varPath: string) => {
    const val = resolveVar(vars, varPath);
    return val ?? "";
  });

  return result.trim();
}

function resolveVar(vars: TemplateVars, path: string): string | null {
  const parts = path.split(".");
  let current: any = vars;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return null;
    current = current[part];
  }
  return current != null ? String(current) : null;
}
