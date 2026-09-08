const RATE_LIMIT_DELAY = /please try again in\s+(\d+(?:\.\d+)?)\s*(ms|s)\b/i
const HARNESS_RATE_LIMIT = /^dsh:\s*RATE_LIMIT:\s*(.+)$/im

export const RATE_LIMIT_EXIT_CODE = 75
export const CANCELLATION_EXIT_CODE = 130

export function validateRateLimitPolicy(policy) {
  const value = policy?.rateLimit
  if (!value || typeof value !== 'object') throw new Error('rateLimit configuration is required')
  for (const key of ['maximumAttempts', 'baseDelayMs', 'maximumDelayMs']) {
    if (!Number.isSafeInteger(value[key]) || value[key] <= 0) throw new Error(`rateLimit.${key} must be a positive integer`)
  }
  if (value.maximumAttempts < 1) throw new Error('rateLimit.maximumAttempts must include the first attempt')
  if (value.baseDelayMs > value.maximumDelayMs) throw new Error('rateLimit.baseDelayMs may not exceed rateLimit.maximumDelayMs')
  if (typeof value.jitterRatio !== 'number' || value.jitterRatio < 0 || value.jitterRatio > 1) throw new Error('rateLimit.jitterRatio must be between 0 and 1')
  return Object.freeze({ ...value })
}

export function parseProviderDelay(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value)
  if (typeof value === 'string') {
    const match = value.match(RATE_LIMIT_DELAY)
    return match ? Math.round(Number(match[1]) * (match[2].toLowerCase() === 's' ? 1000 : 1)) : null
  }
  const sources = [value?.retryAfterMs, value?.retry_after_ms, value?.retryAfter, value?.message, value?.error?.message, value?.error?.retryAfterMs]
  for (const candidate of sources) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) return Math.round(candidate)
    if (typeof candidate !== 'string') continue
    const match = candidate.match(RATE_LIMIT_DELAY)
    if (match) return Math.round(Number(match[1]) * (match[2].toLowerCase() === 's' ? 1000 : 1))
  }
  return null
}

export function classifyProviderFailure(error) {
  const status = error?.status ?? error?.statusCode ?? error?.response?.status
  const code = String(error?.code ?? error?.type ?? error?.error?.code ?? error?.error?.type ?? '').toUpperCase()
  const message = [error?.message, error?.stderr, error?.error?.message].filter(Boolean).join('\n')
  const quota = /insufficient[_ ]quota|persistent[_ ]quota|quota exceeded/i.test(`${code}\n${message}`)
  const harnessMessage = message.match(HARNESS_RATE_LIMIT)?.[0] ?? null
  const rateLimit = status === 429 || code === 'RATE_LIMIT' || code === 'RATE_LIMIT_ERROR' || Boolean(harnessMessage)
  const providerDelayMs = parseProviderDelay(error) ?? (harnessMessage ? parseProviderDelay(harnessMessage) : null)
  if (quota) return { classification: 'persistent-quota', retryable: false, providerDelayMs, reason: 'Persistent or insufficient quota is terminal.' }
  if (rateLimit && providerDelayMs !== null) return { classification: 'rate-limit', retryable: true, providerDelayMs, reason: 'Provider/Harness rate limit with a recognized delay.' }
  if (rateLimit) return { classification: 'rate-limit-without-delay', retryable: false, providerDelayMs: null, reason: 'Rate limit without a recognized delay is fail-closed.' }
  return { classification: 'terminal', retryable: false, providerDelayMs: null, reason: 'Failure is not an explicitly supported rate limit.' }
}

