<p align="center">
  <img src="logo/icon.png" alt="BLMTRM Logo" width="120" />
</p>

<h1 align="center">BLMTRM</h1>

<p align="center">
  A hacker-style Bloomberg Terminal clone — real-time market data, charts, news, economics, portfolio analytics, and an AI-powered financial agent.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-18-61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Vite-7-646CFF" alt="Vite" />
  <img src="https://img.shields.io/badge/Express-5-000000" alt="Express" />
  <img src="https://img.shields.io/badge/Tailwind-3-06B6D4" alt="Tailwind" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

---

## What is BLMTRM?

BLMTRM is a full-stack financial terminal that brings the power of a Bloomberg-style workstation to your browser. It features:

- **Real-time Quotes** — Live stock prices with source attribution and freshness indicators
- **Interactive Charts** — Candlestick, line, and area charts with multiple timeframes (5m to 1Y)
- **Market Overview** — Gainers, losers, most active, market sentiment at a glance
- **News Feed** — Curated financial news with full article reading and source tracking
- **Economics Dashboard** — Economic indicators, calendar events, and release details
- **Stock Screener** — Filter by sector, P/E ratio, and more
- **Watchlist** — Track your favorite symbols with persistent storage
- **Price Alerts** — Set above/below price triggers with automatic monitoring
- **Portfolio Analytics** — Position tracking with P&L, allocation, and benchmark comparison
- **AI Agent** — Chat with a Claude-powered financial analyst directly in the terminal
- **Command Bar** — Keyboard-driven navigation (press `/` to open)
- **Split Workspace** — Resizable dual-pane layout for multitasking
- **Remotion Video** — Render demo videos programmatically

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 7, Tailwind CSS 3, shadcn/ui, Recharts, Lightweight Charts |
| Backend | Express 5, TypeScript 5.6 |
| Database | PostgreSQL + Drizzle ORM (optional — in-memory storage works out of the box) |
| AI | Anthropic Claude (Sonnet) via `@anthropic-ai/sdk` |
| Video | Remotion 4 |
| Build | tsx, esbuild |

---

## Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js** >= 20.x ([Download](https://nodejs.org/))
- **npm** >= 10.x (comes with Node.js)
- **Git** ([Download](https://git-scm.com/))

Optional (only if you want persistent database or AI chat):

- **PostgreSQL** >= 16 ([Download](https://www.postgresql.org/download/))
- **Anthropic API Key** ([Get one here](https://console.anthropic.com/))

---

## Quick Start

### 1. Clone the repository

```bash
git clone <your-repo-url> blmtrm
cd blmtrm
```

### 2. Install dependencies

```bash
cd src
npm install
```

### 3. Set up environment variables (optional)

Create a `.env` file inside the `src/` directory if you need database or AI features:

```bash
# src/.env

# PostgreSQL connection (optional — skip to use in-memory storage)
DATABASE_URL=postgresql://user:password@localhost:5432/blmtrm

# Anthropic API key (optional — skip to disable AI chat)
ANTHROPIC_API_KEY=sk-ant-...

# Server port (optional — defaults to 5000)
PORT=5000
```

> **No `.env` file?** The app runs fine without it. You get in-memory storage and the AI chat will show a friendly error if no API key is set.

### 4. Start the development server

```bash
npm run dev
```

The terminal will be available at **http://localhost:5000**.

---

## Setup with PostgreSQL (optional)

If you want persistent storage for watchlists, alerts, and chat history:

### 1. Create a database

```bash
createdb blmtrm
```

Or via psql:

```sql
CREATE DATABASE blmtrm;
```

### 2. Set the connection string

```bash
# src/.env
DATABASE_URL=postgresql://user:password@localhost:5432/blmtrm
```

### 3. Push the schema

```bash
npm run db:push
```

This uses Drizzle Kit to create the required tables (`watchlist_items`, `alerts`, `chat_messages`).

---

## Available Scripts

All commands run from the `src/` directory:

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm start` | Run production build |
| `npm test` | Run test suite |
| `npm run check` | TypeScript type checking |
| `npm run db:push` | Push database schema to PostgreSQL |
| `npm run video:studio` | Open Remotion Studio for video editing |
| `npm run video:render` | Render demo video to `out/blmtrm-demo.mp4` |

---

## Project Structure

```
blmtrm/
├── logo/                    # App icon
├── docs/                    # Project documentation
│   ├── live/                # Active focus, progress, todos
│   └── reference/           # Architecture, design, codemap
├── src/                     # All source code
│   ├── client/              # React frontend
│   │   └── src/
│   │       ├── components/  # UI components (panels, terminal, ui/)
│   │       ├── hooks/       # React hooks
│   │       ├── lib/         # Utilities, types, commands
│   │       └── pages/       # Page components (Terminal)
│   ├── server/              # Express backend
│   │   ├── index.ts         # Server entry point
│   │   ├── routes.ts        # API route definitions
│   │   ├── marketData.ts    # Market data providers
│   │   ├── economicsData.ts # Economic data providers
│   │   ├── alertsEngine.ts  # Price alert evaluation
│   │   ├── storage.ts       # In-memory / DB storage layer
│   │   └── vite.ts          # Vite dev server integration
│   ├── shared/              # Shared types and schema
│   │   └── schema.ts        # Drizzle + Zod schemas
│   ├── remotion/            # Video compositions
│   ├── script/              # Build scripts
│   ├── package.json         # Dependencies and scripts
│   ├── vite.config.ts       # Vite configuration
│   ├── drizzle.config.ts    # Drizzle ORM configuration
│   └── tsconfig.json        # TypeScript configuration
├── AGENTS.md                # AI agent instructions
└── README.md                # You are here
```

---

## Using the Terminal

### Navigation

The terminal has a sidebar with these views:

| View | Description |
|------|-------------|
| **Market** | Market overview with gainers, losers, most active |
| **Quote** | Detailed stock quote with key metrics |
| **Chart** | Interactive price chart with timeframe selector |
| **News** | Financial news feed with article reader |
| **Screener** | Stock screener with sector and P/E filters |
| **Watchlist** | Your tracked symbols |
| **Alerts** | Price alert management |
| **Economics** | Economic indicators and calendar |
| **Portfolio** | Portfolio analytics and P&L tracking |
| **Agent** | AI-powered financial chat assistant |

### Command Bar

Press `/` anywhere to open the command bar. Type commands like:

- `AAPL` — Jump to Apple quote
- `chart TSLA` — Open Tesla chart
- `news NVDA` — View NVIDIA news
- `market` — Go to market overview

### Split View

Click the split icon in the workspace header to open a second pane. Drag the divider to resize. Each pane can show a different view or symbol independently.

---

## API Endpoints

The backend exposes these REST endpoints:

### Finance Data

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/finance/quotes?symbols=AAPL,MSFT` | GET | Real-time quotes |
| `/api/finance/tick?symbols=AAPL` | GET | Lightweight tick data |
| `/api/finance/ohlcv?symbol=AAPL&range=1Y&interval=1d` | GET | OHLCV candlestick data |
| `/api/finance/sparklines` | GET | Index sparkline data |
| `/api/finance/gainers` | GET | Top gaining stocks |
| `/api/finance/losers` | GET | Top losing stocks |
| `/api/finance/active` | GET | Most active stocks |
| `/api/finance/sentiment` | GET | Market sentiment |
| `/api/finance/news?symbol=AAPL` | GET | News for a symbol |
| `/api/finance/news/read?url=...` | GET | Full article content |
| `/api/finance/economics` | GET | Economic indicators snapshot |
| `/api/finance/economics/calendar` | GET | Economic event calendar |
| `/api/finance/economics/events/:releaseId` | GET | Economic event details |
| `/api/finance/peers?symbol=AAPL` | GET | Peer companies |
| `/api/finance/screener?sector=Technology` | GET | Stock screener results |
| `/api/finance/portfolio-analytics` | POST | Portfolio analytics |

### Watchlist

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/watchlist` | GET | Get watchlist items |
| `/api/watchlist` | POST | Add to watchlist |
| `/api/watchlist/:id` | DELETE | Remove from watchlist |

### Alerts

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/alerts` | GET | Get all alerts |
| `/api/alerts` | POST | Create an alert |
| `/api/alerts/:id` | DELETE | Delete an alert |

### AI Chat

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | GET | Get chat history |
| `/api/chat` | POST | Send message (SSE streaming) |
| `/api/chat` | DELETE | Clear chat history |

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `5000` | Server listen port |
| `DATABASE_URL` | No | — | PostgreSQL connection string. Omit to use in-memory storage |
| `ANTHROPIC_API_KEY` | No | — | Anthropic API key for AI chat. Omit to disable AI agent |
| `NODE_ENV` | No | `development` | `development` enables Vite HMR; `production` serves static build |

---

## Production Build

```bash
cd src
npm run build
NODE_ENV=production npm start
```

The build outputs to `src/dist/`. The production server serves the static frontend and API on a single port.

---

## Video Rendering (Remotion)

BLMTRM includes Remotion for rendering demo videos:

```bash
cd src
npm run video:studio     # Open Remotion Studio GUI
npm run video:render     # Render to out/blmtrm-demo.mp4
```

---

## Troubleshooting

### Port already in use

```bash
PORT=3000 npm run dev
```

### Database connection errors

Make sure PostgreSQL is running and `DATABASE_URL` is correct. To skip the database entirely, remove `DATABASE_URL` from your `.env` — the app uses in-memory storage by default.

### AI chat not working

Verify your `ANTHROPIC_API_KEY` is set and valid. Without it, the chat panel will show a fallback message.

### Node version issues

Check your version:

```bash
node --version   # Should be >= 20.x
npm --version    # Should be >= 10.x
```

---

## License

MIT
