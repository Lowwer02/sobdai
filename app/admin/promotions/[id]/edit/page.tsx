import { requirePermission } from '@/lib/auth/server-protect'
import { notFound } from 'next/navigation'
import PromotionForm from '../../PromotionForm'

export default async function EditPromotionPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requirePermission('content.write')
  const { id } = await params

  const { data: promo } = await supabase
    .from('promotions')
    .select('*')
    .eq('id', id)
    .single()

  if (!promo) notFound()

  return <PromotionForm promo={promo} isEdit />
}
