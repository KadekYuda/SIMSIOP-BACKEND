import jwt from 'jsonwebtoken';
import User from "../models/UserModel.js";
 

export const authenticateToken = async (req, res, next) => {
  try {
    const token = req.cookies.token; // Ambil token dari cookie

    if (!token) {
      
      return res.status(401).json({ msg: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verifikasi token
    

    const user = await User.findOne({
      where: { user_id: decoded.user_id },
      attributes: ['user_id', 'name', 'email', 'role', 'phone_number','status'],
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

    next();
  } catch (err) {
    console.error("Token verification error:", err.message);
    return res.status(403).json({ msg: "Invalid token" });
  }
};

export const authorizeRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ msg: "Authentication required" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ msg: "Access denied" });
    }

    next();
  };
};

export const logout = (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: true, // Hanya jika pakai HTTPS
    sameSite: 'none',
  });
  res.status(200).json({ message: "Logged out successfully" });
}

export const verifyToken = async (req, res) => {
  // Ambil token dari cookie
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ valid: false, msg: "No token provided" });
  }


  // Verifikasi token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Fetch latest user data from database
    const user = await User.findOne({
      where: { user_id: decoded.user_id },
      attributes: ['user_id', 'name', 'email', 'role', 'phone_number', 'status'],
    });

    // Periksa waktu kedaluwarsa token
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
    
    // Return database user info (not decoded token info)
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

