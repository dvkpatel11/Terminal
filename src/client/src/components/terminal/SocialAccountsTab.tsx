import { useState, useEffect } from "react";
import { Check, ExternalLink, Loader2, Unplug, Key, X, Eye, EyeOff, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  useOAuthConnections,
  useConnectOAuth,
  useDisconnectOAuth,
  useTestOAuth,
  useDiscordStatus,
  useDiscordSetToken,
  useDiscordClearToken,
  useDiscordGuilds,
  useDiscordChannels,
  useDiscordTrackedChannels,
  useDiscordTrackChannel,
  useDiscordUntrackChannel,
} from "@/lib/useFinance";

const PROVIDER_INFO: Record<string, { label: string; icon: string; color: string; description: string }> = {
  x: { label: "X / TWITTER", icon: "𝕏", color: "text-blue-400", description: "Access your personalized timeline and followed accounts" },
  reddit: { label: "REDDIT", icon: "r/", color: "text-orange-400", description: "Access subscribed subreddits and saved posts" },
  truth: { label: "TRUTH SOCIAL", icon: "T", color: "text-gray-300", description: "Access your Truth Social feed" },
};

interface AppCredentialStatus {
  provider: string;
  configured: boolean;
}

interface Props {
  oauthSuccess?: string | null;
  oauthError?: string | null;
}

