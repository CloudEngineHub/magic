import ModelSelector from "../components/picker/ModelSelector"
import type { StepConfirmTranslate } from "./StepConfirmBlocks"

interface StepConfirmModelSettingsProps {
	selectedModelId: string
	selectedImageModelId: string
	selectedVideoModelId: string
	onModelChange: (value: string) => void
	onImageModelChange: (value: string) => void
	onVideoModelChange: (value: string) => void
	t: StepConfirmTranslate
}

export default function StepConfirmModelSettings({
	selectedModelId,
	selectedImageModelId,
	selectedVideoModelId,
	onModelChange,
	onImageModelChange,
	onVideoModelChange,
	t,
}: StepConfirmModelSettingsProps) {
	return (
		<section
			className="rounded-[24px] bg-white p-4 shadow-[inset_0_1px_rgba(255,255,255,0.82),0_14px_34px_rgba(24,24,27,0.06)]"
			data-testid="self-media-step-confirm-model-settings"
		>
			<div className="mb-3 flex items-center justify-between gap-3">
				<h3 className="text-sm font-[820] text-[#18181b]">
					{t("detail.selfMedia.initPanel.stepConfirm.modelSettingsTitle", {
						defaultValue: "生成设置",
					})}
				</h3>
				<span className="text-xs font-semibold text-[#71717a]">
					{t("detail.selfMedia.initPanel.stepConfirm.modelSettingsHint", {
						defaultValue: "默认即可，也可以在开始前微调。",
					})}
				</span>
			</div>
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
				<div className="flex min-w-0 flex-col gap-1 rounded-[18px] bg-[#f8f8f9] px-4 py-3">
					<span className="truncate text-xs font-medium text-muted-foreground">
						{t("detail.selfMedia.initPanel.stepConfirm.textModel", {
							defaultValue: "文本模型",
						})}
					</span>
					<ModelSelector
						value={selectedModelId}
						onChange={onModelChange}
						className="border-none bg-transparent p-0 shadow-none hover:bg-transparent"
					/>
				</div>
				<div className="flex min-w-0 flex-col gap-1 rounded-[18px] bg-[#f8f8f9] px-4 py-3">
					<span className="truncate text-xs font-medium text-muted-foreground">
						{t("detail.selfMedia.initPanel.stepConfirm.imageModel", {
							defaultValue: "图像模型",
						})}
					</span>
					<ModelSelector
						value={selectedImageModelId}
						onChange={onImageModelChange}
						modelType="image"
						className="border-none bg-transparent p-0 shadow-none hover:bg-transparent"
					/>
				</div>
				<div className="flex min-w-0 flex-col gap-1 rounded-[18px] bg-[#f8f8f9] px-4 py-3">
					<span className="truncate text-xs font-medium text-muted-foreground">
						{t("detail.selfMedia.initPanel.stepConfirm.videoModel", {
							defaultValue: "视频模型",
						})}
					</span>
					<ModelSelector
						value={selectedVideoModelId}
						onChange={onVideoModelChange}
						modelType="video"
						className="border-none bg-transparent p-0 shadow-none hover:bg-transparent"
					/>
				</div>
			</div>
		</section>
	)
}
