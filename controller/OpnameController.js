import { Op } from "sequelize";
import db from "../config/Database.js";

// Direct model imports
import Opname from "../models/OpnameModel.js";
import BatchStock from "../models/BatchstockModel.js";
import Product from "../models/ProductModel.js";
import User from "../models/UserModel.js";
import Categories from "../models/CategoriesModel.js";



export const createOpnameTasks = async (req, res) => {
  const { code_product, scheduled_date, assigned_user_id } = req.body;
  const transaction = await db.transaction();

  try {
    if (!code_product) {
      await transaction.rollback();
      return res.status(400).json({ error: "code_product is required" });
    }
    if (!scheduled_date) {
      await transaction.rollback();
      return res.status(400).json({ error: "scheduled_date is required" });
    }
    if (!assigned_user_id) {
      await transaction.rollback();
      return res.status(400).json({ error: "assigned_user_id is required" });
    }

    const batchStocks = await BatchStock.findAll({
      where: { code_product },
      transaction,
    });

    if (!batchStocks.length) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ error: "No batches found for this product" });
    }

    const opnames = batchStocks.map((batch) => ({
      batch_id: batch.batch_id,
      user_id: assigned_user_id,
      scheduled_date,
      system_stock: batch.stock_quantity,
      status: "scheduled",
    }));

    await Opname.bulkCreate(opnames, { transaction });
    await transaction.commit();
    res
      .status(201)
      .json({ message: "Opname tasks created", count: opnames.length });
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to create opname tasks" });
  }
};

