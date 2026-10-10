import { useTranslation } from "react-i18next"
import type { InboxMessage } from "./types"

export function useInboxAuthResultCopy(message: InboxMessage) {
	const { t } = useTranslation("sidebar")
	if (message.business_result === "expired") return t("inbox.auth.expiredResult")
	if (message.auth_status === "accepted") return t("inbox.auth.acceptedResult")
	if (message.auth_status === "rejected") return t("inbox.auth.rejectedResult")
	return null
}
