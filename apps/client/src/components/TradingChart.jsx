import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  CrosshairMode,
  LineStyle,
} from "lightweight-charts";

import api from "../services/api";

/*
=========================================================
TRADEX LIVE CHART  (TradingView style)

- Candles + tick volume
- BID line (last price) and ASK line, updated live
- SELL / BUY quote box with spread (like TradingView)
- Open positions: ENTRY, STOP LOSS and TAKE PROFIT lines
  with live P/L, plus BUY / SELL arrows on the candle
- Shows a normal number of candles (no more "squeezed" chart)
- Time axis in the user's LOCAL time zone
=========================================================
*/

const TIMEFRAMES = [
  { label: "1m", value: "1m", ms: 60_000 },
  { label: "5m", value: "5m", ms: 5 * 60_000 },
  { label: "15m", value: "15m", ms: 15 * 60_000 },
  { label: "30m", value: "30m", ms: 30 * 60_000 },
  { label: "1H", value: "1h", ms: 60 * 60_000 },
  { label: "4H", value: "4h", ms: 4 * 60 * 60_000 },
  { label: "1D", value: "1d", ms: 24 * 60 * 60_000 },
];

const SYMBOL_NAMES = {
  XAUUSD: "Gold Spot / U.S. Dollar",
  EURUSD: "Euro / U.S. Dollar",
  GBPUSD: "British Pound / U.S. Dollar",
  BTCUSD: "Bitcoin / U.S. Dollar",
};

const THEMES = {
  dark: {
    background: "#0b1220",
    text: "#9ca3af",
    grid: "#161f31",
    border: "#243049",
    crosshair: "#6b7280",
    labelBg: "#1f2937",
  },
  light: {
    background: "#ffffff",
    text: "#131722",
    grid: "#f0f3fa",
    border: "#e0e3eb",
    crosshair: "#9598a1",
    labelBg: "#131722",
  },
};

const UP = "#089981";
const DOWN = "#f23645";
const BUY_BLUE = "#2962ff";
const ASK_COLOR = "#2962ff";

/* Number of candles shown when the chart opens (TradingView-like). */
const VISIBLE_BARS = 110;
const BAR_SPACING = 9;

function getDigits(symbol) {
  const name = String(symbol || "").toUpperCase();

  if (name === "XAUUSD" || name === "BTCUSD") return 2;
  if (name.endsWith("JPY")) return 3;

  return 5;
}

function toNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function bucketStartSeconds(timeMs, frameMs) {
  return Math.floor((Math.floor(timeMs / frameMs) * frameMs) / 1000);
}

const pad = (value) => String(value).padStart(2, "0");

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* Chart time is UTC seconds; show it in the browser's local time. */
function formatCrosshairTime(seconds) {
  const date = new Date(seconds * 1000);

  const day = `${WEEKDAYS[date.getDay()]} ${pad(date.getDate())} ${
    MONTHS[date.getMonth()]
  } '${String(date.getFullYear()).slice(2)}`;

  return `${day}  ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTick(seconds, tickType) {
  const date = new Date(seconds * 1000);

  switch (tickType) {
    case 0:
      return String(date.getFullYear());
    case 1:
      return MONTHS[date.getMonth()];
    case 2:
      return String(date.getDate());
    default:
      return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}

function money(value) {
  const number = Number(value) || 0;

  return `${number >= 0 ? "+" : "-"}$${Math.abs(number).toFixed(2)}`;
}

function formatVolume(value) {
  const number = Number(value) || 0;

  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(2)}K`;

  return String(Math.round(number));
}