export const getTasksForUser = async (req, res) => {
  try {
    if (!req.user || !req.user.user_id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    console.log("Fetching tasks for user:", req.user.user_id);

    // Allow filtering by status via query parameter, default to all statuses
    const { status, include_all_status } = req.query;
    const whereClause = { user_id: req.user.user_id };
    
    // If include_all_status is true, don't filter by status
    // If status is specified, filter by that status
    // Otherwise, default to scheduled only (backward compatibility)
    if (include_all_status === 'true') {
      // Include all statuses
    } else if (status) {
      whereClause.status = status;
    } else {
      whereClause.status = "scheduled";
    }

    const tasks = await Opname.findAll({
      where: whereClause,
      include: [
        {
          model: BatchStock,
          required: true,
          include: [{ 
            model: Product, 
            required: true,
            include: [{ 
              model: Categories, 
              required: false // Use LEFT JOIN in case some products don't have categories
            }]
          }],
        },
      ],
      order: [["scheduled_date", "ASC"]],
    });

    console.log("Found tasks:", tasks.length);
    console.log("Tasks with statuses:", tasks.map(t => ({ id: t.opname_id, status: t.status })));
    
    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
};

export const submitOpnameResult = async (req, res) => {
  const { code_product, physical_stock, expired_stock, damaged_stock, notes } =
    req.body;
  const transaction = await db.transaction();

  try {
    if (physical_stock === undefined || physical_stock < 0) {
      await transaction.rollback();
      return res
        .status(400)
        .json({ error: "physical_stock is required and must be non-negative" });
    }
    
    const totalExpiredDamaged = (parseInt(expired_stock) || 0) + (parseInt(damaged_stock) || 0);
    
    // Add validation for expired + damaged stock
    // Allow it to exceed physical_stock only if physical_stock is 0 (all stock expired case)
    if (totalExpiredDamaged > physical_stock && physical_stock > 0) {
      await transaction.rollback();
      return res.status(400).json({
        error: "The sum of expired and damaged stock cannot exceed physical stock"
      });
    }

    const batches = await BatchStock.findAll({
      where: { code_product },
      order: [["createdAt", "ASC"]], // FIFO
      transaction,
    });

    const opnames = await Opname.findAll({
      where: {
        batch_id: { [Op.in]: batches.map((b) => b.batch_id) },
        user_id: req.user.user_id,
        status: "scheduled",
      },
      transaction,
    });

    if (!opnames.length) {
      await transaction.rollback();
      return res
        .status(403)
        .json({ error: "No opname found or not assigned to you" });
    }

    let remainingStock = parseInt(physical_stock);
    let remainingExpired = expired_stock ? parseInt(expired_stock) : 0;
    let remainingDamaged = damaged_stock ? parseInt(damaged_stock) : 0;
    let totalSystemStock = batches.reduce((sum, b) => sum + b.stock_quantity, 0);

    for (const batch of batches) {
      const opname = opnames.find((o) => o.batch_id === batch.batch_id);
      if (opname && remainingStock > 0) {
        // Distribute physical stock proportionally across batches
        // The key change: Don't limit to batch.stock_quantity, allow any value
        let batchPhysicalStock;
        
        if (batches.length === 1) {
          // If there's only one batch, assign all the physical stock to it
          batchPhysicalStock = remainingStock;
        } else {
          // For multiple batches, distribute proportionally based on system stock ratio
          const systemStockRatio = batch.stock_quantity / totalSystemStock;
          batchPhysicalStock = Math.min(remainingStock, Math.round(physical_stock * systemStockRatio));
        }
        
        const ratio = physical_stock > 0 ? batchPhysicalStock / physical_stock : 0;
        const currentDate = new Date().toISOString().split("T")[0];
        
        await opname.update(
          {
            physical_stock: batchPhysicalStock,
            expired_stock: Math.round(remainingExpired * ratio) || 0,
            damaged_stock: Math.round(remainingDamaged * ratio) || 0,
            notes: notes || "",
            status: "submitted",
            opname_date: currentDate,
          },
          { transaction }
        );
        remainingStock -= batchPhysicalStock;
        remainingExpired -= Math.round(remainingExpired * ratio);
        remainingDamaged -= Math.round(remainingDamaged * ratio);
      }
    }

    if (remainingStock > 0 || remainingStock < 0) {
      const currentDate = new Date().toISOString().split("T")[0];
      await Opname.create(
        {
          user_id: req.user.user_id,
          system_stock: 0,
          physical_stock: 0,
          expired_stock: 0,
          damaged_stock: 0,
          notes: `Selisih stok: ${
            remainingStock > 0 ? `+${remainingStock}` : remainingStock
          } (Sistem: ${totalSystemStock})`,
          status: "submitted",
          scheduled_date: opnames[0].scheduled_date,
          opname_date: currentDate,
        },
        { transaction }
      );
    }

    await transaction.commit();
    res.json({
      message: "Opname submitted successfully",
      status: "submitted",
    });
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to submit opname" });
  }
};

export const reviewAndAdjustOpname = async (req, res) => {
  const { opname_id, adjustment_notes, status, adjust_stock, notes, approve_edit } = req.body;
  const transaction = await db.transaction();

  try {
    const opname = await Opname.findByPk(opname_id, { transaction });
    if (!opname) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ error: "Opname not found" });
    }

    // Update opname status and notes
    const updateData = {
      status: status || "adjusted",
    };

    // Special handling for edit requests
    const hasEditRequest = opname.edit_requested === true || (opname.notes && opname.notes.includes('[REQUEST EDIT]'));
    
    if (hasEditRequest) {
      // If trying to adjust stock while an edit request is pending and not handling the request, return error
      if (adjust_stock && approve_edit === undefined) {
        await transaction.rollback();
        return res.status(400).json({ 
          error: "Cannot adjust stock while an edit request is pending. Please approve or reject the edit request first." 
        });
      }
      
      if (approve_edit === true) {
        // If admin approves edit request, change status back to scheduled so staff can edit
        updateData.status = "scheduled";
        updateData.edit_requested = false;
        // Completely clear the notes if they only contained request edit text, otherwise remove the request part
        if (opname.notes && opname.notes.trim().startsWith('[REQUEST EDIT]')) {
          updateData.notes = ''; // Clear notes completely if only request text
        } else {
          // Remove any request edit text, keeping other notes
          updateData.notes = opname.notes ? opname.notes.replace(/\[REQUEST EDIT\].*?(\n|$)/g, '').trim() : '';
        }
      } else if (approve_edit === false) {
        // If admin rejects the edit request, keep status but mark request as handled
        updateData.edit_requested = false;
        // Remove request edit text completely, keeping only original notes if any
        updateData.notes = opname.notes ? opname.notes.replace(/\[REQUEST EDIT\].*?(\n|$)/g, '').trim() : '';
      } else {
        // If not handling the edit request but there is one pending, use provided notes
        if (notes !== undefined) {
          updateData.notes = notes;
        } else if (adjustment_notes) {
          updateData.notes = adjustment_notes;
        }
      }
    } else {
      // Normal flow when no edit request
      if (notes !== undefined) {
        updateData.notes = notes;
      } else if (adjustment_notes) {
        updateData.notes = adjustment_notes;
      }
    }

    // If adjusting stock, also update the batch stock
    // Only allow stock adjustment when not handling an edit request or when rejecting an edit
    // When approving an edit, we don't adjust the stock yet - staff will resubmit with new data
    if (adjust_stock && opname.batch_id && (!hasEditRequest || approve_edit === false)) {
      const batch = await BatchStock.findByPk(opname.batch_id, { transaction });
      if (batch) {
        await batch.update(
          { stock_quantity: opname.physical_stock },
          { transaction }
        );
      }
    }

    await opname.update(updateData, { transaction });

    await transaction.commit();
    res.json({ 
      message: "Opname reviewed and updated successfully",
      approved_edit: approve_edit,
      status: updateData.status
    });
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to review and adjust opname" });
  }
};

