import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL! || 'https://dummy.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! || 'dummy'
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data, error } = await supabase
    .from('packages')
    .select(`
      id,
      exam_sets (
        id,
        exam_set_questions (
          questions (
            status
          )
        )
      )
    `)
    .limit(1)
  console.log(JSON.stringify(data, null, 2), error)
}
test()
