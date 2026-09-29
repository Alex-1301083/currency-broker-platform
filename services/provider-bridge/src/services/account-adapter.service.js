const providerManager = require("./provider-manager");

async function getProviderAccount() {
  const provider = providerManager.getProvider();

  console.log(
    "[ACCOUNT ADAPTER] Requesting account from provider...",
  );

  const result = await provider.getAccount();

  if (!result) {
    throw new Error(
      "Provider returned an empty account response.",
    );
  }

  if (
    !Number.isFinite(Number(result.balance)) ||
    !Number.isFinite(Number(result.equity)) ||
    !Number.isFinite(Number(result.margin)) ||
    !Number.isFinite(Number(result.freeMargin))
  ) {
    throw new Error(
      "Provider returned invalid account values.",
    );
  }

  const account = {
    provider: result.provider || "unknown",
    balance: Number(result.balance),
    equity: Number(result.equity),
    margin: Number(result.margin),
    freeMargin: Number(result.freeMargin),
  };

  console.log(
    "[ACCOUNT ADAPTER] Normalized account:",
    account,
  );

  return account;
}

module.exports = {
  getProviderAccount,
};