import { lazy, Suspense } from "react"
import { Loader2 } from "lucide-react"
import { useIsMobile } from "@/hooks/useIsMobile"

const MicroAppPageDesktop = lazy(
	() => import("@/pages/superMagic/pages/MicroAppPage/index.desktop"),
)
const MicroAppPageMobile = lazy(() => import("@/pages/superMagic/pages/MicroAppPage/index.mobile"))

function MicroAppPageFallback() {
	return (
		<div className="flex h-full w-full items-center justify-center">
			<Loader2 className="size-8 animate-spin text-muted-foreground" />
		</div>
	)
}

export default function MicroAppPage() {
	const isMobile = useIsMobile()
	const Content = isMobile ? MicroAppPageMobile : MicroAppPageDesktop

	return (
		<Suspense fallback={<MicroAppPageFallback />}>
			<Content />
		</Suspense>
	)
}
