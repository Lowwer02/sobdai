import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

async function check() {
  const { data: linkedQuestions, error } = await supabase
    .from('exam_set_questions')
    .select(`
      sort_order,
      questions (id, content, subject, topic, law, difficulty, is_common, category, status)
    `)
    .limit(1)
  console.log('Error:', error)
  console.log('Data:', JSON.stringify(linkedQuestions, null, 2))
  
  if (linkedQuestions && linkedQuestions.length > 0) {
    console.log('typeof linkedQuestions:', typeof linkedQuestions)
    console.log('length:', linkedQuestions.length)
    const first = linkedQuestions[0]
    console.log('first.questions:', typeof first.questions)
    console.log('isArray:', Array.isArray(first.questions))
  } else {
    console.log('No data found in exam_set_questions to inspect shape.')
  }
}
check()
