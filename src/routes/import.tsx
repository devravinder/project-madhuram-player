import { UploadModal } from '@/components/UploadModal'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/import')({
  component: RouteComponent,
})

function RouteComponent() {
  return <UploadModal/>
}
