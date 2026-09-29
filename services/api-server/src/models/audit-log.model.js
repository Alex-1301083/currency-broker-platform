const { pool } = require("../config/database");

async function createAuditLog({
  client = null,
  userId = null,
  action,
  entityType = null,
  entityId = null,
  ipAddress = null,
  metadata = null,
}) {
  const db = client || pool;

  const result = await db.query(
    `
    INSERT INTO audit_logs (
      user_id,
      action,
      entity_type,
      entity_id,
      ip_address,
      metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING
      id,
      user_id,
      action,
      entity_type,
      entity_id,
      ip_address,
      metadata,
      created_at
    `,
    [
      userId,
      action,
      entityType,
      entityId,
      ipAddress,
      metadata,
    ],
  );

  return result.rows[0];
}

async function getAuditLogs({
  limit = 100,
  offset = 0,
} = {}) {
  const result = await pool.query(
    `
    SELECT
      al.id,
      al.user_id,
      al.action,
      al.entity_type,
      al.entity_id,
      al.ip_address,
      al.metadata,
      al.created_at,

      u.full_name,
      u.email,
      u.role

    FROM audit_logs al

    LEFT JOIN users u
      ON u.id = al.user_id

    ORDER BY al.created_at DESC

    LIMIT $1
    OFFSET $2
    `,
    [limit, offset],
  );

  return result.rows;
}

async function getAuditLogById(auditLogId) {
  const result = await pool.query(
    `
    SELECT
      al.id,
      al.user_id,
      al.action,
      al.entity_type,
      al.entity_id,
      al.ip_address,
      al.metadata,
      al.created_at,

      u.full_name,
      u.email,
      u.role

    FROM audit_logs al

    LEFT JOIN users u
      ON u.id = al.user_id

    WHERE al.id = $1
    `,
    [auditLogId],
  );

  return result.rows[0] || null;
}

module.exports = {
  createAuditLog,
  getAuditLogs,
  getAuditLogById,
};