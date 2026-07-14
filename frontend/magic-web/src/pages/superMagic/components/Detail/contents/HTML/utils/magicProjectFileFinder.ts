import { getFileContentById } from "@/pages/superMagic/utils/api"
import { flattenAttachments, findMatchingFile } from "./index"

const MAGIC_PROJECT_FILE_NAME = "magic.project.js"

/**
 * magic.project.js file information
 */
export interface MagicProjectJsFileInfo {
	fileId: string
	content: string
}

function dedupeFilesById(files: any[]) {
	const seen = new Set<string>()
	const result: any[] = []

	for (const file of files) {
		const fileId = file?.file_id
		if (fileId === undefined || fileId === null) {
			result.push(file)
			continue
		}

		const normalizedFileId = String(fileId)
		if (seen.has(normalizedFileId)) continue
		seen.add(normalizedFileId)
		result.push(file)
	}

	return result
}

function getSingleMagicProjectCandidate(files: any[]) {
	return files.length === 1 ? files[0] : null
}

/**
 * Load magic.project.js file content
 */
export async function loadMagicProjectJsContent(fileId: string): Promise<string> {
	try {
		const content = await getFileContentById(fileId, {
			responseType: "text",
		})

		if (!content || (typeof content === "string" && content.trim().length === 0)) {
			throw new Error("File content is empty")
		}

		return content as string
	} catch (error) {
		console.error("Failed to load magic.project.js content:", error)
		throw error
	}
}

/**
 * Find magic.project.js file in the same directory as the HTML file.
 * If the current slide is missing from attachments, fall back only when there is a single
 * magic.project.js candidate. This keeps delete/sort operations available without guessing
 * between multiple PPT projects.
 */
export async function findMagicProjectJsFile(params: {
	attachments: any[]
	currentFileId: string
	currentFileName: string
}): Promise<MagicProjectJsFileInfo | null> {
	const { attachments, currentFileId, currentFileName } = params

	if (!currentFileId) {
		return null
	}

	try {
		if (currentFileName === MAGIC_PROJECT_FILE_NAME) {
			const content = await loadMagicProjectJsContent(currentFileId)
			return {
				fileId: currentFileId,
				content,
			}
		}

		const allFiles = dedupeFilesById(flattenAttachments(attachments || []))
		const magicProjectCandidates = allFiles.filter(
			(file: any) => file.file_name === MAGIC_PROJECT_FILE_NAME,
		)

		const currentFile = allFiles.find((file: any) => file.file_id === currentFileId)
		if (!currentFile) {
			const fallbackMagicProjectFile = getSingleMagicProjectCandidate(magicProjectCandidates)
			if (fallbackMagicProjectFile) {
				const content = await loadMagicProjectJsContent(fallbackMagicProjectFile.file_id)
				return {
					fileId: fallbackMagicProjectFile.file_id,
					content,
				}
			}

			console.error("findMagicProjectJsFile: Current file not found")
			return null
		}

		let fileRelativeFolderPath = "/"
		if (currentFile.is_directory) {
			fileRelativeFolderPath = `${currentFile.relative_file_path?.replace(/\/+$/, "") || ""}/`
		} else if (currentFile.relative_file_path) {
			const lastSlashIndex = currentFile.relative_file_path.lastIndexOf("/")
			if (lastSlashIndex !== -1) {
				fileRelativeFolderPath = currentFile.relative_file_path.substring(
					0,
					lastSlashIndex + 1,
				)
			}
		}

		const targetPath = fileRelativeFolderPath + MAGIC_PROJECT_FILE_NAME

		let magicProjectJsFile: any | undefined
		if (currentFile.is_directory) {
			const currentDirectoryId = currentFile.file_id
			magicProjectJsFile = allFiles.find(
				(file: any) =>
					file.file_name === MAGIC_PROJECT_FILE_NAME &&
					file.parent_id === currentDirectoryId,
			)
		}

		if (!magicProjectJsFile) {
			magicProjectJsFile = allFiles.find(
				(file: any) =>
					file.file_name === MAGIC_PROJECT_FILE_NAME &&
					file.relative_file_path === targetPath,
			)
		}

		if (!magicProjectJsFile) {
			magicProjectJsFile = findMatchingFile({
				path: "./magic.project.js",
				allFiles,
				htmlRelativeFolderPath: fileRelativeFolderPath,
			})
		}

		if (!magicProjectJsFile) {
			const fallbackMagicProjectFile = getSingleMagicProjectCandidate(magicProjectCandidates)
			if (fallbackMagicProjectFile) {
				const content = await loadMagicProjectJsContent(fallbackMagicProjectFile.file_id)
				return {
					fileId: fallbackMagicProjectFile.file_id,
					content,
				}
			}

			console.error("findMagicProjectJsFile: magic.project.js file not found", {
				targetPath,
				currentFileId,
			})
			return null
		}

		const content = await loadMagicProjectJsContent(magicProjectJsFile.file_id)

		return {
			fileId: magicProjectJsFile.file_id,
			content,
		}
	} catch (error) {
		console.error("Failed to load magic.project.js file:", error)
		return null
	}
}
