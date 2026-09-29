const path = require("path");
const dotenv = require("dotenv");
const { Pool } = require("pg");

const rootEnvPath = path.resolve(
  __dirname,
  "../../../../.env",
);

const envResult = dotenv.config({
  path: rootEnvPath,
});

if (envResult.error) {
  throw new Error(
    `Unable to load .env file: ${envResult.error.message}`,
  );
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    `DATABASE_URL is not loaded from: ${rootEnvPath}`,
  );
}

const databaseConfig = new URL(databaseUrl);

const pool = new Pool({
  host: databaseConfig.hostname,
  port: Number(databaseConfig.port || 5432),
  user: decodeURIComponent(databaseConfig.username),
  password: decodeURIComponent(databaseConfig.password),
  database: databaseConfig.pathname.replace(
    /^\//,
    "",
  ),
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