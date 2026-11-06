import { MARK_PATH, MARK_STROKE } from "./marks.js";

const CAT_COLORS = {
  connectivity: "#4d9eff",
  collaboration: "#e85ad0",
  managed: "#a78bfa",
};

const CLUSTERS = {
  connectivity: { x: 0.28, y: 0.38 },
  collaboration: { x: 0.72, y: 0.32 },
  managed: { x: 0.5, y: 0.78 },
};

const PILLAR_SHORT = {
  connectivity: "Connect",
  collaboration: "Collab",
  managed: "Operate",
};

function wrapLabel(name) {
  const words = name.split(" ");
  if (name.length <= 14 || words.length === 1) return [name];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

function tokenBox(name, pillar, deg) {
  const lines = wrapLabel(name);
  const meta = `${PILLAR_SHORT[pillar] || pillar} · ${deg}`;
  const titleW = Math.max(...lines.map((l) => l.length)) * 6.8;
  const metaW = meta.length * 5.6;
  const w = Math.max(132, Math.ceil(52 + Math.max(titleW, metaW)));
  const title0 = 22;
  const titleLh = 14;
  const metaDy = 15;
  const padBot = 22;
  const h = title0 + (lines.length - 1) * titleLh + metaDy + padBot;
  return { lines, meta, w, h, title0, titleLh, metaDy };
}

function linkPath(d) {
  const x1 = d.source.x;
  const y1 = d.source.y;
  const x2 = d.target.x;
  const y2 = d.target.y;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  const k = d._cross ? 0.16 : 0.08;
  const cx = (x1 + x2) / 2 - (dy / dist) * dist * k;
  const cy = (y1 + y2) / 2 + (dx / dist) * dist * k;
  return `M${x1},${y1}Q${cx},${cy} ${x2},${y2}`;
}

function midPoint(d) {
  return { x: (d.source.x + d.target.x) / 2, y: (d.source.y + d.target.y) / 2 };
}

export function createGraph(svgEl, { families, links, onNodeClick, onNodeHover }) {
  const svg = d3.select(svgEl);
  svg.selectAll("*").remove();

  const defs = svg.append("defs");
  const glow = defs.append("filter").attr("id", "soft-glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
  glow.append("feGaussianBlur").attr("stdDeviation", "3.2").attr("result", "b");
  const merge = glow.append("feMerge");
  merge.append("feMergeNode").attr("in", "b");
  merge.append("feMergeNode").attr("in", "SourceGraphic");

  const g = svg.append("g");
  const zoom = d3.zoom().scaleExtent([0.45, 2.2]).on("zoom", (e) => g.attr("transform", e.transform));
  svg.call(zoom).on("dblclick.zoom", null);

  const degree = new Map();
  for (const l of links) {
    degree.set(l.source, (degree.get(l.source) || 0) + 1);
    degree.set(l.target, (degree.get(l.target) || 0) + 1);
  }

  const nodes = families.map((f) => {
    const deg = degree.get(f.id) || 1;
    const box = tokenBox(f.name, f.pillar, deg);
    return { ...f, _deg: deg, ...box, _w: box.w, _h: box.h, _r: Math.hypot(box.w, box.h) / 2 };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const linkData = links
    .map((l) => {
      const a = byId.get(l.source);
      const b = byId.get(l.target);
      if (!a || !b) return null;
      return { ...l, source: l.source, target: l.target, _cross: a.pillar !== b.pillar };
    })
    .filter(Boolean);

  const sim = d3
    .forceSimulation(nodes)
    .force("link", d3.forceLink(linkData).id((d) => d.id).distance((d) => (d._cross ? 230 : 148)).strength(0.4))
    .force("charge", d3.forceManyBody().strength(-420))
    .force("collide", d3.forceCollide((d) => d._r + 10).strength(0.95));

  const link = g
    .append("g")
    .attr("class", "links")
    .selectAll("path")
    .data(linkData)
    .join("path")
    .attr("class", (d) => ["link", d.type === "gap" ? "gap" : d._cross ? "cross" : ""].filter(Boolean).join(" "));

  const linkLabel = g
    .append("g")
    .attr("class", "link-labels")
    .selectAll("text")
    .data(linkData)
    .join("text")
    .attr("class", (d) => ["llab", d.type === "gap" ? "gap" : d._cross ? "cross" : ""].filter(Boolean).join(" "))
    .text((d) => d.label || "");

  const node = g
    .append("g")
    .attr("class", "nodes")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .attr("class", (d) => `node token cat-${d.category}${d.gap ? " gap" : ""}`)
    .call(
      d3
        .drag()
        .on("start", (e, d) => {
          if (!e.active) sim.alphaTarget(0.16).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (e, d) => {
          d.fx = e.x;
          d.fy = e.y;
        })
        .on("end", (e, d) => {
          if (!e.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

  node
    .append("rect")
    .attr("class", "plate")
    .attr("x", (d) => -d._w / 2)
    .attr("y", (d) => -d._h / 2)
    .attr("width", (d) => d._w)
    .attr("height", (d) => d._h)
    .attr("rx", 16)
    .attr("fill", "#12141c")
    .attr("stroke", (d) => CAT_COLORS[d.category] || "#2997ff")
    .attr("stroke-width", 1.4);

  const mark = node
    .append("path")
    .attr("class", "mark")
    .attr("d", (d) => MARK_PATH[d.pillar] || MARK_PATH.cloud)
    .attr("transform", (d) => `translate(${-d._w / 2 + 12}, ${-d._h / 2 + 10}) scale(0.72)`);

  mark.each(function (d) {
    const el = d3.select(this);
    const color = CAT_COLORS[d.category] || "#2997ff";
    if (MARK_STROKE[d.pillar]) {
      el.attr("fill", "none").attr("stroke", color).attr("stroke-width", 1.8).attr("stroke-linejoin", "round").attr("stroke-linecap", "round");
    } else {
      el.attr("fill", color);
    }
  });

  const labels = node
    .append("text")
    .attr("class", "nlab")
    .attr("text-anchor", "start")
    .attr("dominant-baseline", "alphabetic")
    .attr("font-size", 11);
  labels.each(function (d) {
    const sel = d3.select(this);
    const x = -d._w / 2 + 34;
    d.lines.forEach((line, i) => {
      sel
        .append("tspan")
        .attr("x", x)
        .attr("y", -d._h / 2 + d.title0 + i * d.titleLh)
        .text(line);
    });
  });

  node
    .append("text")
    .attr("class", "nmeta")
    .attr("text-anchor", "start")
    .attr("dominant-baseline", "alphabetic")
    .attr("font-size", 9)
    .attr("x", (d) => -d._w / 2 + 34)
    .attr("y", (d) => -d._h / 2 + d.title0 + (d.lines.length - 1) * d.titleLh + d.metaDy)
    .text((d) => d.meta);

  const badge = node
    .append("g")
    .attr("class", "oem-badge")
    .attr("transform", (d) => `translate(${d._w / 2 - 14}, ${-d._h / 2 + 14})`)
    .style("display", "none");
  badge.append("circle").attr("r", 8).attr("fill", "#2997ff");
  badge
    .append("text")
    .attr("class", "oem-count")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central")
    .attr("y", 0.5)
    .text("");

  node.on("click", (e, d) => {
    e.stopPropagation();
    onNodeClick?.(d);
  });
  node
    .on("mouseenter", (e, d) => onNodeHover?.(d, e))
    .on("mousemove", (e, d) => onNodeHover?.(d, e))
    .on("mouseleave", () => onNodeHover?.(null));

  svg.on("click", () => onNodeClick?.(null));

  sim.on("tick", () => {
    link.attr("d", linkPath);
    linkLabel.attr("x", (d) => midPoint(d).x).attr("y", (d) => midPoint(d).y);
    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });

  function applyClusters(rect) {
    sim
      .force("x", d3.forceX((d) => (CLUSTERS[d.pillar]?.x || 0.5) * rect.width).strength(0.16))
      .force("y", d3.forceY((d) => (CLUSTERS[d.pillar]?.y || 0.5) * rect.height).strength(0.16));
  }

  function seed(rect) {
    for (const d of nodes) {
      const c = CLUSTERS[d.pillar] || { x: 0.5, y: 0.5 };
      d.x = c.x * rect.width + (Math.random() - 0.5) * 70;
      d.y = c.y * rect.height + (Math.random() - 0.5) * 70;
    }
  }

  function resize() {
    const rect = svgEl.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    svg.attr("width", rect.width).attr("height", rect.height);
    applyClusters(rect);
    sim.alpha(0.32).restart();
  }

  const first = svgEl.getBoundingClientRect();
  if (first.width >= 40) {
    seed(first);
    svg.attr("width", first.width).attr("height", first.height);
    applyClusters(first);
  }
  requestAnimationFrame(() => {
    const rect = svgEl.getBoundingClientRect();
    if (rect.width >= 40) {
      if (nodes.some((n) => n.x == null || n.x < 20)) seed(rect);
      applyClusters(rect);
      svg.attr("width", rect.width).attr("height", rect.height);
      sim.alpha(0.38).restart();
    }
  });
  window.addEventListener("resize", resize);

  function setLens(familyIds, selectedId) {
    const idSet = new Set(familyIds || []);
    const active = idSet.size > 0;
    node.classed("lit", (d) => active && idSet.has(d.id));
    node.classed("dim", (d) => active && !idSet.has(d.id));
    node.classed("sel", (d) => d.id === selectedId);
    link.classed("lit", (d) => {
      if (!active) return false;
      const s = d.source.id || d.source;
      const t = d.target.id || d.target;
      return idSet.has(s) && idSet.has(t);
    });
    linkLabel.classed("on", (d) => {
      if (!active) return !!d._cross || d.type === "gap";
      const s = d.source.id || d.source;
      const t = d.target.id || d.target;
      return idSet.has(s) && idSet.has(t);
    });
    if (!active) {
      linkLabel.classed("on", (d) => d._cross || d.type === "gap");
      node.classed("lit", false).classed("dim", false);
    }
  }

  function setHover(id) {
    node.classed("hot", (d) => !!id && d.id === id);
  }

  function setOem(countById) {
    const on = !!countById;
    node.classed("has-oem", (d) => on && !!countById[d.id]);
    node.classed("no-oem", (d) => on && !countById[d.id]);
    badge.style("display", (d) => (on && countById[d.id] ? "block" : "none"));
    badge.select("text").text("");
  }

  function clearLens() {
    setLens([]);
  }

  function focusNode(id) {
    const n = nodes.find((x) => x.id === id);
    if (!n || n.x == null) return;
    const rect = svgEl.getBoundingClientRect();
    const scale = 1.15;
    svg.transition().duration(480).call(
      zoom.transform,
      d3.zoomIdentity.translate(rect.width / 2 - n.x * scale, rect.height / 2 - n.y * scale).scale(scale)
    );
  }

  return { setLens, clearLens, focusNode, setHover, setOem, nodes };
}
