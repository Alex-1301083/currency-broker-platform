const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const {
  pool,
} = require("../config/database");

const {
  createAuditLog,
  getAuditLogs,
  getAuditLogById,
} = require("../models/audit-log.model");

function generateAdminToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn:
        process.env.JWT_EXPIRES_IN ||
        "7d",
    },
  );
}

async function adminLogin(req, res) {
  try {
    const {
      email,
      password,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Email and password are required.",
      });
    }

    const normalizedEmail =
      email.trim().toLowerCase();

    const result =
      await pool.query(
        `
        SELECT
          id,
          full_name,
          email,
          password_hash,
          role,
          is_active
        FROM users
        WHERE email = $1
        LIMIT 1
        `,
        [normalizedEmail],
      );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid admin credentials.",
      });
    }

    const user = result.rows[0];

    if (user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message:
          "Admin access required.",
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message:
          "Admin account is inactive.",
      });
    }

    const passwordMatches =
      await bcrypt.compare(
        password,
        user.password_hash,
      );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid admin credentials.",
      });
    }

    const token =
      generateAdminToken(user);

    return res.json({
      success: true,
      message:
        "Admin login successful.",
      data: {
        user: {
          id: user.id,
          full_name:
            user.full_name,
          email: user.email,
          role: user.role,
          is_active:
            user.is_active,
        },

        token,
      },
    });
  } catch (error) {
    console.error(
      "Admin login error:",
      error,
    );

    return res.status(500).json({
      success: false,
      message:
        "Admin login failed.",
    });
  }
}

async function getAdminDashboard(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM users WHERE is_active = true) AS active_users,
        (SELECT COUNT(*) FROM accounts) AS total_accounts,
        (SELECT COUNT(*) FROM orders) AS total_orders,
        (SELECT COUNT(*) FROM positions WHERE status = 'open') AS open_positions,
        (SELECT COUNT(*) FROM trades) AS total_trades,
        (SELECT COUNT(*) FROM symbols WHERE is_active = true) AS active_symbols
    `);

    const dashboard = result.rows[0];

    return res.json({
      success: true,
      data: {
        totalUsers: Number(dashboard.total_users),
        activeUsers: Number(dashboard.active_users),
        totalAccounts: Number(dashboard.total_accounts),
        totalOrders: Number(dashboard.total_orders),
        openPositions: Number(dashboard.open_positions),
        totalTrades: Number(dashboard.total_trades),
        activeSymbols: Number(dashboard.active_symbols),
      },
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load admin dashboard.",
    });
  }
}

async function getAdminUsers(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.role,
        u.is_active,
        u.created_at,

        COUNT(DISTINCT a.id) AS total_accounts,
        COUNT(DISTINCT o.id) AS total_orders,
        COUNT(DISTINCT p.id) FILTER (
          WHERE p.status = 'open'
        ) AS open_positions

      FROM users u

      LEFT JOIN accounts a
        ON a.user_id = u.id

      LEFT JOIN orders o
        ON o.account_id = a.id

      LEFT JOIN positions p
        ON p.account_id = a.id

      GROUP BY
        u.id,
        u.full_name,
        u.email,
        u.role,
        u.is_active,
        u.created_at

      ORDER BY u.created_at DESC
    `);

    return res.json({
      success: true,
      data: result.rows.map((user) => ({
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at,
        totalAccounts: Number(user.total_accounts),
        totalOrders: Number(user.total_orders),
        openPositions: Number(user.open_positions),
      })),
    });
  } catch (error) {
    console.error("Admin users error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load users.",
    });
  }
}

async function getAdminUserById(req, res) {
  try {
    const { userId } = req.params;

    const userResult = await pool.query(
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
      `,
      [userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const user = userResult.rows[0];

    const accountsResult = await pool.query(
      `
      SELECT
        id,
        account_number,
        currency,
        balance,
        equity,
        margin,
        free_margin,
        leverage,
        status,
        created_at
      FROM accounts
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId],
    );

    return res.json({
      success: true,
      data: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at,
        updatedAt: user.updated_at,

        accounts: accountsResult.rows.map((account) => ({
          id: account.id,
          accountNumber: account.account_number,
          currency: account.currency,
          balance: Number(account.balance),
          equity: Number(account.equity),
          margin: Number(account.margin),
          freeMargin: Number(account.free_margin),
          leverage: Number(account.leverage),
          status: account.status,
          createdAt: account.created_at,
        })),
      },
    });
  } catch (error) {
    console.error("Admin user details error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load user details.",
    });
  }
}

