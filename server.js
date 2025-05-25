import http from "http"
import fs from "fs"
import { fileURLToPath } from "url"
import path from "path"
import { dirname } from "path"
import mysql from "mysql2/promise"
import { IncomingForm } from "formidable"
import dotenv from "dotenv"

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let connection = null

async function connectToDatabase() {
  if (connection) return connection

  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    })

    console.log("Connected to MySQL database")
    return connection
  } catch (error) {
    console.error("Database connection failed:", error)
    throw error
  }
}

// Load templates with error handling
function loadTemplate(templatePath) {
  try {
    return fs.readFileSync(templatePath, "utf-8")
  } catch (error) {
    console.error(`Error loading template ${templatePath}:`, error)
    return `<h1>Template Error: ${path.basename(templatePath)} not found</h1>`
  }
}

const tempOverview = loadTemplate(path.join(__dirname, "templates", "overview.html"))
const tempCard = loadTemplate(path.join(__dirname, "templates", "card.html"))
const tempProduct = loadTemplate(path.join(__dirname, "templates", "product.html"))
const tempAdmin = loadTemplate(path.join(__dirname, "templates", "admin.html"))

const replaceTemplate = (temp, product) => {
  let output = temp.replace(/{%PRODUCTNAME%}/g, product.productName ?? "")
  output = output.replace(/{%IMAGE%}/g, product.imageURL ?? "")
  output = output.replace(/{%PRICE%}/g, product.price ?? "")
  output = output.replace(/{%FROM%}/g, product.from ?? "")
  output = output.replace(/{%ENERGY_SAVINGS%}/g, product.energySavings ?? "")
  output = output.replace(/{%QUANTITY%}/g, product.quantity ?? "")
  output = output.replace(/{%DESCRIPTION%}/g, product.description ?? "")
  output = output.replace(/{%SPECIFICATIONS%}/g, product.specifications ?? "")
  output = output.replace(/{%ID%}/g, product.id)
  if (!product.eco) output = output.replace(/{%NOT_ECO%}/g, "not-eco")
  else output = output.replace(/{%NOT_ECO%}/g, "")
  return output
}

// Ensure directories exist
function ensureDirectories() {
  const publicDir = path.join(__dirname, "public")
  const publicImagesDir = path.join(publicDir, "images")

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true })
    console.log("Created public directory")
  }

  if (!fs.existsSync(publicImagesDir)) {
    fs.mkdirSync(publicImagesDir, { recursive: true })
    console.log("Created public/images directory")
  }
}

// Handle static file serving
function serveStaticFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.log("File not found:", filePath)
      res.writeHead(404, { "Content-type": "text/html" })
      res.end("<h1>File not found!</h1>")
      return
    }

    const ext = path.extname(filePath).slice(1).toLowerCase()
    let contentType = "application/octet-stream" // default

    const mimeTypes = {
      html: "text/html",
      css: "text/css",
      js: "application/javascript",
      json: "application/json",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      ico: "image/x-icon",
    }

    contentType = mimeTypes[ext] || contentType

    res.writeHead(200, { "Content-type": contentType })
    res.end(data)
  })
}

