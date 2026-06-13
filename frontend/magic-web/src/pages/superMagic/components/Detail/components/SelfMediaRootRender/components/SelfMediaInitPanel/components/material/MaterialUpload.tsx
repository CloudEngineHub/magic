/**
 * MaterialUpload - legacy wrapper around MaterialAttachmentList
 */

import MaterialAttachmentList from "./MaterialAttachmentList"
import type { MaterialItem } from "../../types"
import { useTranslation } from "react-i18next"

interface MaterialUploadProps {
	materials: MaterialItem[]
	onChange: (materials: MaterialItem[]) => void
	className?: string
}

export default function MaterialUpload({ materials, onChange, className }: MaterialUploadProps) {
	const { t } = useTranslation("super")

	return (
		<MaterialAttachmentList
			materials={materials}
			onChange={onChange}
			className={className}
			addLabel={t(
				"detail.selfMedia.initPanel.materialAttachment.addFull",
				"点击、拖拽或粘贴上传附件",
			)}
			descriptionPlaceholder={t(
				"detail.selfMedia.initPanel.materialAttachment.descriptionPlaceholder",
				"添加说明…",
			)}
			emptyHint={t(
				"detail.selfMedia.initPanel.materialAttachment.emptyHint",
				"支持图片、视频、PDF、Office 文档等",
			)}
		/>
	)
}
