import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!)

async function check() {
  const { data } = await supabase.from('profiles').select('id, email, role, status').limit(5)
  console.log(data)
}
check()
