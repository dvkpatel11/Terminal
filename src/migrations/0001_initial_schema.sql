-- Migration: 0001_initial_schema
-- Description: Create all tables for the Terminal data schema

-- ─── Instruments (Central Registry) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS instruments (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(10) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  exchange TEXT NOT NULL,
  sector TEXT,
  asset_class TEXT NOT NULL,
  market_cap DOUBLE PRECISION,
  reference_price DOUBLE PRECISION,
  eps DOUBLE PRECISION,
  coin_gecko_id TEXT,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── Watchlist Items ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watchlist_items (
  id SERIAL PRIMARY KEY,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  notes TEXT,
  added_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── Alerts ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  symbol TEXT NOT NULL,
  condition TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  triggered BOOLEAN DEFAULT FALSE NOT NULL,
  trigger_price DOUBLE PRECISION,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  triggered_at TIMESTAMP
);

-- ─── Chat Messages ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── Quotes (Historical Price Snapshots) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotes (
  id SERIAL PRIMARY KEY,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  symbol TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  open DOUBLE PRECISION,
  high DOUBLE PRECISION,
  low DOUBLE PRECISION,
  close DOUBLE PRECISION,
  volume INTEGER,
  change DOUBLE PRECISION,
  change_percent DOUBLE PRECISION,
  market_cap DOUBLE PRECISION,
  pe DOUBLE PRECISION,
  eps DOUBLE PRECISION,
  high52 DOUBLE PRECISION,
  low52 DOUBLE PRECISION,
  quote_source TEXT,
  is_live BOOLEAN,
  recorded_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── OHLCV Bars (Historical Price Data) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS ohlcv_bars (
  id SERIAL PRIMARY KEY,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,
  interval TEXT NOT NULL,
  open DOUBLE PRECISION NOT NULL,
  high DOUBLE PRECISION NOT NULL,
  low DOUBLE PRECISION NOT NULL,
  close DOUBLE PRECISION NOT NULL,
  volume INTEGER NOT NULL,
  recorded_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── News Items ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS news_items (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  url TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  feed_provider TEXT,
  published_at TIMESTAMP NOT NULL,
  sentiment TEXT,
  image TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── News-Instruments (Many-to-Many) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS news_instruments (
  id SERIAL PRIMARY KEY,
  news_id INTEGER NOT NULL REFERENCES news_items(id),
  instrument_id INTEGER NOT NULL REFERENCES instruments(id)
);

-- ─── Social Mentions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_mentions (
  id SERIAL PRIMARY KEY,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  symbol TEXT NOT NULL,
  platform TEXT NOT NULL,
  count INTEGER NOT NULL,
  positive_count INTEGER NOT NULL,
  negative_count INTEGER NOT NULL,
  sentiment DOUBLE PRECISION NOT NULL,
  source TEXT,
  recorded_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── Social Posts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_posts (
  id SERIAL PRIMARY KEY,
  mention_id INTEGER NOT NULL REFERENCES social_mentions(id),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  score INTEGER,
  platform TEXT NOT NULL,
  thumbnail TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── Options Flow ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS options_flow (
  id SERIAL PRIMARY KEY,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  symbol TEXT NOT NULL,
  put_call_ratio DOUBLE PRECISION,
  total_volume INTEGER,
  call_volume INTEGER,
  put_volume INTEGER,
  recorded_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── Options Activity ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS options_activity (
  id SERIAL PRIMARY KEY,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  symbol TEXT NOT NULL,
  option_type TEXT NOT NULL,
  strike DOUBLE PRECISION NOT NULL,
  expiration TEXT NOT NULL,
  volume INTEGER NOT NULL,
  open_interest INTEGER NOT NULL,
  v_oi_ratio DOUBLE PRECISION NOT NULL,
  sentiment TEXT,
  underlying_price DOUBLE PRECISION,
  recorded_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── Whale Transactions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whale_transactions (
  id SERIAL PRIMARY KEY,
  instrument_id INTEGER REFERENCES instruments(id),
  symbol TEXT NOT NULL,
  blockchain TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  usd_amount DOUBLE PRECISION,
  from_address TEXT,
  from_label TEXT,
  to_address TEXT,
  to_label TEXT,
  type TEXT,
  tx_hash TEXT,
  recorded_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── Economic Events ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS economic_events (
  id SERIAL PRIMARY KEY,
  release_id INTEGER,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  importance TEXT NOT NULL,
  date TEXT NOT NULL,
  time_ct TEXT,
  release_url TEXT,
  recorded_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── Sector Performance ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sector_performance (
  id SERIAL PRIMARY KEY,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  symbol TEXT NOT NULL,
  label TEXT NOT NULL,
  sector TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  change DOUBLE PRECISION,
  change_percent DOUBLE PRECISION,
  week_change DOUBLE PRECISION,
  month_change DOUBLE PRECISION,
  ytd_change DOUBLE PRECISION,
  relative_strength DOUBLE PRECISION,
  recorded_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── Market Breadth ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_breadth (
  id SERIAL PRIMARY KEY,
  advance_decline INTEGER,
  advance_decline_ratio DOUBLE PRECISION,
  percent_above_200dma DOUBLE PRECISION,
  percent_above_50dma DOUBLE PRECISION,
  new_highs INTEGER,
  new_lows INTEGER,
  new_high_low_ratio DOUBLE PRECISION,
  recorded_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── Credit Spreads ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_spreads (
  id SERIAL PRIMARY KEY,
  ig_oas DOUBLE PRECISION NOT NULL,
  ig_oas_change DOUBLE PRECISION,
  hy_oas DOUBLE PRECISION NOT NULL,
  hy_oas_change DOUBLE PRECISION,
  ig_oas_percentile DOUBLE PRECISION,
  hy_oas_percentile DOUBLE PRECISION,
  trend TEXT,
  recorded_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── VIX Term Structure ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vix_term_structure (
  id SERIAL PRIMARY KEY,
  spot DOUBLE PRECISION NOT NULL,
  vix2m DOUBLE PRECISION,
  vix3m DOUBLE PRECISION,
  curve_shape TEXT,
  term_spread DOUBLE PRECISION,
  recorded_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── Technical Indicators ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS technical_indicators (
  id SERIAL PRIMARY KEY,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  symbol TEXT NOT NULL,
  rsi14 DOUBLE PRECISION,
  macd DOUBLE PRECISION,
  macd_signal DOUBLE PRECISION,
  macd_histogram DOUBLE PRECISION,
  bollinger_upper DOUBLE PRECISION,
  bollinger_middle DOUBLE PRECISION,
  bollinger_lower DOUBLE PRECISION,
  atr14 DOUBLE PRECISION,
  obv DOUBLE PRECISION,
  vwap DOUBLE PRECISION,
  support DOUBLE PRECISION,
  resistance DOUBLE PRECISION,
  recorded_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── Indexes for Performance ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_watchlist_items_instrument_id ON watchlist_items(instrument_id);
CREATE INDEX IF NOT EXISTS idx_alerts_instrument_id ON alerts(instrument_id);
CREATE INDEX IF NOT EXISTS idx_quotes_instrument_id ON quotes(instrument_id);
CREATE INDEX IF NOT EXISTS idx_quotes_recorded_at ON quotes(recorded_at);
CREATE INDEX IF NOT EXISTS idx_ohlcv_bars_instrument_id ON ohlcv_bars(instrument_id);
CREATE INDEX IF NOT EXISTS idx_ohlcv_bars_date ON ohlcv_bars(date);
CREATE INDEX IF NOT EXISTS idx_news_instruments_news_id ON news_instruments(news_id);
CREATE INDEX IF NOT EXISTS idx_news_instruments_instrument_id ON news_instruments(instrument_id);
CREATE INDEX IF NOT EXISTS idx_social_mentions_instrument_id ON social_mentions(instrument_id);
CREATE INDEX IF NOT EXISTS idx_social_mentions_recorded_at ON social_mentions(recorded_at);
CREATE INDEX IF NOT EXISTS idx_social_posts_mention_id ON social_posts(mention_id);
CREATE INDEX IF NOT EXISTS idx_options_flow_instrument_id ON options_flow(instrument_id);
CREATE INDEX IF NOT EXISTS idx_options_activity_instrument_id ON options_activity(instrument_id);
CREATE INDEX IF NOT EXISTS idx_whale_transactions_symbol ON whale_transactions(symbol);
CREATE INDEX IF NOT EXISTS idx_whale_transactions_recorded_at ON whale_transactions(recorded_at);
CREATE INDEX IF NOT EXISTS idx_economic_events_date ON economic_events(date);
CREATE INDEX IF NOT EXISTS idx_sector_performance_instrument_id ON sector_performance(instrument_id);
CREATE INDEX IF NOT EXISTS idx_sector_performance_recorded_at ON sector_performance(recorded_at);
CREATE INDEX IF NOT EXISTS idx_market_breadth_recorded_at ON market_breadth(recorded_at);
CREATE INDEX IF NOT EXISTS idx_credit_spreads_recorded_at ON credit_spreads(recorded_at);
CREATE INDEX IF NOT EXISTS idx_vix_term_structure_recorded_at ON vix_term_structure(recorded_at);
CREATE INDEX IF NOT EXISTS idx_technical_indicators_instrument_id ON technical_indicators(instrument_id);
CREATE INDEX IF NOT EXISTS idx_technical_indicators_recorded_at ON technical_indicators(recorded_at);
