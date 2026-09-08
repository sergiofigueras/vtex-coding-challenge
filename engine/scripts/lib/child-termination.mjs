export function installChildTermination({ child, signal, graceMs = 2000, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout }) {
  let timer = null
  let cleaned = false
  const terminate = () => {
    if (cleaned || child.exitCode !== null || child.signalCode) return
    child.kill('SIGTERM')
    timer = setTimeoutFn(() => {
      if (child.exitCode === null && !child.signalCode) child.kill('SIGKILL')
      timer = null
    }, graceMs)
  }
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    signal?.removeEventListener('abort', terminate)
    if (timer !== null) {
      clearTimeoutFn(timer)
      timer = null
    }
  }
  signal?.addEventListener('abort', terminate, { once: true })
  if (signal?.aborted) terminate()
  return cleanup
}
