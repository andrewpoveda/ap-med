'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'

export type TurnstileStatus = 'loading' | 'ready' | 'error'

export type ReliableTurnstileHandle = {
  isExpired: () => boolean
  reset: () => void
  retry: () => void
}

type Props = {
  siteKey: string
  onTokenChange: (token: string | null) => void
  onStatusChange: (status: TurnstileStatus) => void
}

const SCRIPT_ID = 'cf-turnstile-script'
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/**
 * Turnstile's React wrapper can reset a loaded widget, but its built-in script
 * loader cannot recover after the script request itself fails: the failed
 * element and its unresolved loader promise remain in place. This wrapper owns
 * script injection so Retry can remove and genuinely reload a failed script
 * without reloading the page or losing the form's React state.
 */
export const ReliableTurnstile = forwardRef<ReliableTurnstileHandle, Props>(
  function ReliableTurnstile({ siteKey, onTokenChange, onStatusChange }, ref) {
    const widgetRef = useRef<TurnstileInstance | undefined>(undefined)
    const scriptFailedRef = useRef(false)
    const onTokenChangeRef = useRef(onTokenChange)
    const onStatusChangeRef = useRef(onStatusChange)
    const [scriptAttempt, setScriptAttempt] = useState(0)

    // Form callbacks are intentionally allowed to be inline. Keep their latest
    // versions without treating every parent render as a reason to reload the
    // external Turnstile script.
    onTokenChangeRef.current = onTokenChange
    onStatusChangeRef.current = onStatusChange

    const updateToken = useCallback((token: string | null) => {
      onTokenChangeRef.current(token)
    }, [])

    const updateStatus = useCallback((status: TurnstileStatus) => {
      onStatusChangeRef.current(status)
    }, [])

    const hasLoadedScript = useCallback(() => {
      if (typeof window === 'undefined') return false
      return Boolean((window as Window & { turnstile?: unknown }).turnstile)
    }, [])

    const restartScript = useCallback(() => {
      if (typeof document !== 'undefined') {
        document.getElementById(SCRIPT_ID)?.remove()
      }
      scriptFailedRef.current = false
      updateToken(null)
      updateStatus('loading')
      setScriptAttempt(attempt => attempt + 1)
    }, [updateStatus, updateToken])

    const resetWidget = useCallback(() => {
      updateToken(null)
      updateStatus('loading')
      if (scriptFailedRef.current || !hasLoadedScript()) {
        restartScript()
        return
      }
      widgetRef.current?.reset()
    }, [hasLoadedScript, restartScript, updateStatus, updateToken])

    useImperativeHandle(
      ref,
      () => ({
        isExpired: () => widgetRef.current?.isExpired() === true,
        reset: resetWidget,
        retry: resetWidget,
      }),
      [resetWidget],
    )

    useEffect(() => {
      if (typeof window === 'undefined' || typeof document === 'undefined') return

      let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null

      const handleScriptError = () => {
        if (script) script.dataset.apMedTurnstileStatus = 'error'
        scriptFailedRef.current = true
        updateToken(null)
        updateStatus('error')
      }

      // A prior form on the same page load may already have loaded Turnstile.
      // Keep a marker with the expected id so the wrapper observes readiness
      // without downloading the script a second time.
      if (hasLoadedScript()) {
        if (!script) {
          script = document.createElement('script')
          script.id = SCRIPT_ID
          script.dataset.apMedTurnstileLoaded = 'true'
          script.dataset.apMedTurnstileStatus = 'loaded'
          document.head.appendChild(script)
        }
        return
      }

      // React Strict Mode remounts effects in development while the first
      // request is still in flight. Reuse that live request and reattach its
      // error handler rather than downloading Turnstile twice. A script that
      // already failed (or claimed to load without creating the API) is stale
      // and must be replaced.
      const existingStatus = script?.dataset.apMedTurnstileStatus
      if (script && existingStatus !== 'error' && existingStatus !== 'loaded') {
        script.onerror = handleScriptError
        return () => {
          if (script) script.onerror = null
        }
      }

      script?.remove()
      script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = SCRIPT_SRC
      script.async = true
      script.defer = true
      script.dataset.apMedTurnstileStatus = 'loading'
      script.onload = () => {
        if (script) script.dataset.apMedTurnstileStatus = 'loaded'
      }
      script.onerror = handleScriptError
      document.head.appendChild(script)

      return () => {
        if (script) {
          script.onload = null
          script.onerror = null
        }
      }
    }, [hasLoadedScript, scriptAttempt, updateStatus, updateToken])

    return (
      <Turnstile
        key={scriptAttempt}
        ref={widgetRef}
        siteKey={siteKey}
        injectScript={false}
        scriptOptions={{ id: SCRIPT_ID }}
        onSuccess={token => {
          scriptFailedRef.current = false
          updateToken(token)
          updateStatus('ready')
        }}
        onExpire={() => {
          updateToken(null)
          updateStatus('loading')
        }}
        onTimeout={() => {
          updateToken(null)
          updateStatus('loading')
        }}
        onError={() => {
          updateToken(null)
          updateStatus('error')
        }}
        onUnsupported={() => {
          updateToken(null)
          updateStatus('error')
        }}
        options={{
          theme: 'light',
          appearance: 'always',
          size: 'flexible',
          retry: 'auto',
          refreshExpired: 'auto',
          refreshTimeout: 'auto',
        }}
      />
    )
  },
)
