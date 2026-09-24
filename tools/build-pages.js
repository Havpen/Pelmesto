/**
 * Build a static snapshot for GitHub Pages.
 * Pages has no Node API, so /api/* is rewritten to data/*.json and orders
 * are disabled with a clear client-side message. Admin-uploaded images under
 * assets/ (menu + promos) are copied into the build and their URLs rewritten
 * with the project base path so they load on github.io.
 *
 * Usage: node tools/build-pages.js
 * Output: dist/
 */
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");

const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");
/** Project Pages URL is https://<user>.github.io/Pelmesto/ */
const BASE = process.env.PAGES_BASE || "/Pelmesto";

async function rimraf(dir) {
  await fsp.rm(dir, { recursive: true, force: true });
}

async function mkdirp(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function copyDir(src, dest) {
  await mkdirp(dest);
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(from, to);
    else await fsp.copyFile(from, to);
  }
}

function withBase(urlPath) {
  if (!urlPath || typeof urlPath !== "string") return urlPath;
  if (!urlPath.startsWith("/")) return urlPath;
  if (urlPath.startsWith(BASE + "/") || urlPath === BASE) return urlPath;
  if (urlPath === "/") return `${BASE}/`;
  return `${BASE}${urlPath}`;
}

function rewriteAssetUrl(url) {
  if (!url || typeof url !== "string") return url;
  // Absolute site paths → Pages base. Leave http(s) alone.
  if (/^https?:\/\//i.test(url)) return url;
  return withBase(url.startsWith("/") ? url : `/${url}`);
}

/** Bake BASE into every imageUrl / link that points at this site. */
function rewriteDataJson(raw) {
  const data = JSON.parse(String(raw).replace(/^\uFEFF/, ""));

  function walk(node) {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (
        typeof value === "string" &&
        (key === "imageUrl" ||
          key === "image" ||
          key === "img" ||
          key === "photo" ||
          key === "link")
      ) {
        // Only rewrite local paths (/, /assets, /menu…), not Instagram etc.
        if (value.startsWith("/") && !value.startsWith("//")) {
          node[key] = rewriteAssetUrl(value);
        }
      } else if (value && typeof value === "object") {
        walk(value);
      }
    }
  }

  walk(data);
  return JSON.stringify(data, null, 2) + "\n";
}

/** Rewrite site-root absolute paths so they resolve under /Pelmesto/. */
function rewriteHtml(html) {
  let out = html;

  out = out.replaceAll('fetch("/api/promos"', `fetch("${BASE}/data/promos.json"`);
  out = out.replaceAll("fetch('/api/promos'", `fetch('${BASE}/data/promos.json'`);

  out = out.replace(
    /(href|src)=["']\/(?!\/)([^"']+)["']/g,
    (_, attr, p) => `${attr}="${withBase("/" + p)}"`,
  );

  out = out.replaceAll('"/menu', `"${BASE}/menu`);
  out = out.replaceAll('"/about', `"${BASE}/about`);
  out = out.replaceAll('"/contacts', `"${BASE}/contacts`);
  out = out.replaceAll('"/assets/', `"${BASE}/assets/`);
  out = out.replaceAll("'/#", `'${BASE}/#`);

  out = out.replaceAll('href="/"', `href="${BASE}/"`);

  return out;
}

function rewriteMenuJs(js) {
  let out = js;
  out = out.replaceAll('fetch("/api/menu")', `fetch("${BASE}/data/menu.json")`);
  out = out.replace(
    /fetch\("\/api\/orders",\s*\{[\s\S]*?\}\)/,
    `Promise.reject(new Error("Онлайн-заказ на GitHub Pages недоступен — откройте сайт на сервере или позвоните нам."))`,
  );
  return out;
}

async function writePage(route, sourceHtml) {
  const html = await fsp.readFile(path.join(root, sourceHtml), "utf8");
  const rewritten = rewriteHtml(html);
  if (route === "") {
    await fsp.writeFile(path.join(dist, "index.html"), rewritten, "utf8");
    return;
  }
  const dir = path.join(dist, route);
  await mkdirp(dir);
  await fsp.writeFile(path.join(dir, "index.html"), rewritten, "utf8");
}

function collectImageUrls(data) {
  const urls = [];
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "string" && (key === "imageUrl" || key === "image")) {
        if (value.startsWith("/") || value.startsWith(BASE)) urls.push(value);
      } else if (value && typeof value === "object") walk(value);
    }
  }
  walk(data);
  return urls;
}

async function main() {
  await rimraf(dist);
  await mkdirp(dist);

  // Full assets tree — includes admin uploads in assets/promos and assets/menu.
  await copyDir(path.join(root, "assets"), path.join(dist, "assets"));

  await mkdirp(path.join(dist, "data"));
  const menuRaw = await fsp.readFile(path.join(root, "data", "menu.json"), "utf8");
  const promosRaw = await fsp.readFile(path.join(root, "data", "promos.json"), "utf8");
  const menuOut = rewriteDataJson(menuRaw);
  const promosOut = rewriteDataJson(promosRaw);
  await fsp.writeFile(path.join(dist, "data", "menu.json"), menuOut, "utf8");
  await fsp.writeFile(path.join(dist, "data", "promos.json"), promosOut, "utf8");

  for (const name of ["styles.css", "pages.css", "site.js", "map.js"]) {
    const text = await fsp.readFile(path.join(root, name), "utf8");
    await fsp.writeFile(path.join(dist, name), text, "utf8");
  }

  const menuJs = rewriteMenuJs(await fsp.readFile(path.join(root, "menu.js"), "utf8"));
  await fsp.writeFile(path.join(dist, "menu.js"), menuJs, "utf8");

  await writePage("", "index.html");
  await writePage("menu", "menu.html");
  await writePage("about", "about.html");
  await writePage("contacts", "contacts.html");
  await writePage("privacy", "privacy.html");
  /* Clean-URL aliases that the Node server maps — Pages has no rewrite table. */
  await writePage("gift", "contacts.html");
  await writePage("booking", "contacts.html");
  await writePage("shop", "menu.html");
  await writePage("takeaway", "menu.html");
  await writePage("kids", "menu.html");

  const home = await fsp.readFile(path.join(dist, "index.html"), "utf8");
  await fsp.writeFile(path.join(dist, "404.html"), home, "utf8");
  await fsp.writeFile(path.join(dist, ".nojekyll"), "", "utf8");

  // Prove every baked imageUrl resolves inside dist/.
  const menuData = JSON.parse(menuOut);
  const promosData = JSON.parse(promosOut);
  const urls = [...collectImageUrls(menuData), ...collectImageUrls(promosData)];
  let missing = 0;
  for (const url of urls) {
    const rel = url.replace(new RegExp(`^${BASE}/`), "").replace(/^\//, "");
    const file = path.join(dist, rel);
    if (!fs.existsSync(file)) {
      missing += 1;
      console.warn("missing in dist:", url, "→", rel);
    }
  }

  console.log(
    `Built static site → dist/ (base ${BASE}/), images checked: ${urls.length}, missing: ${missing}`,
  );
  if (missing) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
