import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { message } from "antd"

import { useBrandImagePreviewHydration } from "../../../hooks/useBrandImagePreviewHydration"
import type { AttachmentNode } from "../../../../../services"
import type { SelfMediaFileStorageService } from "../../../../../services/SelfMediaFileStorageService"
import type { BrandImageItem } from "../../../types"
import { BrandInfoSettingsLayout, type BrandInfoSettingsField } from "./BrandInfoSettingsLayout"

type BrandInfoField = BrandInfoSettingsField

interface BrandInfoFieldsProps {
	author: string
	brandPosition: string
	targetAudience: string
	brandImages: BrandImageItem[]
	onChange: (field: "author" | "brandPosition" | "targetAudience", value: string) => void
	onBrandImagesChange: (images: BrandImageItem[]) => void
	fileStorageService?: SelfMediaFileStorageService | null
	attachmentList?: AttachmentNode[]
	onBrandImagesUploadingChange?: (uploading: boolean) => void
	brandImageUploadTarget?: "draft" | "brand"
	layout?: "wizard" | "settings"
}

export function BrandInfoFields({
	author,
	brandPosition,
	targetAudience,
	brandImages,
	onChange,
	onBrandImagesChange,
	fileStorageService,
	attachmentList,
	onBrandImagesUploadingChange,
	brandImageUploadTarget = "draft",
	layout = "wizard",
}: BrandInfoFieldsProps) {
	const { t } = useTranslation("super")
	const [activeBrandField, setActiveBrandField] = useState<BrandInfoField | null>(null)
	const [brandImageUploadProgress, setBrandImageUploadProgress] = useState<
		Record<string, number>
	>({})

	const { hydratingImageIds } = useBrandImagePreviewHydration({
		attachmentList,
		brandImages,
		onBrandImagesChange,
	})

	useEffect(() => {
		onBrandImagesUploadingChange?.(Object.keys(brandImageUploadProgress).length > 0)
	}, [brandImageUploadProgress, onBrandImagesUploadingChange])

	const handleFilesSelect = useCallback(
		async (files: FileList, uploadedPaths?: (string | undefined)[]) => {
			if (files.length === 0) return

			const newItems: BrandImageItem[] = Array.from(files).map((file, index) => {
				const isImage = file.type.startsWith("image/")
				return {
					id: crypto.randomUUID(),
					file,
					previewUrl: isImage ? URL.createObjectURL(file) : "",
					description: "",
					isImage,
					uploadedPath: uploadedPaths?.[index],
				}
			})

			let currentItems = [...brandImages, ...newItems]
			onBrandImagesChange(currentItems)

			if (!fileStorageService) return

			for (const item of newItems) {
				if (item.uploadedPath) continue

				setBrandImageUploadProgress((prev) => ({ ...prev, [item.id]: 0 }))

				const upload =
					brandImageUploadTarget === "brand"
						? fileStorageService.uploadBrandImageToBrandConfig.bind(fileStorageService)
						: fileStorageService.uploadBrandImageToDraft.bind(fileStorageService)
				const uploadedPath = await upload(item.file, (percent) => {
					setBrandImageUploadProgress((prev) => ({ ...prev, [item.id]: percent }))
				})

				setBrandImageUploadProgress((prev) => {
					const next = { ...prev }
					delete next[item.id]
					return next
				})

				if (uploadedPath) {
					currentItems = currentItems.map((img) =>
						img.id === item.id ? { ...img, uploadedPath } : img,
					)
					onBrandImagesChange(currentItems)
				} else {
					message.error(
						t("detail.selfMedia.initPanel.stepBrand.brandImagesUploadFailed", {
							name: item.file.name,
						}),
					)
				}
			}
		},
		[brandImages, onBrandImagesChange, fileStorageService, brandImageUploadTarget, t],
	)

	const handleRemoveBrandImage = useCallback(
		(id: string) => {
			const item = brandImages.find((img) => img.id === id)
			if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
			onBrandImagesChange(brandImages.filter((img) => img.id !== id))
		},
		[brandImages, onBrandImagesChange],
	)

	const handleBrandImageDescChange = useCallback(
		(id: string, description: string) => {
			onBrandImagesChange(
				brandImages.map((img) => (img.id === id ? { ...img, description } : img)),
			)
		},
		[brandImages, onBrandImagesChange],
	)

	return (
		<BrandInfoSettingsLayout
			author={author}
			brandPosition={brandPosition}
			targetAudience={targetAudience}
			brandImages={brandImages}
			brandImageUploadProgress={brandImageUploadProgress}
			hydratingImageIds={hydratingImageIds}
			activeBrandField={activeBrandField}
			onActiveBrandFieldChange={setActiveBrandField}
			onChange={onChange}
			onFilesSelect={handleFilesSelect}
			onRemoveBrandImage={handleRemoveBrandImage}
			onBrandImageDescChange={handleBrandImageDescChange}
			layout={layout}
		/>
	)
}
