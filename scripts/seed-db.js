import mysql from "mysql2/promise"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import dotenv from "dotenv"

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function seedDatabase() {
  let connection

  try {
    // Connect to database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    })
    console.log("Connected to MySQL database")

    // Create products table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        productName VARCHAR(255) NOT NULL,
        imageURL VARCHAR(500) DEFAULT NULL,
        \`from\` VARCHAR(255) NOT NULL,
        specifications TEXT DEFAULT NULL,
        quantity VARCHAR(255) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        energySavings VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        eco BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log("Products table ready")

    // Check if table has data
    const [rows] = await connection.execute("SELECT COUNT(*) as count FROM products")
    const count = rows[0].count

    if (count === 0) {
      // Read data.json file
      const dataPath = path.join(__dirname, "..", "data.json")

      if (!fs.existsSync(dataPath)) {
        throw new Error("data.json file not found in project root")
      }

      const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"))

      if (!Array.isArray(data)) {
        throw new Error("data.json should contain an array of products")
      }

      // Insert products
      let inserted = 0
      for (const product of data) {
        await connection.execute(
          `INSERT INTO products (productName, imageURL, \`from\`, specifications, quantity, price, energySavings, description, eco)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            product.productName,
            product.imageURL || product.image || null,
            product.from,
            product.specifications || product.nutrients || null,
            product.quantity,
            Number.parseFloat(product.price),
            product.energySavings,
            product.description,
            product.eco !== undefined ? product.eco : true,
          ],
        )
        inserted++
        console.log(`Added: ${product.productName}`)
      }

      console.log(`${inserted} products inserted`)
    } else {
      console.log(`Database already has ${count} products`)
    }
  } catch (error) {
    console.error("Error:", error.message)
    process.exit(1)
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

seedDatabase()
