const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // Database connection recovery settings
  connectionTimeoutMillis: 5000,

  // Idle connections ko unnecessarily open nahi rakhenge
  idleTimeoutMillis: 30000,

  // Pool ke maximum connections
  max: 20
});

/*
 * PostgreSQL pool-level unexpected errors
 */
pool.on("error", (error) => {
  console.error(
    "Unexpected PostgreSQL pool error:",
    error.message
  );
});

/*
 * Test database connection
 */
async function testDatabaseConnection() {
  let client;

  try {
    client = await pool.connect();

    const result = await client.query(
      "SELECT NOW() AS current_time"
    );

    console.log(
      "PostgreSQL connected:",
      result.rows[0].current_time
    );

    return {
      connected: true,
      timestamp: result.rows[0].current_time
    };
  } catch (error) {
    console.error(
      "PostgreSQL connection failed:",
      error.message
    );

    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

/*
 * Database health check
 */
async function checkDatabaseHealth() {
  try {
    await pool.query("SELECT 1");

    return {
      connected: true
    };
  } catch (error) {
    console.error(
      "PostgreSQL health check failed:",
      error.message
    );

    return {
      connected: false,
      error: error.message
    };
  }
}

/*
 * Gracefully close PostgreSQL pool
 */
async function closeDatabase() {
  try {
    await pool.end();

    console.log(
      "PostgreSQL connection pool closed."
    );
  } catch (error) {
    console.error(
      "Failed to close PostgreSQL pool:",
      error.message
    );

    throw error;
  }
}

module.exports = {
  pool,
  testDatabaseConnection,
  checkDatabaseHealth,
  closeDatabase
};