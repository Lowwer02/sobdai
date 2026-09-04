import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { DAILY_AFFILIATE_COLLECTION_ENV_VAR, getDailyAffiliateCollectionId, parseDailyAffiliateCollectionId } from './affiliate-daily.ts'

const VALID_COLLECTION_ID = '11111111-1111-4111-8111-111111111111'

test('Daily Affiliate config accepts only a trimmed UUID', () => {
  assert.equal(parseDailyAffiliateCollectionId(`  ${VALID_COLLECTION_ID} `), VALID_COLLECTION_ID)
  assert.equal(parseDailyAffiliateCollectionId('not-a-uuid'), null)
  assert.equal(parseDailyAffiliateCollectionId(''), null)
  assert.equal(parseDailyAffiliateCollectionId(undefined), null)
  assert.equal(parseDailyAffiliateCollectionId(VALID_COLLECTION_ID.toUpperCase()), VALID_COLLECTION_ID.toUpperCase())
})

test('missing or malformed Daily Affiliate config disables the optional rail', () => {
  assert.equal(getDailyAffiliateCollectionId({}), null)
  assert.equal(getDailyAffiliateCollectionId({
    [DAILY_AFFILIATE_COLLECTION_ENV_VAR]: 'DROP TABLE affiliate_collections',
  }), null)
  assert.equal(getDailyAffiliateCollectionId({
    [DAILY_AFFILIATE_COLLECTION_ENV_VAR]: VALID_COLLECTION_ID,
  }), VALID_COLLECTION_ID)
})
