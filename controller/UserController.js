    import User from "../models/UserModel.js"
    import bcrypt from 'bcrypt';
    import jwt from 'jsonwebtoken';


    // Get user profile using the token
    export const getUserProfile = async (req, res) => {
        try {
            
          if (!req.user || !req.userData) {
            return res.status(401).json({ msg: "Authentication required" });
          }
    
          res.status(200).json({
            valid: true,
            user: {
              user_id: req.userData.user_id,
              name: req.userData.name,
              email: req.userData.email,
              phone_number: req.userData.phone_number,
              role: req.userData.role,
              status: req.userData.status || 'active'
            }
          });
        } catch (error) {
          console.error("Error fetching profile:", error.message);
          return res.status(500).json({ msg: "Server error" });
        }
      };

    

    export const getUsers = async(req, res) => {
        try {
            const response = await User.findAll({
                attributes: ['user_id', 'name', 'email', 'role','phone_number','status']
            });
            res.status(200).json(response);
        } catch (error) {
            console.log(error.message);
           return res.status(500).json({ msg: error.message });
        }
    }

    export const getUserById = async(req, res) => {
        try {
            const response = await User.findOne({
                attributes: ['user_id', 'name', 'email', 'role', 'phone_number','status'],
                where:{
                    user_id: req.params.user_id
                }
            });
            if (!response) {
                return res.status(404).json({ msg: "User not found!" });
            }
            res.status(200).json(response);
        } catch (error) {
            console.log(error.message);
            res.status(500).json({ msg: error.message });
        }
    }

    export const createUser = async (req, res) => {
        const { name, email, password, role} = req.body;
        try {
            const existingUser = await User.findOne({ where: { email } });
            if (existingUser) {
                return res.status(400).json({ msg: "A user with this email already exists." });
            }
            const hashedPassword = await bcrypt.hash(password, 10);

            const newUser = await User.create({ 
                name, 
                email, 
                password: hashedPassword, 
                role
            });
            
            res.status(201).json({ 
                msg: "User created successfully", 
                user: {
                    user_id: newUser.user_id,
                    name: newUser.name,
                    email: newUser.email,
                    role: newUser.role
                }
            });
        } catch (error) {
            console.log("Error saat membuat user:", error);
            res.status(500).json({ msg: "Terjadi kesalahan pada server" });
        }
    };

    export const updateUser = async (req, res) => {
        const { user_id } = req.params;
        const { name, email, password, phone_number, role, status } = req.body;
      
        try {
          const user = await User.findByPk(user_id);
          if (!user) {
            return res.status(404).json({ msg: "User not found" });
          }
      
          // Update fields
          user.name = name || user.name;
          user.role = role || user.role;
          user.phone_number = phone_number !== undefined ? phone_number : user.phone_number;
          user.status= status || user.status;
      
          if (email && email !== user.email) {
            const emailExists = await User.findOne({ where: { email } });
            if (emailExists) {
            return res.status(400).json({ msg: "email is already in use" });
            }
            user.email = email;
          }
      
      
          if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            user.password = hashedPassword;
          }

          if (status) {
            user.status = status;
          }
      
          await user.save();
          await user.reload();
      
          res.status(200).json({
            msg: "User berhasil diupdate",
            user: {
              user_id: user.user_id,
              name: user.name,
              email: user.email,
              role: user.role,
              phone_number: user.phone_number, // Pastikan field ini ada
              status: user.status
            }
          });
          
        } catch (error) {
          console.error("Update user error:", error);
          res.status(500).json({ msg: "Terjadi kesalahan pada server" });
        }
      };
    


    export const loginUser = async (req, res) => {
        try {
            const { email, password } = req.body;
            
            const user = await User.findOne({ 
                where: { email }
            });
            
            if (!user) {
                return res.status(404).json({ msg: "User not found!" });
            }

            const isValidPassword = await bcrypt.compare(password, user.password);
            if (!isValidPassword) {
                return res.status(400).json({ msg: "Incorrect password!" });
            }

             
             if (user.status === 'inactive') {
                 return res.status(403).json({ msg: "Account is inactive. Please contact the admin."  });
             }
            
            const token = jwt.sign(
                { 
                    user_id: user.user_id, 
                    name: user.name,
                    email: user.email, 
                    role: user.role,
                   
                },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );
            
            // Simpan token di HTTP-only cookie
        res.cookie('token', token, {
            httpOnly: true, 
            secure: true,  
            sameSite: 'none', 
            maxAge: 24 * 60 * 60 * 1000, 
        });

            res.status(200).json({ 
                msg: "Login berhasil",
                token,
                user: {
                    user_id: user.user_id,
                    name: user.name,
                    email: user.email,
                        role: user.role,
                        
                }
            });
        } catch (error) {
            console.error("Login error:", error);
            res.status(500).json({ msg: "Terjadi kesalahan pada server" });
        }
    };

    