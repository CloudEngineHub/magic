import type { ElementRect } from "../types"

function extractRotation(element: HTMLElement): number {
	const styles = window.getComputedStyle(element)
	const transform = styles.transform || styles.webkitTransform

	if (!transform || transform === "none") {
		return 0
	}

	if (transform.startsWith("matrix(")) {
		const values = transform
			.match(/matrix\(([^)]+)\)/)?.[1]
			.split(",")
			.map(parseFloat)

		if (values && values.length >= 6) {
			return Math.atan2(values[1], values[0]) * (180 / Math.PI)
		}
	}

	return 0
}

function extractTransformScale(element: HTMLElement): { scaleX: number; scaleY: number } {
	const styles = window.getComputedStyle(element)
	const transform = styles.transform || styles.webkitTransform

	if (!transform || transform === "none") {
		return { scaleX: 1, scaleY: 1 }
	}

	if (transform.startsWith("matrix3d(")) {
		const values = transform
			.match(/matrix3d\(([^)]+)\)/)?.[1]
			.split(",")
			.map(parseFloat)

		if (values && values.length >= 16) {
			return {
				scaleX: Math.hypot(values[0], values[1], values[2]) || 1,
				scaleY: Math.hypot(values[4], values[5], values[6]) || 1,
			}
		}
	}

	if (transform.startsWith("matrix(")) {
		const values = transform
			.match(/matrix\(([^)]+)\)/)?.[1]
			.split(",")
			.map(parseFloat)

		if (values && values.length >= 6) {
			const [a, b, c, d] = values
			return {
				scaleX: Math.hypot(a, b) || 1,
				scaleY: Math.hypot(c, d) || 1,
			}
		}
	}

	return { scaleX: 1, scaleY: 1 }
}

function getSafeDimension(value: number): number {
	return Number.isFinite(value) && value > 0 ? value : 0
}

export function getElementVisualRect(element: HTMLElement): ElementRect {
	const boundingRect = element.getBoundingClientRect()
	const rotation = extractRotation(element)
	const { scaleX, scaleY } = extractTransformScale(element)
	const ownWidth = getSafeDimension(element.offsetWidth * scaleX)
	const ownHeight = getSafeDimension(element.offsetHeight * scaleY)

	if (ownWidth === 0 || ownHeight === 0) {
		return {
			top: boundingRect.top,
			left: boundingRect.left,
			width: boundingRect.width,
			height: boundingRect.height,
		}
	}

	const radians = (rotation * Math.PI) / 180
	const cos = Math.abs(Math.cos(radians))
	const sin = Math.abs(Math.sin(radians))
	const expectedBoundingWidth = ownWidth * cos + ownHeight * sin
	const expectedBoundingHeight = ownWidth * sin + ownHeight * cos
	const ancestorScaleX =
		expectedBoundingWidth > 0 ? boundingRect.width / expectedBoundingWidth : 1
	const ancestorScaleY =
		expectedBoundingHeight > 0 ? boundingRect.height / expectedBoundingHeight : 1
	const width = ownWidth * ancestorScaleX
	const height = ownHeight * ancestorScaleY
	const centerX = boundingRect.left + boundingRect.width / 2
	const centerY = boundingRect.top + boundingRect.height / 2

	return {
		top: centerY - height / 2,
		left: centerX - width / 2,
		width,
		height,
	}
}

function getRectFromIframeElement(
	selector: string | undefined,
	iframeRef: React.RefObject<HTMLIFrameElement>,
): ElementRect | null {
	if (!selector) return null

	try {
		const iframeDocument =
			iframeRef.current?.contentDocument || iframeRef.current?.contentWindow?.document
		const element = iframeDocument?.querySelector(selector)
		if (!(element instanceof HTMLElement)) return null

		return getElementVisualRect(element)
	} catch {
		return null
	}
}

/**
 * Transform iframe coordinates to viewport coordinates
 * For fixed positioning, we use viewport coordinates (relative to browser window)
 */
export function transformRect(
	rect: ElementRect,
	iframeRef: React.RefObject<HTMLIFrameElement>,
	isPptRender: boolean,
	scaleRatio: number,
	selector?: string,
): ElementRect {
	if (!iframeRef.current) return rect

	// Get iframe position relative to viewport (fixed positioning reference)
	const iframeRect = iframeRef.current.getBoundingClientRect()
	const iframeElementRect = getRectFromIframeElement(selector, iframeRef)
	const sourceRect = iframeElementRect ?? rect

	// For PPT mode, consider scale transforms
	if (isPptRender) {
		return {
			top: iframeRect.top + sourceRect.top * scaleRatio,
			left: iframeRect.left + sourceRect.left * scaleRatio,
			width: sourceRect.width * scaleRatio,
			height: sourceRect.height * scaleRatio,
		}
	}

	// For normal mode, just offset by iframe position in viewport
	return {
		top: iframeRect.top + sourceRect.top,
		left: iframeRect.left + sourceRect.left,
		width: sourceRect.width,
		height: sourceRect.height,
	}
}

/**
 * Calculate transform style for selected element (to match rotation)
 * With optimistic updates, infoRotation is kept up-to-date in real-time during rotation
 */
export function getSelectionBoxTransform(
	infoRotation: number,
	isMultiSelect: boolean,
	liveRotation: number,
	displayRotation: number,
): string | undefined {
	void isMultiSelect
	void liveRotation
	void displayRotation

	// Use the element's current rotation value (already optimistically updated)
	if (infoRotation === 0) return undefined

	// Apply rotation around the center of the bounding box
	return `rotate(${infoRotation}deg)`
}

/**
 * Normalize angle to 0-360 range for display
 */
export function normalizeAngle(angle: number): number {
	return ((angle % 360) + 360) % 360
}
