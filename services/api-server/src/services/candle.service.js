const { pool } = require("../config/database");

/*
|--------------------------------------------------------------------------
| Candle Service
|--------------------------------------------------------------------------
|
| Base timeframe:
|     1 minute
|
| Price tick:
|     BID price
|
| Example:
|
| 10:20:02 -> 3460.20
| 10:20:04 -> 3460.55
| 10:20:06 -> 3459.90
|
| Result:
|
| OPEN  = 3460.20
| HIGH  = 3460.55
| LOW   = 3459.90
| CLOSE = latest price
|
|--------------------------------------------------------------------------
*/

const BASE_TIMEFRAME = "1m";

/**
 * Keep currently active candles in memory.
 *
 * Structure:
 *
 * {
 *   XAUUSD: {
 *     symbolId,
 *     symbol,
 *     timeframe,
 *     openPrice,
 *     highPrice,
 *     lowPrice,
 *     closePrice,
 *     volume,
 *     openTime,
 *     closeTime
 *   }
 * }
 */
const activeCandles = new Map();

/**
 * The live (current minute) candle is saved to the DB every few seconds,
 * so the API server (a separate process) can serve a correct, complete
 * current candle to the chart. Without this the chart only knew about
 * candles AFTER the minute had finished.
 */
const PERSIST_INTERVAL_MS = 3000;
const lastPersistAt = new Map();

function persistActiveCandle(candle) {
  const now = Date.now();
  const last = lastPersistAt.get(candle.symbol) || 0;

  if (now - last < PERSIST_INTERVAL_MS) {
    return;
  }

  lastPersistAt.set(candle.symbol, now);

  saveCandle(candle).catch((error) => {
    console.error("[CANDLE] partial save failed:", error.message);
  });
}

/**
 * Convert Date into the beginning of its minute.
 *
 * Example:
 *
 * 10:25:43
 *       ↓
 * 10:25:00
 */
function getMinuteStart(date = new Date()) {
  const result = new Date(date);

  result.setSeconds(0, 0);

  return result;
}

/**
 * Get the end of a one-minute candle.
 *
 * Example:
 *
 * openTime  = 10:25:00
 * closeTime = 10:26:00
 */
function getMinuteEnd(openTime) {
  const result = new Date(openTime);

  result.setMinutes(result.getMinutes() + 1);

  return result;
}

/**
 * Convert DB candle to API-friendly object.
 */
function formatCandle(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,

    symbolId: row.symbol_id,

    symbol: row.symbol,

    timeframe: row.timeframe,

    open: Number(row.open_price),

    high: Number(row.high_price),

    low: Number(row.low_price),

    close: Number(row.close_price),

    volume: Number(row.volume),

    openTime: row.open_time,

    closeTime: row.close_time,
  };
}

/**
 * Save a completed candle.
 */
async function saveCandle(candle) {
  const query = `
    INSERT INTO candles (
      symbol_id,
      symbol,
      timeframe,
      open_price,
      high_price,
      low_price,
      close_price,
      volume,
      open_time,
      close_time
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10
    )
    ON CONFLICT (
      symbol_id,
      timeframe,
      open_time
    )
    DO UPDATE SET
      high_price = GREATEST(candles.high_price, EXCLUDED.high_price),
      low_price = LEAST(candles.low_price, EXCLUDED.low_price),
      close_price = EXCLUDED.close_price,
      volume = GREATEST(candles.volume, EXCLUDED.volume),
      close_time = EXCLUDED.close_time
    RETURNING *;
  `;

  const values = [
    candle.symbolId,
    candle.symbol,
    candle.timeframe,
    candle.openPrice,
    candle.highPrice,
    candle.lowPrice,
    candle.closePrice,
    candle.volume,
    candle.openTime,
    candle.closeTime,
  ];

  const result = await pool.query(query, values);

  return formatCandle(result.rows[0]);
}

/**
 * Process one live price tick.
 *
 * This function:
 *
 * 1. Finds current 1-minute candle
 * 2. Creates candle if required
 * 3. Updates HIGH / LOW / CLOSE
 * 4. Finalizes previous candle when minute changes
 */
