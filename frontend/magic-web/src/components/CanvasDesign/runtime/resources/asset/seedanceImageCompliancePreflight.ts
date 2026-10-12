import type { AssetItem } from "@/apis"
import type { Canvas } from "../../core/Canvas"
import { getContentById, getDownstreamContent } from "../../document/elementContent"
import {
	ElementTypeEnum,
	type ImageElement,
	type ImageElementContent,
	type LayerElement,
} from "../../document/types"
import { resolveConnectedMediaCandidates } from "../../interaction/connection/connectedMediaInputs"
import type {
	CanvasAssetComplianceStatus,
	CanvasDesignMethods,
	GenerateVideoRequest,
	GenerateVideoInputs,
} from "../../../public/magic-types"
import {
	areCanvasResourceReferencesSame,
	parseAssetResourcePath,
} from "../../shared/path/canvasResourcePath"
import { assetDetailStore } from "./AssetDetailStore"
import {
	normalizeAssetComplianceStatus,
	resolveMediaComplianceStatus,
} from "./assetComplianceState"

/**
 * Network calls made by the preflight must not hold a generation submission
 * forever.  This is only a guard for status/detail/start requests; the user
 * agreement dialog is intentionally not subject to this timeout.
 */
export const DEFAULT_SEEDANCE_COMPLIANCE_PREFLIGHT_TIMEOUT_MS = 5000

export type SeedanceImageCompliancePreflightResult =
	| { proceed: true }
	| {
			proceed: false
			reason: "agreement-cancelled" | "agreement-error" | "source-changed"
	  }

export interface SeedanceImageCompliancePreflightOptions {
	canvas: Canvas
	sourceVideoElementId: string
	request: GenerateVideoRequest
	modelName?: string
	timeoutMs?: number
	/** Optional editor-state check for inputs that live outside the persisted video element. */
	isRequestStillCurrent?: () => boolean
}

interface ImageAssetReference {
	uri: string
	assetId: string
	complianceStatus?: CanvasAssetComplianceStatus
}

interface PreparedLibraryAsset {
	assetId: string
	fileKey: string
	name?: string
}

interface ComplianceResolution {
	status: CanvasAssetComplianceStatus
	detail?: AssetItem
}

interface SeedanceSourceSnapshot {
	elementId: string
	fingerprint: string
}

const pendingAgreementByCanvas = new WeakMap<Canvas, Promise<boolean>>()

/** Match the Seedance family while excluding names such as Seedream. */
export function isSeedanceModelName(modelName?: string): boolean {
	if (typeof modelName !== "string") return false
	const normalized = modelName.trim().toLowerCase()
	if (!normalized) return false

	// A version may be attached directly (seedance2.5) or separated by any
	// punctuation/whitespace (seedance-2-5, seedance_v2).  Requiring a token
	// boundary prevents accidental matches such as "notseedance" or "seedream".
	return /(?:^|[^a-z0-9])seedance(?:v?(?=[0-9])|(?=$|[^a-z0-9]))/i.test(normalized)
}

/** Extract only image-bearing request inputs; prompt mentions are not inputs. */
export function collectSeedanceImageUris(
	request: Pick<GenerateVideoRequest, "inputs" | "generation_type" | "composition">,
): string[] {
	if (
		request.generation_type?.trim().toLowerCase() === "canvas_composition" ||
		request.composition
	) {
		return []
	}

	const inputs = request.inputs as GenerateVideoInputs | undefined
	if (!inputs) return []

	const uris: string[] = []
	const appendUri = (value: unknown) => {
		const uri =
			typeof value === "string"
				? value
				: value && typeof value === "object" && "uri" in value
					? (value as { uri?: unknown }).uri
					: undefined
		if (typeof uri !== "string" || !uri.trim()) return
		uris.push(uri.trim())
	}

	if (Array.isArray(inputs.frames)) inputs.frames.forEach(appendUri)
	if (Array.isArray(inputs.reference_images)) inputs.reference_images.forEach(appendUri)
	return uris
}

