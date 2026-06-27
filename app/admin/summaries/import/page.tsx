import { requirePermission } from '@/lib/auth/server-protect'
import ImportClient from './ImportClient'

export default async function Page() {
  await requirePermission('content.read')
  return <ImportClient />
}
