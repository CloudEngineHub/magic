import type { ShortcutDisplay } from "../../../public/props"
import { shortcutRegistry } from "../../interaction/shortcuts/ShortcutRegistry"

// 格式化单个修饰键（向后兼容）
export function formatShortcut(mod: string) {
	switch (mod) {
		case "ctrl":
			return "⌃"
		case "shift":
			return "⇧"
		case "alt":
			return "⌥"
		case "meta":
			return "⌘"
		case "mod":
			// 根据平台返回对应的符号
			return shortcutRegistry.getPlatform() === "mac" ? "⌘" : "Ctrl"
	}
	return mod
}

/**
 * 格式化完整快捷键显示
 */
export function formatShortcutDisplay(shortcut: ShortcutDisplay): string {
	const platform = shortcutRegistry.getPlatform()
	const modifiers = shortcut.modifiers || []

	const symbols = modifiers.map((mod) => {
		if (mod === "mod") {
			return platform === "mac" ? "⌘" : "Ctrl"
		}
		if (mod === "shift") return platform === "mac" ? "⇧" : "Shift"
		if (mod === "alt") return platform === "mac" ? "⌥" : "Alt"
		return mod
	})

	const keyDisplay = shortcut.key.toUpperCase()
	return [...symbols, keyDisplay].join(platform === "mac" ? "" : "+")
}

/**
 * 根据快捷键 ID 获取格式化的显示文本
 */
export function getShortcutDisplay(shortcutId: string): ShortcutDisplay | null {
	const definition = shortcutRegistry.get(shortcutId)
	if (!definition) {
		return null
	}

	return {
		key: definition.key,
		modifiers: definition.modifiers,
	}
}
