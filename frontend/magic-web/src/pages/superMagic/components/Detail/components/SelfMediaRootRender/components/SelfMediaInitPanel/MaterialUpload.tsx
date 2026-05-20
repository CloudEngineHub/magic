/**
 * MaterialUpload - legacy wrapper around MaterialAttachmentList
 */

import MaterialAttachmentList from "./MaterialAttachmentList"
import type { MaterialItem } from "./types"

interface MaterialUploadProps {
	materials: MaterialItem[]
	onChange: (materials: MaterialItem[]) => void
	className?: string
}

export default function MaterialUpload({ materials, onChange, className }: MaterialUploadProps) {
	return (
		<MaterialAttachmentList
			materials={materials}
			onChange={onChange}
			className={className}
			addLabel="点击或拖拽上传素材"
			descriptionPlaceholder="添加说明（如：产品正面图、用户评价截图…）"
			emptyHint="支持图片、视频、PDF、Office 文档等"
		/>
	)
}
