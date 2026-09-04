import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { queueGooglePrivacyChoices, subscribeToGooglePrivacyMessaging } from './google-privacy-messaging.ts'

type TestGoogleFc = {
  callbackQueue?: Array<(() => void) | { CONSENT_API_READY?: () => void }>
  showRevocationMessage?: () => void
}

type TestWindow = { googlefc?: TestGoogleFc }

const globalWithWindow = globalThis as unknown as { window?: TestWindow }

test('Google Privacy & messaging bridge is safe, queued, and local-state-free', () => {
  try {
    {
      globalWithWindow.window = {}

      assert.equal(queueGooglePrivacyChoices(), false)
      assert.deepEqual(globalWithWindow.window.googlefc?.callbackQueue, [])
    }

    {
      let called = 0
      const googlefc: TestGoogleFc = {
        showRevocationMessage: () => {
          called += 1
        },
      }
      globalWithWindow.window = { googlefc }

      assert.equal(queueGooglePrivacyChoices(), true)
      assert.equal(googlefc.callbackQueue?.length, 1)

      const queued = googlefc.callbackQueue?.[0]
      assert.equal(typeof queued, 'function')
      ;(queued as () => void)()
      assert.equal(called, 1)
    }

    {
      const googlefc: TestGoogleFc = {}
      globalWithWindow.window = { googlefc }
      let ready = false

      const unsubscribe = subscribeToGooglePrivacyMessaging(() => {
        ready = true
      })

      assert.equal(ready, false)
      const queued = googlefc.callbackQueue?.[0] as { CONSENT_API_READY?: () => void }
      assert.equal(typeof queued.CONSENT_API_READY, 'function')
      queued.CONSENT_API_READY?.()
      assert.equal(ready, true)

      unsubscribe()
      assert.equal('consent' in googlefc, false)
      assert.equal('advertisingConsent' in googlefc, false)
    }
  } finally {
    delete globalWithWindow.window
  }
})
