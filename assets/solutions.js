export function createSolutionsApi({ outcomes, solutions, families, config }) {
  const pillarName = (id) => config.pillars.find((p) => p.id === id)?.name || id;
  const familyById = (id) => families.find((f) => f.id === id);
  const solutionById = (id) => solutions.find((s) => s.id === id);

  function listOutcomes() {
    return outcomes.map((o) => ({
      id: o.id,
      pillar: o.pillar,
      pillarName: pillarName(o.pillar),
      outcome: o.outcome,
      symptom: o.symptom,
      useCases: o.useCases || [],
      familyCount: (o.families || []).length,
      solutionCount: (o.solutions || []).length,
    }));
  }

  function getOutcome(id) {
    const o = outcomes.find((x) => x.id === id);
    if (!o) return null;

    const linkedSolutions = (o.solutions || []).map(solutionById).filter(Boolean);
    const familyIds = [...new Set(o.families || [])];
    const layers = groupFamiliesByCategory(familyIds.map(familyById).filter(Boolean));

    return {
      ...o,
      pillarName: pillarName(o.pillar),
      linkedSolutions,
      familyIds,
      layers,
    };
  }

  function groupFamiliesByCategory(fams) {
    const byCat = {};
    for (const f of fams) {
      if (!byCat[f.category]) byCat[f.category] = [];
      byCat[f.category].push(f);
    }
    return Object.entries(byCat).map(([category, rows]) => ({
      category,
      rows: rows.map((f) => ({
        familyId: f.id,
        name: f.name,
        desc: f.desc,
      })),
    }));
  }

  return { listOutcomes, getOutcome, pillarName };
}