async function processPriceTick({
  symbolId,
  symbol,
  bid,
  volume = 0,
  timestamp = new Date(),
}) {
  if (!symbolId) {
    throw new Error("symbolId is required");
  }

  if (!symbol) {
    throw new Error("symbol is required");
  }

  const price = Number(bid);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Valid bid price is required");
  }

  const tickTime = new Date(timestamp);

  const minuteStart = getMinuteStart(tickTime);

  const minuteEnd = getMinuteEnd(minuteStart);

  let candle = activeCandles.get(symbol);

  /*
  |--------------------------------------------------------------------------
  | No active candle
  |--------------------------------------------------------------------------
  */

  if (!candle) {
    candle = {
      symbolId,

      symbol,

      timeframe: BASE_TIMEFRAME,

      openPrice: price,

      highPrice: price,

      lowPrice: price,

      closePrice: price,

      volume: Number(volume) || 0,

      openTime: minuteStart,

      closeTime: minuteEnd,
    };

    activeCandles.set(symbol, candle);

    persistActiveCandle(candle);

    return {
      status: "created",

      candle: formatCandleFromMemory(candle),
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Same minute
  |--------------------------------------------------------------------------
  */

  const sameMinute = candle.openTime.getTime() === minuteStart.getTime();

  if (sameMinute) {
    candle.highPrice = Math.max(candle.highPrice, price);

    candle.lowPrice = Math.min(candle.lowPrice, price);

    candle.closePrice = price;

    candle.volume += Number(volume) || 0;

    persistActiveCandle(candle);

    return {
      status: "updated",

      candle: formatCandleFromMemory(candle),
    };
  }

  /*
  |--------------------------------------------------------------------------
  | New minute
  |--------------------------------------------------------------------------
  */

  const completedCandle = await saveCandle(candle);

  /*
  |--------------------------------------------------------------------------
  | Create new candle
  |--------------------------------------------------------------------------
  */

  const newCandle = {
    symbolId,

    symbol,

    timeframe: BASE_TIMEFRAME,

    openPrice: price,

    highPrice: price,

    lowPrice: price,

    closePrice: price,

    volume: Number(volume) || 0,

    openTime: minuteStart,

    closeTime: minuteEnd,
  };

  activeCandles.set(symbol, newCandle);

  lastPersistAt.set(symbol, 0);
  persistActiveCandle(newCandle);

  return {
    status: "new_candle",

    completedCandle,

    candle: formatCandleFromMemory(newCandle),
  };
}

/**
 * Convert memory candle to API object.
 */
function formatCandleFromMemory(candle) {
  return {
    symbolId: candle.symbolId,

    symbol: candle.symbol,

    timeframe: candle.timeframe,

    open: Number(candle.openPrice),

    high: Number(candle.highPrice),

    low: Number(candle.lowPrice),

    close: Number(candle.closePrice),

    volume: Number(candle.volume),

    openTime: candle.openTime,

    closeTime: candle.closeTime,
  };
}

/**
 * Get currently active candle.
 */
function getActiveCandle(symbol) {
  const candle = activeCandles.get(symbol);

  if (!candle) {
    return null;
  }

  return formatCandleFromMemory(candle);
}

/*
|--------------------------------------------------------------------------
| Timeframes
|--------------------------------------------------------------------------
| minutes  -> bucket size
| provider -> Twelve Data interval used for deep history
| ttl      -> how long provider history is cached (rate-limit friendly)
*/
const TIMEFRAMES = {
  "1m": { minutes: 1, provider: "1min", ttl: 20 * 1000 },
  "5m": { minutes: 5, provider: "5min", ttl: 45 * 1000 },
  "15m": { minutes: 15, provider: "15min", ttl: 90 * 1000 },
  "30m": { minutes: 30, provider: "30min", ttl: 2 * 60 * 1000 },
  "1h": { minutes: 60, provider: "1h", ttl: 5 * 60 * 1000 },
  "4h": { minutes: 240, provider: "4h", ttl: 10 * 60 * 1000 },
  "1d": { minutes: 1440, provider: "1day", ttl: 15 * 60 * 1000 },
};

const TWELVE_REST_URL =
  process.env.TWELVE_DATA_REST_URL ||
  "https://api.twelvedata.com/time_series";

const providerSymbolMap = new Map(
  (
    process.env.TWELVE_DATA_SYMBOLS ||
    "XAUUSD:XAU/USD,EURUSD:EUR/USD,GBPUSD:GBP/USD,BTCUSD:BTC/USD"
  )
    .split(",")
    .map((item) => item.split(":").map((part) => part.trim()))
    .filter(([internal, provider]) => internal && provider)
    .map(([internal, provider]) => [internal.toUpperCase(), provider]),
);

const SPREADS = {
  XAUUSD: Number(process.env.MARKET_SPREAD_XAUUSD || 0.3),
  EURUSD: Number(process.env.MARKET_SPREAD_EURUSD || 0.0002),
  GBPUSD: Number(process.env.MARKET_SPREAD_GBPUSD || 0.0002),
  BTCUSD: Number(process.env.MARKET_SPREAD_BTCUSD || 50),
};

function priceDigits(symbol) {
  return symbol === "XAUUSD" || symbol === "BTCUSD" ? 2 : 5;
}

const providerCache = new Map();
const providerInflight = new Map();

/**
 * Twelve Data returns MID prices, while the live ticks stored by
 * TradeX are BID prices (mid - spread/2). Convert so that history and
 * live candles line up perfectly on the same chart.
 */
function midToBid(symbol, value) {
  const spread = SPREADS[symbol] || 0;

  return Number((Number(value) - spread / 2).toFixed(priceDigits(symbol)));
}

function parseProviderTime(text) {
  const value = String(text).trim();

  const iso = value.includes(" ")
    ? `${value.replace(" ", "T")}Z`
    : `${value}T00:00:00Z`;

  return new Date(iso);
}

async function fetchProviderCandles(symbol, timeframe, limit) {
  const config = TIMEFRAMES[timeframe];
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  const providerSymbol = providerSymbolMap.get(symbol);

  if (!apiKey || !providerSymbol || typeof fetch !== "function") {
    return [];
  }

  const cacheKey = `${symbol}|${timeframe}`;
  const cached = providerCache.get(cacheKey);

  if (
    cached &&
    Date.now() - cached.at < config.ttl &&
    cached.candles.length >= Math.min(limit, cached.requested)
  ) {
    return cached.candles;
  }

  if (providerInflight.has(cacheKey)) {
    return providerInflight.get(cacheKey);
  }

  const task = (async () => {
    try {
      const outputsize = Math.min(Math.max(limit, 50), 1000);

      const url = new URL(TWELVE_REST_URL);

      url.searchParams.set("symbol", providerSymbol);
      url.searchParams.set("interval", config.provider);
      url.searchParams.set("outputsize", String(outputsize));
      url.searchParams.set("timezone", "UTC");
      url.searchParams.set("order", "ASC");
      url.searchParams.set("apikey", apiKey);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(url, { signal: controller.signal });

      clearTimeout(timer);

      const body = await response.json();

      if (!Array.isArray(body?.values)) {
        throw new Error(body?.message || "No candle values returned");
      }

      const minutes = config.minutes;

      const candles = body.values
        .map((row) => {
          const openTime = parseProviderTime(row.datetime);

          return {
            symbol,
            timeframe,
            open: midToBid(symbol, row.open),
            high: midToBid(symbol, row.high),
            low: midToBid(symbol, row.low),
            close: midToBid(symbol, row.close),
            volume: Number(row.volume) || 0,
            openTime,
            closeTime: new Date(openTime.getTime() + minutes * 60000),
          };
        })
        .filter(
          (candle) =>
            !Number.isNaN(candle.openTime.getTime()) &&
            [candle.open, candle.high, candle.low, candle.close].every(
              (value) => Number.isFinite(value) && value > 0,
            ),
        );

      providerCache.set(cacheKey, {
        at: Date.now(),
        requested: outputsize,
        candles,
      });

      return candles;
    } catch (error) {
      console.warn(
        `[CANDLE] provider history unavailable for ${symbol} ${timeframe}: ${error.message}`,
      );

      return cached ? cached.candles : [];
    } finally {
      providerInflight.delete(cacheKey);
    }
  })();

  providerInflight.set(cacheKey, task);

  return task;
}

/**
 * Candles built from OUR OWN live ticks (stored 1m candles),
 * grouped into the requested timeframe.
 */
async function getStoredCandles(symbol, timeframe, limit) {
  const minutes = TIMEFRAMES[timeframe].minutes;

  const rowsNeeded = Math.min(limit * minutes, 60000);

  const result = await pool.query(
    `
    SELECT symbol_id, symbol, open_price, high_price, low_price,
           close_price, volume, open_time
    FROM candles
    WHERE symbol = $1
      AND timeframe = '1m'
    ORDER BY open_time DESC
    LIMIT $2;
    `,
    [symbol, rowsNeeded],
  );

  const rows = result.rows.reverse();

  if (minutes === 1) {
    return rows.map((row) => ({
      symbolId: row.symbol_id,
      symbol: row.symbol,
      timeframe,
      open: Number(row.open_price),
      high: Number(row.high_price),
      low: Number(row.low_price),
      close: Number(row.close_price),
      volume: Number(row.volume) || 0,
      openTime: new Date(row.open_time),
      closeTime: new Date(new Date(row.open_time).getTime() + 60000),
    }));
  }

  const bucketMs = minutes * 60000;
  const groups = new Map();

  for (const row of rows) {
    const time = new Date(row.open_time).getTime();
    const key = Math.floor(time / bucketMs) * bucketMs;
    const group = groups.get(key);

    if (!group) {
      groups.set(key, {
        symbolId: row.symbol_id,
        symbol: row.symbol,
        timeframe,
        open: Number(row.open_price),
        high: Number(row.high_price),
        low: Number(row.low_price),
        close: Number(row.close_price),
        volume: Number(row.volume) || 0,
        openTime: new Date(key),
        closeTime: new Date(key + bucketMs),
      });
      continue;
    }

    group.high = Math.max(group.high, Number(row.high_price));
    group.low = Math.min(group.low, Number(row.low_price));
    group.close = Number(row.close_price);
    group.volume += Number(row.volume) || 0;
  }

  return Array.from(groups.values());
}

/**
 * Merge provider history with our own live candles.
 *
 * - Old candles  : provider (complete, correct OHLC)
 * - Newest candle: provider open + OUR live high/low/close
 *   (provider history can lag by a few seconds)
 */
function mergeCandles(providerCandles, storedCandles, timeframe) {
  const bucketMs = TIMEFRAMES[timeframe].minutes * 60000;

  const merged = new Map();

  for (const candle of providerCandles) {
    merged.set(candle.openTime.getTime(), { ...candle });
  }

  const newestAllowed = Date.now() - bucketMs * 2;

  for (const stored of storedCandles) {
    const key = stored.openTime.getTime();
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, { ...stored });
      continue;
    }

    if (key >= newestAllowed) {
      existing.high = Math.max(existing.high, stored.high);
      existing.low = Math.min(existing.low, stored.low);
      existing.close = stored.close;
      existing.volume = Math.max(existing.volume, stored.volume);
    }
  }

  return Array.from(merged.values()).sort(
    (a, b) => a.openTime.getTime() - b.openTime.getTime(),
  );
}

