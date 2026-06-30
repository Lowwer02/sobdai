import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

async function check() {
  const email = `test_${Date.now()}@example.com`
  const password = 'password123'
  
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password
  })
  
  if (signUpError) {
    console.log('Signup error:', signUpError)
    // Maybe try login if it already exists, but we use Date.now()
  }
  
  console.log('Logged in as:', signUpData.user?.email)

  const { data, error } = await supabase.from('exam_set_questions').select('sort_order, questions(*)')
  console.log('Error:', error)
  console.log('Data:', JSON.stringify(data, null, 2))
}
check()
