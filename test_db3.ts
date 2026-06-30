import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

async function check() {
  const { data, error } = await supabase.from('exam_set_questions').select('*')
  console.log('Error:', error)
  console.log('Data count:', data?.length)
}
check()
