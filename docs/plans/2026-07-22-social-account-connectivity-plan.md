# Social Account Connectivity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use godmode:task-runner to implement this plan task-by-task.

**Goal:** Add OAuth 2.0 Authorization Code + PKCE flows for X/Twitter, Reddit, and Truth Social, allowing users to connect their personal accounts and access personalized feeds.

**Architecture:** Server-side OAuth flow with state + PKCE, encrypted token storage in PostgreSQL, and a new SOCIAL ACCOUNTS tab in ConfigModal. Tokens used for personalized social feed when available.

**Tech Stack:** Express.js, PostgreSQL (Drizzle ORM), React, React Query, lucide-react icons

---

### Task 1: Database Schema

**Files:**
- Modify: `src/shared/schema.ts`
- Create: `drizzle/0001_add_oauth_connections.sql`

**Step 1: Add table definition to schema.ts**

```typescript
// Add after the existing socialPosts table definition (~line 264)
export const oauthConnections = pgTable("oauth_connections", {
  id: bigSerial("id", { mode: "number" }).primaryKey(),
  provider: text("provider").notNull(),          // 'reddit', 'x', 'truth'
  providerUserId: text("provider_user_id").notNull(),
  displayName: text("display_name").notNull(),
  accessToken: text("access_token").notNull(),    // encrypted
  refreshToken: text("refresh_token"),            // encrypted, nullable
  tokenExpiresAt: timestamp("token_expires_at"),
  scope: text("scope"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  providerUserUnique: uniqueIndex("oauth_connections_provider_user_idx")
    .on(table.provider, table.providerUserId),
}));

export type OauthConnection = typeof oauthConnections.$inferSelect;
export type InsertOauthConnection = typeof oauthConnections.$inferInsert;
```

**Step 2: Generate migration**

Run: `npx drizzle-kit generate`
Expected: Creates `drizzle/0001_add_oauth_connections.sql`

**Step 3: Verify types**

Run: `npm run check` (from src/)
Expected: PASS (no type errors)

**Step 4: Commit**

```bash
git add src/shared/schema.ts drizzle/
git commit -m "feat: add oauth_connections table schema"
```

---

### Task 2: Storage Layer

**Files:**
- Modify: `src/server/storage.ts`

**Step 1: Add import for new table**

Add to imports at top of file:
```typescript
import { oauthConnections } from "@shared/schema";
```

**Step 2: Add CRUD methods to IStorage interface**

```typescript
// Add after existing social methods (~line 100)
getOauthConnection(provider: string): Promise<OauthConnection | undefined>;
upsertOauthConnection(conn: InsertOauthConnection): Promise<OauthConnection>;
deleteOauthConnection(provider: string): Promise<void>;
getAllOauthConnections(): Promise<OauthConnection[]>;
```

**Step 3: Implement in MemStorage class**

```typescript
// Add private field
private oauthConns: Map<string, OauthConnection> = new Map();
private oauthId = 1;

// Add methods
async getOauthConnection(provider: string): Promise<OauthConnection | undefined> {
  return Array.from(this.oauthConns.values()).find(c => c.provider === provider);
}

async upsertOauthConnection(conn: InsertOauthConnection): Promise<OauthConnection> {
  const existing = await this.getOauthConnection(conn.provider);
  if (existing) {
    const updated: OauthConnection = { ...existing, ...conn, updatedAt: new Date() };
    this.oauthConns.set(existing.id, updated);
    return updated;
  }
  const newConn: OauthConnection = { ...conn, id: this.oauthId++, createdAt: new Date(), updatedAt: new Date() };
  this.oauthConns.set(newConn.id, newConn);
  return newConn;
}

async deleteOauthConnection(provider: string): Promise<void> {
  const conn = await this.getOauthConnection(provider);
  if (conn) this.oauthConns.delete(conn.id);
}

async getAllOauthConnections(): Promise<OauthConnection[]> {
  return Array.from(this.oauthConns.values());
}
```

