import { lazy, Suspense } from "react"
import { Loader2 } from "lucide-react"

const MicroAppPageDesktop = lazy(
	() => import("@/pages/superMagic/pages/MicroAppPage/index.desktop"),
)

function MicroAppPageFallback() {
	return (
		<div className="flex h-full w-full items-center justify-center">
			<Loader2 className="size-8 animate-spin text-muted-foreground" />
		</div>
	)
}

export default function MicroAppPage() {
	return (
		<Suspense fallback={<MicroAppPageFallback />}>
			<MicroAppPageDesktop />
		</Suspense>
	)
}
