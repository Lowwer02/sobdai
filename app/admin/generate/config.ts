export const ADMIN_ASSESSMENT_BLUEPRINTS = [
  {
    key: 'bma-education-specialist@3.0.1',
    id: 'bma-education-specialist',
    version: '3.0.1',
    title: 'นักวิชาการศึกษา — กรุงเทพมหานคร',
    description: 'Simulation Blueprint v3.0.1 · 5 sets · 100 questions per set',
    sourcePath: 'Blueprint/simulation_exam_blueprint.md',
    packageCode: 'KSB-EDU-2026-V10',
  },
  {
    key: 'oag-policy-plan-analyst@3.0.0',
    id: 'oag-policy-plan-analyst',
    version: '3.0.0',
    title: 'นักวิเคราะห์นโยบายและแผน — สำนักงานการตรวจเงินแผ่นดิน',
    description: 'Assessment Blueprint V1 · 5 sets · 100 questions per set · document-allocation only',
    sourcePath: 'Blueprint/oag_policy_plan_analyst_blueprint.md',
    packageCode: 'OAG-PPA-2026-V10',
  },
] as const

export type AdminAssessmentBlueprintKey =
  (typeof ADMIN_ASSESSMENT_BLUEPRINTS)[number]['key']
