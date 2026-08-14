export const ADMIN_ASSESSMENT_BLUEPRINTS = [
  {
    key: 'bma-education-specialist@3.0.0',
    id: 'bma-education-specialist',
    version: '3.0.0',
    title: 'นักวิชาการศึกษา — กรุงเทพมหานคร',
    description: 'Simulation Blueprint v3.0 · 5 sets · 100 questions per set',
    sourcePath: 'Blueprint/simulation_exam_blueprint.md',
    packageCode: 'KSB-EDU-2026-V10',
    /**
     * Characterized Physical Solver budget (maxNodesVisited) for this exact
     * blueprint/package class. Proven minimum-safe bound is 6175; the
     * operational production value is 7000.
     *
     * Absent on registry entries that have NOT been characterized. No global
     * default is synthesized — an absent value means fail-closed (Physical
     * Solver not requested for that class).
     */
    physicalSolverMaxNodesVisited: 7000,
  },
] as const

export type AdminAssessmentBlueprintKey =
  (typeof ADMIN_ASSESSMENT_BLUEPRINTS)[number]['key']

/**
 * Pure resolver for the characterized Physical Solver budget of a blueprint.
 *
 * Returns the production `maxNodesVisited` policy for a characterized
 * `blueprintKey`, or `undefined` when the key is unknown or uncharacterized.
 * No default is fabricated: callers must treat `undefined` as fail-closed and
 * leave the Physical Solver unrequested.
 *
 * Characterized values are class-specific (blueprint + bound package) and must
 * not be reused across uncharacterized classes.
 */
export function resolveBlueprintPhysicalSolverBudget(
  blueprintKey: string
): number | undefined {
  const blueprint = ADMIN_ASSESSMENT_BLUEPRINTS.find(
    (candidate) => candidate.key === blueprintKey
  )
  if (
    blueprint &&
    'physicalSolverMaxNodesVisited' in blueprint
  ) {
    return blueprint.physicalSolverMaxNodesVisited
  }
  return undefined
}
