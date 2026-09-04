import 'server-only'

import { resolveDailyGuestProofSecret } from './guest-proof'

export function getDailyGuestProofSecret(): string {
  return resolveDailyGuestProofSecret({
    DAILY_GUEST_PROOF_SECRET: process.env.DAILY_GUEST_PROOF_SECRET,
  })
}
