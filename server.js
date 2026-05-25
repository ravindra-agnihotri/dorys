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
let sharp;
try { sharp = require("sharp"); } catch { sharp = null; console.warn("⚠️  sharp not installed — image conversion disabled. Run: npm install"); }
const Database = require("better-sqlite3");

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
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB — HEIC/RAW files can be large
  fileFilter: (req, file, cb) => {
    // Accept all image formats — we convert them server-side
    const ok = file.mimetype.startsWith("image/") ||
                /\.(heic|heif|tiff?|bmp|avif|raw|cr2|nef|arw|dng|webp)$/i.test(file.originalname);
    if (!ok) return cb(new Error("Only image files are allowed"));
    cb(null, true);
  },
});

/* =================================================
   IMAGE CONVERSION
   Converts ANY format (HEIC, HEIF, TIFF, BMP, RAW,
   WebP, PNG, AVIF…) to JPEG using sharp.
   Falls back to raw base64 if sharp unavailable.
================================================= */
const BROWSER_SAFE = new Set(["image/jpeg","image/png","image/gif","image/webp","image/svg+xml"]);

async function convertImage(buffer, mimetype) {
  // Already browser-safe AND not too large → keep as-is
  if (BROWSER_SAFE.has(mimetype) && buffer.length < 5 * 1024 * 1024 && sharp) {
    // Still re-encode through sharp to strip EXIF, auto-rotate, and resize if huge
    try {
      const out = await sharp(buffer)
        .rotate()                          // auto-rotate from EXIF orientation
        .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
      return { buffer: out, mimetype: "image/jpeg" };
    } catch { /* fall through */ }
  }

  // Non-browser-safe formats (HEIC, HEIF, TIFF, BMP, AVIF, RAW, etc.) → convert to JPEG
  if (sharp) {
    try {
      const out = await sharp(buffer)
        .rotate()
        .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
      console.log(`✅ Converted ${mimetype} → image/jpeg (${Math.round(out.length/1024)}KB)`);
      return { buffer: out, mimetype: "image/jpeg" };
    } catch (e) {
      console.error("Image conversion failed:", e.message);
    }
  }

  // Fallback: store raw (will work for standard formats if sharp missing)
  return { buffer, mimetype };
}

// Sync wrapper for use in non-async contexts (legacy)
const toBase64 = (buffer, mimetype) =>
  `data:${mimetype};base64,${buffer.toString("base64")}`;

