import type { ReactNode } from "react"

import PhoneShell from "@/pages/superMagic/components/Detail/components/PhoneShell"
import { usePhoneScaling } from "@/pages/superMagic/components/Detail/hooks/usePhoneScaling"

const PHONE_SCREEN_WIDTH = 393
const PHONE_SCREEN_HEIGHT = 852
const PHONE_SHELL_WIDTH = PHONE_SCREEN_WIDTH + 28
const PHONE_SHELL_HEIGHT = PHONE_SCREEN_HEIGHT + 28
const PHONE_FRAME_PADDING = 32

interface MicroAppPhonePreviewFrameProps {
	children: ReactNode
}

export default function MicroAppPhonePreviewFrame({ children }: MicroAppPhonePreviewFrameProps) {
	const { containerRef, scale } = usePhoneScaling<HTMLDivElement>({
		designWidth: PHONE_SHELL_WIDTH,
		designHeight: PHONE_SHELL_HEIGHT,
		padding: PHONE_FRAME_PADDING,
	})

	const scaledWidth = PHONE_SHELL_WIDTH * scale
	const scaledHeight = PHONE_SHELL_HEIGHT * scale

	return (
		<div
			ref={containerRef}
			className="flex h-full min-h-0 min-w-0 items-center justify-center overflow-auto bg-[#f5f6f8]"
			data-testid="micro-app-phone-preview-frame"
		>
			<div className="relative shrink-0" style={{ width: scaledWidth, height: scaledHeight }}>
				<div
					className="absolute left-1/2 top-1/2"
					style={{
						width: PHONE_SHELL_WIDTH,
						height: PHONE_SHELL_HEIGHT,
						transform: `translate(-50%, -50%) scale(${scale})`,
						transformOrigin: "center center",
					}}
				>
					<PhoneShell width={PHONE_SCREEN_WIDTH} height={PHONE_SCREEN_HEIGHT}>
						<div className="flex h-full flex-col bg-white pb-[20px] pt-[54px]">
							<div className="relative min-h-0 flex-1 overflow-hidden">
								{children}
							</div>
						</div>
					</PhoneShell>
				</div>
			</div>
		</div>
	)
}
