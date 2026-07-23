import crypto from "node:crypto";
import { OAUTH_PROVIDERS, getRedirectUri, type OAuthProviderConfig } from "./oauthProviders";

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
  stateStore.forEach((state, key) => {
    if (now - state.createdAt > STATE_TTL_MS) stateStore.delete(key);
  });
}, 60_000);

// PKCE Utilities
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// State Generation
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

// State Validation
export function validateOAuthState(state: string): OAuthState | undefined {
  const oauthState = stateStore.get(state);
  if (!oauthState) return undefined;
  stateStore.delete(state); // One-time use
  return oauthState;
}

// Token Exchange
export interface TokenExchangeResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
}

export async function exchangeCodeForTokens(
  provider: string,
  code: string,
  codeVerifier: string,
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
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    scope: data.scope,
  };
}

// User Info
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

// Token Refresh
export async function refreshAccessToken(
  provider: string,
  refreshToken: string,
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
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt,
    scope: data.scope,
  };
}

// ─── App Credential Storage ─────────────────────────────────────────────────

interface AppCredentials {
  clientId: string;
  clientSecret: string;
}

const appCredentials = new Map<string, AppCredentials>();

export function setAppCredentials(provider: string, clientId: string, clientSecret: string): void {
  appCredentials.set(provider, { clientId, clientSecret });
}

export function getAppCredentials(provider: string): AppCredentials | undefined {
  // Check in-memory store first, then fall back to env vars
  const stored = appCredentials.get(provider);
  if (stored) return stored;

  const envId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
  const envSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];
  if (envId && envSecret) {
    return { clientId: envId, clientSecret: envSecret };
  }

  return undefined;
}

export function hasAppCredentials(provider: string): boolean {
  return getAppCredentials(provider) !== undefined;
}

// Helpers
function getClientId(provider: string): string {
  const creds = getAppCredentials(provider);
  if (!creds) throw new Error(`Missing credentials for ${provider}. Configure in Settings > Social Accounts.`);
  return creds.clientId;
}

function getClientSecret(provider: string): string {
  const creds = getAppCredentials(provider);
  if (!creds) throw new Error(`Missing credentials for ${provider}. Configure in Settings > Social Accounts.`);
  return creds.clientSecret;
}

// Token Encryption
// Auto-generate a random key in dev if not set — tokens won't survive restart
// but the app works without manual configuration.
let ENCRYPTION_KEY = process.env.OAUTH_ENCRYPTION_KEY || "";
if (!ENCRYPTION_KEY && process.env.NODE_ENV !== "production") {
  ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
  console.warn("[oauth] OAUTH_ENCRYPTION_KEY not set — using random dev key (tokens lost on restart)");
}

export function encryptToken(token: string): string {
  if (!ENCRYPTION_KEY) return token; // No encryption key = store plaintext (dev only)
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(encrypted: string): string {
  if (!ENCRYPTION_KEY) return encrypted; // No encryption key = assume plaintext
  const [ivHex, dataHex] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