**Step 4: Verify types**

Run: `npm run check`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/storage.ts
git commit -m "feat: add oauth_connections storage CRUD"
```

---

### Task 3: Provider Configurations

**Files:**
- Create: `src/server/oauthProviders.ts`

**Step 1: Create provider config file**

```typescript
export interface OAuthProviderConfig {
  name: string;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  usesPkce: boolean;
  authStyle: "body" | "header";  // how to send client credentials
}

export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  reddit: {
    name: "Reddit",
    authUrl: "https://www.reddit.com/api/v1/authorize",
    tokenUrl: "https://www.reddit.com/api/v1/access_token",
    userInfoUrl: "https://oauth.reddit.com/api/v1/me",
    scopes: ["history", "identity"],
    usesPkce: false,
    authStyle: "header",  // HTTP Basic Auth
  },
  x: {
    name: "X / Twitter",
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    userInfoUrl: "https://api.twitter.com/2/users/me",
    scopes: ["tweet.read", "users.read", "offline.access"],
    usesPkce: true,
    authStyle: "body",
  },
  truth: {
    name: "Truth Social",
    authUrl: "https://truthsocial.com/oauth/authorize",
    tokenUrl: "https://truthsocial.com/oauth/token",
    userInfoUrl: "https://truthsocial.com/api/v1/accounts/verify_credentials",
    scopes: ["read"],
    usesPkce: false,
    authStyle: "body",
  },
};

export function getProviderConfig(provider: string): OAuthProviderConfig | undefined {
  return OAUTH_PROVIDERS[provider];
}

export function getRedirectUri(provider: string): string {
  const base = process.env.OAUTH_REDIRECT_BASE || "http://localhost:3000";
  return `${base}/api/oauth/callback/${provider}`;
}
```

**Step 2: Verify types**

Run: `npm run check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/server/oauthProviders.ts
git commit -m "feat: add OAuth provider configurations"
```

---

### Task 4: OAuth Flow Logic

**Files:**
- Create: `src/server/oauth.ts`

**Step 1: Create OAuth flow module**

```typescript
import crypto from "node:crypto";
import { OAUTH_PROVIDERS, getRedirectUri, type OAuthProviderConfig } from "./oauthProviders";

// ─── State Management ──────────────────────────────────────────────────────

interface OAuthState {
  provider: string;
  codeVerifier: string;
  codeChallenge: string;
  createdAt: number;
}

const stateStore = new Map<string, OAuthState>();
const STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Cleanup expired states every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, state] of stateStore) {
    if (now - state.createdAt > STATE_TTL_MS) stateStore.delete(key);
  }
}, 60_000);

// ─── PKCE Utilities ────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// ─── State Generation ──────────────────────────────────────────────────────

export function generateOAuthState(provider: string): { state: string; authUrl: string } {
  const config = OAUTH_PROVIDERS[provider];
  if (!config) throw new Error(`Unknown provider: ${provider}`);

  const state = crypto.randomBytes(16).toString("hex");
  const codeVerifier = config.usesPkce ? generateCodeVerifier() : "";
  const codeChallenge = config.usesPkce ? generateCodeChallenge(codeVerifier) : "";

  stateStore.set(state, { provider, codeVerifier, codeChallenge, createdAt: Date.now() });

  const redirectUri = getRedirectUri(provider);
  const params = new URLSearchParams({
    client_id: getClientId(provider),
    response_type: "code",
    redirect_uri: redirectUri,
    state,
    scope: config.scopes.join(" "),
  });

  if (config.usesPkce) {
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
  }

  return { state, authUrl: `${config.authUrl}?${params.toString()}` };
}

// ─── State Validation ──────────────────────────────────────────────────────

export function validateOAuthState(state: string): OAuthState | undefined {
  const oauthState = stateStore.get(state);
  if (!oauthState) return undefined;
  stateStore.delete(state);  // One-time use
  return oauthState;
}

