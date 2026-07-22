import { extendedStorage } from './storage';

const WHALE_ALERT_BASE = 'https://api.whale-alert.io/v1';

export interface WhaleTransaction {
  id: string;
  blockchain: string;
  symbol: string;
  amount: number;
  usdAmount: number | null;
  fromAddress: string;
  fromLabel: string | null;
  toAddress: string;
  toLabel: string | null;
  timestamp: string;
  txHash: string;
  type: 'transfer' | 'exchange_in' | 'exchange_out' | 'unknown';
}

export interface OnChainResponse {
  transactions: WhaleTransaction[];
  source: string;
  requiresApiKey: boolean;
}

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 3 * 60_000;

// ─── Database Persistence Helpers ─────────────────────────────────────────────
async function persistWhaleTransactionsToDb(transactions: WhaleTransaction[]): Promise<void> {
  if (!extendedStorage || !transactions.length) return;
  try {
    for (const tx of transactions.slice(0, 20)) {
      const instrument = await extendedStorage.getInstrumentBySymbol(tx.symbol);
      await extendedStorage.persistWhaleTransaction({
        instrumentId: instrument?.id ?? null,
        symbol: tx.symbol,
        blockchain: tx.blockchain,
        amount: tx.amount,
        usdAmount: tx.usdAmount,
        fromAddress: tx.fromAddress,
        fromLabel: tx.fromLabel,
        toAddress: tx.toAddress,
        toLabel: tx.toLabel,
        type: tx.type,
        txHash: tx.txHash,
      });
    }
  } catch (e) {
    console.error("Failed to persist whale transactions:", e);
  }
}

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return Promise.resolve(entry.data as T);
  return fn().then(data => {
    cache.set(key, { data, ts: Date.now() });
    return data;
  });
}

async function fetchWhaleTransactions(apiKey: string): Promise<WhaleTransaction[]> {
  const resp = await fetch(`${WHALE_ALERT_BASE}/transactions?api_key=${apiKey}&limit=20`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`Whale Alert HTTP ${resp.status}`);
  const json = (await resp.json()) as any;
  return (json.transactions || []).map((tx: any) => ({
    id: String(tx.id),
    blockchain: tx.blockchain || '',
    symbol: tx.symbol || '',
    amount: parseFloat(tx.amount) || 0,
    usdAmount: tx.usd_amount != null ? parseFloat(tx.usd_amount) : null,
    fromAddress: tx.from?.address || tx.from_address || '',
    fromLabel: tx.from?.label || null,
    toAddress: tx.to?.address || tx.to_address || '',
    toLabel: tx.to?.label || null,
    timestamp: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : new Date().toISOString(),
    txHash: tx.hash || '',
    type: tx.transaction_type || 'unknown',
  }));
}

export async function handleOnChainRequest(query: Record<string, string>): Promise<OnChainResponse> {
  const apiKey = process.env.WHALE_ALERT_API_KEY || '';
  const symbol = query.symbol ? query.symbol.toUpperCase() : undefined;

  if (!apiKey) {
    return { transactions: [], source: 'none', requiresApiKey: true };
  }

  try {
    const transactions = await cached('whale:transactions', () => fetchWhaleTransactions(apiKey));
    const filtered = symbol ? transactions.filter(t => t.symbol === symbol) : transactions;
    
    // Persist to database (fire and forget)
    persistWhaleTransactionsToDb(filtered).catch(() => {});
    
    return { transactions: filtered, source: 'whale-alert', requiresApiKey: false };
  } catch (err: any) {
    return { transactions: [], source: 'error', requiresApiKey: false };
  }
}
