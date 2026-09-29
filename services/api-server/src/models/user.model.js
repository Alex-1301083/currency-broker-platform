const { pool } = require("../config/database");

async function findUserByEmail(email) {
  const result = await pool.query(
    `
    SELECT
      id,
      full_name,
      email,
      password_hash,
      role,
      is_active,
      created_at,
      updated_at
    FROM users
    WHERE email = $1
    LIMIT 1
    `,
    [email]
  );

  return result.rows[0] || null;
}

async function findUserById(id) {
  const result = await pool.query(
    `
    SELECT
      id,
      full_name,
      email,
      role,
      is_active,
      created_at,
      updated_at
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function createUser({
  email,
  passwordHash,
  fullName
}) {
  const result = await pool.query(
    `
    INSERT INTO users (
      full_name,
      email,
      password_hash
    )
    VALUES ($1, $2, $3)
    RETURNING
      id,
      full_name,
      email,
      role,
      is_active,
      created_at,
      updated_at
    `,
    [
      fullName,
      email,
      passwordHash
    ]
  );

  return result.rows[0];
}

module.exports = {
  findUserByEmail,
  findUserById,
  createUser
};