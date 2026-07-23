CREATE TABLE "alerts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alerts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"instrument_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"condition" text NOT NULL,
	"price" real NOT NULL,
	"triggered" boolean DEFAULT false NOT NULL,
	"trigger_price" real,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"triggered_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chat_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_spreads" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "credit_spreads_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ig_oas" real NOT NULL,
	"ig_oas_change" real,
	"hy_oas" real NOT NULL,
	"hy_oas_change" real,
	"ig_oas_percentile" real,
	"hy_oas_percentile" real,
	"trend" text,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economic_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "economic_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"release_id" integer,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"importance" text NOT NULL,
	"date" text NOT NULL,
	"time_ct" text,
	"release_url" text,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "instruments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"exchange" text NOT NULL,
	"sector" text,
	"asset_class" text NOT NULL,
	"market_cap" real,
	"reference_price" real,
	"eps" real,
	"coin_gecko_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "instruments_symbol_unique" UNIQUE("symbol")
);
--> statement-breakpoint
CREATE TABLE "market_breadth" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "market_breadth_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"advance_decline" integer,
	"advance_decline_ratio" real,
	"percent_above_200dma" real,
	"percent_above_50dma" real,
	"new_highs" integer,
	"new_lows" integer,
	"new_high_low_ratio" real,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_instruments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "news_instruments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"news_id" integer NOT NULL,
	"instrument_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "news_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"summary" text,
	"url" text NOT NULL,
	"source" text NOT NULL,
	"feed_provider" text,
	"published_at" timestamp NOT NULL,
	"sentiment" text,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "news_items_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "oauth_connections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "oauth_connections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"provider" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"scope" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ohlcv_bars" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ohlcv_bars_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"instrument_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"date" text NOT NULL,
	"interval" text NOT NULL,
	"open" real NOT NULL,
	"high" real NOT NULL,
	"low" real NOT NULL,
	"close" real NOT NULL,
	"volume" integer NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "options_activity" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "options_activity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"instrument_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"option_type" text NOT NULL,
	"strike" real NOT NULL,
	"expiration" text NOT NULL,
	"volume" integer NOT NULL,
	"open_interest" integer NOT NULL,
	"v_oi_ratio" real NOT NULL,
	"sentiment" text,
	"underlying_price" real,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "options_flow" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "options_flow_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"instrument_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"put_call_ratio" real,
	"total_volume" integer,
	"call_volume" integer,
	"put_volume" integer,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "quotes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"instrument_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"price" real NOT NULL,
	"open" real,
	"high" real,
	"low" real,
	"close" real,
	"volume" integer,
	"change" real,
	"change_percent" real,
	"market_cap" real,
	"pe" real,
	"eps" real,
	"high52" real,
	"low52" real,
	"quote_source" text,
	"is_live" boolean,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sector_performance" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sector_performance_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"instrument_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"label" text NOT NULL,
	"sector" text NOT NULL,
	"price" real NOT NULL,
	"change" real,
	"change_percent" real,
	"week_change" real,
	"month_change" real,
	"ytd_change" real,
	"relative_strength" real,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_mentions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "social_mentions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"instrument_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"platform" text NOT NULL,
	"count" integer NOT NULL,
	"positive_count" integer NOT NULL,
	"negative_count" integer NOT NULL,
	"sentiment" real NOT NULL,
	"source" text,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "social_posts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"mention_id" integer NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"score" integer,
	"platform" text NOT NULL,
	"thumbnail" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technical_indicators" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "technical_indicators_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"instrument_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"rsi14" real,
	"macd" real,
	"macd_signal" real,
	"macd_histogram" real,
	"bollinger_upper" real,
	"bollinger_middle" real,
	"bollinger_lower" real,
	"atr14" real,
	"obv" real,
	"vwap" real,
	"support" real,
	"resistance" real,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vix_term_structure" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vix_term_structure_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"spot" real NOT NULL,
	"vix2m" real,
	"vix3m" real,
	"curve_shape" text,
	"term_spread" real,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "watchlist_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"instrument_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whale_transactions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "whale_transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"instrument_id" integer,
	"symbol" text NOT NULL,
	"blockchain" text NOT NULL,
	"amount" real NOT NULL,
	"usd_amount" real,
	"from_address" text,
	"from_label" text,
	"to_address" text,
	"to_label" text,
	"type" text,
	"tx_hash" text,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_instruments" ADD CONSTRAINT "news_instruments_news_id_news_items_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_instruments" ADD CONSTRAINT "news_instruments_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ohlcv_bars" ADD CONSTRAINT "ohlcv_bars_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "options_activity" ADD CONSTRAINT "options_activity_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "options_flow" ADD CONSTRAINT "options_flow_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sector_performance" ADD CONSTRAINT "sector_performance_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_mentions" ADD CONSTRAINT "social_mentions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_mention_id_social_mentions_id_fk" FOREIGN KEY ("mention_id") REFERENCES "public"."social_mentions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_indicators" ADD CONSTRAINT "technical_indicators_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whale_transactions" ADD CONSTRAINT "whale_transactions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_connections_provider_idx" ON "oauth_connections" USING btree ("provider");