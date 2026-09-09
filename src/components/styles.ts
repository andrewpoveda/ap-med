import type { CSSProperties } from 'react'

// Shared inline styles retain their precedence over page CSS. Keep distinct
// variants where the existing interfaces use different spacing.

export const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '12px',
  padding: '1.5rem',
  boxShadow: '0 1px 3px rgba(26,26,46,0.04)',
}

export const compactCardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '12px',
  padding: '1.25rem 1.5rem',
  boxShadow: '0 1px 3px rgba(26,26,46,0.04)',
}

export const centeredHeaderStyle: CSSProperties = {
  textAlign: 'center',
  fontWeight: 600,
  fontSize: '0.78rem',
  padding: '0.5rem 0.75rem',
  whiteSpace: 'nowrap',
}

export const sessionInputStyle: CSSProperties = {
  width: '100%',
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '8px',
  padding: '0.6rem 0.75rem',
  fontSize: '0.95rem',
  color: '#1a1a2e',
}

export const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#4a4a5a',
  margin: '0 0 0.35rem',
}

export const inputStyle: CSSProperties = {
  width: '100%',
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '8px',
  padding: '0.55rem 0.7rem',
  fontSize: '0.95rem',
  color: '#1a1a2e',
}

export const goldButton: CSSProperties = {
  background: '#c8a96e',
  color: '#1a1a2e',
  padding: '0.6rem 1.4rem',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '0.9rem',
  border: 'none',
  cursor: 'pointer',
}

export const linkButton: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#8a6a2f',
  cursor: 'pointer',
}

export const eyebrowStyle: CSSProperties = {
  fontSize: '0.7rem',
  color: '#9a948a',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  margin: '0 0 0.5rem',
}

export const onboardingLabelStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.875rem',
  color: '#4a4a5a',
  marginBottom: '0.4rem',
}

export const onboardingInputStyle: CSSProperties = {
  width: '100%',
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '8px',
  padding: '0.75rem 1rem',
  color: '#1a1a2e',
  fontSize: '0.95rem',
  outline: 'none',
  boxSizing: 'border-box',
}

export const securityPanelStyle: CSSProperties = {
  padding: '1rem',
  border: '1px solid #e8e4dc',
  borderRadius: '12px',
  background: '#f7f3ec',
}

export const retryButtonStyle: CSSProperties = {
  alignSelf: 'flex-start',
  border: 0,
  background: 'transparent',
  color: '#8a6a2f',
  fontSize: '0.8rem',
  fontWeight: 600,
  textDecoration: 'underline',
  cursor: 'pointer',
}
