/* ════════════════════════════════════════════════════════
   THE RANGOON KITCHEN — app.js  (Flask / PythonAnywhere)
   Reads live data from Flask API:
     GET /api/menu      → active menu items
     GET /api/status    → settings, hours, holiday, is_open
     GET /api/categories → category list
════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────
   FALLBACK DATA  (shown only if API fails)
───────────────────────────────────────────  */
const FALLBACK_MENU = [
  {
    id: "mohinga",
    name_en: "Mohinga",
    name_my: "မုန့်ဟင်းခါး",
    description: "Myanmar's beloved breakfast noodle soup. Fish-based broth with vermicelli, crispy fritters, and a boiled egg.",
    price: 2500,
    original_price: null,
    category: "noodles",
    is_popular: 1,
    is_special: 0,
    is_active: 1,
    image_url: "https://images.unsplash.com/photo-1555126634-323283e090fa?w=800&q=80",
  },
  {
    id: "shan-noodles",
    name_en: "Shan Noodles",
    name_my: "ရှမ်းခေါက်ဆွဲ",
    description: "Flat Shan-style noodles tossed in sesame oil, served with tomato & minced pork topping.",
    price: 3000,
    original_price: 3500,
    category: "noodles",
    is_popular: 0,
    is_special: 1,
    is_active: 1,
    image_url: "https://images.unsplash.com/photo-1626844131082-256783844137?w=800&q=80",
  },
  {
    id: "chicken-curry",
    name_en: "Myanmar Chicken Curry",
    name_my: "ကြက်သားဟင်း",
    description: "Slow-cooked in fragrant turmeric, ginger & lemongrass. Served with steamed white rice.",
    price: 4500,
    original_price: null,
    category: "curry",
    is_popular: 1,
    is_special: 0,
    is_active: 1,
    image_url: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80",
  },
];

const FALLBACK_STATUS = {
  settings: {
    siteName:     "The Rangoon Kitchen",
    messengerUrl: "https://m.me/YourPageUsername",
    phoneNumber:  "+959XXXXXXXX",
    deliveryZone: "Thaketa Township",
    deliveryTime: "45–60 Min",
    is_open:      "true",
  },
  today_hours: { open: "08:00", close: "20:00", closed: false },
  holiday:     null,
  is_open:     true,
};

/* ─────────────────────────────────────────
   SITE STATE  (filled after API load)
───────────────────────────────────────────  */
let MENU_ITEMS  = [];
let SITE_CONFIG = {};
let STATUS_DATA = FALLBACK_STATUS;

function buildConfig(settings) {
  const phone = settings.phoneNumber || "+959XXXXXXXX";
  return {
    siteName:     settings.siteName     || "The Rangoon Kitchen",
    messengerUrl: settings.messengerUrl || "https://m.me/YourPageUsername",
    phoneNumber:  phone.startsWith("tel:") ? phone : "tel:" + phone,
    deliveryZone: settings.deliveryZone || "Thaketa Township",
    deliveryTime: settings.deliveryTime || "45–60 Min",
    isOpen:       settings.is_open === "true" || settings.is_open === true,
  };
}

/* ─────────────────────────────────────────
   FETCH HELPERS
───────────────────────────────────────────  */
async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ─────────────────────────────────────────
   LOAD ALL DATA FROM FLASK API
───────────────────────────────────────────  */
async function loadFromAPI() {
  try {
    const [menu, status] = await Promise.all([
      apiFetch("/api/menu"),
      apiFetch("/api/status"),
    ]);
    MENU_ITEMS  = menu;          // already filtered is_active=1 by Flask
    STATUS_DATA = status;
    SITE_CONFIG = buildConfig(status.settings);
  } catch (err) {
    console.warn("[RK] API load failed, using fallback data.", err);
    MENU_ITEMS  = FALLBACK_MENU;
    STATUS_DATA = FALLBACK_STATUS;
    SITE_CONFIG = buildConfig(FALLBACK_STATUS.settings);
  }
}

