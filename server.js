const http = require("http");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const port = Number(process.env.PORT) || 8000;
const root = process.cwd();
const dataDir = path.join(root, "data");
const menuFile = path.join(dataDir, "menu.json");
const promosFile = path.join(dataDir, "promos.json");
const ordersFile = path.join(dataDir, "orders.json");

/** Local default. For production set ADMIN_PASSWORD and NODE_ENV=production. */
const ADMIN_PASSWORD =
  process.env.NODE_ENV === "production" && process.env.ADMIN_PASSWORD
    ? process.env.ADMIN_PASSWORD
    : "pelmesto";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map();

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(payload);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const val = part.slice(i + 1).trim();
    out[key] = decodeURIComponent(val);
  }
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function createSession() {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function isAuthed(req) {
  const cookies = parseCookies(req.headers.cookie);
  let token = cookies.pel_admin || "";
  const auth = req.headers.authorization || "";
  if (!token && auth.toLowerCase().startsWith("bearer ")) {
    token = auth.slice(7).trim();
  }
  if (!token) return false;
  const expires = sessions.get(token);
  if (!expires || expires < Date.now()) {
    sessions.delete(token);
    return false;
  }
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return true;
}

function authCookieHeader(token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `pel_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearAuthCookieHeader() {
  return "pel_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

async function ensureDataFiles() {
  await fsp.mkdir(dataDir, { recursive: true });
  for (const file of [promosFile, ordersFile]) {
    try {
      await fsp.access(file);
    } catch {
      await fsp.writeFile(file, "[]\n", "utf8");
    }
  }
  try {
    await fsp.access(menuFile);
  } catch {
    await writeJson(menuFile, { version: 2, categories: [], items: [] });
  }
}

/** Editors like Notepad save JSON with a BOM, which JSON.parse rejects. */
async function readJson(file) {
  const raw = await fsp.readFile(file, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

async function readList(file) {
  const data = await readJson(file);
  return Array.isArray(data) ? data : [];
}

async function writeList(file, list) {
  await fsp.writeFile(file, `${JSON.stringify(list, null, 2)}\n`, "utf8");
}

async function writeJson(file, value) {
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** Menu is `{ categories, items }`; older array files are read as items only. */
async function readMenu() {
  const data = await readJson(menuFile);
  if (Array.isArray(data)) return { version: 2, categories: [], items: data };
  return {
    version: 2,
    categories: Array.isArray(data.categories) ? data.categories : [],
    items: Array.isArray(data.items) ? data.items : [],
  };
}

function newId() {
  return crypto.randomBytes(8).toString("hex");
}

function num(value, fallback = null) {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeNutrition(input) {
  if (!input || typeof input !== "object") return null;
  const out = {
    protein: num(input.protein),
    fat: num(input.fat),
    carbs: num(input.carbs),
    kcal: num(input.kcal),
  };
  return Object.values(out).some((value) => value !== null) ? out : null;
}

function normalizeVariants(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry, index) => ({
      id: String(entry.id || `v${index + 1}`).trim(),
      label: String(entry.label || "").trim(),
      weight: String(entry.weight || "").trim(),
      price: num(entry.price),
    }))
    .filter((entry) => entry.label && entry.price !== null);
}

function normalizeItem(body, base = {}) {
  const unit = body.unit === "g" ? "g" : "pcs";
  return {
    id: base.id || newId(),
    categoryId: String(body.categoryId || base.categoryId || "").trim(),
    slug: String(body.slug || base.slug || "").trim(),
    title: String(body.title || "").trim(),
    description: String(body.description || "").trim(),
    weight: String(body.weight || "").trim(),
    price: num(body.price),
    unit,
    step: Math.max(1, Math.round(num(body.step, unit === "g" ? 500 : 1) || 1)),
    priceUnit: Math.max(1, Math.round(num(body.priceUnit, unit === "g" ? 500 : 1) || 1)),
    badge: String(body.badge || "").trim(),
    orderable: body.orderable === undefined ? base.orderable !== false : Boolean(body.orderable),
    imageUrl: String(body.imageUrl || "").trim(),
    variants: normalizeVariants(body.variants),
    nutrition: normalizeNutrition(body.nutrition),
    createdAt: base.createdAt || new Date().toISOString(),
    ...(base.createdAt ? { updatedAt: new Date().toISOString() } : {}),
  };
}

/** Digits-only compare so +375 29 550-55-45 and 375295505545 both pass. */
function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return "";
  return `+${digits}`;
}

const orderRate = new Map();
const ORDER_RATE_WINDOW_MS = 10 * 60 * 1000;
const ORDER_RATE_MAX = 6;

function orderRateExceeded(ip) {
  const now = Date.now();
  const hits = (orderRate.get(ip) || []).filter((stamp) => now - stamp < ORDER_RATE_WINDOW_MS);
  hits.push(now);
  orderRate.set(ip, hits);
  return hits.length > ORDER_RATE_MAX;
}

/**
 * Rebuilds the order from menu.json so the total never comes from the client.
 * Returns `{ error }` or `{ lines, total }`.
 */
function priceOrder(menu, requested) {
  if (!Array.isArray(requested) || !requested.length) {
    return { error: "Корзина пуста" };
  }
  if (requested.length > 60) {
    return { error: "Слишком много позиций в заказе" };
  }

  const byId = new Map(menu.items.map((entry) => [entry.id, entry]));
  const categoryById = new Map(menu.categories.map((entry) => [entry.id, entry]));
  const lines = [];
  let total = 0;

  for (const row of requested) {
    const item = byId.get(String(row.itemId || ""));
    if (!item) return { error: "Позиция больше не доступна" };
    if (item.orderable === false) return { error: `«${item.title}» доступна только в зале` };

    const variant = item.variants && item.variants.length
      ? item.variants.find((entry) => entry.id === String(row.variantId || ""))
      : null;
    if (item.variants && item.variants.length && !variant) {
      return { error: `Выберите объём для «${item.title}»` };
    }

    const price = variant ? variant.price : item.price;
    if (price === null || price === undefined) {
      return { error: `Для «${item.title}» ещё не указана цена` };
    }

    const step = variant ? 1 : item.step || 1;
    const qty = Math.round(num(row.qty, 0) || 0);
    if (qty <= 0 || qty % step !== 0 || qty > 20000) {
      return { error: `Некорректное количество для «${item.title}»` };
    }

    const priceUnit = variant ? 1 : item.priceUnit || 1;
    const sum = Math.round((price * qty * 100) / priceUnit) / 100;
    total += sum;

    const category = categoryById.get(item.categoryId);
    lines.push({
      itemId: item.id,
      variantId: variant ? variant.id : "",
      title: item.title,
      variantLabel: variant ? variant.label : "",
      category: category ? category.title : "",
      kind: category ? category.kind : "hall",
      unit: item.unit,
      qty,
      price,
      priceUnit,
      sum,
    });
  }

  return { lines, total: Math.round(total * 100) / 100 };
}

async function handleApi(req, res, urlPath) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return true;
  }

  if (urlPath === "/api/admin/login" && req.method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch {
      sendJson(res, 400, { error: "Некорректный JSON" });
      return true;
    }
    if (String(body.password || "") !== ADMIN_PASSWORD) {
      sendJson(res, 401, { error: "Неверный пароль" });
      return true;
    }
    const token = createSession();
    sendJson(
      res,
      200,
      { ok: true, token },
      { "Set-Cookie": authCookieHeader(token) },
    );
    return true;
  }

  if (urlPath === "/api/admin/logout" && req.method === "POST") {
    const cookies = parseCookies(req.headers.cookie);
    const auth = req.headers.authorization || "";
    const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    const token = cookies.pel_admin || bearer;
    if (token) sessions.delete(token);
    sendJson(res, 200, { ok: true }, { "Set-Cookie": clearAuthCookieHeader() });
    return true;
  }

  if (urlPath === "/api/admin/session" && req.method === "GET") {
    sendJson(res, 200, { ok: isAuthed(req) });
    return true;
  }

  if (urlPath === "/api/admin/upload-promo" && req.method === "POST") {
    if (!isAuthed(req)) {
      sendJson(res, 401, { error: "Нужен вход" });
      return true;
    }
    let body;
    try {
      body = await readBody(req);
    } catch {
      sendJson(res, 400, { error: "Некорректный JSON" });
      return true;
    }
    const dataUrl = String(body.image || "");
    const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
    if (!match) {
      sendJson(res, 400, { error: "Нужно изображение (png/jpeg/webp)" });
      return true;
    }
    let ext = match[1].toLowerCase();
    if (ext === "jpeg") ext = "jpg";
    const buf = Buffer.from(match[2], "base64");
    if (!buf.length || buf.length > 10 * 1024 * 1024) {
      sendJson(res, 400, { error: "Файл слишком большой (макс. 10 МБ)" });
      return true;
    }
    const name = `promo-${Date.now()}-${newId().slice(0, 6)}.${ext}`;
    const dir = path.join(root, "assets", "promos");
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, name), buf);
    sendJson(res, 201, { url: `/assets/promos/${name}` });
    return true;
  }

  if (urlPath === "/api/admin/upload-menu" && req.method === "POST") {
    if (!isAuthed(req)) {
      sendJson(res, 401, { error: "Нужен вход" });
      return true;
    }
    let body;
    try {
      body = await readBody(req);
    } catch {
      sendJson(res, 400, { error: "Некорректный JSON" });
      return true;
    }
    const dataUrl = String(body.image || "");
    const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
    if (!match) {
      sendJson(res, 400, { error: "Нужно изображение (png/jpeg/webp)" });
      return true;
    }
    let ext = match[1].toLowerCase();
    if (ext === "jpeg") ext = "jpg";
    const buf = Buffer.from(match[2], "base64");
    if (!buf.length || buf.length > 10 * 1024 * 1024) {
      sendJson(res, 400, { error: "Файл слишком большой (макс. 10 МБ)" });
      return true;
    }
    const name = `menu-${Date.now()}-${newId().slice(0, 6)}.${ext}`;
    const dir = path.join(root, "assets", "menu");
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, name), buf);
    sendJson(res, 201, { url: `/assets/menu/${name}` });
    return true;
  }

  if (urlPath === "/api/menu" && req.method === "GET") {
    sendJson(res, 200, await readMenu());
    return true;
  }

  if (urlPath === "/api/menu/categories" && req.method === "POST") {
    if (!isAuthed(req)) {
      sendJson(res, 401, { error: "Нужен вход" });
      return true;
    }
    let body;
    try {
      body = await readBody(req);
    } catch {
      sendJson(res, 400, { error: "Некорректный JSON" });
      return true;
    }
    const title = String(body.title || "").trim();
    if (!title) {
      sendJson(res, 400, { error: "Укажите название категории" });
      return true;
    }
    const menu = await readMenu();
    const category = {
      id: newId(),
      slug: String(body.slug || "").trim() || `cat-${newId().slice(0, 6)}`,
      title,
      kind: body.kind === "frozen" ? "frozen" : "hall",
      order: menu.categories.length + 1,
      note: String(body.note || "").trim(),
    };
    menu.categories.push(category);
    await writeJson(menuFile, menu);
    sendJson(res, 201, category);
    return true;
  }

  const categoryMatch = urlPath.match(/^\/api\/menu\/categories\/([^/]+)$/);
  if (categoryMatch && (req.method === "PUT" || req.method === "DELETE")) {
    if (!isAuthed(req)) {
      sendJson(res, 401, { error: "Нужен вход" });
      return true;
    }
    const id = decodeURIComponent(categoryMatch[1]);
    const menu = await readMenu();
    const index = menu.categories.findIndex((entry) => entry.id === id);
    if (index === -1) {
      sendJson(res, 404, { error: "Категория не найдена" });
      return true;
    }

    if (req.method === "DELETE") {
      menu.categories.splice(index, 1);
      menu.items = menu.items.filter((entry) => entry.categoryId !== id);
      await writeJson(menuFile, menu);
      sendJson(res, 200, { ok: true });
      return true;
    }

    let body;
    try {
      body = await readBody(req);
    } catch {
      sendJson(res, 400, { error: "Некорректный JSON" });
      return true;
    }
    const title = String(body.title || "").trim();
    if (!title) {
      sendJson(res, 400, { error: "Укажите название категории" });
      return true;
    }
    menu.categories[index] = {
      ...menu.categories[index],
      title,
      kind: body.kind === "frozen" ? "frozen" : "hall",
      note: String(body.note || "").trim(),
      order: Math.round(num(body.order, menu.categories[index].order) || index + 1),
    };
    await writeJson(menuFile, menu);
    sendJson(res, 200, menu.categories[index]);
    return true;
  }

  if (urlPath === "/api/menu/items" && req.method === "POST") {
    if (!isAuthed(req)) {
      sendJson(res, 401, { error: "Нужен вход" });
      return true;
    }
    let body;
    try {
      body = await readBody(req);
    } catch {
      sendJson(res, 400, { error: "Некорректный JSON" });
      return true;
    }
    const menu = await readMenu();
    const item = normalizeItem(body);
    if (!item.title) {
      sendJson(res, 400, { error: "Укажите название" });
      return true;
    }
    if (!menu.categories.some((entry) => entry.id === item.categoryId)) {
      sendJson(res, 400, { error: "Выберите категорию" });
      return true;
    }
    if (!item.slug) item.slug = `item-${item.id.slice(0, 6)}`;
    menu.items.push(item);
    await writeJson(menuFile, menu);
    sendJson(res, 201, item);
    return true;
  }

  const itemMatch = urlPath.match(/^\/api\/menu\/items\/([^/]+)$/);
  if (itemMatch && (req.method === "PUT" || req.method === "DELETE")) {
    if (!isAuthed(req)) {
      sendJson(res, 401, { error: "Нужен вход" });
      return true;
    }
    const id = decodeURIComponent(itemMatch[1]);
    const menu = await readMenu();
    const index = menu.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      sendJson(res, 404, { error: "Позиция не найдена" });
      return true;
    }

    if (req.method === "DELETE") {
      menu.items.splice(index, 1);
      await writeJson(menuFile, menu);
      sendJson(res, 200, { ok: true });
      return true;
    }

    let body;
    try {
      body = await readBody(req);
    } catch {
      sendJson(res, 400, { error: "Некорректный JSON" });
      return true;
    }
    const next = normalizeItem(body, menu.items[index]);
    if (!next.title) {
      sendJson(res, 400, { error: "Укажите название" });
      return true;
    }
    if (!menu.categories.some((entry) => entry.id === next.categoryId)) {
      sendJson(res, 400, { error: "Выберите категорию" });
      return true;
    }
    menu.items[index] = next;
    await writeJson(menuFile, menu);
    sendJson(res, 200, next);
    return true;
  }

  if (urlPath === "/api/orders" && req.method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch {
      sendJson(res, 400, { error: "Некорректный JSON" });
      return true;
    }

    const ip = String(req.socket.remoteAddress || "unknown");
    if (orderRateExceeded(ip)) {
      sendJson(res, 429, { error: "Слишком много заказов подряд. Позвоните нам, пожалуйста" });
      return true;
    }

    const name = String(body.name || "").trim().slice(0, 80);
    const phone = normalizePhone(body.phone);
    if (name.length < 2) {
      sendJson(res, 400, { error: "Укажите имя" });
      return true;
    }
    if (!phone) {
      sendJson(res, 400, { error: "Укажите корректный телефон" });
      return true;
    }

    const menu = await readMenu();
    const priced = priceOrder(menu, body.items);
    if (priced.error) {
      sendJson(res, 400, { error: priced.error });
      return true;
    }

    const orders = await readList(ordersFile);
    const order = {
      id: newId(),
      number: `П-${String(1000 + orders.length + 1)}`,
      name,
      phone,
      fulfillment: body.fulfillment === "delivery" ? "delivery" : "pickup",
      comment: String(body.comment || "").trim().slice(0, 500),
      items: priced.lines,
      total: priced.total,
      status: "new",
      createdAt: new Date().toISOString(),
    };
    orders.unshift(order);
    await writeList(ordersFile, orders);
    sendJson(res, 201, { ok: true, number: order.number, total: order.total });
    return true;
  }

  if (urlPath === "/api/orders" && req.method === "GET") {
    if (!isAuthed(req)) {
      sendJson(res, 401, { error: "Нужен вход" });
      return true;
    }
    sendJson(res, 200, await readList(ordersFile));
    return true;
  }

  const orderMatch = urlPath.match(/^\/api\/orders\/([^/]+)$/);
  if (orderMatch && req.method === "PUT") {
    if (!isAuthed(req)) {
      sendJson(res, 401, { error: "Нужен вход" });
      return true;
    }
    let body;
    try {
      body = await readBody(req);
    } catch {
      sendJson(res, 400, { error: "Некорректный JSON" });
      return true;
    }
    const status = String(body.status || "");
    if (!["new", "confirmed", "rejected"].includes(status)) {
      sendJson(res, 400, { error: "Неизвестный статус" });
      return true;
    }
    const id = decodeURIComponent(orderMatch[1]);
    const orders = await readList(ordersFile);
    const index = orders.findIndex((entry) => entry.id === id);
    if (index === -1) {
      sendJson(res, 404, { error: "Заказ не найден" });
      return true;
    }
    orders[index] = {
      ...orders[index],
      status,
      decidedAt: status === "new" ? null : new Date().toISOString(),
    };
    await writeList(ordersFile, orders);
    sendJson(res, 200, orders[index]);
    return true;
  }

  if (orderMatch && req.method === "DELETE") {
    if (!isAuthed(req)) {
      sendJson(res, 401, { error: "Нужен вход" });
      return true;
    }
    const id = decodeURIComponent(orderMatch[1]);
    const orders = await readList(ordersFile);
    await writeList(
      ordersFile,
      orders.filter((entry) => entry.id !== id),
    );
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (urlPath === "/api/promos" && req.method === "GET") {
    const list = await readList(promosFile);
    list.sort((a, b) => Number(Boolean(b.seo || b.locked)) - Number(Boolean(a.seo || a.locked)));
    sendJson(res, 200, list);
    return true;
  }

  const promoMatch = urlPath.match(/^\/api\/promos\/([^/]+)$/);

  if (urlPath === "/api/promos" && req.method === "POST") {
    if (!isAuthed(req)) {
      sendJson(res, 401, { error: "Нужен вход" });
      return true;
    }
    let body;
    try {
      body = await readBody(req);
    } catch {
      sendJson(res, 400, { error: "Некорректный JSON" });
      return true;
    }
    const title = String(body.title || "").trim();
    if (!title) {
      sendJson(res, 400, { error: "Укажите заголовок" });
      return true;
    }
    const item = {
      id: newId(),
      title,
      text: String(body.text || "").trim(),
      link: String(body.link || "").trim(),
      imageUrl: String(body.imageUrl || "").trim(),
      createdAt: new Date().toISOString(),
    };
    const list = await readList(promosFile);
    const pinned = list.filter((entry) => entry.locked || entry.seo).length;
    list.splice(pinned, 0, item);
    await writeList(promosFile, list);
    sendJson(res, 201, item);
    return true;
  }

  if (promoMatch && req.method === "PUT") {
    if (!isAuthed(req)) {
      sendJson(res, 401, { error: "Нужен вход" });
      return true;
    }
    let body;
    try {
      body = await readBody(req);
    } catch {
      sendJson(res, 400, { error: "Некорректный JSON" });
      return true;
    }
    const id = decodeURIComponent(promoMatch[1]);
    const list = await readList(promosFile);
    const index = list.findIndex((item) => item.id === id);
    if (index === -1) {
      sendJson(res, 404, { error: "Не найдено" });
      return true;
    }
    if (list[index].locked || list[index].seo) {
      sendJson(res, 403, { error: "SEO-акция закреплена и недоступна для редактирования" });
      return true;
    }
    const title = String(body.title || "").trim();
    if (!title) {
      sendJson(res, 400, { error: "Укажите заголовок" });
      return true;
    }
    list[index] = {
      ...list[index],
      title,
      text: String(body.text || "").trim(),
      link: String(body.link || "").trim(),
      imageUrl: String(body.imageUrl || "").trim(),
      updatedAt: new Date().toISOString(),
    };
    await writeList(promosFile, list);
    sendJson(res, 200, list[index]);
    return true;
  }

  if (promoMatch && req.method === "DELETE") {
    if (!isAuthed(req)) {
      sendJson(res, 401, { error: "Нужен вход" });
      return true;
    }
    const id = decodeURIComponent(promoMatch[1]);
    const list = await readList(promosFile);
    const current = list.find((item) => item.id === id);
    if (current && (current.locked || current.seo)) {
      sendJson(res, 403, { error: "SEO-акция закреплена и недоступна для удаления" });
      return true;
    }
    const next = list.filter((item) => item.id !== id);
    await writeList(promosFile, next);
    sendJson(res, 200, { ok: true });
    return true;
  }

  return false;
}

/** Clean URLs: `/menu` serves `menu.html`, `/menu/pelmeni` serves `menu.html` too. */
const pageRoutes = {
  "/menu": "menu.html",
  "/about": "about.html",
  "/contacts": "contacts.html",
  "/privacy": "privacy.html",
  "/shop": "menu.html",
  "/takeaway": "menu.html",
  "/kids": "menu.html",
  "/gift": "contacts.html",
  "/booking": "contacts.html",
};

function resolvePage(urlPath) {
  const clean = urlPath.replace(/\/+$/, "") || "/";
  if (clean === "/") return "index.html";
  if (clean === "/admin") return "admin/index.html";
  if (pageRoutes[clean]) return pageRoutes[clean];
  // Never let /menu/foo.css fall back to menu.html — that ships HTML with a
  // text/html type and the browser drops the asset.
  if (path.extname(clean)) return null;
  const section = `/${clean.split("/")[1] || ""}`;
  if (pageRoutes[section]) return pageRoutes[section];
  return null;
}

function serveStatic(req, res, urlPath) {
  const page = resolvePage(urlPath);
  const relative = page || urlPath.replace(/^\/+/, "");

  const target = path.normalize(path.join(root, relative));
  if (!target.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(target, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<!doctype html><meta charset=utf-8><title>404</title><p>Страница не найдена. <a href=\"/\">На главную</a>");
      return;
    }

    const ext = path.extname(target).toLowerCase();
    const type = mime[ext] || "application/octet-stream";
    const cache =
      ext === ".html" || ext === ".css" || ext === ".js" || ext === ".json"
        ? "no-cache"
        : "public, max-age=31536000, immutable";

    const range = req.headers.range;
    if (range && (ext === ".mp4" || ext === ".webm")) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (!match) {
        res.writeHead(416);
        res.end();
        return;
      }

      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stat.size) {
        res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
        res.end();
        return;
      }

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Content-Type": type,
        "Cache-Control": cache,
      });
      fs.createReadStream(target, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      "Content-Length": stat.size,
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Cache-Control": cache,
    });
    fs.createReadStream(target).pipe(res);
  });
}

ensureDataFiles()
  .then(() => {
    const server = http.createServer(async (req, res) => {
      const rawUrl = req.url || "/";
      const parsed = new URL(rawUrl, `http://${req.headers.host || "127.0.0.1"}`);
      const urlPath = decodeURIComponent(parsed.pathname);

      try {
        if (urlPath.startsWith("/api/")) {
          const handled = await handleApi(req, res, urlPath);
          if (handled) return;
          sendJson(res, 404, { error: "Not found" });
          return;
        }
      } catch (error) {
        console.error(error);
        sendJson(res, 500, { error: "Ошибка сервера" });
        return;
      }

      serveStatic(req, res, urlPath);
    });

    server.listen(port, "127.0.0.1", () => {
      console.log(`Pelmesto at http://127.0.0.1:${port}`);
      console.log(`Admin at http://127.0.0.1:${port}/admin`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
