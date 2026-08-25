import ImageConvertHight from "../components/image/ImageConvertHight/index"
import { ElementToolTypeEnum } from "../../../public/props"
import type { ElementToolResolution } from "../../../runtime/element-tools"
import { ElementToolResolutionProvider } from "../model/ElementToolResolutionContext"

export default function TopCustomToolRenderer({ tool }: { tool: ElementToolResolution }) {
	if (tool.id !== ElementToolTypeEnum.ContentEnhance) return null
	return (
		<ElementToolResolutionProvider tool={tool}>
			<ImageConvertHight />
		</ElementToolResolutionProvider>
	)
}
