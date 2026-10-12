
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  CrosshairMode,
  LineStyle,
} from "lightweight-charts";

import api from "../services/api";

const TIMEFRAMES = [
  { label: "1m", value: "1m", ms: 60_000 },
  { label: "5m", value: "5m", ms: 300_000 },
  { label: "15m", value: "15m", ms: 900_000 },
  { label: "30m", value: "30m", ms: 1_800_000 },
  { label: "1H", value: "1h", ms: 3_600_000 },
  { label: "4H", value: "4h", ms: 14_400_000 },
  { label: "1D", value: "1d", ms: 86_400_000 },
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
const BAR_SPACING = 9;
const VISIBLE_BARS = 110;

function getDigits(symbol) {
  const s = String(symbol || "").toUpperCase();

  if (s === "XAUUSD" || s === "BTCUSD") return 2;
  if (s.endsWith("JPY")) return 3;

  return 5;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bucketStartSeconds(timestamp, interval) {
  return Math.floor(timestamp / interval) * Math.floor(interval / 1000);
}

function volumeColor(candle) {
  return candle.close >= candle.open
    ? "rgba(8,153,129,0.45)"
    : "rgba(242,54,69,0.45)";
}

function cleanCandles(raw) {
  const byTime = new Map();
  const now = Math.floor(Date.now() / 1000);

  for (const item of raw || []) {
    const rawTime =
      item.openTime ??
      item.open_time ??
      item.timestamp ??
      item.time;

    let milliseconds;

    if (typeof rawTime === "number") {
      milliseconds =
        rawTime < 10_000_000_000 ? rawTime * 1000 : rawTime;
    } else {
      milliseconds = new Date(rawTime).getTime();
    }

    if (!Number.isFinite(milliseconds)) continue;

    const time = Math.floor(milliseconds / 1000);

    if (time <= 0 || time > now + 60) continue;

    const open = toNumber(item.open);
    const high = toNumber(item.high);
    const low = toNumber(item.low);
    const close = toNumber(item.close);

    if (
      [open, high, low, close].some(
        (v) => v === null || v <= 0,
      )
    ) {
      continue;
    }

    byTime.set(time, {
      time,
      open,
      high: Math.max(open, high, close),
      low: Math.min(open, low, close),
      close,
      volume: Math.max(0, toNumber(item.volume) || 0),
    });
  }

  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function money(value) {
  const n = Number(value) || 0;
  return `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
}

function formatVolume(value) {
  const n = Number(value) || 0;

  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;

  return String(Math.round(n));
}

function formatTime(seconds) {
  return new Date(seconds * 1000).toLocaleString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatTick(time, tickType) {
  const d = new Date(time * 1000);

  if (tickType === 0) return String(d.getFullYear());
  if (tickType === 1) {
    return d.toLocaleString(undefined, { month: "short" });
  }
  if (tickType === 2) return String(d.getDate());

  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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
  const lastBidRef = useRef(null);
  const bidRef = useRef(0);
  const readyRef = useRef(false);

  const lastTickAtRef = useRef(0);
  const historyRequestRef = useRef(0);
  const askLineRef = useRef(null);
  const positionLinesRef = useRef(new Map());
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
  const frame = TIMEFRAMES.find((x) => x.value === timeframe);
  const palette = THEMES[theme];

  const currentBid = toNumber(bid);
  const currentAsk = toNumber(ask);

  useEffect(() => {
    bidRef.current = currentBid || 0;
  }, [currentBid]);

  // Create the chart once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const initial = THEMES.dark;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { color: initial.background },
        textColor: initial.text,
        fontSize: 12,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: initial.grid },
        horzLines: { color: initial.grid },
      },
      rightPriceScale: {
        borderColor: initial.border,
        scaleMargins: { top: 0.14, bottom: 0.2 },
        minimumWidth: 96,
      },
      timeScale: {
        borderColor: initial.border,
        timeVisible: true,
        secondsVisible: false,
        barSpacing: BAR_SPACING,
        minBarSpacing: 2,
        rightOffset: 10,
        tickMarkFormatter: formatTick,
      },
      localization: {
        timeFormatter: formatTime,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: initial.crosshair,
          style: LineStyle.Dashed,
          labelBackgroundColor: initial.labelBg,
        },
        horzLine: {
          color: initial.crosshair,
          style: LineStyle.Dashed,
          labelBackgroundColor: initial.labelBg,
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

      const volumePoint = param.seriesData?.get(volume);

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

    return () => {
      for (const line of positionLinesRef.current.values()) {
        try {
          candles.removePriceLine(line);
        } catch {}
      }

      positionLinesRef.current.clear();

      if (askLineRef.current) {
        try {
          candles.removePriceLine(askLineRef.current);
        } catch {}
      }

      try {
        chart.remove();
      } catch {}

      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      markersRef.current = null;
      lastCandleRef.current = null;
      readyRef.current = false;
    };
  }, []);

  // Theme changes.
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
    } catch {}
  }, [theme, palette]);

  // Price precision.
  useEffect(() => {
    candleSeriesRef.current?.applyOptions({
      priceFormat: {
        type: "price",
        precision: digits,
        minMove: 1 / 10 ** digits,
      },
    });
  }, [digits, symbol]);

  // Update the active candle with the latest incoming BID.
  const applyTick = useCallback(
    (price) => {
      const candles = candleSeriesRef.current;
      const volume = volumeSeriesRef.current;

      if (
        !candles ||
        !readyRef.current ||
        !frame ||
        !Number.isFinite(price) ||
        price <= 0
      ) {
        return;
      }

      const bucket = bucketStartSeconds(Date.now(), frame.ms);
      const previous = lastCandleRef.current;

      if (previous && bucket < previous.time) return;

      let next;

      if (!previous || bucket > previous.time) {
        const open = previous?.close ?? price;

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

      try {
        candles.update({
          time: next.time,
          open: next.open,
          high: next.high,
          low: next.low,
          close: next.close,
        });

        volume?.update({
          time: next.time,
          value: next.volume,
          color: volumeColor(next),
        });

        lastCandleRef.current = next;
        lastTickAtRef.current = Date.now();
      } catch (e) {
        console.error("[TradeX Chart] Candle update failed:", e);
      }
    },
    [frame],
  );

  // Load candle history whenever symbol/timeframe changes.
  useEffect(() => {
    const candles = candleSeriesRef.current;
    const volume = volumeSeriesRef.current;
    const chart = chartRef.current;

    if (!symbol || !candles || !volume || !chart) return undefined;

    let cancelled = false;
    const requestId = ++historyRequestRef.current;

    readyRef.current = false;
    lastCandleRef.current = null;
    setLastCandle(null);
    setHoverCandle(null);
    setError("");

    candles.setData([]);
    volume.setData([]);

    async function loadHistory() {
      setLoading(true);

      try {
        const response = await api.get(
          `/market/candles/${encodeURIComponent(symbol)}`,
          {
            params: { timeframe, limit: 400 },
            timeout: 20000,
          },
        );

        if (
          cancelled ||
          requestId !== historyRequestRef.current
        ) {
          return;
        }

        const raw = response.data?.data?.candles;

        if (!Array.isArray(raw)) {
          throw new Error(
            "Unexpected candle API response. Expected data.candles array.",
          );
        }

        const data = cleanCandles(raw);

        candles.setData(
          data.map(({ time, open, high, low, close }) => ({
            time,
            open,
            high,
            low,
            close,
          })),
        );

        volume.setData(
          data.map((candle) => ({
            time: candle.time,
            value: candle.volume,
            color: volumeColor(candle),
          })),
        );

        lastCandleRef.current = data.length
          ? { ...data[data.length - 1] }
          : null;

        readyRef.current = true;

        if (data.length) {
          const lastIndex = data.length - 1;

          chart.timeScale().applyOptions({
            barSpacing: BAR_SPACING,
          });

          chart.timeScale().setVisibleLogicalRange({
            from: Math.max(lastIndex - VISIBLE_BARS, 0),
            to: lastIndex + 10,
          });

          chart.priceScale("right").applyOptions({
            autoScale: true,
          });
        } else {
          setError("No candle history returned. Waiting for market data.");
        }

        // Apply the latest available price after history is ready.
        const latestBid = bidRef.current;

        if (latestBid > 0) {
          applyTick(latestBid);
        }

        console.info("[TradeX Chart] History loaded", {
          symbol,
          timeframe,
          candles: data.length,
        });
      } catch (e) {
        if (!cancelled) {
          console.error("[TradeX Chart] History load failed:", e);

          readyRef.current = false;
          setError(
            e?.userMessage ||
              e?.message ||
              "Unable to load chart history. Please retry.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe, reloadKey, applyTick]);

  // Consume incoming BID updates.
  useEffect(() => {
    if (
      currentBid === null ||
      currentBid <= 0 ||
      currentBid === lastBidRef.current
    ) {
      return;
    }

    lastBidRef.current = currentBid;
    lastTickAtRef.current = Date.now();

    console.info("[TradeX Chart] BID update", {
      symbol,
      bid: currentBid,
      chartReady: readyRef.current,
    });

    applyTick(currentBid);
  }, [currentBid, applyTick, symbol]);

  // Keep OHLC and LIVE status refreshed.
  useEffect(() => {
    const timer = setInterval(() => {
      const candle = lastCandleRef.current;

      if (candle) {
        setLastCandle((previous) => {
          if (
            previous &&
            previous.time === candle.time &&
            previous.close === candle.close &&
            previous.high === candle.high &&
            previous.low === candle.low &&
            previous.volume === candle.volume
          ) {
            return previous;
          }

          return { ...candle };
        });
      }

      setLive(
        lastTickAtRef.current > 0 &&
          Date.now() - lastTickAtRef.current < 15000,
      );
    }, 500);

    return () => clearInterval(timer);
  }, []);

  // ASK price line.
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
      color: BUY_BLUE,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      axisLabelColor: BUY_BLUE,
      axisLabelTextColor: "#ffffff",
      title: "ASK",
    };

    if (askLineRef.current) {
      askLineRef.current.applyOptions(options);
    } else {
      askLineRef.current = series.createPriceLine(options);
    }
  }, [currentAsk]);

  // Open-position entry, SL and TP lines.
  const openPositions = useMemo(() => {
    const selectedSymbol = String(symbol).toUpperCase();

    return (positions || []).filter(
      (p) =>
        String(p.symbol || "").toUpperCase() === selectedSymbol &&
        String(p.status || "").toLowerCase() === "open",
    );
  }, [positions, symbol]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    const existingLines = positionLinesRef.current;
    const wanted = new Map();

    for (const position of openPositions) {
      const id = String(position.id);
      const side = String(position.side || "").toUpperCase();
      const volume = toNumber(position.volume) || 0;
      const entry = toNumber(position.entry_price);
      const contractSize = toNumber(position.contract_size) || 1;
      const direction = side === "BUY" ? 1 : -1;

      if (!entry || entry <= 0) continue;

      const exitPrice =
        side === "BUY" ? currentBid : currentAsk;

      const pnl =
        exitPrice > 0
          ? (exitPrice - entry) *
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
        title: `${side} ${volume.toFixed(2)} ${money(pnl)}`,
      });

      const sl = toNumber(position.stop_loss);
      if (sl && sl > 0) {
        wanted.set(`${id}:sl`, {
          price: sl,
          color: DOWN,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          axisLabelColor: DOWN,
          axisLabelTextColor: "#ffffff",
          title: `SL ${money((sl - entry) * direction * volume * contractSize)}`,
        });
      }

      const tp = toNumber(position.take_profit);
      if (tp && tp > 0) {
        wanted.set(`${id}:tp`, {
          price: tp,
          color: UP,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          axisLabelColor: UP,
          axisLabelTextColor: "#ffffff",
          title: `TP ${money((tp - entry) * direction * volume * contractSize)}`,
        });
      }
    }

    for (const [key, line] of existingLines) {
      if (!wanted.has(key)) {
        try {
          series.removePriceLine(line);
        } catch {}
        existingLines.delete(key);
      }
    }

    for (const [key, options] of wanted) {
      const line = existingLines.get(key);

      if (line) {
        line.applyOptions(options);
      } else {
        existingLines.set(
          key,
          series.createPriceLine(options),
        );
      }
    }
  }, [openPositions, currentBid, currentAsk]);

  // Clear old position lines when switching symbols.
  useEffect(() => {
    return () => {
      const series = candleSeriesRef.current;

      if (series) {
        for (const line of positionLinesRef.current.values()) {
          try {
            series.removePriceLine(line);
          } catch {}
        }
      }

      positionLinesRef.current.clear();
    };
  }, [symbol]);

  // Trade markers on candles.
  useEffect(() => {
    const markers = markersRef.current;
    if (!markers || !frame) return;

    const list = [];

    for (const position of openPositions) {
      const openedAt = new Date(position.opened_at).getTime();
      if (!Number.isFinite(openedAt)) continue;

      const side = String(position.side || "").toUpperCase();
      const volume = toNumber(position.volume) || 0;

      list.push({
        time: bucketStartSeconds(openedAt, frame.ms),
        position: side === "BUY" ? "belowBar" : "aboveBar",
        shape: side === "BUY" ? "arrowUp" : "arrowDown",
        color: side === "BUY" ? BUY_BLUE : DOWN,
        text: `${side} ${volume.toFixed(2)}`,
      });
    }

    list.sort((a, b) => a.time - b.time);

    try {
      markers.setMarkers(list);
    } catch (e) {
      console.warn("[TradeX Chart] Marker update failed:", e);
    }
  }, [openPositions, frame, lastCandle?.time]);

  // Refresh history after returning to the tab.
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        return;
      }

      if (
        hiddenAtRef.current &&
        Date.now() - hiddenAtRef.current > 30000
      ) {
        setReloadKey((key) => key + 1);
      }

      hiddenAtRef.current = 0;
    }

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibility,
      );
    };
  }, []);

  const shown = hoverCandle || lastCandle;
  const change = shown ? shown.close - shown.open : 0;
  const changePercent =
    shown?.open ? (change / shown.open) * 100 : 0;
  const trend = change >= 0 ? "up" : "down";

  const spread =
    currentBid > 0 && currentAsk > 0
      ? Math.max(currentAsk - currentBid, 0)
      : null;

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
    const scale = chartRef.current?.timeScale();
    if (!scale) return;

    const spacing = scale.options().barSpacing || BAR_SPACING;

    scale.applyOptions({
      barSpacing: Math.min(
        Math.max(spacing * factor, 2),
        40,
      ),
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
          <button
            type="button"
            title="Zoom out"
            onClick={() => zoomBy(0.8)}
          >
            −
          </button>

          <button
            type="button"
            title="Zoom in"
            onClick={() => zoomBy(1.25)}
          >
            +
          </button>

          <button
            type="button"
            title="Go to latest candle"
            onClick={goToLatest}
          >
            ⏭
          </button>

          <button
            type="button"
            title="Switch chart theme"
            onClick={() =>
              setTheme((value) =>
                value === "dark" ? "light" : "dark",
              )
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
              {SYMBOL_NAMES[symbol] || symbol} ·{" "}
              {timeframe.toUpperCase()} · TRADEX
            </span>

            {shown && (
              <span className={`tvc-ohlc ${trend}`}>
                <b>O</b> {shown.open.toFixed(digits)}{" "}
                <b>H</b> {shown.high.toFixed(digits)}{" "}
                <b>L</b> {shown.low.toFixed(digits)}{" "}
                <b>C</b> {shown.close.toFixed(digits)}{" "}
                <em>
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(digits)} (
                  {changePercent >= 0 ? "+" : ""}
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
              disabled={!currentBid || currentBid <= 0}
            >
              <strong>
                {currentBid > 0
                  ? currentBid.toFixed(digits)
                  : "--"}
              </strong>
              <span>SELL</span>
            </button>

            <div className="tvc-spread">{spreadText}</div>

            <button
              type="button"
              className="tvc-buy"
              onClick={onBuy}
              disabled={!currentAsk || currentAsk <= 0}
            >
              <strong>
                {currentAsk > 0
                  ? currentAsk.toFixed(digits)
                  : "--"}
              </strong>
              <span>BUY</span>
            </button>
          </div>

          {shown && (
            <div className="tvc-volume">
              Vol · Ticks <b>{formatVolume(shown.volume)}</b>
            </div>
          )}
        </div>

        {loading && (
          <div className="tvc-badge">Loading chart…</div>
        )}

        {error && !loading && (
          <div className="tvc-badge error">
            {error}
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
