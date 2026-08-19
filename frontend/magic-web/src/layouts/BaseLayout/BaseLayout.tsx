import { lazy, Suspense } from "react"
import { observer } from "mobx-react-lite"
import { useIsMobile } from "@/hooks/useIsMobile"
import recordingSummaryStore from "@/stores/recordingSummary"
import BaseLayoutSketch from "./components/Sketch"
import { MagicWidgetProvider, useMagicWidgetConfig } from "@/providers/MagicWidgetProvider"

const RecordingSummaryFloatPanel = lazy(
	() => import("@/components/business/RecordingSummary/FloatPanel"),
)

const BaseLayoutMobile = lazy(() => import("@/layouts/BaseLayoutMobile"))
const BaseLayoutPc = lazy(() => import("./BaseLayoutPc"))

/** Keeps the legacy viewport-driven shell for pages without an explicit Widget layout. */
function ResponsiveBaseLayoutShell() {
	const isMobile = useIsMobile()
	return isMobile ? <BaseLayoutMobile /> : <BaseLayoutPc />
}

/** Pins the iframe shell when Widget config selects a layout, avoiding breakpoint remounts. */
export function BaseLayoutShell() {
	const { config, embedContext } = useMagicWidgetConfig()
	if (embedContext && config.layout) {
		return config.layout === "mobile" ? <BaseLayoutMobile /> : <BaseLayoutPc />
	}
	return <ResponsiveBaseLayoutShell />
}

/** Root layout: PC shell or mobile V1 shell (SuperMobileShell lives inside route-level layouts). */
const BaseLayout = observer(() => {
	return (
		<MagicWidgetProvider>
			<Suspense fallback={<BaseLayoutSketch />}>
				<BaseLayoutShell />
			</Suspense>
			{(recordingSummaryStore.isFloatPanelLoaded || recordingSummaryStore.isVisible) && (
				<Suspense fallback={null}>
					<RecordingSummaryFloatPanel />
				</Suspense>
			)}
		</MagicWidgetProvider>
	)
})

export default BaseLayout
