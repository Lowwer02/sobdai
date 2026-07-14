import { requirePermission } from '@/lib/auth/server-protect'
import PromotionForm from '../PromotionForm'

export default async function CreatePromotionPage() {
  await requirePermission('content.write')
  return <PromotionForm promo={null} isEdit={false} />
}
