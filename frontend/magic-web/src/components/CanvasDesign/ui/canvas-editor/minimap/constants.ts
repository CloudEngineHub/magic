/** 小地图面板的设计尺寸；窄容器下会等比例缩小。 */
export const MINIMAP_PANEL_SIZE = {
	width: 200,
	height: 150,
} as const

export const MINIMAP_RENDER_CONFIG = {
	padding: 12,
	minimumElementSize: 2,
	containerOpacity: 0.14,
	elementColorWeight: 65,
	viewportOpacity: 0.55,
	viewportLineWidth: 1,
	maximumDevicePixelRatio: 2,
} as const