export const directOpnameByAdmin = async (req, res) => {
  const { code_product, physical_stock, expired_stock, damaged_stock, notes } =
    req.body;
  const transaction = await db.transaction();

  try {
    if (physical_stock === undefined || physical_stock < 0) {
      await transaction.rollback();
      return res
        .status(400)
        .json({ error: "physical_stock is required and must be non-negative" });
    }

    const batches = await BatchStock.findAll({
      where: { code_product },
      order: [["createdAt", "ASC"]], // FIFO
      transaction,
    });

    if (!batches.length) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ error: "No batches found for this product" });
    }

    const currentDate = new Date().toISOString().split("T")[0];
    let remainingStock = parseInt(physical_stock);
    let remainingExpired = expired_stock ? parseInt(expired_stock) : 0;
    let remainingDamaged = damaged_stock ? parseInt(damaged_stock) : 0;

    for (const batch of batches) {
      if (remainingStock <= 0) break;
      const batchPhysicalStock = Math.min(batch.stock_quantity, remainingStock);
      const ratio = physical_stock > 0 ? batchPhysicalStock / physical_stock : 0;
      await Opname.create(
        {
          batch_id: batch.batch_id,
          user_id: req.user.user_id,
          scheduled_date: null, // Tidak ada jadwal untuk direct opname
          opname_date: currentDate,
          system_stock: batch.stock_quantity, // Stok sebelum perubahan
          physical_stock: batchPhysicalStock,
          expired_stock: Math.round(remainingExpired * ratio) || 0,
          damaged_stock: Math.round(remainingDamaged * ratio) || 0,
          notes: notes || "Direct opname pending",
          status: "pending",
        },
        { transaction }
      );
      remainingStock -= batchPhysicalStock;
      remainingExpired -= Math.round(remainingExpired * ratio);
      remainingDamaged -= Math.round(remainingDamaged * ratio);
    }

    if (remainingStock > 0 || remainingStock < 0) {
      await Opname.create(
        {
          user_id: req.user.user_id,
          scheduled_date: null,
          opname_date: currentDate,
          system_stock: 0,
          physical_stock: 0,
          expired_stock: 0,
          damaged_stock: 0,
          notes: `Selisih stok: ${
            remainingStock > 0 ? `+${remainingStock}` : remainingStock
          }`,
          status: "pending",
        },
        { transaction }
      );
    }

    await transaction.commit();
    res.json({ message: "Direct opname saved pending", date: currentDate });
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to perform direct opname" });
  }
};

export const confirmDirectOpname = async (req, res) => {
  const { pendingInputs } = req.body;
  const transaction = await db.transaction();

  try {
    // Process each pending input
    for (const input of pendingInputs) {
      const batches = await BatchStock.findAll({
        where: { code_product: input.code_product },
        include: [{ model: Product, required: true }],
        transaction,
      });

      if (!batches.length) {
        await transaction.rollback();
        return res.status(404).json({ error: `No batches found for product ${input.code_product}` });
      }

      // Check if there's already an opname for this product today by this admin
      const today = new Date().toISOString().split('T')[0];
      const existingOpname = await Opname.findOne({
        include: [{
          model: BatchStock,
          where: { code_product: input.code_product },
          required: true,
          include: [{ model: Product, required: true }]
        }],
        where: {
          user_id: req.user.user_id,
          [Op.and]: [
            db.literal(`DATE(opname_date) = '${today}'`),
          ],
          status: 'adjusted'
        },
        transaction
      });

      if (existingOpname) {
        // Update existing opname record
        await existingOpname.update({
          physical_stock: input.physical_stock,
          expired_stock: input.expired_stock || 0,
          damaged_stock: input.damaged_stock || 0,
          notes: input.notes,
          system_stock: batches.reduce((sum, batch) => sum + batch.stock_quantity, 0)
        }, { transaction });

        // Distribute the physical stock across batches (FIFO - First batch gets priority)
        let remainingStock = input.physical_stock;
        const sortedBatches = batches.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        
        for (const batch of sortedBatches) {
          const allocatedStock = Math.min(remainingStock, batch.stock_quantity);
          await batch.update({
            stock_quantity: allocatedStock
          }, { transaction });
          remainingStock -= allocatedStock;
          
          if (remainingStock <= 0) break;
        }

        // If there's remaining stock, add it to the first batch
        if (remainingStock > 0 && sortedBatches.length > 0) {
          const firstBatch = sortedBatches[0];
          await firstBatch.update({
            stock_quantity: firstBatch.stock_quantity + remainingStock
          }, { transaction });
        }
      } else {
        // Create single opname record for the product (using first batch)
        const firstBatch = batches[0];
        const totalSystemStock = batches.reduce((sum, batch) => sum + batch.stock_quantity, 0);

        await Opname.create({
          batch_id: firstBatch.batch_id,
          user_id: req.user.user_id,
          scheduled_date: null,
          opname_date: input.date,
          system_stock: totalSystemStock,
          physical_stock: input.physical_stock,
          expired_stock: input.expired_stock || 0,
          damaged_stock: input.damaged_stock || 0,
          notes: input.notes,
          status: "adjusted"
        }, { transaction });

        // Distribute the physical stock across batches (FIFO - First batch gets priority)
        let remainingStock = input.physical_stock;
        const sortedBatches = batches.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        
        for (const batch of sortedBatches) {
          const allocatedStock = Math.min(remainingStock, batch.stock_quantity);
          
          await batch.update({
            stock_quantity: allocatedStock
          }, { transaction });
          
          remainingStock -= allocatedStock; // Subtract allocated stock, not original
          
          if (remainingStock <= 0) break;
        }

        // If there's remaining stock, add it to the first batch
        if (remainingStock > 0 && sortedBatches.length > 0) {
          const firstBatch = sortedBatches[0];
          await firstBatch.update({
            stock_quantity: firstBatch.stock_quantity + remainingStock
          }, { transaction });
        }
      }
    }

    await transaction.commit();
    res.json({ message: "Direct opname confirmed successfully" });
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to confirm direct opname" });
  }
};

