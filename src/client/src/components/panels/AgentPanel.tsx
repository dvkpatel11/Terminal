import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Bot, Send, Trash2, Zap, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SKILLS, DEFAULT_SKILL_ID, type Skill } from "@/lib/skills";

interface Props { onSymbol: (sym: string) => void }

function MessageBubble({ msg }: { msg: { role: string; content: string } }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`max-w-[85%] ${isUser ? "order-2" : "order-1"}`}>
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1">
            <Bot className="w-3 h-3 text-[hsl(186_45%_55%)]" />
            <span className="font-terminal text-[9px] text-[hsl(186_45%_55%)] tracking-widest">BLMTRM AI</span>
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
            <span className="font-terminal text-[8px] text-muted-foreground">YOU</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AgentPanel({ onSymbol }: Props) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeSkill, setActiveSkill] = useState(DEFAULT_SKILL_ID);
  const [skillDropdownOpen, setSkillDropdownOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const currentSkill = SKILLS.find(s => s.id === activeSkill) ?? SKILLS[0];

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
        body: JSON.stringify({ message: msg, skill: activeSkill }),
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
          <span className="font-terminal text-[8px] text-muted-foreground border border-border px-1.5 py-0.5">MINIMAX M3</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Skill selector */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setSkillDropdownOpen(!skillDropdownOpen)}
              className="flex items-center gap-1.5 px-2 py-1 font-terminal text-[9px] tracking-wider text-[hsl(186_45%_55%)] bg-[hsl(186_45%_50%/0.08)] border border-[hsl(186_45%_50%/0.2)] hover:bg-[hsl(186_45%_50%/0.15)] transition-colors"
            >
              <span>{currentSkill.label}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${skillDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {skillDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-[220px] bg-[#0c0c0c] border border-border/70 shadow-[0_8px_32px_rgba(0,0,0,0.6)] z-50">
                {SKILLS.map((skill) => (
                  <button
                    key={skill.id}
                    onClick={() => { setActiveSkill(skill.id); setSkillDropdownOpen(false); }}
                    className={`w-full text-left px-3 py-2 font-terminal text-[10px] transition-colors ${
                      skill.id === activeSkill
                        ? "text-[hsl(186_45%_60%)] bg-[hsl(186_45%_50%/0.1)]"
                        : "text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="font-bold tracking-wider">{skill.label}</div>
                    <div className="text-[9px] text-muted-foreground/50 mt-0.5">{skill.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => clearMut.mutate()}
            className="flex items-center gap-1.5 font-terminal text-[9px] text-muted-foreground hover:text-[hsl(0_80%_60%)] transition-colors"
            data-testid="clear-chat"
          >
            <Trash2 className="w-3 h-3" /> CLEAR
          </button>
        </div>
      </div>

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
              <div className="font-terminal text-[10px] text-muted-foreground/60 text-center max-w-sm">
                Ask about markets, analyze stocks, get macro insights, or discuss trading strategies.
              </div>
              <div className="font-terminal text-[9px] text-[hsl(186_45%_55%)] tracking-wider">
                SKILL: {currentSkill.label}
              </div>
            </div>

            {/* Quick prompts */}
            <div className="grid grid-cols-1 gap-2 w-full max-w-md">
              {currentSkill.defaultPrompts.map((p, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(p)}
                  className="text-left px-3 py-2 border border-border hover:border-[hsl(186_45%_50%/0.5)] hover:bg-[hsl(186_45%_50%/0.08)] font-terminal text-[10px] text-muted-foreground hover:text-foreground transition-colors"
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
                    <span className="font-terminal text-[9px] text-[hsl(186_45%_55%)] tracking-widest">BLMTRM AI</span>
                    <span className="font-terminal text-[8px] text-muted-foreground animate-pulse">▌</span>
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
          <span className="font-terminal text-[10px] text-[hsl(186_45%_55%)] shrink-0">&gt;</span>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="ASK ABOUT MARKETS, STOCKS, MACRO..."
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
          <span className="font-terminal text-[8px] text-muted-foreground/60">SHIFT+ENTER NEW LINE · ENTER SEND</span>
        </div>
      </div>
    </div>
  );
}
