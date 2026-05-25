/*************************************************
 * DORY'S BAKEHOUSE – SERVER WITH SQLITE STORAGE
 * Images stored as Base64 BLOBs in SQLite
 *************************************************/

require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const Database = require("better-sqlite3");
const convert = require("heic-convert");
const sharp = require("sharp");

async function processImage(file) {
  if (!file) return null;

  let buffer = file.buffer;
  let mimetype = file.mimetype;

  if (
    mimetype === "image/heic" ||
    mimetype === "image/heif"
  ) {
    buffer = await convert({
      buffer: file.buffer,
      format: "JPEG",
      quality: 0.9
    });

    mimetype = "image/jpeg";
  }

  // Resize all images into uniform thumbnails
  buffer = await sharp(buffer)
    .resize(800, 800, {
      fit: "cover"
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  mimetype = "image/jpeg";

  return {
    data: `data:${mimetype};base64,${buffer.toString("base64")}`,
    mimetype
  };
}


/* =================================================
   APP CONFIG
================================================= */
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

/* =================================================
   SQLITE DATABASE SETUP
================================================= */
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "db", "dorys.db");
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma("journal_mode = WAL");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    category TEXT DEFAULT 'General',
    eggless INTEGER DEFAULT 0,
    description TEXT DEFAULT '',
    image_data TEXT,           -- Base64 encoded image
    image_mime TEXT DEFAULT 'image/jpeg',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS gallery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    image_data TEXT NOT NULL,  -- Base64 encoded image
    image_mime TEXT DEFAULT 'image/jpeg',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT DEFAULT 'Anonymous',
    rating INTEGER DEFAULT 5,
    message TEXT,
    verified INTEGER DEFAULT 0,
    source TEXT DEFAULT 'Website',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS flavours (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    eggless INTEGER DEFAULT 0,
    extra_cost REAL DEFAULT 0,
    popular INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS customized (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    min_price REAL DEFAULT 0,
    description TEXT,
    image_data TEXT,
    image_mime TEXT DEFAULT 'image/jpeg',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS today_special (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT,
    ingredients TEXT DEFAULT '[]',
    price REAL,
    image_data TEXT,
    image_mime TEXT DEFAULT 'image/jpeg',
    available_till TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS about (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    title TEXT DEFAULT 'About Dory''s Bakehouse',
    description TEXT DEFAULT 'Every cake is baked fresh with love.',
    description2 TEXT DEFAULT 'Custom designs, eggless options & same-day delivery.'
  );

  INSERT OR IGNORE INTO about (id) VALUES (1);
`);

/* =================================================
   MULTER (memory storage – we save to SQLite)
================================================= */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// Helper to convert buffer to base64
const toBase64 = (buffer, mimetype) =>
  `data:${mimetype};base64,${buffer.toString("base64")}`;

/* =================================================
   IMAGE SERVING – serve stored images by table/id
================================================= */
app.get("/api/image/:table/:id", (req, res) => {
  const { table, id } = req.params;
  const allowedTables = ["products", "gallery", "customized", "today_special"];
  if (!allowedTables.includes(table)) return res.status(400).send("Invalid table");

  try {
    const row = db.prepare(`SELECT image_data, image_mime FROM ${table} WHERE id = ?`).get(id);
    if (!row || !row.image_data) return res.status(404).send("Image not found");

    // image_data is stored as full data URL (data:mime;base64,...)
    const matches = row.image_data.match(/^data:(.+);base64,(.+)$/);
    if (!matches) return res.status(500).send("Invalid image data");

    const [, mime, base64] = matches;
    const buffer = Buffer.from(base64, "base64");
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buffer);
  } catch (e) {
    res.status(500).send("Error");
  }
});

/* =================================================
   PRODUCTS API
================================================= */
app.get("/api/products", (req, res) => {
  const products = db.prepare(`
    SELECT id, name, price, category, eggless, description, image_mime, created_at
    FROM products ORDER BY id DESC
  `).all();

  // Add image URL instead of raw data
  const withUrls = products.map(p => ({
    ...p,
    imageUrl: `/api/image/products/${p.id}`,
    eggless: !!p.eggless,
  }));
  res.json(withUrls);
});

app.post("/api/products", upload.single("image"), async (req, res) => {
  const processed = req.file ? await processImage(req.file) : null;
  const imageData = processed ? processed.data : null;
  const stmt = db.prepare(`
    INSERT INTO products (name, price, category, eggless, description, image_data, image_mime)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    req.body.name,
    Number(req.body.price),
    req.body.category || "General",
    req.body.eggless === "true" ? 1 : 0,
    req.body.description || "",
    imageData,
    processed?.mimetype || "image/jpeg"
  );
  res.json({ id: result.lastInsertRowid, imageUrl: `/api/image/products/${result.lastInsertRowid}` });
});

app.delete("/api/products/:id", (req, res) => {
  db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
  res.json({ message: "Product deleted" });
});

/* =================================================
   GALLERY API
================================================= */
app.get("/api/gallery", (req, res) => {
  const items = db.prepare(`SELECT id, title, tags, image_mime, created_at FROM gallery ORDER BY id DESC`).all();
  const withUrls = items.map(g => ({
    ...g,
    tags: JSON.parse(g.tags || "[]"),
    url: `/api/image/gallery/${g.id}`,
  }));
  res.json(withUrls);
});

app.post("/api/gallery", upload.array("files"), (req, res) => {
  const stmt = db.prepare(`INSERT INTO gallery (title, tags, image_data, image_mime) VALUES (?, ?, ?, ?)`);
  const insertMany = db.transaction((files) => {
    const ids = [];
    for (const file of files) {
      const r = stmt.run("", "[]", toBase64(file.buffer, file.mimetype), file.mimetype);
      ids.push(r.lastInsertRowid);
    }
    return ids;
  });
  const ids = insertMany(req.files);
  res.json(ids.map(id => ({ id, url: `/api/image/gallery/${id}` })));
});

app.delete("/api/gallery/:id", (req, res) => {
  db.prepare("DELETE FROM gallery WHERE id = ?").run(req.params.id);
  res.json({ message: "Gallery image deleted" });
});

/* =================================================
   REVIEWS API
================================================= */
app.get("/api/reviews", (req, res) => {
  res.json(db.prepare("SELECT * FROM reviews ORDER BY id DESC").all());
});

app.post("/api/reviews", (req, res) => {
  const stmt = db.prepare(`INSERT INTO reviews (name, rating, message) VALUES (?, ?, ?)`);
  const r = stmt.run(req.body.name || "Anonymous", Number(req.body.rating || 5), req.body.message);
  res.json({ id: r.lastInsertRowid });
});

app.delete("/api/reviews/:id", (req, res) => {
  db.prepare("DELETE FROM reviews WHERE id = ?").run(req.params.id);
  res.json({ message: "Review deleted" });
});

/* =================================================
   FLAVOURS API
================================================= */
app.get("/api/flavours", (req, res) => {
  res.json(db.prepare("SELECT * FROM flavours").all().map(f => ({ ...f, eggless: !!f.eggless, popular: !!f.popular })));
});

app.post("/api/flavours", (req, res) => {
  const r = db.prepare(`INSERT INTO flavours (name, category, eggless, extra_cost) VALUES (?, ?, ?, ?)`)
    .run(req.body.name, req.body.category, req.body.eggless === "true" ? 1 : 0, Number(req.body.extraCost || 0));
  res.json({ id: r.lastInsertRowid });
});

app.delete("/api/flavours/:id", (req, res) => {
  db.prepare("DELETE FROM flavours WHERE id = ?").run(req.params.id);
  res.json({ message: "Flavour deleted" });
});

/* =================================================
   CUSTOMIZED CAKES API
================================================= */
app.get("/api/customized", (req, res) => {
  const items = db.prepare("SELECT id, name, min_price, description, image_mime, created_at FROM customized ORDER BY id DESC").all();
  res.json(items.map(i => ({ ...i, imageUrl: `/api/image/customized/${i.id}` })));
});

app.post("/api/customized", upload.single("image"), (req, res) => {
  const imageData = req.file ? toBase64(req.file.buffer, req.file.mimetype) : null;
  const r = db.prepare(`INSERT INTO customized (name, min_price, description, image_data, image_mime) VALUES (?, ?, ?, ?, ?)`)
    .run(req.body.name, Number(req.body.minPrice || 0), req.body.description, imageData, req.file?.mimetype || "image/jpeg");
  res.json({ id: r.lastInsertRowid });
});

/* =================================================
   TODAY'S SPECIAL API
================================================= */
app.get("/api/today", (req, res) => {
  const row = db.prepare("SELECT * FROM today_special WHERE id = 1").get();
  if (!row) return res.json(null);
  res.json({ ...row, ingredients: JSON.parse(row.ingredients || "[]"), imageUrl: "/api/image/today_special/1" });
});

app.post("/api/today", upload.single("image"), (req, res) => {
  const imageData = req.file ? toBase64(req.file.buffer, req.file.mimetype) : null;
  db.prepare(`
    INSERT INTO today_special (id, name, ingredients, price, image_data, image_mime, available_till, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, date('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, ingredients=excluded.ingredients, price=excluded.price,
      image_data=COALESCE(excluded.image_data, image_data),
      image_mime=excluded.image_mime, available_till=excluded.available_till, updated_at=excluded.updated_at
  `).run(
    req.body.name,
    JSON.stringify(req.body.ingredients?.split(",") || []),
    Number(req.body.price),
    imageData,
    processed?.mimetype || "image/jpeg"
  );
  res.json({ message: "Today's special updated" });
});

app.delete("/api/today", (req, res) => {
  db.prepare("DELETE FROM today_special WHERE id = 1").run();
  res.json({ message: "Today's special cleared" });
});

/* =================================================
   ABOUT API
================================================= */
app.get("/api/about", (req, res) => {
  res.json(db.prepare("SELECT * FROM about WHERE id = 1").get());
});

app.post("/api/about", (req, res) => {
  db.prepare(`
    INSERT INTO about (id, title, description, description2) VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, description2=excluded.description2
  `).run(req.body.title, req.body.description, req.body.description2);
  res.json({ message: "About updated" });
});

/* =================================================
   STATIC ROUTES
================================================= */
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "public/index.html")));
app.get("/admin", (_, res) => res.sendFile(path.join(__dirname, "public/admin.html")));
app.get("/flavours.html", (_, res) => res.sendFile(path.join(__dirname, "public/flavours.html")));
app.get("/our-story.html", (_, res) => res.sendFile(path.join(__dirname, "public/our-story.html")));