// Async convert + base64
async function toBase64Converted(buffer, mimetype) {
  const result = await convertImage(buffer, mimetype);
  return {
    data: `data:${result.mimetype};base64,${result.buffer.toString("base64")}`,
    mime: result.mimetype,
  };
}

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
  try {
    let imageData = null, imageMime = "image/jpeg";
    if (req.file) {
      const converted = await toBase64Converted(req.file.buffer, req.file.mimetype);
      imageData = converted.data;
      imageMime = converted.mime;
    }
    const result = db.prepare(`
      INSERT INTO products (name, price, category, eggless, description, image_data, image_mime)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.body.name,
      Number(req.body.price),
      req.body.category || "General",
      req.body.eggless === "true" ? 1 : 0,
      req.body.description || "",
      imageData,
      imageMime
    );
    res.json({ id: result.lastInsertRowid, imageUrl: `/api/image/products/${result.lastInsertRowid}` });
  } catch (e) {
    console.error("Product upload error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/products/:id", (req, res) => {
  db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
  res.json({ message: "Product deleted" });
});

/* =================================================
   GALLERY API
================================================= */
app.get("/api/gallery", (req, res) => {
  const source = req.query.source || "all";
  let manual = [];
  if (source === "all" || source === "manual") {
    const items = db.prepare("SELECT id, title, tags, image_mime, created_at FROM gallery ORDER BY id DESC").all();
    manual = items.map(g => ({
      id: "manual_" + g.id,
      source: "manual",
      url: "/api/image/gallery/" + g.id,
      title: g.title || "",
      tags: JSON.parse(g.tags || "[]"),
      created_at: g.created_at,
    }));
  }
  let instagram = [];
  if (source === "all" || source === "instagram") {
    const igRows = db.prepare("SELECT ig_id as id, media_url as url, caption as title, permalink, timestamp as created_at FROM ig_cache ORDER BY timestamp DESC").all();
    instagram = igRows.map(p => ({ ...p, source: "instagram" }));
  }
  res.json([...instagram, ...manual]);
});

app.post("/api/gallery", upload.array("files"), async (req, res) => {
  try {
    const stmt = db.prepare("INSERT INTO gallery (title, tags, image_data, image_mime) VALUES (?, ?, ?, ?)");
    const ids = [];
    for (const file of req.files) {
      const converted = await toBase64Converted(file.buffer, file.mimetype);
      const r = stmt.run("", "[]", converted.data, converted.mime);
      ids.push(r.lastInsertRowid);
    }
    res.json(ids.map(id => ({ id, url: `/api/image/gallery/${id}` })));
  } catch (e) {
    console.error("Gallery upload error:", e);
    res.status(500).json({ error: e.message });
  }
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

app.post("/api/customized", upload.single("image"), async (req, res) => {
  try {
    let imageData = null, imageMime = "image/jpeg";
    if (req.file) {
      const converted = await toBase64Converted(req.file.buffer, req.file.mimetype);
      imageData = converted.data; imageMime = converted.mime;
    }
    const r = db.prepare("INSERT INTO customized (name, min_price, description, image_data, image_mime) VALUES (?, ?, ?, ?, ?)")
      .run(req.body.name, Number(req.body.minPrice || 0), req.body.description, imageData, imageMime);
    res.json({ id: r.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* =================================================
   TODAY'S SPECIAL API
================================================= */
app.get("/api/today", (req, res) => {
  const row = db.prepare("SELECT * FROM today_special WHERE id = 1").get();
  if (!row) return res.json(null);
  res.json({ ...row, ingredients: JSON.parse(row.ingredients || "[]"), imageUrl: "/api/image/today_special/1" });
});

app.post("/api/today", upload.single("image"), async (req, res) => {
  try {
    let imageData = null, imageMime = "image/jpeg";
    if (req.file) {
      const converted = await toBase64Converted(req.file.buffer, req.file.mimetype);
      imageData = converted.data; imageMime = converted.mime;
    }
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
      imageMime
    );
    res.json({ message: "Today's special updated" });
  } catch (e) { res.status(500).json({ error: e.message }); }
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

/* =================================================
   INSTAGRAM BASIC DISPLAY API INTEGRATION
   ─────────────────────────────────────────────────
   Tables:
     ig_config  – stores access_token + expiry
     ig_cache   – cached posts from Instagram
================================================= */
db.exec(`
  CREATE TABLE IF NOT EXISTS ig_config (
    id           INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT,
    token_type   TEXT DEFAULT 'bearer',
    expires_at   TEXT,          -- ISO date when token expires
    username     TEXT,
    user_id      TEXT,
    last_synced  TEXT,          -- last successful fetch
    auto_sync    INTEGER DEFAULT 1
  );
  INSERT OR IGNORE INTO ig_config (id) VALUES (1);

  CREATE TABLE IF NOT EXISTS ig_cache (
    ig_id        TEXT PRIMARY KEY,   -- Instagram media ID
    media_type   TEXT,               -- IMAGE | CAROUSEL_ALBUM | VIDEO
    media_url    TEXT,               -- direct CDN URL (expires after ~1hr)
    thumbnail_url TEXT,              -- for videos
    permalink    TEXT,               -- instagram.com link
    caption      TEXT,
    timestamp    TEXT,
    synced_at    TEXT DEFAULT (datetime('now'))
  );
`);

const https = require("https");

/* ── Helper: fetch JSON from Instagram Graph API ── */
function igFetch(path) {
  return new Promise((resolve, reject) => {
    https.get(`https://graph.instagram.com${path}`, res => {
      let data = "";
      res.on("data", d => (data += d));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("Invalid JSON from Instagram")); }
      });
    }).on("error", reject);
  });
}

/* ── Helper: refresh a long-lived token (valid 60 days, refresh after 50) ── */
async function refreshTokenIfNeeded() {
  const cfg = db.prepare("SELECT * FROM ig_config WHERE id = 1").get();
  if (!cfg?.access_token) return null;

  const expiresAt = cfg.expires_at ? new Date(cfg.expires_at) : null;
  const daysLeft  = expiresAt ? (expiresAt - Date.now()) / 86400000 : 0;

  // Refresh if fewer than 10 days left
  if (daysLeft < 10) {
    try {
      const data = await igFetch(
        `/refresh_access_token?grant_type=ig_refresh_token&access_token=${cfg.access_token}`
      );
      if (data.access_token) {
        const newExpiry = new Date(Date.now() + data.expires_in * 1000).toISOString();
        db.prepare(`UPDATE ig_config SET access_token=?, expires_at=? WHERE id=1`)
          .run(data.access_token, newExpiry);
        console.log("✅ Instagram token refreshed, expires:", newExpiry);
        return data.access_token;
      }
    } catch (e) {
      console.error("Token refresh failed:", e.message);
    }
  }
  return cfg.access_token;
}

/* ── Sync posts from Instagram into ig_cache ── */
async function syncInstagramPosts(token) {
  const fields = "id,media_type,media_url,thumbnail_url,permalink,caption,timestamp";
  const data   = await igFetch(`/me/media?fields=${fields}&limit=50&access_token=${token}`);

  if (!data.data) throw new Error(data.error?.message || "No media data returned");

  const insert = db.prepare(`
    INSERT INTO ig_cache (ig_id, media_type, media_url, thumbnail_url, permalink, caption, timestamp)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(ig_id) DO UPDATE SET
      media_url=excluded.media_url,
      thumbnail_url=excluded.thumbnail_url,
      caption=excluded.caption,
      synced_at=datetime('now')
  `);

  let count = 0;
  for (const post of data.data) {
    if (post.media_type === "VIDEO") continue; // skip videos, images only
    insert.run(
      post.id,
      post.media_type,
      post.media_url || null,
      post.thumbnail_url || null,
      post.permalink,
      post.caption || "",
      post.timestamp
    );
    count++;
  }

  db.prepare("UPDATE ig_config SET last_synced=datetime('now') WHERE id=1").run();
  return count;
}

