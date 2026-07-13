package code

import (
	"context"
	"errors"
	"fmt"
	"regexp"

	"go.yaml.in/yaml/v3"

	"github.com/dtyq/magicrew-cli/util"
	"github.com/go-git/go-git/v6"
	gitConfig "github.com/go-git/go-git/v6/config"
	"github.com/go-git/go-git/v6/plumbing"
	gitClient "github.com/go-git/go-git/v6/plumbing/client"
	"github.com/splitsh/lite/splitter"
)

var subtreeKindLite subtreeKind = "lite"

type subtreeSpliterLite struct {
	Kind        subtreeKind `yaml:"kind"`    // "lite"
	Scratch     bool        `yaml:"scratch"` // with no cache
	Debug       bool        `yaml:"debug"`
	GitVersion  string      `yaml:"gitVersion"`
	ShowHEADRev bool        `yaml:"showHEADRev"`
}

func newSubtreeSpliterLite(node yaml.Node) (SubtreeSpliter, error) {
	s := subtreeSpliterLite{}
	err := node.Decode(&s)
	if err != nil {
		return nil, fmt.Errorf("failed to decode subtree spliter cmd config: %w", err)
	}

	if s.GitVersion == "" {
		s.GitVersion = "latest"
	}
	return &s, nil
}

func (s *subtreeSpliterLite) Split(ctx context.Context, code *Code, subtreeSplit SubtreeSplit, force bool) error {
	var err error

	splitedBranchName := tempBranchName("split")
	// localRemoteBranchName := tempBranchName("remote")

	if subtreeSplit.Branch == "" {
		subtreeSplit.Branch = "HEAD"
	}

	// split into a new branch
	config := splitter.Config{
		Path:   code.BaseDir,
		Origin: "refs/heads/" + subtreeSplit.Branch,
		Prefixes: []*splitter.Prefix{
			splitter.NewPrefix(subtreeSplit.Prefix, "", []string{}),
		},
		Target:     "refs/heads/" + splitedBranchName,
		Commit:     "",
		Debug:      s.Debug,
		Scratch:    s.Scratch,
		GitVersion: s.GitVersion,
	}
	result := splitter.Result{}

	err = splitter.Split(&config, &result)
	if err != nil {
		return fmt.Errorf("failed to split subtree: %w", err)
	}
	defer func() {
		// clean up splited branch
		refName := plumbing.NewBranchReferenceName(splitedBranchName)
		_ = code.Repository.Storer.RemoveReference(refName)
		// best effort, no check
	}()

	if s.ShowHEADRev {
		fmt.Printf("%s\n", result.Head().String())
	}

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