export const getAllOpnames = async (req, res) => {
  try {
    // Log start time for performance tracking
    const startTime = Date.now();
    console.log('Starting getAllOpnames query at:', new Date().toISOString());
    
    // Get filter parameters
    const { status, dateStart, dateEnd, userId, limit, offset, noPagination } = req.query;
    
    // Build where conditions
    const whereCondition = {};
    
    if (status) {
      whereCondition.status = status;
    }
    
    if (userId) {
      whereCondition.user_id = userId;
    }
    
    // Handle date range filtering
    if (dateStart && dateEnd) {
      whereCondition[Op.or] = [
        {
          scheduled_date: {
            [Op.between]: [new Date(dateStart), new Date(dateEnd)]
          }
        },
        {
          opname_date: {
            [Op.between]: [new Date(dateStart), new Date(dateEnd)]
          }
        }
      ];
    } else if (dateStart) {
      whereCondition[Op.or] = [
        {
          scheduled_date: {
            [Op.gte]: new Date(dateStart)
          }
        },
        {
          opname_date: {
            [Op.gte]: new Date(dateStart)
          }
        }
      ];
    } else if (dateEnd) {
      whereCondition[Op.or] = [
        {
          scheduled_date: {
            [Op.lte]: new Date(dateEnd)
          }
        },
        {
          opname_date: {
            [Op.lte]: new Date(dateEnd)
          }
        }
      ];
    }

    // Set up pagination options - still maintain compatibility with frontend
    // by returning a flat array when noPagination=true (default)
    const paginationOptions = noPagination === 'false' ? {
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0
    } : {};
    
    // Split query to reduce load
    // First, get opnames with minimal fields
    console.log('Step 1: Executing optimized Opname query for IDs');
    const opnameIds = await Opname.findAll({
      attributes: ['opname_id'],
      where: whereCondition,
      order: [['scheduled_date', 'DESC']],
      ...paginationOptions,
      raw: true
    });
    
    const ids = opnameIds.map(o => o.opname_id);
    
    if (ids.length === 0) {
      console.log('No opnames found matching criteria');
      return res.json([]);
    }
    
    console.log(`Step 2: Fetching ${ids.length} full opname records`);
    
    // Then get full details for those IDs
    const opnames = await Opname.findAll({
      where: { 
        opname_id: { [Op.in]: ids } 
      },
      include: [
        {
          model: User,
          attributes: ['user_id', 'name', 'email', 'role'],
          required: false // Use LEFT JOIN for better performance
        },
        {
          model: BatchStock,
          required: false, // Use LEFT JOIN for better performance
          include: [{
            model: Product,
            attributes: ['code_product', 'name_product', 'code_categories'],
            required: false // Use LEFT JOIN for better performance
          }]
        }
      ],
      order: [['scheduled_date', 'DESC']],
      subQuery: false
    });
    
    console.log(`Query completed, processing ${opnames.length} records`);

    // Transform data more efficiently and maintain original format
    const transformedOpnames = opnames.map(opname => {
      // Use a direct conversion to JSON to improve performance
      const opnameJson = opname.toJSON();
      return {
        ...opnameJson,
        is_direct: !opnameJson.scheduled_date,
        // Track edit request status explicitly for frontend
        edit_requested: opnameJson.edit_requested || 
                       (opnameJson.notes && opnameJson.notes.includes('[REQUEST EDIT]'))
      };
    });

    // Log performance metrics
    const duration = Date.now() - startTime;
    console.log(`getAllOpnames completed in ${duration}ms`);
    if (duration > 1000) {
      console.warn(`⚠️ Slow query detected: getAllOpnames took ${duration}ms`);
    }
    
    // Return data in the original format the frontend expects
    // For backward compatibility with frontend, return a direct array
    res.json(transformedOpnames);
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error('Error fetching opnames:', err);
    console.error(`Query failed after ${duration}ms`);
    res.status(500).json({ error: "Failed to fetch opnames" });
  }
};

