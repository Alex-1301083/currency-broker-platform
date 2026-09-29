const { pool } = require("../config/database");

/**
 * Create an immutable financial ledger entry.
 *
 * IMPORTANT:
 * This function expects the caller to already be inside
 * a PostgreSQL transaction and to pass the same client.
 */
async function createLedgerEntry({
  client,
  accountId,
  entryType,
  amount,
  balanceBefore,
  balanceAfter,
  referenceType = null,
  referenceId = null,
  description = null,
}) {
  if (!client) {
    throw new Error(
      "Database transaction client is required."
    );
  }

  if (!accountId) {
    throw new Error(
      "Account ID is required."
    );
  }

  if (!entryType) {
    throw new Error(
      "Ledger entry type is required."
    );
  }

  const normalizedAmount =
    Number(amount);

  const normalizedBalanceBefore =
    Number(balanceBefore);

  const normalizedBalanceAfter =
    Number(balanceAfter);

  if (
    !Number.isFinite(normalizedAmount) ||
    !Number.isFinite(normalizedBalanceBefore) ||
    !Number.isFinite(normalizedBalanceAfter)
  ) {
    throw new Error(
      "Invalid ledger financial values."
    );
  }

  const ledgerResult =
    await client.query(
      `
      INSERT INTO ledger_entries (
        account_id,
        entry_type,
        amount,
        balance_before,
        balance_after,
        reference_type,
        reference_id,
        description
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8
      )
      RETURNING
        id,
        account_id,
        entry_type,
        amount,
        balance_before,
        balance_after,
        reference_type,
        reference_id,
        description,
        created_at
      `,
      [
        accountId,
        entryType,
        normalizedAmount,
        normalizedBalanceBefore,
        normalizedBalanceAfter,
        referenceType,
        referenceId,
        description,
      ]
    );

  return ledgerResult.rows[0];
}


module.exports = {
  createLedgerEntry,
};