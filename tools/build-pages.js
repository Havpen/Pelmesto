/**
 * Build a static snapshot for GitHub Pages.
 * Pages has no Node API, so /api/* is rewritten to data/*.json and orders
 * are disabled with a clear client-side message.
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
  if (!urlPath.startsWith("/")) return urlPath;
  if (urlPath === "/") return `${BASE}/`;
  return `${BASE}${urlPath}`;
}

/** Rewrite site-root absolute paths so they resolve under /Pelmesto/. */
function rewriteHtml(html) {
  let out = html;

  // API → static JSON
  out = out.replaceAll('fetch("/api/promos"', `fetch("${BASE}/data/promos.json"`);
  out = out.replaceAll("fetch('/api/promos'", `fetch('${BASE}/data/promos.json'`);

  // Common absolute asset / page links
  out = out.replace(
    /(href|src)=["']\/(?!\/)([^"']+)["']/g,
    (_, attr, p) => `${attr}="${withBase("/" + p)}"`,
  );

  // Inline script strings that point at root paths (maps, analytics-safe)
  out = out.replaceAll('"/menu', `"${BASE}/menu`);
  out = out.replaceAll('"/about', `"${BASE}/about`);
  out = out.replaceAll('"/contacts', `"${BASE}/contacts`);
  out = out.replaceAll('"/assets/', `"${BASE}/assets/`);
  out = out.replaceAll("'/#", `'${BASE}/#`);

  // Logo / home links that went to "/"
  out = out.replaceAll('href="/"', `href="${BASE}/"`);
  out = out.replaceAll(`href="${BASE}/"`, `href="${BASE}/"`);

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

function rewriteSiteJs(js) {
  // No absolute fetches today; keep as-is.
  return js;
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

async function main() {
  await rimraf(dist);
  await mkdirp(dist);

  await copyDir(path.join(root, "assets"), path.join(dist, "assets"));
  await mkdirp(path.join(dist, "data"));
  await fsp.copyFile(path.join(root, "data", "menu.json"), path.join(dist, "data", "menu.json"));
  await fsp.copyFile(path.join(root, "data", "promos.json"), path.join(dist, "data", "promos.json"));

  for (const name of ["styles.css", "pages.css", "site.js", "map.js"]) {
    let text = await fsp.readFile(path.join(root, name), "utf8");
    if (name === "site.js") text = rewriteSiteJs(text);
    await fsp.writeFile(path.join(dist, name), text, "utf8");
  }

  const menuJs = rewriteMenuJs(await fsp.readFile(path.join(root, "menu.js"), "utf8"));
  await fsp.writeFile(path.join(dist, "menu.js"), menuJs, "utf8");

  await writePage("", "index.html");
  await writePage("menu", "menu.html");
  await writePage("about", "about.html");
  await writePage("contacts", "contacts.html");

  // Soft 404 → home for unknown paths on project Pages.
  const home = await fsp.readFile(path.join(dist, "index.html"), "utf8");
  await fsp.writeFile(path.join(dist, "404.html"), home, "utf8");

  await fsp.writeFile(
    path.join(dist, ".nojekyll"),
    "",
    "utf8",
  );

  console.log(`Built static site → dist/ (base ${BASE}/)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
