import { motion } from "framer-motion"

import type { MicroAppStateSceneProps } from "./types"
import { BrowserFrame, ContentHeader, PlaceholderRows, Sidebar, SoftBackdrop } from "./primitives"

const BUILDING_PROGRESS_PATH = "M3 108C22 106 30 91 48 94C68 99 78 106 94 91C108 78 126 81 141 84"

export function EmptyScene({ accent, surface }: MicroAppStateSceneProps) {
	return (
		<>
			<SoftBackdrop accent={accent} />
			<BrowserFrame>
				<Sidebar />
				<g transform="translate(72 21)">
					<ContentHeader width={140} />
					<rect
						x="0"
						y="37"
						width="136"
						height="64"
						rx="12"
						fill={surface}
						stroke={accent}
						strokeOpacity="0.18"
						strokeDasharray="4 5"
					/>
					<path
						d="M68 55V83M54 69H82"
						stroke={accent}
						strokeWidth="2.4"
						strokeLinecap="round"
					/>
					<rect
						x="34"
						y="110"
						width="68"
						height="5"
						rx="2.5"
						fill={accent}
						fillOpacity="0.18"
					/>
				</g>
			</BrowserFrame>
		</>
	)
}

export function LoadingScene({ accent, surface }: MicroAppStateSceneProps) {
	return (
		<>
			<path
				d="M96 110C118 110 126 95 145 95C164 95 168 125 190 125C207 125 213 110 230 110"
				fill="none"
				stroke={accent}
				strokeOpacity="0.2"
				strokeWidth="1.6"
				strokeDasharray="3 5"
				data-testid="micro-app-loading-connection"
			/>

			<g transform="translate(32 76)" data-testid="micro-app-loading-source">
				<rect
					x="-7"
					y="8"
					width="68"
					height="68"
					rx="22"
					fill={surface}
					stroke={accent}
					strokeOpacity="0.08"
				/>
				<rect
					width="68"
					height="68"
					rx="22"
					className="fill-white stroke-[#172037]/[0.07] dark:fill-[#17181D] dark:stroke-white/[0.08]"
				/>
				<rect
					x="17"
					y="16"
					width="34"
					height="36"
					rx="10"
					fill={accent}
					fillOpacity="0.08"
				/>
				<rect x="24" y="23" width="9" height="9" rx="3" fill={accent} fillOpacity="0.42" />
				<rect
					x="37"
					y="23"
					width="7"
					height="9"
					rx="3"
					className="fill-[#172037]/10 dark:fill-white/10"
				/>
				<rect
					x="24"
					y="36"
					width="20"
					height="4"
					rx="2"
					className="fill-[#172037]/10 dark:fill-white/10"
				/>
				<rect
					x="24"
					y="44"
					width="14"
					height="3"
					rx="1.5"
					className="fill-[#172037]/[0.06] dark:fill-white/[0.08]"
				/>
			</g>

			<g transform="translate(160 110)">
				<circle r="22" fill={surface} />
				<circle
					r="13"
					fill="white"
					stroke={accent}
					strokeOpacity="0.18"
					className="dark:fill-[#17181D]"
				/>
				<circle r="4" fill={accent} fillOpacity="0.52" />
				<path
					d="M0-34V-23M0 23V34"
					stroke={accent}
					strokeOpacity="0.18"
					strokeWidth="1.5"
					strokeDasharray="2 3"
				/>
			</g>

			<g transform="translate(132 39)">
				<rect
					width="55"
					height="29"
					rx="10"
					className="fill-white stroke-[#172037]/[0.06] dark:fill-[#17181D] dark:stroke-white/[0.08]"
				/>
				<path
					d="M14 9H25L29 13H41V21H14Z"
					fill={accent}
					fillOpacity="0.12"
					stroke={accent}
					strokeOpacity="0.28"
					strokeWidth="1.2"
					strokeLinejoin="round"
				/>
			</g>

			<g transform="translate(135 157)">
				<rect
					width="50"
					height="28"
					rx="10"
					className="fill-white stroke-[#172037]/[0.06] dark:fill-[#17181D] dark:stroke-white/[0.08]"
				/>
				<ellipse
					cx="25"
					cy="9"
					rx="11"
					ry="4"
					fill={accent}
					fillOpacity="0.1"
					stroke={accent}
					strokeOpacity="0.3"
					strokeWidth="1.2"
				/>
				<path
					d="M14 9V18C14 21 19 23 25 23C31 23 36 21 36 18V9"
					fill={accent}
					fillOpacity="0.06"
					stroke={accent}
					strokeOpacity="0.3"
					strokeWidth="1.2"
				/>
			</g>

			<g transform="translate(226 62)" data-testid="micro-app-loading-project-stack">
				<rect
					x="-14"
					y="-9"
					width="68"
					height="86"
					rx="17"
					fill={surface}
					stroke={accent}
					strokeOpacity="0.08"
					transform="rotate(-6 20 34)"
				/>
				<rect
					x="7"
					y="-5"
					width="68"
					height="86"
					rx="17"
					className="fill-white/70 stroke-[#172037]/[0.04] dark:fill-white/[0.02] dark:stroke-white/[0.05]"
					transform="rotate(5 41 38)"
				/>
				<rect
					width="68"
					height="86"
					rx="17"
					className="fill-white stroke-[#172037]/[0.07] dark:fill-[#17181D] dark:stroke-white/[0.08]"
				/>
				<rect x="14" y="15" width="31" height="6" rx="3" fill={accent} fillOpacity="0.16" />
				<rect
					x="14"
					y="31"
					width="40"
					height="4"
					rx="2"
					className="fill-[#172037]/[0.06] dark:fill-white/[0.08]"
				/>
				<rect
					x="14"
					y="43"
					width="34"
					height="4"
					rx="2"
					className="fill-[#172037]/[0.06] dark:fill-white/[0.08]"
				/>
				<rect
					x="14"
					y="55"
					width="29"
					height="4"
					rx="2"
					className="fill-[#172037]/[0.06] dark:fill-white/[0.08]"
				/>
				<rect
					x="14"
					y="68"
					width="18"
					height="5"
					rx="2.5"
					fill={accent}
					fillOpacity="0.2"
				/>
			</g>
		</>
	)
}

