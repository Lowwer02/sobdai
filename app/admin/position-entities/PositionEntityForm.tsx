'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { INITIAL_POSITION_ENTITY_ACTION_STATE } from './action-state'
import { savePositionEntityAction } from './actions'
import { POSITION_ENTITY_STATUS_VALUES } from '@/lib/position-entity'

export interface PositionEntityFormPosition {
  id: string
  name: string
  organizationName: string | null
}

export interface PositionEntityFormValues {
  id: string | null
  slug: string
  name: string
  overview_markdown: string
  seo_title: string
  seo_description: string
  status: string
  sources_json: string
  mappedPositionIds: string[]
}

export default function PositionEntityForm({
  values,
  positions,
}: {
  values: PositionEntityFormValues
  positions: PositionEntityFormPosition[]
}) {
  const [state, formAction, isPending] = useActionState(
    savePositionEntityAction.bind(null, values.id),
    INITIAL_POSITION_ENTITY_ACTION_STATE,
  )

  return (
    <form action={formAction} className="space-y-6 rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] p-6 shadow-xl">
      {state.error && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm leading-6 text-red-200">
          {state.error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="position-entity-slug" className="block text-sm font-bold text-[#A1866B]">Canonical slug *</label>
          <input id="position-entity-slug" name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={120} defaultValue={values.slug} readOnly={values.status === 'published'} className="w-full rounded-xl border border-white/10 bg-[#0F0B07] px-4 py-3 font-mono text-sm text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none read-only:cursor-not-allowed read-only:opacity-70" />
          <p className="text-xs leading-5 text-[#6E5B49]">ASCII lowercase kebab-case; a published slug cannot change.</p>
        </div>
        <div className="space-y-2">
          <label htmlFor="position-entity-name" className="block text-sm font-bold text-[#A1866B]">Canonical name *</label>
          <input id="position-entity-name" name="name" required defaultValue={values.name} className="w-full rounded-xl border border-white/10 bg-[#0F0B07] px-4 py-3 text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none" />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="position-entity-overview" className="block text-sm font-bold text-[#A1866B]">Editorial overview</label>
        <textarea id="position-entity-overview" name="overview_markdown" rows={10} defaultValue={values.overview_markdown} className="w-full resize-y rounded-xl border border-white/10 bg-[#0F0B07] px-4 py-3 text-sm leading-7 text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none" />
        <p className="text-xs leading-5 text-[#6E5B49]">Write factual evergreen content in Markdown. The public index gate requires meaningful unique editorial copy.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="position-entity-seo-title" className="block text-sm font-bold text-[#A1866B]">SEO title</label>
          <input id="position-entity-seo-title" name="seo_title" defaultValue={values.seo_title} className="w-full rounded-xl border border-white/10 bg-[#0F0B07] px-4 py-3 text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none" />
        </div>
        <div className="space-y-2">
          <label htmlFor="position-entity-status" className="block text-sm font-bold text-[#A1866B]">Lifecycle status *</label>
          <select id="position-entity-status" name="status" defaultValue={values.status} className="w-full appearance-none rounded-xl border border-white/10 bg-[#0F0B07] px-4 py-3 text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none">
            {POSITION_ENTITY_STATUS_VALUES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="position-entity-seo-description" className="block text-sm font-bold text-[#A1866B]">SEO description</label>
        <textarea id="position-entity-seo-description" name="seo_description" rows={3} defaultValue={values.seo_description} className="w-full resize-y rounded-xl border border-white/10 bg-[#0F0B07] px-4 py-3 text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none" />
      </div>

      <div className="space-y-2">
        <label htmlFor="position-entity-sources" className="block text-sm font-bold text-[#A1866B]">Sources JSON</label>
        <textarea id="position-entity-sources" name="sources_json" rows={5} defaultValue={values.sources_json} className="w-full resize-y rounded-xl border border-white/10 bg-[#0F0B07] px-4 py-3 font-mono text-xs leading-6 text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none" />
        <p className="text-xs leading-5 text-[#6E5B49]">Use an array of objects such as [{"{"}&quot;label&quot;:&quot;Official source&quot;,&quot;url&quot;:&quot;https://example.go.th/&quot;{"}"}]. HTTPS is required.</p>
      </div>

      <fieldset className="space-y-3 border-t border-white/5 pt-6">
        <legend className="text-sm font-bold text-[#A1866B]">Mapped organization-scoped positions</legend>
        <p className="text-xs leading-5 text-[#6E5B49]">One operational position may map to only one canonical entity. Choose only rows verified for this role.</p>
        <div className="grid max-h-[28rem] gap-2 overflow-y-auto rounded-xl border border-white/10 bg-[#0F0B07] p-3 md:grid-cols-2">
          {positions.length === 0 ? (
            <p className="p-3 text-sm text-[#A1866B]">No operational positions available.</p>
          ) : positions.map((position) => (
            <label key={position.id} className="flex items-start gap-3 rounded-lg p-3 text-sm text-[#D6CBB8] transition-colors hover:bg-[#1A140E]">
              <input type="checkbox" name="position_ids" value={position.id} defaultChecked={values.mappedPositionIds.includes(position.id)} className="mt-1 accent-[#D4AF37]" />
              <span>
                <span className="block font-semibold text-[#F5E9D6]">{position.name}</span>
                {position.organizationName && <span className="mt-1 block text-xs text-[#A1866B]">{position.organizationName}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap justify-end gap-3 border-t border-white/5 pt-6">
        <Link href="/admin/position-entities" className="inline-flex items-center gap-2 px-5 py-3 font-medium text-[#A1866B] transition-colors hover:text-[#F5E9D6]">
          <ArrowLeft size={16} aria-hidden="true" />
          Cancel
        </Link>
        <button type="submit" disabled={isPending} className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-7 py-3 font-bold text-[#1A140E] transition-colors hover:bg-[#F1D17A] disabled:cursor-wait disabled:opacity-60">
          <Save size={17} aria-hidden="true" />
          {isPending ? 'Saving...' : 'Save Position Entity'}
        </button>
      </div>
    </form>
  )
}
