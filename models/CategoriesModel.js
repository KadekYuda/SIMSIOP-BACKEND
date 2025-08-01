import { Sequelize } from "sequelize";
import db from "../config/Database.js";

const { DataTypes } = Sequelize;

const Categories = db.define('categories', {
    code_categories: { 
        type: DataTypes.STRING(4),
        allowNull: false,
        primaryKey: true,
    },
    name_categories: {
        type: DataTypes.STRING(30),
        allowNull: false
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

export default Categories;