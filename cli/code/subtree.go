package code

import (
	"context"
	"fmt"
	"time"

	"go.yaml.in/yaml/v3"
)

type SubtreeSplit struct {
	Prefix string `yaml:"prefix"`

	DestURL string `yaml:"destURL"`
	Branch  string `yaml:"branch"`
	// DestBranch string
}

func tempBranchName(prefix string) string {
	return "mgaicrew-cli/" + prefix + "-" + time.Now().Format("20060102150405")
}

type SubtreeSpliter interface {
	Split(ctx context.Context, code *Code, subtreeSplit SubtreeSplit, force bool) error
}

type subtreeKind string

func NewSubtreeSpliter(node yaml.Node) (SubtreeSpliter, error) {
	type dummySubtreeSpliter struct {
		Kind subtreeKind `yaml:"kind"`
	}
	dummyCfg := dummySubtreeSpliter{}
	err := node.Decode(&dummyCfg)
	if err != nil {
		return nil, fmt.Errorf("failed to decode dummy subtree spliter config: %w", err)
	}

	switch dummyCfg.Kind {
	case subtreeKindCmd:
		return newSubtreeSpliterCmd(node)
	case subtreeKindLite:
		return newSubtreeSpliterLite(node)
	default:
		return nil, fmt.Errorf("unknown subtree spliter kind: %s", dummyCfg.Kind)
	}
}
