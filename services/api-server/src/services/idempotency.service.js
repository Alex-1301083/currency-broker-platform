const crypto = require("crypto");

function normalizeIdempotencyKey(value) {
  if (typeof value !== "string") {
    return null;
  }

  const key = value.trim();

  if (!key) {
    return null;
  }

  if (key.length > 255) {
    throw new Error(
      "Idempotency-Key must not exceed 255 characters.",
    );
  }

  return key;
}

function createRequestHash({
  symbol,
  side,
  volume,
  stopLoss = null,
  takeProfit = null,
}) {
  const normalizedPayload = {
    symbol: String(symbol || "").trim().toUpperCase(),
    side: String(side || "").trim().toLowerCase(),
    volume: String(volume),
    stopLoss:
      stopLoss === null || stopLoss === undefined
        ? null
        : String(stopLoss),
    takeProfit:
      takeProfit === null || takeProfit === undefined
        ? null
        : String(takeProfit),
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalizedPayload))
    .digest("hex");
}

async function getIdempotencyRecord({
  client,
  accountId,
  idempotencyKey,
}) {
  if (!client) {
    throw new Error(
      "Database transaction client is required.",
    );
  }

  const normalizedKey =
    normalizeIdempotencyKey(idempotencyKey);

  if (!normalizedKey) {
    return null;
  }

  const result = await client.query(
    `
    SELECT
      id,
      account_id,
      idempotency_key,
      request_hash,
      status,
      response_status,
      response_body,
      created_at,
      updated_at
    FROM idempotency_keys
    WHERE account_id = $1
      AND idempotency_key = $2
    FOR UPDATE
    `,
    [
      accountId,
      normalizedKey,
    ],
  );

  return result.rows[0] || null;
}

async function createIdempotencyRecord({
  client,
  accountId,
  idempotencyKey,
  requestHash,
}) {
  if (!client) {
    throw new Error(
      "Database transaction client is required.",
    );
  }

  const normalizedKey =
    normalizeIdempotencyKey(idempotencyKey);

  if (!normalizedKey) {
    throw new Error(
      "Idempotency-Key is required.",
    );
  }

  if (!requestHash) {
    throw new Error(
      "Request hash is required.",
    );
  }

  const result = await client.query(
    `
    INSERT INTO idempotency_keys (
      account_id,
      idempotency_key,
      request_hash,
      status
    )
    VALUES ($1, $2, $3, 'processing')
    RETURNING
      id,
      account_id,
      idempotency_key,
      request_hash,
      status,
      response_status,
      response_body,
      created_at,
      updated_at
    `,
    [
      accountId,
      normalizedKey,
      requestHash,
    ],
  );

  return result.rows[0];
}

async function completeIdempotencyRecord({
  client,
  idempotencyId,
  responseStatus,
  responseBody,
}) {
  if (!client) {
    throw new Error(
      "Database transaction client is required.",
    );
  }

  const result = await client.query(
    `
    UPDATE idempotency_keys
    SET
      status = 'completed',
      response_status = $1,
      response_body = $2,
      updated_at = NOW()
    WHERE id = $3
    RETURNING
      id,
      account_id,
      idempotency_key,
      request_hash,
      status,
      response_status,
      response_body,
      created_at,
      updated_at
    `,
    [
      responseStatus,
      JSON.stringify(responseBody),
      idempotencyId,
    ],
  );

  return result.rows[0];
}

module.exports = {
  normalizeIdempotencyKey,
  createRequestHash,
  getIdempotencyRecord,
  createIdempotencyRecord,
  completeIdempotencyRecord,
};