async function updateAdminUserStatus(req, res) {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be a boolean.",
      });
    }

    const userResult = await pool.query(
      `
      UPDATE users
      SET
        is_active = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING
        id,
        full_name,
        email,
        role,
        is_active,
        updated_at
      `,
      [isActive, userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const user = userResult.rows[0];

    // Create audit log after successful user status update
    await createAuditLog({
      userId: req.user.userId,
      action: isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
      entityType: "user",
      entityId: user.id,
      ipAddress: req.ip,
      metadata: {
        targetUserId: user.id,
        targetUserEmail: user.email,
        isActive: user.is_active,
      },
    });

    return res.json({
      success: true,
      message: isActive
        ? "User activated successfully."
        : "User deactivated successfully.",
      data: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        isActive: user.is_active,
        updatedAt: user.updated_at,
      },
    });
  } catch (error) {
    console.error("Admin user status update error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update user status.",
    });
  }
}
async function getAdminOrders(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        o.id,
        o.account_id,
        o.symbol_id,
        o.order_type,
        o.side,
        o.volume,
        o.price,
        o.stop_loss,
        o.take_profit,
        o.status,
        o.created_at,
        o.updated_at,

        u.id AS user_id,
        u.full_name AS user_full_name,
        u.email AS user_email,

        a.account_number,
        a.currency,

        s.symbol,
        s.name AS symbol_name

      FROM orders o

      INNER JOIN accounts a
        ON a.id = o.account_id

      INNER JOIN users u
        ON u.id = a.user_id

      INNER JOIN symbols s
        ON s.id = o.symbol_id

      ORDER BY o.created_at DESC
    `);

    return res.json({
      success: true,
      data: result.rows.map((order) => ({
        id: order.id,

        user: {
          id: order.user_id,
          fullName: order.user_full_name,
          email: order.user_email,
        },

        account: {
          id: order.account_id,
          accountNumber: order.account_number,
          currency: order.currency,
        },

        symbol: {
          id: order.symbol_id,
          symbol: order.symbol,
          name: order.symbol_name,
        },

        orderType: order.order_type,
        side: order.side,
        volume: Number(order.volume),
        price: order.price !== null ? Number(order.price) : null,

        stopLoss: order.stop_loss !== null ? Number(order.stop_loss) : null,

        takeProfit:
          order.take_profit !== null ? Number(order.take_profit) : null,

        status: order.status,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
      })),
    });
  } catch (error) {
    console.error("Admin orders error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load orders.",
    });
  }
}

async function getAdminPositions(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        p.id,
        p.account_id,
        p.symbol_id,
        p.side,
        p.volume,
        p.entry_price,
        p.current_price,
        p.stop_loss,
        p.take_profit,
        p.unrealized_pnl,
        p.margin_used,
        p.status,
        p.opened_at,
        p.updated_at,

        u.id AS user_id,
        u.full_name,
        u.email,

        a.account_number,
        a.currency,

        s.symbol,
        s.name AS symbol_name

      FROM positions p

      INNER JOIN accounts a
        ON a.id = p.account_id

      INNER JOIN users u
        ON u.id = a.user_id

      INNER JOIN symbols s
        ON s.id = p.symbol_id

      WHERE p.status = 'open'

      ORDER BY p.opened_at DESC
    `);

    return res.json({
      success: true,
      data: result.rows.map((position) => ({
        id: position.id,

        user: {
          id: position.user_id,
          fullName: position.full_name,
          email: position.email,
        },

        account: {
          id: position.account_id,
          accountNumber: position.account_number,
          currency: position.currency,
        },

        symbol: {
          id: position.symbol_id,
          symbol: position.symbol,
          name: position.symbol_name,
        },

        side: position.side,

        volume: Number(position.volume),

        entryPrice: Number(position.entry_price),

        currentPrice:
          position.current_price !== null
            ? Number(position.current_price)
            : null,

        stopLoss:
          position.stop_loss !== null ? Number(position.stop_loss) : null,

        takeProfit:
          position.take_profit !== null ? Number(position.take_profit) : null,

        unrealizedPnl: Number(position.unrealized_pnl || 0),

        marginUsed: Number(position.margin_used || 0),

        status: position.status,

        openedAt: position.opened_at,

        updatedAt: position.updated_at,
      })),
    });
  } catch (error) {
    console.error("Admin positions error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load open positions.",
    });
  }
}

