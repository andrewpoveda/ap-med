import { notFound } from 'next/navigation'
import AscensoApplyForm from '@/app/ascenso/apply/AscensoApplyForm'

export default function AscensoPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound()

  return <AscensoApplyForm cohortId="local-preview" cohortName="Ascenso 2026–27" />
}
