const path = require("path");
const dotenv = require("dotenv");
const { Pool } = require("pg");

// Local development ke liye root .env load karo.
// Render par .env file na ho to koi error throw nahi karna.
const rootEnvPath = path.resolve(
  __dirname,
  "../../../../.env",
);

dotenv.config({
  path: rootEnvPath,
});

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL environment variable is missing.",
  );
}

const pool = new Pool({
  connectionString: databaseUrl,

  // Render PostgreSQL ke liye production mein SSL.
  // Local PostgreSQL ke liye SSL disable rahega.
  ssl:
    process.env.NODE_ENV === "production"
      ? {
          rejectUnauthorized: false,
        }
      : undefined,
});

pool.on("error", (error) => {
  console.error(
    "[MARKET DATA DB ERROR]",
    error,
  );
});

async function testDatabaseConnection() {
  const result = await pool.query(
    "SELECT NOW() AS current_time",
  );

  console.log(
    "[MARKET DATA DB] PostgreSQL connected:",
    result.rows[0].current_time,
  );
}

module.exports = {
  pool,
  testDatabaseConnection,
};