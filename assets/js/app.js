const FALLBACK_LOGO = "photos/logo.jpg";
let brandLogoSrc = FALLBACK_LOGO;

const resolvedSrcCache = new Map();
const protectedSrcCache = new Map();
const loadCheckCache = new Map();

const lb = { el: null, imgs: [], idx: 0 };

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function prioritizeMainFirst(photos = []) {
  const sorted = [...photos];
  sorted.sort((a, b) => {
    const aMain = /(^|\/)main\.(jpg|jpeg|jfif|png|webp)$/i.test(a);
    const bMain = /(^|\/)main\.(jpg|jpeg|jfif|png|webp)$/i.test(b);
    if (aMain === bMain) return a.localeCompare(b);
    return aMain ? -1 : 1;
  });
  return sorted;
}

function enableDragScroll(container) {
  let isDown = false;
  let startX = 0;
  let startScrollLeft = 0;

  container.addEventListener("mousedown", (e) => {
    isDown = true;
    container.classList.add("dragging");
    startX = e.pageX - container.offsetLeft;
    startScrollLeft = container.scrollLeft;
  });

  ["mouseleave", "mouseup"].forEach((ev) => {
    container.addEventListener(ev, () => {
      isDown = false;
      container.classList.remove("dragging");
    });
  });

  container.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - container.offsetLeft;
    container.scrollLeft = startScrollLeft - (x - startX);
  });
}

function canLoadImage(src) {
  if (loadCheckCache.has(src)) return loadCheckCache.get(src);
  const check = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
  loadCheckCache.set(src, check);
  return check;
}

async function resolvePhotoPath(src) {
  if (resolvedSrcCache.has(src)) return resolvedSrcCache.get(src);

  if (await canLoadImage(src)) {
    resolvedSrcCache.set(src, src);
    return src;
  }

  const lastSlash = src.lastIndexOf("/");
  const dir = lastSlash >= 0 ? src.slice(0, lastSlash) : "";
  const file = lastSlash >= 0 ? src.slice(lastSlash + 1) : src;
  const baseNoExt = file.replace(/\.[^.]+$/, "");
  const exts = ["jpg", "jpeg", "jfif", "png", "webp"];

  const candidates = [];
  exts.forEach((ext) => candidates.push(`${dir}/main.${ext}`));
  exts.forEach((ext) => candidates.push(`${dir}/${baseNoExt}.${ext}`));

  for (const candidate of candidates) {
    if (await canLoadImage(candidate)) {
      resolvedSrcCache.set(src, candidate);
      return candidate;
    }
  }

  resolvedSrcCache.set(src, FALLBACK_LOGO);
  return FALLBACK_LOGO;
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function buildTransparentLogo(logoImg) {
  const logoCanvas = document.createElement("canvas");
  logoCanvas.width = logoImg.naturalWidth || logoImg.width;
  logoCanvas.height = logoImg.naturalHeight || logoImg.height;
  const logoCtx = logoCanvas.getContext("2d");
  logoCtx.drawImage(logoImg, 0, 0, logoCanvas.width, logoCanvas.height);

  const imageData = logoCtx.getImageData(0, 0, logoCanvas.width, logoCanvas.height);
  const px = imageData.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const avg = (r + g + b) / 3;

    // Drop near-white pixels to remove white box background around the logo.
    if (avg > 242) {
      px[i + 3] = 0;
    } else if (avg > 225) {
      px[i + 3] = Math.min(px[i + 3], 110);
    }
  }
  logoCtx.putImageData(imageData, 0, 0);
  return logoCanvas;
}

async function getProtectedSrc(rawSrc) {
  const resolved = await resolvePhotoPath(rawSrc);
  if (protectedSrcCache.has(resolved)) return protectedSrcCache.get(resolved);

  try {
    const [photo, logo] = await Promise.all([
      loadImageElement(resolved),
      loadImageElement(brandLogoSrc).catch(() => loadImageElement(FALLBACK_LOGO))
    ]);

    const canvas = document.createElement("canvas");
    canvas.width = photo.naturalWidth || photo.width;
    canvas.height = photo.naturalHeight || photo.height;
    const ctx = canvas.getContext("2d");

    ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);

    const logoW = Math.max(90, Math.round(canvas.width * 0.22));
    const ratio = logo.naturalHeight / logo.naturalWidth || 1;
    const logoH = Math.round(logoW * ratio);
    const px = canvas.width - logoW - Math.round(canvas.width * 0.02);
    const py = canvas.height - logoH - Math.round(canvas.height * 0.02);
    const transparentLogo = buildTransparentLogo(logo);

    ctx.globalAlpha = 0.88;
    ctx.drawImage(transparentLogo, px, py, logoW, logoH);
    ctx.globalAlpha = 1;

    const protectedDataUrl = canvas.toDataURL("image/jpeg", 0.92);
    protectedSrcCache.set(resolved, protectedDataUrl);
    return protectedDataUrl;
  } catch {
    return resolved;
  }
}

