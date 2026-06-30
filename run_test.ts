import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

async function check() {
  const email = `test_${Date.now()}@example.com`
  const password = 'password123'
  await supabase.auth.signUp({ email, password })

  const { data: examSets } = await supabase.from('exam_sets').select('id').limit(1)
  if (!examSets || examSets.length === 0) return
  const id = examSets[0].id

  const { data: linkedQuestions, error } = await supabase
    .from('exam_set_questions')
    .select(`
      sort_order,
      questions (id, content, subject, topic, law, difficulty, is_common, category, status)
    `)
    .eq('exam_set_id', id)
    .order('sort_order', { ascending: true })

  console.log('1. linkedQuestions length:', linkedQuestions?.length)
  console.log('2. typeof linkedQuestions:', typeof linkedQuestions)
  
  if (linkedQuestions && linkedQuestions.length > 0) {
    const first = linkedQuestions[0]
    console.log('4. First element:', first)
    console.log('5. typeof first.questions:', typeof first.questions)
    console.log('6. Array.isArray(first.questions):', Array.isArray(first.questions))
  }
}
check()
