export interface MessageSendRenameTaskParams {
	topicId: string
	renameTopic: () => Promise<string | null>
	syncProjectName: (topicName: string) => Promise<void>
	onError: (error: unknown) => void
}

export interface MessageSendRenameResult {
	topicId: string
	topicName: string
}

export interface MessageSendRenameTask {
	completion: Promise<MessageSendRenameResult | null>
}

const projectRenameTasks = new Map<string, Promise<MessageSendRenameResult | null>>()

export function startMessageSendRenameTask(
	params: MessageSendRenameTaskParams,
): MessageSendRenameTask {
	const completion = (async () => {
		let topicName: string | null
		try {
			topicName = await params.renameTopic()
		} catch (error) {
			params.onError(error)
			return null
		}

		if (!topicName) return null

		try {
			await params.syncProjectName(topicName)
		} catch (error) {
			// 话题重命名已经成功，项目名同步失败时仍允许详情页按实际服务端状态刷新。
			params.onError(error)
		}

		return {
			topicId: params.topicId,
			topicName,
		}
	})()

	return { completion }
}

export function trackProjectRenameTask(
	projectId: string,
	completion: Promise<MessageSendRenameResult | null>,
): void {
	if (!projectId) return
	projectRenameTasks.set(projectId, completion)
}

export function takeProjectRenameTask(
	projectId: string,
): Promise<MessageSendRenameResult | null> | null {
	const completion = projectRenameTasks.get(projectId) ?? null
	if (completion) {
		projectRenameTasks.delete(projectId)
	}
	return completion
}
