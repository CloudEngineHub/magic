import Konva from "konva"
import type { NameLabelIconResolver } from "./nameLabelTypes"

const LABEL_ICON_SIZE = 16
const ICON_VIEWBOX_SIZE = 24
const ICON_STROKE_WIDTH = 2
const LABEL_ICON_COLOR = "#737373"
const COMPLIANCE_PASS_ICON_COLOR = "#2563eb"

const SHIELD_CHECK_PATHS = [
	"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
	"m9 12 2 2 4-4",
]

const USERS_ROUND_PATHS = [
	"M18 21a8 8 0 0 0-16 0",
	"M10 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10",
	"M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3",
]

function createIcon(paths: string[], color = LABEL_ICON_COLOR): Konva.Group {
	const scale = LABEL_ICON_SIZE / ICON_VIEWBOX_SIZE
	const group = new Konva.Group({
		width: LABEL_ICON_SIZE,
		height: LABEL_ICON_SIZE,
		listening: false,
	})

	for (const data of paths) {
		group.add(
			new Konva.Path({
				data,
				scaleX: scale,
				scaleY: scale,
				stroke: color,
				strokeWidth: ICON_STROKE_WIDTH,
				lineCap: "round",
				lineJoin: "round",
				fillEnabled: false,
				listening: false,
			}),
		)
	}

	return group
}

/** Default CanvasDesign resolver for the shared asset/compliance indicators. */
export const complianceNameLabelIconResolver: NameLabelIconResolver = (context) => {
	if (context.complianceStatus === "PROCESSING") {
		return {
			key: "compliance-processing",
			width: LABEL_ICON_SIZE,
			height: LABEL_ICON_SIZE,
			create: () => createIcon(SHIELD_CHECK_PATHS),
		}
	}

	if (context.complianceStatus === "PASS") {
		return {
			key: "compliance-pass",
			width: LABEL_ICON_SIZE,
			height: LABEL_ICON_SIZE,
			create: () => createIcon(SHIELD_CHECK_PATHS, COMPLIANCE_PASS_ICON_COLOR),
		}
	}

	if (context.isAssetLibrary) {
		return {
			key: "asset-library",
			width: LABEL_ICON_SIZE,
			height: LABEL_ICON_SIZE,
			create: () => createIcon(USERS_ROUND_PATHS),
		}
	}

	return null
}
