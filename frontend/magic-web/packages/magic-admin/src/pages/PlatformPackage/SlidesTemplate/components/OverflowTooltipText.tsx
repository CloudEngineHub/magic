import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { Tooltip } from "antd"

interface OverflowTooltipTextProps {
	text: ReactNode
	title?: ReactNode
	className?: string
	style?: CSSProperties
}

export const OverflowTooltipText = memo(
	({ text, title = text, className, style }: OverflowTooltipTextProps) => {
		const textRef = useRef<HTMLSpanElement>(null)
		const [overflowed, setOverflowed] = useState(false)

		useEffect(() => {
			const node = textRef.current
			if (!node) return undefined

			const checkOverflow = () => {
				setOverflowed(node.scrollWidth > node.clientWidth)
			}

			checkOverflow()

			if (typeof ResizeObserver === "undefined") {
				if (typeof window === "undefined") return undefined
				window.addEventListener("resize", checkOverflow)
				return () => {
					window.removeEventListener("resize", checkOverflow)
				}
			}

			const resizeObserver = new ResizeObserver(checkOverflow)
			resizeObserver.observe(node)

			return () => {
				resizeObserver.disconnect()
			}
		}, [text])

		return (
			<Tooltip title={overflowed ? title : undefined}>
				<span
					ref={textRef}
					className={className}
					style={{
						display: "block",
						maxWidth: "100%",
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
						...style,
					}}
				>
					{text ?? "-"}
				</span>
			</Tooltip>
		)
	},
)
