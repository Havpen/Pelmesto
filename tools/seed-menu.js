/**
 * Seeds data/menu.json from the printed menu (assetsTG/Меню 145х275) and the
 * semi-finished label sheet (assetsTG/Этикетки полуфабрикатов.xlsx).
 *
 * Re-running overwrites the file, so edit here — not by hand — while the menu
 * is still being set up. After the waiter starts editing in the admin, stop
 * running this.
 *
 * Run: node tools/seed-menu.js
 */
const path = require("path");
const fsp = require("fs").promises;
const crypto = require("crypto");

const outFile = path.join(__dirname, "..", "data", "menu.json");

/** Stable ids: same slug always maps to the same id across re-seeds. */
const id = (slug) => crypto.createHash("sha1").update(slug).digest("hex").slice(0, 12);

const img = (slug) => (slug ? `/assets/menu/${slug}.webp` : "");

/** Per-100 g values from the label sheet. */
const nutrition = {
  "pelmeni-kurinoe-file": { protein: 12.38, fat: 5.39, carbs: 18.57, kcal: 176.93 },
  "pelmeni-cvetnye": { protein: 12.32, fat: 5.2, carbs: 19.48, kcal: 178.45 },
  "pelmeni-firmennye": { protein: 8.93, fat: 10.06, carbs: 27.74, kcal: 228.11 },
  "pelmeni-svinina-kurica": { protein: 10.86, fat: 8.2, carbs: 21.39, kcal: 206.55 },
  "pelmeni-indeyka": { protein: 11.26, fat: 4.54, carbs: 22.94, kcal: 180.03 },
  "pelmeni-semga": { protein: 12.16, fat: 2.73, carbs: 21.4, kcal: 160.71 },
  "pelmeni-krevetka-kurica": { protein: 14.15, fat: 0.83, carbs: 21.78, kcal: 156.65 },
  "pelmeni-baranina-myata": { protein: 9.3, fat: 9.09, carbs: 22.96, kcal: 211.43 },
  "hinkali-svinina-govyadina": { protein: 7.8, fat: 9.98, carbs: 23.9, kcal: 215.73 },
  "hinkali-kurica-suluguni": { protein: 10.74, fat: 2.09, carbs: 23.9, kcal: 157.44 },
  "hinkali-baranina": { protein: 8.82, fat: 8.25, carbs: 23.91, kcal: 205.99 },
  "syrniki-vanilnye": { protein: 14.67, fat: 4.42, carbs: 17.24, kcal: 168.17 },
  "syrniki-syr-zelen": { protein: 16.67, fat: 7.95, carbs: 8.38, kcal: 172.11 },
};

const categories = [];
const items = [];

function category(slug, title, kind, extra = {}) {
  categories.push({
    id: id(`cat:${slug}`),
    slug,
    title,
    kind,
    order: categories.length + 1,
    note: "",
    ...extra,
  });
  return slug;
}

/**
 * `weight` is display text. `unit` decides how a guest picks quantity:
 * "pcs" = portions/pieces, "g" = grams in `step` increments priced per `priceUnit`.
 */
function item(categorySlug, data) {
  const slug = data.slug;
  items.push({
    id: id(`item:${slug}`),
    categoryId: id(`cat:${categorySlug}`),
    slug,
    title: data.title,
    description: data.description || "",
    weight: data.weight || "",
    price: data.price === undefined ? null : data.price,
    unit: data.unit || "pcs",
    step: data.step || 1,
    priceUnit: data.priceUnit || 1,
    badge: data.badge || "",
    orderable: data.orderable !== false,
    imageUrl: img(data.image),
    variants: data.variants || [],
    nutrition: nutrition[data.nutritionKey || slug] || null,
    createdAt: "2026-09-13T00:00:00.000Z",
  });
}

/* ---------------------------------------------------------------- меню зала */