/**
 * Remove candles that are obviously wrong (old demo-feed prices,
 * bad provider rows). One bad candle makes the whole chart "squeeze"
 * because the price axis stretches to include it.
 */
function removeOutliers(candles, timeframe) {
  if (candles.length < 5) {
    return candles;
  }

  const maxDeviation = {
    "1m": 0.05,
    "5m": 0.05,
    "15m": 0.06,
    "30m": 0.08,
    "1h": 0.1,
    "4h": 0.2,
    "1d": 0.6,
  }[timeframe];

  const anchor = candles[candles.length - 1].close;

  return candles.filter(
    (candle) =>
      candle.high >= candle.low &&
      Math.abs(candle.close - anchor) / anchor <= maxDeviation &&
      Math.abs(candle.high - anchor) / anchor <= maxDeviation &&
      Math.abs(candle.low - anchor) / anchor <= maxDeviation,
  );
}

/**
 * Get historical candles.
 */
async function getHistoricalCandles({ symbol, timeframe = "1m", limit = 200 }) {
  if (!TIMEFRAMES[timeframe]) {
    throw new Error(
      `Invalid timeframe. Use ${Object.keys(TIMEFRAMES).join(", ")}.`,
    );
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);

  const normalizedSymbol = symbol.toUpperCase();

  const [providerCandles, storedCandles] = await Promise.all([
    fetchProviderCandles(normalizedSymbol, timeframe, safeLimit),
    getStoredCandles(normalizedSymbol, timeframe, safeLimit).catch((error) => {
      console.error("[CANDLE] stored candles failed:", error.message);
      return [];
    }),
  ]);

  const merged = removeOutliers(
    mergeCandles(providerCandles, storedCandles, timeframe),
    timeframe,
  );

  return merged.slice(-safeLimit);
}

/**
 * Save all active candles.
 *
 * Useful before server shutdown.
 */
async function flushActiveCandles() {
  const candles = Array.from(activeCandles.values());

  for (const candle of candles) {
    await saveCandle(candle);
  }

  activeCandles.clear();

  console.log(`Candle engine flushed ${candles.length} active candle(s).`);
}

module.exports = {
  processPriceTick,
  getActiveCandle,
  getHistoricalCandles,
  flushActiveCandles,
};