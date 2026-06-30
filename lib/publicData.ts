import { createAdminClient } from '@/lib/supabase/admin'

export async function getPackagePublicCounts(packageIds: string[]) {
  if (!packageIds || packageIds.length === 0) return {}

  const supabaseAdmin = createAdminClient()
  
  const { data } = await supabaseAdmin
    .from('packages')
    .select(`
      id,
      exam_sets (
        id,
        exam_set_questions (
          questions ( status )
        )
      )
    `)
    .in('id', packageIds)

  const counts: Record<string, { total_questions: number, total_exam_sets: number, exam_set_counts: Record<string, number> }> = {}
  
  if (data) {
    data.forEach(pkg => {
      let totalQ = 0
      const esCounts: Record<string, number> = {}
      
      if (pkg.exam_sets) {
        pkg.exam_sets.forEach((es: any) => {
          let esQ = 0
          if (es.exam_set_questions) {
            es.exam_set_questions.forEach((esq: any) => {
              if (esq.questions?.status === 'Published') {
                esQ++
                totalQ++
              }
            })
          }
          esCounts[es.id] = esQ
        })
      }
      
      counts[pkg.id] = {
        total_questions: totalQ,
        total_exam_sets: pkg.exam_sets ? pkg.exam_sets.length : 0,
        exam_set_counts: esCounts
      }
    })
  }
  
  return counts
}