category("pelmeni", "Пельмени", "hall", { note: "Порция 200 г" });
item("pelmeni", {
  slug: "pelmeni-firmennye",
  title: "Фирменные",
  description: "Свинина-говядина",
  weight: "200 г",
  price: 10.9,
  badge: "топ",
  image: "pelmeni-firmennye",
});
item("pelmeni", {
  slug: "pelmeni-kurinoe-file",
  title: "С куриным филе",
  weight: "200 г",
  price: 10.9,
  image: "pelmeni-kurinoe-file",
});
item("pelmeni", {
  slug: "pelmeni-cvetnye",
  title: "Цветные с куриным филе",
  description: "Тесто на овощных соках",
  weight: "200 г",
  price: 11.6,
  badge: "топ",
  image: "pelmeni-cvetnye",
});
item("pelmeni", {
  slug: "pelmeni-indeyka",
  title: "С филе индейки",
  description: "Тесто на морковном соке",
  weight: "200 г",
  price: 12.7,
  image: "pelmeni-indeyka",
});
item("pelmeni", {
  slug: "pelmeni-baranina-myata",
  title: "С бараниной и мятой",
  weight: "200 г",
  price: 16.0,
  image: "pelmeni-baranina-myata",
});
item("pelmeni", {
  slug: "pelmeni-krevetka-kurica",
  title: "С креветками и курицей",
  description: "Тесто на голубой матче",
  weight: "200 г",
  price: 19.7,
  image: "pelmeni-krevetka-kurica",
});
item("pelmeni", {
  slug: "pelmeni-semga",
  title: "С семгой",
  weight: "200 г",
  price: 24.0,
  image: "pelmeni-semga",
});

category("hinkali", "Хинкали", "hall", { note: "Тройную порцию, пожалуйста" });
item("hinkali", {
  slug: "hinkali-kurica-suluguni",
  title: "Курица-сулугуни",
  image: "hinkali-kurica-suluguni",
  variants: [
    { id: "p3", label: "3 шт", weight: "250 г", price: 11.0 },
    { id: "p5", label: "5 шт", weight: "430 г", price: 15.0 },
    { id: "p7", label: "7 шт", weight: "630 г", price: 19.5 },
  ],
});
item("hinkali", {
  slug: "hinkali-svinina-govyadina",
  title: "Свинина-говядина",
  image: "hinkali-svinina-govyadina",
  variants: [
    { id: "p3", label: "3 шт", weight: "250 г", price: 11.0 },
    { id: "p5", label: "5 шт", weight: "430 г", price: 15.0 },
    { id: "p7", label: "7 шт", weight: "630 г", price: 19.5 },
  ],
});
item("hinkali", {
  slug: "hinkali-baranina",
  title: "Баранина",
  image: "hinkali-baranina",
  variants: [
    { id: "p3", label: "3 шт", weight: "250 г", price: 15.0 },
    { id: "p5", label: "5 шт", weight: "430 г", price: 20.5 },
    { id: "p7", label: "7 шт", weight: "630 г", price: 25.0 },
  ],
});
item("hinkali", {
  slug: "hinkali-assorti",
  title: "Ассорти из 3-х видов",
  weight: "250 г",
  price: 13.0,
  description: "3 шт",
  image: "hinkali-assorti",
});

category("zharenoe", "Жареное", "hall");
item("zharenoe", {
  slug: "zharenye-pelmeni",
  title: "Жареные пельмени",
  description: "С курицей-свининой",
  weight: "200 г",
  price: 12.7,
  badge: "топ",
  image: "pelmeni-svinina-kurica",
});
item("zharenoe", {
  slug: "zharenye-vareniki",
  title: "Жареные вареники",
  description: "С картошкой и грудинкой",
  weight: "200 г",
  price: 12.7,
  image: "vareniki-kartoshka-grudinka",
});
item("zharenoe", {
  slug: "chebureki-svinina-govyadina",
  title: "Чебуреки со свининой-говядиной",
  description: "4 шт",
  weight: "200 г",
  price: 12.7,
  image: "chebureki-myaso",
});
item("zharenoe", {
  slug: "chebureki-syr-zelen",
  title: "Чебуреки с сыром и зеленью",
  description: "4 шт",
  weight: "200 г",
  price: 14.5,
  image: "chebureki-syr",
});
item("zharenoe", {
  slug: "zharenoe-assorti",
  title: "Жареное ассорти «Пельместо»",
  weight: "420/40/40 г",
  price: 32.0,
});

category("pirozhki", "Картофельные пирожки", "hall");
item("pirozhki", {
  slug: "pirozhki-myaso",
  title: "С мясом",
  weight: "300 г",
  price: 15.3,
});
item("pirozhki", {
  slug: "pirozhki-kapusta-griby",
  title: "С капустой и грибами",
  weight: "300 г",
  price: 15.3,
});

