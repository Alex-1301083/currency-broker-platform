const WS_URL =
  import.meta.env.VITE_WS_URL ||
  "ws://localhost:5001";

let socket = null;
let reconnectTimer = null;

let manuallyDisconnected = false;

const listeners =
  new Set();

function getToken() {
  return localStorage.getItem(
    "tradex_token",
  );
}

export function connectWebSocket() {
  const token =
    getToken();

  if (!token) {
    console.warn(
      "[TradeX WS] No JWT token. WebSocket not connected.",
    );

    return null;
  }

  manuallyDisconnected = false;

  if (
    socket &&
    (
      socket.readyState ===
        WebSocket.OPEN ||
      socket.readyState ===
        WebSocket.CONNECTING
    )
  ) {
    return socket;
  }

  console.log(
    "[TradeX WS] Connecting:",
    WS_URL,
  );

  /*
   * WebSocket server expects:
   *
   * bearer.<JWT>
   */

  socket = new WebSocket(
    WS_URL,
    `bearer.${token}`,
  );

  socket.onopen = () => {
    console.log(
      "[TradeX WS] Connected.",
    );

    if (reconnectTimer) {
      clearTimeout(
        reconnectTimer,
      );

      reconnectTimer = null;
    }
  };

  socket.onmessage = (
    event,
  ) => {
    try {
      const message =
        JSON.parse(
          event.data,
        );

      listeners.forEach(
        (listener) => {
          try {
            listener(message);
          } catch (error) {
            console.error(
              "[TradeX WS] Listener error:",
              error,
            );
          }
        },
      );
    } catch (error) {
      console.error(
        "[TradeX WS] Invalid message:",
        error,
      );
    }
  };

  socket.onerror = (
    error,
  ) => {
    console.error(
      "[TradeX WS] Error:",
      error,
    );
  };

  socket.onclose = (
    event,
  ) => {
    console.warn(
      "[TradeX WS] Closed:",
      event.code,
      event.reason,
    );

    socket = null;

    if (!manuallyDisconnected) {
      scheduleReconnect();
    }
  };

  return socket;
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer =
    setTimeout(() => {
      reconnectTimer = null;

      connectWebSocket();
    }, 3000);
}

export function subscribeWebSocket(
  listener,
) {
  listeners.add(
    listener,
  );

  return () => {
    listeners.delete(
      listener,
    );
  };
}

export function disconnectWebSocket() {
  manuallyDisconnected =
    true;

  if (reconnectTimer) {
    clearTimeout(
      reconnectTimer,
    );

    reconnectTimer = null;
  }

  if (socket) {
    socket.close();

    socket = null;
  }
}