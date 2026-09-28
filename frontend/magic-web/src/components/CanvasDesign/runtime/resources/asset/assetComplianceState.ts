import type { AssetComplianceResponse } from "@/apis"
import type {
	CanvasAssetComplianceState,
	CanvasAssetComplianceStatus,
} from "../../../public/magic-types"

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
