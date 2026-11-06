function familyById(state, id) {
  return state.families.find((f) => f.id === id);
}

function practiceName(state, pillar) {
  return state.config.pillars.find((p) => p.id === pillar)?.name || pillar;
}

export function hopsFrom(state, familyIds) {
  const seeds = new Set(familyIds);
  const edges = [];
  for (const l of state.links) {
    const a = seeds.has(l.source);
    const b = seeds.has(l.target);
    if (a !== b || (a && b)) {
      if (a || b) {
        edges.push({
          ...l,
          from: familyById(state, l.source),
          to: familyById(state, l.target),
        });
      }
    }
  }
  const neighborIds = new Set(seeds);
  for (const e of edges) {
    neighborIds.add(e.source);
    neighborIds.add(e.target);
  }
  return { edges, neighborIds: [...neighborIds] };
}

export function bridges(state) {
  return state.links
    .map((l) => {
      const from = familyById(state, l.source);
      const to = familyById(state, l.target);
      if (!from || !to || from.pillar === to.pillar) return null;
      return { ...l, from, to };
    })
    .filter(Boolean);
}

export function hoodForFamily(state, id) {
  const family = familyById(state, id);
  if (!family) return null;
  const { edges, neighborIds } = hopsFrom(state, [id]);
  const offerings = state.solutions.filter((s) => (s.families || []).includes(id));
  const outcomes = state.outcomes.filter((o) => (o.families || []).includes(id));
  const sibs = new Set(offerings.flatMap((s) => s.families || []));
  const also = state.solutions.filter(
    (s) => !(s.families || []).includes(id) && (s.families || []).some((f) => sibs.has(f) || neighborIds.includes(f))
  );
  const labs = [...(state.labs || []), ...(state.learning || [])].filter((l) =>
    (l.solutions || []).some((sid) => offerings.some((s) => s.id === sid))
  );
  const cross = edges.filter((e) => e.from && e.to && e.from.pillar !== e.to.pillar);
  const products = productsOn(state, { familyId: id });
  return {
    kind: "family",
    family,
    edges,
    neighborIds,
    offerings,
    outcomes,
    also,
    labs,
    cross,
    products,
  };
}

export function oemById(state, id) {
  return (state.oems || []).find((o) => o.id === id);
}

export function groupProducts(state, oemId) {
  const oem = oemById(state, oemId);
  const list = productsOn(state, { oemId });
  const groups = oem?.portfolio || [];
  const byGroup = new Map(groups.map((g) => [g.id, { group: g, products: [] }]));
  const other = { group: { id: "other", name: "Other", desc: "" }, products: [] };
  for (const p of list) {
    const bucket = byGroup.get(p.group);
    if (bucket) bucket.products.push(p);
    else other.products.push(p);
  }
  const out = groups.map((g) => byGroup.get(g.id)).filter((x) => x?.products.length);
  if (other.products.length) out.push(other);
  return out;
}

export function familyNames(state, ids) {
  return (ids || []).map((id) => familyById(state, id)?.name || id);
}

export function productsOn(state, { familyId, practiceId, oemId, offeringId } = {}) {
  return (state.products || []).filter((p) => {
    if (oemId && p.oem !== oemId) return false;
    if (familyId && !(p.families || []).includes(familyId)) return false;
    if (offeringId && !(p.offerings || []).includes(offeringId)) return false;
    if (practiceId) {
      const fams = (p.families || []).map((fid) => familyById(state, fid)).filter(Boolean);
      if (!fams.some((f) => f.pillar === practiceId)) return false;
    }
    return true;
  });
}

export function oemFamilyCounts(state, oemId) {
  const counts = {};
  for (const p of productsOn(state, { oemId })) {
    for (const fid of p.families || []) {
      counts[fid] = (counts[fid] || 0) + 1;
    }
  }
  return counts;
}

export function oemProductsOn(state, { familyId, oemId } = {}) {
  return (state.oemProducts || []).filter((p) => {
    if (oemId && p.oem !== oemId) return false;
    if (familyId && p.family !== familyId) return false;
    return true;
  });
}

export function hoodForProduct(state, id) {
  const product = (state.products || []).find((p) => p.id === id);
  if (!product) return null;
  const fams = (product.families || []).map((fid) => familyById(state, fid)).filter(Boolean);
  const offerings = (product.offerings || [])
    .map((sid) => state.solutions.find((s) => s.id === sid))
    .filter(Boolean);
  const skus = oemProductsOn(state, { familyId: product.id, oemId: product.oem });
  const { edges, neighborIds } = hopsFrom(
    state,
    fams.map((f) => f.id)
  );
  return { kind: "product", product, fams, offerings, skus, edges, neighborIds };
}

