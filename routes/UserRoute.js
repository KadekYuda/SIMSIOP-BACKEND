    import express from "express";
    import {
        getUsers,
        getUserById,
        createUser,
        updateUser,
        loginUser,
        getUserProfile,
    } from "../controller/UserController.js";
    import { authenticateToken, authorizeRole, authorizeUserOrAdmin, verifyToken, logout } from "../auth/authMiddleware.js";

    const router = express.Router();

    // Auth routes
    router.post('/login', loginUser);
    router.post('/logout', authenticateToken, logout);
    router.get('/verify-token', verifyToken);
    

router.get('/profile', authenticateToken, getUserProfile, async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ msg: "Authentication required" });
        }

        // Get complete user details from database if needed
        const completeUser = await User.findOne({
            where: { user_id: user.user_id },
            attributes: ['user_id', 'name', 'email', 'role', 'phone_number', 'status'],
            // Include any other attributes or relations you need
        });

        if (!completeUser) {
            return res.status(404).json({ msg: "User not found" });
        }

        res.json({
            user_id: completeUser.user_id,
            name: completeUser.name,
            email: completeUser.email,
            role: completeUser.role,
            phone_number: completeUser.phone_number,
            status: completeUser.status
            // Include any other fields needed
        });
    } catch (error) {
        console.error("Error fetching profile:", error);
        return res.status(500).json({ msg: "Error fetching profile" });
    }
});



    // Protected routes for users
    router.get('/', authenticateToken, authorizeRole('admin'), getUsers);
    router.get('/:user_id', authenticateToken, authorizeUserOrAdmin, getUserById);
    router.post('/', authenticateToken, authorizeRole('admin'), createUser);
    router.put('/:user_id', authenticateToken, authorizeUserOrAdmin, updateUser);




    export default router;