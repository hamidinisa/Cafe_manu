const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");

const app = express();
const dbPath = path.join(__dirname, "data", "cafe_menu.db");
const db = new Database(dbPath);

// 1. Helmet ile HTTP güvenlik başlıkları (XSS, Clickjacking, MIME-Sniffing koruması)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"]
      }
    }
  })
);

// 2. Çoklu cihaz erişimi için CORS ve JSON payload limiti (DoS koruması)
app.use(
  cors({
    origin: process.env.CORS_ALLOWED_ORIGINS || "*",
    credentials: true
  })
);
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// 3. Hız Sınırlayıcılar (Rate Limiting)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/api/", apiLimiter);

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: "Çok fazla başarısız giriş denemesi. 1 dakika sonra tekrar deneyin." }
});

// 4. Parametreli SQLite Tabloları (SQL Injection Korumalı)
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price INTEGER NOT NULL CHECK(price > 0 AND price <= 10000),
    calories INTEGER DEFAULT 150,
    prepMinutes INTEGER DEFAULT 5,
    description TEXT NOT NULL,
    imageKey TEXT DEFAULT 'hot',
    diet TEXT DEFAULT '[]',
    inStock INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    tableName TEXT NOT NULL,
    itemsJson TEXT NOT NULL,
    note TEXT DEFAULT '',
    total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Bekliyor',
    createdAt TEXT NOT NULL
  );
`);

function sanitizeString(val, maxLen = 160) {
  if (typeof val !== "string") return "";
  return val.replace(/[\u0000-\u001F<>`"']/g, "").trim().slice(0, maxLen);
}

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const ADMIN_USER = process.env.ADMIN_USERNAME || "admin";
const ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync("KafeAdmin2026!", 12);

function requireAdmin(req, res, next) {
  const token = req.cookies.cafe_token;
  const csrfHeader = req.headers["x-csrf-token"];
  if (!token) return res.status(401).json({ error: "Oturum açmanız gerekiyor." });
  try {
    const payload = jwt.verify(token, SESSION_SECRET);
    if (req.method !== "GET" && payload.csrf !== csrfHeader) {
      return res.status(403).json({ error: "Geçersiz CSRF anahtarı." });
    }
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Oturum süresi doldu veya geçersiz." });
  }
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Ürünleri Listele (Tüm Cihazlar)
app.get("/api/products", (req, res) => {
  const rows = db.prepare("SELECT * FROM products ORDER BY rowid DESC").all();
  res.json(
    rows.map((r) => ({
      ...r,
      inStock: Boolean(r.inStock),
      diet: JSON.parse(r.diet || "[]")
    }))
  );
});

// Yönetici Girişi
app.post("/api/admin/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const userMatch = sanitizeString(username, 40) === ADMIN_USER;
  const passMatch = await bcrypt.compare(String(password || ""), ADMIN_HASH);

  if (!userMatch || !passMatch) {
    return res.status(401).json({ error: "Geçersiz kullanıcı adı veya parola." });
  }
  const csrfToken = crypto.randomBytes(16).toString("hex");
  const token = jwt.sign({ role: "admin", csrf: csrfToken }, SESSION_SECRET, { expiresIn: "6h" });

  res.cookie("cafe_token", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production"
  });
  res.json({ ok: true, csrfToken });
});

// Yönetici Ürün Ekle / Güncelle (Parametreli Sorgu)
app.post("/api/admin/products", requireAdmin, (req, res) => {
  const name = sanitizeString(req.body.name, 60);
  const category = sanitizeString(req.body.category, 40);
  const description = sanitizeString(req.body.description, 200);
  const price = Number(req.body.price);
  if (!name || !category || !description || !Number.isInteger(price) || price <= 0 || price > 10000) {
    return res.status(400).json({ error: "Geçersiz ürün verisi." });
  }
  const id = sanitizeString(req.body.id, 40) || "p_" + Date.now();
  const stmt = db.prepare(`
    INSERT INTO products (id, name, category, price, description, inStock)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      price = excluded.price,
      description = excluded.description,
      inStock = excluded.inStock
  `);
  stmt.run(id, name, category, price, description, req.body.inStock ? 1 : 0);
  res.json({ ok: true, id });
});

// Müşteri Sipariş Gönderimi
app.post("/api/orders", (req, res) => {
  const tableName = sanitizeString(req.body.table, 30) || "Masa #01";
  const note = sanitizeString(req.body.note, 120);
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 25) : [];
  if (items.length === 0) return res.status(400).json({ error: "Sepet boş." });

  let total = 0;
  const cleanItems = items.map((i) => {
    const qty = Math.min(Math.max(Number(i.qty) || 1, 1), 25);
    const price = Math.min(Math.max(Number(i.price) || 0, 1), 10000);
    total += qty * price;
    return { name: sanitizeString(i.name, 60), qty, price };
  });

  const id = "ORD-" + Math.floor(1000 + Math.random() * 9000);
  db.prepare(`
    INSERT INTO orders (id, tableName, itemsJson, note, total, status, createdAt)
    VALUES (?, ?, ?, ?, ?, 'Bekliyor', ?)
  `).run(id, tableName, JSON.stringify(cleanItems), note, total, new Date().toISOString());

  res.status(201).json({ ok: true, id, total });
});

const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(\`[Roast & Craft] Güvenli Kafe Sunucusu aktif: http://0.0.0.0:\${PORT}\`);
});