// Fungsi untuk memperbarui status otomatis (bisa dijalankan via cron)
export const autoSubmitOpnames = async () => {
  const currentDate = new Date().toISOString().split("T")[0];
  const opnames = await Opname.findAll({ where: { status: "scheduled" } });
  for (const opname of opnames) {
    if (currentDate >= opname.scheduled_date) {
      await opname.update({
        status: "submitted",
        opname_date: currentDate,
      });
    }
  }
};

// Individual opname submission by ID (for staff)
export const submitOpnameByID = async (req, res) => {
  const { id } = req.params;
  const { physical_stock, expired_stock, damaged_stock, notes } = req.body;
  const transaction = await db.transaction();

  try {
    // Find the specific opname
    const opname = await Opname.findByPk(id, { 
      include: [{ model: BatchStock }],
      transaction 
    });

    if (!opname) {
      await transaction.rollback();
      return res.status(404).json({ error: "Opname not found" });
    }

    // Check if user is authorized to submit this opname
    if (opname.user_id !== req.user.user_id) {
      await transaction.rollback();
      return res.status(403).json({ error: "Not authorized to submit this opname" });
    }

    // Check if opname can be edited (only scheduled can be edited)
    if (opname.status !== 'scheduled') {
      await transaction.rollback();
      return res.status(400).json({ error: "Opname cannot be modified" });
    }

    const currentDate = new Date().toISOString().split("T")[0];
    
    // Parse stock values
    const parsedPhysicalStock = parseInt(physical_stock) || 0;
    const parsedExpiredStock = parseInt(expired_stock) || 0;
    const parsedDamagedStock = parseInt(damaged_stock) || 0;
    
    // Validate expired + damaged stock
    const totalExpiredDamaged = parsedExpiredStock + parsedDamagedStock;
    
    // Allow totalExpiredDamaged to exceed physical_stock only if physical_stock is 0 (all stock expired case)
    if (totalExpiredDamaged > parsedPhysicalStock && parsedPhysicalStock > 0) {
      await transaction.rollback();
      return res.status(400).json({
        error: "The sum of expired and damaged stock cannot exceed physical stock"
      });
    }
    
    // Update the opname
    await opname.update({
      physical_stock: parsedPhysicalStock,
      expired_stock: parsedExpiredStock,
      damaged_stock: parsedDamagedStock,
      notes: notes || "",
      status: "submitted", // Simplified: direct to submitted
      opname_date: currentDate
    }, { transaction });

    await transaction.commit();
    res.json({
      message: "Opname submitted successfully",
      status: "submitted"
    });

  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to submit opname" });
  }
};

// Get staff opname history
export const getStaffOpnameHistory = async (req, res) => {
  try {
    const opnames = await Opname.findAll({
      where: { 
        user_id: req.user.user_id,
        status: ['submitted', 'adjusted']
      },
      include: [
        {
          model: BatchStock,
          include: [{ model: Product }]
        }
      ],
      order: [['opname_date', 'DESC'], ['createdAt', 'DESC']]
    });

    res.json(opnames);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch opname history" });
  }
};

// Get a single opname by ID
export const getOpnameById = async (req, res) => {
  const { id } = req.params;
  
  try {
    const opname = await Opname.findOne({
      where: { opname_id: id },
      include: [
        {
          model: BatchStock,
          include: [{ model: Product }]
        }
        // Remove User model for now as it seems to have schema issues
      ]
    });

    if (!opname) {
      return res.status(404).json({ error: "Opname not found" });
    }

    res.json(opname);
  } catch (err) {
    console.error("Error fetching opname by ID:", err);
    res.status(500).json({ error: "Failed to fetch opname details" });
  }
};