category("supy", "Первые блюда", "hall");
item("supy", {
  slug: "sup-lapsha-kurica",
  title: "Суп с домашней лапшой и курицей",
  weight: "300 г",
  price: 9.0,
});
item("supy", {
  slug: "okroshka",
  title: "Окрошка на кефире",
  weight: "300 г",
  price: 12.9,
});
item("supy", {
  slug: "tom-yam-pelmeni",
  title: "Бульон Том Ям с пельменями",
  description: "Креветка-курица",
  weight: "250 г",
  price: 16.0,
});

category("salaty", "Салаты", "hall");
item("salaty", { slug: "salat-grecheskiy", title: "Греческий", weight: "230 г", price: 14.9 });
item("salaty", { slug: "salat-coul-soul", title: "Коул Соул", weight: "150 г", price: 9.9 });

category("vareniki", "Вареники", "hall", { note: "Порция 220 г" });
item("vareniki", {
  slug: "vareniki-kartoshka-griby",
  title: "С картошкой и грибами",
  weight: "220 г",
  price: 10.9,
  image: "vareniki-kartoshka-griby",
});
item("vareniki", {
  slug: "vareniki-tri-syra",
  title: "Три сыра",
  weight: "220 г",
  price: 12.9,
  image: "vareniki-tri-syra",
});
item("vareniki", {
  slug: "vareniki-nut-zelen",
  title: "С нутом и зеленью",
  weight: "220 г",
  price: 12.9,
  badge: "веган",
  image: "vareniki-nut-zelen",
});
item("vareniki", {
  slug: "vareniki-chernika",
  title: "С черникой",
  weight: "220 г",
  price: 12.9,
  image: "vareniki-chernika",
});
item("vareniki", {
  slug: "vareniki-vishnya",
  title: "С вишней",
  weight: "220 г",
  price: 12.9,
  image: "vareniki-vishnya",
});

category("blinchiki", "Блинчики", "hall", { note: "Порция 200 г" });
item("blinchiki", {
  slug: "blinchiki-bolonyeze",
  title: "С мясным фаршем «Болоньезе»",
  weight: "200 г",
  price: 11.9,
  image: "blinchiki-bolonyeze",
});
item("blinchiki", {
  slug: "blinchiki-kurica-griby-syr",
  title: "С курицей, грибами и сыром",
  weight: "200 г",
  price: 11.9,
  image: "blinchiki-kurica-griby-syr",
});
item("blinchiki", {
  slug: "blinchiki-govyadina-ogurec",
  title: "С томленой говядиной и соленым огурцом",
  weight: "200 г",
  price: 11.9,
  image: "blinchiki-govyadina-ogurec",
});
item("blinchiki", {
  slug: "blinchiki-yabloko-korica",
  title: "С карамелизированными яблоками и корицей",
  weight: "200 г",
  price: 11.9,
  image: "blinchiki-yabloko-korica",
});
item("blinchiki", {
  slug: "blinchiki-tvorog-izyum",
  title: "С творогом и изюмом",
  weight: "200 г",
  price: 11.9,
});

category("syrniki", "Сырники", "hall", { note: "На завтрак, обед и ужин" });
item("syrniki", {
  slug: "syrniki-vanilnye",
  title: "Классические ванильные",
  description: "С ягодным соусом и сметаной. Без глютена, на рисовой муке",
  weight: "220 г",
  price: 10.9,
  badge: "топ",
});
item("syrniki", {
  slug: "syrniki-citrus-chia",
  title: "Цитрусовые с чиа",
  description: "Со сметаной и лимонным курдом",
  weight: "220 г",
  price: 12.6,
});
item("syrniki", {
  slug: "syrniki-shokoladnye",
  title: "Шоколадные",
  description: "С клубничным соусом и сметаной",
  weight: "220 г",
  price: 14.5,
});
item("syrniki", {
  slug: "syrniki-syr-zelen",
  title: "С сыром и зеленью",
  description: "Со сметаной",
  weight: "200 г",
  price: 12.6,
});

category("kids", "Детское меню", "hall", {
  note: "Детям до 6 лет пельмени с куриным филе бесплатно при заказе взрослой порции",
});
item("kids", {
  slug: "kids-pelmeni",
  title: "Разноцветные пельмени",
  description: "С курицей",
  weight: "200 г",
  price: 11.6,
  image: "pelmeni-cvetnye",
});
item("kids", {
  slug: "kids-hinkali",
  title: "Разноцветные хинкали",
  description: "Со свининой-курицей",
  weight: "220 г",
  price: 11.6,
  image: "hinkali-kurica-suluguni",
});

