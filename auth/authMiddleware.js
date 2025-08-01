import jwt from 'jsonwebtoken';
import User from "../models/UserModel.js";

// Track invalid tokens to prevent reuse
const invalidatedTokens = new Set();

export const authenticateToken = async (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({ msg: "No token provided" });
    }

    // Check if token has been invalidated
    if (invalidatedTokens.has(token)) {
      return res.status(401).json({ msg: "Token has been invalidated" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check token expiration explicitly
    if (decoded.exp * 1000 < Date.now()) {
      invalidatedTokens.add(token);
      return res.status(401).json({ msg: "Token has expired" });
    }

    const user = await User.findOne({
      where: { user_id: decoded.user_id },
      attributes: ['user_id', 'name', 'email', 'role', 'phone_number', 'status'],
    });

    if (!user) {
      console.log("User not found for user_id:", decoded.user_id);
      return res.status(404).json({ msg: "User not found!" });
    }

    if (user.status === 'inactive') {
      console.log("Inactive account for user_id:", decoded.user_id);
      return res.status(403).json({ msg: "Account is inactive. Please contact the admin." });
    }

    req.user = user;
    req.userData = user;
    req.token = token; // Store token for potential invalidation

    next();
  } catch (err) {
    console.error("Token verification error:", err.message);
    return res.status(403).json({ msg: "Invalid token" });
  }
};

// Function to invalidate a token (used during logout)
export const invalidateToken = (token) => {
  if (token) {
    invalidatedTokens.add(token);
  }
};

export const authorizeRole = (allowedRoles) => {
    return async (req, res, next) => {
        try {
            
            if (!req.user) {
                return res.status(401).json({ msg: "Authentication required" });
            }

            if (!allowedRoles.includes(req.user.role)) {
                return res.status(403).json({ 
                    msg: "Access forbidden - insufficient role privileges",
                    required: allowedRoles,
                    current: req.user.role
                });
            }

            next();
        } catch (error) {
            console.error('Role authorization error:', error);
            res.status(500).json({ msg: "Role authorization error" });
        }
    };
};
export const logout = async (req, res) => {
  try {
    const token = req.token;
    if (token) {
      invalidateToken(token);
    }
    res.clearCookie('token');
    res.json({ msg: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ msg: "Error during logout" });
  }
};

export const verifyToken = async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ valid: false, msg: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findOne({
      where: { user_id: decoded.user_id },
      attributes: ['user_id', 'name', 'email', 'role', 'phone_number', 'status'],
    });

    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < currentTimestamp) {
      return res.status(401).json({ valid: false, msg: "Token has expired" });
    }
    if (!user) {
      return res.status(404).json({ valid: false, msg: "User not found!" });
    }

    if (user.status === 'inactive') {
      return res.status(403).json({ valid: false, msg: "Account is inactive. Please contact the admin." });
    }

    res.status(200).json({
      valid: true,
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone_number: user.phone_number,
        status: user.status
      }
    });
  } catch (err) {
    console.error("Token verification error:", err.message);
    return res.status(403).json({ valid: false, msg: "Invalid token" });
  }
};

export const authorizeUserOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ msg: "Authentication required" });
  }

  if (req.user.status === 'inactive') {
    return res.status(403).json({ 
      msg: "Account is inactive. Please contact the admin." 
    });
  }
  
  const requestedUserId = parseInt(req.params.user_id, 10);
  const currentUserId = parseInt(req.user.user_id, 10);
  
  const isAdmin = req.user.role === 'admin';
  const isSelfUpdate = currentUserId === requestedUserId;
  
  if (isAdmin || isSelfUpdate) {
    next();
  } else {
    res.status(403).json({ msg: "Access denied" });
  }
};


export const authorizeAssignedStaff = async (req, res, next) => {
  try {
    const user = req.user; // Dari authenticateToken
    if (user.role !== 'staff') {
      return res.status(403).json({ msg: 'Access denied: Only staff can perform this action' });
    }

    const opnameId = req.params.id; // Untuk /submit/:id
    if (opnameId) {
      const opname = await Opname.findByPk(opnameId);
      if (!opname || opname.user_id !== user.user_id) {
        return res.status(403).json({ msg: 'Access denied: Not assigned to this opname' });
      }
    }

    next();
  } catch (error) {
    console.error('Error in authorizeAssignedStaff:', error);
    return res.status(500).json({ msg: 'Server error' });
  }
};