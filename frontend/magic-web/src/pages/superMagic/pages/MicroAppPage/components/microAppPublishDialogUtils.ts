import type {
	MicroAppPublishShareRange,
	MicroAppPublishShareType,
	MicroAppPublishTarget,
	PublishedMicroAppProjectItem,
	PublishMicroAppProjectBody,
} from "@/apis/modules/superMagic"
import { ShareType } from "@/pages/superMagic/components/Share/types"
import { generateSharePassword } from "@/pages/superMagic/components/Share/utils"

export interface MicroAppPublishFormState {
	appName: string
	shareType: MicroAppPublishShareType
	shareRange: MicroAppPublishShareRange
	targets: MicroAppPublishTarget[]
	password: string
	coverFileKey?: string | null
	coverUrl: string
}

export type MicroAppPublishValidationError =
	"projectNameRequired" | "projectNameTooLong" | "passwordInvalid"

export function createDefaultMicroAppPublishFormState(appName = ""): MicroAppPublishFormState {
	return {
		appName,
		shareType: ShareType.Organization,
		shareRange: "all",
		targets: [],
		password: generateSharePassword(),
		coverFileKey: undefined,
		coverUrl: "",
	}
}

export function buildMicroAppPublishPayload(
	formState: MicroAppPublishFormState,
): PublishMicroAppProjectBody {
	const payload: PublishMicroAppProjectBody = {
		app_name: formState.appName.trim(),
		share_type: formState.shareType,
	}

	if (formState.coverFileKey !== undefined) {
		payload.cover_file_key = formState.coverFileKey
	}

	if (formState.shareType === ShareType.Organization) {
		payload.share_range = formState.shareRange
		if (formState.shareRange === "designated") {
			payload.target_ids = formState.targets.map((target) => ({
				target_type: target.target_type,
				target_id: target.target_id,
			}))
		}
	}

	if (formState.shareType === ShareType.PasswordProtected) {
		payload.password = formState.password.trim()
	}

	return payload
}

export function getMicroAppPublishValidationError(
	formState: MicroAppPublishFormState,
): MicroAppPublishValidationError | null {
	const appName = formState.appName.trim()
	if (!appName) return "projectNameRequired"
	if (appName.length > 100) return "projectNameTooLong"

	if (formState.shareType === ShareType.PasswordProtected) {
		const passwordLength = formState.password.trim().length
		if (passwordLength < 4 || passwordLength > 32) return "passwordInvalid"
	}

	return null
}

export function getPublishedItemFromResponse(
	response: PublishedMicroAppProjectItem | { data?: PublishedMicroAppProjectItem },
): PublishedMicroAppProjectItem {
	if ("data" in response && response.data) return response.data
	return response as PublishedMicroAppProjectItem
}

export function createFormStateFromPublishedItem(
	item: PublishedMicroAppProjectItem | null,
	appName?: string,
): MicroAppPublishFormState {
	return {
		appName: item?.app_name || appName || "",
		shareType: item?.share_type || ShareType.Organization,
		shareRange: item?.share_range || "all",
		targets: item?.target_ids || [],
		password: item?.password || generateSharePassword(),
		coverFileKey: item?.cover_file_key ?? undefined,
		coverUrl: item?.cover_url || "",
	}
}

export function formatMicroAppPublishedAt(value?: string): string {
	if (!value) return ""
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	return date.toLocaleString()
}

export function buildMicroAppAccessUrl(item: PublishedMicroAppProjectItem | null): string {
	if (!item) return ""
	if (item.access_url) return item.access_url
	if (item.app_id) return `${window.location.origin}/micro-app/${item.app_id}`
	return ""
}

export function buildMicroAppShareText({
	accessUrl,
	shareTitle,
	accessHint,
	passwordText,
}: {
	accessUrl: string
	shareTitle: string
	accessHint: string
	passwordText?: string
}): string {
	const lines = [shareTitle, "", accessHint, accessUrl]
	if (passwordText) lines.push("", passwordText)
	return lines.join("\n")
}
