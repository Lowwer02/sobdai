const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

function loadEnv() {
  const content = fs.readFileSync('.env.local', 'utf-8')
  content.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      process.env[match[1]] = match[2].replace(/(^"|"$)/g, '')
    }
  })
}
loadEnv()

async function run() {
  const adminSb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const anonSb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  console.log("=== Service Role (Admin) Query ===")
  const { data: adminData, error: adminErr } = await adminSb
    .from('exam_set_questions')
    .select('exam_set_id, question_id, questions(id, status)')
    .limit(3)
  console.log(JSON.stringify(adminData, null, 2))
  if (adminErr) console.error("Admin Error:", adminErr)

  console.log("=== Anon (Unauthenticated) Query ===")
  const { data: anonData, error: anonErr } = await anonSb
    .from('exam_set_questions')
    .select('exam_set_id, question_id, questions(id, status)')
    .limit(3)
  console.log(JSON.stringify(anonData, null, 2))
  if (anonErr) console.error("Anon Error:", anonErr)
}
run()
