import { Landmark } from "lucide-react";

/**
 * App-wide loading fallback (Next.js 16 file convention).
 *
 * Shown by Suspense while a route segment is fetching/streaming. This is the
 * top-level fallback — individual segments can override with their own
 * `<segment>/loading.tsx` to show route-specific skeletons (e.g.
 * `app/search/loading.tsx` for grant card placeholders).
 *
 * Server Component by default. No interactivity needed.
 *
 * Why a centered logo + pulse instead of a generic spinner: it gives users
 * the brand reassurance that they're still on 지원금 찾기 even on slow
 * networks where the layout hasn't fully painted yet.
 */

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 py-12">
      <div className="flex items-center gap-2 text-gray-400">
        <Landmark className="h-5 w-5 animate-pulse text-blue-600" />
        <span className="text-sm font-medium">지원금 찾기</span>
      </div>
      <div className="flex gap-1">
        <span className="h-2 w-2 animate-bounce rounded-full bg-blue-600 [animation-delay:-0.3s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-blue-600 [animation-delay:-0.15s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-blue-600" />
      </div>
    </div>
  );
}
