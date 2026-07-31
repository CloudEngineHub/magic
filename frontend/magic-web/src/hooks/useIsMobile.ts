import { useEffect } from "react"
import { useResponsive } from "ahooks"
import { interfaceStore } from "@/stores/interface"
import { isMobile as isMobileDevice } from "@/utils/devices"
import { useMagicWidgetConfig } from "@/providers/MagicWidgetProvider/context"

/** Resolves mobile semantics with device-aware detection enabled by default for Widget embeds. */
export const useIsMobile = () => {
	const { md } = useResponsive()
	const { embedContext, config } = useMagicWidgetConfig()
	const isSmallViewport = !md
	const isDeviceAwareDetectionEnabled =
		Boolean(embedContext) && config.responsive?.mobileDetection !== "viewport"
	const isMobile = isDeviceAwareDetectionEnabled
		? isMobileDevice && isSmallViewport
		: isSmallViewport

	useEffect(() => {
		interfaceStore.setIsMobile(isMobile)
	}, [isMobile])

	return isMobile
}
