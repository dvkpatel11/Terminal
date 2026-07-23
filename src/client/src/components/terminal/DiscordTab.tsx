import { useState } from "react";
import { Loader2, Eye, EyeOff, AlertTriangle, CheckCircle2, X, MessageSquare } from "lucide-react";
import {
  useDiscordStatus,
  useDiscordSetToken,
  useDiscordClearToken,
  useDiscordGuilds,
  useDiscordChannels,
  useDiscordTrackedChannels,
  useDiscordTrackChannel,
  useDiscordUntrackChannel,
} from "@/lib/useFinance";

export default function DiscordTab() {
  const { configured, refetch: refetchStatus } = useDiscordStatus();
  const setTokenMutation = useDiscordSetToken();
  const clearTokenMutation = useDiscordClearToken();
  const { guilds, refetch: refetchGuilds } = useDiscordGuilds();
  const [selectedGuild, setSelectedGuild] = useState<string | null>(null);
  const { channels, isLoading: channelsLoading } = useDiscordChannels(selectedGuild);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const { channels: trackedChannels, isLoading: trackedLoading } = useDiscordTrackedChannels();
  const trackChannelMutation = useDiscordTrackChannel();
  const untrackChannelMutation = useDiscordUntrackChannel();

  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSetToken = async () => {
    if (!tokenInput.trim()) return;
    setError(null);
    try {
      await setTokenMutation.mutateAsync(tokenInput.trim());
      setTokenInput("");
      await refetchStatus();
      refetchGuilds();
    } catch (err: any) {
      setError(err.message || "Failed to verify token");
    }
  };

  const handleClearToken = async () => {
    await clearTokenMutation.mutateAsync();
    setSelectedGuild(null);
    setSelectedChannel(null);
    await refetchStatus();
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

  return (
    <div className="space-y-6">
      {/* Bot Token Section */}
      <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs text-slate-400 font-mono uppercase tracking-wider">Bot Token</h3>
          {configured ? (
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
          Enter a Discord bot token with View Channel and Read Message History permissions.
        </p>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showToken ? "text" : "password"}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Enter bot token..."
              className="w-full bg-slate-800/80 border border-slate-600/50 rounded px-3 py-2 pr-10 text-sm text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-600/50"
            />
            <button
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            onClick={handleSetToken}
            disabled={!tokenInput.trim() || setTokenMutation.isPending}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white px-3 py-2 rounded text-xs font-mono flex items-center gap-1.5"
          >
            {setTokenMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
            Verify & Save
          </button>
          {configured && (
            <button
              onClick={handleClearToken}
              disabled={clearTokenMutation.isPending}
              className="bg-red-600/80 hover:bg-red-500 disabled:opacity-50 text-white px-3 py-2 rounded text-xs font-mono flex items-center gap-1.5"
            >
              {clearTokenMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
              Disconnect
            </button>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-400 mt-2 font-mono">{error}</p>
        )}
      </div>

      {/* Channel Picker Section */}
      {configured && (
        <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
          <h3 className="text-xs text-slate-400 font-mono uppercase tracking-wider mb-3">Add Channel</h3>
          <div className="flex gap-2">
            <select
              value={selectedGuild || ""}
              onChange={(e) => {
                setSelectedGuild(e.target.value || null);
                setSelectedChannel(null);
              }}
              className="flex-1 bg-slate-800/80 border border-slate-600/50 rounded px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-cyan-600/50"
            >
              <option value="">Select server...</option>
              {guilds.map((g: any) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <select
              value={selectedChannel || ""}
              onChange={(e) => setSelectedChannel(e.target.value || null)}
              disabled={!selectedGuild || channelsLoading}
              className="flex-1 bg-slate-800/80 border border-slate-600/50 rounded px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-cyan-600/50 disabled:opacity-50"
            >
              <option value="">
                {channelsLoading ? "Loading channels..." : "Select channel..."}
              </option>
              {channels
                .filter((c: any) => c.type === 0)
                .map((c: any) => (
                  <option key={c.id} value={c.id}>#{c.name}</option>
                ))}
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

      {/* Tracked Channels Section */}
      <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
        <h3 className="text-xs text-slate-400 font-mono uppercase tracking-wider mb-3">Tracked Channels</h3>
        {trackedLoading ? (
          <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
            <Loader2 size={12} className="animate-spin" /> Loading...
          </div>
        ) : trackedChannels.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-slate-500 font-mono py-4">
            <MessageSquare size={14} /> No channels tracked. Add a channel above to start monitoring market discussions.
          </div>
        ) : (
          <div className="space-y-2">
            {trackedChannels.map((ch: any) => (
              <div
                key={ch.channelId}
                className="flex items-center justify-between bg-slate-800/40 rounded px-3 py-2 border border-slate-700/30"
              >
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
    </div>
  );
}
