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
      high_price = EXCLUDED.high_price,
      low_price = EXCLUDED.low_price,
      close_price = EXCLUDED.close_price,
      volume = EXCLUDED.volume,
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

/**
 * Get historical candles.
 */
async function getHistoricalCandles({ symbol, timeframe = "1m", limit = 200 }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);

  const normalizedSymbol = symbol.toUpperCase();

  // ==========================================
  // 1-MINUTE CANDLES
  // ==========================================

  if (timeframe === "1m") {
    const query = `
      SELECT
        id,
        symbol_id,
        symbol,
        timeframe,
        open_price,
        high_price,
        low_price,
        close_price,
        volume,
        open_time,
        close_time,
        created_at
      FROM candles
      WHERE symbol = $1
        AND timeframe = '1m'
      ORDER BY open_time DESC
      LIMIT $2;
    `;

    const result = await pool.query(query, [normalizedSymbol, safeLimit]);

    return result.rows.reverse().map(formatCandle);
  }

  // ==========================================
  // HIGHER TIMEFRAME SETTINGS
  // ==========================================

  const timeframeMinutes = {
    "5m": 5,
    "15m": 15,
    "1h": 60,
  };

  const minutes = timeframeMinutes[timeframe];

  if (!minutes) {
    throw new Error("Invalid timeframe. Use 1m, 5m, 15m or 1h.");
  }

  // ==========================================
  // AGGREGATE 1m → HIGHER TIMEFRAME
  // ==========================================

  const requiredOneMinuteCandles = safeLimit * minutes;

  const query = `
    SELECT
      symbol_id,
      symbol,
      open_price,
      high_price,
      low_price,
      close_price,
      volume,
      open_time
    FROM candles
    WHERE symbol = $1
      AND timeframe = '1m'
    ORDER BY open_time DESC
    LIMIT $2;
  `;

  const result = await pool.query(query, [
    normalizedSymbol,
    requiredOneMinuteCandles,
  ]);

  const oneMinuteCandles = result.rows.reverse();

  if (oneMinuteCandles.length === 0) {
    return [];
  }

  // ==========================================
  // GROUP 1m CANDLES
  // ==========================================

  const groups = new Map();

  for (const candle of oneMinuteCandles) {
    const openTime = new Date(candle.open_time);

    const timestamp = openTime.getTime();

    const timeframeMs = minutes * 60 * 1000;

    const groupTimestamp = Math.floor(timestamp / timeframeMs) * timeframeMs;

    const groupKey = groupTimestamp;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        symbolId: candle.symbol_id,

        symbol: candle.symbol,

        timeframe,

        open: Number(candle.open_price),

        high: Number(candle.high_price),

        low: Number(candle.low_price),

        close: Number(candle.close_price),

        volume: Number(candle.volume) || 0,

        openTime: new Date(groupTimestamp),
      });

      continue;
    }

    const group = groups.get(groupKey);

    group.high = Math.max(group.high, Number(candle.high_price));

    group.low = Math.min(group.low, Number(candle.low_price));

    group.close = Number(candle.close_price);

    group.volume += Number(candle.volume) || 0;
  }

  // ==========================================
  // FORMAT RESULT
  // ==========================================

  const aggregated = Array.from(groups.values())
    .map((group) => ({
      symbolId: group.symbolId,

      symbol: group.symbol,

      timeframe: group.timeframe,

      open: group.open,

      high: group.high,

      low: group.low,

      close: group.close,

      volume: group.volume,

      openTime: group.openTime,

      closeTime: new Date(group.openTime.getTime() + minutes * 60 * 1000),
    }))
    .sort((a, b) => a.openTime.getTime() - b.openTime.getTime());

  return aggregated.slice(-safeLimit);
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
