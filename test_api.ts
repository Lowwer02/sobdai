import { createAdminClient } from './lib/supabase/server'
async function test() {
  try {
    const admin = await createAdminClient()
    console.log("admin created")
  } catch(e) {
    console.error("Error:", e)
  }
}
test()
