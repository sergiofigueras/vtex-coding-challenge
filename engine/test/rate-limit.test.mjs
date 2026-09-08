import assert from 'node:assert/strict'
import test from 'node:test'
import { CANCELLATION_EXIT_CODE, RATE_LIMIT_EXIT_CODE, classifyProviderFailure, parseProviderDelay, retryDelay, runRateLimitLifecycle, validateRateLimitPolicy, waitWithCountdown } from '../scripts/lib/rate-limit.mjs'

const policy = { maximumAttempts: 3, baseDelayMs: 1000, maximumDelayMs: 60000, jitterRatio: 0.2 }
const limited = ms => ({ status: 429, message: `Please try again in ${ms}ms` })

test('parses only documented provider delay units and validates bounded policy', () => {
  assert.equal(parseProviderDelay('Please try again in 1.5s'), 1500)
  assert.equal(parseProviderDelay({ retryAfterMs: 99 }), 99)
  assert.equal(parseProviderDelay('retry later'), null)
  assert.deepEqual(validateRateLimitPolicy({ rateLimit: policy }), policy)
  assert.throws(() => validateRateLimitPolicy({ rateLimit: { ...policy, maximumAttempts: 0 } }), /positive integer/)
})

test('classifies only known delayed rate limits as retryable', () => {
  assert.equal(classifyProviderFailure(limited(1)).retryable, true)
  assert.equal(classifyProviderFailure({ code: 'RATE_LIMIT', message: 'Please try again in 2s' }).classification, 'rate-limit')
  assert.equal(classifyProviderFailure({ message: 'dsh: RATE_LIMIT: Rate limit reached for model. Please try again in 1.844s.' }).providerDelayMs, 1844)
  assert.equal(classifyProviderFailure({ message: 'a user said rate limit reached; Please try again in 1s.' }).retryable, false)
  assert.equal(classifyProviderFailure({ message: 'dsh: RATE_LIMIT: retry later' }).retryable, false)
  assert.equal(classifyProviderFailure({ status: 429, message: 'insufficient_quota' }).classification, 'persistent-quota')
  for (const error of [{ status: 401 }, { status: 500 }, { code: 'ECONNRESET' }, { message: 'validation failed' }]) assert.equal(classifyProviderFailure(error).retryable, false)
})

test('uses provider delay precedence, deterministic jitter, and hard maximum', () => {
  assert.deepEqual(retryDelay(1, { providerDelayMs: 90000 }, policy, () => 0), { calculatedBackoffMs: 1000, providerDelayMs: 90000, delayMs: 60000 })
  assert.deepEqual(retryDelay(3, { providerDelayMs: null }, policy, () => 1), { calculatedBackoffMs: 4000, providerDelayMs: null, delayMs: 4800 })
  assert.equal(retryDelay(20, { providerDelayMs: null }, policy, () => 1).delayMs, 60000)
})

test('retries a rate-limited attempt with injected no-wait clock and complete metadata', async () => {
  const calls = []
  const status = []
  const result = await runRateLimitLifecycle({ policy, requestedRoute: 'default', status: item => status.push(item), wait: async () => {}, rng: () => 0.5,
    attempt: async ({ number, route }) => {
      calls.push({ number, route })
      return number === 1 ? { success: false, error: limited(1000), session: 'session-1', logs: ['attempt-1.stdout.txt'], reservation: 'r1', settlement: 's1', accounting: 'billable' } : { success: true, session: 'session-2', logs: ['attempt-2.stdout.txt'], reservation: 'r2', settlement: 's2', accounting: 'billable' }
    },
  })
  assert.equal(result.exitCode, 0)
  assert.deepEqual(calls, [{ number: 1, route: 'default' }, { number: 2, route: 'default' }])
  assert.equal(result.attempts[0].selectedDelayMs, 1000)
  assert.ok(status.some(event => event.type === 'rate-limit-retry'))
  assert.equal(result.attempts[0].session, 'session-1')
})

