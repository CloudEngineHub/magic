import { useCallback, useEffect, useMemo, useState } from "react"
import { platformKey } from "@/utils/storage"

const SAFETY_NOTICE_CONFIRMATION_KEY_PREFIX = platformKey(
	"micro-app/share/safety-notice-confirmation/v1/",
)

function resolveSafetyNoticeConfirmationKey(appId: string) {
	return `${SAFETY_NOTICE_CONFIRMATION_KEY_PREFIX}${appId}`
}

function hasRememberedSafetyNoticeConfirmation(appId: string) {
	if (!appId || typeof window === "undefined") return false

	try {
		return window.localStorage.getItem(resolveSafetyNoticeConfirmationKey(appId)) === "1"
	} catch {
		return false
	}
}

function rememberSafetyNoticeConfirmation(appId: string) {
	if (!appId || typeof window === "undefined") return

	try {
		window.localStorage.setItem(resolveSafetyNoticeConfirmationKey(appId), "1")
	} catch {
		// 浏览器禁用或限制本地存储时，仍允许用户完成本次访问确认。
	}
}

export default function useMicroAppSafetyNoticeConfirmation(appId: string) {
	// 内存确认和持久化确认都按 appId 隔离，切换分享路由时不能复用其他应用状态。
	const [confirmedAppId, setConfirmedAppId] = useState<string | null>(null)
	const hasRememberedConfirmation = useMemo(
		() => hasRememberedSafetyNoticeConfirmation(appId),
		[appId],
	)

	useEffect(() => {
		setConfirmedAppId(null)
	}, [appId])

	const confirmSafetyNotice = useCallback(
		(doNotRemind: boolean) => {
			if (doNotRemind) {
				rememberSafetyNoticeConfirmation(appId)
			}
			setConfirmedAppId(appId)
		},
		[appId],
	)

	return {
		hasConfirmedSafetyNotice: confirmedAppId === appId || hasRememberedConfirmation,
		confirmSafetyNotice,
	}
}