/*
 One bad candle (old demo data, a provider glitch) stretches the
 price axis and "squeezes" all real candles. Sort, de-duplicate
 and drop candles that are impossible.
*/
function cleanCandles(rawCandles) {
  const byTime = new Map();

  for (const candle of rawCandles) {
    const time = Math.floor(new Date(candle.openTime).getTime() / 1000);

    const open = toNumber(candle.open);
    const high = toNumber(candle.high);
    const low = toNumber(candle.low);
    const close = toNumber(candle.close);

    if (
      !Number.isFinite(time) ||
      [open, high, low, close].some((value) => value === null || value <= 0)
    ) {
      continue;
    }

    byTime.set(time, {
      time,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
      volume: toNumber(candle.volume) || 0,
    });
  }

  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

function volumeColor(candle) {
  return candle.close >= candle.open
    ? "rgba(8,153,129,0.45)"
    : "rgba(242,54,69,0.45)";
}

export default function TradingChart({
  symbol = "XAUUSD",
  bid = 0,
  ask = 0,
  positions = [],
  onSell,
  onBuy,
}) {
  const containerRef = useRef(null);

  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const markersRef = useRef(null);

  const lastCandleRef = useRef(null);
  const readyRef = useRef(false);
  const lastBidRef = useRef(0);
  const bidRef = useRef(0);

  const askLineRef = useRef(null);
  const positionLinesRef = useRef(new Map());

  const lastTickAtRef = useRef(0);
  const hiddenAtRef = useRef(0);

  const [timeframe, setTimeframe] = useState("5m");
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("tradex_chart_theme") || "dark";
    } catch {
      return "dark";
    }
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [lastCandle, setLastCandle] = useState(null);
  const [hoverCandle, setHoverCandle] = useState(null);
  const [live, setLive] = useState(false);

  const digits = getDigits(symbol);
  const frame = TIMEFRAMES.find((item) => item.value === timeframe);
  const palette = THEMES[theme];

  const currentBid = toNumber(bid);
  const currentAsk = toNumber(ask);

  /* latest bid for callbacks (declared before the effects that read it) */
  useEffect(() => {
    bidRef.current = currentBid || 0;
  }, [currentBid]);

  /* ---------------- CREATE CHART (once) ---------------- */

  useEffect(() => {
    const container = containerRef.current;

    if (!container) return undefined;

    const start = THEMES[theme];

    const chart = createChart(container, {
      autoSize: true,

      layout: {
        background: { color: start.background },
        textColor: start.text,
        fontSize: 12,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
        attributionLogo: false,
      },

      grid: {
        vertLines: { color: start.grid },
        horzLines: { color: start.grid },
      },

      rightPriceScale: {
        borderColor: start.border,
        scaleMargins: { top: 0.14, bottom: 0.2 },
        minimumWidth: 96,
      },

      timeScale: {
        borderColor: start.border,
        timeVisible: true,
        secondsVisible: false,
        barSpacing: BAR_SPACING,
        minBarSpacing: 2,
        rightOffset: 10,
        tickMarkFormatter: (time, tickType) => formatTick(time, tickType),
      },

      localization: {
        timeFormatter: (time) => formatCrosshairTime(time),
      },

      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: start.crosshair,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: start.labelBg,
        },
        horzLine: {
          color: start.crosshair,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: start.labelBg,
        },
      },

      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },

      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: { time: true, price: true },
      },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceLineVisible: true,
      priceLineStyle: LineStyle.Dotted,
      priceLineWidth: 1,
      lastValueVisible: true,
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "tick-volume",
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chart.priceScale("tick-volume").applyOptions({
      scaleMargins: { top: 0.87, bottom: 0 },
    });

    chart.subscribeCrosshairMove((param) => {
      const point = param.seriesData?.get(candles);

      if (!param.time || !point) {
        setHoverCandle(null);
        return;
      }

      const volumePoint = param.seriesData.get(volume);

      setHoverCandle({
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: volumePoint?.value || 0,
      });
    });

    chartRef.current = chart;
    candleSeriesRef.current = candles;
    volumeSeriesRef.current = volume;
    markersRef.current = createSeriesMarkers(candles, []);

    const lines = positionLinesRef.current;

    return () => {
      lines.clear();
      askLineRef.current = null;

      try {
        chart.remove();
      } catch {
        /* already removed */
      }

      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      markersRef.current = null;
      lastCandleRef.current = null;
      readyRef.current = false;
    };
    // The chart is created once; theme changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- THEME ---------------- */

  useEffect(() => {
    const chart = chartRef.current;

    if (!chart) return;

    chart.applyOptions({
      layout: {
        background: { color: palette.background },
        textColor: palette.text,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      rightPriceScale: { borderColor: palette.border },
      timeScale: { borderColor: palette.border },
      crosshair: {
        vertLine: {
          color: palette.crosshair,
          labelBackgroundColor: palette.labelBg,
        },
        horzLine: {
          color: palette.crosshair,
          labelBackgroundColor: palette.labelBg,
        },
      },
    });

    try {
      localStorage.setItem("tradex_chart_theme", theme);
    } catch {
      /* storage not available */
    }
  }, [theme, palette]);

  /* ---------------- PRICE FORMAT (per symbol) ---------------- */

  useEffect(() => {
    const series = candleSeriesRef.current;

    if (!series) return;

    series.applyOptions({
      priceFormat: {
        type: "price",
        precision: digits,
        minMove: 1 / 10 ** digits,
      },
    });
  }, [digits, symbol]);

  /* ---------------- ONE LIVE TICK -> CURRENT CANDLE ---------------- */

  const applyTick = useCallback(
    (price) => {
      const candles = candleSeriesRef.current;
      const volumeSeries = volumeSeriesRef.current;

      if (!candles || !readyRef.current || !price || price <= 0 || !frame) {
        return;
      }

      const bucket = bucketStartSeconds(Date.now(), frame.ms);
      const previous = lastCandleRef.current;

      let next;

      if (!previous || bucket > previous.time) {
        /* a new candle opens at the previous close: no visual gaps */
        const open = previous ? previous.close : price;

        next = {
          time: bucket,
          open,
          high: Math.max(open, price),
          low: Math.min(open, price),
          close: price,
          volume: 1,
        };
      } else {
        next = {
          ...previous,
          high: Math.max(previous.high, price),
          low: Math.min(previous.low, price),
          close: price,
          volume: (previous.volume || 0) + 1,
        };
      }

      lastCandleRef.current = next;

      candles.update({
        time: next.time,
        open: next.open,
        high: next.high,
        low: next.low,
        close: next.close,
      });

      volumeSeries?.update({
        time: next.time,
        value: next.volume,
        color: volumeColor(next),
      });

      lastTickAtRef.current = Date.now();
    },
    [frame],
  );

  /* ---------------- LOAD HISTORY ---------------- */

  useEffect(() => {
    const candles = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const chart = chartRef.current;

    if (!symbol || !candles || !volumeSeries || !chart) return undefined;

    let cancelled = false;

    readyRef.current = false;
    lastCandleRef.current = null;
    candles.setData([]);
    volumeSeries.setData([]);

    async function load() {
      try {
        setLoading(true);
        setError("");
        setLastCandle(null);
        setHoverCandle(null);

        const response = await api.get(`/market/candles/${symbol}`, {
          params: { timeframe, limit: 400 },
          timeout: 20000,
        });

        if (cancelled) return;

        const data = cleanCandles(response.data?.data?.candles || []);

        candles.setData(
          data.map(({ time, open, high, low, close }) => ({
            time,
            open,
            high,
            low,
            close,
          })),
        );

        volumeSeries.setData(
          data.map((candle) => ({
            time: candle.time,
            value: candle.volume,
            color: volumeColor(candle),
          })),
        );

        lastCandleRef.current = data.length ? { ...data[data.length - 1] } : null;
        readyRef.current = true;

        if (data.length) {
          /* Show a sensible number of candles instead of squeezing all */
          const lastIndex = data.length - 1;

          chart.timeScale().applyOptions({ barSpacing: BAR_SPACING });
          chart.timeScale().setVisibleLogicalRange({
            from: Math.max(lastIndex - VISIBLE_BARS, -2),
            to: lastIndex + 10,
          });

          chart.priceScale("right").applyOptions({ autoScale: true });
        } else {
          setError("No chart data yet. Waiting for live prices...");
        }

        /* apply the newest live price immediately */
        if (bidRef.current > 0) {
          applyTick(bidRef.current);
        }
      } catch (loadError) {
        console.error("Chart candle error:", loadError);

        if (!cancelled) {
          readyRef.current = true;

          setError(
            loadError.userMessage || "Unable to load market data for the chart.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe, reloadKey, applyTick]);

  /* ---------------- LIVE BID -> candle + volume ---------------- */

  useEffect(() => {
    if (!currentBid || currentBid <= 0) return;

    if (currentBid !== lastBidRef.current) {
      lastBidRef.current = currentBid;
      applyTick(currentBid);
    }
  }, [currentBid, applyTick]);

  /* keep the OHLC legend and LIVE badge in sync (throttled) */
  useEffect(() => {
    const timer = setInterval(() => {
      const candle = lastCandleRef.current;

      if (candle) {
        setLastCandle((previous) =>
          previous &&
          previous.time === candle.time &&
          previous.close === candle.close &&
          previous.high === candle.high &&
          previous.low === candle.low &&
          previous.volume === candle.volume
            ? previous
            : { ...candle },
        );
      }

      setLive(Date.now() - lastTickAtRef.current < 15000);
    }, 400);

    return () => clearInterval(timer);
  }, []);

  /* ---------------- ASK LINE (updated in place) ---------------- */

  useEffect(() => {
    const series = candleSeriesRef.current;

    if (!series) return;

    if (!currentAsk || currentAsk <= 0) {
      if (askLineRef.current) {
        series.removePriceLine(askLineRef.current);
        askLineRef.current = null;
      }

      return;
    }

    const options = {
      price: currentAsk,
      color: ASK_COLOR,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      axisLabelColor: ASK_COLOR,
      axisLabelTextColor: "#ffffff",
      title: "ASK",
    };

    if (askLineRef.current) {
      askLineRef.current.applyOptions(options);
    } else {
      askLineRef.current = series.createPriceLine(options);
    }
  }, [currentAsk]);

  /* ---------------- OPEN POSITIONS: ENTRY / SL / TP ---------------- */

  const openPositions = useMemo(() => {
    const current = String(symbol).toUpperCase();

    return positions.filter(
      (position) =>
        String(position.symbol || "").toUpperCase() === current &&
        String(position.status || "").toLowerCase() === "open",
    );
  }, [positions, symbol]);

  useEffect(() => {
    const series = candleSeriesRef.current;

    if (!series) return;

    const lines = positionLinesRef.current;
    const wanted = new Map();

    openPositions.forEach((position) => {
      const id = String(position.id);
      const side = String(position.side || "").toUpperCase();
      const volume = toNumber(position.volume) || 0;
      const entry = toNumber(position.entry_price);
      const contractSize = toNumber(position.contract_size) || 1;
      const direction = side === "BUY" ? 1 : -1;

      if (entry === null || entry <= 0) return;

      const livePnl =
        currentBid && currentAsk
          ? ((side === "BUY" ? currentBid : currentAsk) - entry) *
            direction *
            volume *
            contractSize
          : toNumber(position.unrealized_pnl) || 0;

      const sideColor = side === "BUY" ? BUY_BLUE : DOWN;

      wanted.set(`${id}:entry`, {
        price: entry,
        color: sideColor,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        axisLabelColor: sideColor,
        axisLabelTextColor: "#ffffff",
        title: `${side} ${volume.toFixed(2)}  ${money(livePnl)}`,
      });

      const stopLoss = toNumber(position.stop_loss);

      if (stopLoss && stopLoss > 0) {
        const slPnl = (stopLoss - entry) * direction * volume * contractSize;

        wanted.set(`${id}:sl`, {
          price: stopLoss,
          color: DOWN,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          axisLabelColor: DOWN,
          axisLabelTextColor: "#ffffff",
          title: `SL ${money(slPnl)}`,
        });
      }

      const takeProfit = toNumber(position.take_profit);

      if (takeProfit && takeProfit > 0) {
        const tpPnl = (takeProfit - entry) * direction * volume * contractSize;

        wanted.set(`${id}:tp`, {
          price: takeProfit,
          color: UP,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          axisLabelColor: UP,
          axisLabelTextColor: "#ffffff",
          title: `TP ${money(tpPnl)}`,
        });
      }
    });

    /* remove lines of closed positions / removed SL-TP */
    for (const [key, line] of Array.from(lines.entries())) {
      if (!wanted.has(key)) {
        try {
          series.removePriceLine(line);
        } catch {
          /* already removed */
        }

        lines.delete(key);
      }
    }

    /* create new lines, update existing ones in place */
    for (const [key, options] of wanted) {
      const existing = lines.get(key);

      if (existing) {
        existing.applyOptions(options);
      } else {
        lines.set(key, series.createPriceLine(options));
      }
    }
  }, [openPositions, currentBid, currentAsk]);

  /* position lines belong to one symbol: clear them when it changes */
  useEffect(() => {
    const series = candleSeriesRef.current;
    const lines = positionLinesRef.current;

    return () => {
      if (!series) return;

      for (const line of lines.values()) {
        try {
          series.removePriceLine(line);
        } catch {
          /* already removed */
        }
      }

      lines.clear();
    };
  }, [symbol]);

  /* ---------------- BUY / SELL ARROWS ---------------- */

  useEffect(() => {
    const markers = markersRef.current;

    if (!markers || !frame) return;

    const list = [];

    openPositions.forEach((position) => {
      const openedAt = new Date(position.opened_at).getTime();

      if (!Number.isFinite(openedAt)) return;

      const side = String(position.side || "").toUpperCase();
      const volume = toNumber(position.volume) || 0;

      list.push({
        time: bucketStartSeconds(openedAt, frame.ms),
        position: side === "BUY" ? "belowBar" : "aboveBar",
        shape: side === "BUY" ? "arrowUp" : "arrowDown",
        color: side === "BUY" ? BUY_BLUE : DOWN,
        text: `${side} ${volume.toFixed(2)}`,
      });
    });

    list.sort((a, b) => a.time - b.time);

    try {
      markers.setMarkers(list);
    } catch {
      /* marker time outside the loaded data */
    }
  }, [openPositions, frame, lastCandle?.time]);

  /* ---------------- refresh after the tab was hidden ---------------- */

  useEffect(() => {
    function onVisibility() {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        return;
      }

      if (hiddenAtRef.current && Date.now() - hiddenAtRef.current > 30000) {
        setReloadKey((value) => value + 1);
      }

      hiddenAtRef.current = 0;
    }

    document.addEventListener("visibilitychange", onVisibility);

    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  /* ---------------- UI ---------------- */

  const shown = hoverCandle || lastCandle;

  const change = shown ? shown.close - shown.open : 0;
  const changePercent = shown && shown.open ? (change / shown.open) * 100 : 0;
  const trend = change >= 0 ? "up" : "down";

  const spread =
    currentBid && currentAsk ? Math.max(currentAsk - currentBid, 0) : null;

  /* gold / bitcoin: price units, forex: pips */
  const spreadText =
    spread === null
      ? "--"
      : digits === 2
        ? spread.toFixed(2)
        : (spread * 10 ** (digits - 1)).toFixed(1);

  function goToLatest() {
    chartRef.current?.timeScale().scrollToRealTime();
  }

  function zoomBy(factor) {
    const timeScale = chartRef.current?.timeScale();

    if (!timeScale) return;

    const spacing = timeScale.options().barSpacing || BAR_SPACING;

    timeScale.applyOptions({
      barSpacing: Math.min(Math.max(spacing * factor, 2), 40),
    });
  }

  return (
    <div className={`tvc tvc-${theme}`}>
      <div className="tvc-toolbar">
        <div className="tvc-title">
          <strong>{symbol}</strong>

          <span className={`tvc-live ${live ? "on" : "off"}`}>
            <i />
            {live ? "LIVE" : "WAITING"}
          </span>
        </div>

        <div className="tvc-timeframes">
          {TIMEFRAMES.map((item) => (
            <button
              key={item.value}
              type="button"
              className={timeframe === item.value ? "active" : ""}
              onClick={() => setTimeframe(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="tvc-actions">
          <button type="button" title="Zoom out" onClick={() => zoomBy(0.8)}>
            −
          </button>

          <button type="button" title="Zoom in" onClick={() => zoomBy(1.25)}>
            +
          </button>

          <button type="button" title="Go to latest candle" onClick={goToLatest}>
            ⏭
          </button>

          <button
            type="button"
            title="Switch light / dark chart"
            onClick={() =>
              setTheme((value) => (value === "dark" ? "light" : "dark"))
            }
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </div>

      <div className="tvc-body">
        <div className="tvc-chart" ref={containerRef} />

        <div className="tvc-overlay">
          <div className="tvc-legend">
            <span className="tvc-name">
              {SYMBOL_NAMES[symbol] || symbol} · {timeframe.toUpperCase()} · TRADEX
            </span>

            {shown && (
              <span className={`tvc-ohlc ${trend}`}>
                <b>O</b>
                {shown.open.toFixed(digits)} <b>H</b>
                {shown.high.toFixed(digits)} <b>L</b>
                {shown.low.toFixed(digits)} <b>C</b>
                {shown.close.toFixed(digits)}{" "}
                <em>
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(digits)} ({changePercent >= 0 ? "+" : ""}
                  {changePercent.toFixed(2)}%)
                </em>
              </span>
            )}
          </div>

          <div className="tvc-quote">
            <button
              type="button"
              className="tvc-sell"
              onClick={onSell}
              disabled={!currentBid}
            >
              <strong>{currentBid ? currentBid.toFixed(digits) : "--"}</strong>
              <span>SELL</span>
            </button>

            <div className="tvc-spread">{spreadText}</div>

            <button
              type="button"
              className="tvc-buy"
              onClick={onBuy}
              disabled={!currentAsk}
            >
              <strong>{currentAsk ? currentAsk.toFixed(digits) : "--"}</strong>
              <span>BUY</span>
            </button>
          </div>

          {shown && (
            <div className="tvc-volume">
              Vol · Ticks <b>{formatVolume(shown.volume)}</b>
            </div>
          )}
        </div>

        {loading && <div className="tvc-badge">Loading chart…</div>}

        {error && !loading && (
          <div className="tvc-badge error">
            {error}

            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
