import mysql from "mysql2/promise"

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

    console.log("Connected to MySQL database")
    return connection
  } catch (error) {
    console.error("Database connection error:", error)
    throw error
  }
}

export default async function handler(req, res) {
  try {
    // Connect to MySQL
    const db = await connectToDatabase()

    const { pathname } = new URL(req.url, `http://${req.headers.host}`)

    // API routes
    if (pathname === "/api/products") {
      if (req.method === "GET") {
        const [rows] = await db.execute("SELECT * FROM products ORDER BY created_at DESC")
        res.setHeader("Content-Type", "application/json")
        res.status(200).json(rows)
        return
      }
    }

    // Fallback to static files
    res.status(404).json({ error: "Not found" })
  } catch (error) {
    console.error("API error:", error)
    res.status(500).json({ error: "Internal Server Error" })
  }
}