/* ─────────────────────────────────────────
   KITCHEN OPEN / CLOSED STATUS
───────────────────────────────────────────  */
function getKitchenStatus() {
  // Manual override from admin settings
  if (!STATUS_DATA.is_open) {
    return { open: false, reason: "manual" };
  }

  // Holiday
  if (STATUS_DATA.holiday) {
    return { open: false, reason: "holiday", msg: STATUS_DATA.holiday };
  }

  // Day hours from server
  const h = STATUS_DATA.today_hours;
  if (!h || h.closed) return { open: false, reason: "day-closed" };

  const toMin = t => { const [hr, mn] = t.split(":").map(Number); return hr * 60 + mn; };
  const now   = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (nowMin < toMin(h.open) || nowMin >= toMin(h.close)) {
    return { open: false, reason: "outside-hours", opensAt: h.open, closesAt: h.close };
  }

  return { open: true, closesAt: h.close };
}

/* ─────────────────────────────────────────
   CLOSED BANNER
───────────────────────────────────────────  */
function renderClosedBanner() {
  const existing = document.getElementById("rk-closed-banner");
  if (existing) existing.remove();

  const status = getKitchenStatus();
  if (status.open) return;

  const msgs = {
    "manual":        "The kitchen is temporarily closed. Please check back soon!",
    "holiday":       `We are closed today${status.msg ? ": " + status.msg : " for a holiday"}. See you soon!`,
    "day-closed":    "The kitchen is closed today. See you tomorrow!",
    "outside-hours": `We are currently closed.${status.opensAt ? " We open at <strong>" + status.opensAt + "</strong> today." : ""}`,
  };

  const banner = document.createElement("div");
  banner.id = "rk-closed-banner";
  banner.setAttribute("role", "alert");
  banner.style.cssText = [
    "background:linear-gradient(135deg,rgba(192,57,43,0.10),rgba(192,57,43,0.04))",
    "border:1px solid rgba(192,57,43,0.30)",
    "border-radius:10px",
    "padding:14px 20px",
    "margin:0 0 28px",
    "display:flex",
    "align-items:center",
    "gap:14px",
  ].join(";");
  banner.innerHTML = `
    <span style="font-size:22px;flex-shrink:0;">🔴</span>
    <div>
      <div style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#c0392b;margin-bottom:3px;">
        Kitchen Closed · မဖွင့်သေးပါ
      </div>
      <p style="font-size:13px;color:rgba(245,240,232,0.65);line-height:1.5;margin:0;">
        ${msgs[status.reason] || "We are currently closed."}
      </p>
    </div>
  `;

  const menuSection = document.querySelector("section[aria-label='Menu']");
  if (menuSection) menuSection.insertAdjacentElement("beforebegin", banner);
}

/* ─────────────────────────────────────────
   FORMAT PRICE
───────────────────────────────────────────  */
function formatMMK(amount) {
  return Number(amount).toLocaleString("my-MM") + " ကျပ်";
}