/* =================================================
   START SERVER
================================================= */
app.listen(PORT, () =>
  console.log(`🎂 Dory's Bakehouse → http://localhost:${PORT}`)
);

/* =================================================
   SEO: SITEMAP.XML
================================================= */
app.get("/sitemap.xml", (req, res) => {
  const domain = process.env.DOMAIN || "https://www.dorysbakes.com";
  const products = db.prepare("SELECT id, name, updated_at FROM products WHERE 1=1").all();
  
  const productUrls = products.map(p => `
  <url>
    <loc>${domain}/cake/${p.id}</loc>
    <lastmod>${new Date(p.updated_at || Date.now()).toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${domain}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>${domain}/flavours.html</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>
  <url><loc>${domain}/our-story.html</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>${domain}/gallery.html</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
  ${productUrls}
</urlset>`;

  res.header("Content-Type", "application/xml");
  res.send(xml);
});

/* =================================================
   SEO: ROBOTS.TXT
================================================= */
app.get("/robots.txt", (req, res) => {
  const domain = process.env.DOMAIN || "https://www.dorysbakes.com";
  res.type("text/plain");
  res.send(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/

Sitemap: ${domain}/sitemap.xml`);
});

/* Individual cake page for SEO */
app.get("/cake/:id", (req, res) => {
});

app.get("/gallery.html", (_, res) => res.sendFile(path.join(__dirname, "public/gallery.html")));

/* Redirect old image paths */
app.get("/hogwartback.png", (_, res) => res.sendFile(path.join(__dirname, "public/img/hogwartback.png")));
app.get("/dorys-logo.png", (_, res) => res.sendFile(path.join(__dirname, "public/img/dorys-logo.png")));
