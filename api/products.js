import mysql from "mysql2/promise"
import formidable from "formidable"
import { v4 as uuidv4 } from "uuid"

// Disable body parsing, we'll handle it with formidable
export const config = {
  api: {
    bodyParser: false,
  },
}

// MySQL Connection
let connection = null

async function connectToDatabase() {
  if (connection) {
    return connection
  }

  try {
    connection = await mysql.createConnection(process.env.DATABASE_URL)

    // Create products table if it doesn't exist
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        productName VARCHAR(255) NOT NULL,
        \`from\` VARCHAR(255) NOT NULL,
        nutrients TEXT NOT NULL,
        quantity VARCHAR(255) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        energySavings VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        eco BOOLEAN DEFAULT TRUE,
        image VARCHAR(500) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    return connection
  } catch (error) {
    console.error("Database connection error:", error)
    throw error
  }
}

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  try {
    // Connect to MySQL
    const db = await connectToDatabase()

    // Parse form with formidable
    const form = new formidable.IncomingForm()

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error("Error parsing form:", err)
        res.status(500).json({ error: "Error processing form" })
        return
      }

      try {
        // Handle image upload to Vercel Blob or similar service
        // For now, we'll use a placeholder URL
        let imageUrl = "https://via.placeholder.com/800x600?text=Product+Image"

        if (files.image) {
          // In a real app, you would upload to Vercel Blob or similar
          // For now, we'll just use the placeholder with a unique ID
          imageUrl = `https://via.placeholder.com/800x600?text=Product+${uuidv4().substring(0, 8)}`
        }

        // Insert new product into MySQL
        const [result] = await db.execute(
          `
          INSERT INTO products (productName, \`from\`, nutrients, quantity, price, energySavings, description, eco, image)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            fields.productName,
            fields.from,
            fields.nutrients,
            fields.quantity,
            Number.parseFloat(fields.price),
            fields.energySavings,
            fields.description,
            fields.eco === "true",
            imageUrl,
          ],
        )

        res.status(200).json({
          success: true,
          message: "Product added successfully",
          productId: result.insertId,
        })
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