/* ─────────────────────────────────────────
   BUILD MENU CARD
   Note: Flask returns snake_case (name_en, name_my, is_popular, etc.)
───────────────────────────────────────────  */
function buildMenuCard(item) {
  const msUrl    = SITE_CONFIG.messengerUrl;
  const phone    = SITE_CONFIG.phoneNumber;
  const orderMsg = encodeURIComponent(`မင်္ဂလာပါ! ${item.name_en} (${item.name_my}) မှာချင်ပါတယ်။`);
  const msLink   = `${msUrl}?text=${orderMsg}`;

  let badge = "";
  if (item.is_special) {
    badge = `<span class="card-popular-badge" style="background:var(--gold-pale);color:#000;">✨ Today's Special</span>`;
  } else if (item.is_popular) {
    badge = `<span class="card-popular-badge">Popular</span>`;
  } else {
    badge = `<span class="card-category-pill">${item.category || ""}</span>`;
  }

  const strikeHtml = item.original_price
    ? `<span class="card-price-original">${formatMMK(item.original_price)}</span>` : "";

  return `
    <article class="menu-card reveal" aria-label="${item.name_en}">
      <div class="card-img-wrap">
        <img
          src="${item.image_url || "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80"}"
          alt="${item.name_en}"
          loading="lazy"
          onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80'"
        />
        ${badge}
      </div>
      <div class="card-body">
        <div class="card-top-row">
          <div class="card-names">
            <h3 class="card-name-en">${item.name_en}</h3>
            <p class="card-name-my">${item.name_my}</p>
          </div>
          <div>
            <div class="card-price-badge">${formatMMK(item.price)}</div>
            ${strikeHtml}
          </div>
        </div>
        <p class="card-desc">${item.description || ""}</p>
        <div class="card-ctas">
          <a href="${msLink}" target="_blank" rel="noopener"
             class="btn-messenger" aria-label="Order ${item.name_en} via Messenger">
            <svg viewBox="0 0 24 24">
              <path d="M12 2c-5.522 0-10 4.3-10 9.6 0 5.3 4.478 9.6 10 9.6 1.134 0 2.222-.182 3.23-.518l3.15 1.834c.465.27.994-.176.841-.692l-1.01-3.398c2.192-1.854 3.491-4.468 3.491-7.326 0-5.3-4.478-9.6-10-9.6zm1 12.5l-2.5-2.5-4.5 2.5 5-5.5 2.5 2.5 4.5-2.5-5 5.5z"/>
            </svg>
            <span>Messenger မှ မှာယူရန်</span>
          </a>
          <a href="${phone}" class="btn-phone" aria-label="Call to order ${item.name_en}">
            <svg viewBox="0 0 24 24">
              <path d="M20 22.621l-3.521-6.795c-.008.004-1.974.97-2.064 1.011-2.24 1.086-6.714-7.78-4.489-8.923.087-.045 2.053-.997 2.053-.997l-3.522-6.796s-1.667.816-2.107 1.031c-3.111 1.517-4.225 6.012-1.393 11.488 3.4 6.577 8.351 9.932 12.926 7.712.44-.215 2.117-1.031 2.117-1.031z"/>
            </svg>
          </a>
        </div>
      </div>
    </article>
  `;
}

/* ─────────────────────────────────────────
   RENDER MENU (with filter)
───────────────────────────────────────────  */
function renderMenu(filter = "all") {
  const grid    = document.getElementById("menu-grid");
  const counter = document.getElementById("menu-count");
  if (!grid) return;

  let items = MENU_ITEMS;
  if (filter === "specials") {
    items = MENU_ITEMS.filter(m => m.is_special);
  } else if (filter !== "all") {
    items = MENU_ITEMS.filter(m => (m.category || "").toLowerCase() === filter.toLowerCase());
  }

  if (items.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:56px 24px;">
        <div style="font-size:40px;margin-bottom:14px;opacity:0.4;">🍽️</div>
        <div style="font-size:15px;font-weight:600;color:var(--text-muted);">No items in this category</div>
        <div style="font-size:13px;color:var(--text-faint);margin-top:4px;">Try a different filter</div>
      </div>`;
  } else {
    grid.innerHTML = items.map(buildMenuCard).join("");
  }

  if (counter) {
    counter.textContent = items.length < 10 ? `0${items.length}` : `${items.length}`;
  }

  initReveal();
}

/* ─────────────────────────────────────────
   FILTER BUTTONS  (built from live categories)
───────────────────────────────────────────  */
function buildFilterButtons() {
  const wrap = document.querySelector(".menu-filters");
  if (!wrap) return;

  const hasSpecials = MENU_ITEMS.some(m => m.is_special);
  const cats = [...new Set(MENU_ITEMS.map(m => m.category).filter(Boolean))];

  wrap.innerHTML =
    `<button class="filter-btn active" data-filter="all">All Menu</button>` +
    (hasSpecials ? `<button class="filter-btn" data-filter="specials">✨ Today's Specials</button>` : "") +
    cats.map(c =>
      `<button class="filter-btn" data-filter="${c}">${c.charAt(0).toUpperCase() + c.slice(1)}</button>`
    ).join("");

  wrap.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      wrap.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderMenu(btn.getAttribute("data-filter"));
    });
  });
}