function addImageAssetReference(
	byAssetId: Map<string, ImageAssetReference>,
	uri: string,
	assetId: string,
	complianceStatus?: CanvasAssetComplianceStatus,
): void {
	const normalizedAssetId = assetId.trim()
	if (!normalizedAssetId) return

	const existing = byAssetId.get(normalizedAssetId)
	if (existing) {
		if (
			complianceStatus &&
			(!existing.complianceStatus ||
				(existing.complianceStatus === "UNVERIFIED" && complianceStatus !== "UNVERIFIED"))
		) {
			existing.complianceStatus = complianceStatus
		}
		return
	}

	byAssetId.set(normalizedAssetId, {
		uri,
		assetId: normalizedAssetId,
		...(complianceStatus ? { complianceStatus } : {}),
	})
}

function getImageContent(
	element: LayerElement,
	contentId?: string,
): ImageElementContent | undefined {
	if (element.type !== ElementTypeEnum.Image) return undefined
	const imageElement = element as ImageElement
	return contentId
		? getContentById<ImageElementContent>(imageElement, contentId)
		: getDownstreamContent<ImageElementContent>(imageElement)
}

/**
 * Resolve IDs from the actual request URI and from connected source images.
 * File names, URLs and workspace paths are deliberately never treated as IDs.
 */
export function resolveSeedanceImageAssetReferences(
	canvas: Canvas,
	sourceVideoElementId: string,
	uris: readonly string[],
): ImageAssetReference[] {
	const byAssetId = new Map<string, ImageAssetReference>()
	const unresolvedUris = new Set<string>()

	for (const uri of uris) {
		const directAssetId = parseAssetResourcePath(uri)
		if (directAssetId) {
			addImageAssetReference(byAssetId, uri, directAssetId)
			continue
		}
		unresolvedUris.add(uri)
	}

	if (unresolvedUris.size === 0) return Array.from(byAssetId.values())

	let connectedCandidates: ReturnType<typeof resolveConnectedMediaCandidates> = []
	try {
		connectedCandidates = resolveConnectedMediaCandidates(canvas, sourceVideoElementId)
	} catch {
		// A stale/partially loaded connection graph must not block video submit.
		return Array.from(byAssetId.values())
	}

	const resolveResourceReference =
		canvas.magicConfigManager.config?.methods?.resolveResourceReference
	for (const uri of unresolvedUris) {
		for (const candidate of connectedCandidates) {
			if (candidate.kind !== "image" || !candidate.path) continue
			if (!areCanvasResourceReferencesSame(uri, candidate.path, resolveResourceReference)) {
				continue
			}

			const sourceElement =
				canvas.elementManager.getElementData(candidate.sourceElementId) ?? candidate.element
			if (!sourceElement) continue
			const content = getImageContent(sourceElement, candidate.sourceContentId)
			const assetId =
				typeof content?.assetId === "string" ? content.assetId.trim() : undefined
			if (!assetId) continue
			addImageAssetReference(byAssetId, uri, assetId, content?.complianceStatus)
		}
	}

	return Array.from(byAssetId.values())
}

/**
 * Capture the source video's durable identity before any agreement/network
 * wait.  The fingerprint intentionally includes content IDs and media
 * resource identities, but not transient generation status fields.
 */
function captureSeedanceSourceSnapshot(
	canvas: Canvas,
	sourceVideoElementId: string,
): SeedanceSourceSnapshot | undefined {
	const element = canvas.elementManager.getElementData(sourceVideoElementId)
	if (!element || element.type !== ElementTypeEnum.Video) return undefined

	const fingerprint = JSON.stringify({
		type: element.type,
		activeContentId: element.activeContentId,
		mainContentId: element.mainContentId,
		contents: (Array.isArray(element.contents) ? element.contents : []).map((content) => ({
			contentId: content.contentId,
			src: content.src ?? null,
			assetId: content.assetId ?? null,
		})),
	})
	return { elementId: sourceVideoElementId, fingerprint }
}

function isSeedanceSourceSnapshotCurrent(
	canvas: Canvas,
	snapshot: SeedanceSourceSnapshot | undefined,
): boolean {
	if (!snapshot) return true
	try {
		const current = captureSeedanceSourceSnapshot(canvas, snapshot.elementId)
		return current?.fingerprint === snapshot.fingerprint
	} catch {
		return true
	}
}

/**
 * Compare the request URI-to-asset mapping after an asynchronous wait. A set
 * comparison alone is insufficient when two connected images are swapped, so
 * each URI is matched using the same namespace-aware identity resolver used by
 * the initial lookup.
 */
