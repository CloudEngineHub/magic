import type { AssetComplianceResponse } from "@/apis"
import type {
	CanvasAssetComplianceState,
	CanvasAssetComplianceStatus,
} from "../../../public/magic-types"
import { assetDetailStore } from "./AssetDetailStore"

export interface CanvasAssetComplianceStatusSource {
	assetCompliancePollingManager?: {
		getState: (assetId: string) => CanvasAssetComplianceState | undefined
	}
	assetResourceManager?: {
		getCachedResource: (
			assetId: string,
		) => { complianceStatus?: CanvasAssetComplianceStatus | null } | undefined
	}
}

export interface MediaComplianceContentLike {
	assetId?: string
	complianceStatus?: CanvasAssetComplianceStatus | null
}

export function getMediaAssetId(
	content: MediaComplianceContentLike | undefined,
): string | undefined {
	const assetId = content?.assetId?.trim()
	return assetId || undefined
}

/**
 * Runtime status is authoritative for asset-backed media because the Canvas
 * DSL deliberately does not persist compliance state for existing assets.
 */
export function resolveMediaComplianceStatus(
	canvas: CanvasAssetComplianceStatusSource,
	content: MediaComplianceContentLike | undefined,
): CanvasAssetComplianceStatus | undefined {
	const assetId = getMediaAssetId(content)
	if (!assetId) return content?.complianceStatus ?? undefined

	const pollingStatus = canvas.assetCompliancePollingManager?.getState(assetId)?.status
	if (pollingStatus) return pollingStatus

	const cachedStatus = canvas.assetResourceManager?.getCachedResource(assetId)?.complianceStatus
	if (cachedStatus) return cachedStatus

	const detailStatus = assetDetailStore.getCached(assetId)?.compliance_status
	if (detailStatus !== undefined && detailStatus !== null) {
		return normalizeAssetComplianceStatus(detailStatus)
	}

	return content?.complianceStatus ?? undefined
}

export function normalizeAssetComplianceStatus(value: unknown): CanvasAssetComplianceStatus {
	if (value === "PROCESSING") return "PROCESSING"
	if (value === "PASS" || value === "PASSED") return "PASS"
	if (value === "FAILED") return "FAILED"
	return "UNVERIFIED"
}

export function toCanvasAssetComplianceState(
	response: AssetComplianceResponse,
): CanvasAssetComplianceState {
	return {
		assetId: response.asset_id,
		status: normalizeAssetComplianceStatus(response.compliance_status),
		failedReason: response.compliance_failed_reason,
	}
}
