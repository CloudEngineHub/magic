import { useDebounceEffect } from "ahooks"
import { useEffect, useRef, useState } from "react"
import type { DownloadImageMode } from "../pages/Workspace/types"
import type { ImageProcessOptions } from "@/utils/image-processing"
import { useFileApi } from "@/pages/superMagic/fileAccess/fileApi"
import { useFileAccess } from "@/pages/superMagic/fileAccess/FileAccessProvider"
import { shouldWaitForShareAccess } from "@/pages/superMagic/fileAccess/fileAccessContext"

export const useFileUrl = ({
	file_id,
	file_version,
	updated_at,
	download_mode,
	is_download,
	image_process,
	enabled = true,
}: {
	file_id: string
	file_version?: number
	updated_at?: string
	download_mode?: DownloadImageMode
	is_download?: boolean
	image_process?: ImageProcessOptions
	/** 保留旧调用方的下载/预览参数契约，当前接口统一获取临时资源地址。 */
	type?: "preview" | "download"
	enabled?: boolean
}) => {
	const [fileUrl, setFileUrl] = useState<string>("")
	const [isLoading, setIsLoading] = useState(false)
	const [hasError, setHasError] = useState(false)
	const requestIdRef = useRef(0)
	const fileAccess = useFileAccess()
	// Bind the ambient share/session identity at this React boundary; the shared
	// media URL client is called through it so share previews do not fail closed.
	const fileApi = useFileApi()

	useDebounceEffect(
		() => {
			const requestId = ++requestIdRef.current
			if (!enabled || !file_id || shouldWaitForShareAccess(fileAccess)) {
				setFileUrl("")
				setIsLoading(false)
				setHasError(false)
				return
			}
			setIsLoading(true)
			setHasError(false)
			fileApi
				.requestSharedMediaUrls([file_id], {
					fileVersions:
						file_version === undefined ? undefined : { [file_id]: file_version },
					fileUpdatedAtMap:
						updated_at === undefined ? undefined : { [file_id]: updated_at },
					downloadMode: download_mode,
					isDownload: is_download,
					imageProcess: image_process,
				})
				.then((items) => {
					if (requestIdRef.current !== requestId) return
					const url = items?.[0]?.url || ""
					setFileUrl(url)
					setHasError(!url)
				})
				.catch(() => {
					if (requestIdRef.current !== requestId) return
					setFileUrl("")
					setHasError(true)
				})
				.finally(() => {
					if (requestIdRef.current === requestId) setIsLoading(false)
				})
		},
		[
			file_id,
			file_version,
			updated_at,
			download_mode,
			is_download,
			image_process,
			enabled,
			fileAccess,
			fileApi,
		],
		{
			wait: 16,
		},
	)

	useEffect(
		() => () => {
			requestIdRef.current += 1
		},
		[],
	)

	return { fileUrl, isLoading, hasError }
}