function haveSameSeedanceImageReferences(
	canvas: Canvas,
	requestUris: readonly string[],
	initial: readonly ImageAssetReference[],
	current: readonly ImageAssetReference[],
): boolean {
	const resolveResourceReference =
		canvas.magicConfigManager.config?.methods?.resolveResourceReference
	const findAssetId = (references: readonly ImageAssetReference[], uri: string) =>
		references.find((reference) =>
			areCanvasResourceReferencesSame(uri, reference.uri, resolveResourceReference),
		)?.assetId

	return requestUris.every((uri) => findAssetId(initial, uri) === findAssetId(current, uri))
}

function getPreflightTimeout(timeoutMs?: number): number {
	return Number.isFinite(timeoutMs) && (timeoutMs as number) > 0
		? (timeoutMs as number)
		: DEFAULT_SEEDANCE_COMPLIANCE_PREFLIGHT_TIMEOUT_MS
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		let settled = false
		const timer = setTimeout(() => {
			if (settled) return
			settled = true
			reject(new Error("Seedance compliance preflight timed out"))
		}, timeoutMs)

		Promise.resolve(promise).then(
			(value) => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				resolve(value)
			},
			(error) => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				reject(error)
			},
		)
	})
}

async function ensureAssetAgreementOnce(
	canvas: Canvas,
	ensureAssetAgreementSigned: NonNullable<CanvasDesignMethods["ensureAssetAgreementSigned"]>,
): Promise<boolean> {
	const pending = pendingAgreementByCanvas.get(canvas)
	if (pending) return pending

	const next = Promise.resolve().then(() => ensureAssetAgreementSigned())
	pendingAgreementByCanvas.set(canvas, next)
	try {
		return await next
	} finally {
		if (pendingAgreementByCanvas.get(canvas) === next) {
			pendingAgreementByCanvas.delete(canvas)
		}
	}
}

function ensureProcessingWatcher(canvas: Canvas, assetId: string): void {
	try {
		canvas.assetComplianceTaskManager.watchLibraryComplianceChecks([assetId])
	} catch {
		// Watcher recovery is best effort; the existing status remains authoritative.
	}
}

async function resolveAssetCompliance(
	canvas: Canvas,
	asset: ImageAssetReference,
	timeoutMs: number,
): Promise<ComplianceResolution | null> {
	const methods = canvas.magicConfigManager.config?.methods
	const localStatus = resolveMediaComplianceStatus(canvas, {
		assetId: asset.assetId,
		complianceStatus: asset.complianceStatus,
	})

	if (localStatus && localStatus !== "UNVERIFIED") {
		if (localStatus === "PROCESSING") ensureProcessingWatcher(canvas, asset.assetId)
		return { status: localStatus }
	}

	let status: CanvasAssetComplianceStatus | undefined = localStatus
	if (methods?.getAssetComplianceStatus) {
		try {
			const remoteState = await withTimeout(
				methods.getAssetComplianceStatus(asset.assetId),
				timeoutMs,
			)
			if (!remoteState) return null
			status = normalizeAssetComplianceStatus(remoteState?.status)
		} catch {
			// An unknown remote state must not cause a duplicate compliance POST.
			return null
		}
	}

	if (status && status !== "UNVERIFIED") {
		if (status === "PROCESSING") ensureProcessingWatcher(canvas, asset.assetId)
		return { status }
	}

	try {
		const cachedDetail = assetDetailStore.getCached(asset.assetId)
		const detail = cachedDetail?.file_key?.trim()
			? cachedDetail
			: await withTimeout(assetDetailStore.getWithFileKey(asset.assetId), timeoutMs)
		const detailStatus = normalizeAssetComplianceStatus(detail.compliance_status)
		if (detailStatus !== "UNVERIFIED") {
			if (detailStatus === "PROCESSING") ensureProcessingWatcher(canvas, asset.assetId)
			return { status: detailStatus, detail }
		}
		return { status: "UNVERIFIED", detail }
	} catch {
		// Without a reliable file_key/detail, do not guess a source path.
		return null
	}
}

async function prepareUnverifiedAsset(
	canvas: Canvas,
	asset: ImageAssetReference,
	timeoutMs: number,
): Promise<PreparedLibraryAsset | null> {
	const resolved = await resolveAssetCompliance(canvas, asset, timeoutMs)
	if (!resolved || resolved.status !== "UNVERIFIED") return null

	const fileKey = resolved.detail?.file_key?.trim()
	if (!fileKey) return null
	return {
		assetId: asset.assetId,
		fileKey,
		name: resolved.detail?.name?.trim() || undefined,
	}
}

