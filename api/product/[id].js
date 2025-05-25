import mysql from "mysql2/promise"

// MySQL Connection
let connection = null

async function connectToDatabase() {
  if (connection) {
    return connection
  }

  try {
    connection = await mysql.createConnection(process.env.DATABASE_URL)
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

    const { id } = req.query

    if (req.method === "GET") {
      try {
        const [rows] = await db.execute("SELECT * FROM products WHERE id = ?", [id])

        if (rows.length === 0) {
          res.status(404).json({ error: "Product not found" })
          return
        }

        res.status(200).json(rows[0])
      } catch (error) {
        console.error("Error fetching product:", error)
        res.status(500).json({ error: "Error fetching product" })
      }
    } else {
      res.status(405).json({ error: "Method not allowed" })
    }
  } catch (error) {
    console.error("API error:", error)
    res.status(500).json({ error: "Internal Server Error" })
  }
}
