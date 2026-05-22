import { useCallback, useEffect, useState } from "react"
import { createEmptyInitData } from "../components/SelfMediaInitPanel/constants"
import type {
	BrandImageItem,
	SelfMediaInitGlobalSettings,
} from "../components/SelfMediaInitPanel/types"
import type { SelfMediaFileStorageService } from "../services/SelfMediaFileStorageService"

interface UseSelfMediaBrandConfigOptions {
	fileStorageService: SelfMediaFileStorageService | null
}

export function useSelfMediaBrandConfig({ fileStorageService }: UseSelfMediaBrandConfigOptions) {
	const [settings, setSettings] = useState<SelfMediaInitGlobalSettings>(
		() => createEmptyInitData().global,
	)
	const [isLoading, setIsLoading] = useState(Boolean(fileStorageService))
	const [isSaving, setIsSaving] = useState(false)

	useEffect(() => {
		let cancelled = false

		if (!fileStorageService) {
			setSettings(createEmptyInitData().global)
			setIsLoading(false)
			return
		}

		setIsLoading(true)
		;(async () => {
			try {
				const loaded = await fileStorageService.loadBrandConfig()
				if (cancelled) return
				setSettings(loaded ?? createEmptyInitData().global)
			} catch {
				if (!cancelled) {
					setSettings(createEmptyInitData().global)
				}
			} finally {
				if (!cancelled) setIsLoading(false)
			}
		})()

		return () => {
			cancelled = true
		}
	}, [fileStorageService])

	const updateField = useCallback(
		(field: "author" | "brandPosition" | "targetAudience", value: string) => {
			setSettings((prev) => ({ ...prev, [field]: value }))
		},
		[],
	)

	const updateBrandImages = useCallback((brandImages: BrandImageItem[]) => {
		setSettings((prev) => ({ ...prev, brandImages }))
	}, [])

	const saveSettings = useCallback(
		async (nextSettings = settings) => {
			if (!fileStorageService) return
			setIsSaving(true)
			try {
				await fileStorageService.saveBrandConfig(nextSettings)
				setSettings(nextSettings)
			} catch {
				throw new Error("Failed to save self-media brand config")
			} finally {
				setIsSaving(false)
			}
		},
		[fileStorageService, settings],
	)

	return {
		settings,
		setSettings,
		updateField,
		updateBrandImages,
		saveSettings,
		isLoading,
		isSaving,
	}
}
