import { Sequelize } from "sequelize";
import db from "../config/Database.js";
import Users from "./UserModel.js";

const { DataTypes } = Sequelize;
const Sales = db.define('sales', {
    sales_id: { 
        type: DataTypes.INTEGER, 
        autoIncrement: true, 
        primaryKey: true 
    },
    user_id: { 
        type: DataTypes.INTEGER, 
        allowNull: false,
        references: { model: Users, key: 'user_id' }
    },
    sales_date: { 
        type: DataTypes.DATE, 
        allowNull: false, 
        defaultValue: Sequelize.NOW 
    },
    total_amount: { 
        type: DataTypes.DECIMAL(12,2), 
        allowNull: false 
    },
    created_at: DataTypes.DATE,
    updated_at: DataTypes.DATE,
}, { freezeTableName: true });  

export default Sales;