// Get detailed opname information with all related batches
export const getOpnameDetails = async (req, res) => {
  const { id } = req.params;
  
  try {
    console.log(`Fetching opname details for ID: ${id}`);
    
    // First get the opname record (simpler query)
    const opname = await Opname.findByPk(id);

    if (!opname) {
      return res.status(404).json({ error: "Opname not found" });
    }

    console.log(`Found opname:`, {
      id: opname.opname_id,
      batchId: opname.batch_id
    });

    // Get batch details separately
    let batchStock = null;
    let productCode = null;
    
    if (opname.batch_id) {
      batchStock = await BatchStock.findByPk(opname.batch_id, {
        include: [{ model: Product }]
      });
      
      if (batchStock && batchStock.product) {
        productCode = batchStock.product.code_product;
        console.log(`Found batch with product: ${productCode}`);
      } else if (batchStock) {
        productCode = batchStock.code_product;
        console.log(`Found batch, getting product by code: ${productCode}`);
        // Get product separately
        const product = await Product.findOne({
          where: { code_product: productCode }
        });
        if (product) {
          batchStock.product = product;
        }
      }
    }

    // If we have a product code, get all batches for that product
    if (productCode) {
      console.log(`Getting all batches for product: ${productCode}`);
      
      // Get all batches for this product with more detailed logging
      const allBatches = await BatchStock.findAll({
        where: { code_product: productCode },
        include: [{ model: Product }],
        order: [['batch_code', 'ASC']]
      });

      console.log(`Found ${allBatches.length} batches for product ${productCode}:`);
      allBatches.forEach((batch, index) => {
        console.log(`  Batch ${index + 1}:`, {
          id: batch.batch_id,
          code: batch.batch_code,
          stock: batch.stock_quantity,
          created: batch.createdAt,
          expired: batch.expired_date || batch.exp_date
        });
      });

      // Also check if there are batches with different criteria
      const allBatchesDebug = await BatchStock.findAll({
        where: {},
        include: [{ 
          model: Product,
          where: { code_product: productCode }
        }],
        order: [['batch_code', 'ASC']]
      });
      
      console.log(`Debug: Found ${allBatchesDebug.length} batches with different query for product ${productCode}`);

      // Return opname details with all related batches
      const response = {
        ...opname.toJSON(),
        batchStock: batchStock,
        allBatches: allBatches,
        totalSystemStock: allBatches.reduce((sum, batch) => sum + batch.stock_quantity, 0),
        batchCount: allBatches.length,
        debugInfo: {
          originalQuery: allBatches.length,
          alternativeQuery: allBatchesDebug.length,
          productCode: productCode
        }
      };

      console.log(`Returning response with ${response.batchCount} batches, total stock: ${response.totalSystemStock}`);
      return res.json(response);
    }

    console.log("No product found, returning basic opname data with batchStock");
    res.json({
      ...opname.toJSON(),
      batchStock: batchStock
    });
  } catch (err) {
    console.error("Error fetching opname details:", err);
    res.status(500).json({ error: "Failed to fetch opname details" });
  }
};

