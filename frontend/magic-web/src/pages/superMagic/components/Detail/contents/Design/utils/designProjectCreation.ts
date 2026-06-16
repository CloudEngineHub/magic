import { SuperMagicApi } from "@/apis"
import type { DesignData } from "../types"
import { compressCanvasData, MAGIC_PROJECT_VERSION_V2 } from "./magicProjectCompression"

export const DESIGN_PROJECT_CONFIG_FILE_NAME = "magic.project.js"

interface CreateDesignProjectFilesOptions {
	projectId: string
	folderName: string
	parentId?: string | number
}

interface CreatedFileResponse {
	file_id?: string
	id?: string
	[key: string]: unknown
}

export interface CreatedDesignProjectFiles {
	folder: CreatedFileResponse
	magicProjectFile: CreatedFileResponse
}

export function createEmptyDesignProjectData(name: string): DesignData {
	return {
		version: MAGIC_PROJECT_VERSION_V2,
		type: "design",
		name,
		canvas: {
			elements: [],
		},
	}
}

export function generateEmptyDesignProjectContent(name: string): string {
	const designData = createEmptyDesignProjectData(name)
	const config = {
		version: designData.version,
		type: designData.type,
		name: designData.name,
		canvas: compressCanvasData(designData.canvas),
	}

	return `window.magicProjectConfig = ${JSON.stringify(config, null, "\t")};`
}

export async function createDesignProjectFiles({
	projectId,
	folderName,
	parentId,
}: CreateDesignProjectFilesOptions): Promise<CreatedDesignProjectFiles> {
	const folder = (await SuperMagicApi.createFile({
		project_id: projectId,
		parent_id: parentId,
		file_name: folderName,
		is_directory: true,
	})) as CreatedFileResponse

	if (!folder?.file_id) {
		throw new Error("文件夹创建失败")
	}

	const magicProjectFile = (await SuperMagicApi.createFile({
		project_id: projectId,
		parent_id: folder.file_id,
		file_name: DESIGN_PROJECT_CONFIG_FILE_NAME,
		is_directory: false,
	})) as CreatedFileResponse

	if (!magicProjectFile?.file_id) {
		throw new Error("文件创建失败")
	}

	await SuperMagicApi.saveFileContent([
		{
			file_id: magicProjectFile.file_id,
			content: generateEmptyDesignProjectContent(folderName),
		},
	])

	return {
		folder,
		magicProjectFile,
	}
}
