import TopicFilesButton, {
	type TopicFilesButtonProps,
} from "@/pages/superMagic/components/TopicFilesButton"

interface SkillFilesPanelProps extends Omit<TopicFilesButtonProps, "allowEdit" | "isInProject"> {
	readOnly: boolean
}

/** Skill 编辑页的附件权限入口，统一把项目角色转换为文件编辑能力。 */
function SkillFilesPanel({ readOnly, ...props }: SkillFilesPanelProps) {
	return <TopicFilesButton {...props} allowEdit={!readOnly} isInProject />
}

export default SkillFilesPanel
