import { Sequelize } from "sequelize";
import db from "../config/Database.js";
import Users from "./UserModel.js";
import BatchStock from "./BatchstockModel.js";

const { DataTypes } = Sequelize;

const Opname = db.define('opnames', {
    opname_id: { 
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
    batch_id: { 
        type: DataTypes.INTEGER, 
        allowNull: false,
        references: {
            model: BatchStock,
            key: 'batch_id'
        }
    },
    system_stock: { 
        type: DataTypes.INTEGER, 
        allowNull: false 
    },
    physical_stock: { 
        type: DataTypes.INTEGER, 
        allowNull: false 
    },
    difference: { 
        type: DataTypes.INTEGER, 
        allowNull: false 
    },
    expired_stock: { 
        type: DataTypes.INTEGER, 
        allowNull: false 
    },
    damaged_stock: { 
        type: DataTypes.INTEGER, 
        allowNull: false 
    },
    opname_date: { 
        type: DataTypes.DATE, 
        allowNull: false, 
        defaultValue: Sequelize.NOW 
    },
    created_at: DataTypes.DATE,
    updated_at: DataTypes.DATE,
}, { 
    freezeTableName: true 
});

export default Opname;