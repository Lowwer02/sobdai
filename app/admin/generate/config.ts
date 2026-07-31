export const ADMIN_ASSESSMENT_BLUEPRINTS = [
  {
    key: 'bma-education-specialist@3.0.0',
    id: 'bma-education-specialist',
    version: '3.0.0',
    title: 'นักวิชาการศึกษา — กรุงเทพมหานคร',
    description: 'Simulation Blueprint v3.0 · 5 sets · 100 questions per set',
  },
] as const

export type AdminAssessmentBlueprintKey =
  (typeof ADMIN_ASSESSMENT_BLUEPRINTS)[number]['key']
