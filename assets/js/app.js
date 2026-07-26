const FALLBACK_LOGO = "photos/logo.jpg";
let brandLogoSrc = FALLBACK_LOGO;

const resolvedSrcCache = new Map();
const protectedSrcCache = new Map();
const loadCheckCache = new Map();

const DEFAULT_CONTACT_LINKS = {
  whatsapp: "https://wa.me/962797330008",
  instagram: "https://www.instagram.com/baj.cookies/",
  facebook: "https://www.facebook.com/bajcookies.jo"
};

const DEV_CACHE_KEY = `cb=${Date.now()}`;

const lb = { el: null, imgs: [], idx: 0 };

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function withCacheBust(url) {
  if (!url || url.startsWith("data:")) return url;
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}${DEV_CACHE_KEY}`;
}

function prioritizeMainFirst(photos = []) {
  function isMainPath(p) {
    if (!p) return false;
    // normalize backslashes, strip query/hash
    const cleaned = p.replace(/\\+/g, "/").split(/[?#]/)[0];
    const seg = cleaned.split("/").pop();
    const name = seg.replace(/\.[^.]+$/, "");
    return /^main$/i.test(name);
  }

  const sorted = [...photos];
  sorted.sort((a, b) => {
    const aMain = isMainPath(a);
    const bMain = isMainPath(b);
    if (aMain === bMain) return String(a).localeCompare(String(b));
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
    img.src = withCacheBust(src);
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
    img.src = withCacheBust(src);
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

function enableSwipeNavigation(target, onSwipeLeft, onSwipeRight, minDistance = 40) {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  target.addEventListener(
    "touchstart",
    (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      tracking = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    },
    { passive: true }
  );

  target.addEventListener(
    "touchend",
    (e) => {
      if (!tracking || !e.changedTouches || !e.changedTouches.length) return;
      tracking = false;

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const dx = endX - startX;
      const dy = endY - startY;

      if (Math.abs(dx) < minDistance) return;
      if (Math.abs(dx) <= Math.abs(dy) * 1.2) return;

      if (dx < 0) onSwipeLeft();
      else onSwipeRight();
    },
    { passive: true }
  );
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
  enableSwipeNavigation(
    lb.el.querySelector(".lb-img"),
    () => stepLightbox(1),
    () => stepLightbox(-1)
  );
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

  function movePhotoBy(step) {
    if (!activeGroup.photos.length) return;
    const nextIdx = (activeIdx + step + activeGroup.photos.length) % activeGroup.photos.length;
    selectPhoto(activeGroup, nextIdx, false);
  }

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

    // If a sibling `main.*` exists next to these photos, prefer it and move to front.
    if (group.photos && group.photos.length) {
      try {
        const sample = String(group.photos[0] || "").replace(/\\\\+/g, "/");
        const lastSlash = sample.lastIndexOf("/");
        const dir = lastSlash >= 0 ? sample.slice(0, lastSlash) : "";
        const exts = ["jpg", "jpeg", "jfif", "png", "webp"];
        for (const ext of exts) {
          const candidate = dir ? `${dir}/main.${ext}` : `main.${ext}`;
          if (await canLoadImage(candidate)) {
            const foundIndex = group.photos.findIndex((p) => String(p).replace(/\\\\+/g, "/").split(/[?#]/)[0] === candidate);
            if (foundIndex > 0) {
              const [m] = group.photos.splice(foundIndex, 1);
              group.photos.unshift(m);
            } else if (foundIndex === -1) {
              group.photos.unshift(candidate);
            }
            break;
          }
        }
      } catch (e) {
        // ignore errors and continue rendering
      }
    }

    // Build a deduplicated list by resolved path to avoid duplicate thumbnails
    const deduped = [];
    const seen = new Set();
    for (let i = 0; i < group.photos.length; i += 1) {
      const src = group.photos[i];
      // resolve the real file we'll use for this src
      // eslint-disable-next-line no-await-in-loop
      const resolved = await resolvePhotoPath(src);
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      deduped.push({ src, resolved });
    }

    for (let i = 0; i < deduped.length; i += 1) {
      const { src, resolved } = deduped[i];
      const t = document.createElement("img");
      t.className = "gallery__thumb" + (i === activeIdx && group === activeGroup ? " active" : "");
      t.alt = "";
      t.loading = "lazy";
      t.src = resolved;
      // capture index i for selection: map back to group's index by resolved path
      t.addEventListener("click", () => {
        const idx = deduped.findIndex((d) => d.resolved === resolved);
        selectPhoto(group, idx, false);
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
  enableSwipeNavigation(mainImg, () => movePhotoBy(1), () => movePhotoBy(-1));

  selectPhoto(groups[0], 0, true);
  return wrap;
}

async function loadMenu() {
  const res = await fetch(withCacheBust("data/menu.json"), { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load menu.json");
  return res.json();
}

function renderBrand(menu) {
  document.getElementById("brand-name").textContent = menu.brand.name;
  document.getElementById("brand-tagline").textContent = menu.brand.tagline;

  const logoEl = document.getElementById("brand-logo");
  logoEl.src = withCacheBust(menu.brand.logo);
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

function renderContactBubble(links = DEFAULT_CONTACT_LINKS) {
  const oldNode = document.querySelector(".contact-fab");
  if (oldNode) oldNode.remove();

  const root = el("div", "contact-fab");
  const panel = el("div", "contact-fab__panel");
  panel.setAttribute("aria-hidden", "true");

  const panelTitle = el("p", "contact-fab__title", "Contact us");
  panel.appendChild(panelTitle);

  const contactRows = [
    {
      label: "WhatsApp",
      href: links.whatsapp,
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.1 4.9A9.95 9.95 0 0 0 12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.6 1.4 5.1L2 22l5-1.3c1.5.8 3.2 1.3 5 1.3h.1c5.5 0 9.9-4.5 9.9-10 0-2.7-1-5.2-2.9-7.1ZM12.1 20c-1.6 0-3.2-.4-4.5-1.2l-.3-.2-3 .8.8-2.9-.2-.3A7.8 7.8 0 0 1 4 12c0-4.4 3.6-8 8-8 2.1 0 4.1.8 5.7 2.4A8 8 0 0 1 20 12c0 4.4-3.5 8-7.9 8Zm4.4-5.8c-.2-.1-1.3-.6-1.5-.7-.2-.1-.3-.1-.4.1-.1.2-.5.7-.6.9-.1.1-.2.1-.4 0-.2-.1-.9-.3-1.7-1-.6-.5-1-1.2-1.2-1.4-.1-.2 0-.3.1-.4l.3-.3.2-.3c.1-.1 0-.3 0-.4l-.7-1.6c-.2-.4-.3-.3-.4-.3h-.4c-.1 0-.3.1-.5.3-.2.2-.7.7-.7 1.8 0 1 .7 2.1.8 2.3.1.2 1.4 2.3 3.5 3.1.5.2.9.4 1.2.5.5.2 1 .2 1.3.1.4-.1 1.3-.6 1.5-1.2.2-.6.2-1 .1-1.1 0-.1-.2-.2-.4-.3Z"/></svg>'
    },
    {
      label: "Instagram",
      href: links.instagram,
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3.5A5.5 5.5 0 1 1 6.5 13 5.5 5.5 0 0 1 12 7.5Zm0 2A3.5 3.5 0 1 0 15.5 13 3.5 3.5 0 0 0 12 9.5ZM18 6.3a1.2 1.2 0 1 1-1.2 1.2A1.2 1.2 0 0 1 18 6.3Z"/></svg>'
    },
    {
      label: "Facebook",
      href: links.facebook,
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.9.3-1.5 1.6-1.5h1.7V5c-.3 0-1.4-.1-2.6-.1-2.6 0-4.3 1.5-4.3 4.3V11H7v3h2.9v8h3.6Z"/></svg>'
    }
  ];

  contactRows.forEach((row) => {
    if (!row.href) return;
    const a = el("a", "contact-fab__link");
    a.href = row.href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("aria-label", row.label);
    a.innerHTML = `
      <span class="contact-fab__icon" aria-hidden="true">${row.icon}</span>
      <span class="contact-fab__link-label">${row.label}</span>
    `;
    panel.appendChild(a);
  });

  const toggle = el("button", "contact-fab__toggle", "Contact");
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Open contact links");
  toggle.setAttribute("aria-expanded", "false");

  toggle.addEventListener("click", () => {
    const isOpen = root.classList.toggle("open");
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    panel.setAttribute("aria-hidden", isOpen ? "false" : "true");
  });

  document.addEventListener("click", (e) => {
    if (!root.classList.contains("open")) return;
    if (root.contains(e.target)) return;
    root.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    panel.setAttribute("aria-hidden", "true");
  });

  root.appendChild(panel);
  root.appendChild(toggle);
  document.body.appendChild(root);
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
  renderContactBubble(DEFAULT_CONTACT_LINKS);
  try {
    const menu = await loadMenu();
    renderBrand(menu);
    renderNav(menu.categories || []);
    renderMenu(menu);

    if (menu.brand && menu.brand.contacts) {
      renderContactBubble({
        whatsapp: menu.brand.contacts.whatsapp || DEFAULT_CONTACT_LINKS.whatsapp,
        instagram: menu.brand.contacts.instagram || DEFAULT_CONTACT_LINKS.instagram,
        facebook: menu.brand.contacts.facebook || DEFAULT_CONTACT_LINKS.facebook
      });
    }
  } catch (err) {
    console.error(err);
    document.getElementById("menu-root").innerHTML =
      "<p class='error'>Unable to load menu data. Please check that you are running this via a local server (not file://).</p>";
  }
})();

