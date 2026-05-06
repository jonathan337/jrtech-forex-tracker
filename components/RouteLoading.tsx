import { Loader2 } from 'lucide-react'

/** Shown instantly during client navigations via each segment’s loading.tsx */
export default function RouteLoading() {
  return (
    <div
      className="flex min-h-[40vh] w-full flex-col items-center justify-center gap-3 py-16 text-gray-500"
      aria-busy="true"
      aria-label="Loading page"
    >
      <Loader2 className="h-8 w-8 shrink-0 animate-spin text-blue-600" aria-hidden />
      <p className="text-sm text-gray-600">Loading…</p>
    </div>
  )
}
