import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Bot, Send, Trash2, Zap, ChevronDown, Crosshair, Settings, Plus, X, Save } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ViewMode } from "@/lib/terminalTypes";
import { useQuote, useTechnicalIndicators } from "@/lib/useFinance";

interface Skill {
  id: string;
  label: string;
  description: string;
  defaultPrompts: string[];
}

const FALLBACK_SKILLS: Skill[] = [
  { id: "analyst", label: "EQUITY ANALYST", description: "Deep equity analysis", defaultPrompts: [
    "Analyze AAPL: bull vs bear case with fair value estimate",
    "Compare NVDA vs AMD on valuation and growth metrics",
    "What are the key risks for TSLA in Q2 2026?",
    "Score MSFT on RSI, MACD, and Bollinger Bands"
  ]},
];

const VIEW_LABELS: Record<string, string> = {
  market: "Market Overview", chart: "Chart", news: "News Feed", agent: "AI Agent",
  screener: "Screener", watchlist: "Watchlist", alerts: "Alerts", economics: "Economics",
  portfolio: "Portfolio", intel: "Intel Dashboard", options: "Options Chain",
  sentiment: "Sentiment", optflow: "Options Flow", onchain: "On-Chain",
  social: "Social Feed",
  fa: "Financials", dvd: "Dividends", key: "Key Ratios", ee: "Estimates",
  profile: "Company Profile", thesis: "AI Thesis", crypto: "Crypto",
};

interface Props {
  onSymbol: (sym: string) => void;
  symbol?: string;
  view?: ViewMode;
}

