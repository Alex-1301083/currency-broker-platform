const { pool } = require("../config/database");
const { createLedgerEntry } = require("./ledger.service");
/*
  Calculate unrealized P/L for an open position.

  BUY:
    P/L = (current BID - entry price) * volume * contract size

  SELL:
    P/L = (entry price - current ASK) * volume * contract size
*/

function calculateUnrealizedPnl({
  side,
  entryPrice,
  currentBid,
  currentAsk,
  volume,
  contractSize,
}) {
  const normalizedSide = String(side).toLowerCase();

  const entry = Number(entryPrice);
  const bid = Number(currentBid);
  const ask = Number(currentAsk);
  const positionVolume = Number(volume);
  const size = Number(contractSize);

  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(bid) ||
    !Number.isFinite(ask) ||
    !Number.isFinite(positionVolume) ||
    !Number.isFinite(size)
  ) {
    throw new Error("Invalid price or position data");
  }

  let priceDifference;

  if (normalizedSide === "buy") {
    priceDifference = bid - entry;
  } else if (normalizedSide === "sell") {
    priceDifference = entry - ask;
  } else {
    throw new Error("Invalid position side");
  }

  return priceDifference * positionVolume * size;
}

/*
  Update all open positions for a symbol.
*/
async function updateOpenPositionsForSymbol(symbol) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const symbolResult = await client.query(
      `
      SELECT
        id,
        symbol,
        bid,
        ask,
        contract_size
      FROM symbols
      WHERE UPPER(symbol) = UPPER($1)
        AND is_active = true
      LIMIT 1
      `,
      [symbol],
    );

    if (!symbolResult.rows.length) {
      throw new Error("Symbol not found");
    }

    const instrument = symbolResult.rows[0];

    const positionResult = await client.query(
      `
      SELECT
        id,
        account_id,
        symbol_id,
        side,
        volume,
        entry_price,
        margin_used
      FROM positions
      WHERE symbol_id = $1
        AND status = 'open'
      FOR UPDATE
      `,
      [instrument.id],
    );

    const updatedPositions = [];

    for (const position of positionResult.rows) {
      const unrealizedPnl = calculateUnrealizedPnl({
        side: position.side,
        entryPrice: position.entry_price,
        currentBid: instrument.bid,
        currentAsk: instrument.ask,
        volume: position.volume,
        contractSize: instrument.contract_size,
      });

      const updatedPositionResult = await client.query(
        `
        UPDATE positions
        SET
          current_price = $1,
          unrealized_pnl = $2,
          updated_at = NOW()
        WHERE id = $3
        RETURNING *
        `,
        [
          position.side.toLowerCase() === "buy"
            ? instrument.bid
            : instrument.ask,
          unrealizedPnl,
          position.id,
        ],
      );

      updatedPositions.push(updatedPositionResult.rows[0]);
    }

    /*
      Recalculate account equity and free margin.

      Equity = Balance + total unrealized P/L

      Free Margin = Equity - Margin
    */
    const accountIds = [
      ...new Set(positionResult.rows.map((position) => position.account_id)),
    ];

    const updatedAccounts = [];

    for (const accountId of accountIds) {
      const accountResult = await client.query(
        `
        SELECT
          id,
          balance,
          margin
        FROM accounts
        WHERE id = $1
        FOR UPDATE
        `,
        [accountId],
      );

      if (!accountResult.rows.length) {
        continue;
      }

      const account = accountResult.rows[0];

      const pnlResult = await client.query(
        `
        SELECT
          COALESCE(
            SUM(unrealized_pnl),
            0
          ) AS total_unrealized_pnl
        FROM positions
        WHERE account_id = $1
          AND status = 'open'
        `,
        [accountId],
      );

      const totalUnrealizedPnl = Number(pnlResult.rows[0].total_unrealized_pnl);

      const balance = Number(account.balance);

      const margin = Number(account.margin);

      const equity = balance + totalUnrealizedPnl;

      const freeMargin = equity - margin;

      const updatedAccountResult = await client.query(
        `
          UPDATE accounts
          SET
            equity = $1,
            free_margin = $2,
            updated_at = NOW()
          WHERE id = $3
          RETURNING *
          `,
        [equity, freeMargin, accountId],
      );

      updatedAccounts.push(updatedAccountResult.rows[0]);
    }
    await client.query("COMMIT");

    return {
      symbol: instrument.symbol,
      bid: instrument.bid,
      ask: instrument.ask,
      positions: updatedPositions,
      accounts: updatedAccounts,
    };

    await client.query("COMMIT");

    return {
      symbol: instrument.symbol,
      bid: instrument.bid,
      ask: instrument.ask,
      positions: updatedPositions,
      accounts: updatedAccounts,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function closePosition({ userId, positionId }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /*
      1. Find user's active trading account
    */
    const accountResult = await client.query(
      `
      SELECT *
      FROM accounts
      WHERE user_id = $1
        AND status = 'active'
      FOR UPDATE
      LIMIT 1
      `,
      [userId],
    );

    if (!accountResult.rows.length) {
      throw new Error("Trading account not found");
    }

    const account = accountResult.rows[0];

    /*
      2. Find the open position
    */
    const positionResult = await client.query(
      `
      SELECT
        p.*,
        s.symbol,
        s.name,
        s.bid,
        s.ask,
        s.contract_size,
        s.digits
      FROM positions p
      JOIN symbols s
        ON s.id = p.symbol_id
      WHERE p.id = $1
        AND p.account_id = $2
        AND p.status = 'open'
      FOR UPDATE
      LIMIT 1
      `,
      [positionId, account.id],
    );

    if (!positionResult.rows.length) {
      throw new Error("Open position not found");
    }

    const position = positionResult.rows[0];

    /*
      3. Determine closing price

      BUY position closes at BID.
      SELL position closes at ASK.
    */
    const closingPrice =
      position.side.toLowerCase() === "buy"
        ? Number(position.bid)
        : Number(position.ask);

    /*
      4. Calculate final realized P/L
    */
    const realizedPnl = calculateUnrealizedPnl({
      side: position.side,
      entryPrice: position.entry_price,
      currentBid: position.bid,
      currentAsk: position.ask,
      volume: position.volume,
      contractSize: position.contract_size,
    });

    /*
      5. Create closing trade
    */
    const tradeResult = await client.query(
      `
      INSERT INTO trades (
        order_id,
        account_id,
        symbol_id,
        side,
        volume,
        execution_price,
        commission,
        swap,
        realized_pnl
      )
      VALUES (
        NULL,
        $1,
        $2,
        $3,
        $4,
        $5,
        0,
        0,
        $6
      )
      RETURNING *
      `,
      [
        account.id,
        position.symbol_id,
        position.side,
        position.volume,
        closingPrice,
        realizedPnl,
      ],
    );

    const closingTrade = tradeResult.rows[0];

    /*
      6. Close the position
    */
    const closedPositionResult = await client.query(
      `
        UPDATE positions
        SET
          current_price = $1,
          unrealized_pnl = 0,
          status = 'closed',
          closed_at = NOW(),
          updated_at = NOW()
        WHERE id = $2
          AND status = 'open'
        RETURNING *
        `,
      [closingPrice, position.id],
    );

    const closedPosition = closedPositionResult.rows[0];

    /*
      7. Release the position margin
    */
    const oldMargin = Number(account.margin);

    const positionMargin = Number(position.margin_used);

    const newMargin = Math.max(0, oldMargin - positionMargin);

    /*
      8. Update account balance

      Realized P/L becomes part of balance.
    */
    const oldBalance = Number(account.balance);

    const newBalance = oldBalance + realizedPnl;

    const ledgerEntry = await createLedgerEntry({
      client,
      accountId: account.id,
      entryType: realizedPnl >= 0 ? "trade_profit" : "trade_loss",
      amount: realizedPnl,
      balanceBefore: oldBalance,
      balanceAfter: newBalance,
      referenceType: "trade",
      referenceId: closingTrade.id,
      description: `Realized P/L from closing ${position.symbol} ${position.side.toUpperCase()} position`,
    });

    /*
      9. Calculate remaining unrealized P/L
    */
    const remainingPnlResult = await client.query(
      `
        SELECT
          COALESCE(
            SUM(unrealized_pnl),
            0
          ) AS total_unrealized_pnl
        FROM positions
        WHERE account_id = $1
          AND status = 'open'
        `,
      [account.id],
    );

    const remainingUnrealizedPnl = Number(
      remainingPnlResult.rows[0].total_unrealized_pnl,
    );

    /*
      10. Calculate new equity
    */
    const newEquity = newBalance + remainingUnrealizedPnl;

    /*
      11. Calculate new free margin
    */
    const newFreeMargin = newEquity - newMargin;

    /*
      12. Update account
    */
    const updatedAccountResult = await client.query(
      `
        UPDATE accounts
        SET
          balance = $1,
          equity = $2,
          margin = $3,
          free_margin = $4,
          updated_at = NOW()
        WHERE id = $5
        RETURNING *
        `,
      [newBalance, newEquity, newMargin, newFreeMargin, account.id],
    );

    const updatedAccount = updatedAccountResult.rows[0];

    await client.query("COMMIT");

    return {
      position: closedPosition,
      trade: closingTrade,
      ledger: ledgerEntry,
      realizedPnl,
      releasedMargin: positionMargin,
      account: updatedAccount,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function checkStopLossTakeProfit(symbol) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Get current market price
    const symbolResult = await client.query(
      `
      SELECT
        id,
        symbol,
        bid,
        ask,
        contract_size
      FROM symbols
      WHERE UPPER(symbol) = UPPER($1)
        AND is_active = true
      LIMIT 1
      `,
      [symbol],
    );

    if (!symbolResult.rows.length) {
      throw new Error("Symbol not found");
    }

    const instrument = symbolResult.rows[0];

    const currentBid = Number(instrument.bid);
    const currentAsk = Number(instrument.ask);

    // 2. Get all open positions for this symbol
    const positionResult = await client.query(
      `
      SELECT
        p.*,
        a.user_id,
        s.symbol,
        s.name,
        s.bid,
        s.ask,
        s.contract_size
      FROM positions p
      JOIN accounts a
        ON a.id = p.account_id
      JOIN symbols s
        ON s.id = p.symbol_id
      WHERE p.symbol_id = $1
        AND p.status = 'open'
      FOR UPDATE
      `,
      [instrument.id],
    );

    const triggeredPositions = [];

    // 3. Check SL / TP
    for (const position of positionResult.rows) {
      const side = String(position.side).toLowerCase();

      const stopLoss =
        position.stop_loss !== null ? Number(position.stop_loss) : null;

      const takeProfit =
        position.take_profit !== null ? Number(position.take_profit) : null;

      let triggered = false;
      let triggerType = null;
      let closingPrice;

      /*
        BUY:
        SL / TP is checked against BID.
      */
      if (side === "buy") {
        closingPrice = currentBid;

        if (stopLoss !== null && currentBid <= stopLoss) {
          triggered = true;
          triggerType = "stop_loss";
        } else if (takeProfit !== null && currentBid >= takeProfit) {
          triggered = true;
          triggerType = "take_profit";
        }
      } else if (side === "sell") {
        /*
        SELL:
        SL / TP is checked against ASK.
      */
        closingPrice = currentAsk;

        if (stopLoss !== null && currentAsk >= stopLoss) {
          triggered = true;
          triggerType = "stop_loss";
        } else if (takeProfit !== null && currentAsk <= takeProfit) {
          triggered = true;
          triggerType = "take_profit";
        }
      }

      if (!triggered) {
        continue;
      }

      // 4. Calculate realized P/L
      const realizedPnl = calculateUnrealizedPnl({
        side: position.side,
        entryPrice: position.entry_price,
        currentBid,
        currentAsk,
        volume: position.volume,
        contractSize: position.contract_size,
      });

      // 5. Create closing trade
      const tradeResult = await client.query(
        `
        INSERT INTO trades (
          order_id,
          account_id,
          symbol_id,
          side,
          volume,
          execution_price,
          commission,
          swap,
          realized_pnl
        )
        VALUES (
          NULL,
          $1,
          $2,
          $3,
          $4,
          $5,
          0,
          0,
          $6
        )
        RETURNING *
        `,
        [
          position.account_id,
          position.symbol_id,
          position.side,
          position.volume,
          closingPrice,
          realizedPnl,
        ],
      );

      const closingTrade = tradeResult.rows[0];

      // 6. Close position
      const closedPositionResult = await client.query(
        `
        UPDATE positions
        SET
          current_price = $1,
          unrealized_pnl = 0,
          status = 'closed',
          closed_at = NOW(),
          updated_at = NOW()
        WHERE id = $2
          AND status = 'open'
        RETURNING *
        `,
        [closingPrice, position.id],
      );

      const closedPosition = closedPositionResult.rows[0];

      // 7. Release margin
      const accountResult = await client.query(
        `
        SELECT
          *
        FROM accounts
        WHERE id = $1
        FOR UPDATE
        `,
        [position.account_id],
      );

      if (!accountResult.rows.length) {
        throw new Error("Trading account not found");
      }

      const account = accountResult.rows[0];

      const oldMargin = Number(account.margin);
      const positionMargin = Number(position.margin_used);

      const newMargin = Math.max(0, oldMargin - positionMargin);

      // 8. Add realized P/L to balance
      const oldBalance = Number(account.balance);

      const newBalance = oldBalance + realizedPnl;

      const ledgerEntry = await createLedgerEntry({
        client,
        accountId: account.id,
        entryType: realizedPnl >= 0 ? "trade_profit" : "trade_loss",
        amount: realizedPnl,
        balanceBefore: oldBalance,
        balanceAfter: newBalance,
        referenceType: "trade",
        referenceId: closingTrade.id,
        description: `Realized P/L from closing ${position.symbol} ${position.side.toUpperCase()} position`,
      });

      // 9. Calculate remaining unrealized P/L
      const remainingPnlResult = await client.query(
        `
        SELECT
          COALESCE(
            SUM(unrealized_pnl),
            0
          ) AS total_unrealized_pnl
        FROM positions
        WHERE account_id = $1
          AND status = 'open'
        `,
        [position.account_id],
      );

      const remainingUnrealizedPnl = Number(
        remainingPnlResult.rows[0].total_unrealized_pnl,
      );

      // 10. Calculate equity
      const newEquity = newBalance + remainingUnrealizedPnl;

      // 11. Calculate free margin
      const newFreeMargin = newEquity - newMargin;

      // 12. Update account
      const updatedAccountResult = await client.query(
        `
          UPDATE accounts
          SET
            balance = $1,
            equity = $2,
            margin = $3,
            free_margin = $4,
            updated_at = NOW()
          WHERE id = $5
          RETURNING *
          `,
        [newBalance, newEquity, newMargin, newFreeMargin, position.account_id],
      );

      const updatedAccount = updatedAccountResult.rows[0];

      triggeredPositions.push({
        triggerType,
        position: closedPosition,
        trade: closingTrade,
        realizedPnl,
        releasedMargin: positionMargin,
        account: updatedAccount,
      });
    }

    await client.query("COMMIT");

    return {
      symbol: instrument.symbol,
      bid: instrument.bid,
      ask: instrument.ask,
      triggeredPositions,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  calculateUnrealizedPnl,
  updateOpenPositionsForSymbol,
  closePosition,
  checkStopLossTakeProfit,
};