export function retryDelay(attemptNumber, classification, policy, rng = Math.random) {
  const validated = validateRateLimitPolicy({ rateLimit: policy })
  const calculatedBackoffMs = Math.min(validated.maximumDelayMs, validated.baseDelayMs * (2 ** Math.max(0, attemptNumber - 1)))
  const raw = classification.providerDelayMs ?? calculatedBackoffMs
  const selectedBeforeJitterMs = Math.min(validated.maximumDelayMs, raw)
  const jitter = classification.providerDelayMs === null ? ((rng() * 2) - 1) * validated.jitterRatio : 0
  const delayMs = Math.max(0, Math.min(validated.maximumDelayMs, Math.round(selectedBeforeJitterMs * (1 + jitter))))
  return { calculatedBackoffMs, providerDelayMs: classification.providerDelayMs, delayMs }
}

export async function waitWithCountdown(delayMs, { signal, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), status = () => {}, clock = () => Date.now() } = {}) {
  if (signal?.aborted) throw Object.assign(new Error('Operator cancelled during rate-limit countdown'), { cancelled: true })
  const started = clock()
  status({ type: 'rate-limit-wait', delayMs, remainingMs: delayMs, nextAction: 'retry' })
  while (clock() - started < delayMs) {
    if (signal?.aborted) throw Object.assign(new Error('Operator cancelled during rate-limit countdown'), { cancelled: true })
    const remainingMs = Math.max(0, delayMs - (clock() - started))
    await sleep(Math.min(1000, remainingMs))
    status({ type: 'rate-limit-wait', delayMs, remainingMs: Math.max(0, delayMs - (clock() - started)), nextAction: 'retry' })
  }
}

export async function runRateLimitLifecycle({ policy, requestedRoute, fallbackAuthorized, attempt, wait = waitWithCountdown, status = () => {}, rng = Math.random, signal }) {
  const retryPolicy = validateRateLimitPolicy({ rateLimit: policy })
  if (fallbackAuthorized && requestedRoute !== 'default') throw new Error('Rate-limit economy fallback is valid only for the default route')
  const attempts = []
  let route = requestedRoute
  let fallbackUsed = false
  for (let number = 1; number <= retryPolicy.maximumAttempts; number += 1) {
    if (signal?.aborted) return { attempts, outcome: 'cancelled', exitCode: CANCELLATION_EXIT_CODE }
    const result = await attempt({ number, route, fallbackAuthorized: fallbackUsed || false, signal })
    const classification = result.classification ?? classifyProviderFailure(result.error)
    const record = { number, route, ...result, classification: classification.classification, providerDelayMs: classification.providerDelayMs ?? null }
    attempts.push(record)
    if (result.success) return { attempts, outcome: 'completed', exitCode: 0 }
    if (result.cancelled) return { attempts, outcome: 'cancelled', exitCode: CANCELLATION_EXIT_CODE }
    // Preserve one final Luna attempt inside the same fixed envelope: retries stay
    // on Terra until its final available slot is reserved for authorized fallback.
    const mayFallback = requestedRoute === 'default' && fallbackAuthorized && !fallbackUsed && classification.retryable && number === retryPolicy.maximumAttempts - 1
    if (!classification.retryable || number === retryPolicy.maximumAttempts) return { attempts, outcome: classification.retryable ? 'rate-limit-exhausted' : classification.classification, exitCode: classification.retryable ? RATE_LIMIT_EXIT_CODE : result.exitCode ?? 1 }
    const delay = retryDelay(number, classification, retryPolicy, rng)
    record.calculatedBackoffMs = delay.calculatedBackoffMs
    record.selectedDelayMs = delay.delayMs
    const nextRoute = mayFallback ? 'economy' : route
    status({ type: mayFallback ? 'rate-limit-fallback' : 'rate-limit-retry', attempt: number, ...delay, nextAction: mayFallback ? 'luna-fallback' : 'retry', route: nextRoute })
    try { await wait(delay.delayMs, { signal, status }) } catch (error) {
      record.waitCancelled = true
      return { attempts, outcome: 'cancelled', exitCode: CANCELLATION_EXIT_CODE }
    }
    if (mayFallback) { fallbackUsed = true; route = 'economy' }
  }
  return { attempts, outcome: 'rate-limit-exhausted', exitCode: RATE_LIMIT_EXIT_CODE }
}
