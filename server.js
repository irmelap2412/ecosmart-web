import http from "http";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { dirname } from "path";
import mysql from "mysql2/promise";
import { IncomingForm } from "formidable";
import dotenv from "dotenv";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let connection = null;

async function connectToDatabase() {
  if (connection) return connection;

  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        productName VARCHAR(255) NOT NULL,
        imageURL VARCHAR(255),
        \`from\` VARCHAR(255),
        specifications TEXT,
        quantity VARCHAR(100),
        price DECIMAL(10, 2),
        energySavings VARCHAR(50),
        description TEXT,
        eco BOOLEAN,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Connected to MySQL database");
    return connection;
  } catch (error) {
    console.error("Database connection error:", error);
    throw error;
  }
}

const tempOverview = fs.readFileSync(path.join(__dirname, "templates", "overview.html"), "utf-8");
const tempCard = fs.readFileSync(path.join(__dirname, "templates", "card.html"), "utf-8");
const tempProduct = fs.readFileSync(path.join(__dirname, "templates", "product.html"), "utf-8");
const tempAdmin = fs.readFileSync(path.join(__dirname, "templates", "admin.html"), "utf-8");

const replaceTemplate = (temp, product) => {
  let output = temp.replace(/{%PRODUCTNAME%}/g, product.productName ?? "");
  output = output.replace(/{%IMAGE%}/g, product.imageURL ?? "");
  output = output.replace(/{%PRICE%}/g, product.price ?? "");
  output = output.replace(/{%FROM%}/g, product.from ?? "");
  output = output.replace(/{%ENERGY_SAVINGS%}/g, product.energySavings ?? "");
  output = output.replace(/{%QUANTITY%}/g, product.quantity ?? "");
  output = output.replace(/{%DESCRIPTION%}/g, product.description ?? "");
  output = output.replace(/{%SPECIFICATIONS%}/g, product.specifications ?? ""); // ← ADD THIS LINE
  output = output.replace(/{%ID%}/g, product.id);
  if (!product.eco) output = output.replace(/{%NOT_ECO%}/g, "not-eco");
  else output = output.replace(/{%NOT_ECO%}/g, "");
  return output;
};

const server = http.createServer(async (req, res) => {
  try {
    const db = await connectToDatabase();
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const query = Object.fromEntries(url.searchParams);

    console.log("Request for:", pathname); // Debug every request

    if (pathname === "/favicon.ico") {
      const faviconPath = path.join(__dirname, "public", "favicon.ico");
      fs.readFile(faviconPath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end();
        } else {
          res.writeHead(200, { "Content-Type": "image/x-icon" });
          res.end(data);
        }
      });
      return;
    }

    if (pathname === "/" || pathname === "/overview") {
      const [products] = await db.execute("SELECT * FROM products ORDER BY created_at DESC");
      res.writeHead(200, { "Content-type": "text/html" });
      const cardsHtml = products.map((product) => replaceTemplate(tempCard, product)).join("");
      const output = tempOverview.replace("{%PRODUCT_CARDS%}", cardsHtml);
      res.end(output);
    } else if (pathname === "/product") {
      const [rows] = await db.execute("SELECT * FROM products WHERE id = ?", [query.id]);
      if (rows.length === 0) {
        res.writeHead(404, { "Content-type": "text/html" });
        res.end("<h1>Product not found!</h1>");
        return;
      }
      res.writeHead(200, { "Content-type": "text/html" });
      const output = replaceTemplate(tempProduct, rows[0]);
      res.end(output);
    } else if (pathname === "/admin") {
      res.writeHead(200, { "Content-type": "text/html" });
      res.end(tempAdmin);
    } else if (pathname === "/api/products" && req.method === "POST") {
      // Create public/images directory if it doesn't exist
      const publicDir = path.join(__dirname, "public");
      const publicImagesDir = path.join(publicDir, "images");
      
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
        console.log("Created public directory");
      }
      
      if (!fs.existsSync(publicImagesDir)) {
        fs.mkdirSync(publicImagesDir, { recursive: true });
        console.log("Created public/images directory");
      }

      const form = new IncomingForm({
        uploadDir: publicImagesDir,
        keepExtensions: true,
        maxFileSize: 10 * 1024 * 1024, // 10MB
      });

      form.parse(req, async (err, fields, files) => {
        if (err) {
          console.error("Error parsing form:", err);
          res.writeHead(500, { "Content-type": "application/json" });
          res.end(JSON.stringify({ error: "Error processing form: " + err.message }));
          return;
        }

        try {
          console.log("=== DEBUGGING FORM DATA ===");
          console.log("Fields received:", JSON.stringify(fields, null, 2));
          console.log("Files received:", JSON.stringify(files, null, 2));

          // Set default image URL
          let imageUrl = "https://via.placeholder.com/800x600?text=Product+Image";
          
          // Check for uploaded image
          if (files.image) {
            console.log("Image file found:", files.image);
            
            // Handle both array and single file formats
            const imageFile = Array.isArray(files.image) ? files.image[0] : files.image;
            
            if (imageFile && imageFile.size > 0) {
              console.log("Processing image file:", {
                originalFilename: imageFile.originalFilename,
                size: imageFile.size,
                filepath: imageFile.filepath
              });
              
              const fileName = `product_${Date.now()}_${imageFile.originalFilename || 'image.jpg'}`;
              const newPath = path.join(publicImagesDir, fileName);
              
              console.log("Moving file from:", imageFile.filepath);
              console.log("Moving file to:", newPath);
              
              // Move file to proper location with new name
              try {
                fs.renameSync(imageFile.filepath, newPath);
                imageUrl = `public/images/${fileName}`;
                console.log("Image saved successfully as:", imageUrl);
                console.log("File exists at new location:", fs.existsSync(newPath));
              } catch (moveError) {
                console.error("Error moving file:", moveError);
                // Try copying instead
                fs.copyFileSync(imageFile.filepath, newPath);
                fs.unlinkSync(imageFile.filepath);
                imageUrl = `public/images/${fileName}`;
                console.log("Image copied successfully as:", imageUrl);
              }
            } else {
              console.log("No valid image file uploaded or file is empty");
            }
          } else {
            console.log("No image field found in files");
          }

          // Extract field values safely
          const getValue = (field) => {
            if (!field) return "";
            return Array.isArray(field) ? field[0] : field;
          };

          const productData = {
            productName: getValue(fields.productName),
            from: getValue(fields.from),
            specifications: getValue(fields.specifications),
            quantity: getValue(fields.quantity),
            price: parseFloat(getValue(fields.price)) || 0,
            energySavings: getValue(fields.energySavings),
            description: getValue(fields.description),
            eco: getValue(fields.eco) === "true"
          };

          console.log("=== FINAL PRODUCT DATA ===");
          console.log("Product data to insert:", JSON.stringify(productData, null, 2));
          console.log("Image URL to insert:", imageUrl);

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
              productData.eco
            ]
          );

          console.log("Product inserted successfully with ID:", result[0].insertId);
          
          // Verify what was actually inserted
          const [verifyResult] = await db.execute("SELECT * FROM products WHERE id = ?", [result[0].insertId]);
          console.log("Verification - Product in DB:", JSON.stringify(verifyResult[0], null, 2));

          res.writeHead(302, { Location: "/" });
          res.end();
        } catch (error) {
          console.error("Error adding product:", error);
          res.writeHead(500, { "Content-type": "application/json" });
          res.end(JSON.stringify({ error: "Error adding product: " + error.message }));
        }
      });
    } else if (pathname === "/api/products" && req.method === "GET") {
      const [products] = await db.execute("SELECT * FROM products ORDER BY created_at DESC");
      res.writeHead(200, { "Content-type": "application/json" });
      res.end(JSON.stringify(products));
    } else if (pathname.startsWith("/public/")) {
      // Handle images from the public directory
      const imagePath = path.join(__dirname, pathname);
      console.log("Looking for public image at:", imagePath);
      console.log("File exists:", fs.existsSync(imagePath));
      
      fs.readFile(imagePath, (err, data) => {
        if (err) {
          console.log("Public image not found at:", imagePath);
          console.log("Error:", err.message);
          res.writeHead(404, { "Content-type": "text/html" });
          res.end("<h1>Image not found!</h1>");
        } else {
          const ext = path.extname(pathname).slice(1).toLowerCase();
          let contentType = "image/jpeg"; // default
          
          switch(ext) {
            case "png": contentType = "image/png"; break;
            case "gif": contentType = "image/gif"; break;
            case "jpg":
            case "jpeg": contentType = "image/jpeg"; break;
            case "webp": contentType = "image/webp"; break;
            case "svg": contentType = "image/svg+xml"; break;
          }
          
          console.log("Serving image with content type:", contentType);
          res.writeHead(200, { "Content-type": contentType });
          res.end(data);
        }
      });
    } else if (pathname.match(/^\/[a-zA-Z0-9]+\.jpg$/)) {
      // Handle direct image requests like /dxyg3vduyd1uxxu5egg5iw1rn.jpg
      // Check if it exists in public/images/
      const imageName = pathname.slice(1); // Remove leading slash
      const imagePath = path.join(__dirname, "public", "images", imageName);
      
      console.log("Looking for direct image request:", imageName);
      console.log("Checking path:", imagePath);
      console.log("File exists:", fs.existsSync(imagePath));
      
      fs.readFile(imagePath, (err, data) => {
        if (err) {
          console.log("Direct image not found at:", imagePath);
          res.writeHead(404, { "Content-type": "text/html" });
          res.end("<h1>Image not found!</h1>");
        } else {
          const ext = path.extname(imageName).slice(1).toLowerCase();
          let contentType = "image/jpeg";
          
          switch(ext) {
            case "png": contentType = "image/png"; break;
            case "gif": contentType = "image/gif"; break;
            case "jpg":
            case "jpeg": contentType = "image/jpeg"; break;
            case "webp": contentType = "image/webp"; break;
            case "svg": contentType = "image/svg+xml"; break;
          }
          
          console.log("Serving direct image with content type:", contentType);
          res.writeHead(200, { "Content-type": contentType });
          res.end(data);
        }
      });
    } else if (pathname.match(/\.(jpg|jpeg|png|gif|ico|webp|svg)$/)) {
      // Fallback for other image requests
      const imagePath = path.join(__dirname, pathname);
      console.log("Fallback image request for:", imagePath);
      
      fs.readFile(imagePath, (err, data) => {
        if (err) {
          console.log("Fallback image not found at:", imagePath);
          res.writeHead(404, { "Content-type": "text/html" });
          res.end("<h1>Image not found!</h1>");
        } else {
          const ext = path.extname(pathname).slice(1);
          const contentType = ext === "ico" ? "image/x-icon" : `image/${ext}`;
          res.writeHead(200, { "Content-type": contentType });
          res.end(data);
        }
      });
    } else {
      res.writeHead(404, { "Content-type": "text/html" });
      res.end("<h1>Page not found!</h1>");
    }
  } catch (error) {
    console.error("Server error:", error);
    res.writeHead(500, { "Content-type": "text/html" });
    res.end("<h1>Server Error: " + error.message + "</h1>");
  }
});

async function initializeDatabase() {
  try {
    const db = await connectToDatabase();
    const [rows] = await db.execute("SELECT COUNT(*) as count FROM products");
    const count = rows[0].count;

    if (count === 0) {
      console.log("Initializing database with sample data...");
      const dataPath = path.join(__dirname, "data.json");
      
      if (fs.existsSync(dataPath)) {
        const sampleData = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

        for (const product of sampleData) {
          await db.execute(
            `INSERT INTO products (productName, imageURL, \`from\`, specifications, quantity, price, energySavings, description, eco)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              product.productName ?? "",
              product.imageURL ?? "",
              product.from ?? "",
              product.specifications ?? "",
              product.quantity ?? "",
              product.price ?? 0,
              product.energySavings ?? "",
              product.description ?? "",
              product.eco ?? false
            ]
          );
        }

        console.log(`${sampleData.length} products inserted successfully`);
      } else {
        console.log("No data.json file found, skipping sample data insertion");
      }
    }
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}

const port = process.env.PORT || 8000;
server.listen(port, async () => {
  console.log(`Listening to requests on port ${port}`);
  console.log(`Open http://localhost:${port} in your browser`);
  await initializeDatabase();
});