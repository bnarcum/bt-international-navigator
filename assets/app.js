import { createGraph } from "./graph.js?v=0.2.7";
import { createPanel } from "./panel.js";
import { createSolutionsApi } from "./solutions.js";
import { createSolutionsUI } from "./solutions-ui.js";
import {
  groupProducts,
  hoodForFamily,
  hoodForOutcome,
  hoodForPractice,
  hoodForProduct,
  hoodForSolution,
  oemById,
  oemFamilyCounts,
  oemProductsOn,
  productsOn,
  renderEdge,
} from "./hood.js?v=0.14.3";
import { markSvg } from "./marks.js";

const BUILD = "0.1.0";

const DATA_PATHS = {
  config: "config/app.json",
  families: "catalog/families.json",
  links: "catalog/links.json",
  solutions: "catalog/solutions.json",
  outcomes: "outcomes/outcomes.json",
  oems: "catalog/oems.json",
  products: "catalog/products.json",
  oemProducts: "catalog/oem-products.json",
};

const state = {
  config: null,
  families: [],
  links: [],
  solutions: [],
  outcomes: [],
  labs: [],
  atc: [],
  learning: [],
  oems: [],
  products: [],
  oemProducts: [],
  viewMode: "seller",
  filterPillar: "",
  filterCategories: new Set(),
  articleId: "",
  focus: { kind: "home", id: "" },
  path: [],
  startWith: "practice",
  oemFilter: "",
  portfolioSearch: "",
  highlightSku: "",
  sellerCue: "",
};

let graph = null;
let panel = null;
let solutionsUI = null;
let solutionsApi = null;

function esc(str) {
  const el = document.createElement("span");
  el.textContent = str ?? "";
  return el.innerHTML;
}

