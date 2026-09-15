/* One-off: strips the «Бар» category and its items out of data/menu.json.
   Surgical rather than a re-seed, so prices filled in via the admin survive. */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "data", "menu.json");
const menu = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));

const bar = menu.categories.find((c) => c.slug === "bar");
if (!bar) {
  console.log("no bar category — nothing to do");
  process.exit(0);
}

const dropped = menu.items.filter((i) => i.categoryId === bar.id);
menu.categories = menu.categories.filter((c) => c.id !== bar.id);
menu.items = menu.items.filter((i) => i.categoryId !== bar.id);

fs.writeFileSync(file, JSON.stringify(menu, null, 2) + "\n", "utf8");

console.log("removed category:", bar.title, "(" + bar.id + ")");
dropped.forEach((i) => console.log("  - " + i.title));
console.log("\nleft:", menu.categories.length, "categories,", menu.items.length, "items");
