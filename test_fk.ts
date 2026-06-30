import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

async function check() {
  const { data, error } = await supabase
    .from('exam_set_questions')
    .select('questions(*)')
    .limit(1)
  console.log('Shape:', Array.isArray(data?.[0]?.questions) ? 'ARRAY' : typeof data?.[0]?.questions)
  console.log('Error:', error)
}
check()
