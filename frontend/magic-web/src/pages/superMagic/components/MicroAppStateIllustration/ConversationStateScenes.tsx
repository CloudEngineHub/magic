import type { MicroAppStateSceneProps } from "./types"

export function ConversationEmptyScene({ accent, surface }: MicroAppStateSceneProps) {
	return (
		<>
			<circle cx="160" cy="111" r="82" fill={surface} fillOpacity="0.72" />

			<g transform="translate(38 40)" data-testid="micro-app-conversation-prompt">
				<rect
					width="158"
					height="62"
					rx="20"
					className="fill-white stroke-[#172037]/[0.07] dark:fill-[#17181D] dark:stroke-white/[0.08]"
				/>
				<path
					d="M137 56L151 70L149 51"
					className="fill-white stroke-[#172037]/[0.07] dark:fill-[#17181D] dark:stroke-white/[0.08]"
					strokeLinejoin="round"
				/>
				<circle cx="25" cy="25" r="10" fill={accent} fillOpacity="0.12" />
				<circle cx="25" cy="22" r="3.5" fill={accent} fillOpacity="0.42" />
				<path
					d="M18 33C19.5 28.5 30.5 28.5 32 33"
					fill="none"
					stroke={accent}
					strokeOpacity="0.42"
					strokeWidth="1.5"
					strokeLinecap="round"
				/>
				<rect
					x="45"
					y="18"
					width="82"
					height="5"
					rx="2.5"
					className="fill-[#172037]/10 dark:fill-white/10"
				/>
				<rect
					x="45"
					y="30"
					width="58"
					height="4"
					rx="2"
					className="fill-[#172037]/[0.055] dark:fill-white/[0.08]"
				/>
				<rect
					x="45"
					y="41"
					width="71"
					height="4"
					rx="2"
					className="fill-[#172037]/[0.055] dark:fill-white/[0.08]"
				/>
			</g>

			<g transform="translate(98 96)" data-testid="micro-app-conversation-result">
				<rect
					x="8"
					y="8"
					width="176"
					height="94"
					rx="22"
					fill={accent}
					fillOpacity="0.035"
				/>
				<rect
					width="176"
					height="94"
					rx="22"
					className="fill-white stroke-[#172037]/[0.07] dark:fill-[#17181D] dark:stroke-white/[0.08]"
				/>
				<path d="M0 30H176" className="stroke-[#172037]/[0.055] dark:stroke-white/[0.07]" />
				<rect
					x="15"
					y="11"
					width="18"
					height="12"
					rx="4"
					fill={accent}
					fillOpacity="0.13"
				/>
				<rect
					x="40"
					y="14"
					width="47"
					height="5"
					rx="2.5"
					className="fill-[#172037]/10 dark:fill-white/10"
				/>
				<circle cx="151" cy="17" r="4" fill={accent} fillOpacity="0.28" />
				<rect x="15" y="44" width="54" height="35" rx="10" fill={surface} />
				<rect x="80" y="44" width="81" height="8" rx="4" fill={accent} fillOpacity="0.1" />
				<rect
					x="80"
					y="61"
					width="67"
					height="5"
					rx="2.5"
					className="fill-[#172037]/[0.055] dark:fill-white/[0.08]"
				/>
				<rect
					x="80"
					y="73"
					width="48"
					height="5"
					rx="2.5"
					className="fill-[#172037]/[0.055] dark:fill-white/[0.08]"
				/>
				<path
					d="M27 69L37 58L44 64L56 51"
					fill="none"
					stroke={accent}
					strokeOpacity="0.42"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</g>

			<g transform="translate(255 80)" data-testid="micro-app-conversation-agent">
				<circle
					r="22"
					className="fill-white stroke-[#172037]/[0.07] dark:fill-[#17181D] dark:stroke-white/[0.08]"
				/>
				<circle r="15" fill={surface} />
				<path
					d="M0-9C1-3 4-1 9 0C4 1 1 4 0 9C-1 4-4 1-9 0C-4-1-1-4 0-9Z"
					fill={accent}
					fillOpacity="0.55"
				/>
			</g>
		</>
	)
}
