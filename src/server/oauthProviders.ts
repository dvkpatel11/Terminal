export interface OAuthProviderConfig {
  name: string;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  usesPkce: boolean;
  authStyle: "body" | "header";
}

export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  reddit: {
    name: "Reddit",
    authUrl: "https://www.reddit.com/api/v1/authorize",
    tokenUrl: "https://www.reddit.com/api/v1/access_token",
    userInfoUrl: "https://oauth.reddit.com/api/v1/me",
    scopes: ["history", "identity"],
    usesPkce: false,
    authStyle: "header",
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
