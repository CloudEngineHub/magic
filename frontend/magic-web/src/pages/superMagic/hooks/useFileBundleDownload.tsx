import { useEffect, useRef, useState, type ReactNode } from "react"
import { useMemoizedFn } from "ahooks"
import { useTranslation } from "react-i18next"
import { useIsMobile } from "@/hooks/useIsMobile"
import { IMAGE_EXTENSIONS } from "@/constants/file"
import type { ProjectFilesStore } from "@/stores/projectFiles"
import type { FileDownloadData } from "../components/Detail/types"
import { useFileApi } from "../fileAccess/fileApi"
import { DownloadImageMode } from "../pages/Workspace/types"
import { useDownloadProgress } from "./useDownloadProgress"
import { useAiImageDownloadPolicy } from "./useAiImageDownloadPolicy"
import {
	FileBundleCapacityError,
	FileBundleDownloadError,
	packAndDownloadFileEntries,
} from "../services/fileBundleDownload"

export const FILE_BUNDLE_DOWNLOAD_LIMITS = {
	desktopBytes: 256 * 1024 * 1024,
	mobileBytes: 64 * 1024 * 1024,
	concurrency: 4,
} as const

export interface FileBundleDownloadState {
	toolId?: string
	phase: "idle" | "running" | "saved" | "error" | "cancelled"
	error?: string
	failedFiles?: string[]
}

export interface FileBundleDownloadCapability {
	state: FileBundleDownloadState
	progress: number
	canDownload: boolean
	start: (toolId: string, data: FileDownloadData, noWatermark?: boolean) => void
	cancel: () => void
	agreementModal: ReactNode
}

interface DownloadTarget {
	toolId: string
	data: FileDownloadData
	scopeKey: string
}

export function containsDownloadImages(data: FileDownloadData): boolean {
	return data.items.some((item) =>
		IMAGE_EXTENSIONS.includes(item.file_name.split(".").pop()?.toLowerCase() || ""),
	)
}

/** 挂在消息列表而不是虚拟行：滚动卸载卡片不取消，切换话题／身份才取消。 */
export function useFileBundleDownload(
	topicKey: string,
	filesStore: ProjectFilesStore,
	allowDownload = true,
): FileBundleDownloadCapability {
	const { t } = useTranslation("super")
	const isMobile = useIsMobile()
	const fileApi = useFileApi()
	const { startCustomDownload, cancelDownload, progress } = useDownloadProgress()
	const [state, setState] = useState<FileBundleDownloadState>({ phase: "idle" })
	const running = useRef(false)
	const runVersion = useRef(0)
	const scopeKey = `${topicKey}:${fileApi.identityKey}`

	const execute = useMemoizedFn(async (mode: DownloadImageMode, target?: DownloadTarget) => {
		if (!target || target.scopeKey !== scopeKey || !allowDownload || running.current) return
		if (
			filesStore.currentSelectedProject?.id &&
			String(filesStore.currentSelectedProject.id) !== target.data.project_id
		)
			return
		const maxBytes = isMobile
			? FILE_BUNDLE_DOWNLOAD_LIMITS.mobileBytes
			: FILE_BUNDLE_DOWNLOAD_LIMITS.desktopBytes
		if (target.data.total_bytes > maxBytes) {
			setState({ toolId: target.toolId, phase: "error", error: t("fileDownload.tooLarge") })
			return
		}
		running.current = true
		const currentRun = ++runVersion.current
		setState({ toolId: target.toolId, phase: "running" })
		try {
			await startCustomDownload({
				label: t("fileDownload.downloading"),
				task: ({ signal, reportProgress }) =>
					packAndDownloadFileEntries(
						target.data.items.map((item) => ({
							key: item.file_id,
							file: item,
							// 高清接口只服务图片；混合文件集合中的其他类型走普通文件授权。
							downloadMode: IMAGE_EXTENSIONS.includes(
								item.file_name.split(".").pop()?.toLowerCase() || "",
							)
								? mode
								: DownloadImageMode.Download,
						})),
						undefined,
						target.data.archive_name,
						{
							signal,
							onProgress: reportProgress,
							fileApi,
							maxBytes,
							concurrency: FILE_BUNDLE_DOWNLOAD_LIMITS.concurrency,
							failureMode: "all_required",
							pathMode: "workspace_relative",
						},
					),
				onSuccess: () => setState({ toolId: target.toolId, phase: "saved" }),
				onCancel: () => setState({ toolId: target.toolId, phase: "cancelled" }),
				onError: (error) =>
					setState({
						toolId: target.toolId,
						phase: "error",
						error:
							error instanceof FileBundleCapacityError
								? t("fileDownload.tooLarge")
								: t("fileDownload.failed"),
						failedFiles:
							error instanceof FileBundleDownloadError
								? error.results
										.filter((item) => !item.success)
										.map((item) => item.fileName)
								: undefined,
					}),
			})
		} finally {
			if (runVersion.current === currentRun) running.current = false
		}
	})
	const policy = useAiImageDownloadPolicy<DownloadTarget>({ onDownload: execute })
	const start = useMemoizedFn((toolId: string, data: FileDownloadData, noWatermark = false) => {
		if (running.current || !allowDownload) return
		const target = { toolId, data, scopeKey }
		if (containsDownloadImages(data) && (noWatermark || policy.shouldUseSingleDownloadEntry)) {
			policy.preloadWaterMarkFreeModal()
			policy.handleDownloadNoWaterMark(target)
		} else {
			void execute(DownloadImageMode.Download, target)
		}
	})
	const cancel = useMemoizedFn(() => {
		runVersion.current += 1
		running.current = false
		cancelDownload()
	})
	useEffect(() => {
		runVersion.current += 1
		cancelDownload()
		running.current = false
		setState({ phase: "idle" })
		return () => cancelDownload()
	}, [scopeKey, allowDownload, cancelDownload])

	return {
		state,
		progress,
		canDownload: allowDownload,
		start,
		cancel,
		agreementModal: policy.agreementModal,
	}
}
