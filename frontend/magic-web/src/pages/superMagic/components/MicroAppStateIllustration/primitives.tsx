import type { ReactNode } from "react"

interface BrowserFrameProps {
	children: ReactNode
	x?: number
	y?: number
	width?: number
	height?: number
	muted?: boolean
}

export function BrowserFrame({
	children,
	x = 40,
	y = 28,
	width = 240,
	height = 164,
	muted = false,
}: BrowserFrameProps) {
	return (
		<g transform={`translate(${x} ${y})`}>
			<rect
				x="0"
				y="0"
				width={width}
				height={height}
				rx="20"
				className={
					muted
						? "fill-[#F7F7F8] stroke-[#172037]/[0.05] dark:fill-white/[0.02] dark:stroke-white/[0.07]"
						: "fill-white stroke-[#172037]/[0.07] dark:fill-[#17181D] dark:stroke-white/[0.08]"
				}
				strokeWidth="1"
			/>
			<path
				d={`M0 34H${width}`}
				className="stroke-[#172037]/[0.07] dark:stroke-white/[0.07]"
				strokeWidth="1"
			/>
			<circle cx="17" cy="17" r="2.4" className="fill-[#172037]/14 dark:fill-white/20" />
			<circle cx="25" cy="17" r="2.4" className="fill-[#172037]/10 dark:fill-white/15" />
			<circle cx="33" cy="17" r="2.4" className="fill-[#172037]/[0.06] dark:fill-white/10" />
			<rect
				x={width * 0.36}
				y="14"
				width={width * 0.28}
				height="5"
				rx="2.5"
				className="fill-[#172037]/[0.045] dark:fill-white/[0.07]"
			/>
			<g transform="translate(0 34)">{children}</g>
		</g>
	)
}

export function Sidebar({ height = 130 }: { height?: number }) {
	return (
		<g>
			<rect
				x="0"
				y="0"
				width="54"
				height={height}
				className="fill-[#F5F5F6] dark:fill-white/[0.025]"
			/>
			<path
				d={`M54 0V${height}`}
				className="stroke-[#172037]/[0.07] dark:stroke-white/[0.07]"
			/>
			<rect
				x="13"
				y="16"
				width="26"
				height="26"
				rx="8"
				className="fill-[#172037]/[0.07] stroke-[#172037]/10 dark:fill-white/[0.07] dark:stroke-white/10"
			/>
			<path
				d="M20 24H32M20 29H29M20 34H34"
				className="stroke-[#172037]/35 dark:stroke-white/35"
				strokeWidth="1.5"
				strokeLinecap="round"
			/>
			{[0, 1, 2, 3].map((item) => (
				<rect
					key={item}
					x="14"
					y={57 + item * 13}
					width={item === 1 ? 23 : 29}
					height="4"
					rx="2"
					className="fill-[#172037]/10 dark:fill-white/10"
				/>
			))}
		</g>
	)
}

export function ContentHeader({ width = 160 }: { width?: number }) {
	return (
		<g>
			<rect
				x="0"
				y="0"
				width={width * 0.46}
				height="7"
				rx="3.5"
				className="fill-[#172037]/12 dark:fill-white/15"
			/>
			<rect
				x="0"
				y="13"
				width={width * 0.3}
				height="4"
				rx="2"
				className="fill-[#172037]/[0.07] dark:fill-white/10"
			/>
		</g>
	)
}

export function SoftBackdrop({ accent }: { accent: string }) {
	return (
		<>
			<rect
				x="42"
				y="42"
				width="204"
				height="138"
				rx="23"
				transform="rotate(-5 42 42)"
				className="fill-white/35 stroke-[#172037]/[0.04] dark:fill-white/[0.015] dark:stroke-white/[0.05]"
			/>
			<rect
				x="75"
				y="31"
				width="200"
				height="137"
				rx="23"
				transform="rotate(4 75 31)"
				fill={accent}
				fillOpacity="0.025"
				stroke={accent}
				strokeOpacity="0.08"
			/>
		</>
	)
}

export function PlaceholderRows({ x, y, widths }: { x: number; y: number; widths: number[] }) {
	return (
		<g transform={`translate(${x} ${y})`}>
			{widths.map((width, index) => (
				<rect
					key={`${width}-${index}`}
					x="0"
					y={index * 14}
					width={width}
					height="5"
					rx="2.5"
					className="fill-[#172037]/[0.07] dark:fill-white/10"
				/>
			))}
		</g>
	)
}
