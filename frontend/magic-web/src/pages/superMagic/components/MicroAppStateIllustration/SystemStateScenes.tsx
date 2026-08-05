import { motion } from "framer-motion"

import type { MicroAppStateSceneProps } from "./types"
import { BrowserFrame, ContentHeader, PlaceholderRows, Sidebar, SoftBackdrop } from "./primitives"

export function RetryScene({ accent, surface, animated }: MicroAppStateSceneProps) {
	return (
		<>
			<SoftBackdrop accent={accent} />
			<BrowserFrame>
				<Sidebar />
				<g transform="translate(70 18)">
					<ContentHeader width={144} />
					{[0, 1, 2].map((item) => (
						<rect
							key={item}
							x={item * 48}
							y="35"
							width="40"
							height="34"
							rx="8"
							className="fill-[#F8F8F5] stroke-[#172037]/[0.06] dark:fill-white/[0.035] dark:stroke-white/[0.06]"
						/>
					))}
					<rect
						x="0"
						y="80"
						width="136"
						height="31"
						rx="8"
						fill={surface}
						fillOpacity="0.68"
						stroke={accent}
						strokeOpacity="0.14"
						strokeDasharray="4 4"
					/>
					<path
						d="M43 96H61M75 96H93"
						stroke={accent}
						strokeWidth="2"
						strokeLinecap="round"
					/>
					<circle cx="68" cy="96" r="3" fill={accent} />
				</g>
			</BrowserFrame>
			<g transform="translate(242 166)">
				<circle
					r="25"
					className="fill-white stroke-[#172037]/[0.07] dark:fill-[#17181D] dark:stroke-white/10"
				/>
				<circle r="18" fill={surface} />
				<motion.g
					animate={animated ? { rotate: 360 } : undefined}
					transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
				>
					<path
						d="M-11 1A12 12 0 0 1 8-9"
						fill="none"
						stroke={accent}
						strokeWidth="2.6"
						strokeLinecap="round"
					/>
					<path
						d="M8-14V-8H2"
						fill="none"
						stroke={accent}
						strokeWidth="2.6"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</motion.g>
			</g>
		</>
	)
}

export function PermissionScene({ accent, surface }: MicroAppStateSceneProps) {
	return (
		<>
			<SoftBackdrop accent={accent} />
			<BrowserFrame muted>
				<Sidebar />
				<g transform="translate(70 18)" opacity="0.72">
					<ContentHeader width={144} />
					<PlaceholderRows x={0} y={37} widths={[137, 119, 128, 86, 110]} />
				</g>
			</BrowserFrame>
			<g transform="translate(160 112)">
				<path
					d="M0-42L35-29V-4C35 18 21 35 0 44C-21 35-35 18-35-4V-29L0-42Z"
					fill={surface}
					stroke={accent}
					strokeWidth="2"
				/>
				<rect
					x="-13"
					y="-4"
					width="26"
					height="23"
					rx="7"
					fill={accent}
					fillOpacity="0.22"
					stroke={accent}
					strokeWidth="1.8"
				/>
				<path
					d="M-8-4V-11A8 8 0 0 1 8-11V-4"
					fill="none"
					stroke={accent}
					strokeWidth="2.2"
					strokeLinecap="round"
				/>
				<circle cx="0" cy="7" r="2.5" fill={accent} />
			</g>
		</>
	)
}

export function PublishedScene({ accent, surface, animated }: MicroAppStateSceneProps) {
	return (
		<>
			<rect
				x="25"
				y="45"
				width="176"
				height="125"
				rx="20"
				transform="rotate(-7 25 45)"
				fill={surface}
				stroke={accent}
				strokeOpacity="0.18"
			/>
			<BrowserFrame x={50} y={38} width={210} height={148}>
				<g transform="translate(18 17)">
					<ContentHeader width={158} />
					<rect
						x="0"
						y="35"
						width="174"
						height="65"
						rx="11"
						className="fill-[#F8F8F5] stroke-[#172037]/[0.06] dark:fill-white/[0.035] dark:stroke-white/[0.06]"
					/>
					<rect
						x="13"
						y="48"
						width="70"
						height="7"
						rx="3.5"
						className="fill-[#172037]/14 dark:fill-white/15"
					/>
					<rect
						x="13"
						y="65"
						width="104"
						height="4"
						rx="2"
						className="fill-[#172037]/[0.07] dark:fill-white/10"
					/>
					<rect
						x="13"
						y="76"
						width="82"
						height="4"
						rx="2"
						className="fill-[#172037]/[0.07] dark:fill-white/10"
					/>
					<rect
						x="132"
						y="47"
						width="28"
						height="28"
						rx="8"
						fill={accent}
						fillOpacity="0.2"
					/>
				</g>
			</BrowserFrame>
			<g transform="translate(246 168)">
				<motion.circle
					r="29"
					className="fill-white stroke-[#172037]/[0.07] dark:fill-[#17181D] dark:stroke-white/10"
					animate={animated ? { r: [27, 29, 27] } : undefined}
					transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
				/>
				<circle r="21" fill={surface} />
				<motion.path
					d="M-10 0L-3 8L12-9"
					fill="none"
					stroke={accent}
					strokeWidth="3"
					strokeLinecap="round"
					strokeLinejoin="round"
					animate={animated ? { pathLength: [0, 1] } : undefined}
					transition={{ duration: 0.7, repeat: Infinity, repeatDelay: 1.3 }}
				/>
			</g>
		</>
	)
}

export function DatabaseEmptyScene({ accent, surface }: MicroAppStateSceneProps) {
	return (
		<>
			<SoftBackdrop accent={accent} />
			<BrowserFrame>
				<g transform="translate(18 17)">
					<ContentHeader width={188} />
					<g transform="translate(0 36)">
						<rect
							width="204"
							height="72"
							rx="10"
							className="fill-[#F8F8F5] stroke-[#172037]/[0.07] dark:fill-white/[0.03] dark:stroke-white/[0.07]"
						/>
						<path
							d="M0 22H204M0 47H204M55 0V72M112 0V72M164 0V72"
							className="stroke-[#172037]/[0.06] dark:stroke-white/[0.07]"
						/>
						{[12, 66, 123, 175].map((x) => (
							<rect
								key={x}
								x={x}
								y="9"
								width="27"
								height="4"
								rx="2"
								fill={accent}
								fillOpacity="0.26"
							/>
						))}
					</g>
				</g>
			</BrowserFrame>
			<g transform="translate(64 157)">
				<ellipse
					cx="0"
					cy="-14"
					rx="25"
					ry="9"
					fill={surface}
					stroke={accent}
					strokeWidth="1.8"
				/>
				<path
					d="M-25-14V13C-25 18-14 22 0 22C14 22 25 18 25 13V-14"
					fill={surface}
					stroke={accent}
					strokeWidth="1.8"
				/>
				<path
					d="M-25 0C-25 5-14 9 0 9C14 9 25 5 25 0"
					fill="none"
					stroke={accent}
					strokeOpacity="0.55"
					strokeWidth="1.5"
				/>
			</g>
			<path
				d="M89 157C112 151 122 143 139 131"
				fill="none"
				stroke={accent}
				strokeOpacity="0.45"
				strokeWidth="1.8"
				strokeDasharray="4 5"
			/>
		</>
	)
}
