import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

async function check() {
  const { data, error } = await supabase.from('exam_sets').select('id').limit(1)
  console.log('Exam sets:', data)
  
  if (data && data.length > 0) {
     const res = await supabase.from('exam_set_questions').insert({
       exam_set_id: data[0].id,
       question_id: '00000000-0000-0000-0000-000000000000',
       sort_order: 1
     })
     console.log('Insert:', res.error)
  }
}
check()
