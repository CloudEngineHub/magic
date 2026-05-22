import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import {
	SketchFieldIllustration,
	type BrandFieldIllustrationVariant,
} from "../../../components/ui/SketchFieldIllustration"

interface BrandFieldRowProps {
	illustration: BrandFieldIllustrationVariant
	header: ReactNode
	children: ReactNode
	className?: string
	"data-testid"?: string
	isActive?: boolean
}

export function BrandFieldRow({
	illustration,
	header,
	children,
	className,
	"data-testid": dataTestId,
	isActive = false,
}: BrandFieldRowProps) {
	return (
		<div
			className={cn(
				"group grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2.5 border-b border-dashed border-zinc-950/10 pb-6 pt-4 transition-colors duration-300 last:border-b-0 last:pb-0 first:pt-0 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-x-3.5",
				isActive && "bg-gradient-to-r from-primary/[0.02] via-transparent to-transparent",
				className,
			)}
			data-testid={dataTestId}
		>
			<div
				className={cn(
					"flex h-10 w-10 items-center justify-center self-center transition-transform duration-300 sm:h-11 sm:w-11",
					isActive && "scale-105",
				)}
			>
				<SketchFieldIllustration
					variant={illustration}
					className={cn(
						"h-full w-full transition-opacity duration-300",
						isActive ? "opacity-100" : "opacity-45 group-hover:opacity-70",
					)}
					imageClassName="object-contain"
					data-testid={dataTestId ? `${dataTestId}-illustration` : undefined}
				/>
			</div>

			<div className="flex min-h-10 min-w-0 items-center">{header}</div>

			<div className="col-start-2 min-w-0">{children}</div>
		</div>
	)
}