// Request edit for submitted opname
export const requestEdit = async (req, res) => {
  const { opname_id, reason } = req.body;

  try {
    const opname = await Opname.findOne({
      where: { 
        opname_id,
        user_id: req.user.user_id,
        status: 'submitted'
      }
    });

    if (!opname) {
      return res.status(404).json({ 
        error: "Opname tidak ditemukan atau tidak dalam status submitted" 
      });
    }

    // Check if already has a pending edit request
    if (opname.notes && opname.notes.includes('[REQUEST EDIT]')) {
      return res.status(400).json({
        error: "Already has a pending edit request",
        status: "edit_requested"
      });
    }

    // Add edit request to notes
    const editRequestNote = `[REQUEST EDIT]`;
    const updatedNotes = opname.notes 
      ? `${opname.notes}\n${editRequestNote}`
      : editRequestNote;

    await opname.update({
      notes: updatedNotes,
      // Add a new field to track edit request status
      edit_requested: true
    });

    console.log(`Staff ${req.user.user_id} requests edit for opname ${opname_id}: ${reason}`);

    res.json({ 
      message: "Permintaan edit berhasil dikirim ke admin",
      opname_id,
      requested_by: req.user.user_id,
      request_reason: reason,
      status: "edit_requested"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to request edit" });
  }
};

// Debug endpoint to check all batches for a product
export const debugProductBatches = async (req, res) => {
  const { productCode } = req.params;
  
  try {
    console.log(`Debug: Checking all batches for product: ${productCode}`);
    
    // Method 1: Direct query
    const batches1 = await BatchStock.findAll({
      where: { code_product: productCode },
      include: [{ model: Product }],
      order: [['batch_code', 'ASC']]
    });
    
    // Method 2: Query through Product association
    const batches2 = await BatchStock.findAll({
      include: [{ 
        model: Product,
        where: { code_product: productCode },
        required: true
      }],
      order: [['batch_code', 'ASC']]
    });
    
    // Method 3: Check all batches and filter
    const allBatches = await BatchStock.findAll({
      include: [{ model: Product }],
      order: [['batch_code', 'ASC']]
    });
    
    const filteredBatches = allBatches.filter(b => 
      b.product && b.product.code_product === productCode
    );
    
    console.log(`Method 1 (direct): ${batches1.length} batches`);
    console.log(`Method 2 (through Product): ${batches2.length} batches`);
    console.log(`Method 3 (filtered): ${filteredBatches.length} batches`);
    
    res.json({
      productCode,
      results: {
        method1: {
          count: batches1.length,
          batches: batches1.map(b => ({
            id: b.batch_id,
            code: b.batch_code,
            stock: b.stock_quantity,
            product: b.product?.code_product
          }))
        },
        method2: {
          count: batches2.length,
          batches: batches2.map(b => ({
            id: b.batch_id,
            code: b.batch_code,
            stock: b.stock_quantity,
            product: b.product?.code_product
          }))
        },
        method3: {
          count: filteredBatches.length,
          batches: filteredBatches.map(b => ({
            id: b.batch_id,
            code: b.batch_code,
            stock: b.stock_quantity,
            product: b.product?.code_product
          }))
        }
      }
    });
  } catch (err) {
    console.error("Error in debug:", err);
    res.status(500).json({ error: "Debug failed", details: err.message });
  }
};

export const debugOpnameData = async (req, res) => {
  try {
    console.log('=== DEBUG OPNAME DATA ===');
    
    // Get all opnames with detailed information
    const allOpnames = await Opname.findAll({
      include: [
        {
          model: BatchStock,
          as: 'batch_stock',
          include: [
            {
              model: Product,
              as: 'product',
              include: [
                {
                  model: Categories,
                  as: 'category',
                  attributes: ['code_categories', 'name_categories']
                }
              ]
            }
          ]
        },
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'name']
        }
      ],
      order: [['scheduled_date', 'DESC'], ['opname_date', 'DESC']]
    });

    console.log(`Total opnames in database: ${allOpnames.length}`);

    // Group by status and category
    const statusCount = {};
    const categoryStatus = {};
    
    allOpnames.forEach(opname => {
      // Count by status
      if (!statusCount[opname.status]) {
        statusCount[opname.status] = 0;
      }
      statusCount[opname.status]++;
      
      // Count by category and status
      const categoryCode = opname.batch_stock?.product?.code_categories;
      if (categoryCode) {
        if (!categoryStatus[categoryCode]) {
          categoryStatus[categoryCode] = {
            category_name: opname.batch_stock?.product?.category?.name_categories || categoryCode,
            scheduled: 0,
            submitted: 0,
            adjusted: 0,
            total: 0
          };
        }
        if (opname.status === 'scheduled') categoryStatus[categoryCode].scheduled++;
        if (opname.status === 'submitted') categoryStatus[categoryCode].submitted++;
        if (opname.status === 'adjusted') categoryStatus[categoryCode].adjusted++;
        categoryStatus[categoryCode].total++;
      }
    });

    // Find specifically AIR category opnames
    const airOpnames = allOpnames.filter(opname => 
      opname.batch_stock?.product?.code_categories === 'AIR'
    );

    console.log('AIR category opnames:', airOpnames.length);
    airOpnames.forEach(opname => {
      console.log(`- Opname ID: ${opname.opname_id}, Status: ${opname.status}, User: ${opname.user?.name}, Date: ${opname.scheduled_date || opname.opname_date}`);
    });

    res.json({
      summary: {
        total_opnames: allOpnames.length,
        status_breakdown: statusCount,
        category_breakdown: categoryStatus
      },
      air_category_details: airOpnames.map(opname => ({
        opname_id: opname.opname_id,
        status: opname.status,
        user: opname.user?.name,
        scheduled_date: opname.scheduled_date,
        opname_date: opname.opname_date,
        product_code: opname.batch_stock?.product?.code_product,
        category: opname.batch_stock?.product?.code_categories
      })),
      recent_opnames: allOpnames.slice(0, 10).map(opname => ({
        opname_id: opname.opname_id,
        status: opname.status,
        user: opname.user?.name,
        scheduled_date: opname.scheduled_date,
        opname_date: opname.opname_date,
        category: opname.batch_stock?.product?.code_categories,
        category_name: opname.batch_stock?.product?.category?.name_categories
      }))
    });

  } catch (err) {
    console.error("Error in debug opname data:", err);
    res.status(500).json({ error: "Debug failed", details: err.message });
  }
};

