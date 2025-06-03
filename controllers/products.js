import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"
import { IncomingForm } from "formidable"
import seedDatabase from "../scripts/seed-db.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Get all products
export const getProducts = async (req, res) => {
  try {
    let products = []
    const db = await seedDatabase()

    if (db) {
      const [dbProducts] = await db.execute("SELECT * FROM products ORDER BY created_at DESC")
      products = dbProducts
    } else {
      const data = fs.readFileSync(path.join(__dirname, "..", "data.json"), "utf-8")
      products = JSON.parse(data)
    }

    res.json(products)
  } catch (error) {
    console.error("Error fetching products:", error)
    res.status(500).json({ error: "Error fetching products" })
  }
}

// Get single product by ID
export const getProduct = async (req, res) => {
  try {
    const { id } = req.params
    let product = null
    const db = await connectToDatabase()

    if (db) {
      const [rows] = await db.execute("SELECT * FROM products WHERE id = ?", [id])
      product = rows[0]
    } else {
      const data = fs.readFileSync(path.join(__dirname, "..", "data.json"), "utf-8")
      const products = JSON.parse(data)
      product = products[id]
    }

    if (!product) {
      return res.status(404).json({ error: "Product not found" })
    }

    res.json(product)
  } catch (error) {
    console.error("Error fetching product:", error)
    res.status(500).json({ error: "Error fetching product" })
  }
}

// Create new product
export const createProduct = async (req, res) => {
  try {
    const db = await connectToDatabase()

    if (!db) {
      return res.status(500).json({ error: "Database not available" })
    }

    const form = new IncomingForm({
      uploadDir: path.join(__dirname, "..", "public", "images"),
      keepExtensions: true,
    })

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error("Error parsing form:", err)
        return res.status(500).json({ error: "Error processing form" })
      }

      try {
        // Handle image upload
        let imageUrl = "https://via.placeholder.com/800x600?text=Product+Image"

        if (files.image && files.image[0]) {
          const fileName = path.basename(files.image[0].filepath)
          imageUrl = `/images/${fileName}`
        }

        // Insert new product into MySQL
        const [result] = await db.execute(
          `INSERT INTO products (productName, \`from\`, nutrients, quantity, price, energySavings, description, eco, image)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            fields.productName[0],
            fields.from[0],
            fields.nutrients[0],
            fields.quantity[0],
            Number.parseFloat(fields.price[0]),
            fields.energySavings[0],
            fields.description[0],
            fields.eco[0] === "true",
            imageUrl,
          ],
        )

        // Check if this is an API request or form submission
        const isApiRequest = req.get("Accept") === "application/json"

        if (isApiRequest) {
          res.status(201).json({
            success: true,
            message: "Product added successfully",
            productId: result.insertId,
          })
        } else {
          // Redirect for form submissions
          res.redirect("/")
        }
      } catch (error) {
        console.error("Error adding product:", error)
        res.status(500).json({ error: "Error adding product" })
      }
    })
  } catch (error) {
    console.error("API error:", error)
    res.status(500).json({ error: "Internal Server Error" })
  }
}

// Update product
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params
    const db = await connectToDatabase()

    if (!db) {
      return res.status(500).json({ error: "Database not available" })
    }

    // Check if product exists
    const [rows] = await db.execute("SELECT * FROM products WHERE id = ?", [id])
    if (rows.length === 0) {
      return res.status(404).json({ error: "Product not found" })
    }

    const form = new IncomingForm({
      uploadDir: path.join(__dirname, "..", "public", "images"),
      keepExtensions: true,
    })

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error("Error parsing form:", err)
        return res.status(500).json({ error: "Error processing form" })
      }

      try {
        // Handle image upload
        let imageUrl = rows[0].image // Keep existing image by default

        if (files.image && files.image[0]) {
          const fileName = path.basename(files.image[0].filepath)
          imageUrl = `/images/${fileName}`
        }

        // Update product in MySQL
        await db.execute(
          `UPDATE products 
           SET productName = ?, \`from\` = ?, nutrients = ?, quantity = ?, 
               price = ?, energySavings = ?, description = ?, eco = ?, image = ?
           WHERE id = ?`,
          [
            fields.productName[0],
            fields.from[0],
            fields.nutrients[0],
            fields.quantity[0],
            Number.parseFloat(fields.price[0]),
            fields.energySavings[0],
            fields.description[0],
            fields.eco[0] === "true",
            imageUrl,
            id,
          ],
        )

        res.json({
          success: true,
          message: "Product updated successfully",
        })
      } catch (error) {
        console.error("Error updating product:", error)
        res.status(500).json({ error: "Error updating product" })
      }
    })
  } catch (error) {
    console.error("API error:", error)
    res.status(500).json({ error: "Internal Server Error" })
  }
}

// Delete product
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params
    const db = await connectToDatabase()

    if (!db) {
      return res.status(500).json({ error: "Database not available" })
    }

    // Check if product exists
    const [rows] = await db.execute("SELECT * FROM products WHERE id = ?", [id])
    if (rows.length === 0) {
      return res.status(404).json({ error: "Product not found" })
    }

    // Delete product from MySQL
    await db.execute("DELETE FROM products WHERE id = ?", [id])

    res.json({
      success: true,
      message: "Product deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting product:", error)
    res.status(500).json({ error: "Error deleting product" })
  }
}

// Search products
export const searchProducts = async (req, res) => {
  try {
    const { query } = req.query
    const db = await connectToDatabase()

    if (!db) {
      return res.status(500).json({ error: "Database not available" })
    }

    const [products] = await db.execute(
      `SELECT * FROM products 
       WHERE productName LIKE ? OR description LIKE ? OR \`from\` LIKE ?
       ORDER BY created_at DESC`,
      [`%${query}%`, `%${query}%`, `%${query}%`],
    )

    res.json(products)
  } catch (error) {
    console.error("Error searching products:", error)
    res.status(500).json({ error: "Error searching products" })
  }
}
