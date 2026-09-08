/** Program display identity only. The verified sending address stays operator-owned. */
export function programEmailFrom(programName: string): string {
  const name = programName.replace(/[\r\n<>"\\]/g, '').trim().slice(0, 80)
  return name ? `"${name} via AP MED" <mentors@ap-med.org>` : 'AP MED Mentors <mentors@ap-med.org>'
}
