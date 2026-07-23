import { useState } from "react";
import { Check, ExternalLink, Loader2, Unplug } from "lucide-react";
import { useOAuthConnections, useConnectOAuth, useDisconnectOAuth, useTestOAuth } from "@/lib/useFinance";

const PROVIDER_INFO: Record<string, { label: string; icon: string; color: string; description: string }> = {
  x: { label: "X / TWITTER", icon: "𝕏", color: "text-blue-400", description: "Access your personalized timeline and followed accounts" },
  reddit: { label: "REDDIT", icon: "r/", color: "text-orange-400", description: "Access subscribed subreddits and saved posts" },
  truth: { label: "TRUTH SOCIAL", icon: "T", color: "text-gray-300", description: "Access your Truth Social feed" },
};

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

  const connectedProviders = new Map(connections.map(c => [c.provider, c]));

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
                      onClick={() => connectMutation.mutate(provider)}
                      disabled={isConnecting}
                      className="flex items-center gap-1.5 font-terminal text-[8px] text-foreground/70 hover:text-foreground px-3 py-1.5 border border-border/40 rounded-sm hover:border-[hsl(186_45%_50%/0.4)] transition-colors disabled:opacity-50"
                    >
                      {isConnecting ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          Connect
                          <ExternalLink className="w-3 h-3" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-1 py-2">
        <span className="font-terminal text-[8px] text-muted-foreground/40 tracking-wider">
          CONNECTIONS ARE STORED SERVER-SIDE. TOKENS ARE ENCRYPTED AT REST.
        </span>
      </div>
    </div>
  );
}