export function hoodForSolution(state, id) {
  const s = state.solutions.find((x) => x.id === id);
  if (!s) return null;
  const fams = (s.families || []).map((fid) => familyById(state, fid)).filter(Boolean);
  const { edges, neighborIds } = hopsFrom(state, s.families || []);
  const outcomes = state.outcomes.filter((o) => (o.solutions || []).includes(id));
  const siblings = state.solutions.filter(
    (o) => o.id !== id && (o.families || []).some((f) => (s.families || []).includes(f) || neighborIds.includes(f))
  );
  const labs = [...(state.labs || []), ...(state.learning || [])].filter((l) => (l.solutions || []).includes(id));
  const cross = edges.filter((e) => e.from && e.to && e.from.pillar !== e.to.pillar);
  const products = productsOn(state, { offeringId: id });
  return { kind: "solution", solution: s, fams, edges, neighborIds, outcomes, siblings, labs, cross, products };
}

export function hoodForOutcome(state, id) {
  const o = state.outcomes.find((x) => x.id === id);
  if (!o) return null;
  const offerings = (o.solutions || []).map((sid) => state.solutions.find((s) => s.id === sid)).filter(Boolean);
  const famIds = [...new Set([...(o.families || []), ...offerings.flatMap((s) => s.families || [])])];
  const fams = famIds.map((fid) => familyById(state, fid)).filter(Boolean);
  const { edges, neighborIds } = hopsFrom(state, famIds);
  const labs = [...(state.labs || []), ...(state.learning || [])].filter((l) =>
    (l.solutions || []).some((sid) => (o.solutions || []).includes(sid))
  );
  const cross = edges.filter((e) => e.from && e.to && e.from.pillar !== e.to.pillar);
  return { kind: "outcome", outcome: o, offerings, fams, edges, neighborIds, labs, cross };
}

export function hoodForPractice(state, id) {
  const practice = state.config.pillars.find((p) => p.id === id);
  if (!practice) return null;
  const fams = state.families.filter((f) => f.pillar === id);
  const offerings = state.solutions.filter((s) => s.pillar === id);
  const outcomes = state.outcomes.filter((o) => o.pillar === id);
  const { edges, neighborIds } = hopsFrom(
    state,
    fams.map((f) => f.id)
  );
  const cross = edges.filter((e) => e.from && e.to && e.from.pillar !== e.to.pillar);
  const products = productsOn(state, { practiceId: id });
  return { kind: "practice", practice, fams, offerings, outcomes, edges, neighborIds, cross, products };
}

export function groupBridges(state) {
  const groups = new Map();
  for (const e of bridges(state)) {
    const names = [practiceName(state, e.from.pillar), practiceName(state, e.to.pillar)].sort();
    const key = names.join(" ↔ ");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  return [...groups.entries()].map(([title, edges]) => ({ title, edges }));
}

export function walkDest(e, focus = {}) {
  const a = e.from;
  const b = e.to;
  if (!a || !b) return null;
  if (focus.kind === "family") {
    if (a.id === focus.id) return b;
    if (b.id === focus.id) return a;
  }
  if (focus.kind === "practice") {
    if (a.pillar === focus.id && b.pillar !== focus.id) return b;
    if (b.pillar === focus.id && a.pillar !== focus.id) return a;
  }
  const seeds = new Set(focus.familyIds || []);
  if (seeds.size) {
    if (seeds.has(a.id) && !seeds.has(b.id)) return b;
    if (seeds.has(b.id) && !seeds.has(a.id)) return a;
  }
  return b;
}

export function renderEdge(e, practiceNameFn, markFn, focus) {
  const left = e.from;
  const right = e.to;
  if (!left || !right) return "";
  const dest = walkDest(e, focus) || right;
  const cross = left.pillar !== right.pillar;
  const gap = e.type === "gap" || dest.gap;
  const mark = markFn || (() => "");
  const fromPractice =
    focus.kind === "family"
      ? left.id === focus.id
        ? left.pillar
        : right.pillar
      : focus.kind === "practice"
        ? focus.id
        : left.pillar;
  return `
    <button type="button" class="walk-step${cross ? " cross" : ""}${gap ? " gap" : ""}" data-kind="family" data-id="${dest.id}">
      <span class="ws-because">${e.label || "connects"}</span>
      <span class="ws-pair">
        <span class="ws-end">${mark(dest.pillar)}${dest.name}</span>
      </span>
      ${cross ? `<span class="ws-cross">Leaves ${practiceNameFn(fromPractice)}</span>` : ""}
      <span class="ws-go">Walk there</span>
    </button>`;
}
