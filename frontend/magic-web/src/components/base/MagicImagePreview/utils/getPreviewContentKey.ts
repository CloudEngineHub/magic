import { Children, isValidElement } from "react"
import type { ReactNode } from "react"

type ElementProps = {
	src?: unknown
	children?: ReactNode
	dangerouslySetInnerHTML?: { __html?: unknown }
}

const hashString = (value: string) => {
	let hash = 2166136261
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index)
		hash = Math.imul(hash, 16777619)
	}
	return `${value.length}:${hash >>> 0}`
}

/**
 * Returns an identity for the actual image content, independent of the
 * ReactElement object identity. Parents often recreate an equivalent `<img>`
 * while measuring it; that must not reset a zoom chosen by the user.
 */
const getPreviewContentKey = (children: ReactNode): string => {
	const parts: string[] = []

	const visit = (node: ReactNode) => {
		Children.forEach(node, (child) => {
			if (!isValidElement(child)) return

			const props = child.props as ElementProps
			if (typeof props.src === "string") {
				parts.push(`src:${props.src}`)
			}

			const inlineHtml = props.dangerouslySetInnerHTML?.__html
			if (typeof inlineHtml === "string") {
				parts.push(`html:${hashString(inlineHtml)}`)
			}

			if (props.children) visit(props.children)
		})
	}

	visit(children)
	return parts.join("\u0000")
}

export default getPreviewContentKey