export const checkCategoryConflict = async (req, res) => {
  try {
    const { categories, scheduled_date, assigned_user_id } = req.body;

    console.log('=== CATEGORY CONFLICT CHECK ===');
    console.log('Input:', { categories, scheduled_date, assigned_user_id });

    if (!categories || !Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({ error: "Categories array is required" });
    }

    if (!scheduled_date) {
      return res.status(400).json({ error: "Scheduled date is required" });
    }

    if (!assigned_user_id) {
      return res.status(400).json({ error: "Assigned user ID is required" });
    }

    // First, let's see all opnames with the categories we're checking
    const allOpnamesInCategories = await Opname.findAll({
      include: [
        {
          model: BatchStock,
          as: 'batch_stock',
          include: [
            {
              model: Product,
              as: 'product',
              where: {
                code_categories: {
                  [Op.in]: categories
                }
              },
              include: [
                {
                  model: Categories,
                  as: 'category',
                  attributes: ['name_categories']
                }
              ]
            }
          ]
        },
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'name']
        }
      ]
    });

    console.log(`Total opnames found in categories [${categories.join(', ')}]:`, allOpnamesInCategories.length);
    
    // Check for existing opnames in the same categories that are not completed (adjusted)
    const conflictingOpnames = allOpnamesInCategories.filter(opname => 
      opname.status === 'scheduled' || opname.status === 'submitted'
    );

    console.log('Conflicting opnames (not adjusted):', conflictingOpnames.length);
    
    // Log details of conflicting opnames
    conflictingOpnames.forEach((opname, index) => {
      console.log(`Conflict ${index + 1}:`, {
        opname_id: opname.opname_id,
        status: opname.status,
        scheduled_date: opname.scheduled_date,
        user: opname.user?.name,
        category: opname.batch_stock?.product?.code_categories,
        category_name: opname.batch_stock?.product?.category?.name_categories
      });
    });

    if (conflictingOpnames.length > 0) {
      // Group conflicts by category
      const conflicts = {};
      
      conflictingOpnames.forEach(opname => {
        const categoryCode = opname.batch_stock?.product?.code_categories;
        const categoryName = opname.batch_stock?.product?.category?.name_categories || categoryCode;
        const userName = opname.user?.name || 'Unknown User';
        const scheduledDate = opname.scheduled_date;
        
        if (categoryCode && categories.includes(categoryCode)) {
          if (!conflicts[categoryCode]) {
            conflicts[categoryCode] = {
              category_code: categoryCode,
              category_name: categoryName,
              users: new Set(),
              pending_count: 0,
              scheduled_dates: new Set()
            };
          }
          conflicts[categoryCode].users.add(userName);
          conflicts[categoryCode].pending_count++;
          if (scheduledDate) {
            conflicts[categoryCode].scheduled_dates.add(scheduledDate);
          }
        }
      });

      const conflictArray = Object.values(conflicts).map(conflict => ({
        ...conflict,
        users: Array.from(conflict.users),
        scheduled_dates: Array.from(conflict.scheduled_dates)
      }));
      
      console.log('Final conflict array:', conflictArray);
      
      if (conflictArray.length > 0) {
        const conflictDetails = conflictArray.map(conflict => {
          const userList = conflict.users.join(', ');
          const dateList = conflict.scheduled_dates.length > 0 ? 
            ` (scheduled: ${conflict.scheduled_dates.join(', ')})` : '';
          return `${conflict.category_name} - assigned to: ${userList}${dateList}, ${conflict.pending_count} pending items`;
        }).join('; ');

        console.log('Returning conflict response with details:', conflictDetails);
        return res.status(409).json({
          hasConflict: true,
          conflicts: conflictArray,
          error: `Cannot assign categories that are already scheduled but not completed. Conflicting categories: ${conflictDetails}. Please wait until all items in these categories are marked as 'adjusted' or choose different categories.`
        });
      }
    }

    // No conflicts found
    console.log('No conflicts found - safe to proceed');
    res.json({
      hasConflict: false,
      message: "No category conflicts found"
    });

  } catch (err) {
    console.error("Error checking category conflict:", err);
    res.status(500).json({ error: "Failed to check category conflict", details: err.message });
  }
};