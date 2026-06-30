import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

async function check() {
  const email = `test_${Date.now()}@example.com`
  const password = 'password123'
  await supabase.auth.signUp({ email, password })

  const { data: packages, error } = await supabase.from('packages').select('id, name')
  console.log('packages:', packages)

  if (!packages || packages.length === 0) {
     console.log('Packages is empty or null, testing packages[0]?.id')
     const packageId = packages?.[0]?.id || ''
     console.log('packageId:', packageId)
  }
}
check()