// ─── Token Exchange ────────────────────────────────────────────────────────

export interface TokenExchangeResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
}

export async function exchangeCodeForTokens(
  provider: string,
  code: string,
  codeVerifier: string
): Promise<TokenExchangeResult> {
  const config = OAUTH_PROVIDERS[provider];
  if (!config) throw new Error(`Unknown provider: ${provider}`);

  const redirectUri = getRedirectUri(provider);
  const clientId = getClientId(provider);
  const clientSecret = getClientSecret(provider);

  const body: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  };

  if (config.usesPkce) {
    body.code_verifier = codeVerifier;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (config.authStyle === "header") {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    headers["Authorization"] = `Basic ${credentials}`;
  } else {
    body.client_id = clientId;
    body.client_secret = clientSecret;
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body: new URLSearchParams(body).toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed for ${provider}: ${error}`);
  }

  const data = await response.json();
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : undefined;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    scope: data.scope,
  };
}

// ─── User Info ─────────────────────────────────────────────────────────────

export interface UserInfo {
  userId: string;
  displayName: string;
}

export async function fetchUserInfo(provider: string, accessToken: string): Promise<UserInfo> {
  const config = OAUTH_PROVIDERS[provider];
  if (!config) throw new Error(`Unknown provider: ${provider}`);

  const response = await fetch(config.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user info for ${provider}`);
  }

  const data = await response.json();

  // Normalize response per provider
  switch (provider) {
    case "reddit":
      return { userId: data.id, displayName: data.name };
    case "x":
      return { userId: data.data.id, displayName: data.data.username };
    case "truth":
      return { userId: data.id, displayName: data.username };
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ─── Token Refresh ─────────────────────────────────────────────────────────

export async function refreshAccessToken(
  provider: string,
  refreshToken: string
): Promise<TokenExchangeResult> {
  const config = OAUTH_PROVIDERS[provider];
  if (!config) throw new Error(`Unknown provider: ${provider}`);

  const clientId = getClientId(provider);
  const clientSecret = getClientSecret(provider);

  const body: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (config.authStyle === "header") {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    headers["Authorization"] = `Basic ${credentials}`;
  } else {
    body.client_id = clientId;
    body.client_secret = clientSecret;
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body: new URLSearchParams(body).toString(),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed for ${provider}`);
  }

  const data = await response.json();
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : undefined;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt,
    scope: data.scope,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getClientId(provider: string): string {
  const envKey = `${provider.toUpperCase()}_CLIENT_ID`;
  const value = process.env[envKey];
  if (!value) throw new Error(`Missing ${envKey} environment variable`);
  return value;
}

function getClientSecret(provider: string): string {
  const envKey = `${provider.toUpperCase()}_CLIENT_SECRET`;
  const value = process.env[envKey];
  if (!value) throw new Error(`Missing ${envKey} environment variable`);
  return value;
}

// ─── Token Encryption ──────────────────────────────────────────────────────

const ENCRYPTION_KEY = process.env.OAUTH_ENCRYPTION_KEY || "";

export function encryptToken(token: string): string {
  if (!ENCRYPTION_KEY) return token;  // No encryption key = store plaintext (dev only)
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(encrypted: string): string {
  if (!ENCRYPTION_KEY) return encrypted;  // No encryption key = assume plaintext
  const [ivHex, dataHex] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}
```

**Step 2: Verify types**

Run: `npm run check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/server/oauth.ts
git commit -m "feat: add OAuth flow logic with PKCE and token encryption"
```

---

### Task 5: Server Routes

**Files:**
- Modify: `src/server/routes.ts`

**Step 1: Add imports**

```typescript
import { generateOAuthState, validateOAuthState, exchangeCodeForTokens, fetchUserInfo, refreshAccessToken, encryptToken, decryptToken } from "./oauth";
import { OAUTH_PROVIDERS } from "./oauthProviders";
```

**Step 2: Add OAuth routes**

Add after existing routes (~line 639):

```typescript
// ─── OAuth Social Account Routes ────────────────────────────────────────────

app.get("/api/oauth/authorize", (req, res) => {
  try {
    const provider = String(req.query.provider || "");
    if (!OAUTH_PROVIDERS[provider]) {
      return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }
    const { authUrl } = generateOAuthState(provider);
    res.json({ authUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/oauth/callback/:provider", async (req, res) => {
  try {
    const { provider } = req.params;
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`/#/settings?oauth_error=${provider}`);
    }

    if (!code || !state || !OAUTH_PROVIDERS[provider]) {
      return res.redirect(`/#/settings?oauth_error=invalid_request`);
    }

    const oauthState = validateOAuthState(String(state));
    if (!oauthState || oauthState.provider !== provider) {
      return res.redirect(`/#/settings?oauth_error=invalid_state`);
    }

    const tokens = await exchangeCodeForTokens(provider, String(code), oauthState.codeVerifier);
    const userInfo = await fetchUserInfo(provider, tokens.accessToken);

    await extendedStorage.upsertOauthConnection({
      provider,
      providerUserId: userInfo.userId,
      displayName: userInfo.displayName,
      accessToken: encryptToken(tokens.accessToken),
      refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
      tokenExpiresAt: tokens.expiresAt ?? null,
      scope: tokens.scope ?? null,
    });

    res.redirect(`/#/settings?oauth_success=${provider}`);
  } catch (error: any) {
    console.error("OAuth callback error:", error);
    res.redirect(`/#/settings?oauth_error=${provider}`);
  }
});

