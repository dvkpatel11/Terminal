import { useState, useEffect, useCallback } from "react";
import { X, Settings, Key, Activity, Check, AlertTriangle, RefreshCw, Eye, EyeOff, ExternalLink, HelpCircle, Plus, Trash2 } from "lucide-react";
import { PANEL_REGISTRY, PANELS_BY_CATEGORY, CATEGORY_ORDER, type PanelCategory } from "@/lib/panelRegistry";
import type { ViewMode } from "@/lib/terminalTypes";

interface Props {
  open: boolean;
  onClose: () => void;
  onNav: (v: ViewMode) => void;
}

type ConfigTab = "status" | "keys" | "general" | "help";

interface ProviderStatus {
  name: string;
  category: string;
  ok: boolean;
  latency: number;
  lastCheck: string;
  error?: string;
}

interface SourceTestResult {
  ok: boolean;
  statusCode: number;
  body: string;
}

interface NvidiaKeyStatus {
  configured: boolean;
  valid: boolean;
  testing: boolean;
}

const NVIDIA_KEY_STORAGE = "blmtrm_nvidia_key";
const DEFAULT_SYMBOL_STORAGE = "blmtrm_default_symbol";

const PROVIDERS = [
  { name: "Yahoo Finance", category: "MARKET DATA", testUrl: "/api/finance/tick?symbols=SPY" },
  { name: "FRED (Federal Reserve)", category: "ECONOMIC DATA", testUrl: "/api/finance/yield-curve" },
  { name: "CBOE (VIX)", category: "VOLATILITY DATA", testUrl: "/api/finance/vix-term" },
  { name: "NVIDIA API", category: "AI AGENT", testUrl: null },
];

const NEWS_SOURCES = [
  { name: "CNBC", category: "NEWS FEED", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
  { name: "CoinDesk", category: "NEWS FEED", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "Yahoo Finance", category: "NEWS FEED", url: "https://finance.yahoo.com/news/rssindex" },
  { name: "Google News", category: "NEWS FEED", url: "https://news.google.com/rss/search?q=stock+market+OR+federal+reserve+OR+earnings+OR+inflation+OR+bitcoin+when:2d" },
];

const SENTIMENT_SOURCES = [
  { name: "r/wallstreetbets", category: "SOCIAL", subreddit: "wallstreetbets" },
  { name: "r/stocks", category: "SOCIAL", subreddit: "stocks" },
  { name: "r/CryptoCurrency", category: "SOCIAL", subreddit: "CryptoCurrency" },
  { name: "r/Investing", category: "SOCIAL", subreddit: "investing" },
];

interface SocialSource {
  platform: "reddit" | "x" | "truth" | "discord";
  identifier: string;
  displayName: string;
  enabled: boolean;
  testing?: boolean;
  lastTest?: { ok: boolean; detail: string };
}

const SOCIAL_STORAGE_KEY = "terminal-social-sources";

const PLATFORM_CONFIG: Record<string, { label: string; placeholder: string; color: string; icon: string }> = {
  x: { label: "X / TWITTER", placeholder: "@handle or x.com/handle", color: "text-blue-400", icon: "𝕏" },
  reddit: { label: "REDDIT", placeholder: "r/subreddit or reddit.com/r/subreddit", color: "text-orange-400", icon: "r/" },
  truth: { label: "TRUTH SOCIAL", placeholder: "@handle or truthsocial.com/@handle", color: "text-gray-300", icon: "T" },
  discord: { label: "DISCORD", placeholder: "server/channel or discord.gg/invite", color: "text-indigo-400", icon: "D" },
};

function loadNvidiaKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(NVIDIA_KEY_STORAGE) ?? "";
}

function saveNvidiaKey(key: string) {
  if (typeof window === "undefined") return;
  if (key) {
    localStorage.setItem(NVIDIA_KEY_STORAGE, key);
  } else {
    localStorage.removeItem(NVIDIA_KEY_STORAGE);
  }
}

