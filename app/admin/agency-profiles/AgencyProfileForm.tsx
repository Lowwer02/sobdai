'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Archive, ArrowLeft, RotateCcw, Save, Send } from 'lucide-react'
import { INITIAL_AGENCY_PROFILE_ACTION_STATE } from './action-state'
import {
  archiveAgencyProfileAction,
  publishAgencyProfileAction,
  restoreAgencyProfileAction,
  saveAgencyProfileAction,
} from './actions'

export interface AgencyProfileFormOrganization {
  id: string
  name: string
  shortName: string | null
}

export interface AgencyProfileFormAuthor {
  id: string
  displayName: string
}

export interface AgencyProfileFormValues {
  id: string | null
  organizationId: string
  organizationName: string | null
  slug: string
  overview_markdown: string
  seo_title: string
  seo_description: string
  status: string
  published_at: string | null
  sources_json: string
  author_id: string
}

const inputClass =
  'w-full bg-[#0F0B07] border border-white/10 text-[#F5E9D6] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#D4AF37] transition-colors read-only:cursor-not-allowed read-only:opacity-70'

export default function AgencyProfileForm({
  values,
  organizations,
  authors,
  canPublish,
}: {
  values: AgencyProfileFormValues
  /** Organizations without an existing profile (create only). Empty on edit. */
  organizations: AgencyProfileFormOrganization[]
  authors: AgencyProfileFormAuthor[]
  canPublish: boolean
}) {
  // Lifecycle actions take a concrete id; the panel below renders only when
  // isEdit, so the empty-string fallback is never exercised on create.
  const lifecycleId = values.id ?? ''
  const [state, formAction, isPending] = useActionState(
    saveAgencyProfileAction.bind(null, values.id),
    INITIAL_AGENCY_PROFILE_ACTION_STATE,
  )
  const [publishState, publishAction, isPublishPending] = useActionState(
    publishAgencyProfileAction.bind(null, lifecycleId),
    INITIAL_AGENCY_PROFILE_ACTION_STATE,
  )
  const [archiveState, archiveAction, isArchivePending] = useActionState(
    archiveAgencyProfileAction.bind(null, lifecycleId),
    INITIAL_AGENCY_PROFILE_ACTION_STATE,
  )
  const [restoreState, restoreAction, isRestorePending] = useActionState(
    restoreAgencyProfileAction.bind(null, lifecycleId),
    INITIAL_AGENCY_PROFILE_ACTION_STATE,
  )

  const lifecycleError =
    publishState.error || archiveState.error || restoreState.error
  const lifecycleMessage =
    publishState.message || archiveState.message || restoreState.message
  const isEdit = values.id !== null
  const slugLocked = values.published_at !== null

  return (
    <div className="space-y-6">
      {(state.error || lifecycleError) && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm leading-6 text-red-200">
          {state.error || lifecycleError}
        </div>
      )}
      {(state.message || lifecycleMessage) && (
        <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-200">
          {state.message || lifecycleMessage}
        </div>
      )}

      <form action={formAction} className="space-y-6 rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] p-6 shadow-xl">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="agency-profile-organization" className="block text-sm font-bold text-[#A1866B]">Organization *</label>
            {isEdit ? (
              <input
                id="agency-profile-organization"
                name="organization_id"
                type="hidden"
                value={values.organizationId}
              />
            ) : null}
            {isEdit ? (
              <input
                aria-readonly="true"
                readOnly
                value={values.organizationName || values.organizationId}
                className={inputClass}
              />
            ) : (
              <select
                id="agency-profile-organization"
                name="organization_id"
                required
                defaultValue={values.organizationId}
                className={inputClass}
              >
                <option value="">— เลือกหน่วยงาน —</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.shortName ? `${organization.shortName} — ${organization.name}` : organization.name}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs leading-5 text-[#6E5B49]">หนึ่งหน่วยงานมีได้หนึ่ง Agency Profile — เลือกแล้วเปลี่ยนภายหลังไม่ได้</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="agency-profile-slug" className="block text-sm font-bold text-[#A1866B]">Canonical slug *</label>
            <input
              id="agency-profile-slug"
              name="slug"
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              maxLength={120}
              defaultValue={values.slug}
              readOnly={slugLocked}
              className={`${inputClass} font-mono`}
            />
            <p className="text-xs leading-5 text-[#6E5B49]">ASCII lowercase kebab-case; a published slug cannot change.</p>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="agency-profile-overview" className="block text-sm font-bold text-[#A1866B]">Editorial overview</label>
          <textarea
            id="agency-profile-overview"
            name="overview_markdown"
            rows={10}
            defaultValue={values.overview_markdown}
            className="w-full resize-y rounded-xl border border-white/10 bg-[#0F0B07] px-4 py-3 text-sm leading-7 text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none"
          />
          <p className="text-xs leading-5 text-[#6E5B49]">Write factual evergreen content in Markdown. The public index gate requires meaningful unique editorial copy.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="agency-profile-seo-title" className="block text-sm font-bold text-[#A1866B]">SEO title</label>
            <input id="agency-profile-seo-title" name="seo_title" defaultValue={values.seo_title} className={inputClass} />
          </div>
          <div className="space-y-2">
            <label htmlFor="agency-profile-author" className="block text-sm font-bold text-[#A1866B]">Editorial author</label>
            <select id="agency-profile-author" name="author_id" defaultValue={values.author_id} className={inputClass}>
              <option value="">— ไม่ระบุ —</option>
              {authors.map((author) => (
                <option key={author.id} value={author.id}>{author.displayName}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="agency-profile-seo-description" className="block text-sm font-bold text-[#A1866B]">SEO description</label>
          <textarea
            id="agency-profile-seo-description"
            name="seo_description"
            rows={3}
            defaultValue={values.seo_description}
            className="w-full resize-y rounded-xl border border-white/10 bg-[#0F0B07] px-4 py-3 text-sm leading-7 text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="agency-profile-sources" className="block text-sm font-bold text-[#A1866B]">Sources JSON</label>
          <textarea
            id="agency-profile-sources"
            name="sources_json"
            rows={5}
            defaultValue={values.sources_json}
            className="w-full resize-y rounded-xl border border-white/10 bg-[#0F0B07] px-4 py-3 font-mono text-xs leading-6 text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none"
          />
          <p className="text-xs leading-5 text-[#6E5B49]">
            Use an array of objects such as [{"{"}&quot;label&quot;:&quot;สตง.&quot;,&quot;url&quot;:&quot;https://www.audit.go.th/&quot;{"}"}]. HTTPS is required.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-white/5 pt-6">
          <Link href="/admin/agency-profiles" className="inline-flex items-center gap-2 px-5 py-3 font-medium text-[#A1866B] transition-colors hover:text-[#F5E9D6]">
            <ArrowLeft size={16} aria-hidden="true" />
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-7 py-3 font-bold text-[#1A140E] transition-colors hover:bg-[#F1D17A] disabled:cursor-wait disabled:opacity-60"
          >
            <Save size={17} aria-hidden="true" />
            {isPending ? 'Saving...' : 'Save Agency Profile'}
          </button>
        </div>
      </form>

      {isEdit && canPublish && (
        <section className="rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] p-6 shadow-xl">
          <h2 className="text-sm font-bold text-[#A1866B]">Lifecycle (content.publish)</h2>
          <p className="mt-1 text-xs leading-5 text-[#6E5B49]">
            Current status: <span className="font-semibold text-[#D4AF37]">{values.status}</span>
            {values.published_at ? ` · first published ${values.published_at.slice(0, 10)}` : ''}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {values.status !== 'published' && (
              <form action={publishAction}>
                <button
                  type="submit"
                  disabled={isPublishPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 font-bold text-white transition-colors hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60"
                >
                  <Send size={15} aria-hidden="true" />
                  {isPublishPending ? 'Publishing...' : 'Publish'}
                </button>
              </form>
            )}
            {values.status === 'published' && (
              <form action={archiveAction}>
                <button
                  type="submit"
                  disabled={isArchivePending}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 px-5 py-2.5 font-bold text-amber-300 transition-colors hover:bg-amber-500/10 disabled:cursor-wait disabled:opacity-60"
                >
                  <Archive size={15} aria-hidden="true" />
                  {isArchivePending ? 'Archiving...' : 'Archive'}
                </button>
              </form>
            )}
            {values.status === 'archived' && (
              <form action={restoreAction}>
                <button
                  type="submit"
                  disabled={isRestorePending}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-2.5 font-bold text-[#F5E9D6] transition-colors hover:bg-white/5 disabled:cursor-wait disabled:opacity-60"
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  {isRestorePending ? 'Restoring...' : 'Restore to draft'}
                </button>
              </form>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
