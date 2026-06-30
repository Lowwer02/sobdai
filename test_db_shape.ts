import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

async function check() {
  const email = `test_shape_${Date.now()}@example.com`
  const password = 'password123'
  await supabase.auth.signUp({ email, password })

  const { data, error } = await supabase
    .from('exam_set_questions')
    .select(`
      sort_order,
      questions (id, content, subject, topic, law, difficulty, is_common, category, status)
    `)
    .limit(1)

  console.log(JSON.stringify(data, null, 2))
}
check()