function applyNoDownloadGuards(imgEl) {
  imgEl.draggable = false;
  imgEl.addEventListener("contextmenu", (e) => e.preventDefault());
}

function setupLightbox() {
  lb.el = document.createElement("div");
  lb.el.className = "lightbox";
  lb.el.innerHTML = `
    <div class="lb-dialog">
      <button class="lb-close" aria-label="Close">X</button>
      <button class="lb-prev" aria-label="Previous">&#8249;</button>
      <img class="lb-img" src="" alt="" />
      <button class="lb-next" aria-label="Next">&#8250;</button>
      <span class="lb-counter"></span>
    </div>`;
  document.body.appendChild(lb.el);

  applyNoDownloadGuards(lb.el.querySelector(".lb-img"));

  lb.el.querySelector(".lb-close").addEventListener("click", closeLightbox);
  lb.el.querySelector(".lb-prev").addEventListener("click", () => stepLightbox(-1));
  lb.el.querySelector(".lb-next").addEventListener("click", () => stepLightbox(1));
  lb.el.addEventListener("click", (e) => {
    if (e.target === lb.el) closeLightbox();
  });

  document.addEventListener("keydown", (e) => {
    if (!lb.el.classList.contains("open")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") stepLightbox(-1);
    if (e.key === "ArrowRight") stepLightbox(1);
  });
}

function openLightbox(imgs, idx) {
  lb.imgs = imgs;
  lb.idx = idx;
  refreshLightbox();
  lb.el.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  lb.el.classList.remove("open");
  document.body.style.overflow = "";
}

function stepLightbox(dir) {
  lb.idx = (lb.idx + dir + lb.imgs.length) % lb.imgs.length;
  refreshLightbox();
}

async function refreshLightbox() {
  const imgNode = lb.el.querySelector(".lb-img");
  imgNode.src = await getProtectedSrc(lb.imgs[lb.idx]);
  lb.el.querySelector(".lb-counter").textContent = `${lb.idx + 1} / ${lb.imgs.length}`;
  const many = lb.imgs.length > 1;
  lb.el.querySelector(".lb-prev").style.display = many ? "" : "none";
  lb.el.querySelector(".lb-next").style.display = many ? "" : "none";
}

function makeGallery(item) {
  const baseLabel = item.baseLabel || "All";
  const groups = [];

  if (item.photos && item.photos.length) {
    groups.push({ key: baseLabel, photos: prioritizeMainFirst(item.photos) });
  }
  if (item.variants && item.variants.options) {
    item.variants.options.forEach((opt) => {
      if (opt.photos && opt.photos.length) {
        groups.push({ key: opt.name, photos: prioritizeMainFirst(opt.photos) });
      }
    });
  }

  const wrap = el("div", "gallery");
  if (!groups.length) {
    wrap.appendChild(el("div", "gallery__placeholder", "Photos coming soon"));
    return wrap;
  }

  let chipsRow = null;
  if (item.variants && item.variants.options && item.variants.options.some((o) => o.photos && o.photos.length)) {
    chipsRow = el("div", "gallery__variants");
    if (item.photos && item.photos.length) {
      const baseChip = el("button", "variant-chip active", baseLabel);
      baseChip.dataset.key = baseLabel;
      chipsRow.appendChild(baseChip);
    }

    item.variants.options.forEach((opt) => {
      if (!opt.photos || !opt.photos.length) return;
      const chip = el("button", "variant-chip", opt.name);
      chip.dataset.key = opt.name;
      chipsRow.appendChild(chip);
    });

    wrap.appendChild(chipsRow);
    enableDragScroll(chipsRow);
  }

  const mainWrap = el("div", "gallery__main-wrap");
  const mainImg = document.createElement("img");
  mainImg.className = "gallery__main";
  mainImg.alt = item.name;
  mainImg.title = "Click to enlarge";
  mainImg.style.cursor = "pointer";
  applyNoDownloadGuards(mainImg);
  mainWrap.appendChild(mainImg);
  wrap.appendChild(mainWrap);

  const strip = el("div", "gallery__strip");
  wrap.appendChild(strip);
  enableDragScroll(strip);

  let activeGroup = groups[0];
  let activeIdx = 0;

  async function selectPhoto(group, idx, rebuildStrip) {
    activeGroup = group;
    activeIdx = idx;

    if (rebuildStrip) await buildStrip(group);

    const selectedSrc = group.photos[idx];
    mainImg.src = await getProtectedSrc(selectedSrc);

    strip.querySelectorAll(".gallery__thumb").forEach((t, i) => {
      t.classList.toggle("active", i === idx);
    });

    if (chipsRow) {
      chipsRow.querySelectorAll(".variant-chip").forEach((c) => {
        c.classList.toggle("active", c.dataset.key === group.key);
      });
    }
  }

  async function buildStrip(group) {
    strip.innerHTML = "";

    for (let i = 0; i < group.photos.length; i += 1) {
      const src = group.photos[i];
      const t = document.createElement("img");
      t.className = "gallery__thumb" + (i === activeIdx && group === activeGroup ? " active" : "");
      t.alt = "";
      t.loading = "lazy";
      t.src = await resolvePhotoPath(src);
      t.addEventListener("click", () => {
        selectPhoto(group, i, false);
      });
      strip.appendChild(t);
    }
  }

  if (chipsRow) {
    chipsRow.querySelectorAll(".variant-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const g = groups.find((gr) => gr.key === chip.dataset.key);
        if (g) selectPhoto(g, 0, true);
      });
    });
  }

  mainImg.addEventListener("click", () => openLightbox(activeGroup.photos, activeIdx));

  selectPhoto(groups[0], 0, true);
  return wrap;
}

