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
		/** Automatically hire a market crew when the embedded user cannot execute it. */
		autoHire?: boolean
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

	/** Lists runtime result event names whose routing contract is stable. */
	export type RuntimeEventName = "toolCall.settled" | "task.completed"

	/** Keeps the event envelope stable while leaving Magic Web-owned data opaque. */
	export interface RuntimeEventEnvelope<T extends RuntimeEventName> {
		type: T
		meta: Record<string, unknown>
		payload: unknown
	}

	/** Identifies a tool settlement without fixing its evolving business payload shape. */
	export type ToolCallSettledEvent = RuntimeEventEnvelope<"toolCall.settled">

	/** Identifies a task completion without fixing its evolving business payload shape. */
	export type TaskCompletedEvent = RuntimeEventEnvelope<"task.completed">

	/** Maps result event names to the exact payload delivered to host listeners. */
	export interface RuntimeEventMap {
		"toolCall.settled": ToolCallSettledEvent
		"task.completed": TaskCompletedEvent
	}

	export type RuntimeEvent = RuntimeEventMap[RuntimeEventName]
	export type RuntimeEventListener<T extends RuntimeEventName> = (
		event: RuntimeEventMap[T],
	) => void

	/** Lists lifecycle, UI state, and runtime result events exposed to the embedding host. */
	export type EventName = "agent_ready" | "preview_fullscreen" | RuntimeEventName
	/** Handles notifications that the current Agent editor and draft state are ready. */
	export type AgentReadyEventListener = () => void
	/**
	 * Handles complete snapshots of whether the Agent preview is using fullscreen presentation.
	 * @param isFullscreen Whether the current Agent preview is presented fullscreen.
	 */
	export type PreviewFullscreenEventListener = (isFullscreen: boolean) => void

	export interface Controller {
		mount(options: MountOptions): void
		open(): void
		close(): void
		destroy(): void
		/** Subscribes to Agent readiness and returns a function that removes the listener. */
		on(event: "agent_ready", listener: AgentReadyEventListener): () => void
		/**
		 * Subscribes to preview fullscreen state and immediately replays the current boolean snapshot.
		 * The host owns any container resizing or fullscreen styling triggered by this state.
		 */
		on(event: "preview_fullscreen", listener: PreviewFullscreenEventListener): () => void
		/** Subscribes to future tool settlements without replaying earlier results. */
		on(
			event: "toolCall.settled",
			listener: RuntimeEventListener<"toolCall.settled">,
		): () => void
		/** Subscribes to future task completion events without replaying earlier results. */
		on(event: "task.completed", listener: RuntimeEventListener<"task.completed">): () => void
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