test('failed-attempt accounting is preserved for billable and unreconciled settlements', async () => {
  const result = await runRateLimitLifecycle({ policy: { ...policy, maximumAttempts: 1 }, requestedRoute: 'default', attempt: async () => ({
    success: false, error: limited(1), reservation: { id: 'reservation-1', amountUsd: 0.5 }, settlement: { id: 'settlement-1', actualUsd: 0.2, accountingStatus: 'provider-reported-standard-assumed' },
  }) })
  assert.equal(result.attempts[0].reservation.amountUsd, 0.5)
  assert.equal(result.attempts[0].settlement.actualUsd, 0.2)
  const unknown = await runRateLimitLifecycle({ policy: { ...policy, maximumAttempts: 1 }, requestedRoute: 'default', attempt: async () => ({
    success: false, error: limited(1), reservation: { id: 'reservation-2', amountUsd: 0.5 }, settlement: { accountingStatus: 'unreconciled', actualUsd: null },
  }) })
  assert.equal(unknown.attempts[0].settlement.accountingStatus, 'unreconciled')
  assert.equal(unknown.attempts[0].reservation.amountUsd, 0.5)
})

test('exhaustion stays on Terra without authorization and returns stable 75', async () => {
  const routes = []
  const result = await runRateLimitLifecycle({ policy, requestedRoute: 'default', fallbackAuthorized: false, wait: async () => {}, attempt: async ({ route }) => { routes.push(route); return { success: false, error: limited(1) } } })
  assert.equal(result.outcome, 'rate-limit-exhausted')
  assert.equal(result.exitCode, RATE_LIMIT_EXIT_CODE)
  assert.deepEqual(routes, ['default', 'default', 'default'])
})

test('authorized fallback reserves the final envelope slot for Luna only', async () => {
  const routes = []
  const waits = []
  const statuses = []
  const result = await runRateLimitLifecycle({ policy, requestedRoute: 'default', fallbackAuthorized: true, status: event => statuses.push(event), wait: async ms => waits.push(ms), attempt: async ({ route }) => { routes.push(route); return { success: route === 'economy', error: limited(1) } } })
  assert.equal(result.exitCode, 0)
  assert.deepEqual(routes, ['default', 'default', 'economy'])
  assert.deepEqual(waits, [1, 1])
  assert.equal(statuses.at(-1).nextAction, 'luna-fallback')
  await assert.rejects(runRateLimitLifecycle({ policy, requestedRoute: 'economy', fallbackAuthorized: true, attempt: async () => ({ success: false, error: limited(1) }) }), /only for the default/)
})

test('cancelled attempt is terminal and never starts a second attempt', async () => {
  let calls = 0
  const result = await runRateLimitLifecycle({ policy, requestedRoute: 'default', attempt: async () => { calls += 1; return { success: false, cancelled: true, exitCode: CANCELLATION_EXIT_CODE, accounting: { costEntryId: 'c1' } } } })
  assert.equal(result.outcome, 'cancelled')
  assert.equal(result.exitCode, CANCELLATION_EXIT_CODE)
  assert.equal(calls, 1)
  assert.equal(result.attempts[0].accounting.costEntryId, 'c1')
})

test('cancellation interrupts countdown without another provider call', async () => {
  const controller = new AbortController()
  let calls = 0
  const result = await runRateLimitLifecycle({ policy, requestedRoute: 'default', signal: controller.signal, wait: async () => controller.abort(), attempt: async () => { calls += 1; return { success: false, error: limited(1) } } })
  assert.equal(result.exitCode, CANCELLATION_EXIT_CODE)
  assert.equal(calls, 1)
})

test('countdown status is observable with injected clock and sleeper', async () => {
  let now = 0
  const observed = []
  await waitWithCountdown(2000, { clock: () => now, sleep: async ms => { now += ms }, status: event => observed.push(event) })
  assert.equal(observed[0].remainingMs, 2000)
  assert.equal(observed.at(-1).remainingMs, 0)
})
