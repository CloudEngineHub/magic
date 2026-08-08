import type { ElementDetailsProvenance } from "@/components/CanvasDesign/runtime/document/elementDetailsProvenance"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import type { DesignData } from "../types"
import type { DesignAttachmentIndex } from "./designAttachmentIndex"
import {
	getHydratedElementDetailsProvenance,
	hydrateDesignDataDetails,
	type ElementDetailsContext,
} from "./elementDetailsIo"
import {
	upgradeDesignDataToV3,
	validateV3CanvasDocument,
	type DesignDataCodecInput,
} from "./designDataCodec"
import { normalizeDesignDataPathsAfterLoad, parseMagicProjectJsContent } from "./utils"

export type DesignDataRuntimeSource =
	| { content: string; designData?: never }
	| { content?: never; designData: DesignData | DesignDataCodecInput }

export interface DesignDataRuntimePathContext {
	projectBasePath?: string
	flatAttachments?: FileItem[]
	attachmentIndex?: DesignAttachmentIndex | null
}

export type LoadDesignDataToRuntimeOptions = DesignDataRuntimeSource & {
	/** 主文件与 sidecar 上下文；Draft 等已经包含完整数据的来源不传。 */
	elementDetailsContext?: ElementDetailsContext
	pathContext?: DesignDataRuntimePathContext
	/** 首次加载时用真实目录名覆盖信封中的历史名称。 */
	nameOverride?: string
}

export interface LoadDesignDataToRuntimeResult {
	data: DesignData
	elementDetailsProvenance?: ElementDetailsProvenance
}

/**
 * 数据进入 Canvas Runtime 前的唯一编排入口。
 *
 * 负责解析或克隆升级、sidecar 回填、路径标准化和最终 v3 校验；Runtime 不参与版本判断。
 */
export async function loadDesignDataToRuntime(
	options: LoadDesignDataToRuntimeOptions,
): Promise<LoadDesignDataToRuntimeResult | null> {
	const data =
		typeof options.content === "string"
			? parseMagicProjectJsContent(options.content)
			: upgradeDesignDataToV3(options.designData)
	if (!data) return null

	if (options.nameOverride) data.name = options.nameOverride

	let elementDetailsProvenance: ElementDetailsProvenance | undefined
	if (options.elementDetailsContext) {
		elementDetailsProvenance = await hydrateDesignDataDetails(
			data,
			options.elementDetailsContext,
		)
	} else {
		elementDetailsProvenance = getHydratedElementDetailsProvenance(data)
	}

	normalizeDesignDataPathsAfterLoad(data, options.pathContext?.projectBasePath, {
		flatAttachments: options.pathContext?.flatAttachments,
		attachmentIndex: options.pathContext?.attachmentIndex,
	})
	validateV3CanvasDocument(data.canvas)

	return { data, elementDetailsProvenance }
}
