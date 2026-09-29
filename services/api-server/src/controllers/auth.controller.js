const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const {
  findUserByEmail,
  findUserById,
  createUser
} = require("../models/user.model");

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

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedFullName = fullName.trim();

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

    const token = generateToken(user);

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user,
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

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "email and password are required"
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