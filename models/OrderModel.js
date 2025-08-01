import { Sequelize } from "sequelize";
import db from "../config/Database.js";
import Users from "./UserModel.js";

const { DataTypes } = Sequelize;

const Order = db.define('orders', {
    order_id: { 
        type: DataTypes.INTEGER, 
        autoIncrement: true, 
        primaryKey: true 
    },
    user_id: { 
        type: DataTypes.INTEGER, 
        allowNull: false,
        references: {
            model: Users,
            key: 'user_id'
        }
    },
    order_date: { 
        type: DataTypes.DATE, 
        allowNull: false, 
        defaultValue: Sequelize.NOW 
    },
    order_status: {
        type: DataTypes.ENUM('pending', 'approved', 'cancelled', 'received'),
        allowNull: false,
        defaultValue: 'pending'
    },
    total_amount: { 
        type: DataTypes.DECIMAL(12,2), 
        allowNull: false 
    },
    created_at: DataTypes.DATE,
    updated_at: DataTypes.DATE,
}, { 
    freezeTableName: true,
    paranoid: false,
});


export default Order;