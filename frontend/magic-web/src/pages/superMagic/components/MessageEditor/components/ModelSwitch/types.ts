import type { VideoGenerationConfig } from "@/components/CanvasDesign/public/magic-types"
import type { ModeItem } from "@/pages/superMagic/pages/Workspace/types"
import type { MessageEditorSize } from "../../types"
import type { AddModelType } from "./components/AddModel/store"
import type { ReactElement, ReactNode } from "react"

export type { MessageEditorSize }

export type ModelTabType = "language" | "image" | "video"

export interface ModelConfig {
	max_tokens: number | null
	support_function: boolean
	support_deep_think: boolean
	vector_size: number
	support_multi_modal: boolean
	support_embedding: boolean
}

export interface ProviderItem {
	name: string
	icon: string
	sort: number
	recommended: boolean
}

/**
 * 模型标签
 */
export const enum ModelTagEnum {
	VIP = "VIP",
}

/**
 * 模型状态
 */
export const enum ModelStatusEnum {
	/** 正常 */
	Normal = "normal",
	/** 禁用 */
	Disabled = "disabled",
	/** 删除 */
	Deleted = "deleted",
}

export interface ModelItem {
	id: string
	group_id: string
	model_id: string
	model_name: string
	provider_model_id: string
	model_description: string
	model_icon: string
	model_status: ModelStatusEnum
	sort: number
	tags?: ModelTagEnum[]
	/** 视频模型下发的生成能力配置。 */
	video_generation_config?: VideoGenerationConfig
}

export interface ModelSwitchProps {
	/** 确认式选择只暂存候选，确认后由调用方保存偏好并提交。 */
	selection?:
		| { mode: "immediate" }
		| {
				mode: "confirm"
				onConfirm: (model: ModelItem) => Promise<boolean>
				confirmText: string
				canConfirm: (model: ModelItem) => boolean
				description?: ReactNode
		  }
	trigger?: ReactElement
	allowedTabs?: readonly [ModelTabType, ...ModelTabType[]]
	size?: MessageEditorSize
	selectedModel?: ModelItem | null
	modelList: ModeItem["groups"]
	onModelChange?: (model: ModelItem | null) => void
	onBeforeOpen?: () => Promise<void> | void
	selectedImageModel?: ModelItem | null
	imageModelList?: ModeItem["groups"]
	onImageModelChange?: (model: ModelItem | null) => void
	selectedVideoModel?: ModelItem | null
	videoModelList?: ModeItem["groups"]
	onVideoModelChange?: (model: ModelItem | null) => void
	openAddModelMenuSignal?: number
	showName?: boolean
	showSelectedModelName?: boolean
	showBorder?: boolean
	isLoading?: boolean
	className?: string
	placement?: "top" | "topLeft" | "topRight" | "bottom" | "bottomLeft" | "bottomRight"
	showLabel?: boolean
	/** Whether add model button is allowed (hidden on mobile when false) */
	editable?: boolean
	onAddModel?: (modelType: AddModelType) => void | Promise<void>
	onPreloadAddModel?: () => void
	defaultTab?: ModelTabType
	triggerTab?: ModelTabType
	triggerTestId?: string
}

/**
 * 模式分组信息
 */
export interface ModeModelGroup {
	id: string
	mode_id: string
	icon: string
	color: string
	name: string
	description: string
	sort: number
	status: boolean
	created_at: string
}

export type ModelListKey = "models" | "image_models" | "video_models"

/**
 * 模型列表分组
 */
export type ModelListGroup = ModeItem["groups"][number]
