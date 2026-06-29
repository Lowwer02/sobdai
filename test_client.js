const { createServerClient } = require('@supabase/ssr')

try {
  createServerClient('https://example.supabase.co', 'dummy-service-key', {
    cookies: {
      getAll() { return [] },
      setAll() {}
    }
  })
  console.log("Client created successfully!")
} catch(e) {
  console.error("Error creating client:", e)
}
