/**
 * Stable compatibility route for Summary workspace links during the hybrid
 * rollout. The route remains the existing legacy editor until the Product
 * Layer workspace replaces it in its approved phase.
 */
export function getSummaryWorkspaceHref(summaryId: string): string {
  return `/admin/summaries/${encodeURIComponent(summaryId)}/edit`
}