/**
 * Run the Seedance-only image compliance preflight immediately before submit.
 * Technical status/detail/start failures intentionally fail open; only an
 * explicit agreement refusal/error prevents the video request from being sent.
 */
export async function runSeedanceImageCompliancePreflight(
	options: SeedanceImageCompliancePreflightOptions,
): Promise<SeedanceImageCompliancePreflightResult> {
	const { canvas, request, sourceVideoElementId, modelName } = options
	if (!canvas.isSeedanceComplianceEnabled()) return { proceed: true }
	if (!isSeedanceModelName(modelName)) return { proceed: true }

	const uris = collectSeedanceImageUris(request)
	if (uris.length === 0) return { proceed: true }

	let sourceSnapshot: SeedanceSourceSnapshot | undefined
	try {
		sourceSnapshot = captureSeedanceSourceSnapshot(canvas, sourceVideoElementId)
	} catch {
		// A host that is still mounting the element manager cannot provide a
		// snapshot; preserve the existing fail-open submit behavior.
		sourceSnapshot = undefined
	}
	let assets: ImageAssetReference[]
	try {
		assets = resolveSeedanceImageAssetReferences(canvas, sourceVideoElementId, uris)
	} catch {
		// Resource graph lookup is best effort. Do not make a malformed/stale
		// Canvas snapshot prevent the original video request from being sent.
		return { proceed: true }
	}
	if (assets.length === 0) return { proceed: true }

	const sourceIsStillCurrent = () => {
		if (options.isRequestStillCurrent) {
			try {
				if (!options.isRequestStillCurrent()) return false
			} catch {
				// A transient editor snapshot failure is technical uncertainty, not
				// evidence that the user changed the source; continue with the Canvas
				// element/resource checks below.
			}
		}
		if (!isSeedanceSourceSnapshotCurrent(canvas, sourceSnapshot)) return false
		try {
			const currentAssets = resolveSeedanceImageAssetReferences(
				canvas,
				sourceVideoElementId,
				uris,
			)
			return haveSameSeedanceImageReferences(canvas, uris, assets, currentAssets)
		} catch {
			// A transient connection snapshot failure is a technical lookup issue;
			// fail open rather than cancelling a request without positive evidence of
			// a source change.
			return true
		}
	}

	const methods = canvas.magicConfigManager.config?.methods
	const startExistingAssetCompliance = methods?.startExistingAssetCompliance
	if (!startExistingAssetCompliance) return { proceed: true }

	const timeoutMs = getPreflightTimeout(options.timeoutMs)
	const preparedAssets = (
		await Promise.all(
			assets.map(async (asset) => {
				try {
					return await prepareUnverifiedAsset(canvas, asset, timeoutMs)
				} catch {
					return null
				}
			}),
		)
	).filter((asset): asset is PreparedLibraryAsset => Boolean(asset))
	if (!sourceIsStillCurrent()) return { proceed: false, reason: "source-changed" }
	if (preparedAssets.length === 0) return { proceed: true }

	const ensureAssetAgreementSigned = methods.ensureAssetAgreementSigned
	if (!ensureAssetAgreementSigned) {
		// Starting an unverified asset without the agreement gate would treat an
		// unavailable protocol as implicit consent, so this is the one capability
		// failure that must cancel the current video submission.
		return { proceed: false, reason: "agreement-error" }
	}

	let agreementSigned: boolean
	try {
		agreementSigned = await ensureAssetAgreementOnce(canvas, ensureAssetAgreementSigned)
	} catch {
		return { proceed: false, reason: "agreement-error" }
	}
	if (!agreementSigned) return { proceed: false, reason: "agreement-cancelled" }
	if (!sourceIsStillCurrent()) return { proceed: false, reason: "source-changed" }

	const startPromises = preparedAssets.map((asset) =>
		withTimeout(
			Promise.resolve().then(() =>
				canvas.assetComplianceTaskManager.startLibraryAssetCompliance({
					assetId: asset.assetId,
					fileKey: asset.fileKey,
					name: asset.name,
					startExistingAssetCompliance,
				}),
			),
			timeoutMs,
		),
	)
	await Promise.allSettled(startPromises)
	if (!sourceIsStillCurrent()) return { proceed: false, reason: "source-changed" }
	return { proceed: true }
}
