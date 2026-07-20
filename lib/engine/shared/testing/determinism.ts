/**
 * lib/engine/shared/testing/determinism.ts
 * ----------------------------------------------------------------------------
 * Assessment Engine — property-based determinism harness.
 *
 * Source of truth:
 *  - Implementation Planning v1.0 §6.1 / §6.6 (property-based tests for determinism)
 *  - Candidate Ranking Architecture v1.0 §6 (Determinism contract)
 *  - Constraint Solver Architecture v1.0 (Determinism guarantees)
 *  - Runtime API Specification v1.0 §3.4 (Idempotency)
 *
 * Every Engine module carries a determinism contract: same input → same output.
 * This harness makes that contract testable by randomizing input *ordering* (not
 * input *content*) and asserting the output is byte-identical across orderings.
 *
 * The point: ordering must not leak into output. If it does, that's a forbidden
 * tie-breaker (Candidate Ranking forbids: iteration order, random, Bank queries,
 * LLM, content heuristics) or a hidden state carry — both bugs.
 *
 * Backlog: E-X.4 (Cross-Cutting Infrastructure). Reusable by every module.
 */

// ─── Deterministic PRNG (mulberry32) ────────────────────────────────────────
// Property tests must themselves be deterministic (or a passing test today is a
// flaky test tomorrow). mulberry32 is a small, fast, seedable PRNG; we don't need
// cryptographic strength, we need reproducibility.

/**
 * Build a seeded PRNG function. Same seed → same sequence, forever, across runs
 * and platforms. Returns a function that produces a float in [0, 1).
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * In-place Fisher-Yates shuffle using a provided PRNG. Returns the same array
 * reference (mutated) for ergonomics. Pure w.r.t. the PRNG: same PRNG state →
 * same permutation.
 */
export function shuffleWith<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// ─── Deep stable stringify ──────────────────────────────────────────────────
// JSON.stringify is not safe for identity comparison: key order varies and
// `undefined` fields are dropped. We need a canonical serialization so two
// structurally-equal objects compare equal regardless of insertion order.

/**
 * Canonical JSON serialization: object keys sorted ascending, `undefined` fields
 * omitted, nested arrays preserved in original order (arrays are ordered by
 * contract; objects are unordered by contract).
 *
 * Use this when comparing Engine outputs for byte-identity — never use raw
 * JSON.stringify, which would make property tests flaky on key ordering.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']'
  }
  const keys = Object.keys(value as Record<string, unknown>).sort()
  const pairs = keys
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .map((k) => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k]))
  return '{' + pairs.join(',') + '}'
}

// ─── The property assertion ─────────────────────────────────────────────────

/**
 * Property assertion: a function `fn` is order-invariant on the elements of `input`
 * iff shuffling `input` (deterministically, from a fixed seed) and applying `fn`
 * yields a byte-identical result across all shuffles.
 *
 * Use this to verify the Determinism contract on any module whose input is a
 * collection (CandidateSet, RankedCandidateSet, etc.). It does NOT verify that
 * `fn` is correct — only that `fn` doesn't leak input ordering into output.
 *
 * @param fn         The module under test. Receives a (shuffled) copy of `input`.
 * @param input      The canonical input. Shuffled copies are derived from this.
 * @param runs       How many distinct shuffles to try (default 100).
 * @param seed       PRNG seed (default 1). Same seed → same shuffle sequence.
 * @returns          The canonical output string (for the first run). Throws if
 *                   any subsequent run produces a different string.
 */
export function assertOrderInvariant<T, R>(
  fn: (input: T[]) => R,
  input: T[],
  opts: { runs?: number; seed?: number } = {}
): string {
  const runs = opts.runs ?? 100
  const seed = opts.seed ?? 1
  const rng = seededRandom(seed)

  // Canonical run: stringify the output on the input as-given.
  const canonical = stableStringify(fn([...input]))

  for (let i = 0; i < runs; i++) {
    // Fresh shuffled copy each iteration (don't mutate the caller's array).
    const shuffled = shuffleWith([...input], rng)
    const result = stableStringify(fn(shuffled))
    if (result !== canonical) {
      throw new Error(
        `Order-invariance violated on run ${i + 1}/${runs} (seed=${seed}).\n` +
          `  Canonical: ${canonical}\n` +
          `  Shuffle ${i + 1}: ${result}\n` +
          `This indicates input ordering leaked into output — a forbidden tie-breaker or hidden state carry.`
      )
    }
  }
  return canonical
}

/**
 * Idempotency assertion: calling `fn` on `input` more than once produces the
 * same output. This is the Runtime API §3.4 idempotency property: same Engine
 * Request → same Assembly Result, including across retries.
 *
 * Distinct from order-invariance: this catches hidden mutable state inside `fn`
 * (e.g. a module that mutates a shared cache on first call).
 */
export function assertIdempotent<T, R>(fn: (input: T) => R, input: T, runs = 3): R {
  const first = stableStringify(fn(input))
  let last: R
  for (let i = 0; i < runs; i++) {
    last = fn(input)
    const s = stableStringify(last)
    if (s !== first) {
      throw new Error(
        `Idempotency violated on run ${i + 2}/${runs + 1}.\n` +
          `  First call:   ${first}\n` +
          `  Call ${i + 2}: ${s}\n` +
          `This indicates hidden mutable state inside the module.`
      )
    }
  }
  return last!
}
