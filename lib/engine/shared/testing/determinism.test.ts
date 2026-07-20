/**
 * lib/engine/shared/testing/determinism.test.ts
 * ----------------------------------------------------------------------------
 * Self-test for the determinism harness.
 *
 * Source of truth: Implementation Planning v1.0 §6.6 (property-based tests).
 *
 * A property-test harness must itself be property-tested: if `stableStringify`
 * were order-sensitive, every downstream property test would silently pass on
 * the wrong assertion. These tests pin the harness's own invariants.
 *
 * RUN (no test runner required — uses Node's built-in `assert` via jiti):
 *   npx jiti lib/engine/shared/testing/determinism.test.ts
 *
 * Convention (lib/engine/README.md §4): every test cites the spec property it
 * verifies. Names follow `verifies_<property>`.
 */

import assert from 'node:assert/strict'
import {
  seededRandom,
  shuffleWith,
  stableStringify,
  assertOrderInvariant,
  assertIdempotent,
} from './determinism'

// ─── seededRandom ───────────────────────────────────────────────────────────

function verifies_seed_reproducibility(): void {
  // Same seed → same sequence, forever. This is what makes our property tests
  // reproducible (a passing test today is a passing test tomorrow).
  const a = seededRandom(42)
  const b = seededRandom(42)
  const seqA = Array.from({ length: 10 }, () => a())
  const seqB = Array.from({ length: 10 }, () => b())
  assert.deepEqual(seqA, seqB, 'same seed must produce identical sequence')
}

function verifies_seed_diverges_on_different_seed(): void {
  const a = seededRandom(1)
  const b = seededRandom(2)
  const seqA = Array.from({ length: 10 }, () => a())
  const seqB = Array.from({ length: 10 }, () => b())
  assert.notDeepEqual(seqA, seqB, 'different seeds should diverge')
}

function verifies_rng_output_range(): void {
  const rng = seededRandom(7)
  for (let i = 0; i < 1000; i++) {
    const v = rng()
    assert.ok(
      v >= 0 && v < 1,
      `rng output out of [0,1): ${v}`
    )
  }
}

// ─── shuffleWith ────────────────────────────────────────────────────────────

function verifies_shuffle_preserves_multiset(): void {
  // Shuffle must not lose or duplicate elements.
  // NOTE: numeric comparator is required — Array.prototype.sort() default is
  // lexicographic, so [1,...,10] would sort to [1,10,2,...] and falsely fail.
  const rng = seededRandom(99)
  const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  const shuffled = shuffleWith([...input], rng)
  assert.deepEqual(
    [...shuffled].sort((a, b) => a - b),
    input,
    'shuffle must preserve multiset'
  )
}

function verifies_shuffle_reproducible_from_seed(): void {
  const a = seededRandom(123)
  const b = seededRandom(123)
  const input = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const shA = shuffleWith([...input], a)
  const shB = shuffleWith([...input], b)
  assert.deepEqual(shA, shB, 'same seed → same permutation')
}

function verifies_shuffle_does_not_mutate_caller_array_reference(): void {
  // shuffleWith returns the same array reference it was passed (mutated in
  // place) — that's by design. The CALLER must pass a copy. This test pins
  // that contract so a future "fix" that copies internally doesn't silently
  // break callers who relied on the in-place return.
  const rng = seededRandom(1)
  const original = [1, 2, 3]
  const passedIn = [...original]
  const result = shuffleWith(passedIn, rng)
  assert.equal(result, passedIn, 'shuffleWith returns the same reference it was given')
}

// ─── stableStringify ────────────────────────────────────────────────────────

function verifies_stable_stringify_is_key_order_invariant(): void {
  // The whole point: two objects with the same fields in different insertion
  // order MUST stringify identically. Without this, property tests are flaky.
  const a = { x: 1, y: 2, z: 3 }
  const b = { z: 3, y: 2, x: 1 }
  assert.equal(stableStringify(a), stableStringify(b))
  assert.equal(stableStringify(a), '{"x":1,"y":2,"z":3}')
}

function verifies_stable_stringify_sorts_nested_keys(): void {
  const a = { outer: { c: 3, a: 1, b: 2 } }
  assert.equal(stableStringify(a), '{"outer":{"a":1,"b":2,"c":3}}')
}

function verifies_stable_stringify_preserves_array_order(): void {
  // Arrays are ORDERED by contract (Candidate ordering, slot ordering). The
  // canonical form MUST preserve their order — only object keys are sorted.
  const a = [3, 1, 2]
  const b = [1, 2, 3]
  assert.notEqual(stableStringify(a), stableStringify(b), 'array order must be preserved')
  assert.equal(stableStringify(a), '[3,1,2]')
}