category("deserty", "Десерты", "hall");
item("deserty", {
  slug: "desert-ponchiki",
  title: "Творожные мини-пончики",
  description: "С кремом из сгущенки",
  weight: "200 г",
  price: 13.0,
});
item("deserty", {
  slug: "desert-shok-kolbasa",
  title: "Шоколадная колбаса",
  weight: "110 г",
  price: 8.5,
});
item("deserty", { slug: "desert-hvorost", title: "Хворост", weight: "80 г", price: 7.5 });
item("deserty", {
  slug: "desert-morozhenoe-karamel",
  title: "Мороженое ванильное с карамелью и орехами",
  weight: "120 г",
  price: 9.0,
});
item("deserty", {
  slug: "desert-morozhenoe-shokolad",
  title: "Мороженое ванильное с шоколадом",
  weight: "120 г",
  price: 9.0,
});

category("dobavki", "Не забудь добавить", "hall", {
  note: "Цены на добавки уточняйте у официанта",
});
item("dobavki", { slug: "dobavka-smetana", title: "Сметана", weight: "50 г", price: 2.0 });
item("dobavki", { slug: "dobavka-maslo", title: "Сливочное масло", weight: "20 г", price: 2.0 });
item("dobavki", { slug: "dobavka-bulon", title: "Бульон", weight: "100 г", price: 2.5 });
item("dobavki", { slug: "dobavka-sous-chesnok", title: "Чесночный соус", price: 2.0 });
item("dobavki", { slug: "dobavka-sous-tartar", title: "Тар-тар", price: 2.5 });
item("dobavki", { slug: "dobavka-sous-pikant", title: "Пикантный соус", price: 2.5 });
item("dobavki", { slug: "dobavka-hleb", title: "Хлеб", price: 0.8 });

category("kofe", "Кофе", "hall");
item("kofe", { slug: "kofe-espresso", title: "Эспрессо", weight: "30 мл", price: 4.5 });
item("kofe", { slug: "kofe-americano", title: "Американо", weight: "150 мл", price: 4.5 });
item("kofe", { slug: "kofe-cappuccino", title: "Капучино", weight: "250 мл", price: 5.5 });
item("kofe", { slug: "kofe-raf", title: "Раф", weight: "250 мл", price: 6.0 });
item("kofe", { slug: "kofe-latte", title: "Латте", weight: "250 мл", price: 6.0 });
item("kofe", { slug: "kofe-flat-white", title: "Флет Уайт", weight: "250 мл", price: 7.0 });
item("kofe", { slug: "kofe-frappe", title: "Фраппе", weight: "350 мл", price: 8.0 });
item("kofe", { slug: "kofe-bumble", title: "Бамбл", weight: "250 мл", price: 7.0 });
item("kofe", { slug: "kofe-ice-latte", title: "Айс Латте", weight: "350 мл", price: 8.0 });
item("kofe", {
  slug: "kofe-kakao",
  title: "Какао с маршмелоу",
  weight: "250 мл",
  price: 6.0,
});

category("chay", "Чай", "hall", { note: "Лимон и мята — 50 коп." });
item("chay", { slug: "chay-zelenyy", title: "Зеленый", weight: "400 мл", price: 6.5 });
item("chay", { slug: "chay-zelenyy-myata", title: "Зеленый с мятой", weight: "400 мл", price: 6.5 });
item("chay", { slug: "chay-chernyy", title: "Черный", weight: "400 мл", price: 6.5 });
item("chay", {
  slug: "chay-chernyy-bergamot",
  title: "Черный с бергамотом",
  weight: "400 мл",
  price: 6.5,
});
item("chay", { slug: "chay-ulun", title: "Молочный улун", weight: "400 мл", price: 8.0 });
item("chay", {
  slug: "chay-oblepiha",
  title: "Чайный напиток с облепихой",
  description: "Облепиха, апельсин, имбирь",
  variants: [
    { id: "s", label: "200 мл", weight: "200 мл", price: 5.5 },
    { id: "l", label: "600 мл", weight: "600 мл", price: 13.5 },
  ],
});
item("chay", {
  slug: "chay-zdorovye",
  title: "Чайный напиток «Здоровье»",
  description: "Имбирь, лимон, мята",
  variants: [
    { id: "s", label: "200 мл", weight: "200 мл", price: 5.5 },
    { id: "l", label: "600 мл", weight: "600 мл", price: 13.5 },
  ],
});

