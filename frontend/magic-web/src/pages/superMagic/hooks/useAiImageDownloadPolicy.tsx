import { lazy, Suspense, useMemo, useState } from "react"
import { useMemoizedFn } from "ahooks"
import { DownloadImageMode } from "@/pages/superMagic/pages/Workspace/types"
import { isInternationalEnv } from "@/utils/env"
import { useAiWatermarkPreference } from "@/hooks/useAiWatermarkPreference"

const loadWaterMarkFreeModal = () => {
	return import("@/pages/superMagic/components/WaterMarkFreeModal").then((module) => ({
		default: module.WaterMarkFreeModal,
	}))
}

const WaterMarkFreeModal = lazy(() => loadWaterMarkFreeModal())

interface UseAiImageDownloadPolicyOptions<TTarget> {
	onDownload?: (mode: DownloadImageMode, target?: TTarget) => void | Promise<void>
}

/**
 * Shared AI image download policy for file-list, file-preview and canvas download entries.
 * Presentation layers only adapt menu labels; agreement, entitlement and preload rules stay here.
 */
export function useAiImageDownloadPolicy<TTarget = never>({
	onDownload,
}: UseAiImageDownloadPolicyOptions<TTarget>) {
	const [visible, setVisible] = useState(false)
	const [downloadTarget, setDownloadTarget] = useState<TTarget | undefined>()
	const [initialized, setInitialized] = useState(false)
	const isInternationalSite = useMemo(() => isInternationalEnv(), [])
	const { hasGlobalAgreement, isFreeTrialVersion } = useAiWatermarkPreference()

	const preloadWaterMarkFreeModal = useMemoizedFn(() => {
		void loadWaterMarkFreeModal().then(() => {
			setInitialized(true)
		})
	})

	const shouldUseSingleDownloadEntry =
		!isInternationalSite && hasGlobalAgreement && !isFreeTrialVersion

	const handleDownloadNoWaterMark = useMemoizedFn((target?: TTarget) => {
		if (isInternationalSite || hasGlobalAgreement) {
			void onDownload?.(DownloadImageMode.HighQuality, target)
			return
		}

		setDownloadTarget(target)
		setVisible(true)
	})

	const agreementModal = (initialized || visible) && (
		<Suspense fallback={null}>
			<WaterMarkFreeModal
				visible={visible}
				onClose={() => {
					setVisible(false)
					setDownloadTarget(undefined)
				}}
				onConfirm={() => {
					setVisible(false)
					void onDownload?.(DownloadImageMode.HighQuality, downloadTarget)
					setDownloadTarget(undefined)
				}}
			/>
		</Suspense>
	)

	return {
		agreementModal,
		hasGlobalAgreement,
		isFreeTrialVersion,
		preloadWaterMarkFreeModal,
		shouldUseSingleDownloadEntry,
		handleDownloadNoWaterMark,
	}
}
