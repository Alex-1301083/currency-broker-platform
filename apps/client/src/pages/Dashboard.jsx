import { useEffect, useState, useRef } from "react";
import { LogOut, User, Bell, Settings } from "lucide-react";
import { Link } from "react-router-dom";

import api from "../services/api";
import {
  connectWebSocket,
  subscribeWebSocket,
} from "../services/websocket";

import TradingChart from "../components/TradingChart";

function Dashboard() {
  // =========================================================
  // ACCOUNT STATE
  // =========================================================

  const [account, setAccount] = useState({
    balance: 0,
    equity: 0,
    margin: 0,
    freeMargin: 0,
    leverage: 0,
  });

  // =========================================================
  // ORDER STATE
  // =========================================================

  const [orderSide, setOrderSide] = useState("BUY");
  const [orderVolume, setOrderVolume] = useState("0.01");

  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");

  const [orderLoading, setOrderLoading] = useState(false);
  const [orderMessage, setOrderMessage] = useState("");
  const [orderError, setOrderError] = useState("");

  // =========================================================
  // POSITIONS STATE
  // =========================================================

  const [positions, setPositions] = useState([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [positionsError, setPositionsError] = useState("");

  const [closingPositionId, setClosingPositionId] = useState(null);

  const [closePositionError, setClosePositionError] = useState("");
  const [closePositionMessage, setClosePositionMessage] = useState("");

  // =========================================================
  // MARKET STATE
  // =========================================================

  const [markets, setMarkets] = useState([]);

  const [selectedSymbol, setSelectedSymbol] = useState("XAUUSD");

  const [market, setMarket] = useState({
    symbol: "XAUUSD",
    bid: 0,
    ask: 0,
    spread: 0,
  });

  const selectedSymbolRef = useRef("XAUUSD");

  // =========================================================
  // TRADING SAFETY STATE
  // =========================================================

  const [showOrderConfirmation, setShowOrderConfirmation] =
    useState(false);

  const [orderPriceSnapshot, setOrderPriceSnapshot] = useState(null);

  const [orderPriceChanged, setOrderPriceChanged] = useState(false);

  const orderConfirmationOpenRef = useRef(false);

  const orderPriceSnapshotRef = useRef(null);

  const orderIdempotencyKeyRef = useRef(null);

  const orderSideRef = useRef("BUY");

  // =========================================================
  // CLOSE POSITION CONFIRMATION
  // =========================================================

  const [closeConfirmPosition, setCloseConfirmPosition] =
    useState(null);

  // =========================================================
  // ACCOUNT MAPPER
  // =========================================================

  const mapAccountData = (accountData) => {
    if (!accountData) {
      return null;
    }

    return {
      balance: Number(accountData.balance ?? 0),

      equity: Number(accountData.equity ?? 0),

      margin: Number(accountData.margin ?? 0),

      freeMargin: Number(
        accountData.freeMargin ??
          accountData.free_margin ??
          0,
      ),

      leverage: Number(accountData.leverage ?? 0),
    };
  };

  // =========================================================
  // LOAD ACCOUNT
  // =========================================================

  async function loadAccount() {
    try {
      const response = await api.get("/account/me");

      console.log("======================================");
      console.log("ACCOUNT API RESPONSE:", response.data);
      console.log("======================================");

      if (!response.data?.success) {
        console.error(
          "Account request failed:",
          response.data,
        );

        return null;
      }

      const accountData =
        response.data?.data?.account;

      if (!accountData) {
        console.error(
          "Account data not found in API response.",
        );

        return null;
      }

      const mappedAccount =
        mapAccountData(accountData);

      if (!mappedAccount) {
        return null;
      }

      console.log("ACCOUNT DATA:", accountData);
      console.log(
        "MAPPED ACCOUNT:",
        mappedAccount,
      );
      console.log(
        "ACCOUNT LEVERAGE:",
        mappedAccount.leverage,
      );

      setAccount(mappedAccount);

      return mappedAccount;
    } catch (error) {
      console.error(
        "FAILED TO LOAD ACCOUNT:",
        error,
      );

      return null;
    }
  }

  // =========================================================
  // LOAD MARKETS
  // =========================================================

  async function loadMarkets() {
    try {
      const response =
        await api.get("/market/symbols");

      console.log(
        "Market API response:",
        response.data,
      );

      if (!response.data?.success) {
        console.error(
          "Market request failed:",
          response.data,
        );

        return;
      }

      const symbols = Array.isArray(
        response.data?.data,
      )
        ? response.data.data
        : [];

      console.log(
        "MARKET SYMBOLS:",
        symbols,
      );

      if (symbols.length === 0) {
        console.warn(
          "No active market symbols returned from API.",
        );

        setMarkets([]);

        return;
      }

      setMarkets(symbols);

      const selectedMarketData =
        symbols.find(
          (item) =>
            item.symbol ===
            selectedSymbolRef.current,
        ) ||
        symbols.find(
          (item) => item.symbol === "XAUUSD",
        ) ||
        symbols[0];

      if (!selectedMarketData) {
        return;
      }

      const symbol =
        selectedMarketData.symbol;

      setSelectedSymbol(symbol);

      selectedSymbolRef.current = symbol;

      setMarket({
        symbol,

        bid: Number(
          selectedMarketData.bid ?? 0,
        ),

        ask: Number(
          selectedMarketData.ask ?? 0,
        ),

        spread: Number(
          selectedMarketData.spread ?? 0,
        ),
      });

      console.log(
        "SELECTED MARKET:",
        selectedMarketData,
      );
    } catch (error) {
      console.error(
        "Failed to load markets:",
        error,
      );
    }
  }

  // =========================================================
  // LOAD OPEN POSITIONS
  // =========================================================

  const loadPositions = async () => {
    try {
      setPositionsLoading(true);

      setPositionsError("");

      const response =
        await api.get("/positions");

      console.log(
        "POSITIONS API RESPONSE:",
        response.data,
      );

      if (!response.data?.success) {
        throw new Error(
          response.data?.message ||
            "Failed to load positions.",
        );
      }

      const positionData =
        response.data?.data?.positions || [];

      console.log(
        "OPEN POSITIONS:",
        positionData,
      );

      setPositions(positionData);
    } catch (error) {
      console.error(
        "Load positions error:",
        error,
      );

      setPositionsError(
        error.response?.data?.message ||
          error.message ||
          "Failed to load open positions.",
      );
    } finally {
      setPositionsLoading(false);
    }
  };

  // =========================================================
  // CALCULATE LIVE POSITION P/L
  // =========================================================

  const calculateLivePositionPnl = (
    position,
    bid,
    ask,
  ) => {
    const side = String(
      position.side || "",
    ).toUpperCase();

    const entryPrice = Number(
      position.entry_price,
    );

    const volume = Number(
      position.volume,
    );

    const contractSize = Number(
      position.contract_size,
    );

    if (
      !Number.isFinite(entryPrice) ||
      !Number.isFinite(volume) ||
      !Number.isFinite(contractSize)
    ) {
      return {
        currentPrice:
          Number(position.current_price) ||
          0,

        pnl:
          Number(position.unrealized_pnl) ||
          0,
      };
    }

    let currentPrice = 0;
    let pnl = 0;

    if (side === "BUY") {
      currentPrice = bid;

      pnl =
        (currentPrice - entryPrice) *
        volume *
        contractSize;
    } else if (side === "SELL") {
      currentPrice = ask;

      pnl =
        (entryPrice - currentPrice) *
        volume *
        contractSize;
    } else {
      currentPrice =
        Number(position.current_price) ||
        0;

      pnl =
        Number(position.unrealized_pnl) ||
        0;
    }

    return {
      currentPrice,
      pnl,
    };
  };

  // =========================================================
  // REQUEST CLOSE POSITION
  // =========================================================

  const requestClosePosition = (
    position,
  ) => {
    if (
      !position?.id ||
      closingPositionId !== null
    ) {
      return;
    }

    setClosePositionError("");
    setClosePositionMessage("");

    setCloseConfirmPosition(position);
  };

  // =========================================================
  // CANCEL CLOSE CONFIRMATION
  // =========================================================

  const cancelCloseConfirmation = () => {
    if (closingPositionId !== null) {
      return;
    }

    setCloseConfirmPosition(null);
  };

  // =========================================================
  // CONFIRM CLOSE POSITION
  // =========================================================

  const confirmClosePosition =
    async () => {
      if (
        !closeConfirmPosition?.id ||
        closingPositionId !== null
      ) {
        return;
      }

      const positionId =
        closeConfirmPosition.id;

      try {
        setClosingPositionId(positionId);

        setClosePositionError("");
        setClosePositionMessage("");

        const response =
          await api.post(
            `/positions/${positionId}/close`,
          );

        console.log(
          "Close position response:",
          response.data,
        );

        if (!response.data?.success) {
          throw new Error(
            response.data?.message ||
              "Failed to close position.",
          );
        }

        setClosePositionMessage(
          response.data?.message ||
            "Position closed successfully.",
        );

        setCloseConfirmPosition(null);

        // Refresh account
        await loadAccount();

        // Refresh positions
        await loadPositions();
      } catch (error) {
        console.error(
          "Close position error:",
          error,
        );

        console.error(
          "Close position response:",
          error.response?.data,
        );

        console.error(
          "Close position status:",
          error.response?.status,
        );

        setClosePositionError(
          error.userMessage ||
            error.response?.data?.message ||
            error.message ||
            "Failed to close position.",
        );
      } finally {
        setClosingPositionId(null);
      }
    };

  // =========================================================
  // WEBSOCKET + INITIAL LOAD
  // =========================================================

  useEffect(() => {
    loadAccount();

    loadMarkets();

    loadPositions();

    connectWebSocket();

    const unsubscribe =
      subscribeWebSocket((message) => {
        if (
          message.type !==
            "market_price" ||
          !message.data?.symbol
        ) {
          return;
        }

        const liveSymbol =
          message.data.symbol;

        const bid = Number(
          message.data.bid,
        );

        const ask = Number(
          message.data.ask,
        );

        const spread = Number(
          message.data.spread,
        );

        if (
          !Number.isFinite(bid) ||
          !Number.isFinite(ask)
        ) {
          return;
        }

        // =====================================================
        // SELECTED MARKET
        // =====================================================

        if (
          liveSymbol ===
          selectedSymbolRef.current
        ) {
          setMarket(
            (previousMarket) => ({
              ...previousMarket,

              symbol: liveSymbol,

              bid,

              ask,

              spread,
            }),
          );
        }

        // =====================================================
        // MARKET WATCH
        // =====================================================

        setMarkets(
          (previousMarkets) =>
            previousMarkets.map(
              (item) =>
                item.symbol === liveSymbol
                  ? {
                      ...item,

                      bid,

                      ask,

                      spread,
                    }
                  : item,
            ),
        );

        // =====================================================
        // LIVE POSITIONS
        // =====================================================

        setPositions(
          (previousPositions) =>
            previousPositions.map(
              (position) => {
                if (
                  position.symbol !==
                  liveSymbol
                ) {
                  return position;
                }

                const liveResult =
                  calculateLivePositionPnl(
                    position,
                    bid,
                    ask,
                  );

                return {
                  ...position,

                  current_price:
                    liveResult.currentPrice,

                  unrealized_pnl:
                    liveResult.pnl,
                };
              },
            ),
        );

        // =====================================================
        // ORDER CONFIRMATION PRICE SAFETY
        // =====================================================

        if (
          orderConfirmationOpenRef.current &&
          orderPriceSnapshotRef.current
            ?.symbol === liveSymbol
        ) {
          const snapshot =
            orderPriceSnapshotRef.current;

          const digits =
            liveSymbol === "XAUUSD" ||
            liveSymbol === "BTCUSD"
              ? 2
              : 5;

          const tickSize =
            10 ** -digits;

          const threshold =
            tickSize * 3;

          const referencePrice =
            orderSideRef.current ===
            "BUY"
              ? snapshot.ask
              : snapshot.bid;

          const livePrice =
            orderSideRef.current ===
            "BUY"
              ? ask
              : bid;

          if (
            Math.abs(
              livePrice -
                referencePrice,
            ) >= threshold
          ) {
            setOrderPriceChanged(true);
          }
        }
      });

    return unsubscribe;
  }, []);

  // =========================================================
  // TRADING SAFETY - ORDER SIDE
  // =========================================================

  useEffect(() => {
    orderSideRef.current =
      orderSide;
  }, [orderSide]);

  // =========================================================
  // TRADING SAFETY - CONFIRMATION
  // =========================================================

  useEffect(() => {
    orderConfirmationOpenRef.current =
      showOrderConfirmation;

    if (!showOrderConfirmation) {
      orderPriceSnapshotRef.current =
        null;

      setOrderPriceSnapshot(null);

      setOrderPriceChanged(false);
    }
  }, [showOrderConfirmation]);

  // =========================================================
  // ESC KEY
  // =========================================================

  useEffect(() => {
    const handleKeyDown = (
      event,
    ) => {
      if (event.key !== "Escape") {
        return;
      }

      if (
        showOrderConfirmation &&
        !orderLoading
      ) {
        setShowOrderConfirmation(false);

        return;
      }

      if (
        closeConfirmPosition &&
        closingPositionId === null
      ) {
        setCloseConfirmPosition(null);
      }
    };

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [
    showOrderConfirmation,
    orderLoading,
    closeConfirmPosition,
    closingPositionId,
  ]);

  // =========================================================
  // LIVE ACCOUNT EQUITY
  // =========================================================

  useEffect(() => {
    if (!positions.length) {
      return;
    }

    const totalUnrealizedPnl =
      positions.reduce(
        (total, position) => {
          return (
            total +
            (Number(
              position.unrealized_pnl,
            ) || 0)
          );
        },
        0,
      );

    setAccount(
      (previousAccount) => {
        const balance =
          Number(
            previousAccount.balance,
          ) || 0;

        const margin =
          Number(
            previousAccount.margin,
          ) || 0;

        const calculatedEquity =
          balance +
          totalUnrealizedPnl;

        const calculatedFreeMargin =
          calculatedEquity - margin;

        return {
          ...previousAccount,

          leverage:
            Number(
              previousAccount.leverage,
            ) || 0,

          equity:
            calculatedEquity,

          freeMargin:
            calculatedFreeMargin,
        };
      },
    );
  }, [positions]);

  // =========================================================
  // MARGIN PREVIEW
  // =========================================================

  const selectedMarket =
    markets.find(
      (item) =>
        item.symbol ===
        selectedSymbol,
    );

  const contractSize = Number(
    selectedMarket?.contract_size ??
      selectedMarket?.contractSize ??
      0,
  );

  const leverage = Number(
    account?.leverage,
  );

  const safeLeverage =
    Number.isFinite(leverage) &&
    leverage > 0
      ? leverage
      : 0;

  const previewEntryPrice =
    orderSide === "BUY"
      ? Number(market.ask)
      : Number(market.bid);

  const previewVolume =
    Number(orderVolume) || 0;

  const requiredMargin =
    contractSize > 0 &&
    safeLeverage > 0 &&
    previewEntryPrice > 0 &&
    previewVolume > 0
      ? (previewVolume *
          contractSize *
          previewEntryPrice) /
        safeLeverage
      : 0;

  const availableFreeMargin =
    Number(account.freeMargin) || 0;

  const hasEnoughMargin =
    requiredMargin > 0 &&
    requiredMargin <=
      availableFreeMargin;

  const marginLevel =
    Number(account.margin) > 0
      ? (Number(account.equity) /
          Number(account.margin)) *
        100
      : null;

  let marginStatus = "normal";

  if (
    marginLevel !== null &&
    marginLevel < 100
  ) {
    marginStatus = "danger";
  } else if (
    marginLevel !== null &&
    marginLevel < 150
  ) {
    marginStatus = "warning";
  }

  // =========================================================
  // PLACE MARKET ORDER
  // =========================================================

  const placeMarketOrder =
    async () => {
      try {
        setOrderLoading(true);

        setOrderMessage("");
        setOrderError("");

        // =====================================================
        // VOLUME VALIDATION
        // =====================================================

        const volume =
          Number(orderVolume);

        const MIN_VOLUME = 0.01;
        const MAX_VOLUME = 100;
        const VOLUME_STEP = 0.01;

        if (!Number.isFinite(volume)) {
          setOrderError(
            "Please enter a valid volume.",
          );

          return;
        }

        if (volume < MIN_VOLUME) {
          setOrderError(
            `Minimum volume is ${MIN_VOLUME.toFixed(
              2,
            )} lot.`,
          );

          return;
        }

        if (volume > MAX_VOLUME) {
          setOrderError(
            `Maximum volume is ${MAX_VOLUME.toFixed(
              2,
            )} lots.`,
          );

          return;
        }

        const stepCheck =
          Math.round(
            volume / VOLUME_STEP,
          ) * VOLUME_STEP;

        if (
          Math.abs(
            volume - stepCheck,
          ) > 0.0000001
        ) {
          setOrderError(
            "Volume must be in 0.01 lot steps.",
          );

          return;
        }

        // =====================================================
        // CURRENT MARKET PRICE VALIDATION
        // =====================================================

        const bid = Number(
          market.bid,
        );

        const ask = Number(
          market.ask,
        );

        if (
          !Number.isFinite(bid) ||
          !Number.isFinite(ask) ||
          bid <= 0 ||
          ask <= 0
        ) {
          setOrderError(
            "Live market price is not available.",
          );

          return;
        }

        // =====================================================
        // SPREAD VALIDATION
        // =====================================================

        const spread = Number(
          market.spread,
        );

        if (
          !Number.isFinite(spread) ||
          spread < 0
        ) {
          setOrderError(
            "Live market spread is not available.",
          );

          return;
        }

        if (ask < bid) {
          setOrderError(
            "Invalid market prices received.",
          );

          return;
        }

        // =====================================================
        // ENTRY PRICE
        // BUY -> ASK
        // SELL -> BID
        // =====================================================

        const entryPrice =
          orderSide === "BUY"
            ? ask
            : bid;

        // =====================================================
        // STOP LOSS VALIDATION
        // =====================================================

        let stopLossValue = null;

        if (
          stopLoss.trim() !== ""
        ) {
          stopLossValue =
            Number(stopLoss);

          if (
            !Number.isFinite(
              stopLossValue,
            ) ||
            stopLossValue <= 0
          ) {
            setOrderError(
              "Please enter a valid Stop Loss price.",
            );

            return;
          }

          if (
            orderSide === "BUY" &&
            stopLossValue >=
              entryPrice
          ) {
            setOrderError(
              `For BUY, Stop Loss must be below entry price (${entryPrice}).`,
            );

            return;
          }

          if (
            orderSide === "SELL" &&
            stopLossValue <=
              entryPrice
          ) {
            setOrderError(
              `For SELL, Stop Loss must be above entry price (${entryPrice}).`,
            );

            return;
          }
        }

        // =====================================================
        // TAKE PROFIT VALIDATION
        // =====================================================

        let takeProfitValue = null;

        if (
          takeProfit.trim() !== ""
        ) {
          takeProfitValue =
            Number(takeProfit);

          if (
            !Number.isFinite(
              takeProfitValue,
            ) ||
            takeProfitValue <= 0
          ) {
            setOrderError(
              "Please enter a valid Take Profit price.",
            );

            return;
          }

          if (
            orderSide === "BUY" &&
            takeProfitValue <=
              entryPrice
          ) {
            setOrderError(
              `For BUY, Take Profit must be above entry price (${entryPrice}).`,
            );

            return;
          }

          if (
            orderSide === "SELL" &&
            takeProfitValue >=
              entryPrice
          ) {
            setOrderError(
              `For SELL, Take Profit must be below entry price (${entryPrice}).`,
            );

            return;
          }
        }

        // =====================================================
        // CURRENT MARKET DATA
        // =====================================================

        const currentSelectedMarket =
          markets.find(
            (item) =>
              item.symbol ===
              selectedSymbol,
          );

        const currentContractSize =
          Number(
            currentSelectedMarket?.contract_size ??
              currentSelectedMarket?.contractSize ??
              0,
          );

        if (
          currentContractSize <= 0
        ) {
          setOrderError(
            "Contract size is not available for this symbol.",
          );

          return;
        }

        // =====================================================
        // ACCOUNT DATA
        // =====================================================

        let currentAccount =
          account;

        let currentLeverage =
          Number(
            currentAccount?.leverage,
          );

        let freeMargin =
          Number(
            currentAccount?.freeMargin,
          );

        console.log(
          "======================================",
        );
        console.log(
          "ACCOUNT BEFORE ORDER:",
          currentAccount,
        );
        console.log(
          "LEVERAGE BEFORE REFRESH:",
          currentLeverage,
        );
        console.log(
          "FREE MARGIN BEFORE REFRESH:",
          freeMargin,
        );
        console.log(
          "======================================",
        );

        // =====================================================
        // REFRESH ACCOUNT IF NEEDED
        // =====================================================

        if (
          !Number.isFinite(
            currentLeverage,
          ) ||
          currentLeverage <= 0 ||
          !Number.isFinite(
            freeMargin,
          ) ||
          freeMargin < 0
        ) {
          console.warn(
            "Account state is incomplete. Refreshing account from backend...",
          );

          const refreshedAccount =
            await loadAccount();

          if (refreshedAccount) {
            currentAccount =
              refreshedAccount;

            currentLeverage =
              Number(
                refreshedAccount.leverage,
              );

            freeMargin =
              Number(
                refreshedAccount.freeMargin,
              );
          }

          console.log(
            "======================================",
          );
          console.log(
            "REFRESHED ACCOUNT:",
            currentAccount,
          );
          console.log(
            "LEVERAGE AFTER REFRESH:",
            currentLeverage,
          );
          console.log(
            "FREE MARGIN AFTER REFRESH:",
            freeMargin,
          );
          console.log(
            "======================================",
          );
        }

        // =====================================================
        // FINAL LEVERAGE VALIDATION
        // =====================================================

        if (
          !Number.isFinite(
            currentLeverage,
          ) ||
          currentLeverage <= 0
        ) {
          setOrderError(
            "Account leverage is not available. Please refresh the dashboard and try again.",
          );

          return;
        }

        // =====================================================
        // FINAL FREE MARGIN VALIDATION
        // =====================================================

        if (
          !Number.isFinite(
            freeMargin,
          ) ||
          freeMargin < 0
        ) {
          setOrderError(
            "Account free margin is not available. Please refresh the dashboard and try again.",
          );

          return;
        }

        // =====================================================
        // REQUIRED MARGIN
        // =====================================================

        const currentRequiredMargin =
          (volume *
            currentContractSize *
            entryPrice) /
          currentLeverage;

        console.log(
          "======================================",
        );
        console.log(
          "ORDER MARGIN CALCULATION",
        );
        console.log(
          "CONTRACT SIZE:",
          currentContractSize,
        );
        console.log(
          "LEVERAGE:",
          currentLeverage,
        );
        console.log(
          "ENTRY PRICE:",
          entryPrice,
        );
        console.log(
          "VOLUME:",
          volume,
        );
        console.log(
          "REQUIRED MARGIN:",
          currentRequiredMargin,
        );
        console.log(
          "FREE MARGIN:",
          freeMargin,
        );
        console.log(
          "======================================",
        );

        if (
          !Number.isFinite(
            currentRequiredMargin,
          ) ||
          currentRequiredMargin <= 0
        ) {
          setOrderError(
            "Unable to calculate required margin.",
          );

          return;
        }

        if (
          currentRequiredMargin >
          freeMargin
        ) {
          setOrderError(
            `Insufficient free margin. Required: $${currentRequiredMargin.toFixed(
              2,
            )}, Available: $${freeMargin.toFixed(
              2,
            )}.`,
          );

          return;
        }

        // =====================================================
        // ORDER PAYLOAD
        // =====================================================

        const payload = {
          symbol: selectedSymbol,

          side: orderSide,

          volume,

          stopLoss:
            stopLossValue,

          takeProfit:
            takeProfitValue,
        };

        console.log(
          "PREPARED MARKET ORDER:",
          payload,
        );

        // =====================================================
        // ORDER CONFIRMATION SNAPSHOT
        // =====================================================

        const snapshot = {
          symbol:
            selectedSymbol,

          side:
            orderSide,

          volume,

          stopLoss:
            stopLossValue,

          takeProfit:
            takeProfitValue,

          bid,

          ask,

          spread,

          entryPrice,

          requiredMargin:
            currentRequiredMargin,

          createdAt:
            Date.now(),
        };

        setOrderPriceSnapshot(
          snapshot,
        );

        orderPriceSnapshotRef.current =
          snapshot;

        setOrderPriceChanged(
          false,
        );

        setOrderError("");

        orderConfirmationOpenRef.current =
          true;

        setShowOrderConfirmation(
          true,
        );

        // =====================================================
        // CREATE IDEMPOTENCY KEY ONCE
        // =====================================================

        orderIdempotencyKeyRef.current =
          window.crypto?.randomUUID?.() ||
          `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`;
      } catch (error) {
        console.error(
          "Prepare market order error:",
          error,
        );

        setOrderError(
          error.userMessage ||
            error.response?.data?.message ||
            error.message ||
            "Unable to prepare order confirmation.",
        );
      } finally {
        setOrderLoading(false);
      }
    };

  // =========================================================
  // CANCEL ORDER CONFIRMATION
  // =========================================================

  const cancelOrderConfirmation =
    () => {
      if (orderLoading) {
        return;
      }

      orderConfirmationOpenRef.current =
        false;

      setShowOrderConfirmation(
        false,
      );

      setOrderPriceChanged(
        false,
      );

      setOrderPriceSnapshot(
        null,
      );

      orderPriceSnapshotRef.current =
        null;

      orderIdempotencyKeyRef.current =
        null;
    };

  // =========================================================
  // CONFIRM MARKET ORDER
  // =========================================================

  async function confirmMarketOrder() {
    if (!orderPriceSnapshot) {
      alert(
        "Order price is not available.",
      );

      return;
    }

    setOrderLoading(true);

    setOrderError("");
    setOrderMessage("");

    try {
      // =====================================================
      // VOLUME
      // =====================================================

      const volume = Number(
        orderPriceSnapshot.volume,
      );

      if (
        !Number.isFinite(volume) ||
        volume <= 0
      ) {
        setOrderError(
          "Invalid order volume.",
        );

        alert(
          "Invalid order volume. Please enter a valid lot size.",
        );

        return;
      }

      // =====================================================
      // ENTRY PRICE
      // =====================================================

      const entryPrice = Number(
        orderPriceSnapshot.entryPrice,
      );

      if (
        !Number.isFinite(entryPrice) ||
        entryPrice <= 0
      ) {
        setOrderError(
          "Invalid order price.",
        );

        alert(
          "Invalid market price. Please refresh the price.",
        );

        return;
      }

      // =====================================================
      // ORDER PAYLOAD
      // =====================================================

      const payload = {
        symbol:
          orderPriceSnapshot.symbol,

        side:
          orderPriceSnapshot.side,

        volume,

        price:
          entryPrice,

        stopLoss:
          orderPriceSnapshot.stopLoss !==
            null &&
          orderPriceSnapshot.stopLoss !==
            undefined &&
          orderPriceSnapshot.stopLoss !==
            ""
            ? Number(
                orderPriceSnapshot.stopLoss,
              )
            : null,

        takeProfit:
          orderPriceSnapshot.takeProfit !==
            null &&
          orderPriceSnapshot.takeProfit !==
            undefined &&
          orderPriceSnapshot.takeProfit !==
            ""
            ? Number(
                orderPriceSnapshot.takeProfit,
              )
            : null,
      };

      console.log(
        "======================================",
      );
      console.log(
        "CONFIRMING MARKET ORDER",
      );
      console.log(
        "PAYLOAD:",
        payload,
      );
      console.log(
        "VOLUME:",
        volume,
      );
      console.log(
        "ENDPOINT:",
        "/order",
      );
      console.log(
        "======================================",
      );

      // =====================================================
      // IDEMPOTENCY KEY
      // =====================================================

      const idempotencyKey =
        orderIdempotencyKeyRef.current ||
        window.crypto?.randomUUID?.() ||
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`;

      // =====================================================
      // SEND ORDER
      // =====================================================

      const response =
        await api.post(
          "/order",
          payload,
          {
            headers: {
              "Idempotency-Key":
                idempotencyKey,
            },
          },
        );

      console.log(
        "======================================",
      );
      console.log(
        "MARKET ORDER SUCCESS",
      );
      console.log(
        response.data,
      );
      console.log(
        "======================================",
      );

      // =====================================================
      // VERIFY API SUCCESS
      // =====================================================

      if (!response.data?.success) {
        throw new Error(
          response.data?.message ||
            "Market order execution failed.",
        );
      }

      // =====================================================
      // CLOSE CONFIRMATION MODAL
      // =====================================================

      orderConfirmationOpenRef.current =
        false;

      setShowOrderConfirmation(
        false,
      );

      setOrderPriceChanged(
        false,
      );

      setOrderPriceSnapshot(
        null,
      );

      orderPriceSnapshotRef.current =
        null;

      orderIdempotencyKeyRef.current =
        null;

      // =====================================================
      // CLEAR RISK INPUTS
      // =====================================================

      setStopLoss("");
      setTakeProfit("");

      // =====================================================
      // REFRESH ACCOUNT
      // =====================================================

      try {
        await loadAccount();
      } catch (error) {
        console.error(
          "Account refresh error:",
          error,
        );
      }

      // =====================================================
      // REFRESH POSITIONS
      // IMPORTANT: loadPositions(), NOT fetchPositions()
      // =====================================================

      try {
        await loadPositions();
      } catch (error) {
        console.error(
          "Positions refresh error:",
          error,
        );
      }

      // =====================================================
      // SUCCESS MESSAGE
      // =====================================================

      const successMessage =
        response.data?.message ||
        "Market order executed successfully.";

      setOrderMessage(
        successMessage,
      );

      alert(successMessage);
    } catch (error) {
      console.error(
        "======================================",
      );
      console.error(
        "MARKET ORDER FAILED",
      );
      console.error(
        "STATUS:",
        error.response?.status,
      );
      console.error(
        "SERVER RESPONSE:",
        error.response?.data,
      );
      console.error(
        "REQUEST:",
        error.config?.data,
      );
      console.error(
        "======================================",
      );

      const serverMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        "Order failed.";

      setOrderError(
        serverMessage,
      );

      alert(serverMessage);
    } finally {
      setOrderLoading(false);
    }
  }

  // =========================================================
  // REFRESH ORDER PRICE
  // =========================================================

  function refreshOrderPrice() {
    if (!orderPriceSnapshot) {
      setOrderError(
        "Order price is not available.",
      );

      return;
    }

    const bid = Number(
      market?.bid,
    );

    const ask = Number(
      market?.ask,
    );

    if (
      !Number.isFinite(bid) ||
      !Number.isFinite(ask) ||
      bid <= 0 ||
      ask <= 0
    ) {
      setOrderError(
        "Live market price is not available.",
      );

      alert(
        "Live market price is not available. Please wait a moment.",
      );

      return;
    }

    const volume = Number(
      orderPriceSnapshot.volume ??
        orderVolume,
    );

    if (
      !Number.isFinite(volume) ||
      volume <= 0
    ) {
      setOrderError(
        "Invalid order volume.",
      );

      alert(
        "Invalid order volume.",
      );

      return;
    }

    // IMPORTANT:
    // Use the side stored in the confirmation snapshot.
    const snapshotSide =
      String(
        orderPriceSnapshot.side ||
          orderSide,
      ).toUpperCase();

    // BUY -> ASK
    // SELL -> BID
    const entryPrice =
      snapshotSide === "BUY"
        ? ask
        : bid;

    const selectedMarket =
      markets.find(
        (item) =>
          String(item.symbol).toUpperCase() ===
          String(
            orderPriceSnapshot.symbol ||
              selectedSymbol,
          ).toUpperCase(),
      );

    const refreshedContractSize =
      Number(
        selectedMarket?.contractSize ??
          selectedMarket?.contract_size ??
          0,
      );

    const leverage = Number(
      account?.leverage,
    );

    if (
      !Number.isFinite(
        refreshedContractSize,
      ) ||
      refreshedContractSize <= 0
    ) {
      setOrderError(
        "Invalid contract size.",
      );

      alert(
        "Contract size is not available.",
      );

      return;
    }

    if (
      !Number.isFinite(leverage) ||
      leverage <= 0
    ) {
      setOrderError(
        "Invalid account leverage.",
      );

      alert(
        "Account leverage is not available.",
      );

      return;
    }

    const requiredMargin =
      (volume *
        refreshedContractSize *
        entryPrice) /
      leverage;

    const refreshedSnapshot = {
      ...orderPriceSnapshot,

      symbol:
        orderPriceSnapshot.symbol ||
        selectedSymbol,

      side: snapshotSide,

      volume,

      stopLoss:
        stopLoss.trim() !== ""
          ? Number(stopLoss)
          : orderPriceSnapshot.stopLoss,

      takeProfit:
        takeProfit.trim() !== ""
          ? Number(takeProfit)
          : orderPriceSnapshot.takeProfit,

      bid,

      ask,

      spread:
        Number(market?.spread) ||
        ask - bid,

      entryPrice,

      requiredMargin,

      createdAt:
        Date.now(),
    };

    setOrderPriceSnapshot(
      refreshedSnapshot,
    );

    orderPriceSnapshotRef.current =
      refreshedSnapshot;

    setOrderPriceChanged(
      false,
    );

    setOrderError("");

    console.log(
      "ORDER PRICE REFRESHED:",
      refreshedSnapshot,
    );
  }

  // =========================================================
  // LOGOUT
  // =========================================================

  function handleLogout() {
    localStorage.removeItem(
      "tradex_token",
    );

    localStorage.removeItem(
      "tradex_user",
    );

    window.location.href = "/";
  }

  // =========================================================
  // UI
  // =========================================================

  return (
    <div className="trading-terminal">
      {/* =====================================================
          TOP BAR
      ===================================================== */}

      <header className="topbar">
        <div className="topbar-left">
          <div className="logo">
            <span className="logo-icon">
              T
            </span>

            <span>TradeX</span>
          </div>

          <nav className="main-nav">
            <button className="nav-item active">
              Markets
            </button>

            <button className="nav-item">
              Trade
            </button>

            <Link
              to="/history"
              className="nav-item"
            >
              History
            </Link>
          </nav>
        </div>

        <div className="topbar-right">
          <button className="icon-button">
            <Bell size={18} />
          </button>

          <button className="icon-button">
            <Settings size={18} />
          </button>

          <div className="user-menu">
            <User size={17} />

            <span>Account</span>
          </div>

          <button
            className="logout-button"
            onClick={handleLogout}
          >
            <LogOut size={17} />

            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* =====================================================
          MAIN TERMINAL
      ===================================================== */}

      <main className="terminal-content">
        {/* ===================================================
            MARKET WATCH
        =================================================== */}

        <aside className="market-watch">
          <div className="panel-header">
            <div>
              <h3>Market Watch</h3>

              <span>
                Live Markets
              </span>
            </div>

            <span className="live-indicator">
              ● LIVE
            </span>
          </div>

          <div className="market-list">
            {markets.map(
              (item) => (
                <div
                  key={item.symbol}
                  className={`market-item ${
                    selectedSymbol ===
                    item.symbol
                      ? "active"
                      : ""
                  }`}
                  onClick={() => {
                    setSelectedSymbol(
                      item.symbol,
                    );

                    selectedSymbolRef.current =
                      item.symbol;

                    setMarket({
                      symbol:
                        item.symbol,

                      bid: Number(
                        item.bid,
                      ),

                      ask: Number(
                        item.ask,
                      ),

                      spread: Number(
                        item.spread,
                      ),
                    });

                    setOrderMessage("");
                    setOrderError("");
                  }}
                >
                  <div>
                    <strong>
                      {item.symbol}
                    </strong>

                    <span>
                      {item.name}
                    </span>
                  </div>

                  <div className="market-price">
                    <strong>
                      {Number(
                        item.bid,
                      ).toFixed(
                        item.digits,
                      )}
                    </strong>

                    <span>
                      {Number(
                        item.spread,
                      ).toFixed(
                        item.digits,
                      )}
                    </span>
                  </div>
                </div>
              ),
            )}
          </div>
        </aside>

        {/* ===================================================
            CHART
        =================================================== */}

        <section className="chart-section">
          <div className="chart-header">
            <div>
              <strong>
                {market.symbol}
              </strong>

              <span>
                {markets.find(
                  (item) =>
                    item.symbol ===
                    market.symbol,
                )?.name ||
                  "Market"}
              </span>
            </div>

            <div className="market-header-price">
              <span>BID</span>

              <strong>
                {market.bid
                  ? market.bid.toFixed(
                      markets.find(
                        (item) =>
                          item.symbol ===
                          market.symbol,
                      )?.digits || 2,
                    )
                  : "0.00"}
              </strong>
            </div>

            <div className="market-header-price">
              <span>ASK</span>

              <strong>
                {market.ask
                  ? market.ask.toFixed(
                      markets.find(
                        (item) =>
                          item.symbol ===
                          market.symbol,
                      )?.digits || 2,
                    )
                  : "0.00"}
              </strong>
            </div>

            <div className="market-header-price">
              <span>SPREAD</span>

              <strong>
                {Number(
                  market.spread || 0,
                ).toFixed(
                  markets.find(
                    (item) =>
                      item.symbol ===
                      market.symbol,
                  )?.digits || 2,
                )}
              </strong>
            </div>
          </div>

          <div className="chart-area">
            <TradingChart
              symbol={market.symbol}
              bid={market.bid}
              ask={market.ask}
              positions={positions}
            />
          </div>
        </section>

        {/* ===================================================
            ORDER PANEL
        =================================================== */}

        <div className="order-panel">
          <div className="order-panel-header">
            <div>
              <h3>
                Place Order
              </h3>

              <span>
                {selectedSymbol}
              </span>
            </div>

            <span className="order-live-status">
              <span className="live-dot"></span>
              LIVE
            </span>
          </div>

          {/* BUY / SELL */}

          <div className="order-side-buttons">
            <button
              type="button"
              className={
                orderSide === "SELL"
                  ? "order-side active-sell"
                  : "order-side"
              }
              onClick={() => {
                setOrderSide("SELL");

                setOrderMessage("");
                setOrderError("");
              }}
            >
              <span>SELL</span>

              <strong>
                {Number(
                  market.bid || 0,
                ).toFixed(
                  selectedSymbol ===
                    "XAUUSD" ||
                  selectedSymbol ===
                    "BTCUSD"
                    ? 2
                    : 5,
                )}
              </strong>
            </button>

            <button
              type="button"
              className={
                orderSide === "BUY"
                  ? "order-side active-buy"
                  : "order-side"
              }
              onClick={() => {
                setOrderSide("BUY");

                setOrderMessage("");
                setOrderError("");
              }}
            >
              <span>BUY</span>

              <strong>
                {Number(
                  market.ask || 0,
                ).toFixed(
                  selectedSymbol ===
                    "XAUUSD" ||
                  selectedSymbol ===
                    "BTCUSD"
                    ? 2
                    : 5,
                )}
              </strong>
            </button>
          </div>

          {/* ORDER DETAILS */}

          <div className="order-section-title">
            Order Details
          </div>

          {/* VOLUME */}

          <div className="order-field">
            <div className="order-field-label">
              <label>
                Volume
              </label>

              <span>
                0.01 – 100 lots
              </span>
            </div>

            <div className="input-with-unit">
              <input
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={
                  orderVolume
                }
                onChange={(
                  event,
                ) =>
                  setOrderVolume(
                    event.target
                      .value,
                  )
                }
                placeholder="0.01"
              />

              <span>
                LOT
              </span>
            </div>
          </div>

          {/* MARKET PRICES */}

          <div className="order-market-box">
            <div className="order-market-row">
              <span>Bid</span>

              <strong>
                {Number(
                  market.bid || 0,
                ).toFixed(
                  selectedSymbol ===
                    "XAUUSD" ||
                  selectedSymbol ===
                    "BTCUSD"
                    ? 2
                    : 5,
                )}
              </strong>
            </div>

            <div className="order-market-row">
              <span>Ask</span>

              <strong>
                {Number(
                  market.ask || 0,
                ).toFixed(
                  selectedSymbol ===
                    "XAUUSD" ||
                  selectedSymbol ===
                    "BTCUSD"
                    ? 2
                    : 5,
                )}
              </strong>
            </div>

            <div className="order-market-row">
              <span>
                Spread
              </span>

              <strong>
                {Number(
                  market.spread || 0,
                ).toFixed(
                  selectedSymbol ===
                    "XAUUSD" ||
                  selectedSymbol ===
                    "BTCUSD"
                    ? 2
                    : 5,
                )}
              </strong>
            </div>

            <div className="order-market-row entry-row">
              <span>
                Entry Price
              </span>

              <strong>
                {Number(
                  orderSide ===
                    "BUY"
                    ? market.ask
                    : market.bid,
                ).toFixed(
                  selectedSymbol ===
                    "XAUUSD" ||
                  selectedSymbol ===
                    "BTCUSD"
                    ? 2
                    : 5,
                )}
              </strong>
            </div>
          </div>

          {/* RISK MANAGEMENT */}

          <div className="order-section-title">
            Risk Management
          </div>

          {/* STOP LOSS */}

          <div className="order-field">
            <div className="order-field-label">
              <label>
                Stop Loss
              </label>

              <span>
                Optional
              </span>
            </div>

            <input
              type="number"
              step="0.01"
              value={stopLoss}
              onChange={(
                event,
              ) =>
                setStopLoss(
                  event.target
                    .value,
                )
              }
              placeholder={
                orderSide ===
                "BUY"
                  ? "Below entry"
                  : "Above entry"
              }
            />
          </div>

          {/* TAKE PROFIT */}

          <div className="order-field">
            <div className="order-field-label">
              <label>
                Take Profit
              </label>

              <span>
                Optional
              </span>
            </div>

            <input
              type="number"
              step="0.01"
              value={takeProfit}
              onChange={(
                event,
              ) =>
                setTakeProfit(
                  event.target
                    .value,
                )
              }
              placeholder={
                orderSide ===
                "BUY"
                  ? "Above entry"
                  : "Below entry"
              }
            />
          </div>

          {/* MARGIN */}

          <div className="order-section-title">
            Margin
          </div>

          <div className="margin-preview">
            <div className="margin-preview-row">
              <span>
                Contract Size
              </span>

              <strong>
                {contractSize >
                0
                  ? contractSize.toLocaleString()
                  : "-"}
              </strong>
            </div>

            <div className="margin-preview-row">
              <span>
                Leverage
              </span>

              <strong>
                1:
                {safeLeverage ||
                  "-"}
              </strong>
            </div>

            <div className="margin-preview-row">
              <span>
                Required Margin
              </span>

              <strong>
                $
                {requiredMargin.toFixed(
                  2,
                )}
              </strong>
            </div>

            <div className="margin-preview-row">
              <span>
                Free Margin
              </span>

              <strong>
                $
                {availableFreeMargin.toFixed(
                  2,
                )}
              </strong>
            </div>

            {requiredMargin >
              0 &&
              !hasEnoughMargin && (
                <div className="margin-warning">
                  Insufficient free
                  margin for this
                  order.
                </div>
              )}
          </div>

          {/* EXECUTION INFO */}

          <div className="execution-info">
            <span className="info-icon">
              i
            </span>

            <span>
              BUY executes at ASK.
              SELL executes at BID.
            </span>
          </div>

          {/* ORDER BUTTON */}

          <button
            type="button"
            className={
              orderSide ===
              "BUY"
                ? "place-order-btn buy"
                : "place-order-btn sell"
            }
            onClick={
              placeMarketOrder
            }
            disabled={
              orderLoading ||
              !Number.isFinite(
                Number(
                  market.bid,
                ),
              ) ||
              !Number.isFinite(
                Number(
                  market.ask,
                ),
              ) ||
              Number(
                market.bid,
              ) <= 0 ||
              Number(
                market.ask,
              ) <= 0 ||
              (requiredMargin >
                0 &&
                !hasEnoughMargin)
            }
          >
            {orderLoading
              ? "Placing Order..."
              : `Place ${orderSide}`}
          </button>

          {/* SUCCESS MESSAGE */}

          {orderMessage && (
            <div className="order-success">
              <span>✓</span>

              <span>
                {orderMessage}
              </span>
            </div>
          )}

          {/* ERROR MESSAGE */}

          {orderError && (
            <div className="order-error">
              <span>!</span>

              <span>
                {orderError}
              </span>
            </div>
          )}
        </div>
      </main>

      {/* =====================================================
          ACCOUNT SUMMARY
      ===================================================== */}

      <section className="account-summary-section">
        <div className="account-summary-grid">
          <div className="account-card">
            <span className="account-card-label">
              Balance
            </span>

            <strong>
              $
              {Number(
                account.balance || 0,
              ).toFixed(2)}
            </strong>
          </div>

          <div className="account-card">
            <span className="account-card-label">
              Equity
            </span>

            <strong>
              $
              {Number(
                account.equity || 0,
              ).toFixed(2)}
            </strong>
          </div>

          <div className="account-card">
            <span className="account-card-label">
              Margin
            </span>

            <strong>
              $
              {Number(
                account.margin || 0,
              ).toFixed(2)}
            </strong>
          </div>

          <div className="account-card">
            <span className="account-card-label">
              Free Margin
            </span>

            <strong>
              $
              {Number(
                account.freeMargin ||
                  0,
              ).toFixed(2)}
            </strong>
          </div>

          <div className="account-card">
            <span className="account-card-label">
              Leverage
            </span>

            <strong>
              1:
              {Number(
                account.leverage ||
                  0,
              )}
            </strong>
          </div>

          <div
            className={`account-card margin-level-card ${marginStatus}`}
          >
            <span className="account-card-label">
              Margin Level
            </span>

            <strong>
              {marginLevel !==
              null
                ? `${marginLevel.toFixed(
                    2,
                  )}%`
                : "N/A"}
            </strong>
          </div>
        </div>
      </section>

      {/* =====================================================
          OPEN POSITIONS
      ===================================================== */}

      <section className="bottom-area">
        <div className="positions-panel">
          {/* HEADER */}

          <div className="positions-header">
            <div className="positions-title-group">
              <div className="positions-title-row">
                <h3>
                  Open Positions
                </h3>

                <span className="positions-live-badge">
                  <span className="positions-live-dot"></span>
                  LIVE
                </span>
              </div>

              <span className="positions-subtitle">
                Active trades and
                unrealized
                profit/loss
              </span>
            </div>

            <div className="positions-count">
              {positions.length}

              <span>
                position
                {positions.length !==
                1
                  ? "s"
                  : ""}
              </span>
            </div>
          </div>

          {/* SUCCESS */}

          {closePositionMessage && (
            <div className="position-alert success">
              <span className="position-alert-icon">
                ✓
              </span>

              <span>
                {closePositionMessage}
              </span>
            </div>
          )}

          {/* ERROR */}

          {closePositionError && (
            <div className="position-alert error">
              <span className="position-alert-icon">
                !
              </span>

              <span>
                {closePositionError}
              </span>
            </div>
          )}

          {/* LOADING */}

          {positionsLoading ? (
            <div className="positions-state">
              <div className="positions-loading-dot"></div>

              <span>
                Loading
                positions...
              </span>
            </div>
          ) : positionsError ? (
            <div className="positions-state error-state">
              <span className="state-icon">
                !
              </span>

              <span>
                {positionsError}
              </span>
            </div>
          ) : positions.length ===
            0 ? (
            <div className="positions-state empty-state">
              <div className="empty-position-icon">
                ↕
              </div>

              <strong>
                No open positions
              </strong>

              <span>
                Your active
                trades will
                appear here.
              </span>
            </div>
          ) : (
            <div className="positions-table-wrapper">
              <table className="positions-table">
                <thead>
                  <tr>
                    <th>
                      Symbol
                    </th>

                    <th>
                      Side
                    </th>

                    <th>
                      Volume
                    </th>

                    <th>
                      Entry Price
                    </th>

                    <th>
                      Current
                      Price
                    </th>

                    <th>
                      Stop Loss
                    </th>

                    <th>
                      Take Profit
                    </th>

                    <th>
                      P/L
                    </th>

                    <th>
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {positions.map(
                    (position) => {
                      const positionSymbol =
                        position.symbol ||
                        "XAUUSD";

                      const positionSide =
                        String(
                          position.side ||
                            "",
                        ).toUpperCase();

                      const volume =
                        Number(
                          position.volume,
                        );

                      const entryPrice =
                        Number(
                          position.entry_price,
                        );

                      const currentPrice =
                        Number(
                          position.current_price,
                        );

                      const stopLoss =
                        position.stop_loss !==
                          null &&
                        position.stop_loss !==
                          undefined
                          ? Number(
                              position.stop_loss,
                            )
                          : null;

                      const takeProfit =
                        position.take_profit !==
                          null &&
                        position.take_profit !==
                          undefined
                          ? Number(
                              position.take_profit,
                            )
                          : null;

                      const unrealizedPnl =
                        Number(
                          position.unrealized_pnl,
                        );

                      const digits =
                        Number(
                          position.digits,
                        ) || 2;

                      const isPositive =
                        Number.isFinite(
                          unrealizedPnl,
                        ) &&
                        unrealizedPnl >=
                          0;

                      const isClosing =
                        closingPositionId ===
                        position.id;

                      return (
                        <tr
                          key={
                            position.id
                          }
                          className={
                            isClosing
                              ? "position-row-closing"
                              : ""
                          }
                        >
                          <td>
                            <div className="position-symbol">
                              <strong>
                                {
                                  positionSymbol
                                }
                              </strong>

                              <span>
                                {positionSide ===
                                "BUY"
                                  ? "Long position"
                                  : "Short position"}
                              </span>
                            </div>
                          </td>

                          <td>
                            <span
                              className={
                                positionSide ===
                                "BUY"
                                  ? "position-side-badge buy"
                                  : "position-side-badge sell"
                              }
                            >
                              <span className="side-indicator">
                                {positionSide ===
                                "BUY"
                                  ? "↑"
                                  : "↓"}
                              </span>

                              {
                                positionSide
                              }
                            </span>
                          </td>

                          <td>
                            <span className="position-number">
                              {Number.isFinite(
                                volume,
                              )
                                ? volume.toFixed(
                                    2,
                                  )
                                : "-"}
                            </span>

                            <span className="position-unit">
                              LOT
                            </span>
                          </td>

                          <td>
                            <span className="position-price">
                              {Number.isFinite(
                                entryPrice,
                              )
                                ? entryPrice.toFixed(
                                    digits,
                                  )
                                : "-"}
                            </span>
                          </td>

                          <td>
                            <span className="position-price current-price">
                              {Number.isFinite(
                                currentPrice,
                              )
                                ? currentPrice.toFixed(
                                    digits,
                                  )
                                : "-"}
                            </span>
                          </td>

                          <td>
                            {stopLoss !==
                            null ? (
                              <span className="position-risk-price sl-price">
                                {stopLoss.toFixed(
                                  digits,
                                )}
                              </span>
                            ) : (
                              <span className="no-risk-value">
                                —
                              </span>
                            )}
                          </td>

                          <td>
                            {takeProfit !==
                            null ? (
                              <span className="position-risk-price tp-price">
                                {takeProfit.toFixed(
                                  digits,
                                )}
                              </span>
                            ) : (
                              <span className="no-risk-value">
                                —
                              </span>
                            )}
                          </td>

                          <td>
                            <div
                              className={
                                isPositive
                                  ? "position-pnl positive"
                                  : "position-pnl negative"
                              }
                            >
                              <span className="pnl-sign">
                                {isPositive
                                  ? "+"
                                  : ""}
                              </span>

                              <span>
                                {Number.isFinite(
                                  unrealizedPnl,
                                )
                                  ? `$${Math.abs(
                                      unrealizedPnl,
                                    ).toFixed(
                                      2,
                                    )}`
                                  : "-"}
                              </span>
                            </div>
                          </td>

                          <td>
                            <button
                              type="button"
                              className="close-position-btn"
                              onClick={() =>
                                requestClosePosition(
                                  position,
                                )
                              }
                              disabled={
                                isClosing
                              }
                            >
                              {isClosing ? (
                                <>
                                  <span className="close-spinner"></span>
                                  Closing
                                </>
                              ) : (
                                "Close"
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* =====================================================
          ORDER CONFIRMATION MODAL
      ===================================================== */}

      {showOrderConfirmation &&
        orderPriceSnapshot && (
          <div
            className="confirmation-overlay"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <div
              className="confirmation-modal"
              role="dialog"
              aria-modal="true"
            >
              <div className="confirmation-header">
                <div>
                  <span className="confirmation-label">
                    Confirm Trade
                  </span>

                  <h3>
                    {
                      orderPriceSnapshot.side
                    }{" "}
                    {
                      orderPriceSnapshot.symbol
                    }
                  </h3>
                </div>

                <button
                  type="button"
                  className="confirmation-x"
                  onClick={
                    cancelOrderConfirmation
                  }
                  disabled={
                    orderLoading
                  }
                  aria-label="Close confirmation"
                >
                  ×
                </button>
              </div>

              <div className="confirmation-details">
                <div>
                  <span>
                    Side
                  </span>

                  <strong>
                    {
                      orderPriceSnapshot.side
                    }
                  </strong>
                </div>

                <div>
                  <span>
                    Volume
                  </span>

                  <strong>
                    {Number(
                      orderPriceSnapshot.volume ||
                        0,
                    ).toFixed(
                      2,
                    )}{" "}
                    LOT
                  </strong>
                </div>

                <div>
                  <span>
                    Entry Price
                  </span>

                  <strong>
                    {Number(
                      orderPriceSnapshot.entryPrice,
                    ).toFixed(
                      orderPriceSnapshot.symbol ===
                        "XAUUSD" ||
                      orderPriceSnapshot.symbol ===
                        "BTCUSD"
                        ? 2
                        : 5,
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Required Margin
                  </span>

                  <strong>
                    $
                    {Number(
                      orderPriceSnapshot.requiredMargin,
                    ).toFixed(
                      2,
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Stop Loss
                  </span>

                  <strong>
                    {orderPriceSnapshot.stopLoss !==
                      null &&
                    orderPriceSnapshot.stopLoss !==
                      undefined
                      ? orderPriceSnapshot.stopLoss
                      : "—"}
                  </strong>
                </div>

                <div>
                  <span>
                    Take Profit
                  </span>

                  <strong>
                    {orderPriceSnapshot.takeProfit !==
                      null &&
                    orderPriceSnapshot.takeProfit !==
                      undefined
                      ? orderPriceSnapshot.takeProfit
                      : "—"}
                  </strong>
                </div>
              </div>

              {orderPriceChanged ? (
                <div className="confirmation-warning price-warning">
                  <span>
                    !
                  </span>

                  <span>
                    Market price
                    changed. Refresh
                    the price before
                    confirming this
                    order.
                  </span>
                </div>
              ) : (
                <div className="confirmation-warning">
                  <span>
                    !
                  </span>

                  <span>
                    Review the order
                    details before
                    sending it to the
                    trading server.
                  </span>
                </div>
              )}

              <div className="confirmation-actions">
                <button
                  type="button"
                  className="confirmation-cancel"
                  onClick={
                    cancelOrderConfirmation
                  }
                  disabled={
                    orderLoading
                  }
                >
                  Cancel
                </button>

                {orderPriceChanged ? (
                  <button
                    type="button"
                    className="confirmation-refresh-btn"
                    onClick={
                      refreshOrderPrice
                    }
                    disabled={
                      orderLoading
                    }
                  >
                    Refresh Price
                  </button>
                ) : (
                  <button
                    type="button"
                    className="confirmation-confirm"
                    onClick={
                      confirmMarketOrder
                    }
                    disabled={
                      orderLoading
                    }
                  >
                    {orderLoading
                      ? "Placing Order..."
                      : `Confirm ${orderPriceSnapshot.side}`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      {/* =====================================================
          CLOSE POSITION CONFIRMATION MODAL
      ===================================================== */}

      {closeConfirmPosition && (
        <div
          className="close-confirmation-overlay"
          onMouseDown={(event) =>
            event.stopPropagation()
          }
        >
          <div
            className="close-confirmation-modal"
            role="dialog"
            aria-modal="true"
          >
            <div className="close-confirmation-header">
              <div>
                <span className="close-confirmation-label">
                  Close Position
                </span>

                <div className="close-symbol-info">
                  <strong>
                    {
                      closeConfirmPosition.symbol
                    }
                  </strong>

                  <span
                    className={`close-side-badge ${String(
                      closeConfirmPosition.side ||
                        "",
                    ).toLowerCase()}`}
                  >
                    {String(
                      closeConfirmPosition.side ||
                        "",
                    ).toUpperCase()}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="close-confirmation-x"
                onClick={
                  cancelCloseConfirmation
                }
                disabled={
                  closingPositionId !==
                  null
                }
                aria-label="Close confirmation"
              >
                ×
              </button>
            </div>

            <div className="close-confirmation-details">
              <div className="close-confirmation-row">
                <span>
                  Volume
                </span>

                <strong>
                  {Number(
                    closeConfirmPosition.volume ||
                      0,
                  ).toFixed(
                    2,
                  )}{" "}
                  LOT
                </strong>
              </div>

              <div className="close-confirmation-row">
                <span>
                  Entry Price
                </span>

                <strong>
                  {Number(
                    closeConfirmPosition.entry_price ||
                      0,
                  ).toFixed(
                    Number(
                      closeConfirmPosition.digits,
                    ) || 2,
                  )}
                </strong>
              </div>

              <div className="close-confirmation-row">
                <span>
                  Current Price
                </span>

                <strong>
                  {Number(
                    closeConfirmPosition.current_price ||
                      0,
                  ).toFixed(
                    Number(
                      closeConfirmPosition.digits,
                    ) || 2,
                  )}
                </strong>
              </div>

              <div className="close-confirmation-row">
                <span>
                  Unrealized P/L
                </span>

                <strong
                  className={
                    Number(
                      closeConfirmPosition.unrealized_pnl ||
                        0,
                    ) >= 0
                      ? "close-pnl-positive"
                      : "close-pnl-negative"
                  }
                >
                  $
                  {Number(
                    closeConfirmPosition.unrealized_pnl ||
                      0,
                  ).toFixed(
                    2,
                  )}
                </strong>
              </div>
            </div>

            <div className="close-confirmation-warning">
              <span className="close-warning-icon">
                !
              </span>

              <span>
                This action will close
                the position at the
                current market price.
              </span>
            </div>

            <div className="close-confirmation-actions">
              <button
                type="button"
                className="close-confirmation-cancel"
                onClick={
                  cancelCloseConfirmation
                }
                disabled={
                  closingPositionId !==
                  null
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="close-confirmation-confirm"
                onClick={
                  confirmClosePosition
                }
                disabled={
                  closingPositionId !==
                  null
                }
              >
                {closingPositionId !==
                null
                  ? "Closing..."
                  : "Confirm Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;