category("napitki", "Лимонады и напитки", "hall");
item("napitki", {
  slug: "limonad-myata-limon",
  title: "Лимонад домашний с мятой и лимоном",
  weight: "400 мл",
  price: 8.0,
});
item("napitki", {
  slug: "limonad-yagody-lavanda",
  title: "Лимонад «Лесные ягоды — Лаванда»",
  weight: "400 мл",
  price: 8.0,
});
item("napitki", {
  slug: "limonad-kivi-kryzhovnik",
  title: "Лимонад «Киви-Крыжовник»",
  weight: "400 мл",
  price: 8.0,
});
item("napitki", {
  slug: "limonad-cvetnoy",
  title: "Лимонад «Цветной»",
  description: "Апельсиновый сок, вишневый сироп, газированная вода с блю кюрасао",
  weight: "400 мл",
  price: 8.0,
});
item("napitki", {
  slug: "kvas-yablochno-myatnyy",
  title: "Яблочно-мятный квас",
  weight: "500 мл",
  price: 8.0,
});
item("napitki", {
  slug: "kvas-alivaria",
  title: "Аливария квас «Хлебный»",
  weight: "500 мл",
  price: 6.0,
});
item("napitki", {
  slug: "mors",
  title: "Морс",
  variants: [
    { id: "s", label: "200 мл", weight: "200 мл", price: 3.0 },
    { id: "l", label: "1000 мл", weight: "1000 мл", price: 15.0 },
  ],
});
item("napitki", {
  slug: "sok-rich",
  title: "Сок Rich",
  variants: [
    { id: "s", label: "200 мл", weight: "200 мл", price: 3.0 },
    { id: "l", label: "1000 мл", weight: "1000 мл", price: 15.0 },
  ],
});
item("napitki", { slug: "bonaqua", title: "Бонаква", weight: "500 мл", price: 3.0 });
item("napitki", {
  slug: "smuzi-tropicheskiy",
  title: "Смузи «Тропический»",
  weight: "350 мл",
  price: 10.0,
});
item("napitki", {
  slug: "smuzi-klubnika-banan",
  title: "Смузи «Клубника-банан»",
  weight: "350 мл",
  price: 10.0,
});
item("napitki", { slug: "smuzi-yagodnyy", title: "Смузи «Ягодный»", weight: "350 мл", price: 10.0 });

/* Бар (пиво и настойки) на сайте не показываем — только в зале по печатному меню. */

/* ---------------------------------------------------------------- заморозка */

category("frozen-pelmeni", "Пельмени", "frozen", {
  note: "Ручная лепка, шоковая заморозка. Цена за 500 г",
});
const frozenPelmeni = [
  ["frozen-pelmeni-firmennye", "Фирменные", "Свинина-говядина", "pelmeni-firmennye"],
  ["frozen-pelmeni-kurinoe-file", "С куриным филе", "", "pelmeni-kurinoe-file"],
  ["frozen-pelmeni-cvetnye", "Цветные с куриным филе", "Тесто на овощных соках", "pelmeni-cvetnye"],
  [
    "frozen-pelmeni-svinina-kurica",
    "Со свининой и курицей",
    "Идеальны для жарки",
    "pelmeni-svinina-kurica",
  ],
  ["frozen-pelmeni-indeyka", "С филе индейки", "Тесто на морковном соке", "pelmeni-indeyka"],
  ["frozen-pelmeni-baranina-myata", "С бараниной и мятой", "", "pelmeni-baranina-myata"],
  ["frozen-pelmeni-semga", "С семгой", "", "pelmeni-semga"],
  [
    "frozen-pelmeni-krevetka-kurica",
    "С креветками и курицей",
    "Тесто на голубой матче",
    "pelmeni-krevetka-kurica",
  ],
];
for (const [slug, title, description, image] of frozenPelmeni) {
  item("frozen-pelmeni", {
    slug,
    title,
    description,
    image,
    weight: "500 г",
    unit: "g",
    step: 500,
    priceUnit: 500,
    nutritionKey: image,
  });
}

category("frozen-hinkali", "Хинкали", "frozen", { note: "Цена за 500 г" });
const frozenHinkali = [
  ["frozen-hinkali-svinina-govyadina", "Свинина-говядина", "hinkali-svinina-govyadina"],
  ["frozen-hinkali-kurica-suluguni", "Курица-сулугуни", "hinkali-kurica-suluguni"],
  ["frozen-hinkali-baranina", "Баранина", "hinkali-baranina"],
];
for (const [slug, title, image] of frozenHinkali) {
  item("frozen-hinkali", {
    slug,
    title,
    image,
    weight: "500 г",
    unit: "g",
    step: 500,
    priceUnit: 500,
    nutritionKey: image,
  });
}

