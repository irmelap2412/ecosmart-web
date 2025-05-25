import mysql from "mysql2/promise"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function seedDatabase() {
  let connection

  try {
    // Connect to MySQL
    connection = await mysql.createConnection(process.env.DATABASE_URL)
    console.log("Connected to MySQL database")

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

    // Check if table has data
    const [rows] = await connection.execute("SELECT COUNT(*) as count FROM products")
    const count = rows[0].count

    if (count === 0) {
      console.log("Seeding database with sample data...")

      // Read sample data from JSON file
      const sampleDataPath = path.join(__dirname, "..", "data.json")
      const sampleData = JSON.parse(fs.readFileSync(sampleDataPath, "utf-8"))

      // Insert sample data
      for (const product of sampleData) {
        await connection.execute(
          `
          INSERT INTO products (productName, \`from\`, nutrients, quantity, price, energySavings, description, eco, image)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            product.productName,
            product.from,
            product.nutrients,
            product.quantity,
            product.price,
            product.energySavings,
            product.description,
            product.eco,
            product.image,
          ],
        )
      }

      console.log(`${sampleData.length} products inserted successfully`)
    } else {
      console.log(`Database already contains ${count} products. Skipping seed.`)
    }
  } catch (error) {
    console.error("Error seeding database:", error)
  } finally {
    if (connection) {
      await connection.end()
      console.log("MySQL connection closed")
    }
  }
}

// Run the seed function
seedDatabase().catch(console.error)