async function loadData() {
  const entries = await Promise.all(
    Object.entries(DATA_PATHS).map(async ([key, path]) => {
      const res = await fetch(`${path}?v=${BUILD}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
      return [key, await res.json()];
    })
  );
  for (const [key, data] of entries) {
    if (key === "config") state.config = data;
    else if (key === "families") state.families = data.families || [];
    else if (key === "links") state.links = data.links || [];
    else if (key === "solutions") state.solutions = data.solutions || [];
    else if (key === "outcomes") state.outcomes = data.outcomes || [];
    else if (key === "oems") state.oems = data.oems || [];
    else if (key === "products") state.products = data.products || [];
    else if (key === "oemProducts") state.oemProducts = data.oemProducts || [];
  }
}

function syncTopbarHeight() {
  const h = document.getElementById("app-chrome")?.offsetHeight || 48;
  document.documentElement.style.setProperty("--topbar-h", `${h}px`);
}

function practiceById(id) {
  return state.config.pillars.find((p) => p.id === id);
}

function pn(id) {
  return practiceById(id)?.name || id;
}

function filteredFamilies() {
  return state.families;
}

function filteredLinks(families) {
  const ids = new Set(families.map((f) => f.id));
  return state.links.filter((l) => ids.has(l.source) && ids.has(l.target));
}

function mark(pillar, size = 16) {
  return markSvg(pillar, size);
}

function oemName(id) {
  return state.oems.find((o) => o.id === id)?.name || id;
}

function familyChips(familyIds) {
  if (!familyIds?.length) return "";
  return `<div class="cap-chips">${familyIds
    .map((fid) => {
      const f = state.families.find((x) => x.id === fid);
      if (!f) return "";
      return `<button type="button" class="cap-chip" data-kind="family" data-id="${esc(fid)}">${mark(f.pillar, 12)}${esc(f.name)}</button>`;
    })
    .join("")}</div>`;
}

function pnBase() {
  return state.config?.links?.portfolioNavigator || "https://bnarcum.github.io/cisco-portfolio-navigator/";
}

function pnFamilyUrl(familyId) {
  return `${pnBase()}#family=${encodeURIComponent(familyId)}`;
}

function pnProductUrl(productId) {
  return `${pnBase()}#product=${encodeURIComponent(productId)}`;
}

function productsForTopic(familyId) {
  const prefer = {
    connectivity: ["networking", "security"],
    collaboration: ["workplace"],
    managed: ["networking", "security", "workplace"],
  }[portfolioForFamily(familyId)?.id] || [];
  return state.products
    .filter((p) => (p.families || []).includes(familyId))
    .sort((a, b) => Number(prefer.includes(b.group)) - Number(prefer.includes(a.group)))
    .slice(0, 8);
}

function linkHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const GROUP_MARK = {
  workplace: "collaboration",
  networking: "connectivity",
  security: "managed",
};

const QUIET_PARTNERS = {
  sase: ["Fortinet", "Netskope", "Zscaler"],
  "global-fabric": ["Fortinet", "Netskope", "Zscaler"],
  "uc-edge": ["Microsoft Teams", "Zoom"],
};

function resolveCatalogFocus(id) {
  if (!id) return null;
  const key = decodeURIComponent(id);
  if (state.products.some((p) => p.id === key)) return { familyId: key, skuId: null };
  const sku = state.oemProducts.find((p) => p.id === key);
  if (sku) return { familyId: sku.family, skuId: sku.id };
  const needle = key.toLowerCase();
  const skuByName = state.oemProducts.find(
    (p) => p.name.toLowerCase() === needle || p.name.toLowerCase().includes(needle)
  );
  if (skuByName) return { familyId: skuByName.family, skuId: skuByName.id };
  const fam = state.products.find((p) => p.id === needle || p.name.toLowerCase().includes(needle));
  if (fam) return { familyId: fam.id, skuId: null };
  return null;
}

function portfolioById(id) {
  return state.config.portfolios?.find((p) => p.id === id);
}

function portfolioForFamily(familyId) {
  return state.config.portfolios?.find((p) => p.families?.includes(familyId));
}

function syncHash() {
  const { kind, id } = state.focus;
  let next = "";
  if (state.viewMode === "seller") {
    if (kind === "portfolio" && id) next = `#p=${encodeURIComponent(id)}`;
    else if (kind === "family" && id) next = `#t=${encodeURIComponent(id)}`;
    const href = location.pathname + location.search + next;
    if (location.pathname + location.search + location.hash !== href) history.replaceState(null, "", href);
    return;
  }
  if (kind === "product" && id) {
    const params = new URLSearchParams();
    const product = state.products.find((p) => p.id === id);
    const oem = product?.oem || state.oemFilter;
    if (oem) params.set("oem", oem);
    params.set("product", id);
    if (state.highlightSku) params.set("sku", state.highlightSku);
    next = `#${params.toString()}`;
  } else if (kind === "home" && state.oemFilter) {
    next = `#oem=${encodeURIComponent(state.oemFilter)}`;
  } else {
    return;
  }
  const href = location.pathname + location.search + next;
  if (location.pathname + location.search + location.hash !== href) {
    history.replaceState(null, "", href);
  }
}

function applyHashFocus() {
  const raw = location.hash.replace(/^#/, "");
  if (!raw) return;
  const params = new URLSearchParams(raw);
  const topic = params.get("t");
  const portfolio = params.get("p");
  if (!params.get("product") && !params.get("oem") && !params.get("sku")) {
    if (topic && state.families.some((f) => f.id === topic)) {
      state.viewMode = "seller";
      state.focus = { kind: "family", id: topic };
      const port = portfolioForFamily(topic);
      state.path = port ? [{ kind: "portfolio", id: port.id, label: port.name }] : [];
      return;
    }
    if (portfolio && portfolioById(portfolio)) {
      state.viewMode = "seller";
      state.focus = { kind: "portfolio", id: portfolio };
      state.path = [];
      return;
    }
  }
  state.viewMode = "map";
  const oem = params.get("oem");
  const sku = params.get("sku");
  const product = params.get("product");
  const focus = resolveCatalogFocus(sku || product);
  if (oem) state.oemFilter = oem;
  if (focus) {
    if (!state.oemFilter) {
      const skuRow = state.oemProducts.find((p) => p.id === focus.skuId);
      state.oemFilter = skuRow?.oem || state.products.find((p) => p.id === focus.familyId)?.oem || "cisco";
    }
    state.focus = { kind: "product", id: focus.familyId };
    state.highlightSku = focus.skuId || sku || "";
    state.path = state.oemFilter ? [] : [{ kind: "product", id: focus.familyId, label: labelFor("product", focus.familyId) }];
  } else if (oem) {
    state.focus = { kind: "home", id: "" };
    state.path = [];
  }
}

function scrollToHighlightSku(root) {
  if (!state.highlightSku || !root) return;
  const skuEl = root.querySelector(`#sku-${CSS.escape(state.highlightSku)}`);
  if (!skuEl) return;
  skuEl.classList.add("sku-hot");
  skuEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function skuCount(familyId) {
  return state.oemProducts.filter((p) => p.family === familyId).length;
}

function productCard(p, { compact = false } = {}) {
  const count = skuCount(p.id);
  return `
    <article class="product-card${compact ? " compact" : ""}">
      <button type="button" class="product-head hood-item" data-kind="product" data-id="${esc(p.id)}">
        <strong>${esc(p.name)}</strong>
        ${count ? `<span class="product-meta">${count} product${count === 1 ? "" : "s"}</span>` : ""}
        ${p.why && !compact ? `<span>${esc(p.why)}</span>` : ""}
      </button>
      <p class="map-label">On the map</p>
      ${familyChips(p.families)}
    </article>`;
}

function skuRow(p) {
  const status = p.status && p.status !== "current" ? `<span class="sku-status ${esc(p.status)}">${esc(p.status.toUpperCase())}</span>` : "";
  const pn = pnProductUrl(p.id);
  return `
    <div class="sku-row-wrap" id="sku-${esc(p.id)}">
      <a class="sku-row" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">
        <span class="sku-name">${esc(p.name)}${status}</span>
        ${p.desc ? `<span class="sku-desc">${esc(p.desc)}</span>` : ""}
      </a>
      <a class="sku-pn" href="${esc(pn)}" target="_blank" rel="noopener noreferrer" title="Open in Portfolio Navigator">PN ↗</a>
    </div>`;
}

function skuSection(skus, title = "Products in this family") {
  if (!skus?.length) return "";
  const current = skus.filter((p) => p.status === "current");
  const legacy = skus.filter((p) => p.status !== "current");
  const body = `
    ${current.length ? `<div class="sku-list">${current.map(skuRow).join("")}</div>` : ""}
    ${legacy.length ? `<details class="sku-legacy"><summary>${legacy.length} EOS / EOL</summary><div class="sku-list">${legacy.map(skuRow).join("")}</div></details>` : ""}`;
  return section(title, body);
}

function productSection(products, title) {
  if (!products?.length) return "";
  return section(title, `<div class="product-grid">${products.map((p) => productCard(p)).join("")}</div>`);
}

function applyOemLens() {
  if (!graph?.setOem) return;
  graph.setOem(state.oemFilter ? oemFamilyCounts(state, state.oemFilter) : null);
}

function visibleProducts(list) {
  if (!list?.length) return [];
  if (!state.oemFilter) return list;
  return list.filter((p) => p.oem === state.oemFilter);
}

function renderOemChips() {
  const el = document.getElementById("oem-lens");
  if (!el) return;
  el.innerHTML = `<button type="button" class="oem-chip${state.oemFilter ? "" : " on"}" data-oem="">All</button>${state.oems
    .map((o) => `<button type="button" class="oem-chip${state.oemFilter === o.id ? " on" : ""}" data-oem="${esc(o.id)}">${esc(o.name)}</button>`)
    .join("")}`;
}

function btn(kind, id, title, sub, pillar) {
  return `
    <button type="button" class="hood-item" data-kind="${esc(kind)}" data-id="${esc(id)}">
      <strong>${pillar ? mark(pillar) : ""}${esc(title)}</strong>
      ${sub ? `<span>${esc(sub)}</span>` : ""}
    </button>`;
}

function labelFor(kind, id) {
  if (kind === "home") return "Start";
  if (kind === "portfolio") return portfolioById(id)?.name || id;
  if (kind === "practice") return pn(id);
  if (kind === "family") return state.families.find((f) => f.id === id)?.name || id;
  if (kind === "solution") return state.solutions.find((s) => s.id === id)?.name || id;
  if (kind === "outcome") return state.outcomes.find((o) => o.id === id)?.outcome || "Outcome";
  if (kind === "product") return state.products.find((p) => p.id === id)?.name || id;
  return id;
}

function updatePath(kind, id) {
  if (kind === "home") {
    state.path = [];
    return;
  }
  const existing = state.path.findIndex((c) => c.kind === kind && c.id === id);
  if (existing >= 0) {
    state.path = state.path.slice(0, existing + 1);
    return;
  }
  if (kind === "portfolio") {
    state.path = [{ kind, id, label: labelFor(kind, id) }];
    return;
  }
  if (kind === "practice") {
    state.path = [{ kind, id, label: labelFor(kind, id) }];
    return;
  }
  if (kind === "family") {
    const port = portfolioForFamily(id);
    state.path = port ? [{ kind: "portfolio", id: port.id, label: port.name }] : [];
  }
  if (kind === "family" && state.path.length === 0) {
    const f = state.families.find((x) => x.id === id);
    if (f) state.path = [{ kind: "practice", id: f.pillar, label: labelFor("practice", f.pillar) }];
  }
  state.path = [...state.path, { kind, id, label: labelFor(kind, id) }].slice(-6);
}

function canvasHint() {
  const { kind, id } = state.focus;
  if (kind === "home") {
    if (state.oemFilter) {
      const oem = oemName(state.oemFilter);
      return `${oem} lens is on. Pick a family — chips show which map tokens it touches.`;
    }
    return state.startWith === "outcome"
      ? "Pick a result on the right — or click a token."
      : "Pick a domain on the right — or click a token.";
  }
  if (kind === "practice") return `You are in ${pn(id)}. Open a product next.`;
  if (kind === "family") return state.oemFilter ? "Cisco families for this product are below. Walk a bridge next." : "Next step is on the right. Hover a walk to light it on the map.";
  if (kind === "solution") return "Open a capability to walk the stack.";
  if (kind === "outcome") return "Pick an offering or a capability to continue.";
  if (kind === "product") return "Open a capability chip — or click its token on the map.";
  return "Click a token — or continue in the panel.";
}

function renderOemTrail() {
  return `<nav class="trail" aria-label="Path">
    <button type="button" class="trail-c" data-kind="home" data-id="home" data-clear-oem="1">Start</button>
    <span class="trail-sep" aria-hidden="true">/</span>
    <span class="trail-now">${esc(oemName(state.oemFilter))}</span>
  </nav>`;
}

function renderTrail() {
  if (!state.path.length) return "";
  const crumbs = [{ kind: "home", id: "home", label: "Start" }, ...state.path];
  return `<nav class="trail" aria-label="Path">
    ${crumbs
      .map((c, i) => {
        const last = i === crumbs.length - 1;
        return last
          ? `<span class="trail-now">${esc(c.label)}</span>`
          : `<button type="button" class="trail-c" data-kind="${esc(c.kind)}" data-id="${esc(c.id)}">${esc(c.label)}</button>`;
      })
      .join(`<span class="trail-sep" aria-hidden="true">/</span>`)}
  </nav>`;
}

function youAre(kicker, title, lede, pillar) {
  return `
    <div class="you-are">
      ${pillar ? `<div class="ya-mark m-${esc(pillar)}">${mark(pillar, 28)}</div>` : ""}
      <p class="hood-kicker">${esc(kicker)}</p>
      <h1>${esc(title)}</h1>
      ${lede ? `<p class="hood-lede">${esc(lede)}</p>` : ""}
    </div>`;
}

function walks(edges, extra = {}) {
  const focus = { ...state.focus, ...extra };
  return `<div class="walk-list">${edges.map((e) => renderEdge(e, pn, mark, focus)).join("")}</div>`;
}

function nextWalks(h, limit = 6) {
  const local = (h.edges || []).filter((e) => e.from && e.to && e.from.pillar === e.to.pillar);
  const cross = h.cross || [];
  return [...cross, ...local].slice(0, limit);
}

function section(title, body) {
  return body ? `<section class="hood-sec"><h2>${esc(title)}</h2>${body}</section>` : "";
}

function resourceRow(l) {
  return `
    <a class="lab-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">
      ${esc(l.name)}
      <span>${esc(l.hint || l.level || "Open source page")}</span>
    </a>`;
}

function bindHoodClicks(root) {
  if (root.dataset.walkBound === "1") return;
  root.dataset.walkBound = "1";
  root.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-start]");
    if (tab) {
      state.startWith = tab.dataset.start;
      renderHood();
      return;
    }
    const el = e.target.closest("[data-kind][data-id]");
    if (!el || !root.contains(el) || el.tagName === "A") return;
    e.preventDefault();
    if (el.dataset.clearOem === "1") {
      state.oemFilter = "";
      state.portfolioSearch = "";
    }
    focusOn(el.dataset.kind, el.dataset.id);
  });
  root.addEventListener("mouseover", (e) => {
    const step = e.target.closest(".walk-step[data-id]");
    graph?.setHover?.(step?.dataset.id || null);
  });
  root.addEventListener("mouseleave", () => graph?.setHover?.(null));
}

function renderOemPortfolio() {
  const oem = oemById(state, state.oemFilter);
  if (!oem) return renderHomeHood();
  const q = state.portfolioSearch.trim().toLowerCase();
  const groups = groupProducts(state, state.oemFilter)
    .map((g) => ({
      ...g,
      products: g.products.filter((p) => {
        if (!q) return true;
        const hay = `${p.name} ${p.why || ""}`.toLowerCase();
        return hay.includes(q) || oemProductsOn(state, { familyId: p.id, oemId: p.oem }).some((s) => `${s.name} ${s.desc}`.toLowerCase().includes(q));
      }),
    }))
    .filter((g) => g.products.length);
  const totalFamilies = productsOn(state, { oemId: state.oemFilter }).length;
  const totalSkus = state.oemProducts.filter((p) => p.oem === state.oemFilter).length;
  return `
    ${renderOemTrail()}
    <p class="hood-kicker">${esc(oem.name)} portfolio</p>
    <h1>Where does ${esc(oem.name)} sit?</h1>
    <p class="hood-lede">${esc(oem.lede || "Pick a product family. The chips show which capabilities it maps to on the connection map.")}</p>
    <p class="portfolio-stats">${totalFamilies} families${totalSkus ? ` · ${totalSkus} products` : ""}</p>
    <input type="search" class="portfolio-search" id="portfolio-search" placeholder="Filter families or products…" value="${esc(state.portfolioSearch)}" autocomplete="off" spellcheck="false">
    ${groups.length ? groups
      .map(
        (g) => `
      <section class="hood-sec portfolio-sec">
        <h2>${esc(g.group.name)}</h2>
        ${g.group.desc ? `<p class="portfolio-desc">${esc(g.group.desc)}</p>` : ""}
        <div class="product-grid">${g.products.map((p) => productCard(p)).join("")}</div>
      </section>`
      )
      .join("") : `<p class="empty">No matches for “${esc(state.portfolioSearch)}”.</p>`}
    <p class="site-note">${esc(state.config.disclaimer)}</p>`;
}

function renderHomeHood() {
  if (state.oemFilter) return renderOemPortfolio();
  const doors = state.config.pillars.map((p) => ({
    p,
    caps: state.families.filter((f) => f.pillar === p.id).length,
  }));
  const practicePane = `
    <div class="door-grid">
      ${doors
        .map(
          (d) => `
        <button type="button" class="door" data-kind="practice" data-id="${esc(d.p.id)}">
          <div class="ya-mark m-${esc(d.p.id)}">${mark(d.p.id, 22)}</div>
          <div>
            <h3>${esc(d.p.name)}</h3>
            <p>${esc(d.p.desc)}</p>
            <span>${d.caps} capabilities</span>
          </div>
        </button>`
        )
        .join("")}
    </div>`;
  const resultPane = `<div class="hood-list">${state.outcomes.map((o) => btn("outcome", o.id, o.outcome, o.symptom, o.pillar)).join("")}</div>`;
  const lede =
    state.startWith === "outcome"
      ? "Pick the business result. Then walk the stack that gets there."
      : "Pick a domain, open a product, walk one connection at a time. The map follows you.";
  const pane = state.startWith === "outcome" ? resultPane : practicePane;
  return `
    ${renderTrail()}
    <p class="hood-kicker">BT International Navigator</p>
    <h1>Where do you want to start?</h1>
    <p class="hood-lede">${lede}</p>
    <div class="start-tabs">
      <button type="button" class="start-tab${state.startWith === "practice" ? " on" : ""}" data-start="practice">A domain</button>
      <button type="button" class="start-tab${state.startWith === "outcome" ? " on" : ""}" data-start="outcome">A result</button>
    </div>
    ${pane}
    <p class="site-note">${esc(state.config.disclaimer)}</p>`;
}

function renderHood() {
  const root = document.getElementById("hood");
  const { kind, id } = state.focus;
  let html = "";
  let lens = [];
  let selected = "";

  if (kind === "home" || !id) {
    html = renderHomeHood();
  } else if (kind === "family") {
    const h = hoodForFamily(state, id);
    if (!h) {
      state.focus = { kind: "home", id: "" };
      html = renderHomeHood();
    } else {
      lens = h.neighborIds;
      selected = h.family.id;
      html = `
        ${renderTrail()}
        ${youAre(`You are in ${pn(h.family.pillar)}`, h.family.name, h.family.desc, h.family.pillar)}
        ${section("Next step", walks(nextWalks(h)))}
        ${productSection(visibleProducts(h.products), state.oemFilter ? `${oemName(state.oemFilter)} here` : "Cisco families on this product")}
        ${section("Used in", `<div class="hood-list compact">${h.offerings.map((s) => btn("solution", s.id, s.name, s.lede, s.pillar)).join("") || "<p class='empty'>None tagged in this snapshot.</p>"}</div>`)}
        ${h.labs.length ? section("On BT International", h.labs.map(resourceRow).join("")) : ""}`;
    }
  } else if (kind === "solution") {
    const h = hoodForSolution(state, id);
    if (!h) {
      state.focus = { kind: "home", id: "" };
      html = renderHomeHood();
    } else {
      lens = h.neighborIds;
      selected = (h.fams[0] && h.fams[0].id) || "";
      html = `
        ${renderTrail()}
        ${youAre(`Offering · ${pn(h.solution.pillar)}`, h.solution.name, h.solution.lede || h.solution.desc, h.solution.pillar)}
        <a class="text-link" href="${esc(h.solution.url)}" target="_blank" rel="noopener noreferrer">Open on BT International</a>
        ${section("Capabilities in this offering", `<div class="hood-list">${h.fams.map((f) => btn("family", f.id, f.name, f.desc, f.pillar)).join("")}</div>`)}
        ${productSection(visibleProducts(h.products), "Products in this offering")}
        ${h.outcomes.length ? section("Results it serves", `<div class="hood-list compact">${h.outcomes.map((o) => btn("outcome", o.id, o.outcome, o.symptom, o.pillar)).join("")}</div>`) : ""}`;
    }
  } else if (kind === "outcome") {
    const h = hoodForOutcome(state, id);
    if (!h) {
      state.focus = { kind: "home", id: "" };
      html = renderHomeHood();
    } else {
      lens = h.neighborIds;
      selected = (h.fams[0] && h.fams[0].id) || "";
      const o = h.outcome;
      html = `
        ${renderTrail()}
        ${youAre(`Result · ${pn(o.pillar)}`, o.outcome, o.symptom, o.pillar)}
        ${
          o.proof
            ? `<div class="proof-line"><div><em>Before</em>${esc(o.proof.before)}</div><span class="arrow">→</span><div><em>After</em>${esc(o.proof.after)}</div></div>`
            : ""
        }
        ${section("Next: an offering that gets there", `<div class="hood-list">${h.offerings.map((s) => btn("solution", s.id, s.name, s.lede, s.pillar)).join("")}</div>`)}
        ${section("Or a capability on the map", `<div class="hood-list compact">${h.fams.map((f) => btn("family", f.id, f.name, pn(f.pillar), f.pillar)).join("")}</div>`)}`;
    }
  } else if (kind === "practice") {
    const h = hoodForPractice(state, id);
    if (!h) {
      state.focus = { kind: "home", id: "" };
      html = renderHomeHood();
    } else {
      lens = h.neighborIds;
      html = `
        ${renderTrail()}
        ${youAre("You are in this domain", h.practice.name, h.practice.story || h.practice.desc, h.practice.id)}
        ${section("Next: pick a product", `<div class="hood-list">${h.fams.map((f) => btn("family", f.id, f.name, f.desc, f.pillar)).join("")}</div>`)}
        ${h.cross.length ? section("Or leave this domain", walks(h.cross.slice(0, 4))) : ""}
        ${productSection(visibleProducts(h.products), state.oemFilter ? `${oemName(state.oemFilter)} in ${h.practice.name}` : "Cisco families in this domain")}
        ${h.offerings.length ? section("Offerings", `<div class="hood-list compact">${h.offerings.map((s) => btn("solution", s.id, s.name, s.lede, s.pillar)).join("")}</div>`) : ""}`;
    }
  } else if (kind === "product") {
    const h = hoodForProduct(state, id);
    if (!h) {
      state.focus = { kind: "home", id: "" };
      html = renderHomeHood();
    } else {
      lens = h.neighborIds;
      selected = (h.fams[0] && h.fams[0].id) || "";
      const group = oemById(state, h.product.oem)?.portfolio?.find((g) => g.id === h.product.group);
      html = `
        ${renderTrail()}
        ${youAre(group ? `${oemName(h.product.oem)} · ${group.name}` : `${oemName(h.product.oem)} · Product`, h.product.name, h.product.why, h.fams[0]?.pillar || "")}
        <div class="product-links">
          <a class="text-link" href="${esc(h.product.url)}" target="_blank" rel="noopener noreferrer">${h.product.url.includes("international.bt.com") ? "Open on BT International" : "View Cisco family"}</a>
          <a class="text-link secondary" href="${esc(pnFamilyUrl(h.product.id))}" target="_blank" rel="noopener noreferrer">Open in Portfolio Navigator</a>
        </div>
        ${section("On the connection map", familyChips(h.fams.map((f) => f.id)))}
        ${skuSection(h.skus)}
        ${h.offerings.length ? section("BT offerings", `<div class="hood-list compact">${h.offerings.map((s) => btn("solution", s.id, s.name, s.lede, s.pillar)).join("")}</div>`) : ""}`;
    }
  }

  root.innerHTML = html;
  bindHoodClicks(root);
  root.querySelector("#portfolio-search")?.addEventListener("input", (e) => {
    state.portfolioSearch = e.target.value;
    renderHood();
  });
  scrollToHighlightSku(root);
  if (graph) {
    graph.setLens(lens, selected);
    applyOemLens();
  }
  const hint = document.querySelector(".canvas-hint");
  if (hint) hint.textContent = canvasHint();
  const startBtn = document.getElementById("solutions-btn");
  if (startBtn) startBtn.classList.toggle("on", kind === "home" && state.startWith === "outcome");
}

function renderSeller() {
  const root = document.getElementById("seller");
  if (!root) return;
  const { kind, id } = state.focus;
  let html = "";
  if (kind === "portfolio" && portfolioById(id)) html = renderPortfolioPage(portfolioById(id));
  else if (kind === "family") html = renderTopicPage(id);
  else html = renderSellerHome();
  root.innerHTML = html;
  if (root.dataset.bound !== "1") {
    root.dataset.bound = "1";
    root.addEventListener("click", (e) => {
      const el = e.target.closest("[data-kind][data-id]");
      if (!el || !root.contains(el) || el.tagName === "A") return;
      e.preventDefault();
      state.sellerCue = "";
      focusOn(el.dataset.kind, el.dataset.id, { map: el.dataset.map === "1" });
    });
  }
}

function sellerTrail() {
  const crumbs = [{ kind: "home", id: "home", label: "Start" }];
  if (state.focus.kind === "portfolio") {
    crumbs.push({ kind: "portfolio", id: state.focus.id, label: labelFor("portfolio", state.focus.id) });
  } else if (state.focus.kind === "family") {
    const port = portfolioForFamily(state.focus.id);
    if (port) crumbs.push({ kind: "portfolio", id: port.id, label: port.name });
    crumbs.push({ kind: "family", id: state.focus.id, label: labelFor("family", state.focus.id) });
  }
  if (crumbs.length < 2) return "";
  return `<nav class="trail" aria-label="Path">
    ${crumbs
      .map((c, i) => {
        const last = i === crumbs.length - 1;
        const sep = i ? `<span class="trail-sep" aria-hidden="true">›</span>` : "";
        return last
          ? `${sep}<span class="trail-now">${esc(c.label)}</span>`
          : `${sep}<button type="button" class="trail-c" data-kind="${esc(c.kind)}" data-id="${esc(c.id)}">${esc(c.label)}</button>`;
      })
      .join("")}
  </nav>`;
}

function portfolioArt(id) {
  const arts = {
    connectivity: `<svg class="art" viewBox="0 0 160 160" aria-hidden="true">
      <circle class="glow" cx="80" cy="80" r="62"/>
      <circle cx="80" cy="80" r="50" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.28"/>
      <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
        <path class="dash" d="M50 98 C64 52, 98 46, 114 72"/>
        <path class="dash" d="M46 74 C74 90, 96 58, 118 106"/>
      </g>
      <g fill="currentColor">
        <circle cx="50" cy="98" r="5"/><circle cx="114" cy="72" r="5"/>
        <circle class="pulse" cx="80" cy="56" r="6.5"/><circle cx="118" cy="106" r="4.5"/><circle cx="46" cy="74" r="4"/>
      </g>
    </svg>`,
    collaboration: `<svg class="art" viewBox="0 0 160 160" aria-hidden="true">
      <circle class="glow" cx="80" cy="80" r="62"/>
      <g class="spin" fill="none" stroke="currentColor" stroke-width="1.6">
        <circle cx="56" cy="66" r="15"/><circle cx="104" cy="66" r="15"/><circle cx="80" cy="104" r="15"/>
        <path d="M68 76 L76 92 M92 76 L84 92" opacity=".8"/>
      </g>
      <circle class="pulse" cx="56" cy="66" r="4" fill="currentColor"/>
      <circle class="pulse" cx="104" cy="66" r="4" fill="currentColor"/>
      <circle class="pulse" cx="80" cy="104" r="4" fill="currentColor"/>
    </svg>`,
    managed: `<svg class="art" viewBox="0 0 160 160" aria-hidden="true">
      <circle class="glow" cx="80" cy="80" r="62"/>
      <circle class="spin ring" cx="80" cy="80" r="50" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="4 7" opacity="0.75"/>
      <path fill="currentColor" d="M80 44 l24 9 v18 c0 16-10 28-24 34-14-6-24-18-24-34 V53 z"/>
      <path fill="none" stroke="#0c0c10" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M70 80 l7 8 14-16"/>
    </svg>`,
  };
  return arts[id] || arts.connectivity;
}

function sellerSky() {
  return `<div class="seller-sky" aria-hidden="true"><span class="orb orb-a"></span><span class="orb orb-b"></span><span class="orb orb-c"></span></div>`;
}

function deviceBridge(place) {
  const names = state.families.find((f) => f.id === "collab-devices")?.seller?.joins || [
    "Microsoft Teams",
    "Zoom",
    "Google Meet",
  ];
  const chips = names.map((name) => `<span class="partner meet">${esc(name)}</span>`).join("");
  if (place === "topic") {
    return `
      <div class="join-board">
        <p class="arch-k">Also joins</p>
        <div class="meet-fan">${chips}</div>
      </div>`;
  }
  return `
    <div class="device-bridge">
      <button type="button" class="partner cisco gap" data-kind="family" data-id="collab-devices">Cisco devices</button>
      <span class="arch-dash" aria-hidden="true"></span>
      <div class="meet-fan">
        <span class="arch-k">Also joins</span>
        ${chips}
      </div>
    </div>`;
}

function archNode(id, label, extra = "") {
  return `<button type="button" class="arch-node ${extra}" data-kind="family" data-id="${esc(id)}">${esc(label)}</button>`;
}

function architectureDiagram() {
  return `
    <figure class="arch" aria-label="How BT International products connect">
      <div class="arch-band">
        <p class="arch-k">Access</p>
        <div class="arch-row">
          ${archNode("dia", "Direct Internet Access")}
          ${archNode("icr", "Internet Connect Reach")}
          <span class="arch-arrow" aria-hidden="true">→</span>
          ${archNode("global-fabric", "Global Fabric", "arch-core")}
        </div>
      </div>
      <div class="arch-band">
        <p class="arch-k">On the fabric</p>
        <div class="arch-row">
          ${archNode("sdwan", "SD-WAN")}
          <span class="arch-arrow" aria-hidden="true">→</span>
          ${archNode("sase", "SASE / SSE")}
        </div>
        <div class="arch-partners">
          <button type="button" class="partner cisco" data-kind="family" data-id="sdwan">Cisco SD-WAN</button>
          <button type="button" class="partner cisco" data-kind="family" data-id="sase">Cisco Secure Access</button>
          <span class="partner quiet">Fortinet</span>
          <span class="partner quiet">Netskope</span>
          <span class="partner quiet">Zscaler</span>
        </div>
      </div>
      <div class="arch-band">
        <p class="arch-k">Voice</p>
        <div class="arch-row">
          ${archNode("global-voice", "Global Voice")}
          <span class="arch-arrow" aria-hidden="true">→</span>
          ${archNode("uc-edge", "UC Edge")}
        </div>
        <div class="arch-partners">
          <button type="button" class="partner cisco" data-kind="family" data-id="webex-calling">Webex</button>
          <span class="partner quiet">Microsoft Teams</span>
          <span class="partner quiet">Zoom</span>
        </div>
        ${deviceBridge()}
      </div>
      <div class="arch-band arch-wrap">
        ${archNode("ops-fabric", "Ops Fabric — operates network, voice, and security", "arch-core")}
      </div>
    </figure>`;
}

function renderSellerHome() {
  const doors = state.config.portfolios || [];
  const list = doors.length
    ? doors
        .map(
          (p, i) => `
          <button type="button" class="port-card tone-${esc(p.id)}" style="--i:${i}" data-kind="portfolio" data-id="${esc(p.id)}">
            <span class="port-art">${portfolioArt(p.id)}</span>
            <span class="port-copy">
              <strong>${esc(p.name)}</strong>
              <span class="port-line">${esc(p.line)}</span>
            </span>
          </button>`
        )
        .join("")
    : `<p class="seller-line">The portfolio list did not load. Hard-refresh this page.</p>`;
  return `
    ${sellerSky()}
    <div class="seller-wrap seller-home">
      <p class="hood-kicker">Where do you start?</p>
      <h1>Choose one.</h1>
      <div class="port-grid">${list}</div>
      <h2>How the products connect</h2>
      ${architectureDiagram()}
      <p class="seller-foot">${esc(state.config.disclaimer || "")}</p>
    </div>`;
}

function renderPortfolioPage(port) {
  const topics = (port.families || []).map((fid) => state.families.find((f) => f.id === fid)).filter(Boolean);
  return `
    ${sellerSky()}
    <div class="seller-wrap tone-${esc(port.id)}">
      <div class="folio-hero">
        <div>
          ${sellerTrail()}
          <h1>${esc(port.name)}</h1>
          <p class="seller-line">${esc(port.line)}</p>
        </div>
        <div class="folio-art">${portfolioArt(port.id)}</div>
      </div>
      <div class="topic-list">
        ${topics
          .map(
            (f, i) => `
          <button type="button" class="topic-row" style="--i:${i}" data-kind="family" data-id="${esc(f.id)}">
            <span class="topic-n">${String(i + 1).padStart(2, "0")}</span>
            <span class="seller-row-copy">
              <strong>${esc(f.name)}</strong>
              <span>${esc(f.seller?.sentence || f.desc)}</span>
            </span>
            <span class="seller-go" aria-hidden="true">›</span>
          </button>`
          )
          .join("")}
      </div>
    </div>`;
}

function renderTopicPage(id) {
  const f = state.families.find((x) => x.id === id);
  if (!f) return renderSellerHome();
  const seller = f.seller || {};
  const next = seller.next;
  const cisco = productsForTopic(f.id);
  const port = portfolioForFamily(f.id);
  const quiet = QUIET_PARTNERS[f.id] || [];
  const proof = seller.proof || [];
  const parts = seller.parts || [];
  const sell = cisco.length
    ? `<h2>Cisco</h2><div class="sell-grid">${cisco
        .map((p) => {
          const host = linkHost(p.url);
          return `<a class="sell-card" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">
              <span class="sell-mark">${mark(GROUP_MARK[p.group] || "connectivity", 18)}</span>
              <span>
                <span class="sell-name">${esc(p.name)}</span>
                ${host ? `<span class="sell-host">${esc(host)}</span>` : ""}
              </span>
            </a>`;
        })
        .join("")}</div>`
    : "";
  const also = quiet.length
    ? `<h2>Also on this path</h2><div class="arch-partners">${quiet
        .map((name) => `<span class="partner quiet">${esc(name)}</span>`)
        .join("")}</div>`
    : "";
  const includes = parts.length
    ? `<p class="arch-k part-k">Includes</p><ul class="part-list">${parts.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`
    : "";
  const stats = proof.length
    ? `<ul class="proof-stats">${proof
        .map((p) => `<li><b>${esc(p.n)}</b><span>${esc(p.l)}</span></li>`)
        .join("")}</ul>`
    : "";
  return `
    ${sellerSky()}
    <div class="seller-wrap tone-${esc(port?.id || "connectivity")}">
      ${sellerTrail()}
      ${f.gap ? `<p class="seller-cue">Open opportunity</p>` : ""}
      ${state.sellerCue ? `<p class="seller-cue">For ${esc(state.sellerCue)}</p>` : ""}
      <h1>${esc(f.name)}</h1>
      <p class="seller-line">${esc(seller.sentence || f.desc)}</p>
      ${seller.fits ? `<p class="seller-fits">${esc(seller.fits)}</p>` : ""}
      ${includes}
      ${(seller.joins || []).length ? deviceBridge("topic") : ""}
      ${stats}
      <div class="seller-actions">
        ${
          next
            ? `<a class="seller-next" href="${esc(next.url)}" target="_blank" rel="noopener noreferrer">${esc(next.label)}</a>`
            : ""
        }
        <button type="button" class="seller-map" data-kind="family" data-id="${esc(f.id)}" data-map="1">See how it connects</button>
      </div>
      ${sell}
      ${also}
    </div>`;
}

function showSeller() {
  state.viewMode = "seller";
  document.body.classList.add("seller");
  const seller = document.getElementById("seller");
  if (seller) seller.hidden = false;
  renderSeller();
  syncChrome();
  syncTopbarHeight();
  const mapBtn = document.getElementById("map-btn");
  if (mapBtn) mapBtn.textContent = "See how it connects";
}

function showMap() {
  state.viewMode = "map";
  document.body.classList.remove("seller");
  const seller = document.getElementById("seller");
  if (seller) seller.hidden = true;
  setViewMode();
  const mapBtn = document.getElementById("map-btn");
  if (mapBtn) mapBtn.textContent = "Back to the list";
  if (state.focus.kind === "family") graph?.focusNode(state.focus.id);
}

function focusOn(kind, id, opts = {}) {
  const stayOnMap = opts.map === true || (opts.map !== false && state.viewMode === "map");
  if (opts.cue !== undefined) state.sellerCue = opts.cue;
  else if (opts.map === false) state.sellerCue = "";
  updatePath(kind, id);
  if (kind === "home") {
    state.focus = { kind: "home", id: "" };
    state.highlightSku = "";
    state.sellerCue = "";
    if (stayOnMap) {
      renderOemChips();
      showMap();
    } else showSeller();
    syncHash();
    return;
  }
  if (kind !== "product") state.highlightSku = "";
  state.focus = { kind, id };
  if (stayOnMap) showMap();
  else showSeller();
  syncHash();
}

function openPractice(id) {
  focusOn("practice", id);
}

function openArticle(id) {
  focusOn("solution", id);
}

function openFamily(id) {
  focusOn("family", id);
}

function syncChrome() {
  document.body.classList.remove("view-overview", "view-practice", "view-article", "view-graph");
  document.body.classList.add("view-graph");
  document.querySelectorAll(".nav-link[data-vm]").forEach((btn) => {
    btn.classList.toggle("on", btn.dataset.vm === "map");
  });
  document.body.classList.toggle("is-home", state.focus.kind === "home");
}

function setViewMode() {
  state.viewMode = "map";
  document.getElementById("overview-root").hidden = true;
  document.getElementById("practice-root").hidden = true;
  document.getElementById("article-root").hidden = true;
  document.getElementById("hood").hidden = false;
  document.getElementById("gs").classList.add("graph-active");
  if (!graph) initGraph();
  renderHood();
  syncChrome();
  syncTopbarHeight();
}

function showError(msg) {
  const bar = document.getElementById("status-bar");
  bar.textContent = msg;
  bar.classList.add("show");
}

function initGraph() {
  if (typeof d3 === "undefined") {
    showError("Graph library failed to load.");
    return;
  }
  const svg = document.getElementById("gs");
  svg.innerHTML = "";
  try {
    graph = createGraph(svg, {
      families: filteredFamilies(),
      links: filteredLinks(filteredFamilies()),
      onNodeClick: (family) => {
        if (!family) return;
        focusOn("family", family.id);
      },
      onNodeHover: (family, e) => {
        const tip = document.getElementById("tip");
        if (!family) {
          tip.style.display = "none";
          return;
        }
        document.getElementById("tip-name").textContent = family.name;
        let desc = family.desc;
        if (state.oemFilter) {
          const prods = productsOn(state, { familyId: family.id, oemId: state.oemFilter });
          if (prods.length) {
            const names = prods.map((p) => p.name);
            const preview = names.length > 4 ? `${names.slice(0, 4).join(" · ")} · +${names.length - 4} more` : names.join(" · ");
            desc = `${preview}\n${desc}`;
          }
        }
        document.getElementById("tip-desc").textContent = desc;
        tip.style.display = "block";
        tip.style.left = `${e.clientX + 12}px`;
        tip.style.top = `${e.clientY + 12}px`;
      },
    });
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  } catch (err) {
    showError(`Graph error: ${err.message}`);
  }
}

function updatePillarPills() {
  const container = document.getElementById("ppills");
  if (!container) return;
  container.innerHTML = state.config.pillars
    .map((p) => `<span class="legend-item"><span class="dot p-${esc(p.id)}" aria-hidden="true"></span>${esc(p.name)}</span>`)
    .join("");
}

function bindSearch() {
  const input = document.getElementById("search");
  const sr = document.getElementById("sr");
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      sr.classList.remove("open");
      return;
    }
    const results = [];
    const seen = new Set();
    const push = (r) => {
      const key = `${r.kind}:${r.id}:${r.name}`;
      if (seen.has(key)) return;
      seen.add(key);
      results.push(r);
    };
    for (const p of state.config.portfolios || []) {
      const hay = `${p.name} ${(p.aliases || []).join(" ")} ${p.line}`.toLowerCase();
      if (p.name.toLowerCase() === q || hay.includes(q)) push({ type: "Portfolio", name: p.name, id: p.id, kind: "portfolio", rank: p.name.toLowerCase() === q ? 100 : 50 });
    }
    for (const f of state.families) {
      const hay = `${f.name} ${f.desc} ${f.seller?.sentence || ""}`.toLowerCase();
      if (hay.includes(q)) push({ type: portfolioForFamily(f.id)?.name || "Topic", name: f.name, id: f.id, kind: "family", rank: f.name.toLowerCase().includes(q) ? 90 : 40 });
    }
    for (const p of state.products) {
      const hay = `${p.name} ${p.why || ""}`.toLowerCase();
      if (hay.includes(q)) {
        const fid = p.families?.[0];
        if (!fid) continue;
        const nameHit = p.name.toLowerCase().split(/[^a-z0-9]+/).includes(q);
        push({ type: portfolioForFamily(fid)?.name || "Cisco", name: p.name, id: fid, kind: "family", cue: p.name, rank: nameHit ? 95 : 70 });
      }
    }
    for (const p of state.oemProducts) {
      if (p.status && p.status !== "current") continue;
      if (p.name.toLowerCase().includes(q)) {
        const fam = state.products.find((x) => x.id === p.family);
        const fid = fam?.families?.[0];
        if (fid) push({ type: portfolioForFamily(fid)?.name || "Cisco", name: p.name, id: fid, kind: "family", cue: fam?.name || p.name, rank: 60 });
      }
    }
    results.sort((a, b) => b.rank - a.rank);
    sr.innerHTML = results
      .slice(0, 8)
      .map(
        (r) => `
      <button type="button" class="sr-item" data-kind="${esc(r.kind)}" data-id="${esc(r.id)}"${r.cue ? ` data-cue="${esc(r.cue)}"` : ""}>
        <div class="sr-type">${esc(r.type)}</div>
        <div class="sr-name">${esc(r.name)}</div>
      </button>`
      )
      .join("");
    sr.classList.toggle("open", results.length > 0);
    sr.querySelectorAll(".sr-item").forEach((item) => {
      item.onclick = () => {
        sr.classList.remove("open");
        input.value = "";
        state.highlightSku = "";
        focusOn(item.dataset.kind, item.dataset.id, { map: false, cue: item.dataset.cue || "" });
      };
    });
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".sw")) sr.classList.remove("open");
  });
}

