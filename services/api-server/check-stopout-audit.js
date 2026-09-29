require("dotenv").config({
  path: require("path").resolve(process.cwd(), "../../.env"),
});

const { pool } = require("./src/config/database");

async function checkStopOutAudit() {
  try {
    const result = await pool.query(`
      SELECT
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
      FROM audit_logs
      WHERE action = 'STOP_OUT_EXECUTED'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log("\n========== STOP-OUT AUDIT LOGS ==========");

    if (!result.rows.length) {
      console.log("No STOP_OUT_EXECUTED audit logs found.");
    } else {
      console.dir(result.rows, { depth: null });
    }

    console.log("==========================================\n");
  } catch (error) {
    console.error("AUDIT CHECK FAILED:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

checkStopOutAudit();