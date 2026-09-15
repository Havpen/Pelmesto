/**
 * One-off: turns assetsTG references into menu-card webp tiles.
 * Run: node tools/build-menu-images.js
 */
const path = require("path");
const fsp = require("fs").promises;
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const src = path.join(root, "assetsTG");
const outMenu = path.join(root, "assets", "menu");
const outAbout = path.join(root, "assets", "about");

/** Square dish tiles: smart crop keeps the dumpling centred. */
const dishes = [
  ["IMG_2709.JPG", "pelmeni-firmennye"],
  ["IMG_2712.JPG", "pelmeni-svinina-kurica"],
  ["IMG_2718.JPG", "pelmeni-kurinoe-file"],
  ["IMG_2720.JPG", "pelmeni-cvetnye"],
  ["IMG_2716.JPG", "pelmeni-baranina-myata"],
  ["IMG_2717.JPG", "pelmeni-indeyka"],
  ["IMG_2713.JPG", "pelmeni-semga"],
  ["IMG_2715.JPG", "pelmeni-krevetka-kurica"],
  ["IMG_2701.JPG", "hinkali-svinina-govyadina"],
  ["IMG_2702.JPG", "hinkali-kurica-suluguni"],
  ["IMG_2704.JPG", "hinkali-baranina"],
  ["IMG_2703.JPG", "hinkali-assorti"],
  ["IMG_2727.JPG", "vareniki-kartoshka-grudinka"],
  ["IMG_2706.JPG", "vareniki-kartoshka-griby"],
  ["IMG_2729.JPG", "vareniki-tri-syra"],
  ["IMG_2730.JPG", "vareniki-nut-zelen"],
  ["IMG_2700.JPG", "vareniki-vishnya"],
  ["IMG_2699.JPG", "vareniki-chernika"],
  ["IMG_2708.JPG", "vareniki-kartoshka"],
  ["IMG_2710.JPG", "chebureki-myaso"],
  ["IMG_2712.JPG", "chebureki-syr"],
  ["IMG_2725.JPG", "blinchiki-kurica-griby-syr"],
  ["IMG_2722.JPG", "blinchiki-govyadina-ogurec"],
  ["IMG_2721.JPG", "blinchiki-bolonyeze"],
  ["IMG_2724.JPG", "blinchiki-yabloko-korica"],
];

/** Wide editorial photos for the About page. */
const stories = [
  ["IMG_6823.JPG", "about-hall", 1600, 1200],
  ["IMG_5350.JPG", "about-kids", 1200, 1500],
  ["IMG_6820.JPG", "about-cone", 1100, 1500],
];

async function main() {
  await fsp.mkdir(outMenu, { recursive: true });
  await fsp.mkdir(outAbout, { recursive: true });

  for (const [file, slug] of dishes) {
    const target = path.join(outMenu, `${slug}.webp`);
    await sharp(path.join(src, file))
      .rotate()
      .resize(760, 760, { fit: "cover", position: sharp.strategy.attention })
      .modulate({ brightness: 1.07, saturation: 1.14 })
      .webp({ quality: 82 })
      .toFile(target);
    console.log("dish", slug);
  }

  for (const [file, slug, w, h] of stories) {
    const target = path.join(outAbout, `${slug}.webp`);
    await sharp(path.join(src, file))
      .rotate()
      .resize(w, h, { fit: "cover", position: "centre" })
      .webp({ quality: 80 })
      .toFile(target);
    console.log("story", slug);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
