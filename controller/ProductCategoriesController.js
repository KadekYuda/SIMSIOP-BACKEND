import { Op, Sequelize } from "sequelize";
import fs from "fs";
import path from "path";
import multer from "multer";
import { parse } from "csv-parse";
import Product from "../models/ProductModel.js";
import Categories from "../models/CategoriesModel.js";
import BatchStock from "../models/BatchstockModel.js";



// set up multer for file upload

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = "./uploads";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

export const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype !== "text/csv") {
      return cb(new Error("Only CSV files are allowed"));
    }
    cb(null, true);
  },
});




export const importProductsFromCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "File not found" });
    }

    const errors = [];
    let csvColumns = [];
    let processedCount = 0;
    let successCount = 0;
    const BATCH_SIZE = 100; // Increased batch size for better performance
    const startTime = Date.now();

    console.log('Starting import process...');

    // Siapkan cache untuk kategori
    const categoryCache = new Map();
    
    // Kumpulkan semua data dari CSV terlebih dahulu
    const allRows = [];
    
    // Baca file CSV dan simpan semua data
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(parse({
          delimiter: ",",
          columns: (header) => {
            csvColumns = header.map(h => h.trim());            console.log('CSV columns detected:', csvColumns);
            
            if (!csvColumns.includes('KdBar')) {
              console.error('KdBar column not found in CSV');
              reject(new Error('Invalid CSV format: KdBar column not found'));
              return false;
            }
            return csvColumns;
          },
          trim: true,
          relax_column_count: true,
          skip_empty_lines: true
        }))
        .on("data", (row) => {
          allRows.push(row); // Simpan semua baris untuk diproses nanti
        })
        .on("error", (error) => {
          console.error('Error parsing CSV:', error);
          reject(error);
        })
        .on("end", () => {          console.log(`CSV file read: ${allRows.length} rows`);
          resolve();
        });
    });
    
    // Hapus file setelah dibaca
    if (req.file) fs.unlinkSync(req.file.path);
    
    // Proses semua kategori terlebih dahulu
    const uniqueCategories = new Set();
    
    // Transformasi data
    const transformedRows = [];
    // Store row indices with errors - removing the unused collection warning
    const validationErrors = new Set(); 
    
    // Improved cleanCodeField function to handle leading apostrophes
    const cleanCodeField = (value, fieldName) => {
      if (value === null || value === undefined) return null;
      let strVal = String(value).trim();
      
      // Remove leading apostrophe if present
      if (strVal.startsWith("'")) {
        strVal = strVal.substring(1);
      }

      // Handle scientific notation
      if (/^\d+(\.\d+)?[eE]\+?\d+$/.test(strVal)) {
        try {
          return BigInt(Number(strVal)).toString();
        } catch {
          // Cara manual jika BigInt gagal
          const parts = strVal.toLowerCase().split('e');
          const base = parseFloat(parts[0]);
          const exponent = parseInt(parts[1].replace('+', ''));
          const baseStr = base.toString().replace('.', '');
          const zeros = exponent - (baseStr.length - base.toString().indexOf('.') + 1);
          return baseStr + '0'.repeat(Math.max(0, zeros));
        }
      }

      return strVal;
    };
    
    for (const row of allRows) {
      processedCount++;
      
      try {
        const codeProduct = cleanCodeField(row.KdBar, 'code_product');
        
        const transformedRow = {
          code_product: codeProduct,
          barcode: cleanCodeField(row.Barcode, 'barcode'),
          name_product: row.Nmbar?.trim() || null,
          code_categories: row.KdKel?.trim() || null,
          name_categories: row.NmKel?.trim() || null,
          sell_price: parseFloat((row.HJual || '0').toString().replace(',', '.')) || 0.0,
          min_stock: Math.floor(Math.random() * 10) + 1,
          purchase_price: parseFloat((row.HBeli || '0').toString().replace(',', '.')) || 0.0,
          initial_stock: parseInt(row.StAwal || '0') || 0,
          stock_quantity: parseInt(row.StMasuk || '0') + parseInt(row.StAwal || '0'),
        };

        // Validasi field wajib
        if (!transformedRow.code_product) {
          errors.push({
            row: processedCount,            code_product: row.KdBar,
            error: `Row ${processedCount}: Product code is required`
          });
          validationErrors.add(processedCount); // Using validationErrors instead of errorRows
          continue; // Skip this row
        }

        transformedRows.push(transformedRow);
        
        // Kumpulkan kategori unik
        if (transformedRow.code_categories) {
          uniqueCategories.add(transformedRow.code_categories);
        }
      } catch (error) {
        console.error(`Error transformasi data baris ${processedCount}:`, error);
        errors.push({ 
          row: processedCount,
          code_product: row.KdBar,
          error: `Error transforming row ${processedCount}: ${error.message}` 
        });
        validationErrors.add(processedCount); // Using validationErrors instead of errorRows
      }
    }
    
    // Actually using the Set we created to provide statistics    console.log(`Total rows with validation errors: ${validationErrors.size}`);
    
    // Process all categories at once (single DB operation)
    console.log(`Processing ${uniqueCategories.size} unique categories...`);
    try {
      // Cari kategori yang sudah ada
      const existingCategories = await Categories.findAll({
        where: {
          code_categories: {
            [Op.in]: Array.from(uniqueCategories)
          }
        }
      });
      
      // Tambahkan ke cache
      existingCategories.forEach(category => {
        categoryCache.set(category.code_categories, category);
      });
      
      // Buat kategori yang belum ada
      const categoriesToCreate = [];
      const now = new Date();
      
      for (const catCode of uniqueCategories) {
        if (!categoryCache.has(catCode)) {
          const catRow = transformedRows.find(row => row.code_categories === catCode);
          if (catRow) {
            categoriesToCreate.push({
              code_categories: catCode,
              name_categories: catRow.name_categories,
              created_at: now,
              updated_at: now,
            });
          }
        }
      }
      
      if (categoriesToCreate.length > 0) {        console.log(`Creating ${categoriesToCreate.length} new categories...`);
        const createdCategories = await Categories.bulkCreate(categoriesToCreate);
        createdCategories.forEach(category => {
          categoryCache.set(category.code_categories, category);
        });
      }
    } catch (error) {
      console.error('Error while processing categories:', error);
      errors.push({
        error: `Error while processing categories: ${error.message}`
      });
      // Lanjutkan meski ada error kategori
    }
    
    // Buat lookup produk yang sudah ada (single DB operation)
    const allProductCodes = transformedRows.map(row => row.code_product);
    const existingProductMap = new Map();
    
    try {
      const existingProducts = await Product.findAll({
        where: {
          code_product: {
            [Op.in]: allProductCodes
          }
        }
      });
      
      existingProducts.forEach(product => {
        existingProductMap.set(product.code_product, product);
      });
        console.log(`Found ${existingProducts.length} existing products`);
    } catch (error) {
      console.error('Error while searching for existing products:', error);
      errors.push({
        error: `Error while searching for existing products: ${error.message}`
      });
      // Continue despite error
    }
    
    // Dapatkan hitungan batch untuk semua produk sekaligus
    const batchCountMap = new Map();
    
    try {
      // Dapatkan hitungan batch untuk semua produk sekaligus
      const batches = await BatchStock.findAll({
        attributes: ['code_product', 'batch_code'],
        where: {
          code_product: {
            [Op.in]: allProductCodes
          }
        }
      });
      
      // Hitung jumlah batch untuk setiap produk
      batches.forEach(batch => {
        const count = batchCountMap.get(batch.code_product) || 0;
        batchCountMap.set(batch.code_product, count + 1);
      });
        console.log(`Getting batch information for ${batchCountMap.size} products`);
    } catch (error) {
      console.error('Error while getting batch data:', error);
      errors.push({
        error: `Error while getting batch data: ${error.message}`
      });
      // Lanjutkan meski ada error
    }
    
    // Proses data dalam batch yang lebih kecil
    const now = new Date();
    
    // Track products that were successfully created
    const successfulProducts = new Map(); // Changed to Map to store both product and its creation status
      // First pass: Create or update all products
    console.log(`Processing ${transformedRows.length} products...`);
    
    // Optimize by doing bulk operations where possible
    const productsToCreate = [];
    
    for (const row of transformedRows) {
      // Prepare basic product object
      const productData = {
        ...row,
        code_categories: row.code_categories || null,
        created_at: now,
        updated_at: now,
      };
      
      // Cek apakah produk sudah ada
      if (!existingProductMap.has(row.code_product)) {
        productsToCreate.push(productData);
      } else {
        // Mark as successful for existing products
        successfulProducts.set(row.code_product, { 
          isNew: false, 
          data: row 
        });
      }
    }
    
    // Create all new products in one bulk operation if possible
    if (productsToCreate.length > 0) {
      try {        console.log(`Attempting to create ${productsToCreate.length} new products in bulk operation`);
        const createdProducts = await Product.bulkCreate(productsToCreate);
        
        // Mark successfully created products
        createdProducts.forEach(product => {
          const rowData = transformedRows.find(r => r.code_product === product.code_product);
          successfulProducts.set(product.code_product, {
            isNew: true,
            data: rowData
          });
        });
        
        console.log(`Successfully created ${createdProducts.length} new products`);
      } catch (bulkError) {
        console.error(`Bulk create failed, falling back to individual creates:`, bulkError);
        
        // Try creating products individually
        for (const product of productsToCreate) {
          try {
            await Product.create(product);
            const rowData = transformedRows.find(r => r.code_product === product.code_product);
            successfulProducts.set(product.code_product, {
              isNew: true,
              data: rowData
            });
          } catch (individualError) {
            console.error(`Error creating product ${product.code_product}:`, individualError);
            errors.push({
              code_product: product.code_product,
              error: `Error creating product: ${individualError.message}`
            });
          }
        }
      }
    }
     // Calculate duplicate count and handle existing products
    const duplicateCount = transformedRows.filter(row => 
      existingProductMap.has(row.code_product)
    ).length;
    console.log(`Found ${duplicateCount} duplicate products`);

    // Update existing products in batches
    const productsToUpdate = transformedRows.filter(row => 
      existingProductMap.has(row.code_product) && 
      !successfulProducts.has(row.code_product)
    );
      if (productsToUpdate.length > 0) {
      console.log(`Updating ${productsToUpdate.length} existing products`);
      
      for (let i = 0; i < productsToUpdate.length; i += BATCH_SIZE) {
        const batch = productsToUpdate.slice(i, i + BATCH_SIZE);
        
        // Process updates in parallel for better performance
        await Promise.all(batch.map(async (product) => {
          try {
            await Product.update(
              { 
                barcode: product.barcode,
                name_product: product.name_product,
                code_categories: product.code_categories,
                sell_price: product.sell_price,
                min_stock: product.min_stock,
                updated_at: now
              },
              { where: { code_product: product.code_product } }
            );
            
            successfulProducts.set(product.code_product, {
              isNew: false,
              data: product
            });
          } catch (updateError) {
            console.error(`Error updating product ${product.code_product}:`, updateError);
            errors.push({
              code_product: product.code_product,
              error: `Error updating product: ${updateError.message}`
            });
          }
        }));
        
        console.log(`Updated batch ${Math.floor(i/BATCH_SIZE) + 1} of ${Math.ceil(productsToUpdate.length/BATCH_SIZE)}`);
      }
    }
    
    // Helper functions for date generation
    const getRandomArrivalDate = () => {
      const now = new Date();
      // Random date between 1 year ago and today
      const startDate = new Date(now);
      startDate.setFullYear(startDate.getFullYear() - 1); // 1 year ago
      
      // Get random timestamp between start date and now
      const randomTimestamp = startDate.getTime() + Math.random() * (now.getTime() - startDate.getTime());
      return new Date(randomTimestamp);
    };

    const getRandomExpDate = (arrivalDate) => {
      const expDate = new Date(arrivalDate);
      // Random between 3-12 months after arrival
      const randomMonths = Math.floor(Math.random() * 10) + 3;
      expDate.setMonth(expDate.getMonth() + randomMonths);
      return expDate;
    };
    
    // Second pass: Create batch stocks for successfully created/updated products
    console.log(`Creating batch stocks for ${successfulProducts.size} products`);
    
    const batchStocksToCreate = [];
    
    // Get existing batch codes to prevent duplicates
    const existingBatchCodes = new Set();
    try {
        const existingBatches = await BatchStock.findAll({
            attributes: ['batch_code'],
            where: {
                code_product: {
                    [Op.in]: Array.from(successfulProducts.keys())
                }
            }
        });
        existingBatches.forEach(batch => {
            existingBatchCodes.add(batch.batch_code);
        });
    } catch (error) {
        console.error('Error fetching existing batch codes:', error);
    }
    
    // Prepare all batch stocks
    for (const [code_product, productInfo] of successfulProducts.entries()) {
        try {
            const row = productInfo.data;
            const productNameClean = (row.name_product || code_product)
                .trim()
                .replace(/[^a-zA-Z0-9 ]/g, '');
            
            // Only create new batch if one doesn't exist with same code and product
            const batch_code = `${productNameClean}-001`;
            
            if (!existingBatchCodes.has(batch_code)) {
                const arrivalDate = getRandomArrivalDate();
                const expDate = getRandomExpDate(arrivalDate);
                
                batchStocksToCreate.push({
                    code_product,
                    batch_code,
                    purchase_price: row.purchase_price,
                    initial_stock: row.initial_stock,
                    stock_quantity: row.stock_quantity,
                    arrival_date: arrivalDate,
                    exp_date: expDate,
                    created_at: now,
                    updated_at: now,
                });
            } else {
                // Update existing batch stock instead of creating new one
                await BatchStock.update(
                    {
                        stock_quantity: row.stock_quantity,
                        updated_at: now
                    },
                    {
                        where: { 
                            code_product,
                            batch_code
                        }
                    }
                );
            }
        } catch (error) {
            console.error(`Error preparing batch stock for ${code_product}:`, error);
            errors.push({
                code_product,
                error: `Error preparing batch stock: ${error.message}`
            });
        }
    }
    
    // Create batch stocks in larger chunks
    const BATCH_STOCK_CHUNK_SIZE = 100; // Increased for better performance
    
    if (batchStocksToCreate.length > 0) {
      console.log(`Creating ${batchStocksToCreate.length} batch stocks in chunks of ${BATCH_STOCK_CHUNK_SIZE}`);
      
      let batchStockSuccessCount = 0;
      
      for (let i = 0; i < batchStocksToCreate.length; i += BATCH_STOCK_CHUNK_SIZE) {
        const batchStockChunk = batchStocksToCreate.slice(i, i + BATCH_STOCK_CHUNK_SIZE);
          
        try {
          const createdBatchStocks = await BatchStock.bulkCreate(batchStockChunk);
          batchStockSuccessCount += createdBatchStocks.length;
          
          console.log(`Created chunk ${Math.floor(i/BATCH_STOCK_CHUNK_SIZE) + 1}/${Math.ceil(batchStocksToCreate.length/BATCH_STOCK_CHUNK_SIZE)}: ${createdBatchStocks.length} batch stocks`);
        } catch (chunkError) {
          console.error(`Bulk batch stock creation failed, trying individually:`, chunkError);
          
          // Try individually if bulk fails
          for (const stock of batchStockChunk) {
            try {
              await BatchStock.create(stock);
              batchStockSuccessCount++;
            } catch (singleError) {
              console.error(`Error creating batch stock for ${stock.code_product}:`, singleError);
              errors.push({
                code_product: stock.code_product,
                error: `Error creating batch stock: ${singleError.message}`
              });
            }
          }
        }
      }
      
      console.log(`Successfully created ${batchStockSuccessCount}/${batchStocksToCreate.length} batch stocks`);
    }

    const elapsed = (Date.now() - startTime) / 1000;
    
    // Final counts
    successCount = successfulProducts.size;
    
    console.log(`Import process completed in ${elapsed.toFixed(2)} seconds`);
    console.log(`Total data processed: ${processedCount}, Successful: ${successCount}, Error: ${errors.length}`);
    
    // Add validation errors count to the response
    res.json({
      message: `Import completed: ${successCount} successful out of ${processedCount} total data with ${errors.length} errors`,
      total_data: processedCount,
      success_count: successCount,
      error_count: errors.length,
      validation_errors: validationErrors.size,
      batch_stock_count: batchStocksToCreate.length,      elapsed_time: `${elapsed.toFixed(2)} seconds`,
      errors: errors.length > 0 ? errors.slice(0, 20) : null,
    });

  } catch (error) {
    console.error('Main error:', error);
    res.status(500).json({ 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    });
  }
};

