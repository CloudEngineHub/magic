import { lazy, Suspense } from "react"
import { Loader2 } from "lucide-react"

const AppPageDesktop = lazy(() => import("@/pages/superMagic/pages/AppPage/index.desktop"))

function AppPageFallback() {
	return (
		<div className="flex h-full w-full items-center justify-center">
			<Loader2 className="size-8 animate-spin text-muted-foreground" />
		</div>
	)
}

export default function AppPage() {
	return (
		<Suspense fallback={<AppPageFallback />}>
			<AppPageDesktop />
		</Suspense>
	)
}
