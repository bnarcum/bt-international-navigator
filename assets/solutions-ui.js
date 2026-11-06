function esc(str) {
  const el = document.createElement("span");
  el.textContent = str ?? "";
  return el.innerHTML;
}

export function createSolutionsUI({
  overlay,
  grid,
  detailRoot,
  catalogEl,
  detailEl,
  searchInput,
  filterChips,
  closeBtn,
  lensBar,
  lensTitle,
  lensReopen,
  lensClear,
  api,
  onShowLens,
  onOpenFamily,
}) {
  let activeOutcomeId = null;

  function setPillarFilter(pillarId) {
    if (!filterChips) return;
    const target = pillarId || "all";
    filterChips.querySelectorAll(".sol-fchip").forEach((c) => {
      c.classList.toggle("on", c.dataset.filter === target);
    });
  }

  function open(opts = {}) {
    if (opts.pillar) setPillarFilter(opts.pillar);
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    if (opts.outcomeId) {
      showDetail(opts.outcomeId);
    } else {
      showCatalog();
      renderCatalog();
    }
  }

  function close() {
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
  }

  function showCatalog() {
    catalogEl.classList.add("on");
    detailEl.classList.remove("on");
  }

  function showDetail(id) {
    activeOutcomeId = id;
    catalogEl.classList.remove("on");
    detailEl.classList.add("on");
    renderDetail(id);
  }

  function renderCatalog() {
    const q = (searchInput?.value || "").toLowerCase();
    const filter = filterChips?.querySelector(".sol-fchip.on")?.dataset.filter || "all";

    const items = api.listOutcomes().filter((o) => {
      if (filter !== "all" && o.pillar !== filter) return false;
      if (!q) return true;
      const hay = [o.outcome, o.symptom, ...(o.useCases || [])].join(" ").toLowerCase();
      return hay.includes(q);
    });

    grid.innerHTML = items
      .map(
        (o) => `
      <button type="button" class="oc-card" data-pillar="${esc(o.pillar)}" data-id="${esc(o.id)}">
        <div class="oc-ribbon"></div>
        <div class="oc-inner">
          <div class="oc-pillar">${esc(o.pillarName)}</div>
          <div class="oc-outcome">${esc(o.outcome)}</div>
          <div class="oc-symptom">${esc(o.symptom)}</div>
          <div class="oc-foot">
            <span class="oc-meta">${o.familyCount} areas · ${o.solutionCount} solutions</span>
          </div>
        </div>
      </button>`
      )
      .join("");

    grid.querySelectorAll(".oc-card").forEach((card) => {
      card.onclick = () => showDetail(card.dataset.id);
    });
  }

  function renderDetail(id) {
    const d = api.getOutcome(id);
    if (!d) return;

    const layersHtml = (d.layers || [])
      .map(
        (layer) => `
      <div class="layer">
        <div class="layer-h"><span class="bar"></span>${esc(layer.category)}</div>
        ${layer.rows
          .map(
            (row) => `
          <button type="button" class="stack-row" data-fid="${esc(row.familyId)}">
            <div class="stack-role">
              <div class="t">${esc(row.name)}</div>
              <div class="s">${esc(row.desc)}</div>
            </div>
            <span class="stack-fam">${esc(layer.category)}</span>
          </button>`
          )
          .join("")}
      </div>`
      )
      .join("");

    const solutionsHtml = (d.linkedSolutions || [])
      .map((s) => `<li>${esc(s.name)}</li>`)
      .join("");

    detailRoot.innerHTML = `
      <button type="button" class="sol-back" id="sol-back-btn">← All outcomes</button>
      <div class="compose-headline">${esc(d.outcome)}</div>
      <p class="sol-sub" style="margin-bottom:12px"><em>${esc(d.symptom)}</em></p>
      ${
        d.proof
          ? `<div class="ba-row">
        <div class="ba-box ba-before"><div class="ba-lbl">Before</div>${esc(d.proof.before)}</div>
        <div class="ba-arrow">→</div>
        <div class="ba-box ba-after"><div class="ba-lbl">After</div>${esc(d.proof.after)}</div>
      </div>`
          : ""
      }
      <div class="p-section"><h3>Solution stack</h3><div class="layer-stack">${layersHtml}</div></div>
      ${
        d.linkedSolutions?.length
          ? `<div class="p-section"><h3>BT offerings</h3><ul class="p-list">${solutionsHtml}</ul></div>`
          : ""
      }
      <div class="sol-actions">
        <button type="button" class="sol-act primary" id="sol-lens-btn">Show on graph</button>
      </div>`;

    document.getElementById("sol-back-btn").onclick = showCatalog;
    document.getElementById("sol-lens-btn").onclick = () => {
      onShowLens?.(d);
      close();
      showLensBar(d);
    };

    detailRoot.querySelectorAll(".stack-row").forEach((row) => {
      row.onclick = () => onOpenFamily?.(row.dataset.fid);
    });
  }

  function showLensBar(d) {
    lensTitle.textContent = d.outcome;
    lensBar.classList.add("open");
    activeOutcomeId = d.id;
  }

  function hideLensBar() {
    lensBar.classList.remove("open");
    activeOutcomeId = null;
  }

  closeBtn.onclick = close;
  searchInput?.addEventListener("input", renderCatalog);
  filterChips?.querySelectorAll(".sol-fchip").forEach((chip) => {
    chip.onclick = () => {
      filterChips.querySelectorAll(".sol-fchip").forEach((c) => c.classList.remove("on"));
      chip.classList.add("on");
      renderCatalog();
    };
  });

  lensReopen.onclick = () => {
    if (activeOutcomeId) {
      open();
      showDetail(activeOutcomeId);
    }
  };

  lensClear.onclick = () => {
    hideLensBar();
    onShowLens?.(null);
  };

  return { open, close, showDetail, hideLensBar, setPillarFilter, getActiveOutcomeId: () => activeOutcomeId };
}