export function BuildingScene({ accent, animated }: MicroAppStateSceneProps) {
	return (
		<>
			<SoftBackdrop accent={accent} />
			<BrowserFrame>
				<Sidebar />
				<g transform="translate(70 17)">
					<ContentHeader width={144} />
					{[0, 1, 2].map((item) => (
						<g key={item} transform={`translate(${item * 48} 36)`}>
							<motion.g
								animate={
									animated
										? { opacity: [0.45, 1, 0.45], y: [2, 0, 2] }
										: undefined
								}
								transition={{
									duration: 2.1,
									delay: item * 0.18,
									repeat: Infinity,
									ease: "easeInOut",
								}}
							>
								<rect
									width="40"
									height="36"
									rx="8"
									className="fill-[#F8F8F5] stroke-[#172037]/[0.06] dark:fill-white/[0.035] dark:stroke-white/[0.06]"
								/>
								<rect
									x="8"
									y="9"
									width="24"
									height="4"
									rx="2"
									className="fill-[#172037]/10 dark:fill-white/10"
								/>
								<rect
									x="8"
									y="20"
									width="17"
									height="5"
									rx="2.5"
									fill={accent}
									fillOpacity="0.28"
								/>
							</motion.g>
						</g>
					))}
					<rect
						data-testid="micro-app-building-progress-chart"
						x="0"
						y="80"
						width="144"
						height="34"
						rx="8"
						className="fill-white stroke-[#172037]/[0.06] dark:fill-white/[0.025] dark:stroke-white/[0.06]"
					/>
					<path
						data-testid="micro-app-building-progress-line"
						d={BUILDING_PROGRESS_PATH}
						fill="none"
						stroke={accent}
						strokeOpacity="0.38"
						strokeWidth="2.6"
						strokeLinecap="round"
					/>
					{animated ? (
						<motion.path
							data-testid="micro-app-building-progress-highlight"
							d={BUILDING_PROGRESS_PATH}
							fill="none"
							stroke={accent}
							strokeWidth="3.4"
							strokeLinecap="round"
							pathLength={1}
							strokeDasharray="0.22 0.78"
							animate={{ strokeDashoffset: [0, -1] }}
							transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
						/>
					) : null}
				</g>
			</BrowserFrame>
			<g transform="translate(122 183)">
				<rect
					width="76"
					height="28"
					rx="14"
					className="fill-white stroke-[#172037]/[0.07] dark:fill-[#17181D] dark:stroke-white/10"
				/>
				{[0, 1, 2].map((item) => (
					<motion.circle
						key={item}
						cx={29 + item * 9}
						cy="14"
						r="3"
						fill={accent}
						animate={animated ? { opacity: [0.3, 1, 0.3], y: [0, -2, 0] } : undefined}
						transition={{ duration: 1.2, delay: item * 0.16, repeat: Infinity }}
					/>
				))}
			</g>
		</>
	)
}