export default function SocialAccountsTab({ oauthSuccess, oauthError }: Props) {
  const { data: connections = [], isLoading } = useOAuthConnections();
  const connectMutation = useConnectOAuth();
  const disconnectMutation = useDisconnectOAuth();
  const testMutation = useTestOAuth();
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { loading: boolean; result: any }>>({});
  const [credentials, setCredentials] = useState<Record<string, { clientId: string; clientSecret: string }>>({});
  const [credentialStatus, setCredentialStatus] = useState<Record<string, boolean>>({});
  const [savingCredentials, setSavingCredentials] = useState<string | null>(null);
  const [showCredentials, setShowCredentials] = useState<Record<string, boolean>>({});

  // Discord state
  const [discordTokenInput, setDiscordTokenInput] = useState("");
  const [discordTokenVisible, setDiscordTokenVisible] = useState(false);
  const [discordError, setDiscordError] = useState<string | null>(null);
  const [selectedGuild, setSelectedGuild] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);

  const { configured: discordConfigured, refetch: refetchDiscordStatus } = useDiscordStatus();
  const setDiscordTokenMutation = useDiscordSetToken();
  const clearDiscordTokenMutation = useDiscordClearToken();
  const { guilds, refetch: refetchGuilds } = useDiscordGuilds();
  const { channels, isLoading: channelsLoading } = useDiscordChannels(selectedGuild);
  const { channels: trackedChannels } = useDiscordTrackedChannels();
  const trackChannelMutation = useDiscordTrackChannel();
  const untrackChannelMutation = useDiscordUntrackChannel();

  const handleSetDiscordToken = async () => {
    if (!discordTokenInput.trim()) return;
    setDiscordError(null);
    try {
      await setDiscordTokenMutation.mutateAsync(discordTokenInput.trim());
      setDiscordTokenInput("");
      await refetchDiscordStatus();
      refetchGuilds();
    } catch (err: any) {
      setDiscordError(err.message || "Failed to verify token");
    }
  };

  const handleClearDiscordToken = async () => {
    await clearDiscordTokenMutation.mutateAsync();
    setSelectedGuild(null);
    setSelectedChannel(null);
    await refetchDiscordStatus();
  };

  const handleTrackChannel = async () => {
    if (!selectedChannel || !selectedGuild) return;
    const channel = channels.find((c: any) => c.id === selectedChannel);
    const guild = guilds.find((g: any) => g.id === selectedGuild);
    if (!channel || !guild) return;
    await trackChannelMutation.mutateAsync({
      channelId: channel.id,
      channelName: channel.name,
      guildId: guild.id,
      guildName: guild.name,
    });
    setSelectedChannel(null);
  };

  const handleUntrackChannel = async (channelId: string) => {
    await untrackChannelMutation.mutateAsync(channelId);
  };

  // Load credential status on mount
  useEffect(() => {
    fetch("/api/oauth/credentials")
      .then(r => r.json())
      .then((data: AppCredentialStatus[]) => {
        const status: Record<string, boolean> = {};
        data.forEach(c => { status[c.provider] = c.configured; });
        setCredentialStatus(status);
      })
      .catch(() => {});
  }, []);

  const connectedProviders = new Map(connections.map(c => [c.provider, c]));

  const handleSaveCredentials = async (provider: string) => {
    const creds = credentials[provider];
    if (!creds?.clientId || !creds?.clientSecret) return;

    setSavingCredentials(provider);
    try {
      const res = await fetch(`/api/oauth/credentials/${provider}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });
      if (res.ok) {
        setCredentialStatus(prev => ({ ...prev, [provider]: true }));
        setCredentials(prev => ({ ...prev, [provider]: { clientId: "", clientSecret: "" } }));
        setShowCredentials(prev => ({ ...prev, [provider]: false }));
      }
    } catch {}
    setSavingCredentials(null);
  };

  const handleTest = async (provider: string) => {
    setTestResults(prev => ({ ...prev, [provider]: { loading: true, result: null } }));
    try {
      const result = await testMutation.mutateAsync(provider);
      setTestResults(prev => ({ ...prev, [provider]: { loading: false, result } }));
    } catch (error: any) {
      setTestResults(prev => ({ ...prev, [provider]: { loading: false, result: { error: error.message } } }));
    }
  };

  const handleDisconnect = async (provider: string) => {
    await disconnectMutation.mutateAsync(provider);
    setConfirmDisconnect(null);
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <span className="font-terminal text-[9px] tracking-[0.15em] text-muted-foreground/70">SOCIAL ACCOUNTS</span>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="border border-border/40 rounded-sm p-4 animate-pulse">
              <div className="h-4 bg-border/20 rounded w-1/3 mb-2" />
              <div className="h-3 bg-border/10 rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between mb-1">
        <span className="font-terminal text-[9px] tracking-[0.15em] text-muted-foreground/70">SOCIAL ACCOUNTS</span>
        <span className="font-terminal text-[8px] text-muted-foreground/50">
          {connectedProviders.size} CONNECTED
        </span>
      </div>

      <p className="font-terminal text-[8px] text-muted-foreground/40">
        Connect your social accounts to access personalized feeds and content from your networks.
      </p>

      {oauthSuccess && (
        <div className="border border-green-500/30 bg-green-500/5 rounded-sm p-3">
          <span className="font-terminal text-[9px] text-green-400">
            Successfully connected to {PROVIDER_INFO[oauthSuccess]?.label ?? oauthSuccess}
          </span>
        </div>
      )}

      {oauthError && (
        <div className="border border-red-500/30 bg-red-500/5 rounded-sm p-3">
          <span className="font-terminal text-[9px] text-red-400">
            Connection failed: {oauthError}
          </span>
        </div>
      )}

      <div className="space-y-3">
        {Object.entries(PROVIDER_INFO).map(([provider, info]) => {
          const connection = connectedProviders.get(provider);
          const isConnecting = connectMutation.isPending;
          const isDisconnecting = disconnectMutation.isPending;
          const testResult = testResults[provider];
          const credsConfigured = credentialStatus[provider];
          const showCredsForm = showCredentials[provider];
          const creds = credentials[provider] || { clientId: "", clientSecret: "" };

          return (
            <div key={provider} className="border border-border/40 rounded-sm p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-sm bg-[#111] border border-border/30 flex items-center justify-center font-terminal text-[10px] ${info.color}`}>
                    {info.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-terminal text-[10px] font-bold text-foreground/80">{info.label}</span>
                      {connection && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-green-500/10 border border-green-500/20 rounded-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          <span className="font-terminal text-[7px] text-green-400">CONNECTED</span>
                        </span>
                      )}
                      {!credsConfigured && !connection && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-500/10 border border-yellow-500/20 rounded-sm">
                          <Key className="w-2 h-2 text-yellow-400" />
                          <span className="font-terminal text-[7px] text-yellow-400">NEEDS API KEY</span>
                        </span>
                      )}
                    </div>
                    <span className="font-terminal text-[8px] text-muted-foreground/50">{info.description}</span>
                    {connection && (
                      <div className="mt-1 space-y-0.5">
                        <span className="font-terminal text-[8px] text-foreground/60">
                          @{connection.displayName}
                        </span>
                        {connection.scope && (
                          <span className="font-terminal text-[7px] text-muted-foreground/40 ml-2">
                            Scopes: {connection.scope}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {connection ? (
                    <>
                      <button
                        onClick={() => handleTest(provider)}
                        disabled={testResult?.loading}
                        className="font-terminal text-[8px] text-muted-foreground/60 hover:text-foreground/80 px-2 py-1 border border-border/30 rounded-sm hover:border-border/50 transition-colors disabled:opacity-50"
                      >
                        {testResult?.loading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : testResult?.result?.ok ? (
                          <span className="text-green-400">OK</span>
                        ) : testResult?.result?.error ? (
                          <span className="text-red-400">FAIL</span>
                        ) : (
                          "Test"
                        )}
                      </button>
                      {confirmDisconnect === provider ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDisconnect(provider)}
                            disabled={isDisconnecting}
                            className="font-terminal text-[8px] text-red-400 hover:text-red-300 px-2 py-1 border border-red-500/30 rounded-sm transition-colors disabled:opacity-50"
                          >
                            {isDisconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm"}
                          </button>
                          <button
                            onClick={() => setConfirmDisconnect(null)}
                            className="font-terminal text-[8px] text-muted-foreground/60 hover:text-foreground/80 px-2 py-1 rounded-sm transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDisconnect(provider)}
                          className="font-terminal text-[8px] text-muted-foreground/60 hover:text-red-400 px-2 py-1 border border-border/30 rounded-sm hover:border-red-500/30 transition-colors"
                        >
                          <Unplug className="w-3 h-3" />
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        if (!credsConfigured) {
                          setShowCredentials(prev => ({ ...prev, [provider]: !prev[provider] }));
                        } else {
                          connectMutation.mutate(provider);
                        }
                      }}
                      disabled={isConnecting}
                      className="flex items-center gap-1.5 font-terminal text-[8px] text-foreground/70 hover:text-foreground px-3 py-1.5 border border-border/40 rounded-sm hover:border-[hsl(186_45%_50%/0.4)] transition-colors disabled:opacity-50"
                    >
                      {isConnecting ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : credsConfigured ? (
                        <>
                          Connect
                          <ExternalLink className="w-3 h-3" />
                        </>
                      ) : (
                        <>
                          <Key className="w-3 h-3" />
                          Add API Key
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Credentials form */}
              {!connection && showCredsForm && (
                <div className="mt-3 pt-3 border-t border-border/20 space-y-2">
                  <span className="font-terminal text-[8px] text-muted-foreground/50">
                    Enter your {info.label} app credentials.{" "}
                    <a
                      href={provider === "reddit" ? "https://www.reddit.com/prefs/apps" : provider === "x" ? "https://developer.x.com/en/portal/dashboard" : "https://truthsocial.com/settings/applications"}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[hsl(186,45%,50%)] hover:underline"
                    >
                      Get credentials →
                    </a>
                  </span>
                  <input
                    type="text"
                    placeholder="Client ID"
                    value={creds.clientId}
                    onChange={(e) => setCredentials(prev => ({ ...prev, [provider]: { ...prev[provider], clientId: e.target.value } }))}
                    className="w-full bg-[#0a0a0a] border border-border/50 px-3 py-1.5 font-terminal text-[9px] text-foreground/80 focus:outline-none focus:border-[hsl(186_45%_50%/0.4)] rounded-sm"
                  />
                  <input
                    type="password"
                    placeholder="Client Secret"
                    value={creds.clientSecret}
                    onChange={(e) => setCredentials(prev => ({ ...prev, [provider]: { ...prev[provider], clientSecret: e.target.value } }))}
                    className="w-full bg-[#0a0a0a] border border-border/50 px-3 py-1.5 font-terminal text-[9px] text-foreground/80 focus:outline-none focus:border-[hsl(186_45%_50%/0.4)] rounded-sm"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleSaveCredentials(provider)}
                      disabled={!creds.clientId || !creds.clientSecret || savingCredentials === provider}
                      className="font-terminal text-[8px] text-foreground/70 hover:text-foreground px-3 py-1.5 border border-border/40 rounded-sm hover:border-[hsl(186_45%_50%/0.4)] transition-colors disabled:opacity-50"
                    >
                      {savingCredentials === provider ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── Discord Bot Section ─────────────────────────────────── */}
      <div className="mt-4 border-t border-slate-700/50 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs text-slate-400 font-mono uppercase tracking-wider">Discord Bot</h3>
          {discordConfigured ? (
            <span className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 bg-emerald-900/50 border border-emerald-700/50 rounded px-2 py-0.5">
              <CheckCircle2 size={10} />
              CONNECTED
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[10px] font-mono text-red-400 bg-red-900/50 border border-red-700/50 rounded px-2 py-0.5">
              <AlertTriangle size={10} />
              NOT CONFIGURED
            </span>
          )}
        </div>

        <p className="text-xs text-slate-500 mb-3">
          Bot token with View Channel + Read Message History permissions.
        </p>

        {/* Token Input */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <input
              type={discordTokenVisible ? "text" : "password"}
              value={discordTokenInput}
              onChange={(e) => setDiscordTokenInput(e.target.value)}
              placeholder="Enter bot token..."
              className="w-full bg-slate-800/80 border border-slate-600/50 rounded px-3 py-2 pr-10 text-sm text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-600/50"
            />
            <button
              onClick={() => setDiscordTokenVisible(!discordTokenVisible)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {discordTokenVisible ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            onClick={handleSetDiscordToken}
            disabled={!discordTokenInput.trim() || setDiscordTokenMutation.isPending}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white px-3 py-2 rounded text-xs font-mono flex items-center gap-1.5"
          >
            {setDiscordTokenMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
            Verify & Save
          </button>
          {discordConfigured && (
            <button
              onClick={handleClearDiscordToken}
              disabled={clearDiscordTokenMutation.isPending}
              className="bg-red-600/80 hover:bg-red-500 disabled:opacity-50 text-white px-3 py-2 rounded text-xs font-mono flex items-center gap-1.5"
            >
              {clearDiscordTokenMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
              Disconnect
            </button>
          )}
        </div>

        {discordError && (
          <p className="text-xs text-red-400 mb-3 font-mono">{discordError}</p>
        )}

        {/* Channel Picker */}
        {discordConfigured && (
          <div className="mb-3">
            <h4 className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-2">Add Channel</h4>
            <div className="flex gap-2">
              <select
                value={selectedGuild || ""}
                onChange={(e) => { setSelectedGuild(e.target.value || null); setSelectedChannel(null); }}
                className="flex-1 bg-slate-800/80 border border-slate-600/50 rounded px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-cyan-600/50"
              >
                <option value="">Select server...</option>
                {guilds.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <select
                value={selectedChannel || ""}
                onChange={(e) => setSelectedChannel(e.target.value || null)}
                disabled={!selectedGuild || channelsLoading}
                className="flex-1 bg-slate-800/80 border border-slate-600/50 rounded px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-cyan-600/50 disabled:opacity-50"
              >
                <option value="">{channelsLoading ? "Loading..." : "Select channel..."}</option>
                {channels.filter((c: any) => c.type === 0).map((c: any) => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </select>
              <button
                onClick={handleTrackChannel}
                disabled={!selectedChannel || trackChannelMutation.isPending}
                className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white px-3 py-2 rounded text-xs font-mono"
              >
                {trackChannelMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : "Add"}
              </button>
            </div>
          </div>
        )}

        {/* Tracked Channels */}
        {discordConfigured && (
          <div>
            <h4 className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-2">Tracked Channels</h4>
            {trackedChannels.length === 0 ? (
              <p className="text-xs text-slate-600 font-mono py-2">No channels tracked. Add one above.</p>
            ) : (
              <div className="space-y-1">
                {trackedChannels.map((ch: any) => (
                  <div key={ch.channelId} className="flex items-center justify-between bg-slate-800/40 rounded px-3 py-2 border border-slate-700/30">
                    <div>
                      <span className="text-sm text-slate-200 font-mono">#{ch.channelName}</span>
                      <span className="text-xs text-slate-500 ml-2">in {ch.guildName}</span>
                    </div>
                    <button
                      onClick={() => handleUntrackChannel(ch.channelId)}
                      disabled={untrackChannelMutation.isPending}
                      className="text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-1 py-2">
        <span className="font-terminal text-[8px] text-muted-foreground/40 tracking-wider">
          API KEYS ARE STORED SERVER-SIDE FOR THE DURATION OF THE SESSION. TOKENS ARE ENCRYPTED AT REST.
        </span>
      </div>
    </div>
  );
}
