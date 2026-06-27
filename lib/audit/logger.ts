import { headers } from 'next/headers'

export interface AuditLogEvent {
  action: string
  entity: string
  entity_id: string
  old_value?: Record<string, any> | string | null
  new_value?: Record<string, any> | string | null
  user_id?: string
  role?: string
}

/**
 * Reusable audit logging helper.
 * Currently outputs to console, preparing for a future database table (e.g. `audit_logs`).
 */
export async function logAuditEvent(event: AuditLogEvent) {
  const headersList = await headers()
  
  // Forwarded for / X-Real-IP are common headers for client IP when behind proxy
  const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown'
  const userAgent = headersList.get('user-agent') || 'unknown'

  const auditRecord = {
    timestamp: new Date().toISOString(),
    ...event,
    ip,
    user_agent: userAgent
  }

  // TODO: In a future session, replace this with a Supabase insert into `audit_logs` table.
  // Example: await supabase.from('audit_logs').insert(auditRecord)
  
  // For now, log securely to standard output
  console.log(`[AUDIT LOG] ${auditRecord.action} on ${auditRecord.entity}(${auditRecord.entity_id}) by User(${auditRecord.user_id})`)
}