const server = http.createServer(async (req, res) => {
  try {
    const db = await connectToDatabase()
    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathname = url.pathname
    const query = Object.fromEntries(url.searchParams)

    console.log(`${req.method} ${pathname}`)

    // Handle favicon
    if (pathname === "/favicon.ico") {
      const faviconPath = path.join(__dirname, "public", "favicon.ico")
      serveStaticFile(faviconPath, res)
      return
    }

    // Routes
    if (pathname === "/" || pathname === "/overview") {
      try {
        const [products] = await db.execute("SELECT * FROM products ORDER BY created_at DESC")
        res.writeHead(200, { "Content-type": "text/html" })
        const cardsHtml = products.map((product) => replaceTemplate(tempCard, product)).join("")
        const output = tempOverview.replace("{%PRODUCT_CARDS%}", cardsHtml)
        res.end(output)
      } catch (dbError) {
        console.error("Database error on overview:", dbError)
        res.writeHead(500, { "Content-type": "text/html" })
        res.end("<h1>Database Error</h1><p>Please make sure the database is set up and seeded.</p>")
      }
    } else if (pathname === "/product") {
      if (!query.id) {
        res.writeHead(400, { "Content-type": "text/html" })
        res.end("<h1>Product ID required!</h1>")
        return
      }

      try {
        const [rows] = await db.execute("SELECT * FROM products WHERE id = ?", [query.id])
        if (rows.length === 0) {
          res.writeHead(404, { "Content-type": "text/html" })
          res.end("<h1>Product not found!</h1>")
          return
        }
        res.writeHead(200, { "Content-type": "text/html" })
        const output = replaceTemplate(tempProduct, rows[0])
        res.end(output)
      } catch (dbError) {
        console.error("Database error on product:", dbError)
        res.writeHead(500, { "Content-type": "text/html" })
        res.end("<h1>Database Error</h1>")
      }
    } else if (pathname === "/admin") {
      res.writeHead(200, { "Content-type": "text/html" })
      res.end(tempAdmin)
    } else if (pathname === "/api/products" && req.method === "POST") {
      const form = new IncomingForm({
        uploadDir: path.join(__dirname, "public", "images"),
        keepExtensions: true,
        maxFileSize: 10 * 1024 * 1024, // 10MB
      })

      form.parse(req, async (err, fields, files) => {
        if (err) {
          console.error("Error parsing form:", err)
          res.writeHead(500, { "Content-type": "application/json" })
          res.end(JSON.stringify({ error: "Error processing form: " + err.message }))
          return
        }

        try {
          console.log("Processing new product submission...")

          // Set default image URL
          let imageUrl = "https://via.placeholder.com/800x600?text=Product+Image"

          // Check for uploaded image
          if (files.image) {
            const imageFile = Array.isArray(files.image) ? files.image[0] : files.image

            if (imageFile && imageFile.size > 0) {
              const fileName = `product_${Date.now()}_${imageFile.originalFilename || "image.jpg"}`
              const newPath = path.join(__dirname, "public", "images", fileName)

              try {
                fs.renameSync(imageFile.filepath, newPath)
                imageUrl = `/public/images/${fileName}`
                console.log("Image saved successfully:", imageUrl)
              } catch (moveError) {
                console.error("Error moving file:", moveError)
                // Fallback to copy
                fs.copyFileSync(imageFile.filepath, newPath)
                fs.unlinkSync(imageFile.filepath)
                imageUrl = `/public/images/${fileName}`
              }
            }
          }

          // Extract field values safely
          const getValue = (field) => {
            if (!field) return ""
            return Array.isArray(field) ? field[0] : field
          }

          const productData = {
            productName: getValue(fields.productName),
            from: getValue(fields.from),
            specifications: getValue(fields.specifications),
            quantity: getValue(fields.quantity),
            price: Number.parseFloat(getValue(fields.price)) || 0,
            energySavings: getValue(fields.energySavings),
            description: getValue(fields.description),
            eco: getValue(fields.eco) === "true",
          }

          // Validate required fields
          const requiredFields = ["productName", "from", "quantity", "description"]
          for (const field of requiredFields) {
            if (!productData[field]) {
              throw new Error(`Missing required field: ${field}`)
            }
          }

          const result = await db.execute(
            `INSERT INTO products (productName, imageURL, \`from\`, specifications, quantity, price, energySavings, description, eco)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              productData.productName,
              imageUrl,
              productData.from,
              productData.specifications,
              productData.quantity,
              productData.price,
              productData.energySavings,
              productData.description,
              productData.eco,
            ],
          )

          console.log("Product inserted successfully with ID:", result[0].insertId)

          res.writeHead(302, { Location: "/" })
          res.end()
        } catch (error) {
          console.error("Error adding product:", error)
          res.writeHead(500, { "Content-type": "application/json" })
          res.end(JSON.stringify({ error: "Error adding product: " + error.message }))
        }
      })
    } else if (pathname === "/api/products" && req.method === "GET") {
      try {
        const [products] = await db.execute("SELECT * FROM products ORDER BY created_at DESC")
        res.writeHead(200, { "Content-type": "application/json" })
        res.end(JSON.stringify(products))
      } catch (dbError) {
        console.error("Database error on API:", dbError)
        res.writeHead(500, { "Content-type": "application/json" })
        res.end(JSON.stringify({ error: "Database error" }))
      }
    } else if (pathname.startsWith("/public/")) {
      // Handle static files from public directory
      const filePath = path.join(__dirname, pathname)
      serveStaticFile(filePath, res)
    } else if (pathname.match(/^\/[a-zA-Z0-9]+\.(jpg|jpeg|png|gif|webp|svg)$/)) {
      // Handle direct image requests
      const imageName = pathname.slice(1)
      const imagePath = path.join(__dirname, "public", "images", imageName)
      serveStaticFile(imagePath, res)
    } else if (pathname.match(/\.(css|js|ico)$/)) {
      // Handle other static assets
      const filePath = path.join(__dirname, "public", pathname)
      serveStaticFile(filePath, res)
    } else {
      res.writeHead(404, { "Content-type": "text/html" })
      res.end("<h1>Page not found!</h1>")
    }
  } catch (error) {
    console.error("Server error:", error)
    res.writeHead(500, { "Content-type": "text/html" })
    res.end("<h1>Server Error: " + error.message + "</h1>")
  }
})

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down server...")
  if (connection) {
    await connection.end()
    console.log("Database connection closed")
  }
  process.exit(0)
})

const port = process.env.PORT || 8000

// Initialize server
async function startServer() {
  try {
    // Ensure required directories exist
    ensureDirectories()

    // Test database connection
    await connectToDatabase()
    console.log("Database connection verified")

    server.listen(port, () => {
      console.log(`Server listening on port ${port}`)
      console.log(`Open http://localhost:${port} in your browser`)
      console.log(`Admin panel: http://localhost:${port}/admin`)
    })
  } catch (error) {
    console.error("Failed to start server:", error)
    console.log("Make sure your database is running and environment variables are set")
    process.exit(1)
  }
}

startServer()
