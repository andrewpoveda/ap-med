import type { ReactNode } from 'react'
import styles from './CohortRelationshipWorkspace.module.css'

export function CohortRelationshipWorkspace({
  children,
  separateFromGeneralTools = false,
}: {
  children: ReactNode
  separateFromGeneralTools?: boolean
}) {
  const className = separateFromGeneralTools
    ? `${styles.workspace} ${styles.workspaceSeparated}`
    : styles.workspace

  return <div className={className}>{children}</div>
}

export function CohortRelationshipTools({ children }: { children: ReactNode }) {
  return <div className={styles.tools}>{children}</div>
}
