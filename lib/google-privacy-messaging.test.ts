import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { queueGooglePrivacyChoices, queueGooglePrivacyChoicesOnce, subscribeToGooglePrivacyMessaging } from './google-privacy-messaging.ts'

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

test('rapid privacy-choice activation queues once and unavailable activation remains retryable', () => {
  try {
    let called = 0
    const googlefc: TestGoogleFc = {
      showRevocationMessage: () => {
        called += 1
      },
    }
    globalWithWindow.window = { googlefc }
    const guard = { current: false }

    assert.equal(queueGooglePrivacyChoicesOnce(guard), 'queued')
    assert.equal(queueGooglePrivacyChoicesOnce(guard), 'in-progress')
    assert.equal(googlefc.callbackQueue?.length, 1)

    const queued = googlefc.callbackQueue?.[0]
    assert.equal(typeof queued, 'function')
    ;(queued as () => void)()
    assert.equal(called, 1)

    globalWithWindow.window = {}
    const retryableGuard = { current: false }
    assert.equal(queueGooglePrivacyChoicesOnce(retryableGuard), 'unavailable')
    assert.equal(retryableGuard.current, false)

    globalWithWindow.window.googlefc!.callbackQueue = {
      push: () => {
        throw new Error('blocked queue')
      },
    } as unknown as TestGoogleFc['callbackQueue']
    globalWithWindow.window.googlefc!.showRevocationMessage = () => {
      called += 1
    }
    assert.equal(queueGooglePrivacyChoicesOnce(retryableGuard), 'unavailable')
    assert.equal(retryableGuard.current, false)

    globalWithWindow.window.googlefc!.callbackQueue = []
    assert.equal(queueGooglePrivacyChoicesOnce(retryableGuard), 'queued')
    assert.equal(globalWithWindow.window.googlefc?.callbackQueue?.length, 1)
  } finally {
    delete globalWithWindow.window
  }
})
