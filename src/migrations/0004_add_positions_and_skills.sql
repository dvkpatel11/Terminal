-- Migration 0004: Add positions, position_fills, position_theses, position_intents, agent_skills tables

-- Positions
CREATE TABLE IF NOT EXISTS "positions" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "instrument_id" integer NOT NULL REFERENCES "instruments"("id"),
  "symbol" text NOT NULL,
  "side" text NOT NULL,
  "quantity" real NOT NULL,
  "avg_entry" real NOT NULL,
  "current_price" real,
  "pnl" real,
  "pnl_percent" real,
  "status" text NOT NULL DEFAULT 'open',
  "thesis" text,
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "closed_at" timestamp
);

-- Position Fills
CREATE TABLE IF NOT EXISTS "position_fills" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "position_id" integer NOT NULL REFERENCES "positions"("id"),
  "symbol" text NOT NULL,
  "side" text NOT NULL,
  "quantity" real NOT NULL,
  "price" real NOT NULL,
  "fees" real DEFAULT 0,
  "executed_at" timestamp NOT NULL DEFAULT now(),
  "notes" text
);

-- Position Theses
CREATE TABLE IF NOT EXISTS "position_theses" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "position_id" integer NOT NULL REFERENCES "positions"("id"),
  "symbol" text NOT NULL,
  "direction" text NOT NULL,
  "conviction" text NOT NULL,
  "bull_case" text NOT NULL,
  "bear_case" text NOT NULL,
  "catalysts" text,
  "invalidation" text,
  "time_horizon" text,
  "model" text,
  "input_tokens" integer,
  "output_tokens" integer,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Position Intents
CREATE TABLE IF NOT EXISTS "position_intents" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "symbol" text NOT NULL,
  "side" text NOT NULL,
  "conviction" text,
  "thesis" text,
  "target_price" real,
  "stop_loss" real,
  "time_horizon" text,
  "status" text NOT NULL DEFAULT 'active',
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp
);

-- Agent Skills
CREATE TABLE IF NOT EXISTS "agent_skills" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "skill_id" text NOT NULL UNIQUE,
  "label" text NOT NULL,
  "description" text NOT NULL,
  "system_prompt" text NOT NULL,
  "default_prompts" text NOT NULL DEFAULT '[]',
  "is_built_in" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