async function getAdminTrades(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        t.id,
        t.order_id,
        t.account_id,
        t.symbol_id,
        t.side,
        t.volume,
        t.execution_price,
        t.commission,
        t.swap,
        t.realized_pnl,
        t.executed_at,

        u.id AS user_id,
        u.full_name,
        u.email,

        a.account_number,
        a.currency,

        s.symbol,
        s.name AS symbol_name

      FROM trades t

      INNER JOIN accounts a
        ON a.id = t.account_id

      INNER JOIN users u
        ON u.id = a.user_id

      INNER JOIN symbols s
        ON s.id = t.symbol_id

      ORDER BY t.executed_at DESC
    `);

    return res.json({
      success: true,

      data: result.rows.map((trade) => ({
        id: trade.id,

        orderId: trade.order_id,

        user: {
          id: trade.user_id,
          fullName: trade.full_name,
          email: trade.email,
        },

        account: {
          id: trade.account_id,
          accountNumber: trade.account_number,
          currency: trade.currency,
        },

        symbol: {
          id: trade.symbol_id,
          symbol: trade.symbol,
          name: trade.symbol_name,
        },

        side: trade.side,

        volume: Number(trade.volume),

        executionPrice: Number(trade.execution_price),

        commission: Number(trade.commission || 0),

        swap: Number(trade.swap || 0),

        realizedPnl: Number(trade.realized_pnl || 0),

        executedAt: trade.executed_at,
      })),
    });
  } catch (error) {
    console.error("Admin trades error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load trades.",
    });
  }
}

async function getAdminSymbols(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        id,
        symbol,
        name,
        base_currency,
        quote_currency,
        asset_type,
        bid,
        ask,
        spread,
        digits,
        contract_size,
        min_lot,
        max_lot,
        is_active,
        created_at,
        updated_at
      FROM symbols
      ORDER BY symbol ASC
    `);

    return res.json({
      success: true,

      data: result.rows.map((symbol) => ({
        id: symbol.id,

        symbol: symbol.symbol,

        name: symbol.name,

        baseCurrency: symbol.base_currency,

        quoteCurrency: symbol.quote_currency,

        assetType: symbol.asset_type,

        bid: symbol.bid === null ? null : Number(symbol.bid),

        ask: symbol.ask === null ? null : Number(symbol.ask),

        spread: symbol.spread === null ? null : Number(symbol.spread),

        digits: Number(symbol.digits),

        contractSize: Number(symbol.contract_size),

        minLot: Number(symbol.min_lot),

        maxLot: Number(symbol.max_lot),

        isActive: symbol.is_active,

        createdAt: symbol.created_at,

        updatedAt: symbol.updated_at,
      })),
    });
  } catch (error) {
    console.error("Admin symbols error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load symbols.",
    });
  }
}

async function updateAdminSymbolStatus(req, res) {
  try {
    const { symbolId } = req.params;
    const { isActive } = req.body;

    // Validate symbol ID
    if (!symbolId) {
      return res.status(400).json({
        success: false,
        message: "Symbol ID is required.",
      });
    }

    // Validate isActive
    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be a boolean.",
      });
    }

    const result = await pool.query(
      `
      UPDATE symbols
      SET
        is_active = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING
        id,
        symbol,
        name,
        base_currency,
        quote_currency,
        asset_type,
        bid,
        ask,
        spread,
        digits,
        contract_size,
        min_lot,
        max_lot,
        is_active,
        created_at,
        updated_at
      `,
      [isActive, symbolId],
    );

    // Symbol not found
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Symbol not found.",
      });
    }

    const symbol = result.rows[0];

    return res.json({
      success: true,

      message: isActive
        ? "Symbol activated successfully."
        : "Symbol deactivated successfully.",

      data: {
        id: symbol.id,
        symbol: symbol.symbol,
        name: symbol.name,
        baseCurrency: symbol.base_currency,
        quoteCurrency: symbol.quote_currency,
        assetType: symbol.asset_type,

        bid: symbol.bid === null ? null : Number(symbol.bid),

        ask: symbol.ask === null ? null : Number(symbol.ask),

        spread: symbol.spread === null ? null : Number(symbol.spread),

        digits: Number(symbol.digits),

        contractSize: Number(symbol.contract_size),

        minLot: Number(symbol.min_lot),

        maxLot: Number(symbol.max_lot),

        isActive: symbol.is_active,

        createdAt: symbol.created_at,
        updatedAt: symbol.updated_at,
      },
    });
  } catch (error) {
    console.error("Admin symbol status update error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update symbol status.",
    });
  }
}

async function getAdminAuditLogs(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);

    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const logs = await getAuditLogs({
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: logs.map((log) => ({
        id: log.id,

        user: log.user_id
          ? {
              id: log.user_id,
              fullName: log.full_name,
              email: log.email,
              role: log.role,
            }
          : null,

        action: log.action,

        entityType: log.entity_type,

        entityId: log.entity_id,

        ipAddress: log.ip_address,

        metadata: log.metadata,

        createdAt: log.created_at,
      })),
    });
  } catch (error) {
    console.error("Admin audit logs error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load audit logs.",
    });
  }
}

async function getAdminAuditLogById(req, res) {
  try {
    const { auditLogId } = req.params;

    if (!auditLogId) {
      return res.status(400).json({
        success: false,
        message: "Audit log ID is required.",
      });
    }

    const log = await getAuditLogById(auditLogId);

    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Audit log not found.",
      });
    }

    return res.json({
      success: true,
      data: {
        id: log.id,

        user: log.user_id
          ? {
              id: log.user_id,
              fullName: log.full_name,
              email: log.email,
              role: log.role,
            }
          : null,

        action: log.action,

        entityType: log.entity_type,

        entityId: log.entity_id,

        ipAddress: log.ip_address,

        metadata: log.metadata,

        createdAt: log.created_at,
      },
    });
  } catch (error) {
    console.error("Admin audit log details error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load audit log.",
    });
  }
}

module.exports = {
  adminLogin,
  getAdminDashboard,
  getAdminUsers,
  getAdminUserById,
  updateAdminUserStatus,
  getAdminOrders,
  getAdminPositions,
  getAdminTrades,
  getAdminSymbols,
  updateAdminSymbolStatus,
  getAdminAuditLogs,
  getAdminAuditLogById,
};
