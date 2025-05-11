import User from '../models/UserModel.js'; 
import bcrypt from "bcryptjs";

const initializeAdmin = async () => {
  try {
    const adminExists = await User.findOne({ where: { role: "admin" } });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash(process.env.DEFAULT_ADMIN_PASSWORD, 10);
      await User.create({
        name: process.env.DEFAULT_ADMIN_NAME,
        email: process.env.DEFAULT_ADMIN_EMAIL,
        password: hashedPassword,
        role: "admin",
      });
      console.log("Default admin successfully created.");
    } else {
      console.log("Admin already exists, no need to recreate.");
    }
  } catch (error) {
    console.error("Failed create admin default:", error);
  }
};

export default initializeAdmin;
