import type { Dispatch, SetStateAction } from "react"
import { SuperMagicApi } from "@/apis"
import magicToast from "@/components/base/MagicToaster/utils"
import pubsub, { PubSubEvents } from "@/utils/pubsub"

interface CreateSelfMediaProjectOptions {
	projectId?: string
	folderName: string
	parentPath?: string
	getParentIdFromPath: (parentPath?: string) => string | number | undefined
	setCreatingFiles: Dispatch<SetStateAction<Set<string>>>
	onUpdateAttachments?: () => void
	t: (key: string) => string
}

export async function createSelfMediaProject({
	projectId,
	folderName,
	parentPath,
	getParentIdFromPath,
	setCreatingFiles,
	onUpdateAttachments,
	t,
}: CreateSelfMediaProjectOptions) {
	if (!projectId) {
		throw new Error("项目ID不能为空")
	}

	const projectKey = `${Date.now()}-${Math.random()}`
	setCreatingFiles((prev) => new Set(prev).add(projectKey))

	try {
		const parent_id = getParentIdFromPath(parentPath)

		const folderResponse = await SuperMagicApi.createFile({
			project_id: projectId,
			parent_id,
			file_name: folderName,
			is_directory: true,
		})

		if (!folderResponse?.file_id) {
			throw new Error("文件夹创建失败")
		}

		const fileContent = `window.magicProjectConfig = {
	"version": "1.0.0",
	"type": "self-media",
	"name": "${folderName}",
	"self-media": {}
}

window.magicProjectConfigure(window.magicProjectConfig)`
		const fileName = "magic.project.js"

		const fileResponse = await SuperMagicApi.createFile({
			project_id: projectId,
			parent_id: folderResponse.file_id,
			file_name: fileName,
			is_directory: false,
		})

		if (!fileResponse?.file_id) {
			throw new Error("文件创建失败")
		}

		await SuperMagicApi.saveFileContent([
			{
				file_id: fileResponse.file_id,
				content: fileContent,
			},
		])

		pubsub.publish(PubSubEvents.Update_Attachments)
		onUpdateAttachments?.()

		magicToast.success(t("topicFiles.contextMenu.createSelfMediaSuccess"))

		return folderResponse
	} catch (error) {
		magicToast.error(t("topicFiles.contextMenu.createSelfMediaFailed"))
		throw error
	} finally {
		setCreatingFiles((prev) => {
			const newSet = new Set(prev)
			newSet.delete(projectKey)
			return newSet
		})
	}
}
