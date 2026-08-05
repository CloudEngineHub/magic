/**
 * useIframeDatabase
 *
 * 管理 IframeDatabaseService 的生命周期，将其挂载到 IsolatedHTMLRenderer 的
 * handleMessage 分发链中。
 */

import { useRef, useEffect } from "react"
import { useMemoizedFn } from "ahooks"
import { IframeDatabaseService, type IframeDatabaseConfig } from "../services/IframeDatabaseService"

export interface UseIframeDatabaseOptions {
	/** iframe ref，用于构造 postToIframe */
	iframeRef: React.RefObject<HTMLIFrameElement>
	/** 当前选中的项目 ID */
	projectId: string | undefined
}

export interface UseIframeDatabaseReturn {
	/** 分发 MAGIC_DB_* 消息，返回 true 表示已处理 */
	handleDatabaseMessage: (type: string, payload: unknown) => Promise<boolean>
}

export function useIframeDatabase(options: UseIframeDatabaseOptions): UseIframeDatabaseReturn {
	const { iframeRef, projectId } = options

	const serviceRef = useRef<IframeDatabaseService | null>(null)
	const projectIdRef = useRef(projectId)
	projectIdRef.current = projectId

	const postToIframe = useMemoizedFn((message: object) => {
		iframeRef.current?.contentWindow?.postMessage(message, "*")
	})

	const getProjectId = useMemoizedFn(() => projectIdRef.current)

	useEffect(() => {
		const cfg: IframeDatabaseConfig = {
			postToIframe,
			getProjectId,
		}

		serviceRef.current = new IframeDatabaseService(cfg)

		return () => {
			serviceRef.current?.destroy()
			serviceRef.current = null
		}
	}, [postToIframe, getProjectId])

	const handleDatabaseMessage = useMemoizedFn(
		async (type: string, payload: unknown): Promise<boolean> => {
			if (!serviceRef.current) return false
			return serviceRef.current.handleMessage(type, payload)
		},
	)

	return { handleDatabaseMessage }
}
