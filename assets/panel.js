function esc(str) {
  const el = document.createElement("span");
  el.textContent = str ?? "";
  return el.innerHTML;
}

export function createPanel({ backdrop, panel, head, body, closeBtn, onClose }) {
  function open(content) {
    head.innerHTML = content.head || "";
    body.innerHTML = content.body || "";
    backdrop.classList.add("open");
    panel.classList.add("open");
    backdrop.setAttribute("aria-hidden", "false");
  }

  function close() {
    backdrop.classList.remove("open");
    panel.classList.remove("open");
    backdrop.setAttribute("aria-hidden", "true");
    onClose?.();
  }

  closeBtn.onclick = close;
  backdrop.onclick = close;

  return { open, close };
}

export function buildFamilyPanel(family, { solutions, outcomes, labs, learning }) {
  const relatedSolutions = solutions.filter((s) => (s.families || []).includes(family.id));
  const relatedOutcomes = outcomes.filter((o) => (o.families || []).includes(family.id));
  const relatedLabs = labs.filter((l) => (l.solutions || []).some((sid) => relatedSolutions.some((s) => s.id === sid)));
  const relatedLearning = learning.filter((l) =>
    (l.solutions || []).some((sid) => relatedSolutions.some((s) => s.id === sid))
  );

  const head = `
    <div class="ph-cat">${esc(family.category)} · ${esc(family.pillar)}</div>
    <h2>${esc(family.name)}</h2>`;

  let bodyHtml = `<p class="p-desc">${esc(family.desc)}</p>`;

  if (relatedSolutions.length) {
    bodyHtml += `<div class="p-section"><h3>BT offerings</h3><ul class="p-list">${relatedSolutions
      .map((s) => `<li>${esc(s.name)}</li>`)
      .join("")}</ul></div>`;
  }

  if (relatedOutcomes.length) {
    const o = relatedOutcomes[0];
    bodyHtml += `<div class="outcome-block">
      <div class="symptom">"${esc(o.symptom)}"</div>
      <div class="ba">
        <div class="ba-before"><strong>Before:</strong> ${esc(o.proof?.before || "")}</div>
        <div class="ba-arrow">→</div>
        <div class="ba-after"><strong>After:</strong> ${esc(o.proof?.after || "")}</div>
      </div>
    </div>`;
  }

  if (relatedLabs.length || relatedLearning.length) {
    bodyHtml += `<div class="p-section"><h3>Enablement</h3>`;
    for (const lab of relatedLabs) {
      bodyHtml += `<a class="p-link-row" href="${esc(lab.url)}" target="_blank" rel="noopener noreferrer">${esc(lab.name)} ↗</a>`;
    }
    for (const item of relatedLearning) {
      bodyHtml += `<a class="p-link-row" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.name)} ↗</a>`;
    }
    bodyHtml += `</div>`;
  }

  return { head, body: bodyHtml };
}

export function buildSolutionPanel(solution, { families, labs, learning }) {
  const famNames = (solution.families || [])
    .map((id) => families.find((f) => f.id === id)?.name)
    .filter(Boolean);

  const head = `
    <div class="ph-cat">${esc(solution.category)} · ${esc(solution.pillar)}</div>
    <h2>${esc(solution.name)}</h2>`;

  let bodyHtml = `<p class="p-desc">${esc(solution.desc)}</p>`;

  if (famNames.length) {
    bodyHtml += `<div class="p-section"><h3>Capability areas</h3><ul class="p-list">${famNames
      .map((n) => `<li>${esc(n)}</li>`)
      .join("")}</ul></div>`;
  }

  if (solution.capabilities?.length) {
    bodyHtml += `<div class="p-section"><h3>Capabilities</h3><ul class="p-list">${solution.capabilities
      .map((c) => `<li>${esc(c)}</li>`)
      .join("")}</ul></div>`;
  }

  const relatedLabs = labs.filter((l) => (l.solutions || []).includes(solution.id));
  const relatedLearning = learning.filter((l) => (l.solutions || []).includes(solution.id));

  if (solution.url) {
    bodyHtml += `<a class="p-link-row" href="${esc(solution.url)}" target="_blank" rel="noopener noreferrer">View on BT International ↗</a>`;
  }

  if (relatedLabs.length || relatedLearning.length) {
    bodyHtml += `<div class="p-section"><h3>Enablement</h3>`;
    for (const lab of relatedLabs) {
      bodyHtml += `<a class="p-link-row" href="${esc(lab.url)}" target="_blank" rel="noopener noreferrer">${esc(lab.name)} ↗</a>`;
    }
    for (const item of relatedLearning) {
      bodyHtml += `<a class="p-link-row" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.name)} ↗</a>`;
    }
    bodyHtml += `</div>`;
  }

  return { head, body: bodyHtml };
}
