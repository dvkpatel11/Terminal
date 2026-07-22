import { useState, useEffect, useMemo } from "react";
import { X, Plus, Trash2, TestTube, RotateCcw } from "lucide-react";

const STORAGE_KEY = "terminal-social-sources";

export interface SocialSourceConfig {
  platform: "reddit" | "x" | "truth";
  identifier: string;
  displayName: string;
  url: string;
  enabled: boolean;
}

const PLATFORM_BADGES: Record<string, { bg: string; text: string }> = {
  reddit: { bg: "bg-orange-500/20", text: "text-orange-400" },
  x: { bg: "bg-blue-500/20", text: "text-blue-400" },
  truth: { bg: "bg-gray-500/20", text: "text-gray-400" },
};

const DEFAULTS: SocialSourceConfig[] = [
  { platform: "reddit", identifier: "wallstreetbets", displayName: "r/wallstreetbets", url: "https://reddit.com/r/wallstreetbets", enabled: true },
  { platform: "reddit", identifier: "stocks", displayName: "r/stocks", url: "https://reddit.com/r/stocks", enabled: true },
  { platform: "reddit", identifier: "CryptoCurrency", displayName: "r/CryptoCurrency", url: "https://reddit.com/r/CryptoCurrency", enabled: true },
];

function parseSocialUrl(input: string): SocialSourceConfig | null {
  const trimmed = input.trim();

  const redditMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?reddit\.com\/r\/([a-zA-Z0-9_]+)/i)
    || trimmed.match(/^r\/([a-zA-Z0-9_]+)$/i);
  if (redditMatch) {
    const sub = redditMatch[1];
    return { platform: "reddit", identifier: sub, displayName: `r/${sub}`, url: `https://reddit.com/r/${sub}`, enabled: true };
  }

  const xMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]+)/i)
    || trimmed.match(/^@([a-zA-Z0-9_]+)$/);
  if (xMatch) {
    const handle = xMatch[1];
    return { platform: "x", identifier: handle, displayName: `@${handle}`, url: `https://x.com/${handle}`, enabled: true };
  }

  const truthMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?truthsocial\.com\/@([a-zA-Z0-9_]+)/i);
  if (truthMatch) {
    const handle = truthMatch[1];
    return { platform: "truth", identifier: handle, displayName: `@${handle}`, url: `https://truthsocial.com/@${handle}`, enabled: true };
  }

  return null;
}

function loadSources(): SocialSourceConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULTS;
}

function saveSources(sources: SocialSourceConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
}

interface Props {
  onClose: () => void;
}

export default function SourceConfigModal({ onClose }: Props) {
  const [sources, setSources] = useState<SocialSourceConfig[]>(loadSources);
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<SocialSourceConfig | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; detail: string }>>({});

  useEffect(() => {
    setPreview(parseSocialUrl(input));
  }, [input]);

  const handleAdd = () => {
    if (!preview) return;
    const exists = sources.some(s => s.platform === preview.platform && s.identifier === preview.identifier);
    if (exists) return;
    const next = [...sources, preview];
    setSources(next);
    saveSources(next);
    setInput("");
  };

  const handleRemove = (idx: number) => {
    const next = sources.filter((_, i) => i !== idx);
    setSources(next);
    saveSources(next);
  };

  const handleTest = async (source: SocialSourceConfig) => {
    const key = `${source.platform}:${source.identifier}`;
    setTestResults(prev => ({ ...prev, [key]: { ok: false, detail: "Testing..." } }));
    try {
      const res = await fetch(`/api/finance/social/sources`);
      const data = await res.json();
      const platformOk = data[source.platform]?.configured ?? (source.platform === "truth");
      setTestResults(prev => ({
        ...prev,
        [key]: { ok: platformOk, detail: platformOk ? "Connected" : "API key not configured" },
      }));
    } catch {
      setTestResults(prev => ({ ...prev, [key]: { ok: false, detail: "Request failed" } }));
    }
  };

  const handleReset = () => {
    setSources(DEFAULTS);
    saveSources(DEFAULTS);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-[#0a0a0a] border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="panel-label">CONFIGURE SOCIAL SOURCES</div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-border">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-2">
            ADD SOURCE (paste any URL)
          </div>
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="https://reddit.com/r/wallstreetbets"
              className="flex-1 bg-white/[0.04] border border-border/60 rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-primary/50"
            />
            <button
              onClick={handleAdd}
              disabled={!preview}
              className="px-3 py-1.5 rounded bg-primary/20 text-primary text-xs font-bold hover:bg-primary/30 disabled:opacity-30"
            >
              <Plus size={14} />
            </button>
          </div>
          {preview && (
            <div className="mt-2 text-[10px] text-muted-foreground">
              Detected: <span className="text-foreground font-bold uppercase">{preview.platform}</span> — {preview.displayName}
            </div>
          )}
          <div className="mt-2 text-[10px] text-muted-foreground/50">
            Supported: reddit.com/r/&#123;sub&#125; · x.com/&#123;handle&#125; · twitter.com/&#123;handle&#125; · @&#123;handle&#125; · truthsocial.com/@&#123;handle&#125;
          </div>
        </div>

        <div className="px-4 py-3 max-h-60 overflow-y-auto scrollbar-thin">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/50">ACTIVE SOURCES</div>
            <button onClick={handleReset} className="text-[10px] text-muted-foreground/50 hover:text-foreground flex items-center gap-1">
              <RotateCcw size={10} /> RESET
            </button>
          </div>
          {sources.length === 0 ? (
            <div className="text-xs text-muted-foreground/50 py-4 text-center">No sources configured</div>
          ) : (
            <div className="space-y-1">
              {sources.map((source, idx) => {
                const badge = PLATFORM_BADGES[source.platform];
                const testKey = `${source.platform}:${source.identifier}`;
                const result = testResults[testKey];
                return (
                  <div key={idx} className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/[0.02] border border-border/40">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${badge.bg} ${badge.text}`}>
                      {source.platform}
                    </span>
                    <span className="text-xs flex-1 truncate">{source.displayName}</span>
                    {result && (
                      <span className={`text-[10px] ${result.ok ? "text-green-400" : "text-red-400"}`}>
                        {result.detail}
                      </span>
                    )}
                    <button onClick={() => handleTest(source)} className="text-muted-foreground/40 hover:text-primary">
                      <TestTube size={12} />
                    </button>
                    <button onClick={() => handleRemove(idx)} className="text-muted-foreground/40 hover:text-red-400">
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground/40">
          {sources.length} source{sources.length !== 1 ? "s" : ""} configured · Changes apply on next refresh
        </div>
      </div>
    </div>
  );
}
