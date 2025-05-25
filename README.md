# Energy Efficiency Project

A simple Node.js application that displays information about energy-efficient products.

## How to Run

1. Make sure you have Node.js installed (version 14 or higher recommended)
2. Hit npm install
3. Seed the database: node scripts/seed-db.js
3. Run the server: node server.js
4. Open your browser and go to http://localhost:8000

## Project Structure

- `server.js` - The main server file
- `data.json` - Product data
- `templates/` - HTML templates
  - `overview.html` - Main page template
  - `card.html` - Product card template
  - `product.html` - Product detail page template
- `public/` - Folder for product images, favicon

## Features

- Overview page with all energy-efficient products
- Detailed product pages
- Simple API endpoint at /api
- MySQL connection
- Admin panel to add products

