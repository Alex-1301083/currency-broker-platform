import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createChart,
  CandlestickSeries,
  LineStyle,
  createSeriesMarkers,
} from "lightweight-charts";

import api from "../services/api";

const TIMEFRAMES = [
  {
    label: "1m",
    value: "1m",
  },
  {
    label: "5m",
    value: "5m",
  },
  {
    label: "15m",
    value: "15m",
  },
  {
    label: "1H",
    value: "1h",
  },
];

function getDigits(symbol) {
  if (
    symbol === "XAUUSD" ||
    symbol === "BTCUSD"
  ) {
    return 2;
  }

  return 5;
}

function getTimeframeMs(
  timeframe,
) {
  switch (timeframe) {
    case "1m":
      return 60 * 1000;

    case "5m":
      return 5 * 60 * 1000;

    case "15m":
      return 15 * 60 * 1000;

    case "1h":
      return 60 * 60 * 1000;

    default:
      return 60 * 1000;
  }
}

function safeNumber(value) {
  const number =
    Number(value);

  return Number.isFinite(
    number,
  )
    ? number
    : null;
}

export default function TradingChart({
  symbol = "XAUUSD",
  bid = 0,
  ask = 0,
  positions = [],
}) {
  const containerRef =
    useRef(null);

  const chartRef =
    useRef(null);

  const candleSeriesRef =
    useRef(null);

  const markerRef =
    useRef(null);

  const latestCandleRef =
    useRef(null);

  const bidLineRef =
    useRef(null);

  const askLineRef =
    useRef(null);

  const positionLinesRef =
    useRef([]);

  const [
    timeframe,
    setTimeframe,
  ] = useState("1m");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  /*
  ========================================================
  CREATE CHART
  ========================================================
  */

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const container =
      containerRef.current;

    const chart =
      createChart(
        container,
        {
          width:
            container.clientWidth,

          height: 500,

          layout: {
            background: {
              color:
                "#080d18",
            },

            textColor:
              "#94a3b8",
          },

          grid: {
            vertLines: {
              color:
                "#172033",
            },

            horzLines: {
              color:
                "#172033",
            },
          },

          rightPriceScale: {
            borderColor:
              "#263247",

            scaleMargins: {
              top: 0.08,
              bottom: 0.08,
            },
          },

          timeScale: {
            borderColor:
              "#263247",

            timeVisible:
              true,

            secondsVisible:
              false,

            rightOffset: 8,
          },

          crosshair: {
            mode: 0,

            vertLine: {
              color:
                "#64748b",

              width: 1,

              style:
                LineStyle.Dashed,

              labelBackgroundColor:
                "#1e293b",
            },

            horzLine: {
              color:
                "#64748b",

              width: 1,

              style:
                LineStyle.Dashed,

              labelBackgroundColor:
                "#1e293b",
            },
          },

          handleScroll: {
            mouseWheel:
              true,

            pressedMouseMove:
              true,
          },

          handleScale: {
            mouseWheel:
              true,

            pinch:
              true,

            axisPressedMouseMove:
              true,
          },
        },
      );

    const series =
      chart.addSeries(
        CandlestickSeries,
        {
          upColor:
            "#22c55e",

          downColor:
            "#ef4444",

          borderUpColor:
            "#22c55e",

          borderDownColor:
            "#ef4444",

          wickUpColor:
            "#22c55e",

          wickDownColor:
            "#ef4444",
        },
      );

    chartRef.current =
      chart;

    candleSeriesRef.current =
      series;

    markerRef.current =
      createSeriesMarkers(
        series,
        [],
      );

    function resize() {
      if (!containerRef.current) {
        return;
      }

      chart.applyOptions({
        width:
          containerRef
            .current
            .clientWidth,
      });
    }

    window.addEventListener(
      "resize",
      resize,
    );

    return () => {
      window.removeEventListener(
        "resize",
        resize,
      );

      try {
        chart.remove();
      } catch {
        // ignore
      }

      chartRef.current =
        null;

      candleSeriesRef.current =
        null;

      markerRef.current =
        null;

      latestCandleRef.current =
        null;
    };
  }, []);

  /*
  ========================================================
  LOAD HISTORICAL CANDLES
  ========================================================
  */

  useEffect(() => {
    if (
      !symbol ||
      !candleSeriesRef.current
    ) {
      return;
    }

    let cancelled = false;

    async function loadCandles() {
      try {
        setLoading(true);
        setError("");

        const response =
          await api.get(
            `/market/candles/${symbol}`,
            {
              params: {
                timeframe,
                limit: 300,
              },
            },
          );

        if (cancelled) {
          return;
        }

        const candles =
          response.data
            ?.data
            ?.candles ||
          [];

        const data =
          candles
            .map(
              (candle) => ({
                time:
                  Math.floor(
                    new Date(
                      candle.openTime,
                    ).getTime() /
                      1000,
                  ),

                open:
                  Number(
                    candle.open,
                  ),

                high:
                  Number(
                    candle.high,
                  ),

                low:
                  Number(
                    candle.low,
                  ),

                close:
                  Number(
                    candle.close,
                  ),
              }),
            )
            .filter(
              (candle) =>
                Number.isFinite(
                  candle.time,
                ) &&
                Number.isFinite(
                  candle.open,
                ) &&
                Number.isFinite(
                  candle.high,
                ) &&
                Number.isFinite(
                  candle.low,
                ) &&
                Number.isFinite(
                  candle.close,
                ),
            );

        candleSeriesRef.current.setData(
          data,
        );

        latestCandleRef.current =
          data.length
            ? {
                ...data[
                  data.length - 1
                ],
              }
            : null;

        if (
          chartRef.current &&
          data.length
        ) {
          chartRef.current
            .timeScale()
            .fitContent();
        }
      } catch (error) {
        console.error(
          "Chart candle error:",
          error,
        );

        if (!cancelled) {
          setError(
            "Unable to load historical market data.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCandles();

    return () => {
      cancelled = true;
    };
  }, [
    symbol,
    timeframe,
  ]);

  /*
  ========================================================
  LIVE BID/ASK → CURRENT CANDLE
  ========================================================
  */

  useEffect(() => {
    const series =
      candleSeriesRef.current;

    if (!series) {
      return;
    }

    const currentBid =
      safeNumber(bid);

    if (
      currentBid === null ||
      currentBid <= 0
    ) {
      return;
    }

    const timeframeMs =
      getTimeframeMs(
        timeframe,
      );

    const bucket =
      Math.floor(
        Date.now() /
          timeframeMs,
      ) * timeframeMs;

    const bucketSeconds =
      Math.floor(
        bucket / 1000,
      );

    let candle =
      latestCandleRef.current;

    if (
      !candle ||
      bucketSeconds >
        candle.time
    ) {
      candle = {
        time:
          bucketSeconds,

        open:
          currentBid,

        high:
          currentBid,

        low:
          currentBid,

        close:
          currentBid,
      };
    } else if (
      candle.time ===
      bucketSeconds
    ) {
      candle = {
        ...candle,

        high: Math.max(
          candle.high,
          currentBid,
        ),

        low: Math.min(
          candle.low,
          currentBid,
        ),

        close:
          currentBid,
      };
    }

    series.update(
      candle,
    );

    latestCandleRef.current =
      candle;

    /*
    --------------------------------------------
    BID LINE
    --------------------------------------------
    */

    if (bidLineRef.current) {
      try {
        series.removePriceLine(
          bidLineRef.current,
        );
      } catch {
        // ignore
      }
    }

    bidLineRef.current =
      series.createPriceLine({
        price:
          currentBid,

        color:
          "#38bdf8",

        lineWidth: 1,

        lineStyle:
          LineStyle.Dashed,

        axisLabelVisible:
          true,

        title: "BID",
      });

    /*
    --------------------------------------------
    ASK LINE
    --------------------------------------------
    */

    const currentAsk =
      safeNumber(ask);

    if (
      currentAsk !== null &&
      currentAsk > 0
    ) {
      if (
        askLineRef.current
      ) {
        try {
          series.removePriceLine(
            askLineRef.current,
          );
        } catch {
          // ignore
        }
      }

      askLineRef.current =
        series.createPriceLine({
          price:
            currentAsk,

          color:
            "#f59e0b",

          lineWidth: 1,

          lineStyle:
            LineStyle.Dashed,

          axisLabelVisible:
            true,

          title: "ASK",
        });
    }
  }, [
    bid,
    ask,
    timeframe,
  ]);

  /*
  ========================================================
  POSITION LINES
  ========================================================
  */

  useEffect(() => {
    const series =
      candleSeriesRef.current;

    if (!series) {
      return;
    }

    positionLinesRef.current.forEach(
      (line) => {
        try {
          series.removePriceLine(
            line,
          );
        } catch {
          // ignore
        }
      },
    );

    positionLinesRef.current =
      [];

    const currentSymbol =
      String(symbol)
        .toUpperCase();

    const openPositions =
      positions.filter(
        (position) =>
          String(
            position.symbol ||
              "",
          ).toUpperCase() ===
            currentSymbol &&
          String(
            position.status ||
              "",
          ).toLowerCase() ===
            "open",
      );

    openPositions.forEach(
      (position) => {
        const side =
          String(
            position.side ||
              "",
          ).toUpperCase();

        const volume =
          Number(
            position.volume,
          );

        const entry =
          safeNumber(
            position.entry_price,
          );

        if (
          entry === null
        ) {
          return;
        }

        const label =
          `${side} ${
            Number.isFinite(
              volume,
            )
              ? volume.toFixed(2)
              : "0.00"
          }`;

        /*
        ----------------------------------------
        ENTRY
        ----------------------------------------
        */

        const entryLine =
          series.createPriceLine({
            price: entry,

            color:
              side === "BUY"
                ? "#22c55e"
                : "#ef4444",

            lineWidth: 2,

            lineStyle:
              LineStyle.Solid,

            axisLabelVisible:
              true,

            title:
              `${label} ENTRY`,
          });

        positionLinesRef.current.push(
          entryLine,
        );

        /*
        ----------------------------------------
        STOP LOSS
        ----------------------------------------
        */

        const sl =
          safeNumber(
            position.stop_loss,
          );

        if (
          sl !== null &&
          sl > 0
        ) {
          const slLine =
            series.createPriceLine({
              price: sl,

              color:
                "#ef4444",

              lineWidth: 2,

              lineStyle:
                LineStyle.Dashed,

              axisLabelVisible:
                true,

              title:
                `${label} STOP LOSS`,
            });

          positionLinesRef.current.push(
            slLine,
          );
        }

        /*
        ----------------------------------------
        TAKE PROFIT
        ----------------------------------------
        */

        const tp =
          safeNumber(
            position.take_profit,
          );

        if (
          tp !== null &&
          tp > 0
        ) {
          const tpLine =
            series.createPriceLine({
              price: tp,

              color:
                "#22c55e",

              lineWidth: 2,

              lineStyle:
                LineStyle.Dashed,

              axisLabelVisible:
                true,

              title:
                `${label} TAKE PROFIT`,
            });

          positionLinesRef.current.push(
            tpLine,
          );
        }
      },
    );

    return () => {
      positionLinesRef.current.forEach(
        (line) => {
          try {
            series.removePriceLine(
              line,
            );
          } catch {
            // ignore
          }
        },
      );

      positionLinesRef.current =
        [];
    };
  }, [
    positions,
    symbol,
  ]);

  /*
  ========================================================
  BUY / SELL MARKERS
  ========================================================
  */

  useEffect(() => {
    if (
      !markerRef.current
    ) {
      return;
    }

    const currentSymbol =
      String(symbol)
        .toUpperCase();

    const timeframeMs =
      getTimeframeMs(
        timeframe,
      );

    const markers = [];

    positions
      .filter(
        (position) =>
          String(
            position.symbol ||
              "",
          ).toUpperCase() ===
            currentSymbol &&
          String(
            position.status ||
              "",
          ).toLowerCase() ===
            "open",
      )
      .forEach(
        (position) => {
          const openedAt =
            new Date(
              position.opened_at,
            ).getTime();

          if (
            !Number.isFinite(
              openedAt,
            )
          ) {
            return;
          }

          const candleTime =
            Math.floor(
              openedAt /
                timeframeMs,
            ) *
            timeframeMs;

          const markerTime =
            Math.floor(
              candleTime / 1000,
            );

          const side =
            String(
              position.side ||
                "",
            ).toUpperCase();

          const volume =
            Number(
              position.volume,
            );

          const text =
            `${side} ${
              Number.isFinite(
                volume,
              )
                ? volume.toFixed(2)
                : ""
            }`;

          if (
            side === "BUY"
          ) {
            markers.push({
              time:
                markerTime,

              position:
                "belowBar",

              color:
                "#22c55e",

              shape:
                "arrowUp",

              text,
            });
          }

          if (
            side === "SELL"
          ) {
            markers.push({
              time:
                markerTime,

              position:
                "aboveBar",

              color:
                "#ef4444",

              shape:
                "arrowDown",

              text,
            });
          }
        },
      );

    markerRef.current.setMarkers(
      markers,
    );
  }, [
    positions,
    symbol,
    timeframe,
  ]);

  const digits =
    getDigits(symbol);

  const currentBid =
    safeNumber(bid);

  const currentAsk =
    safeNumber(ask);

  const spread =
    currentBid !== null &&
    currentAsk !== null
      ? currentAsk -
        currentBid
      : null;

  return (
    <div
      style={{
        width: "100%",
        background:
          "#080d18",
        border:
          "1px solid #1f2937",
        borderRadius:
          "12px",
        overflow:
          "hidden",
      }}
    >
      {/* HEADER */}

      <div
        style={{
          display: "flex",
          alignItems:
            "center",
          justifyContent:
            "space-between",
          gap: "12px",
          padding:
            "12px 16px",
          borderBottom:
            "1px solid #1f2937",
          flexWrap:
            "wrap",
        }}
      >
        <div>
          <div
            style={{
              display:
                "flex",
              alignItems:
                "center",
              gap: "8px",
            }}
          >
            <strong
              style={{
                color:
                  "#f8fafc",
                fontSize:
                  "16px",
              }}
            >
              {symbol}
            </strong>

            <span
              style={{
                background:
                  "#14532d",
                color:
                  "#86efac",
                borderRadius:
                  "999px",
                padding:
                  "3px 8px",
                fontSize:
                  "11px",
                fontWeight:
                  700,
              }}
            >
              LIVE
            </span>
          </div>

          <div
            style={{
              marginTop:
                "5px",
              display:
                "flex",
              gap:
                "12px",
              fontSize:
                "12px",
              flexWrap:
                "wrap",
            }}
          >
            <span
              style={{
                color:
                  "#38bdf8",
              }}
            >
              BID{" "}
              {currentBid !== null
                ? currentBid.toFixed(
                    digits,
                  )
                : "--"}
            </span>

            <span
              style={{
                color:
                  "#f59e0b",
              }}
            >
              ASK{" "}
              {currentAsk !== null
                ? currentAsk.toFixed(
                    digits,
                  )
                : "--"}
            </span>

            <span
              style={{
                color:
                  "#94a3b8",
              }}
            >
              SPREAD{" "}
              {spread !== null
                ? spread.toFixed(
                    digits,
                  )
                : "--"}
            </span>
          </div>
        </div>

        <div
          style={{
            display:
              "flex",
            gap: "4px",
          }}
        >
          {TIMEFRAMES.map(
            (item) => (
              <button
                key={
                  item.value
                }
                type="button"
                onClick={() =>
                  setTimeframe(
                    item.value,
                  )
                }
                style={{
                  border:
                    "1px solid #263247",
                  background:
                    timeframe ===
                    item.value
                      ? "#1e293b"
                      : "transparent",
                  color:
                    timeframe ===
                    item.value
                      ? "#f8fafc"
                      : "#94a3b8",
                  borderRadius:
                    "6px",
                  padding:
                    "6px 10px",
                  cursor:
                    "pointer",
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      </div>

      {/* LEGEND */}

      <div
        style={{
          display:
            "flex",
          gap:
            "14px",
          padding:
            "8px 16px",
          borderBottom:
            "1px solid #172033",
          color:
            "#94a3b8",
          fontSize:
            "11px",
          flexWrap:
            "wrap",
        }}
      >
        <span>
          <b
            style={{
              color:
                "#38bdf8",
            }}
          >
            ━━
          </b>{" "}
          BID
        </span>

        <span>
          <b
            style={{
              color:
                "#f59e0b",
            }}
          >
            ━━
          </b>{" "}
          ASK
        </span>

        <span>
          <b
            style={{
              color:
                "#22c55e",
            }}
          >
            ━━
          </b>{" "}
          BUY / TP
        </span>

        <span>
          <b
            style={{
              color:
                "#ef4444",
            }}
          >
            ━━
          </b>{" "}
          SELL / SL
        </span>
      </div>

      {/* CHART */}

      <div
        style={{
          position:
            "relative",
        }}
      >
        <div
          ref={
            containerRef
          }
          style={{
            width:
              "100%",
            minHeight:
              "500px",
          }}
        />

        {loading && (
          <div
            style={{
              position:
                "absolute",
              top:
                "12px",
              left:
                "12px",
              background:
                "rgba(8,13,24,.9)",
              color:
                "#94a3b8",
              padding:
                "6px 10px",
              borderRadius:
                "6px",
              fontSize:
                "12px",
            }}
          >
            Loading chart...
          </div>
        )}

        {error && (
          <div
            style={{
              position:
                "absolute",
              top:
                "12px",
              right:
                "12px",
              background:
                "rgba(127,29,29,.95)",
              color:
                "#fecaca",
              padding:
                "7px 10px",
              borderRadius:
                "6px",
              fontSize:
                "12px",
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}