/* ──────────────────────────────────────
   GET /api/instagram/status
   Returns current config status (no token exposed)
────────────────────────────────────── */
app.get("/api/instagram/status", (req, res) => {
  const cfg   = db.prepare("SELECT * FROM ig_config WHERE id=1").get();
  const count = db.prepare("SELECT COUNT(*) as n FROM ig_cache").get().n;

  if (!cfg?.access_token) {
    return res.json({ connected: false, post_count: 0 });
  }

  const expiresAt  = cfg.expires_at ? new Date(cfg.expires_at) : null;
  const daysLeft   = expiresAt ? Math.max(0, Math.round((expiresAt - Date.now()) / 86400000)) : 0;

  res.json({
    connected:    true,
    username:     cfg.username,
    user_id:      cfg.user_id,
    expires_at:   cfg.expires_at,
    days_left:    daysLeft,
    last_synced:  cfg.last_synced,
    auto_sync:    cfg.auto_sync === 1,
    post_count:   count,
  });
});

/* ──────────────────────────────────────
   POST /api/instagram/connect
   Body: { access_token: "..." }
   Validates token, saves it, does first sync
────────────────────────────────────── */
app.post("/api/instagram/connect", async (req, res) => {
  const { access_token } = req.body;
  if (!access_token) return res.status(400).json({ error: "access_token required" });

  try {
    // Validate by fetching user profile
    const profile = await igFetch(`/me?fields=id,username&access_token=${access_token}`);
    if (!profile.id) {
      return res.status(401).json({ error: profile.error?.message || "Invalid token" });
    }

    // Get token expiry (long-lived tokens expire in 60 days)
    // We store a 60-day expiry from now (basic display tokens don't return expires_in on first use)
    const expiresAt = new Date(Date.now() + 60 * 86400000).toISOString();

    db.prepare(`
      UPDATE ig_config SET
        access_token=?, username=?, user_id=?, expires_at=?, last_synced=NULL
      WHERE id=1
    `).run(access_token, profile.username, profile.id, expiresAt);

    // First sync
    const synced = await syncInstagramPosts(access_token);

    res.json({
      success: true,
      username: profile.username,
      synced_posts: synced,
      expires_at: expiresAt,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ──────────────────────────────────────
   POST /api/instagram/sync
   Manually trigger a re-sync
────────────────────────────────────── */
app.post("/api/instagram/sync", async (req, res) => {
  try {
    const token = await refreshTokenIfNeeded();
    if (!token) return res.status(400).json({ error: "Not connected. Please add an access token first." });

    const count = await syncInstagramPosts(token);
    res.json({ success: true, synced_posts: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ──────────────────────────────────────
   DELETE /api/instagram/disconnect
────────────────────────────────────── */
app.delete("/api/instagram/disconnect", (req, res) => {
  db.prepare("UPDATE ig_config SET access_token=NULL, username=NULL, user_id=NULL, expires_at=NULL WHERE id=1").run();
  db.prepare("DELETE FROM ig_cache").run();
  res.json({ success: true });
});

/* ──────────────────────────────────────
   GET /api/gallery  (updated to merge ig_cache + manual uploads)
   ?source=instagram|manual|all (default: all)
────────────────────────────────────── */
// Override existing /api/gallery route — must be defined AFTER the earlier one is removed
// The earlier gallery route is still present; this one takes precedence if placed after.
// We use a separate endpoint /api/gallery/instagram for IG only, 
// and update /api/gallery to merge both sources.

app.get("/api/gallery/instagram", (req, res) => {
  const posts = db.prepare(`
    SELECT ig_id as id, media_url as url, caption as title, permalink, media_type, timestamp
    FROM ig_cache
    ORDER BY timestamp DESC
  `).all();
  res.json(posts);
});

/* Auto-refresh token daily (runs when server starts, then every 24h) */
async function scheduledTokenRefresh() {
  try {
    const cfg = db.prepare("SELECT access_token, auto_sync FROM ig_config WHERE id=1").get();
    if (!cfg?.access_token) return;
    await refreshTokenIfNeeded();
    if (cfg.auto_sync) {
      const token = db.prepare("SELECT access_token FROM ig_config WHERE id=1").get()?.access_token;
      if (token) {
        const n = await syncInstagramPosts(token);
        console.log(`🔄 Auto-synced ${n} Instagram posts`);
      }
    }
  } catch (e) {
    console.error("Scheduled IG refresh error:", e.message);
  }
}

// Run on startup (after 5s delay) and every 6 hours
setTimeout(scheduledTokenRefresh, 5000);
setInterval(scheduledTokenRefresh, 6 * 60 * 60 * 1000);

console.log("📸 Instagram integration loaded");

/* Instagram setup page route */
app.get("/instagram-setup.html", (_, res) => res.sendFile(path.join(__dirname, "public/instagram-setup.html")));