function MessageBubble({ msg }: { msg: { role: string; content: string } }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`max-w-[85%] ${isUser ? "order-2" : "order-1"}`}>
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1">
            <Bot className="w-3 h-3 text-[hsl(186_45%_55%)]" />
            <span className="font-terminal text-data-xs text-[hsl(186_45%_55%)] tracking-widest">BLMTRM AI</span>
          </div>
        )}
        <div className={`px-4 py-3 ${
          isUser
            ? "bg-[hsl(186_45%_50%/0.15)] border border-[hsl(186_45%_50%/0.3)] text-foreground"
            : "bg-[#0d0d0d] border border-border text-foreground"
        }`}>
          <div className="font-terminal text-xs leading-relaxed whitespace-pre-wrap break-words">
            {msg.content}
          </div>
        </div>
        {isUser && (
          <div className="flex justify-end mt-0.5">
            <span className="font-terminal text-data-2xs text-muted-foreground">YOU</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AgentPanel({ onSymbol, symbol, view }: Props) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeSkill, setActiveSkill] = useState("analyst");
  const [skillDropdownOpen, setSkillDropdownOpen] = useState(false);
  const [showSkillEditor, setShowSkillEditor] = useState(false);
  const [editingSkill, setEditingSkill] = useState<{ id?: number; skillId: string; label: string; description: string; systemPrompt: string; defaultPrompts: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  // Fetch live context for the active symbol
  const { data: quote } = useQuote(symbol ?? "");
  const { data: technicals } = useTechnicalIndicators(symbol ?? "");

  const { data: serverSkills } = useQuery<Skill[]>({
    queryKey: ["/api/chat/skills"],
    queryFn: async () => {
      const res = await fetch("/api/chat/skills");
      return res.json();
    },
    staleTime: 300_000,
  });

  // Raw DB skills for editor (includes id, systemPrompt)
  const { data: dbSkills = [] } = useQuery<any[]>({
    queryKey: ["/api/chat/skills/all"],
    queryFn: async () => {
      const res = await fetch("/api/chat/skills/all");
      return res.json();
    },
    staleTime: 300_000,
  });

  // Merge: server skills enriched with dbId/systemPrompt for editor
  const skills = (serverSkills ?? FALLBACK_SKILLS).map(s => {
    const db = dbSkills.find((d: any) => d.skillId === s.id);
    return { ...s, dbId: db?.id, systemPrompt: db?.systemPrompt ?? "" };
  });
  const currentSkill = skills.find(s => s.id === activeSkill) ?? skills[0];

  const { data: messages = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/chat"],
    queryFn: async () => {
      const res = await fetch("/api/chat");
      return res.json();
    },
  });

  const clearMut = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/chat");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/chat"] }),
  });

  // Skill CRUD mutations
  const saveSkillMut = useMutation({
    mutationFn: async (skill: { id?: number; skillId: string; label: string; description: string; systemPrompt: string; defaultPrompts: string }) => {
      const body = { ...skill, defaultPrompts: skill.defaultPrompts };
      if (skill.id) {
        const res = await fetch(`/api/chat/skills/${skill.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error("Failed to update skill");
        return res.json();
      }
      const res = await fetch("/api/chat/skills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed to create skill");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/chat/skills"] });
      setEditingSkill(null);
      setShowSkillEditor(false);
    },
  });

  const deleteSkillMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/chat/skills/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete skill");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/chat/skills"] }),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (!skillDropdownOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) setSkillDropdownOpen(false);
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, [skillDropdownOpen]);

  const sendMessage = async (msg: string) => {
    if (!msg.trim() || isStreaming) return;
    setInput("");
    setIsStreaming(true);
    setStreaming("");

    qc.setQueryData(["/api/chat"], (old: any[] = []) => [
      ...old,
      { id: Date.now(), role: "user", content: msg, createdAt: new Date().toISOString() },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          skill: activeSkill,
          symbol: symbol ?? undefined,
          view: view ?? undefined,
          quote: quote ? { price: quote.price, changePercent: quote.changePercent, volume: quote.volume } : undefined,
          technicals: technicals ? { rsi14: technicals.rsi14 ?? null, macd: technicals.macd ?? null, vwap: technicals.vwap ?? null, support: technicals.support ?? null, resistance: technicals.resistance ?? null } : undefined,
        }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                fullText += data.text;
                setStreaming(fullText);
              }
              if (data.done) {
                setStreaming("");
                setIsStreaming(false);
                qc.invalidateQueries({ queryKey: ["/api/chat"] });
              }
            } catch {}
          }
        }
      }
    } catch {
      setIsStreaming(false);
      setStreaming("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#050505]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-[#070707] shrink-0">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-[hsl(186_45%_55%)]" />
          <span className="panel-label">BLMTRM AI AGENT</span>
          <span className="font-terminal text-data-2xs text-muted-foreground border border-border px-1.5 py-0.5">MINIMAX M3</span>
          {symbol && (
            <span className="flex items-center gap-1 font-terminal text-data-xs text-[hsl(186_45%_55%)] bg-[hsl(186_45%_50%/0.1)] border border-[hsl(186_45%_50%/0.2)] px-1.5 py-0.5">
              <Crosshair size={9} />
              {symbol}
              {view && view !== "agent" && (
                <span className="text-muted-foreground/50 ml-1">· {VIEW_LABELS[view] ?? view}</span>
              )}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Skill selector */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setSkillDropdownOpen(!skillDropdownOpen)}
              className="flex items-center gap-1.5 px-2 py-1 font-terminal text-data-xs tracking-wider text-[hsl(186_45%_55%)] bg-[hsl(186_45%_50%/0.08)] border border-[hsl(186_45%_50%/0.2)] hover:bg-[hsl(186_45%_50%/0.15)] transition-colors"
            >
              <span>{currentSkill?.label ?? "SELECT SKILL"}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${skillDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {skillDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-[220px] bg-[#0c0c0c] border border-border/70 shadow-[0_8px_32px_rgba(0,0,0,0.6)] z-50">
                {skills.map((skill) => (
                  <button
                    key={skill.id}
                    onClick={() => { setActiveSkill(skill.id); setSkillDropdownOpen(false); }}
                    className={`w-full text-left px-3 py-2 font-terminal text-data-sm transition-colors ${
                      skill.id === activeSkill
                        ? "text-[hsl(186_45%_60%)] bg-[hsl(186_45%_50%/0.1)]"
                        : "text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="font-bold tracking-wider">{skill.label}</div>
                    <div className="text-[9px] text-muted-foreground/50 mt-0.5">{skill.description}</div>
                  </button>
                ))}
                <div className="border-t border-border/50">
                  <button
                    onClick={() => { setShowSkillEditor(!showSkillEditor); setSkillDropdownOpen(false); }}
                    className="w-full text-left px-3 py-2 font-terminal text-data-sm text-muted-foreground/60 hover:text-[hsl(186_45%_55%)] hover:bg-white/[0.03] flex items-center gap-1.5"
                  >
                    <Settings size={10} /> MANAGE SKILLS
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => clearMut.mutate()}
            className="flex items-center gap-1.5 font-terminal text-data-xs text-muted-foreground hover:text-[hsl(0_80%_60%)] transition-colors"
            data-testid="clear-chat"
          >
            <Trash2 className="w-3 h-3" /> CLEAR
          </button>
        </div>
      </div>

      {/* Skill Editor (collapsible) */}
      {showSkillEditor && (
        <div className="border-b border-border bg-[#080808] px-4 py-3 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <span className="font-terminal text-data-xs tracking-widest text-[hsl(186_45%_55%)]">SKILL EDITOR</span>
            <div className="flex items-center gap-2">
              <button onClick={() => { setEditingSkill({ skillId: "", label: "", description: "", systemPrompt: "", defaultPrompts: "" }); }} className="flex items-center gap-1 font-terminal text-data-xs text-[hsl(186_45%_55%)] hover:text-foreground">
                <Plus size={10} /> NEW
              </button>
              <button onClick={() => { setShowSkillEditor(false); setEditingSkill(null); }} className="text-muted-foreground hover:text-foreground"><X size={12} /></button>
            </div>
          </div>

          {/* Skill list */}
          {!editingSkill && (
            <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
              {skills.map(s => (
                <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/[0.03] group">
                  <span className="font-terminal text-data-sm flex-1 truncate">{s.label}</span>
                  <button onClick={() => setEditingSkill({ id: (s as any).dbId, skillId: s.id, label: s.label, description: s.description, systemPrompt: (s as any).systemPrompt ?? "", defaultPrompts: JSON.stringify(s.defaultPrompts ?? []) })} className="opacity-0 group-hover:opacity-100 font-terminal text-data-xs text-muted-foreground hover:text-[hsl(186_45%_55%)]">EDIT</button>
                  {(s as any).dbId && <button onClick={() => deleteSkillMut.mutate((s as any).dbId)} className="opacity-0 group-hover:opacity-100 font-terminal text-data-xs text-muted-foreground hover:text-red-400">DEL</button>}
                </div>
              ))}
            </div>
          )}

          {/* Skill edit form */}
          {editingSkill && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input value={editingSkill.skillId} onChange={e => setEditingSkill({ ...editingSkill, skillId: e.target.value })} placeholder="ID (e.g. my_strategy)" className="flex-1 bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-data-sm focus:outline-none" disabled={!!editingSkill.id} />
                <input value={editingSkill.label} onChange={e => setEditingSkill({ ...editingSkill, label: e.target.value })} placeholder="DISPLAY LABEL" className="flex-1 bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-data-sm focus:outline-none" />
              </div>
              <input value={editingSkill.description} onChange={e => setEditingSkill({ ...editingSkill, description: e.target.value })} placeholder="Short description..." className="w-full bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-data-sm focus:outline-none" />
              <textarea value={editingSkill.systemPrompt} onChange={e => setEditingSkill({ ...editingSkill, systemPrompt: e.target.value })} placeholder="System prompt instructions..." rows={4} className="w-full bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-data-sm focus:outline-none resize-none" />
              <input value={editingSkill.defaultPrompts} onChange={e => setEditingSkill({ ...editingSkill, defaultPrompts: e.target.value })} placeholder='["Prompt 1", "Prompt 2"]' className="w-full bg-[#0d0d0d] border border-border px-2 py-1 font-terminal text-data-sm focus:outline-none" />
              <div className="flex items-center gap-2">
                <button onClick={() => saveSkillMut.mutate(editingSkill)} className="flex items-center gap-1 px-2 py-1 bg-[hsl(186_45%_50%/0.15)] border border-[hsl(186_45%_50%/0.4)] font-terminal text-data-sm text-[hsl(186_45%_55%)] hover:bg-[hsl(186_45%_50%/0.25)]">
                  <Save size={10} /> SAVE
                </button>
                <button onClick={() => setEditingSkill(null)} className="px-2 py-1 border border-border font-terminal text-data-sm text-muted-foreground hover:text-foreground">CANCEL</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4">
        {isLoading ? (
          <div className="space-y-4">
            {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-16 bg-border" />)}
          </div>
        ) : messages.length === 0 && !streaming ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="flex flex-col items-center gap-3">
              <Bot className="w-12 h-12 text-[hsl(186_45%_50%/0.3)]" />
              <div className="font-terminal text-sm text-muted-foreground text-center">
                AUTONOMOUS FINANCIAL INTELLIGENCE
              </div>
              <div className="font-terminal text-data-sm text-muted-foreground/60 text-center max-w-sm">
                Ask about markets, analyze stocks, get macro insights, or discuss trading strategies.
              </div>
              {symbol && (
                <div className="font-terminal text-data-sm text-[hsl(186_45%_55%)] flex items-center gap-1">
                  <Crosshair size={10} />
                  Context: {symbol} · {VIEW_LABELS[view ?? ""] ?? "No panel"}
                </div>
              )}
              <div className="font-terminal text-data-xs text-[hsl(186_45%_55%)] tracking-wider">
                SKILL: {currentSkill?.label}
              </div>
            </div>

            {/* Quick prompts */}
            <div className="grid grid-cols-1 gap-2 w-full max-w-md">
              {currentSkill?.defaultPrompts.map((p, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(p)}
                  className="text-left px-3 py-2 border border-border hover:border-[hsl(186_45%_50%/0.5)] hover:bg-[hsl(186_45%_50%/0.08)] font-terminal text-data-sm text-muted-foreground hover:text-foreground transition-colors"
                  data-testid={`prompt-${i}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m: any) => <MessageBubble key={m.id} msg={m} />)}
            {streaming && (
              <div className="flex justify-start mb-4">
                <div className="max-w-[85%]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Bot className="w-3 h-3 text-[hsl(186_45%_55%)]" />
                    <span className="font-terminal text-data-xs text-[hsl(186_45%_55%)] tracking-widest">BLMTRM AI</span>
                    <span className="font-terminal text-data-2xs text-muted-foreground animate-pulse">▌</span>
                  </div>
                  <div className="bg-[#0d0d0d] border border-border px-4 py-3">
                    <div className="font-terminal text-xs leading-relaxed whitespace-pre-wrap">{streaming}</div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border bg-[#070707] p-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <span className="font-terminal text-data-sm text-[hsl(186_45%_55%)] shrink-0">&gt;</span>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={symbol ? `ASK ABOUT ${symbol}...` : "ASK ABOUT MARKETS, STOCKS, MACRO..."}
            disabled={isStreaming}
            className="flex-1 bg-transparent font-terminal text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50"
            data-testid="agent-input"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="shrink-0 p-1.5 border border-border hover:border-[hsl(186_45%_50%/0.5)] hover:text-[hsl(186_45%_55%)] text-muted-foreground disabled:opacity-30 transition-colors"
            data-testid="agent-send"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="font-terminal text-data-2xs text-muted-foreground/60">SHIFT+ENTER NEW LINE · ENTER SEND</span>
        </div>
      </div>
    </div>
  );
}
