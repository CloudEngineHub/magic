package cli

import (
	"context"
	"fmt"
	"strings"

	"github.com/dtyq/magicrew-cli/code"
	"github.com/dtyq/magicrew-cli/i18n"
	"github.com/dtyq/magicrew-cli/util"
	"github.com/spf13/cobra"
)

var (
	subtreeCmd = &cobra.Command{
		Use:   "subtree",
		Short: i18n.L("subtreeCommandShort"),
		Run: func(cmd *cobra.Command, args []string) {
			cmd.Help()
		},
	}

	subtreePublishCmd = &cobra.Command{
		Use:                   "publish [names]",
		DisableFlagsInUseLine: true,
		Short:                 i18n.L("subtreePublishCommandShort"),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := context.Background()
			codeBase, err := code.FindMagicrew(".")
			if err != nil || codeBase.Repository == nil {
				lg.Loge("subtree", "failed to find magicrew: %v", err)
				return fmt.Errorf("failed to find magicrew: %v", err)
			}

			err = codeBase.Chdir()
			if err != nil {
				lg.Loge("subtree", "failed to chdir to magicrew: %v", err)
				return fmt.Errorf("failed to chdir to magicrew: %v", err)
			}

			magicrewStructure, err := codeBase.ReadStructure()
			if err != nil {
				lg.Loge("subtree", "failed to read magicrew structure: %v", err)
				return fmt.Errorf("failed to read magicrew structure: %v", err)
			}

			spliter, err := code.NewSubtreeSpliter(cfg.Subtree.Spliter)
			if err != nil {
				lg.Loge("subtree", "failed to create subtree spliter: %v", err)
				return fmt.Errorf("failed to create subtree spliter: %v", err)
			}

			splits := map[string]code.SubtreeSplit{}

			all, err := cmd.Flags().GetBool("all")
			if err != nil {
				return fmt.Errorf("failed to get flag: %v", err)
			}
			if all {
				splits = magicrewStructure.Subtrees
			} else {
				for _, name := range args {
					split, ok := magicrewStructure.Subtrees[name]
					if !ok {
						lg.Loge("subtree", "%s", i18n.L("errorSubtreePublishNoSuchSubtree", name))
						return fmt.Errorf("no such subtree: %s", name)
					}
					splits[name] = split
				}
			}

			if len(splits) == 0 {
				lg.Loge("subtree", "%s", i18n.L("errorSubtreePublishNoSubtreeToPublish"))
				cmd.Help()
				return fmt.Errorf("invalid arg")
			}

			// override destURL by flag
			destURL, err := cmd.Flags().GetString("dest-url")
			if err != nil {
				return fmt.Errorf("failed to get flag: %v", err)
			}
			if destURL != "" {
				if len(splits) != 1 {
					lg.Loge("subtree", "%s", i18n.L("errorSubtreePublishOnlyOneSubtreeAllowed"))
					return fmt.Errorf("invalid arg")
				}
			}

			// setup destURL by destGitBase
			destGitBase, err := cmd.Flags().GetString("dest-git-base")
			if err != nil {
				return fmt.Errorf("failed to get flag: %v", err)
			}
			if destGitBase == "" {
				// use config value
				destGitBase = cfg.Subtree.DestGitBase
			}

			if destGitBase == "" && destURL == "" {
				lg.Loge("subtree", "%s", i18n.L("errorSubtreePublishBothDestGitBaseDestURLNotSet"))
				return fmt.Errorf("failed to get flag: %v", err)
			}

			// setup dest branch
			branch, err := cmd.Flags().GetString("branch")
			if err != nil {
				return fmt.Errorf("failed to get flag: %v", err)
			}
			if branch == "" {
				branch = cfg.Subtree.Branch
			}
			if branch == "" {
				branch = "master"
			}

			// force or not
			force, err := cmd.Flags().GetBool("force")
			if err != nil {
				return fmt.Errorf("failed to get flag: %v", err)
			}

			// init local repo type
			initType, err := cmd.Flags().GetString("init")
			if err != nil {
				return fmt.Errorf("failed to get flag: %v", err)
			}
			if initType != "worktree" && initType != "bare" && initType != "none" {
				lg.Loge("subtree", "%s", i18n.L("errorSubtreePublishBadInitType", initType))
				cmd.Help()
				return fmt.Errorf("invalid arg")
			}

			for name, split := range splits {
				if split.DestURL == "" && destGitBase != "" {
					// join path with "/" ignoring os
					// (we donot support vmx things, so "/" is universal)
					split.DestURL = strings.TrimRight(destGitBase, "/\\") + "/" + name
				}
				if destURL != "" {
					split.DestURL = destURL
				}
				if initType != "none" {
					if localPath := util.GitURLLocalPath(split.DestURL); localPath != "" {
						// best effort, no check
						err := util.InitEmptyGitRepo(util.NormalizePath(localPath), initType == "bare")
						lg.Logd("subtree", "init repo at %s: %v", localPath, err)
					}
				}
				split.Branch = branch

				lg.Logi("subtree", "%s", i18n.L("doSubtreeSplitFor", name))
				lg.Logd("subtree", "[%s] %s => %s(%s)", name, split.Prefix, split.DestURL, split.Branch)
				err = spliter.Split(ctx, codeBase, split, force)
				if err != nil {
					lg.Loge("subtree", "%s", i18n.L("errorFailedSplit", err))
					return err
				}
			}

			return nil
		},
	}
)

func init() {
	subtreeCmd.Flags().BoolP("help", "h", false, i18n.L("cobraHelpFor", "subtree"))
	rootCmd.AddCommand(subtreeCmd)

	subtreePublishCmd.Flags().BoolP("all", "a", false, i18n.L("subtreePublishCommandArgAllHelp"))
	subtreePublishCmd.Flags().String("dest-url", "", i18n.L("subtreePublishCommandArgDestURLHelp"))
	subtreePublishCmd.Flags().String("dest-git-base", "", i18n.L("subtreePublishCommandArgDestGitBaseHelp"))
	subtreePublishCmd.Flags().String("init", "none", i18n.L("subtreePublishCommandArgInitHelp"))
	subtreePublishCmd.Flags().StringP("branch", "b", "", i18n.L("subtreePublishCommandArgBranchHelp"))
	subtreePublishCmd.Flags().BoolP("force", "f", false, i18n.L("subtreePublishCommandArgForceHelp"))
	subtreePublishCmd.Flags().BoolP("help", "h", false, i18n.L("cobraHelpFor", "subtree publish"))

	subtreeCmd.AddCommand(subtreePublishCmd)
}