function loadDefaultSymbol(): string {
  if (typeof window === "undefined") return "AAPL";
  return localStorage.getItem(DEFAULT_SYMBOL_STORAGE) ?? "AAPL";
}

function saveDefaultSymbol(sym: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEFAULT_SYMBOL_STORAGE, sym.toUpperCase());
}

export default function ConfigModal({ open, onClose, onNav }: Props) {
  const [activeTab, setActiveTab] = useState<ConfigTab>("status");
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [testingAll, setTestingAll] = useState(false);
  const [nvidiaKey, setNvidiaKey] = useState(loadNvidiaKey);
  const [nvidiaKeyVisible, setNvidiaKeyVisible] = useState(false);
  const [nvidiaStatus, setNvidiaStatus] = useState<NvidiaKeyStatus>({ configured: !!loadNvidiaKey(), valid: false, testing: false });
  const [defaultSymbol, setDefaultSymbol] = useState(loadDefaultSymbol);

  // News source test state
  const [newsTestResults, setNewsTestResults] = useState<Record<string, { loading: boolean; result: SourceTestResult | null }>>({});

  // Sentiment source test state
  const [sentimentTestResults, setSentimentTestResults] = useState<Record<string, { loading: boolean; result: SourceTestResult | null }>>({});

  // Social source config state
  const [socialSources, setSocialSources] = useState<SocialSource[]>(() => {
    try {
      const raw = localStorage.getItem(SOCIAL_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [
      { platform: "reddit", identifier: "wallstreetbets", displayName: "r/wallstreetbets", enabled: true },
      { platform: "reddit", identifier: "stocks", displayName: "r/stocks", enabled: true },
      { platform: "reddit", identifier: "CryptoCurrency", displayName: "r/CryptoCurrency", enabled: true },
    ];
  });
  const [socialInput, setSocialInput] = useState("");
  const [socialPlatform, setSocialPlatform] = useState<"x" | "reddit" | "truth" | "discord">("x");

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const testProvider = async (provider: typeof PROVIDERS[number]): Promise<ProviderStatus> => {
    const start = Date.now();
    if (!provider.testUrl) {
      return {
        name: provider.name,
        category: provider.category,
        ok: nvidiaStatus.configured,
        latency: 0,
        lastCheck: new Date().toISOString(),
        error: nvidiaStatus.configured ? undefined : "No API key configured",
      };
    }
    try {
      const res = await fetch(provider.testUrl, { signal: AbortSignal.timeout(8000) });
      const latency = Date.now() - start;
      return {
        name: provider.name,
        category: provider.category,
        ok: res.ok,
        latency,
        lastCheck: new Date().toISOString(),
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (e) {
      return {
        name: provider.name,
        category: provider.category,
        ok: false,
        latency: Date.now() - start,
        lastCheck: new Date().toISOString(),
        error: e instanceof Error ? e.message : "Connection failed",
      };
    }
  };

  const testAllProviders = async () => {
    setTestingAll(true);
    const results = await Promise.all(PROVIDERS.map(testProvider));
    setProviders(results);
    setTestingAll(false);
  };

  useEffect(() => {
    if (open && activeTab === "status") {
      testAllProviders();
    }
  }, [open, activeTab]);

  const testNewsSource = async (source: typeof NEWS_SOURCES[number]) => {
    setNewsTestResults((prev) => ({ ...prev, [source.name]: { loading: true, result: null } }));
    try {
      const res = await fetch(`/api/finance/news/source-test?url=${encodeURIComponent(source.url)}`, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) {
        const errorBody = await res.text();
        setNewsTestResults((prev) => ({
          ...prev,
          [source.name]: { loading: false, result: { ok: false, statusCode: res.status, body: errorBody } },
        }));
      } else {
        const data = await res.json();
        setNewsTestResults((prev) => ({ ...prev, [source.name]: { loading: false, result: data } }));
      }
    } catch (e) {
      setNewsTestResults((prev) => ({
        ...prev,
        [source.name]: { loading: false, result: { ok: false, statusCode: 0, body: e instanceof Error ? e.message : String(e) } },
      }));
    }
  };

  const testSentimentSource = async (source: typeof SENTIMENT_SOURCES[number]) => {
    setSentimentTestResults((prev) => ({ ...prev, [source.subreddit]: { loading: true, result: null } }));
    try {
      const res = await fetch(`/api/finance/sentiment/source-test?subreddit=${encodeURIComponent(source.subreddit)}`, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) {
        const errorBody = await res.text();
        setSentimentTestResults((prev) => ({
          ...prev,
          [source.subreddit]: { loading: false, result: { ok: false, statusCode: res.status, body: errorBody } },
        }));
      } else {
        const data = await res.json();
        setSentimentTestResults((prev) => ({ ...prev, [source.subreddit]: { loading: false, result: data } }));
      }
    } catch (e) {
      setSentimentTestResults((prev) => ({
        ...prev,
        [source.subreddit]: { loading: false, result: { ok: false, statusCode: 0, body: e instanceof Error ? e.message : String(e) } },
      }));
    }
  };

  const testAllNews = async () => {
    await Promise.all(NEWS_SOURCES.map(testNewsSource));
  };

  const testAllSentiment = async () => {
    await Promise.all(SENTIMENT_SOURCES.map(testSentimentSource));
  };

  const saveSocialSources = useCallback((sources: SocialSource[]) => {
    setSocialSources(sources);
    localStorage.setItem(SOCIAL_STORAGE_KEY, JSON.stringify(sources));
  }, []);

  const addSocialSource = useCallback(() => {
    if (!socialInput.trim()) return;
    const platform = PLATFORM_CONFIG[socialPlatform];
    const identifier = socialInput.trim();
    const exists = socialSources.some(s => s.platform === socialPlatform && s.identifier === identifier);
    if (exists) return;
    const newSource: SocialSource = {
      platform: socialPlatform,
      identifier,
      displayName: socialPlatform === "reddit" && !identifier.startsWith("r/") ? `r/${identifier}` : identifier,
      enabled: true,
    };
    saveSocialSources([...socialSources, newSource]);
    setSocialInput("");
  }, [socialInput, socialPlatform, socialSources, saveSocialSources]);

  const removeSocialSource = useCallback((idx: number) => {
    saveSocialSources(socialSources.filter((_, i) => i !== idx));
  }, [socialSources, saveSocialSources]);

  const testSocialSource = useCallback(async (source: SocialSource) => {
    const key = `${source.platform}:${source.identifier}`;
    setSocialSources(prev => prev.map(s =>
      s.platform === source.platform && s.identifier === source.identifier
        ? { ...s, testing: true }
        : s
    ));
    try {
      const res = await fetch(`/api/finance/social/sources`);
      const data = await res.json();
      const platformOk = data[source.platform]?.configured ?? (source.platform === "truth");
      setSocialSources(prev => prev.map(s =>
        s.platform === source.platform && s.identifier === source.identifier
          ? { ...s, testing: false, lastTest: { ok: platformOk, detail: platformOk ? "Connected" : "API key not configured" } }
          : s
      ));
    } catch {
      setSocialSources(prev => prev.map(s =>
        s.platform === source.platform && s.identifier === source.identifier
          ? { ...s, testing: false, lastTest: { ok: false, detail: "Request failed" } }
          : s
      ));
    }
  }, []);

  const testNvidiaKey = async () => {
    setNvidiaStatus((s) => ({ ...s, testing: true }));
    try {
      const keyToTest = nvidiaKey || loadNvidiaKey();
      const res = await fetch("/api/config/test-nvidia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyToTest }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      setNvidiaStatus({ configured: true, valid: data.ok, testing: false });
    } catch {
      setNvidiaStatus({ configured: true, valid: false, testing: false });
    }
  };

  const saveNvidiaKeyAndTest = () => {
    saveNvidiaKey(nvidiaKey);
    setNvidiaStatus({ configured: !!nvidiaKey, valid: false, testing: false });
    if (nvidiaKey) testNvidiaKey();
  };

  if (!open) return null;

  const tabs: { id: ConfigTab; label: string; icon: typeof Settings }[] = [
    { id: "status", label: "API STATUS", icon: Activity },
    { id: "keys", label: "API KEYS", icon: Key },
    { id: "general", label: "GENERAL", icon: Settings },
    { id: "help", label: "HELP", icon: HelpCircle },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl bg-[#0d0d0d] border border-[hsl(186_45%_50%/0.4)] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-[hsl(186_45%_55%)]" />
            <span className="font-terminal text-[11px] tracking-[0.15em] text-foreground/90">SYSTEM CONFIGURATION</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 px-4 border-b border-border/60 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 font-terminal text-[9px] tracking-[0.12em] border-b-[1.5px] transition-all duration-150 ${
                activeTab === tab.id
                  ? "text-[hsl(186_45%_60%)] border-b-[hsl(186_45%_50%)] bg-[hsl(186_45%_50%/0.06)]"
                  : "text-muted-foreground/60 border-b-transparent hover:text-muted-foreground hover:bg-white/[0.02]"
              }`}
            >
              <tab.icon className="w-3 h-3" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {activeTab === "status" && (
            <div className="p-4 space-y-5">
              {/* Data Providers */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="font-terminal text-[9px] tracking-[0.15em] text-muted-foreground/70">DATA PROVIDERS</span>
                  <button
                    onClick={testAllProviders}
                    disabled={testingAll}
                    className="flex items-center gap-1.5 px-2.5 py-1 font-terminal text-[8px] tracking-wider text-[hsl(186_45%_60%)] hover:bg-[hsl(186_45%_50%/0.08)] border border-[hsl(186_45%_50%/0.2)] rounded-sm transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${testingAll ? "animate-spin" : ""}`} />
                    <span>{testingAll ? "TESTING..." : "TEST ALL"}</span>
                  </button>
                </div>

                <div className="space-y-1">
                  {providers.map((p) => (
                    <div key={p.name} className="flex items-center gap-3 px-3 py-2 border border-border/40 rounded-sm hover:bg-white/[0.02] transition-colors">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${p.ok ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]" : "bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.4)]"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-terminal text-[10px] font-bold text-foreground/80">{p.name}</span>
                          <span className="font-terminal text-[7px] tracking-wider text-muted-foreground/50">{p.category}</span>
                        </div>
                        {p.error && (
                          <span className="font-terminal text-[8px] text-red-400/70">{p.error}</span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {p.latency > 0 && (
                          <span className={`font-terminal text-[9px] tabular-nums ${p.latency < 500 ? "text-green-400/70" : p.latency < 2000 ? "text-yellow-400/70" : "text-red-400/70"}`}>
                            {p.latency}ms
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {providers.length === 0 && !testingAll && (
                    <div className="py-6 text-center font-terminal text-[10px] text-muted-foreground/50 tracking-wider">
                      CLICK "TEST ALL" TO CHECK PROVIDER STATUS
                    </div>
                  )}
                </div>
              </div>

              {/* News Feeds */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="font-terminal text-[9px] tracking-[0.15em] text-muted-foreground/70">NEWS FEEDS</span>
                  <button
                    onClick={testAllNews}
                    className="flex items-center gap-1.5 px-2.5 py-1 font-terminal text-[8px] tracking-wider text-[hsl(186_45%_60%)] hover:bg-[hsl(186_45%_50%/0.08)] border border-[hsl(186_45%_50%/0.2)] rounded-sm transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>TEST ALL</span>
                  </button>
                </div>

                <div className="space-y-1">
                  {NEWS_SOURCES.map((source) => {
                    const testState = newsTestResults[source.name];
                    return (
                      <div key={source.name} className="border border-border/40 rounded-sm hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-center gap-3 px-3 py-2">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${
                            testState?.result
                              ? testState.result.ok
                                ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]"
                                : "bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.4)]"
                              : "bg-muted-foreground/30"
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-terminal text-[10px] font-bold text-foreground/80">{source.name}</span>
                              <span className="font-terminal text-[7px] tracking-wider text-muted-foreground/50">{source.category}</span>
                            </div>
                            {testState?.result && !testState.result.ok && (
                              <span className="font-terminal text-[8px] text-red-400/70">
                                {testState.result.statusCode > 0 ? `HTTP ${testState.result.statusCode}` : "UNREACHABLE"}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => testNewsSource(source)}
                            disabled={testState?.loading}
                            className="px-2 py-1 font-terminal text-[8px] tracking-wider text-[hsl(186_45%_60%)] hover:bg-[hsl(186_45%_50%/0.08)] border border-[hsl(186_45%_50%/0.2)] rounded-sm transition-colors disabled:opacity-50 shrink-0"
                          >
                            {testState?.loading ? "TESTING..." : "TEST"}
                          </button>
                        </div>
                        {testState?.result && testState.result.body && (
                          <div className="px-3 pb-2">
                            <pre className="text-[8px] leading-relaxed text-foreground/60 whitespace-pre-wrap break-all bg-[#080808] border border-border/30 rounded-sm p-2 max-h-24 overflow-y-auto scrollbar-thin">
                              {testState.result.body.slice(0, 500)}
                              {testState.result.body.length > 500 && "\n... (truncated)"}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sentiment Sources */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="font-terminal text-[9px] tracking-[0.15em] text-muted-foreground/70">SENTIMENT SOURCES</span>
                  <button
                    onClick={testAllSentiment}
                    className="flex items-center gap-1.5 px-2.5 py-1 font-terminal text-[8px] tracking-wider text-[hsl(186_45%_60%)] hover:bg-[hsl(186_45%_50%/0.08)] border border-[hsl(186_45%_50%/0.2)] rounded-sm transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>TEST ALL</span>
                  </button>
                </div>

                <div className="space-y-1">
                  {SENTIMENT_SOURCES.map((source) => {
                    const testState = sentimentTestResults[source.subreddit];
                    return (
                      <div key={source.subreddit} className="border border-border/40 rounded-sm hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-center gap-3 px-3 py-2">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${
                            testState?.result
                              ? testState.result.ok
                                ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]"
                                : "bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.4)]"
                              : "bg-muted-foreground/30"
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-terminal text-[10px] font-bold text-foreground/80">{source.name}</span>
                              <span className="font-terminal text-[7px] tracking-wider text-muted-foreground/50">{source.category}</span>
                            </div>
                            {testState?.result && !testState.result.ok && (
                              <span className="font-terminal text-[8px] text-red-400/70">
                                {testState.result.statusCode > 0 ? `HTTP ${testState.result.statusCode}` : "UNREACHABLE"}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => testSentimentSource(source)}
                            disabled={testState?.loading}
                            className="px-2 py-1 font-terminal text-[8px] tracking-wider text-[hsl(186_45%_60%)] hover:bg-[hsl(186_45%_50%/0.08)] border border-[hsl(186_45%_50%/0.2)] rounded-sm transition-colors disabled:opacity-50 shrink-0"
                          >
                            {testState?.loading ? "TESTING..." : "TEST"}
                          </button>
                        </div>
                        {testState?.result && testState.result.body && (
                          <div className="px-3 pb-2">
                            <pre className="text-[8px] leading-relaxed text-foreground/60 whitespace-pre-wrap break-all bg-[#080808] border border-border/30 rounded-sm p-2 max-h-24 overflow-y-auto scrollbar-thin">
                              {testState.result.body.slice(0, 500)}
                              {testState.result.body.length > 500 && "\n... (truncated)"}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Social Sources */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="font-terminal text-[9px] tracking-[0.15em] text-muted-foreground/70">SOCIAL SOURCES</span>
                </div>

                {/* Platform Connect Buttons */}
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {Object.entries(PLATFORM_CONFIG).map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => setSocialPlatform(key as "x" | "reddit" | "truth" | "discord")}
                      className={`flex items-center justify-center gap-1.5 px-2 py-2 border rounded-sm transition-all ${
                        socialPlatform === key
                          ? "border-[hsl(186_45%_50%/0.4)] bg-[hsl(186_45%_50%/0.08)]"
                          : "border-border/40 hover:bg-white/[0.02]"
                      }`}
                    >
                      <span className={`font-terminal text-[10px] font-bold ${config.color}`}>{config.icon}</span>
                      <span className="font-terminal text-[8px] tracking-wider text-foreground/70">{config.label}</span>
                    </button>
                  ))}
                </div>

                {/* Add Source Input */}
                <div className="flex gap-2 mb-3">
                  <input
                    value={socialInput}
                    onChange={(e) => setSocialInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addSocialSource()}
                    placeholder={PLATFORM_CONFIG[socialPlatform].placeholder}
                    className="flex-1 bg-[#0a0a0a] border border-border/50 px-3 py-1.5 font-terminal text-[10px] text-foreground/80 placeholder:text-muted-foreground/30 focus:outline-none focus:border-[hsl(186_45%_50%/0.4)] rounded-sm"
                  />
                  <button
                    onClick={addSocialSource}
                    disabled={!socialInput.trim()}
                    className="px-2.5 py-1.5 font-terminal text-[8px] tracking-wider text-[hsl(186_45%_60%)] hover:bg-[hsl(186_45%_50%/0.08)] border border-[hsl(186_45%_50%/0.2)] rounded-sm transition-colors disabled:opacity-30"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                {/* Tracked Accounts List */}
                <div className="space-y-1">
                  {socialSources.length === 0 ? (
                    <div className="py-4 text-center font-terminal text-[10px] text-muted-foreground/50 tracking-wider">
                      NO SOURCES CONFIGURED
                    </div>
                  ) : (
                    socialSources.map((source, idx) => {
                      const config = PLATFORM_CONFIG[source.platform];
                      return (
                        <div key={idx} className="flex items-center gap-2 px-2 py-1.5 border border-border/40 rounded-sm hover:bg-white/[0.02] transition-colors">
                          <span className={`w-5 h-5 flex items-center justify-center rounded text-[9px] font-bold ${config.color} bg-white/[0.04]`}>
                            {config.icon}
                          </span>
                          <span className="font-terminal text-[10px] text-foreground/80 flex-1 truncate">{source.displayName}</span>
                          {source.lastTest && (
                            <span className={`font-terminal text-[8px] ${source.lastTest.ok ? "text-green-400/70" : "text-red-400/70"}`}>
                              {source.lastTest.detail}
                            </span>
                          )}
                          <button
                            onClick={() => testSocialSource(source)}
                            disabled={source.testing}
                            className="px-1.5 py-0.5 font-terminal text-[7px] tracking-wider text-[hsl(186_45%_60%)] hover:bg-[hsl(186_45%_50%/0.08)] border border-[hsl(186_45%_50%/0.2)] rounded-sm transition-colors disabled:opacity-50"
                          >
                            {source.testing ? "..." : "TEST"}
                          </button>
                          <button
                            onClick={() => removeSocialSource(idx)}
                            className="text-muted-foreground/30 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "keys" && (
            <div className="p-4 space-y-4">
              {/* NVIDIA API Key */}
              <div className="border border-border/40 rounded-sm p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-terminal text-[10px] font-bold text-foreground/80">NVIDIA API KEY</span>
                    <span className="font-terminal text-[7px] tracking-wider text-muted-foreground/50">AI AGENT</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {nvidiaStatus.configured && (
                      <div className={`flex items-center gap-1 px-1.5 py-0.5 ${nvidiaStatus.valid ? "text-green-400/80 bg-green-500/10" : "text-yellow-400/80 bg-yellow-500/10"}`}>
                        {nvidiaStatus.valid ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        <span className="font-terminal text-[8px]">{nvidiaStatus.valid ? "VALID" : "UNVERIFIED"}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <input
                      type={nvidiaKeyVisible ? "text" : "password"}
                      value={nvidiaKey}
                      onChange={(e) => setNvidiaKey(e.target.value)}
                      placeholder="nvapi-..."
                      className="w-full bg-[#0a0a0a] border border-border/50 px-3 py-1.5 font-mono text-[10px] text-foreground/80 placeholder:text-muted-foreground/30 focus:outline-none focus:border-[hsl(186_45%_50%/0.4)] rounded-sm"
                    />
                    <button
                      onClick={() => setNvidiaKeyVisible(!nvidiaKeyVisible)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground"
                    >
                      {nvidiaKeyVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </div>
                  <button
                    onClick={saveNvidiaKeyAndTest}
                    className="px-2.5 py-1.5 font-terminal text-[8px] tracking-wider text-[hsl(186_45%_60%)] hover:bg-[hsl(186_45%_50%/0.08)] border border-[hsl(186_45%_50%/0.2)] rounded-sm transition-colors shrink-0"
                  >
                    SAVE & TEST
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <a
                    href="https://build.nvidia.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 font-terminal text-[8px] text-[hsl(186_45%_55%)] hover:text-[hsl(186_45%_70%)] transition-colors"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                    <span>GET API KEY FROM NVIDIA</span>
                  </a>
                </div>
                {nvidiaStatus.testing && (
                  <div className="mt-2 font-terminal text-[8px] text-muted-foreground/50 animate-pulse">TESTING CONNECTION...</div>
                )}
              </div>

              <div className="px-1 py-2">
                <span className="font-terminal text-[8px] text-muted-foreground/40 tracking-wider">
                  KEYS ARE STORED IN BROWSER LOCALSTORAGE AND NEVER SENT TO THIRD-PARTY SERVERS.
                </span>
              </div>
            </div>
          )}

          {activeTab === "general" && (
            <div className="p-4 space-y-4">
              <div className="border border-border/40 rounded-sm p-3">
                <div className="mb-2">
                  <span className="font-terminal text-[10px] font-bold text-foreground/80">DEFAULT SYMBOL</span>
                  <span className="font-terminal text-[7px] tracking-wider text-muted-foreground/50 ml-2">WATCHLIST FIRST ITEM</span>
                </div>
                <input
                  type="text"
                  value={defaultSymbol}
                  onChange={(e) => setDefaultSymbol(e.target.value.toUpperCase())}
                  onBlur={() => saveDefaultSymbol(defaultSymbol)}
                  className="w-full max-w-[200px] bg-[#0a0a0a] border border-border/50 px-3 py-1.5 font-terminal text-[10px] text-foreground/80 focus:outline-none focus:border-[hsl(186_45%_50%/0.4)] rounded-sm"
                />
              </div>

              <div className="border border-border/40 rounded-sm p-3">
                <div className="mb-2">
                  <span className="font-terminal text-[10px] font-bold text-foreground/80">KEYBOARD SHORTCUTS</span>
                </div>
                <div className="space-y-1.5">
                  {[
                    { keys: "Ctrl + Space", action: "Command Palette" },
                    { keys: "Ctrl + ,", action: "Open Settings" },
                    { keys: "F1", action: "Alerts Panel" },
                    { keys: "F2", action: "AI Agent" },
                    { keys: "Escape", action: "Close Modal" },
                  ].map((shortcut) => (
                    <div key={shortcut.keys} className="flex items-center justify-between">
                      <span className="font-terminal text-[9px] text-muted-foreground/60">{shortcut.action}</span>
                      <kbd className="font-mono text-[8px] text-foreground/60 bg-[#111] border border-border/40 px-1.5 py-0.5 rounded-sm">{shortcut.keys}</kbd>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-1 py-2">
                <span className="font-terminal text-[8px] text-muted-foreground/40 tracking-wider">
                  BLMTRM TERMINAL v1.0 — BUILT 2026
                </span>
              </div>
            </div>
          )}

          {activeTab === "help" && (
            <div className="p-4 space-y-4">
              <div>
                <span className="font-terminal text-[9px] tracking-[0.15em] text-muted-foreground/70">FUNCTION DIRECTORY</span>
                <p className="font-terminal text-[8px] text-muted-foreground/40 mt-1">Click a function to navigate</p>
              </div>

              {CATEGORY_ORDER.map((cat) => {
                const views: ViewMode[] = PANELS_BY_CATEGORY[cat];
                const catLabel: Record<PanelCategory, string> = {
                  market: "MARKETS",
                  macro: "MACRO",
                  intel: "INTEL & SOCIAL",
                  symbol: "SECURITY",
                  system: "SYSTEM",
                };
                return (
                  <div key={cat}>
                    <span className="font-terminal text-[8px] tracking-[0.15em] text-[hsl(186_45%_55%)] mb-1.5 block">{catLabel[cat]}</span>
                    <div className="grid grid-cols-2 gap-1">
                      {views.map((view) => {
                        const p = PANEL_REGISTRY[view];
                        if (!p) return null;
                        const Icon = p.icon;
                        return (
                          <button
                            key={view}
                            onClick={() => { onClose(); onNav(view); }}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-white/[0.04] transition-colors text-left group"
                          >
                            <Icon className="w-3 h-3 text-muted-foreground/50 group-hover:text-[hsl(186_45%_60%)] shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-terminal text-[9px] font-bold text-foreground/80">{p.code}</span>
                                <span className="font-terminal text-[8px] text-muted-foreground/50 truncate">{p.label}</span>
                              </div>
                            </div>
                            <kbd className="font-mono text-[7px] text-muted-foreground/40 border border-border/30 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">{p.kbd}</kbd>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="border border-border/40 rounded-sm p-3">
                <span className="font-terminal text-[8px] tracking-[0.15em] text-muted-foreground/70 block mb-2">COMMAND SYNTAX</span>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  {[
                    { cmd: "AAPL INTEL", desc: "Open INTEL for AAPL" },
                    { cmd: "AAPL GP", desc: "Open chart for AAPL" },
                    { cmd: "INTEL", desc: "Open INTEL (last symbol)" },
                    { cmd: "CC", desc: "Market overview" },
                    { cmd: "AAPL", desc: "Open INTEL for AAPL" },
                    { cmd: "/", desc: "Open command bar" },
                  ].map((item) => (
                    <div key={item.cmd} className="flex items-center gap-2">
                      <span className="font-terminal text-[9px] text-foreground/70">{item.cmd}</span>
                      <span className="font-terminal text-[8px] text-muted-foreground/40">{item.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-border/40 rounded-sm p-3">
                <span className="font-terminal text-[8px] tracking-[0.15em] text-muted-foreground/70 block mb-2">KEYBOARD SHORTCUTS</span>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  {[
                    { keys: "Ctrl + Space", action: "Command Palette" },
                    { keys: "Ctrl + ,", action: "Open Settings" },
                    { keys: "Esc", action: "Close Modal" },
                    { keys: "F1-F12", action: "Quick function keys" },
                  ].map((shortcut) => (
                    <div key={shortcut.keys} className="flex items-center justify-between">
                      <span className="font-terminal text-[9px] text-muted-foreground/50">{shortcut.action}</span>
                      <kbd className="font-mono text-[8px] text-foreground/50 bg-[#111] border border-border/40 px-1.5 py-0.5 rounded-sm">{shortcut.keys}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