function bindChrome() {
  document.getElementById("home-btn").onclick = () => {
    state.startWith = "practice";
    state.oemFilter = "";
    state.sellerCue = "";
    focusOn("home", "home", { map: false });
  };
  document.getElementById("graph-back")?.addEventListener("click", () => focusOn("home", "home", { map: false }));
  document.getElementById("map-btn").onclick = () => {
    if (state.viewMode === "map") {
      showSeller();
      syncHash();
      return;
    }
    showMap();
  };
  document.getElementById("outcomes-btn")?.addEventListener("click", () => {
    solutionsUI?.open();
  });
  document.getElementById("oem-lens")?.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-oem]");
    if (!chip) return;
    state.oemFilter = chip.dataset.oem || "";
    state.portfolioSearch = "";
    state.startWith = "practice";
    focusOn("home", "home");
  });
}

async function init() {
  try {
    await loadData();
    applyHashFocus();
    solutionsApi = createSolutionsApi({
      outcomes: state.outcomes,
      solutions: state.solutions,
      families: state.families,
      config: state.config,
    });
    panel = createPanel({
      backdrop: document.getElementById("panel-backdrop"),
      panel: document.getElementById("panel"),
      head: document.getElementById("phead"),
      body: document.getElementById("pbody"),
      closeBtn: document.getElementById("pcl"),
    });
    solutionsUI = createSolutionsUI({
      overlay: document.getElementById("solutions-ov"),
      grid: document.getElementById("sol-outcome-grid"),
      detailRoot: document.getElementById("sol-detail-root"),
      catalogEl: document.querySelector(".sol-catalog"),
      detailEl: document.querySelector(".sol-detail"),
      searchInput: document.getElementById("sol-search"),
      filterChips: document.getElementById("sol-filter-chips"),
      closeBtn: document.getElementById("sol-close-btn"),
      lensBar: document.getElementById("solution-lens-bar"),
      lensTitle: document.getElementById("sl-title"),
      lensReopen: document.getElementById("sl-reopen"),
      lensClear: document.getElementById("sl-clear"),
      api: solutionsApi,
      onShowLens: (d) => {
        if (!d) {
          focusOn("home", "home");
          return;
        }
        focusOn("outcome", d.id);
      },
      onOpenFamily: (familyId) => {
        solutionsUI.close();
        focusOn("family", familyId);
      },
    });
    syncTopbarHeight();
    new ResizeObserver(syncTopbarHeight).observe(document.getElementById("app-chrome"));
    updatePillarPills();
    renderOemChips();
    bindSearch();
    bindChrome();
    if (state.viewMode === "map") showMap();
    else showSeller();
    window.__bin = { state, solutionsApi, BUILD, focusOn };
  } catch (err) {
    showError(`Error loading data: ${err.message}. Run a local server (see README).`);
  }
}

init();