app.get("/api/oauth/connections", async (_req, res) => {
  try {
    const connections = await extendedStorage.getAllOauthConnections();
    const safe = connections.map(c => ({
      provider: c.provider,
      displayName: c.displayName,
      scope: c.scope,
      tokenExpiresAt: c.tokenExpiresAt,
      createdAt: c.createdAt,
    }));
    res.json(safe);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/oauth/connections/:provider", async (req, res) => {
  try {
    const { provider } = req.params;
    if (!OAUTH_PROVIDERS[provider]) {
      return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }
    await extendedStorage.deleteOauthConnection(provider);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/oauth/test/:provider", async (req, res) => {
  try {
    const { provider } = req.params;
    const conn = await extendedStorage.getOauthConnection(provider);
    if (!conn) {
      return res.status(404).json({ error: "Not connected" });
    }

    let accessToken = decryptToken(conn.accessToken);

    // Check if token needs refresh
    if (conn.tokenExpiresAt && new Date(conn.tokenExpiresAt) < new Date()) {
      if (conn.refreshToken) {
        const tokens = await refreshAccessToken(provider, decryptToken(conn.refreshToken));
        accessToken = tokens.accessToken;
        await extendedStorage.upsertOauthConnection({
          provider,
          providerUserId: conn.providerUserId,
          displayName: conn.displayName,
          accessToken: encryptToken(tokens.accessToken),
          refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
          tokenExpiresAt: tokens.expiresAt ?? null,
          scope: tokens.scope ?? conn.scope,
        });
      } else {
        return res.status(401).json({ error: "Token expired and no refresh token" });
      }
    }

    // Test by fetching user info
    const userInfo = await fetchUserInfo(provider, accessToken);
    res.json({ ok: true, displayName: userInfo.displayName });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

**Step 3: Verify types**

Run: `npm run check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/server/routes.ts
git commit -m "feat: add OAuth API routes"
```

---

### Task 6: Client Hooks

**Files:**
- Modify: `src/client/src/lib/useFinance.ts`

**Step 1: Add OAuth hooks**

```typescript
// Add at end of file

// ─── OAuth Connection Hooks ────────────────────────────────────────────────

interface OAuthConnection {
  provider: string;
  displayName: string;
  scope: string | null;
  tokenExpiresAt: string | null;
  createdAt: string;
}

export function useOAuthConnections() {
  return useQuery<OAuthConnection[]>({
    queryKey: ["/api/oauth/connections"],
    staleTime: 30_000,
  });
}

export function useConnectOAuth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (provider: string) => {
      const res = await fetch(`/api/oauth/authorize?provider=${provider}`);
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
      return data;
    },
  });
}

export function useDisconnectOAuth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (provider: string) => {
      const res = await fetch(`/api/oauth/connections/${provider}`, { method: "DELETE" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/oauth/connections"] });
    },
  });
}

export function useTestOAuth() {
  return useMutation({
    mutationFn: async (provider: string) => {
      const res = await fetch(`/api/oauth/test/${provider}`, { method: "POST" });
      return res.json();
    },
  });
}
```

**Step 2: Verify types**

Run: `npm run check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/client/src/lib/useFinance.ts
git commit -m "feat: add OAuth connection hooks"
```

---

### Task 7: Social Accounts Tab UI

**Files:**
- Create: `src/client/src/components/terminal/SocialAccountsTab.tsx`

**Step 1: Create the component**

```tsx
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
```

**Step 2: Verify types**

Run: `npm run check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/client/src/components/terminal/SocialAccountsTab.tsx
git commit -m "feat: add SocialAccountsTab component"
```

---

### Task 8: ConfigModal Integration

**Files:**
- Modify: `src/client/src/components/terminal/ConfigModal.tsx`

**Step 1: Add import**

```typescript
import SocialAccountsTab from "./SocialAccountsTab";
```

**Step 2: Add "social" to ConfigTab type**

```typescript
type ConfigTab = "status" | "keys" | "symbols" | "social" | "general" | "help";
```

**Step 3: Add tab to tabs array**

```typescript
import { Plug } from "lucide-react";

// Add to tabs array
{ id: "social", label: "SOCIAL ACCOUNTS", icon: Plug },
```

**Step 4: Add state for OAuth redirects**

```typescript
// Add after other state declarations
const [oauthSuccess, setOauthSuccess] = useState<string | null>(null);
const [oauthError, setOauthError] = useState<string | null>(null);

// Add useEffect to handle OAuth redirect params
useEffect(() => {
  const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
  const success = params.get("oauth_success");
  const error = params.get("oauth_error");
  if (success) {
    setOauthSuccess(success);
    setOauthError(null);
    // Clean URL
    window.history.replaceState({}, "", "/#/");
  }
  if (error) {
    setOauthError(error);
    setOauthSuccess(null);
    window.history.replaceState({}, "", "/#/");
  }
}, []);
```

**Step 5: Add tab content**

```tsx
{activeTab === "social" && (
  <SocialAccountsTab oauthSuccess={oauthSuccess} oauthError={oauthError} />
)}
```

**Step 6: Verify types**

Run: `npm run check`
Expected: PASS

**Step 7: Commit**

```bash
git add src/client/src/components/terminal/ConfigModal.tsx
git commit -m "feat: integrate SocialAccountsTab into ConfigModal"
```

---

### Task 9: Token Usage in Social Feed

**Files:**
- Modify: `src/server/socialFeed.ts`

**Step 1: Add import**

```typescript
import { decryptToken } from "./oauth";
```

**Step 2: Modify fetchSocialFeed to accept user tokens**

```typescript
// Update function signature
export async function fetchSocialFeed(
  sources: SocialSourceConfig[],
  useUserTokens: boolean = false
): Promise<SocialFeedResponse> {
  // After existing source parsing, before fetch:

  // Load user tokens if requested
  const userTokens: Record<string, string> = {};
  if (useUserTokens) {
    const connections = await extendedStorage.getAllOauthConnections();
    for (const conn of connections) {
      // Check if token is still valid
      if (!conn.tokenExpiresAt || new Date(conn.tokenExpiresAt) > new Date()) {
        userTokens[conn.provider] = decryptToken(conn.accessToken);
      }
    }
  }

  // Pass userTokens to platform-specific fetchers
  // In each fetcher, use userTokens[provider] if available, else fall back to app tokens
```

**Step 3: Update fetcher functions to accept optional user token**

```typescript
// Example for X fetcher
async function fetchXTweets(
  handle: string,
  userToken?: string
): Promise<SocialPost[]> {
  const bearerToken = userToken || process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) return [];
  // ... rest of existing logic
}
```

**Step 4: Add route parameter**

In routes.ts, update the feed endpoint:

```typescript
app.get("/api/finance/social/feed", handleFinance(async (req) => {
  const sourcesParam = typeof req.query.sources === "string" ? req.query.sources : "";
  const useUserTokens = req.query.user_tokens === "true";
  // ... existing source parsing
  return fetchSocialFeed(parsedSources, useUserTokens);
}));
```

**Step 5: Verify types**

Run: `npm run check`
Expected: PASS

**Step 6: Commit**

```bash
git add src/server/socialFeed.ts src/server/routes.ts
git commit -m "feat: support user tokens in social feed"
```

---

### Task 10: Environment Variables Documentation

**Files:**
- Modify: `README.md` (or create `.env.example`)

**Step 1: Create .env.example with OAuth vars**

```env
# OAuth Provider Credentials
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret
X_CLIENT_ID=your_x_client_id
X_CLIENT_SECRET=your_x_client_secret
TRUTH_CLIENT_ID=your_truth_client_id
TRUTH_CLIENT_SECRET=your_truth_client_secret

# Token Encryption (generate with: openssl rand -hex 32)
OAUTH_ENCRYPTION_KEY=your_32_byte_encryption_key

# OAuth Redirect Base URL
OAUTH_REDIRECT_BASE=http://localhost:3000
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add OAuth environment variables template"
```

---

### Task 11: Integration Test

**Files:**
- Create: `src/server/oauth.test.ts`

**Step 1: Write tests for OAuth utilities**

```typescript
import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken } from "./oauth";
import { generateOAuthState, validateOAuthState } from "./oauth";

describe("OAuth Token Encryption", () => {
  it("encrypts and decrypts tokens", () => {
    const original = "test_access_token_12345";
    const encrypted = encryptToken(original);
    expect(encrypted).not.toBe(original);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(original);
  });

  it("generates unique encrypted values", () => {
    const token = "same_token";
    const enc1 = encryptToken(token);
    const enc2 = encryptToken(token);
    expect(enc1).not.toBe(enc2); // Different IVs
    expect(decryptToken(enc1)).toBe(token);
    expect(decryptToken(enc2)).toBe(token);
  });
});

describe("OAuth State Management", () => {
  it("generates and validates state", () => {
    const { state } = generateOAuthState("reddit");
    const validated = validateOAuthState(state);
    expect(validated).toBeDefined();
    expect(validated?.provider).toBe("reddit");
  });

  it("consumes state on validation", () => {
    const { state } = generateOAuthState("x");
    validateOAuthState(state);
    const second = validateOAuthState(state);
    expect(second).toBeUndefined(); // Already consumed
  });

  it("rejects invalid state", () => {
    const result = validateOAuthState("invalid_state");
    expect(result).toBeUndefined();
  });
});
```

**Step 2: Run tests**

Run: `npm test` (from src/)
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/server/oauth.test.ts
git commit -m "test: add OAuth utility tests"
```

---

## Final Verification

**Step 1: Full type check**

Run: `npm run check`
Expected: PASS

**Step 2: Full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 3: Manual verification**

1. Start dev server: `npm run dev`
2. Open Settings → SOCIAL ACCOUNTS tab
3. Verify all three providers show "Not connected" state
4. Click "Connect" → Should redirect to provider auth page (will fail without real credentials, but flow should work)
5. Verify disconnect flow works with test connection

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete social account connectivity with OAuth"
```
