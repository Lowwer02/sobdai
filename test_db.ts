import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

async function check() {
  const { data: linkedQuestions, error } = await supabase
    .from('exam_set_questions')
    .select('sort_order, questions(id)')
    .limit(5)
  console.log(JSON.stringify(linkedQuestions, null, 2))
}
check()
