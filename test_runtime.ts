import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

async function check() {
  const email = `test_${Date.now()}@example.com`
  const password = 'password123'
  
  await supabase.auth.signUp({ email, password })

  // Find an exam set
  const { data: examSets } = await supabase.from('exam_sets').select('id').limit(1)
  if (!examSets || examSets.length === 0) {
    console.log('No exam sets found')
    return
  }
  const id = examSets[0].id
  console.log('Testing Exam Set ID:', id)

  const { data: linkedQuestions, error } = await supabase
    .from('exam_set_questions')
    .select(`
      sort_order,
      questions (id, content, subject, topic, law, difficulty, is_common, category, status)
    `)
    .eq('exam_set_id', id)
    .order('sort_order', { ascending: true })

  if (error) {
    console.log('Query Error:', error)
    return
  }

  console.log('linkedQuestions:', linkedQuestions)
  
  try {
    const selectedQuestionsData = (linkedQuestions || []).map(lq => lq.questions).filter(Boolean)
    console.log('Mapping successful, length:', selectedQuestionsData.length)
  } catch (err: any) {
    console.log('Crash during mapping:', err.message)
  }
}
check()
