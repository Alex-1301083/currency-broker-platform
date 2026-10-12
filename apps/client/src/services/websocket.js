
const WS_URL =
  import.meta.env.VITE_WS_URL ||
  "ws://localhost:5001";

let socket = null;
let reconnectTimer = null;
let manuallyDisconnected = false;

const listeners = new Set();

function getToken() {
  return localStorage.getItem("tradex_token");
}

export function connectWebSocket() {
  const token = getToken();

  if (!token) {
    console.warn(
      "[TradeX WS] No JWT token. WebSocket not connected."
    );
    return null;
  }

  manuallyDisconnected = false;

  // Reuse an existing connection.
  if (
    socket &&
    (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    )
  ) {
    return socket;
  }

  console.log("[TradeX WS] Connecting:", WS_URL);

  let ws;

  try {
    ws = new WebSocket(WS_URL, `bearer.${token}`);
    socket = ws;
  } catch (error) {
    console.error("[TradeX WS] Connection creation failed:", error);
    scheduleReconnect();
    return null;
  }

  ws.onopen = () => {
    console.log("[TradeX WS] Connected.");

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onmessage = (event) => {
    let message;

    try {
      message = JSON.parse(event.data);
    } catch (error) {
      console.error("[TradeX WS] Invalid JSON message:", error);
      console.error("[TradeX WS] Raw message:", event.data);
      return;
    }

    // Temporary diagnostic logs: inspect actual server message types.
    console.log("[TradeX WS] Message received:", message);

    const messageType =
      message?.type ??
      message?.event ??
      message?.channel ??
      message?.topic;

    if (
      messageType === "market_price" ||
      messageType === "price"
    ) {
      console.log("[TradeX WS] PRICE MESSAGE:", message);
    }

    listeners.forEach((listener) => {
      try {
        listener(message);
      } catch (error) {
        console.error("[TradeX WS] Listener error:", error);
      }
    });
  };

  ws.onerror = (error) => {
    console.error("[TradeX WS] Connection error:", error);
  };

  ws.onclose = (event) => {
    console.warn(
      "[TradeX WS] Closed:",
      event.code,
      event.reason || "(no reason provided)"
    );

    // Don't let an old connection clear a newer connection.
    if (socket === ws) {
      socket = null;
    }

    if (!manuallyDisconnected) {
      scheduleReconnect();
    }
  };

  return ws;
}

function scheduleReconnect() {
  if (manuallyDisconnected || reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;

    if (!manuallyDisconnected) {
      connectWebSocket();
    }
  }, 3000);
}

export function subscribeWebSocket(listener) {
  if (typeof listener !== "function") {
    throw new TypeError(
      "subscribeWebSocket expects a function."
    );
  }

  listeners.add(listener);

  console.log(
    "[TradeX WS] Listener subscribed. Total:",
    listeners.size
  );

  return () => {
    listeners.delete(listener);

    console.log(
      "[TradeX WS] Listener unsubscribed. Total:",
      listeners.size
    );
  };
}

export function disconnectWebSocket() {
  manuallyDisconnected = true;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const ws = socket;
  socket = null;

  if (ws) {
    // Prevent the intentional close from triggering reconnect.
    ws.close(1000, "Client disconnected");
  }

  console.log("[TradeX WS] Disconnected manually.");
}
