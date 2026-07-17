import { createStyles } from "antd-style"
import type { IMarkmapOptions } from "markmap-common"
import type { Markmap } from "markmap-view"
import type { HTMLAttributes, Ref, RefObject } from "react"
import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from "react"
import { ensureMarkmapInitialized, transformer } from "../../markmap"

const useStyles = createStyles(({ css, token }) => ({
	svg: css`
		width: 100%;
		height: 100%;
		min-height: 280px;
		background: ${token.colorBgContainer};
		background-image: radial-gradient(circle, rgba(0, 0, 0, 0.1), 1px, transparent 1px);
		background-size: 20px 20px;
		user-select: none;
		white-space: normal;
		--markmap-text-color: iniherit !important;
	`,
}))

export type MarkmapBaseProps = HTMLAttributes<SVGSVGElement> & {
	options: Partial<IMarkmapOptions>
	data?: string
}

export type MarkmapBaseRef = {
	instance: RefObject<Markmap | null>
	dom: RefObject<SVGSVGElement | null>
	/** Sync SVG pixel dimensions to the current layout box, then refit the viewport. */
	resize: () => void
}

/** Aligns SVG width/height attributes with the element's laid-out client box. */
function syncSvgDimensions(svg: SVGSVGElement): boolean {
	const svgWidth = svg.clientWidth || 0
	const svgHeight = svg.clientHeight || 0
	if (svgWidth <= 0 || svgHeight <= 0) return false

	svg.setAttribute("width", `${svgWidth}px`)
	svg.setAttribute("height", `${svgHeight}px`)
	svg.style.width = `${svgWidth}px`
	svg.style.height = `${svgHeight}px`
	return true
}

const MarkmapBase = memo(
	forwardRef(
		(
			{ options, data = "", className, ...rest }: MarkmapBaseProps,
			ref: Ref<MarkmapBaseRef>,
		) => {
			const { styles, cx } = useStyles()

			// Ref for SVG element
			const refSvg = useRef<SVGSVGElement | null>(null)
			// Ref for markmap object
			const refMm = useRef<Markmap | null>(null)
			// Ref to store latest data to avoid closure issues
			const refData = useRef<string>(data)

			useImperativeHandle(ref, () => ({
				instance: refMm,
				dom: refSvg,
				resize: () => {
					const svg = refSvg.current
					if (!svg || !refMm.current) return
					if (!syncSvgDimensions(svg)) return
					void refMm.current.fit()
				},
			}))

			// Keep refData in sync with data prop
			useEffect(() => {
				refData.current = data
			}, [data])

			useEffect(() => {
				const svg = refSvg.current
				if (svg && !refMm.current) {
					syncSvgDimensions(svg)
					ensureMarkmapInitialized().then(async () => {
						// Double-check instance doesn't exist to avoid duplicates
						if (refMm.current) return
						const { Markmap } = await import("markmap-view")
						refMm.current = Markmap.create(svg, options)

						// Apply data immediately after instance creation using latest data from ref
						// Use requestAnimationFrame to ensure DOM is fully rendered
						requestAnimationFrame(async () => {
							if (refMm.current && refData.current) {
								const svgElement = refSvg.current
								if (svgElement) syncSvgDimensions(svgElement)
								const { root } = transformer.transform(refData.current)
								if (refMm.current) {
									// setData is async in markmap-view 0.18.0+, must await it
									try {
										await refMm.current.setData(root)
										refMm.current.fit()
									} catch {
										// Silently handle errors
									}
								}
							}
						})
					})
				}

				return () => {
					if (refMm.current) {
						refMm.current?.destroy()
						refMm.current = null
					}
				}
			}, [options])

			useEffect(() => {
				// Only update data if instance already exists
				if (!refMm.current || !data) return

				ensureMarkmapInitialized().then(() => {
					// Use requestAnimationFrame to ensure DOM is fully rendered
					requestAnimationFrame(async () => {
						if (!refMm.current) return
						const svgElement = refSvg.current
						if (svgElement) syncSvgDimensions(svgElement)
						const { root } = transformer.transform(data)
						if (refMm.current) {
							// setData is async in markmap-view 0.18.0+, must await it
							try {
								await refMm.current.setData(root)
								refMm.current.fit()
							} catch {
								// Silently handle errors
							}
						}
					})
				})
			}, [data])

			return <svg ref={refSvg} className={cx(styles.svg, className)} {...rest} />
		},
	),
)

export default MarkmapBase
