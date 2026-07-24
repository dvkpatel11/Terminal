const COMMON_TICKERS_CLIENT = new Set([
  "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "META", "TSLA", "BRK.B",
  "UNH", "JNJ", "V", "XOM", "JPM", "PG", "MA", "HD", "CVX", "MRK", "ABBV",
  "LLY", "PEP", "KO", "COST", "AVGO", "TMO", "MCD", "WMT", "CSCO", "ACN",
  "ABT", "DHR", "NEE", "LIN", "TXN", "PM", "UNP", "RTX", "LOW", "HON",
  "CRM", "ORCL", "NKE", "INTC", "QCOM", "AMD", "BA", "GS", "CAT", "DE",
  "PLTR", "SOFI", "COIN", "SQ", "SNAP", "UBER", "LYFT", "ABNB", "RIVN",
  "LCID", "NIO", "XPEV", "BABA", "JD", "PDD", "BIDU", "MU",
  "SPY", "QQQ", "IWM", "DIA", "VTI", "VOO", "ARKK", "ARKG",
  "BTC-USD", "ETH-USD", "SOL-USD", "DOGE-USD", "ADA-USD", "XRP-USD",
  "GLD", "SLV", "USO", "TLT", "HYG", "EEM", "FXI",
]);

const COMPANY_NAMES_CLIENT: Record<string, string> = {
  "apple": "AAPL", "microsoft": "MSFT", "google": "GOOGL", "alphabet": "GOOGL",
  "amazon": "AMZN", "nvidia": "NVDA", "meta": "META", "facebook": "META",
  "tesla": "TSLA", "berkshire": "BRK.B", "unitedhealth": "UNH", "johnson": "JNJ",
  "visa": "V", "exxon": "XOM", "jpmorgan": "JPM", "jp morgan": "JPM",
  "procter": "PG", "mastercard": "MA", "home depot": "HD", "chevron": "CVX",
  "pfizer": "PFE", "moderna": "MRNA", "netflix": "NFLX", "disney": "DIS",
  "intel": "INTC", "qualcomm": "QCOM", "amd": "AMD", "broadcom": "AVGO",
  "palantir": "PLTR", "sofi": "SOFI", "coinbase": "COIN", "block": "SQ",
  "snap": "SNAP", "uber": "UBER", "airbnb": "ABNB", "rivian": "RIVN",
  "nio": "NIO", "alibaba": "BABA", "jd.com": "JD", "pinduoduo": "PDD",
  "blackrock": "BLK", "goldman": "GS", "morgan stanley": "MS",
  "caterpillar": "CAT", "deere": "DE", "boeing": "BA",
};

export function extractTickers(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const dollarMatches = Array.from(text.matchAll(/\$([A-Z]{2,5})\b/g));
  for (const m of dollarMatches) {
    if (!seen.has(m[1])) { seen.add(m[1]); found.push(m[1]); }
  }

  const bareMatches = Array.from(text.matchAll(/\b([A-Z]{2,5})\b/g));
  for (const m of bareMatches) {
    if (COMMON_TICKERS_CLIENT.has(m[1]) && !seen.has(m[1])) {
      seen.add(m[1]); found.push(m[1]);
    }
  }

  const lowerText = text.toLowerCase();
  for (const [name, ticker] of Object.entries(COMPANY_NAMES_CLIENT)) {
    if (seen.has(ticker)) continue;
    const idx = lowerText.indexOf(name);
    if (idx !== -1) {
      const before = idx === 0 || /[\s('""\-\[]/.test(lowerText[idx - 1]);
      const after = idx + name.length >= lowerText.length || /[\s,;.!?)\]:'"\/\-]/.test(lowerText[idx + name.length]);
      if (before && after) {
        seen.add(ticker);
        found.push(ticker);
      }
    }
  }

  return found;
}