category("frozen-vareniki", "Вареники", "frozen", { note: "Цена за 500 г" });
const frozenVareniki = [
  ["frozen-vareniki-kartoshka-griby", "С картошкой и грибами", 14.5, "vareniki-kartoshka-griby"],
  [
    "frozen-vareniki-kartoshka-grudinka",
    "С картошкой и грудинкой",
    14.5,
    "vareniki-kartoshka-grudinka",
  ],
  ["frozen-vareniki-tri-syra", "Три сыра", 18.0, "vareniki-tri-syra"],
  ["frozen-vareniki-nut-zelen", "С нутом и зеленью", 18.0, "vareniki-nut-zelen"],
  ["frozen-vareniki-chernika", "С черникой", 18.0, "vareniki-chernika"],
  ["frozen-vareniki-vishnya", "С вишней", 18.0, "vareniki-vishnya"],
];
for (const [slug, title, price, image] of frozenVareniki) {
  item("frozen-vareniki", {
    slug,
    title,
    price,
    image,
    weight: "500 г",
    unit: "g",
    step: 500,
    priceUnit: 500,
  });
}

category("frozen-blinchiki", "Блинчики", "frozen", { note: "Цена за 1 шт (100 г)" });
const frozenBlinchiki = [
  ["frozen-blinchiki-bolonyeze", "С мясным фаршем «Болоньезе»", "blinchiki-bolonyeze"],
  ["frozen-blinchiki-kurica-griby-syr", "С курицей, грибами и сыром", "blinchiki-kurica-griby-syr"],
  [
    "frozen-blinchiki-govyadina-ogurec",
    "С томленой говядиной и соленым огурцом",
    "blinchiki-govyadina-ogurec",
  ],
  [
    "frozen-blinchiki-yabloko-korica",
    "С карамелизированными яблоками и корицей",
    "blinchiki-yabloko-korica",
  ],
  ["frozen-blinchiki-tvorog-izyum", "С творогом и изюмом", ""],
  ["frozen-blinchiki-vanilnye", "Ванильные", ""],
  ["frozen-blinchiki-syr-zelen", "С сыром и зеленью", ""],
];
for (const [slug, title, image] of frozenBlinchiki) {
  item("frozen-blinchiki", {
    slug,
    title,
    image,
    weight: "1 шт / 100 г",
    price: 3.9,
  });
}

category("frozen-chebureki", "Чебуреки", "frozen", { note: "Цена за 500 г" });
item("frozen-chebureki", {
  slug: "frozen-chebureki-myaso",
  title: "С мясом",
  description: "Свинина-говядина",
  image: "chebureki-myaso",
  weight: "500 г",
  unit: "g",
  step: 500,
  priceUnit: 500,
});
item("frozen-chebureki", {
  slug: "frozen-chebureki-syr",
  title: "С сыром и зеленью",
  image: "chebureki-syr",
  weight: "500 г",
  unit: "g",
  step: 500,
  priceUnit: 500,
});

category("frozen-syrniki", "Сырники", "frozen", {
  note: "Полуфабрикат творожный шоковой заморозки. Цена за 500 г",
});
item("frozen-syrniki", {
  slug: "frozen-syrniki-vanilnye",
  title: "Ванильные",
  description: "Творог 5%, рисовая мука — без глютена",
  weight: "500 г",
  unit: "g",
  step: 500,
  priceUnit: 500,
  nutritionKey: "syrniki-vanilnye",
});
item("frozen-syrniki", {
  slug: "frozen-syrniki-syr-zelen",
  title: "С сыром и зеленью",
  description: "Творог 5%, сулугуни и российский, укроп",
  weight: "500 г",
  unit: "g",
  step: 500,
  priceUnit: 500,
  nutritionKey: "syrniki-syr-zelen",
});

/* -------------------------------------------------------------------- write */

async function main() {
  const missingPrice = items.filter((entry) => entry.orderable && entry.price === null && !entry.variants.length);
  await fsp.writeFile(
    outFile,
    `${JSON.stringify({ version: 2, categories, items }, null, 2)}\n`,
    "utf8",
  );
  console.log(`categories: ${categories.length}, items: ${items.length}`);
  if (missingPrice.length) {
    console.log(`\nбез цены (${missingPrice.length}) — заполнить в админке:`);
    for (const entry of missingPrice) console.log(`  - ${entry.slug}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