export function ConfirmScene({ accent, surface, animated }: MicroAppStateSceneProps) {
	return (
		<>
			<SoftBackdrop accent={accent} />
			<BrowserFrame>
				<Sidebar />
				<g transform="translate(70 18)">
					<ContentHeader width={144} />
					{[
						[13, 54],
						[62, 39],
						[111, 54],
					].map(([x, y], index) => (
						<g key={`${x}-${y}`}>
							{index > 0 ? (
								<path
									d={`M${x - 29} ${y + (index === 1 ? 8 : -8)}L${x - 8} ${y}`}
									stroke={accent}
									strokeOpacity="0.4"
									strokeWidth="1.6"
									strokeDasharray="3 4"
								/>
							) : null}
							<rect
								x={x - 8}
								y={y - 8}
								width="34"
								height="22"
								rx="7"
								fill={surface}
								stroke={accent}
								strokeOpacity="0.32"
							/>
							<rect
								x={x}
								y={y}
								width="18"
								height="4"
								rx="2"
								fill={accent}
								fillOpacity="0.48"
							/>
						</g>
					))}
					<rect
						x="0"
						y="88"
						width="136"
						height="29"
						rx="8"
						className="fill-[#F8F8F5] stroke-[#172037]/[0.06] dark:fill-white/[0.035] dark:stroke-white/[0.06]"
					/>
					<PlaceholderRows x={9} y={97} widths={[70, 46]} />
					<motion.rect
						x="99"
						y="96"
						width="27"
						height="13"
						rx="6.5"
						fill={accent}
						animate={animated ? { opacity: [0.72, 1, 0.72] } : undefined}
						transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
					/>
				</g>
			</BrowserFrame>
		</>
	)
}

export function SearchEmptyScene({ accent, surface }: MicroAppStateSceneProps) {
	return (
		<>
			<SoftBackdrop accent={accent} />
			<BrowserFrame>
				<g transform="translate(22 17)">
					<rect
						width="196"
						height="27"
						rx="9"
						fill={surface}
						stroke={accent}
						strokeOpacity="0.18"
					/>
					<circle cx="16" cy="13" r="5" fill="none" stroke={accent} strokeWidth="1.8" />
					<path
						d="M20 17L24 21"
						stroke={accent}
						strokeWidth="1.8"
						strokeLinecap="round"
					/>
					<rect
						x="34"
						y="10"
						width="72"
						height="5"
						rx="2.5"
						fill={accent}
						fillOpacity="0.22"
					/>
					{[0, 1, 2].map((item) => (
						<g
							key={item}
							transform={`translate(0 ${44 + item * 27})`}
							opacity={1 - item * 0.23}
						>
							<rect
								width="196"
								height="20"
								rx="7"
								className="fill-[#F8F8F5] stroke-[#172037]/[0.05] dark:fill-white/[0.03] dark:stroke-white/[0.06]"
							/>
							<rect
								x="10"
								y="8"
								width={82 - item * 10}
								height="4"
								rx="2"
								className="fill-[#172037]/[0.07] dark:fill-white/10"
							/>
						</g>
					))}
				</g>
			</BrowserFrame>
			<g transform="translate(238 160)">
				<circle
					cx="0"
					cy="0"
					r="27"
					className="fill-white stroke-[#172037]/[0.07] dark:fill-[#17181D] dark:stroke-white/10"
				/>
				<circle cx="-3" cy="-3" r="8" fill="none" stroke={accent} strokeWidth="2.4" />
				<path d="M3 3L10 10" stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
			</g>
		</>
	)
}
