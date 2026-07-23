-- Migration: 0003_add_oauth_connections
-- Description: Add oauth_connections table for storing OAuth provider tokens

-- ─── OAuth Connections ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oauth_connections (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  scope TEXT,
created_at TIMESTAMP DEFAULT NOW() NOT NULL,
updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Unique index on (provider, provider_user_id)
CREATE UNIQUE INDEX IF NOT EXISTS oauth_connections_provider_user_idx
  ON oauth_connections (provider, provider_user_id);
