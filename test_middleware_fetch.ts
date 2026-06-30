import { createClient } from '@supabase/supabase-js'

// Need to simulate what middleware does:
// 1. Get user (with anon key + jwt)
// 2. Fetch profile
