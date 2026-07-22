import { useTranslation } from "react-i18next"
import { useMemo } from "react"
import { Flex } from "antd"
import { DownloadImageMode } from "@/pages/superMagic/pages/Workspace/types"
import type { AttachmentItem } from "../../../../TopicFilesButton/hooks"
import { useAiImageDownloadPolicy } from "@/pages/superMagic/hooks/useAiImageDownloadPolicy"

interface UseDownloadImageMenuProps {
	/* 下载回调 */
	onDownload?: (mode?: DownloadImageMode, item?: AttachmentItem) => void
}

/**
 * AI image download menu: routes no-watermark action through agreement modal when required.
 */
export function useDownloadImageMenu({ onDownload }: UseDownloadImageMenuProps) {
	const { t } = useTranslation("super")
	const {
		agreementModal,
		isFreeTrialVersion,
		preloadWaterMarkFreeModal,
		shouldUseSingleDownloadEntry,
		handleDownloadNoWaterMark,
	} = useAiImageDownloadPolicy<AttachmentItem>({ onDownload })

	const downloadImageDropdownItems = useMemo(() => {
		if (shouldUseSingleDownloadEntry) {
			return [
				{
					key: "download",
					label: t("fileViewer.downloadImage"),
				},
			]
		}

		return [
			{
				key: "download",
				label: t("fileViewer.downloadImage"),
			},
			{
				key: "downloadNoWaterMark",
				label: (
					<Flex align="center" gap={4}>
						<span>{t("fileViewer.downloadNoWaterMark")}</span>
					</Flex>
				),
			},
		]
	}, [shouldUseSingleDownloadEntry, t])

	const downloadMenuClick = ({ key }: { key: string }) => {
		switch (key) {
			case "download":
				if (shouldUseSingleDownloadEntry) {
					onDownload?.(DownloadImageMode.HighQuality)
					break
				}
				onDownload?.(DownloadImageMode.NormalDownload)
				break
			case "downloadNoWaterMark":
				handleDownloadNoWaterMark()
				break
		}
	}

	return {
		agreementModal,
		downloadImageDropdownItems,
		isFreeTrialVersion,
		downloadMenuClick,
		handleDownloadNoWaterMark,
		preloadWaterMarkFreeModal,
		shouldUseSingleDownloadEntry,
	}
}
