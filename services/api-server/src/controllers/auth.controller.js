const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const {
  findUserByEmail,
  findUserById,
  createUser
} = require("../models/user.model");

const {
  findAccountByUserId,
  createAccount
} = require("../models/account.model");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function generateAccountNumber() {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(1000 + Math.random() * 9000);

  return `TRX${timestamp}${random}`;
}

/**
 * Every client needs a trading account to use the terminal.
 * Previously register only created the USER, so a new client landed
 * on a dashboard with no account. This creates (or finds) the
 * default demo account: 10,000 USD, leverage 1:100.
 */
async function ensureTradingAccount(userId) {
  const existing = await findAccountByUserId(userId);

  if (existing) {
    return existing;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await createAccount({
        userId,
        accountNumber: generateAccountNumber(),
        currency: "USD",
        initialBalance: 10000,
        leverage: 100
      });
    } catch (error) {
      // account number collision -> retry with a new number
      if (error.code !== "23505") {
        throw error;
      }
    }
  }

  return findAccountByUserId(userId);
}

function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d"
    }
  );
}

async function register(req, res) {
  try {
    const {
      email,
      password,
      fullName
    } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({
        success: false,
        message: "email, password and fullName are required"
      });
    }

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof fullName !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration details"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedFullName = fullName.trim().replace(/\s+/g, " ");

    if (normalizedFullName.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Please enter your full name"
      });
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters"
      });
    }

    if (Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({
        success: false,
        message: "Password is too long (maximum 72 characters)"
      });
    }

    const existingUser = await findUserByEmail(normalizedEmail);

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User with this email already exists"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await createUser({
      email: normalizedEmail,
      passwordHash,
      fullName: normalizedFullName
    });

    let account = null;

    try {
      account = await ensureTradingAccount(user.id);
    } catch (accountError) {
      // User exists; the dashboard / next login will retry account creation.
      console.error("Register: account creation failed:", accountError);
    }

    const token = generateToken(user);

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      data: {
        user,
        account,
        token
      }
    });
  } catch (error) {
    console.error("Register error:", error);

    return res.status(500).json({
      success: false,
      message: "Registration failed"
    });
  }
}

async function login(req, res) {
  try {
    const {
      email,
      password
    } = req.body;

    if (
      !email ||
      !password ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await findUserByEmail(normalizedEmail);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "User account is not active"
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    if (user.role !== "admin") {
      try {
        await ensureTradingAccount(user.id);
      } catch (accountError) {
        console.error("Login: account check failed:", accountError);
      }
    }

    const token = generateToken(user);

    const safeUser = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      is_active: user.is_active
    };

    return res.json({
      success: true,
      message: "Login successful",
      data: {
        user: safeUser,
        token
      }
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed"
    });
  }
}

async function me(req, res) {
  try {
    const user = await findUserById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    return res.json({
      success: true,
      data: {
        user
      }
    });
  } catch (error) {
    console.error("Me error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch user"
    });
  }
}

module.exports = {
  register,
  login,
  me
};