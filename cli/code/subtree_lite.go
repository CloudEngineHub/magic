package code

import (
	"context"
	"fmt"

	"go.yaml.in/yaml/v3"

	"github.com/go-git/go-git/v6"
	gitConfig "github.com/go-git/go-git/v6/config"
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

func newSubtreeSpliterLite(node yaml.Node) (subtreeSpliter, error) {
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
	err = remote.PushContext(ctx, &git.PushOptions{
		RemoteName: "anonymous",
		RemoteURL:  subtreeSplit.DestURL,
		RefSpecs: []gitConfig.RefSpec{
			gitConfig.RefSpec("refs/heads/" + splitedBranchName + ":refs/heads/" + subtreeSplit.Branch),
		},
	})
	if err != nil {
		return fmt.Errorf("failed to push to dest: %w", err)
	}

	return nil
}
