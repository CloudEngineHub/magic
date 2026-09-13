import { type ComponentProps, useCallback, useMemo, useState } from "react"
import useMicroAppInstallFlow from "./useMicroAppInstallFlow"
import useMicroAppSafetyNoticeConfirmation from "./useMicroAppSafetyNoticeConfirmation"
import useMicroAppShareData from "./useMicroAppShareData"
import HtmlPreviewContent from "@/pages/superMagic/components/Detail/contents/HTML"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { resolveSelectedHtmlEntry } from "@/pages/superMagic/pages/MicroAppPage/utils/microAppFiles"
import { resolvePublishedDefaultOpenFileId } from "../utils/publishedMicroAppPreview"

type MicroAppPreviewMode = NonNullable<ComponentProps<typeof HtmlPreviewContent>["viewMode"]>

export interface UsePublishedMicroAppPreviewOptions {
	appId: string
	appName?: string
}

export function usePublishedMicroAppPreview({
	appId,
	appName,
}: UsePublishedMicroAppPreviewOptions) {
	const [previewMode, setPreviewMode] = useState<MicroAppPreviewMode>("desktop")
	const [activeFileId, setActiveFileId] = useState<string | null>(null)
	const { hasConfirmedSafetyNotice, confirmSafetyNotice } =
		useMicroAppSafetyNoticeConfirmation(appId)
	const shareDataState = useMicroAppShareData({ appId })
	const {
		shareData,
		shareMeta,
		attachmentList,
		loading,
		error,
		isNeedPassword,
		resourceId,
		verifiedPassword,
	} = shareDataState

	const defaultOpenFileId = useMemo(
		() => resolvePublishedDefaultOpenFileId(shareData),
		[shareData],
	)
	const defaultEntryFile = useMemo(
		() =>
			resolveSelectedHtmlEntry({ items: attachmentList, selectedFileId: defaultOpenFileId }),
		[attachmentList, defaultOpenFileId],
	)
	const displayAppName = appName?.trim() || shareMeta.projectName
	const previewFile = useMemo(
		() => attachmentList.find((item) => item.file_id === activeFileId) || defaultEntryFile,
		[activeFileId, attachmentList, defaultEntryFile],
	)
	const installFlow = useMicroAppInstallFlow({
		appId,
		hasEntryFile: Boolean(previewFile),
		hasError: Boolean(error),
		hasShareData: Boolean(shareData),
		isLoading: loading,
		isNeedPassword,
		resourceId,
		safetyConfirmed: hasConfirmedSafetyNotice,
		verifiedPassword,
	})

	const rememberVerifiedPassword = installFlow.rememberVerifiedPassword
	const { setError, setVerifiedPassword } = shareDataState
	const handleVerifySuccess = useCallback(
		(_data: unknown, password?: string) => {
			setError(null)
			rememberVerifiedPassword(password)
			setVerifiedPassword(password)
		},
		[rememberVerifiedPassword, setError, setVerifiedPassword],
	)
	const handleOpenFileTab = useCallback((fileItem: AttachmentItem) => {
		if (fileItem.file_id) {
			setActiveFileId(fileItem.file_id)
		}
	}, [])

	return {
		appId,
		...shareDataState,
		hasConfirmedSafetyNotice,
		confirmSafetyNotice,
		displayAppName,
		previewFile,
		defaultEntryFile,
		installFlow,
		previewMode,
		setPreviewMode,
		handleVerifySuccess,
		handleOpenFileTab,
	}
}

export type UsePublishedMicroAppPreviewReturn = ReturnType<typeof usePublishedMicroAppPreview>
