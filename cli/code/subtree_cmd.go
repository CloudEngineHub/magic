package code

import (
	"context"
	"errors"
	"fmt"
	"os"
	"regexp"

	"go.yaml.in/yaml/v3"

	"github.com/dtyq/magicrew-cli/util"
	"github.com/go-git/go-git/v6"
	gitConfig "github.com/go-git/go-git/v6/config"
	"github.com/go-git/go-git/v6/plumbing"
	gitClient "github.com/go-git/go-git/v6/plumbing/client"
)

var subtreeKindCmd subtreeKind = "cmd"

type subtreeSpliterCmdKind string

var (
	subtreeSpliterCmdKindGit         subtreeSpliterCmdKind = "git"
	subtreeSpliterCmdKindSplitshLite subtreeSpliterCmdKind = "splitsh-lite"
)

type subtreeSpliterCmd struct {
	Kind    subtreeKind           `yaml:"kind"`
	CmdKind subtreeSpliterCmdKind `yaml:"cmdKind"`
	CmdPath string                `yaml:"cmdPath"`
	// for splitsh-lite
	Scratch bool `yaml:"scratch"` // with no cache
}

func newSubtreeSpliterCmd(node yaml.Node) (SubtreeSpliter, error) {
	s := subtreeSpliterCmd{}
	err := node.Decode(&s)
	if err != nil {
		return nil, fmt.Errorf("failed to decode subtree spliter cmd config: %w", err)
	}

	if s.CmdKind == "" {
		s.CmdKind = subtreeSpliterCmdKindGit
	}

	if s.CmdPath == "" {
		switch s.CmdKind {
		case subtreeSpliterCmdKindGit:
			s.CmdPath = "git"
		case subtreeSpliterCmdKindSplitshLite:
			s.CmdPath = "splitsh-lite"
		}
	}

	return &s, nil
}

func (s *subtreeSpliterCmd) Split(ctx context.Context, code *Code, subtreeSplit SubtreeSplit, force bool) error {
	var err error

	splitedBranchName := tempBranchName("split")
	// localRemoteBranchName := tempBranchName("remote")

	if subtreeSplit.Branch == "" {
		subtreeSplit.Branch = "HEAD"
	}

	// split into a new branch
	splitCommand := util.Command{
		Dir:    code.BaseDir,
		Stdout: os.Stdout,
		Stderr: os.Stderr,
	}
	switch s.CmdKind {
	case subtreeSpliterCmdKindGit:
		// use git subtree split
		splitCommand.Args = []string{
			s.CmdPath,
			// "-c", "diff.renameLimit=8192",
			"subtree", "split",
			"--prefix", subtreeSplit.Prefix,
			"--branch", splitedBranchName,
			subtreeSplit.Branch,
		}
	case subtreeSpliterCmdKindSplitshLite:
		splitCommand.Args = []string{
			s.CmdPath,
			"-prefix", subtreeSplit.Prefix,
			"-target", "refs/heads/" + splitedBranchName,
			"-origin", "refs/heads/" + subtreeSplit.Branch,
		}
		if s.Scratch {
			splitCommand.Args = append(splitCommand.Args, "--scratch")
		}
	}
	err = splitCommand.Run(ctx)
	if err != nil {
		return fmt.Errorf("failed to split subtree: %w", err)
	}
	defer func() {
		// clean up splited branch
		refName := plumbing.NewBranchReferenceName(splitedBranchName)
		_ = code.Repository.Storer.RemoveReference(refName)
		// best effort, no check
	}()

	// create remote for push
	remote, err := code.Repository.CreateRemoteAnonymous(&gitConfig.RemoteConfig{
		Name: "anonymous",
		URLs: []string{subtreeSplit.DestURL},
	})
	if err != nil {
		return fmt.Errorf("failed to create anonymous remote: %w", err)
	}

	// push to dest
	options := &git.PushOptions{
		RemoteName: "anonymous",
		RemoteURL:  subtreeSplit.DestURL,
		RefSpecs: []gitConfig.RefSpec{
			gitConfig.RefSpec("refs/heads/" + splitedBranchName + ":refs/heads/" + subtreeSplit.Branch),
		},
		Force: force,
	}
	urlRe := regexp.MustCompile("^(https{0,1})://([^/]+).+")
	if groups := urlRe.FindStringSubmatch(subtreeSplit.DestURL); len(groups) > 2 {
		cred, err := util.GetGitHTTPCredential(ctx, code.Repository, groups[1], groups[2])
		if err == nil && cred != nil {
			options.ClientOptions = []gitClient.Option{
				gitClient.WithHTTPAuth(cred),
			}
		}
	}
	err = remote.PushContext(ctx, options)
	if err != nil && !errors.Is(err, git.NoErrAlreadyUpToDate) {
		return fmt.Errorf("failed to push to dest: %w", err)
	}

	return nil
}
