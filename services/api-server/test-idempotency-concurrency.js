const API_URL = "http://localhost:5000/api/order";

const JWT = process.env.TEST_JWT;

if (!JWT) {
  console.error("TEST_JWT environment variable is required.");
  process.exit(1);
}

const idempotencyKey =
  "phase15-5-concurrency-001";

const requestBody = {
  symbol: "XAUUSD",
  side: "BUY",
  volume: 0.01,
};

async function sendOrder(requestNumber) {
  const start = Date.now();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${JWT}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    return {
      requestNumber,
      status: response.status,
      durationMs: Date.now() - start,
      data,
    };
  } catch (error) {
    return {
      requestNumber,
      error: error.message,
      durationMs: Date.now() - start,
    };
  }
}

async function run() {
  console.log(
    "========== IDEMPOTENCY CONCURRENCY TEST ==========",
  );

  const results = await Promise.all([
    sendOrder(1),
    sendOrder(2),
  ]);

  for (const result of results) {
    console.log(
      `\n========== REQUEST ${result.requestNumber} ==========`,
    );

    console.log(
      JSON.stringify(result, null, 2),
    );
  }

  console.log(
    "\n========== TEST COMPLETE ==========",
  );
}

run();