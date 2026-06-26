import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import UsersClient from './UsersClient'

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  
  const page = typeof params.page === 'string' ? parseInt(params.page) : 1
  const search = typeof params.q === 'string' ? params.q : ''
  const roleFilter = typeof params.role === 'string' ? params.role : ''
  const statusFilter = typeof params.status === 'string' ? params.status : ''

  const limit = 15
  const from = (page - 1) * limit
  const to = from + limit - 1

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
      },
    }
  )

  let query = supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    
  if (search) {
    query = query.ilike('email', `%${search}%`)
  }
  if (roleFilter && roleFilter !== 'All') {
    query = query.eq('role', roleFilter.toLowerCase())
  }
  if (statusFilter && statusFilter !== 'All') {
    query = query.eq('status', statusFilter.toLowerCase())
  }

  query = query.range(from, to).order('created_at', { ascending: false })

  const { data: users, count } = await query

  const totalPages = count ? Math.ceil(count / limit) : 0

  return (
    <UsersClient 
      users={users || []} 
      totalPages={totalPages}
      currentPage={page}
      search={search}
      roleFilter={roleFilter}
      statusFilter={statusFilter}
    />
  )
}
