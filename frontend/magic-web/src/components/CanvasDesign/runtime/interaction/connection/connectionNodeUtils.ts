import type Konva from "konva"

export const CONNECTION_GROUP_NAME = "canvas-connection"
export const CONNECTION_VISUAL_PATH_NAME = "canvas-connection-path"
export const CONNECTION_HIT_PATH_NAME = "canvas-connection-hit-path"

function hasConnectionId(value: unknown): value is { connectionId: string } {
	return (
		!!value &&
		typeof value === "object" &&
		typeof (value as { connectionId?: unknown }).connectionId === "string"
	)
}

export function resolveConnectionIdFromKonvaNode(node: Konva.Node): string | null {
	let current: Konva.Node | null = node
	while (current) {
		const getAttr: ((name: string) => unknown) | undefined = (
			current as { getAttr?: (name: string) => unknown }
		).getAttr
		const connectionId = getAttr?.call(current, "connectionId")
		if (typeof connectionId === "string" && connectionId.length > 0) {
			return connectionId
		}

		const connectionData = getAttr?.call(current, "connectionData")
		if (hasConnectionId(connectionData)) {
			return connectionData.connectionId
		}

		const getParent: (() => Konva.Node | null) | undefined = (
			current as { getParent?: () => Konva.Node | null }
		).getParent
		current = getParent?.call(current) ?? null
	}

	return null
}

export function isConnectionNode(node: Konva.Node): boolean {
	return resolveConnectionIdFromKonvaNode(node) !== null
}
