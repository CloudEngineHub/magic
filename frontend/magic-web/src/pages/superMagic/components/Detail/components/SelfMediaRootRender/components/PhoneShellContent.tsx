import { forwardRef, type CSSProperties, type ReactNode, type Ref } from "react"
import { BatteryFull, Signal, Wifi } from "lucide-react"
import { cn } from "@/utils/cn"
import {
	getPhoneShellInsets,
	NO_PHONE_SHELL_INSETS,
	type PhoneShellProfile,
} from "./phoneShellGeometry"

export interface PhoneShellContentProps {
	children: ReactNode
	width: number
	height: number
	profile?: PhoneShellProfile
	showFrame?: boolean
	enabled?: boolean
	landscape?: boolean
	posture?: "folded" | "unfolded"
	rotated?: boolean
	contentRef?: Ref<HTMLDivElement>
	className?: string
	style?: CSSProperties
}

/** 内容始终留在同一个节点；开关外观只改变外围占位，不重建 iframe 或编辑器。 */
const PhoneShellContent = forwardRef<HTMLDivElement, PhoneShellContentProps>(
	function PhoneShellContent(
		{
			children,
			width,
			height,
			profile = "modern",
			showFrame = true,
			enabled = true,
			landscape = width > height,
			posture,
			rotated,
			contentRef,
			className,
			style,
		},
		ref,
	) {
		const framed = enabled && showFrame
		const insets = framed
			? getPhoneShellInsets(profile, landscape, posture)
			: NO_PHONE_SHELL_INSETS
		const tablet = profile === "tablet"
		const foldable = profile === "foldable"
		const homeButton = profile === "home-button"
		const sideCamera = landscape && !tablet && !foldable
		const radius = tablet
			? 28
			: foldable
				? 25
				: homeButton
					? 32
					: profile === "punch-hole"
						? 39
						: 53
		const cameraWidth = tablet
			? 7
			: homeButton
				? 53
				: profile === "punch-hole"
					? 14
					: profile === "notch"
						? 155
						: foldable
							? 82
							: 115
		const cameraHeight = tablet
			? 7
			: homeButton
				? 5
				: profile === "punch-hole"
					? 14
					: foldable
						? 21
						: 29
		const cameraStyle: CSSProperties = sideCamera
			? {
					left: homeButton ? 30 : 21,
					top: "50%",
					transform: "translate(-50%, -50%) rotate(-90deg)",
				}
			: {
					left: "50%",
					top: tablet
						? 8
						: homeButton
							? 30
							: foldable
								? 14
								: profile === "notch"
									? 9
									: 17,
					transform: "translateX(-50%)",
				}

		return (
			<div
				ref={ref}
				className={cn(enabled ? "relative shrink-0" : "contents", className)}
				style={
					enabled
						? {
								width: width + insets.left + insets.right,
								height: height + insets.top + insets.bottom,
								...style,
							}
						: undefined
				}
			>
				<div
					aria-hidden
					hidden={!framed}
					className="pointer-events-none absolute inset-0 border-[3px] border-[#777980] bg-[#101113]"
					style={{
						borderRadius: radius,
						boxShadow:
							foldable && posture === "folded"
								? "-3px 0 0 #484b51,-5px 0 0 #96989c,inset 0 0 0 2px #17181b,0 18px 35px -14px #00000050"
								: "0 0 0 1px #25262a,inset 0 0 0 2px #17181b,inset 0 0 0 4px #38393e,0 18px 35px -14px #00000050",
					}}
				/>
				<div
					aria-hidden
					hidden={!framed}
					className="pointer-events-none absolute bg-background"
					style={{
						inset: tablet ? 20 : 9,
						borderRadius: tablet ? 14 : foldable ? 17 : homeButton ? 2 : radius - 9,
					}}
				/>
				<div
					aria-hidden
					hidden={!framed}
					className="pointer-events-none absolute inset-0 select-none text-foreground"
				>
					{!homeButton && (!landscape || tablet || foldable) && width >= 280 && (
						<div
							className="absolute flex items-center justify-between font-medium"
							style={{
								left: 30,
								right: 28,
								top: tablet ? 24 : 16,
								height: 20,
								fontSize: tablet || foldable ? 12 : 14,
							}}
						>
							<span>9:41</span>
							<span className="flex items-center gap-1">
								<Signal size={16} />
								<Wifi size={16} />
								<BatteryFull size={16} />
							</span>
						</div>
					)}
					{!(foldable && posture === "unfolded") && (
						<div
							className="absolute bg-[#08090a]"
							style={{
								...cameraStyle,
								width: cameraWidth,
								height: cameraHeight,
								borderRadius: profile === "notch" ? "0 0 19px 19px" : 20,
							}}
						>
							{!homeButton && (
								<span className="absolute right-[8%] top-1/2 size-[7px] -translate-y-1/2 rounded-full bg-[#14243b]" />
							)}
						</div>
					)}
					<div
						className={cn(
							"absolute",
							homeButton
								? "rounded-full bg-[#151618] shadow-[inset_0_0_0_2px_#414348]"
								: "rounded-full bg-foreground",
						)}
						style={
							homeButton && landscape
								? {
										right: 17,
										top: "50%",
										transform: "translateY(-50%)",
										width: 43,
										height: 43,
									}
								: {
										bottom: homeButton ? 17 : 13,
										left: "50%",
										transform: "translateX(-50%)",
										width: homeButton ? 43 : tablet ? 170 : 125,
										height: homeButton ? 43 : 4,
									}
						}
					/>
					<span className="absolute -right-[3px] top-[20%] h-12 w-[3px] rounded-sm bg-[#666971]" />
					<span className="absolute -left-[3px] top-[18%] h-10 w-[3px] rounded-sm bg-[#666971]" />
					{foldable &&
						posture === "unfolded" &&
						[false, true].map((end) => (
							<span
								key={String(end)}
								className="absolute rounded-sm bg-gradient-to-r from-[#43464c] via-[#9a9ca0] to-[#43464c]"
								style={
									rotated
										? {
												top: "calc(50% - 6px)",
												left: end ? undefined : 0,
												right: end ? 0 : undefined,
												width: 5,
												height: 12,
											}
										: {
												left: "calc(50% - 6px)",
												top: end ? undefined : 0,
												bottom: end ? 0 : undefined,
												width: 12,
												height: 5,
											}
								}
							/>
						))}
				</div>
				<div
					ref={contentRef}
					className={
						enabled
							? cn(
									"relative overflow-auto overscroll-contain bg-background",
									!framed && "outline outline-1 outline-border",
								)
							: "contents"
					}
					style={
						enabled
							? {
									width,
									height,
									marginLeft: insets.left,
									top: insets.top,
									borderRadius: framed ? 0 : 4,
								}
							: undefined
					}
				>
					{children}
				</div>
			</div>
		)
	},
)

export default PhoneShellContent
