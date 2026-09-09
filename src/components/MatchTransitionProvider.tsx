'use client'

import { createContext, useContext, useMemo, useRef } from 'react'
import type { ScoredPublicMentor } from '@/types/mentor'

export type MatchTransitionPayload = {
  mentors: ScoredPublicMentor[]
  menteeName: string
  menteeId: string
  testMode: boolean
}

type MatchTransitionContextValue = {
  getMatchTransition: () => MatchTransitionPayload | null
  setMatchTransition: (payload: MatchTransitionPayload) => void
}

const MatchTransitionContext = createContext<MatchTransitionContextValue | null>(null)

export default function MatchTransitionProvider({ children }: { children: React.ReactNode }) {
  const transitionRef = useRef<MatchTransitionPayload | null>(null)

  const value = useMemo<MatchTransitionContextValue>(() => ({
    getMatchTransition: () => transitionRef.current,
    setMatchTransition: payload => {
      transitionRef.current = payload
    },
  }), [])

  return (
    <MatchTransitionContext.Provider value={value}>
      {children}
    </MatchTransitionContext.Provider>
  )
}

export function useMatchTransition() {
  const context = useContext(MatchTransitionContext)
  if (!context) {
    throw new Error('useMatchTransition must be used within MatchTransitionProvider')
  }
  return context
}
