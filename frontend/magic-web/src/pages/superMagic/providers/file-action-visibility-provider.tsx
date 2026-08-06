import { createContext, useContext, useMemo, type PropsWithChildren } from "react"

export interface FileActionVisibility {
	hideCopyTo?: boolean
	hideMoveTo?: boolean
	hideShareFile?: boolean
	hideShareTopic?: boolean
	hideCreateNewTopic?: boolean
	hideFullscreen?: boolean
	hideVersionHistory?: boolean
}

interface FileActionVisibilityProviderProps extends PropsWithChildren {
	value?: FileActionVisibility
}

const defaultFileActionVisibility: Required<FileActionVisibility> = {
	hideCopyTo: false,
	hideMoveTo: false,
	hideShareFile: false,
	hideShareTopic: false,
	hideCreateNewTopic: false,
	hideFullscreen: false,
	hideVersionHistory: false,
}

export const HIDE_COPY_MOVE_SHARE_FILE_ACTIONS: FileActionVisibility = {
	hideCopyTo: false,
	hideMoveTo: false,
	hideShareFile: false,
}

export const HIDE_COPY_MOVE_SHARE_FILE_AND_TOPIC_ACTIONS: FileActionVisibility = {
	...HIDE_COPY_MOVE_SHARE_FILE_ACTIONS,
	hideShareTopic: true,
}

export const HIDE_CLAW_FILE_ACTIONS: FileActionVisibility = {
	...HIDE_COPY_MOVE_SHARE_FILE_AND_TOPIC_ACTIONS,
	hideCreateNewTopic: true,
}

/** viewer 仍可预览和下载文件，但不能修改文件或发起分享/对话。 */
export const VIEWER_FILE_ACTIONS: FileActionVisibility = {
	hideCopyTo: true,
	hideMoveTo: true,
	hideShareFile: true,
	hideShareTopic: true,
	hideCreateNewTopic: true,
}

const FileActionVisibilityContext = createContext(defaultFileActionVisibility)

export function FileActionVisibilityProvider({
	children,
	value,
}: FileActionVisibilityProviderProps) {
	const contextValue = useMemo(
		() => ({
			hideCopyTo: value?.hideCopyTo ?? false,
			hideMoveTo: value?.hideMoveTo ?? false,
			hideShareFile: value?.hideShareFile ?? false,
			hideShareTopic: value?.hideShareTopic ?? false,
			hideCreateNewTopic: value?.hideCreateNewTopic ?? false,
			hideFullscreen: value?.hideFullscreen ?? false,
			hideVersionHistory: value?.hideVersionHistory ?? false,
		}),
		[
			value?.hideCopyTo,
			value?.hideCreateNewTopic,
			value?.hideMoveTo,
			value?.hideShareFile,
			value?.hideShareTopic,
			value?.hideFullscreen,
			value?.hideVersionHistory,
		],
	)

	return (
		<FileActionVisibilityContext.Provider value={contextValue}>
			{children}
		</FileActionVisibilityContext.Provider>
	)
}

export function useFileActionVisibility() {
	return useContext(FileActionVisibilityContext)
}
