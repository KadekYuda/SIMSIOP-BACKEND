import { Sequelize } from "sequelize";
import db from "../config/Database.js";
import Categories from "./CategoriesModel.js";

const { DataTypes } = Sequelize;

const Product = db.define('products', {
    code_product: {
        type: DataTypes.STRING(255),
        allowNull: false,
        primaryKey: true
    },
    code_categories: {
        type: DataTypes.STRING(4),
        allowNull: true,
        references: {
            model: Categories,
            key: 'code_categories'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
    },
    barcode: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    name_product: {
        type: DataTypes.STRING(30),
        allowNull: false
    },
    
    sell_price: {  
        type: DataTypes.DECIMAL(12,2),
        allowNull: false,
        defaultValue: 0.00
    },
    min_stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    created_at: DataTypes.DATE,
    updated_at: DataTypes.DATE, 
    deleted_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
}, {
    freezeTableName: true,
    
});



export default Product;