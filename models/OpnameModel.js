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
  scheduled_date: {type: DataTypes.DATEONLY,
    allowNull: true,
  },
  opname_date: {type: DataTypes.DATEONLY,
    allowNull: true,
  },  
  system_stock: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  physical_stock: DataTypes.INTEGER,
  expired_stock: DataTypes.INTEGER,
  damaged_stock: DataTypes.INTEGER,
  difference: {
    type: DataTypes.INTEGER,
    allowNull: true,
    set() {
      if (this.physical_stock !== null && this.system_stock !== null) {
        this.setDataValue('difference', this.system_stock - this.physical_stock);
      }
    },
  },
  status: {
    type: DataTypes.ENUM('scheduled', 'submitted', 'adjusted'),
    defaultValue: 'scheduled'
  },
  notes: DataTypes.STRING,
  edit_requested: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
}, { 
    freezeTableName: true,
    paranoid: false
});

export default Opname;