// Get all products
export const getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 2500; 
    const search = req.query.search || "";
    const category = req.query.category || "";

    const offset = limit * page;

    // Base where condition
    const whereCondition = {
      [Op.or]: [
        { code_product: { [Op.like]: `%${search}%` } },
        { name_product: { [Op.like]: `%${search}%` } },
        { barcode: { [Op.like]: `%${search}%` } },
      ],
      deleted_at: null,
    };

    // Add category filter if provided and not "all"
    if (category && category !== "all") {
      whereCondition.code_categories = category;
    }

    // Get total count first
    const totalCount = await Product.count({
      where: whereCondition,
      distinct: true,
      include: [
        {
          model: Categories,
          attributes: ["code_categories", "name_categories"],
        },
      ],
    });

    // Get paginated products
    const products = await Product.findAll({
      where: whereCondition,
      include: [
        {
          model: Categories,
          attributes: ["code_categories", "name_categories"],
        },
      ],
      offset: offset,
      limit: limit,
      order: [["name_product", "ASC"]],
      distinct: true,
    });

    // Get batch stocks for products
    const productCodes = products.map(p => p.code_product);
    const batchStocks = await BatchStock.findAll({
      where: {
        code_product: {
          [Op.in]: productCodes
        }
      },
      attributes: ['code_product', 'initial_stock', 'stock_quantity']
    });

    // Calculate total stock for each product
    const stockMap = {};
    const initialStockMap = {};
    batchStocks.forEach(batch => {
      const codeProduct = batch.code_product;
      if (!stockMap[codeProduct]) {
        stockMap[codeProduct] = 0;
        initialStockMap[codeProduct] = 0;
      }      // Add stock_quantity to total stock
      stockMap[codeProduct] += parseInt(batch.stock_quantity || 0);
    });

    // Add total stock to products
    const productsWithStock = products.map(product => {
      const plainProduct = product.get({ plain: true });
      // Use total from stock_quantity only
      const totalStock = stockMap[plainProduct.code_product] || 0;
      const minStock = plainProduct.min_stock || 0;

      if (plainProduct.code_product) {
        plainProduct.code_product = String(plainProduct.code_product);
      }
      if (plainProduct.barcode) {
        plainProduct.barcode = String(plainProduct.barcode);
      }

      return {
        ...plainProduct,
        totalStock: totalStock,
        stock_status: totalStock <= minStock ? 'danger' : totalStock <= minStock + 5 ? 'warning' : 'success'
      };
    });

    res.json({
      result: productsWithStock,
      page: page,
      limit: limit,
      totalRows: totalCount,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    console.error('Error in getProducts:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get product by ID
export const getProductById = async (req, res) => {
  try {
    const product = await Product.findOne({
      where: {
        code_product: req.params.code_product,
        deleted_at: null,
      },
      include: [
        {
          model: Categories,
          attributes: ["code_categories", "name_categories"],
        },
      ],
    });

    if (!product) { 
      return res.status(404).json({ message: "Product not found" });
    }

    // Convert code_product and barcode to string if needed
    const plainProduct = product.get({ plain: true });
    
    if (plainProduct.code_product) {
      plainProduct.code_product = String(plainProduct.code_product);
    }
    
    if (plainProduct.barcode) {
      plainProduct.barcode = String(plainProduct.barcode);
    }

    res.json(plainProduct);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create a new product
export const createProduct = async (req, res) => {
  try {
    // Check if categories exists
    if (req.body.code_categories) {
      const category = await Categories.findByPk(req.body.code_categories);
      if (!category) {
        return res.status(400).json({ message: "Category does not exist" });
      }
    }

    // Check if product already exists
    const existingProduct = await Product.findByPk(req.body.code_product);
    if (existingProduct) {
      return res.status(400).json({ message: "Product with this code already exists" });
    }

    // Set timestamps
    const now = new Date();
    req.body.created_at = now;
    req.body.updated_at = now;

    const product = await Product.create(req.body);
    res.status(201).json({
      message: "Product created successfully",
      data: product,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update product
export const updateProduct = async (req, res) => {
  try {
    const product = await Product.findOne({
      where: {
        code_product: req.params.code_product,
        deleted_at: null,
      },
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // If category is changed, check if new category exists
    if (req.body.code_categories && req.body.code_categories !== product.code_categories) {
      const category = await Categories.findByPk(req.body.code_categories);
      if (!category) {
        return res.status(400).json({ message: "Category does not exist" });
      }
    }

    // Set updated timestamp
    req.body.updated_at = new Date();

    await Product.update(req.body, {
      where: {
        code_product: req.params.code_product,
      },
    });

    res.json({
      message: "Product updated successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Soft delete product
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findOne({
      where: {
        code_product: req.params.code_product,
        deleted_at: null,
      },
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    await Product.update(
      { deleted_at: new Date() },
      { where: { code_product: req.params.code_product } }
    );

    res.json({
      message: "Product deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all categories
export const getCategories = async (req, res) => {
  try {
    const categories = await Categories.findAll({
      attributes: ["code_categories", "name_categories"],
      where: {
        deleted_at: null,
      },
    });

    res.json({
      result: categories,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get category by ID
export const getCategoryById = async (req, res) => {
  try {
    const category = await Categories.findOne({
      where: {
        code_categories: req.params.code_categories,
        deleted_at: null,
      },
    });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create a new category
export const createCategory = async (req, res) => {
  try {
    // Check if category already exists
    const existingCategory = await Categories.findByPk(req.body.code_categories);
    if (existingCategory) {
      return res.status(400).json({ message: "Category with this code already exists" });
    }

    // Set timestamps
    const now = new Date();
    req.body.created_at = now;
    req.body.updated_at = now;

    const category = await Categories.create(req.body);
    res.status(201).json({
      message: "Category created successfully",
      data: category,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update category
export const updateCategory = async (req, res) => {
  try {
    const category = await Categories.findOne({
      where: {
        code_categories: req.params.code_categories,
        deleted_at: null,
      },
    });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Set updated timestamp
    req.body.updated_at = new Date();

    await Categories.update(req.body, {
      where: {
        code_categories: req.params.code_categories,
      },
    });

    res.json({
      message: "Category updated successfully",
    });
  } catch (error) {
    res.status (500).json({ message: error.message });
  }
};

// Soft delete category
export const deleteCategory = async (req, res) => {
  try {
    const category = await Categories.findOne({
      where: {
        code_categories: req.params.code_categories,
        deleted_at: null,
      },
    });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    await Categories.update(
      { deleted_at: new Date() },
      { where: { code_categories: req.params.code_categories } }
    );

    res.json({
      message: "Category deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};