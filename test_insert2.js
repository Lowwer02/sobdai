const { createClient } = require('@supabase/supabase-js')
async function test() {
  const sb = createClient('https://jrgegpgmxdxrneyaguqd.supabase.co', 'dummy-service-key')
  try {
    const { data, error } = await sb.from('orders').insert({ status: 'free' })
    console.log("Error object:", error)
  } catch(e) {
    console.error("Exception thrown:", e)
  }
}
test()