/* ─────────────────────────────────────────
   APPLY DYNAMIC SETTINGS TO STATIC HTML ELEMENTS
───────────────────────────────────────────  */
function applySettings() {
  // Phone links
  document.querySelectorAll('a[href^="tel:"]').forEach(a => {
    a.href = SITE_CONFIG.phoneNumber;
  });

  // Delivery zone
  const zoneEn = document.querySelector(".zone-en");
  if (zoneEn) {
    zoneEn.innerHTML = `Currently delivering within <strong>${SITE_CONFIG.deliveryZone}</strong> only.`;
  }
  const zoneMy = document.querySelector(".zone-my strong");
  if (zoneMy) zoneMy.textContent = SITE_CONFIG.deliveryZone;

  // Delivery time badge
  document.querySelectorAll(".badge").forEach(b => {
    if (b.textContent.includes("Delivery")) {
      b.textContent = SITE_CONFIG.deliveryTime + " Delivery";
    }
  });

  // Footer hours from today_hours
  const h = STATUS_DATA.today_hours;
  if (h && !h.closed) {
    const footerNote = document.querySelector(".footer-note");
    if (footerNote) {
      const firstLine = footerNote.innerHTML.split("<br>")[0];
      footerNote.innerHTML = firstLine.replace(
        /\d+:\d+.*?\d+:\d+/,
        `${h.open} – ${h.close}`
      ) + footerNote.innerHTML.slice(footerNote.innerHTML.indexOf("<br>"));
    }
  }
}

/* ─────────────────────────────────────────
   SCROLL REVEAL ANIMATION
───────────────────────────────────────────  */
function initReveal() {
  const els = document.querySelectorAll(".reveal:not(.visible)");
  if (!window.IntersectionObserver) {
    els.forEach(el => el.classList.add("visible"));
    return;
  }
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.05 });
  els.forEach(el => obs.observe(el));
}

/* ─────────────────────────────────────────
   LOADING SCREEN DISMISS
───────────────────────────────────────────  */
function dismissLoader() {
  const screen = document.getElementById("loading-screen");
  if (!screen) return;
  screen.classList.add("hidden");
  setTimeout(() => { if (screen.parentNode) screen.remove(); }, 700);
}

/* ─────────────────────────────────────────
   LIVE REFRESH  — poll API every 30s
   (handles admin changes from any device)
───────────────────────────────────────────  */
async function refreshFromAPI() {
  try {
    const [menu, status] = await Promise.all([
      apiFetch("/api/menu"),
      apiFetch("/api/status"),
    ]);

    const changed =
      JSON.stringify(menu)   !== JSON.stringify(MENU_ITEMS) ||
      JSON.stringify(status) !== JSON.stringify(STATUS_DATA);

    if (changed) {
      MENU_ITEMS  = menu;
      STATUS_DATA = status;
      SITE_CONFIG = buildConfig(status.settings);

      const activeFilter = document.querySelector(".filter-btn.active");
      const currentFilter = activeFilter ? activeFilter.getAttribute("data-filter") : "all";

      applySettings();
      buildFilterButtons();
      renderMenu(currentFilter);
      renderClosedBanner();
    }
  } catch (err) {
    console.warn("[RK] Refresh failed:", err);
  }
}

/* ─────────────────────────────────────────
   BOOT
───────────────────────────────────────────  */
document.addEventListener("DOMContentLoaded", async () => {
  // Load data then render
  await loadFromAPI();

  try {
    applySettings();
    buildFilterButtons();
    renderMenu("all");
    renderClosedBanner();
    initReveal();
  } catch (err) {
    console.error("[RK] Boot error:", err);
  }

  // Dismiss loader after render (or safety timeout in index.html handles it)
  dismissLoader();

  // Poll every 30s — picks up admin changes from any device
  setInterval(refreshFromAPI, 30000);
});
