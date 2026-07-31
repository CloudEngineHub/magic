type CustomLoginStrategy = string & {
	readonly __magicWidgetLoginStrategyBrand?: never
}

export declare namespace MagicWidget {
	export type LoginStrategy =
		| "phone_captcha"
		| "email"
		| "phone_password"
		| "DingTalk"
		| "DingTalkAvoid"
		| "wecom"
		| "Lark"
		| "wechat_official_account"
		| "redirect"
		| "apple_login"
		| "google_login"
		| "anta_login"
		| "private_deployment"
		| CustomLoginStrategy

	export type QueryValue =
		| string
		| number
		| boolean
		| null
		| undefined
		| Array<string | number | boolean | null | undefined>

	export interface AuthOptions {
		loginStrategy?: LoginStrategy
		deploymentCode?: string
		organizationCode?: string
	}

	export interface IframeOptions {
		allow?: string
		sandbox?: string
		query?: Record<string, QueryValue>
	}

	export type Layout = "desktop" | "mobile"

	export interface ShellConfig {
		appSidebar?: boolean
	}

	export type MobileDetection = "viewport" | "device-and-viewport"

	export interface ResponsiveConfig {
		/** Selects viewport-only or device-and-viewport mobile semantics. */
		mobileDetection?: MobileDetection
	}

	/** Controls how Agent previews share the desktop viewport with the conversation. */
	export type PreviewMode = "split" | "fullscreen" | "switchable"

	export interface ConversationConfig {
		projectFiles?: boolean
		topicHistory?: boolean
		/** Selects split, host-container fullscreen, or user-switchable preview presentation. */
		previewMode?: PreviewMode
	}

	export interface WidgetConfig {
		layout?: Layout
		shell?: ShellConfig
		conversation?: ConversationConfig
		responsive?: ResponsiveConfig
	}

	export interface CrewPageOptions {
		type: "crew"
		crewId: string
	}

	export type PageOptions = CrewPageOptions

	export type ModalSlot =
		"root" | "layer" | "mask" | "container" | "header" | "title" | "close" | "body" | "iframe"

	export type ModalClassNames = Partial<Record<ModalSlot, string>>

	export type ModalStyles = Partial<
		Record<ModalSlot, Record<string, string | number | null | undefined>>
	>

	export interface ModalOptions {
		title?: string
		width?: number | string
		height?: number | string
		classNames?: ModalClassNames
		styles?: ModalStyles
	}

	export interface MountOptions {
		page: PageOptions
		auth?: AuthOptions
		config?: WidgetConfig
		iframe?: IframeOptions
		modal?: ModalOptions
		target?: HTMLElement
	}

	export type CommandErrorCode =
		| "NOT_MOUNTED"
		| "INVALID_INPUT"
		| "INVALID_CONFIG"
		| "IFRAME_NOT_READY"
		| "COMMAND_FAILED"
		| "DESTROYED"

	export interface CommandError extends Error {
		code: CommandErrorCode
	}

	export type EventName = "agent_ready" | "preview_fullscreen"
	export type AgentReadyEventListener = () => void
	export type PreviewFullscreenEventListener = (isFullscreen: boolean) => void

	export interface Controller {
		mount(options: MountOptions): void
		open(): void
		close(): void
		destroy(): void
		on(event: "agent_ready", listener: AgentReadyEventListener): () => void
		on(event: "preview_fullscreen", listener: PreviewFullscreenEventListener): () => void
		setInput(content: string): Promise<void>
		appendInput(content: string): Promise<void>
		clearInput(): Promise<void>
		getInput(): Promise<string>
		sendMessage(content: string): Promise<void>
		newConversation(): Promise<void>
		updateConfig(config: Partial<WidgetConfig>): Promise<void>
	}

	export interface Global extends Controller {
		version: string
	}
}
