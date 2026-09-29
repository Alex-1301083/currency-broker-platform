const DemoProvider = require("../providers/demo.provider");

class ProviderManager {
  constructor() {
    this.provider = null;
    this.mode = null;

    this.connected = false;
    this.lastError = null;
    this.lastConnectedAt = null;
    this.reconnectAttempts = 0;
  }

  initialize() {
    const providerMode =
      (process.env.PROVIDER_MODE || "demo").toLowerCase();

    console.log(
      `[PROVIDER MANAGER] Mode: ${providerMode}`
    );

    if (providerMode === "demo") {
      this.provider = new DemoProvider();
      this.mode = "demo";

      console.log(
        "[PROVIDER MANAGER] DemoProvider initialized."
      );

      return this.provider;
    }

    if (providerMode === "provider") {
      this.provider = new DemoProvider();
      this.mode = "provider";

      console.log(
        "[PROVIDER MANAGER] Provider mode initialized."
      );

      console.log(
        "[PROVIDER MANAGER] Using DemoProvider as temporary provider adapter."
      );

      return this.provider;
    }

    throw new Error(
      `Unsupported provider mode: ${providerMode}`
    );
  }

  async connect() {
    if (!this.provider) {
      this.initialize();
    }

    try {
      const result = await this.provider.connect();

      const status =
        await this.provider.getConnectionStatus();

      this.connected = Boolean(status.connected);

      if (this.connected) {
        this.lastError = null;
        this.lastConnectedAt =
          new Date().toISOString();

        this.reconnectAttempts = 0;

        console.log(
          "[PROVIDER MANAGER] Provider connected."
        );
      } else {
        throw new Error(
          "Provider connection returned disconnected status."
        );
      }

      return result;
    } catch (error) {
      this.connected = false;
      this.lastError = error.message;

      this.reconnectAttempts += 1;

      console.error(
        `[PROVIDER MANAGER] Connection failed. Attempt ${this.reconnectAttempts}:`,
        error.message
      );

      throw error;
    }
  }

  async reconnect() {
    console.log(
      "[PROVIDER MANAGER] Attempting provider recovery..."
    );

    try {
      if (this.provider) {
        try {
          await this.provider.disconnect();
        } catch (disconnectError) {
          console.warn(
            "[PROVIDER MANAGER] Provider disconnect during recovery failed:",
            disconnectError.message
          );
        }
      }

      return await this.connect();
    } catch (error) {
      this.connected = false;
      this.lastError = error.message;

      console.error(
        "[PROVIDER MANAGER] Provider recovery failed:",
        error.message
      );

      return null;
    }
  }

  async getConnectionStatus() {
    if (!this.provider) {
      return {
        provider: this.mode,
        connected: false,
        lastError: this.lastError,
        lastConnectedAt: this.lastConnectedAt,
        reconnectAttempts: this.reconnectAttempts
      };
    }

    try {
      const status =
        await this.provider.getConnectionStatus();

      this.connected =
        Boolean(status.connected);

      return {
        provider:
          status.provider || this.mode,

        connected:
          this.connected,

        lastError:
          this.lastError,

        lastConnectedAt:
          this.lastConnectedAt,

        reconnectAttempts:
          this.reconnectAttempts
      };
    } catch (error) {
      this.connected = false;
      this.lastError = error.message;

      return {
        provider: this.mode,
        connected: false,
        lastError: error.message,
        lastConnectedAt: this.lastConnectedAt,
        reconnectAttempts: this.reconnectAttempts
      };
    }
  }

  getProvider() {
    if (!this.provider) {
      throw new Error(
        "Provider has not been initialized."
      );
    }

    return this.provider;
  }

  getMode() {
    return this.mode;
  }

  isConnected() {
    return this.connected;
  }
}

module.exports = new ProviderManager();