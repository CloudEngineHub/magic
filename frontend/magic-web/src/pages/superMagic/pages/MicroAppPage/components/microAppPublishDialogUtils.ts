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
	fullScreen: boolean
}

export type MicroAppPublishValidationError =
	"projectNameRequired" | "projectNameTooLong" | "passwordInvalid"

export function normalizeMicroAppPublishShareType(
	shareType: MicroAppPublishShareType,
	isPersonalOrganization = false,
): MicroAppPublishShareType {
	return isPersonalOrganization && shareType === ShareType.Organization
		? ShareType.Public
		: shareType
}

export function createDefaultMicroAppPublishFormState(
	appName = "",
	isPersonalOrganization = false,
): MicroAppPublishFormState {
	return {
		appName,
		shareType: normalizeMicroAppPublishShareType(
			ShareType.Organization,
			isPersonalOrganization,
		),
		shareRange: "all",
		targets: [],
		password: generateSharePassword(),
		coverFileKey: undefined,
		coverUrl: "",
		fullScreen: false,
	}
}

export function buildMicroAppPublishPayload(
	formState: MicroAppPublishFormState,
	isPersonalOrganization = false,
): PublishMicroAppProjectBody {
	const shareType = normalizeMicroAppPublishShareType(formState.shareType, isPersonalOrganization)
	const payload: PublishMicroAppProjectBody = {
		app_name: formState.appName.trim(),
		share_type: shareType,
	}

	if (formState.coverFileKey !== undefined) {
		payload.cover_file_key = formState.coverFileKey
	}
	payload.extra = { pure_mode: formState.fullScreen }

	if (shareType === ShareType.Organization) {
		payload.share_range = formState.shareRange
		if (formState.shareRange === "designated") {
			payload.target_ids = formState.targets.map((target) => ({
				target_type: target.target_type,
				target_id: target.target_id,
			}))
		}
	}

	if (shareType === ShareType.PasswordProtected) {
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
	isPersonalOrganization = false,
): MicroAppPublishFormState {
	return {
		appName: item?.app_name || appName || "",
		shareType: normalizeMicroAppPublishShareType(
			item?.share_type || ShareType.Organization,
			isPersonalOrganization,
		),
		shareRange: item?.share_range || "all",
		targets: item?.target_ids || [],
		// 只有后端明确标记为已发布时才保留空密码，未发布的密码分享需要可直接编辑的初始密码。
		password:
			item?.password || (item?.publish_status === "published" ? "" : generateSharePassword()),
		coverFileKey: item?.cover_file_key ?? undefined,
		coverUrl: item?.cover_url || "",
		fullScreen: item?.extra?.pure_mode === true,
	}
}

function normalizePublishTargets(targets: MicroAppPublishTarget[]): string[] {
	return targets
		.map((target) => `${target.target_type}:${target.target_id}`)
		.sort((left, right) => left.localeCompare(right))
}

export function hasMicroAppPublishFormChanged(
	formState: MicroAppPublishFormState,
	publishedFormState: MicroAppPublishFormState | null,
): boolean {
	if (!publishedFormState) return false
	if (formState.appName.trim() !== publishedFormState.appName.trim()) return true
	if (formState.shareType !== publishedFormState.shareType) return true
	if ((formState.coverFileKey ?? null) !== (publishedFormState.coverFileKey ?? null)) return true
	if (formState.coverUrl.trim() !== publishedFormState.coverUrl.trim()) return true
	if (formState.fullScreen !== publishedFormState.fullScreen) return true

	if (formState.shareType === ShareType.Organization) {
		if (formState.shareRange !== publishedFormState.shareRange) return true
		if (formState.shareRange === "designated") {
			const currentTargets = normalizePublishTargets(formState.targets)
			const publishedTargets = normalizePublishTargets(publishedFormState.targets)
			if (currentTargets.join("|") !== publishedTargets.join("|")) return true
		}
	}

	if (formState.shareType === ShareType.PasswordProtected) {
		return formState.password.trim() !== publishedFormState.password.trim()
	}

	return false
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

export function buildMicroAppCopyUrl(accessUrl: string, password?: string): string {
	const normalizedPassword = password?.trim()
	if (!normalizedPassword) return accessUrl

	const url = new URL(accessUrl, window.location.origin)
	url.searchParams.set("password", normalizedPassword)
	return url.toString()
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
