import type { VisualPresetOption } from "@/pages/superMagic/components/Detail/components/SelfMediaRootRender/components/SelfMediaInitPanel/types"

interface SelfMediaComposerPresetPreviewProps {
	description?: string
	label?: string
	preset?: VisualPresetOption | null
}

function SelfMediaComposerPresetPreview({
	description,
	label,
	preset,
}: SelfMediaComposerPresetPreviewProps) {
	return (
		<aside
			className="min-w-0 rounded-2xl border border-border bg-muted/20 p-2.5"
			data-testid="self-media-composer-preview-panel"
		>
			{preset ? (
				<div className="flex h-full min-w-0 flex-col">
					<div className="mb-2 min-w-0 px-1">
						<div className="truncate text-sm font-semibold text-foreground">
							{label}
						</div>
						{description ? (
							<div className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
								{description}
							</div>
						) : null}
					</div>
					<div
						className="h-[260px] overflow-y-auto rounded-xl border border-border/70 bg-background shadow-inner"
						data-testid={`self-media-composer-preview-scroll-${preset.value}`}
					>
						{preset.preview?.imageUrl ? (
							<img
								src={preset.preview.imageUrl}
								alt=""
								className="block w-full select-none"
								data-testid={`self-media-composer-preview-image-${preset.value}`}
								draggable={false}
							/>
						) : (
							<div
								className="h-full min-h-[180px]"
								style={{ background: preset.swatch }}
							/>
						)}
					</div>
				</div>
			) : (
				<div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-border bg-background/70 px-4 text-center text-xs text-muted-foreground">
					选择模板后在这里预览
				</div>
			)}
		</aside>
	)
}

export default SelfMediaComposerPresetPreview
