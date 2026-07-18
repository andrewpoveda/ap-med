// Application-status chip palette, shared by the list and detail pages.
// Tinted states are the ones a board member scans for; waitlisted stays
// neutral. Same color families as the cohort chips on /admin.
export const STATUS_CHIP_STYLES: Record<
  string,
  { bg: string; border: string; color: string }
> = {
  submitted: { bg: '#fdf6e3', border: '#e0c060', color: '#8a6d1f' },
  approved: { bg: '#eaf6ef', border: '#9bd3b3', color: '#2f8f5f' },
  rejected: { bg: '#faeceb', border: '#e0a49e', color: '#a34a42' },
}

export const NEUTRAL_CHIP = { bg: '#f5f2ec', border: '#e8e4dc', color: '#6b6b6b' }