function verifies_stable_stringify_omits_undefined(): void {
  // JSON.stringify drops `undefined` fields; we must too, or two structurally-
  // equal objects with one having an explicit undefined would compare unequal.
  assert.equal(stableStringify({ a: 1, b: undefined }), '{"a":1}')
  assert.equal(stableStringify({ a: 1 }), '{"a":1}')
}

function verifies_stable_stringify_handles_primitives(): void {
  assert.equal(stableStringify(null), 'null')
  assert.equal(stableStringify(42), '42')
  assert.equal(stableStringify('hi'), '"hi"')
  assert.equal(stableStringify(true), 'true')
}

// ─── assertOrderInvariant ───────────────────────────────────────────────────

function verifies_order_invariant_passes_on_pure_fn(): void {
  // A pure function that ignores input order (e.g. sum) must pass.
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  assertOrderInvariant(sum, [1, 2, 3, 4, 5], { runs: 50 })
}

function verifies_order_invariant_throws_on_order_sensitive_fn(): void {
  // A function that leaks input order into output (e.g. first element) must
  // fail loudly. This is the bug class the harness exists to catch.
  const firstElement = <T,>(xs: T[]) => xs[0]
  assert.throws(
    () => assertOrderInvariant(firstElement, ['a', 'b', 'c', 'd', 'e'], { runs: 50, seed: 1 }),
    /Order-invariance violated/
  )
}

function verifies_order_invariant_reproducible_failure_message(): void {
  // Same seed → same failure point. This makes a test failure debuggable:
  // the engineer can reproduce the exact shuffle that broke invariance.
  const leaky = (xs: number[]) => xs[0]
  try {
    assertOrderInvariant(leaky, [1, 2, 3, 4, 5], { runs: 100, seed: 7 })
    assert.fail('expected throw')
  } catch (e) {
    const msg = (e as Error).message
    assert.ok(/seed=7/.test(msg), `failure message should cite seed: ${msg}`)
  }
}

// ─── assertIdempotent ───────────────────────────────────────────────────────

function verifies_idempotent_passes_on_pure_fn(): void {
  let calls = 0
  const fn = (x: number) => {
    calls++
    return x * 2
  }
  const result = assertIdempotent(fn, 21)
  assert.equal(result, 42)
  assert.equal(calls, 4, '1 canonical call + 3 verification calls')
}

function verifies_idempotent_throws_on_stateful_fn(): void {
  // A function with hidden mutable state (e.g. an incrementing counter) must
  // fail — this is the bug class (e.g. a module mutating a shared cache).
  let counter = 0
  const fn = (_x: number) => ++counter
  assert.throws(
    () => assertIdempotent(fn, 0),
    /Idempotency violated/
  )
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'seededRandom: same seed → same sequence', fn: verifies_seed_reproducibility },
  { name: 'seededRandom: different seeds diverge', fn: verifies_seed_diverges_on_different_seed },
  { name: 'seededRandom: output ∈ [0,1)', fn: verifies_rng_output_range },
  { name: 'shuffleWith: preserves multiset', fn: verifies_shuffle_preserves_multiset },
  { name: 'shuffleWith: reproducible from seed', fn: verifies_shuffle_reproducible_from_seed },
  { name: 'shuffleWith: returns same reference (in-place contract)', fn: verifies_shuffle_does_not_mutate_caller_array_reference },
  { name: 'stableStringify: key-order invariant', fn: verifies_stable_stringify_is_key_order_invariant },
  { name: 'stableStringify: nested keys sorted', fn: verifies_stable_stringify_sorts_nested_keys },
  { name: 'stableStringify: array order preserved', fn: verifies_stable_stringify_preserves_array_order },
  { name: 'stableStringify: undefined omitted', fn: verifies_stable_stringify_omits_undefined },
  { name: 'stableStringify: primitives', fn: verifies_stable_stringify_handles_primitives },
  { name: 'assertOrderInvariant: pure fn passes', fn: verifies_order_invariant_passes_on_pure_fn },
  { name: 'assertOrderInvariant: order-sensitive fn throws', fn: verifies_order_invariant_throws_on_order_sensitive_fn },
  { name: 'assertOrderInvariant: failure cites seed', fn: verifies_order_invariant_reproducible_failure_message },
  { name: 'assertIdempotent: pure fn passes', fn: verifies_idempotent_passes_on_pure_fn },
  { name: 'assertIdempotent: stateful fn throws', fn: verifies_idempotent_throws_on_stateful_fn },
]

let passed = 0
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    console.log(`  ✓ ${t.name}`)
    passed++
  } catch (e) {
    console.error(`  ✗ ${t.name}`)
    console.error(`    ${(e as Error).message}`)
    failed++
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