async function loadMenu() {
  const res = await fetch("data/menu.json");
  if (!res.ok) throw new Error("Could not load menu.json");
  return res.json();
}

function renderBrand(menu) {
  document.getElementById("brand-name").textContent = menu.brand.name;
  document.getElementById("brand-tagline").textContent = menu.brand.tagline;

  const logoEl = document.getElementById("brand-logo");
  logoEl.src = menu.brand.logo;
  logoEl.alt = `${menu.brand.name} logo`;

  brandLogoSrc = menu.brand.logo || FALLBACK_LOGO;

  const notes = document.getElementById("menu-notes");
  notes.innerHTML = "";
  (menu.notes || []).forEach((note) => notes.appendChild(el("li", "", note)));
}

function renderNav(categories) {
  const nav = document.getElementById("menu-nav");
  nav.innerHTML = "";
  categories.forEach((cat) => {
    const link = document.createElement("a");
    link.href = `#${cat.id}`;
    link.textContent = cat.name;
    nav.appendChild(link);
  });
}

function renderItem(item, currency) {
  const article = el("article", "item");
  article.appendChild(makeGallery(item));

  const body = el("div", "item__body");
  const titleRow = el("div", "item__title-row");
  titleRow.appendChild(el("h3", "", item.name));
  titleRow.appendChild(el("span", "price", item.price ? `${item.price} ${currency}` : "Price on request"));
  body.appendChild(titleRow);

  body.appendChild(el("p", "item__desc", item.description || ""));

  if (item.tags && item.tags.length) {
    const tagRow = el("div", "badges");
    item.tags.forEach((t) => tagRow.appendChild(el("span", "badge", t)));
    body.appendChild(tagRow);
  }

  if (item.labels && item.labels.length) {
    const labelRow = el("div", "badges");
    item.labels.forEach((l) => labelRow.appendChild(el("span", "badge badge--dietary", l)));
    body.appendChild(labelRow);
  }

  const detailGroups = [
    ["Fillings", item.fillings],
    ["Flavors", item.flavors],
    ["Ingredients", item.ingredients],
    ["Key Notes", item.keyNotes]
  ];
  detailGroups.forEach(([label, values]) => {
    if (!Array.isArray(values) || !values.length) return;
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = label;
    details.appendChild(summary);
    const ul = document.createElement("ul");
    values.forEach((v) => ul.appendChild(el("li", "", v)));
    details.appendChild(ul);
    body.appendChild(details);
  });

  if (item.buildYourOwn) {
    body.appendChild(el("p", "byo-note", "Build Your Own - fully customizable"));
  }

  article.appendChild(body);
  return article;
}

function renderMenu(menu) {
  const root = document.getElementById("menu-root");
  root.innerHTML = "";
  menu.categories.forEach((cat) => {
    const section = el("section", "category");
    section.id = cat.id;

    const header = el("div", "category__header");
    header.appendChild(el("h2", "", cat.name));
    if (cat.description) header.appendChild(el("p", "category__focus", cat.description));
    section.appendChild(header);

    const grid = el("div", "category__grid");
    (cat.items || []).forEach((item) => grid.appendChild(renderItem(item, menu.currency)));
    section.appendChild(grid);

    root.appendChild(section);
  });
}

(async function init() {
  setupLightbox();
  try {
    const menu = await loadMenu();
    renderBrand(menu);
    renderNav(menu.categories || []);
    renderMenu(menu);
  } catch (err) {
    console.error(err);
    document.getElementById("menu-root").innerHTML =
      "<p class='error'>Unable to load menu data. Please check that you are running this via a local server (not file://).</p>";
  }
})();

