import { Sequelize } from "sequelize";
import db from "../config/Database.js";

const { DataTypes } = Sequelize;

const BatchStock = db.define('batch_stock', {
    batch_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    code_product: {
        type: DataTypes.STRING(13),
        allowNull: false,
        references: {
            model: 'products',
            key: 'code_product'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
    },
    batch_code: {
        type: DataTypes.STRING(40),
        allowNull: false,
    },
    purchase_price: {
        type: DataTypes.DECIMAL(12,2),
        allowNull: false,
       
    },
    initial_stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        
    },
    stock_quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      
    },
    arrival_date: {
        type: DataTypes.DATE,
        allowNull: false,
        
    },
    exp_date: {
        type: DataTypes.DATE,   
        allowNull: true,
        
    },
    created_at: DataTypes.DATE,
    updated_at: DataTypes.DATE,
     
}, {
    freezeTableName: true,
});

export default BatchStock;