import { fireEvent, render, screen } from "@testing-library/react"
import { vi } from "vitest"

import type { ScheduledTask } from "@/types/scheduledTask"

import MicroAppScheduledTaskItem from "../MicroAppScheduledTaskItem"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("antd", () => ({
	Switch: ({
		checked,
		onChange,
	}: {
		checked?: boolean
		onChange?: (checked: boolean) => void
	}) => (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			onClick={() => onChange?.(!checked)}
		/>
	),
}))

describe("MicroAppScheduledTaskItem", () => {
	const task = {
		id: "task-1",
		enabled: 1,
		task_name: "测试任务",
		time_config: { type: "daily_repeat", time: "11:00" },
		topic_name: "测试话题",
	} as ScheduledTask.Task

	it("点击任务卡片时打开任务配置", () => {
		const onClick = vi.fn()

		render(<MicroAppScheduledTaskItem data={task} onClick={onClick} onSwitchChange={vi.fn()} />)

		fireEvent.click(screen.getByTestId("micro-app-scheduled-task-item"))

		expect(onClick).toHaveBeenCalledTimes(1)
	})

	it("切换任务状态时不打开任务配置", () => {
		const onClick = vi.fn()

		render(<MicroAppScheduledTaskItem data={task} onClick={onClick} onSwitchChange={vi.fn()} />)

		fireEvent.click(screen.getByRole("switch"))

		expect(onClick).not.toHaveBeenCalled()
	})
})
