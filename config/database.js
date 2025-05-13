import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const db = new Sequelize(
    process.env.MYSQL_DATABASE || 'simsop_db',
    process.env.MYSQLUSER || 'root',
    process.env.MYSQLPASSWORD || '',
    {
        host: process.env.MYSQLHOST || 'localhost',
        port: process.env.MYSQLPORT || 3306,
        dialect: 'mysql',
        logging: false,
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
        },
        define: {
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            paranoid: true
        }
    }
);

// Function to sync all models
export const syncDatabase = async (force = false) => {
    try {
        // First, sync Users and Categories (no foreign key dependencies)
        const Users = (await import('../models/UserModel.js')).default;
        const Categories = (await import('../models/CategoriesModel.js')).default;
        
        await Users.sync({ force });
        await Categories.sync({ force });

        // Then sync Products (depends on Users and Categories)
        const Products = (await import('../models/ProductModel.js')).default;
        await Products.sync({ force });

        // Finally sync other tables that depend on Products
        const BatchStock = (await import('../models/BatchstockModel.js')).default;
        const Order = (await import('../models/OrderModel.js')).default;
        const Opname = (await import('../models/OpnameModel.js')).default;

        await Promise.all([
            BatchStock.sync({ force }),
            Order.sync({ force }),
            Opname.sync({ force })
        ]);

        console.log('Database synchronized successfully');
        return true;
    } catch (error) {
        console.error('Error synchronizing database:', error);
        throw error; // Re-throw to handle in the calling function
    }
};

// Test database connection
export const testConnection = async () => {
    try {
        await db.authenticate();
        console.log('Database connection has been established successfully.');
        return true;
    } catch (error) {
        console.error('Unable to connect to the database:', error);
        return false;
    }
};

export const initDB = syncDatabase; 

export default db;