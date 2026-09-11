import { memo } from "react"
import MicroAppPreviewContent from "../../MicroAppPreviewContent"
import type { PublishedMicroAppTabData } from "../hooks/usePublishedMicroAppTab"

export interface MicroAppTabContentProps {
	data: PublishedMicroAppTabData
}

function MicroAppTabContent({ data }: MicroAppTabContentProps) {
	return <MicroAppPreviewContent appId={data.appId} appName={data.appName} />
}

export default memo(MicroAppTabContent)
