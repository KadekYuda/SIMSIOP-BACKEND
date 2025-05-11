import { Sequelize } from "sequelize";
import db from "../config/Database.js";
import Sales from "./SalesModel.js";
import BatchStock from "./BatchstockModel.js";
import Product from "./ProductModel.js";

const { DataTypes } = Sequelize;

const SalesDetail = db.define('sales_details', {
    sales_detail_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    sales_id: { 
        type: DataTypes.INTEGER, 
        allowNull: false,
        references: { model: Sales, key: 'sales_id' }
    },
    code_product:{
        type:DataTypes.STRING(13),
        allowNull:true,
        references: { model: Product, key: 'code_product'}
    }, 
    batch_id: { 
        type: DataTypes.INTEGER, 
        allowNull: false,
        references: { model: BatchStock, key: 'batch_id' }
    },
    quantity: { 
        type: DataTypes.INTEGER, 
        allowNull: false 
    },
    selling_price: { 
        type: DataTypes.DECIMAL(12,2), 
        allowNull: false 
    },
    subtotal: { 
        type: DataTypes.DECIMAL(12,2), 
        allowNull: false 
    },
    created_at: DataTypes.DATE,
    updated_at: DataTypes.DATE,
}, { freezeTableName: true });



export default SalesDetail;