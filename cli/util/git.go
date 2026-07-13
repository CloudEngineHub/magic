package util

import (
	"fmt"
	"os"
	"path"
	"regexp"
	"strings"

	"github.com/go-git/go-git/v6"
	"github.com/go-git/go-git/v6/plumbing"
)

func GitURLLocalPath(u string) string {
	// try parse it with url format
	var urlRegex = regexp.MustCompile(`^([^:]+)://(.*)$`)
	if groups := urlRegex.FindStringSubmatch(u); len(groups) > 2 {
		parts := strings.Split(groups[1], "+")
		if parts[len(parts)-1] == "file" {
			return groups[2]
		}
		// not a file:// url
		return ""
	}

	// check if it's a short scp style path
	var scpSshRegex = regexp.MustCompile(`^([^@]+)@([^:]+):(.*)$`)
	if scpSshRegex.Match([]byte(u)) {
		return ""
	}

	// otherwise, it's local path
	return u
}

func InitEmptyGitRepo(dir string, bare bool) error {
	isGitDir := func(dir string) bool {
		if stat, err := os.Stat(path.Join(dir, "HEAD")); err != nil || stat.IsDir() {
			return false
		}
		if stat, err := os.Stat(path.Join(dir, "objects")); err != nil || !stat.IsDir() {
			return false
		}
		if stat, err := os.Stat(path.Join(dir, "refs")); err != nil || !stat.IsDir() {
			return false
		}
		return true
	}

	if isGitDir(dir) {
		// bare repo
		return fmt.Errorf("already exist")
	}
	if isGitDir(path.Join(dir, ".git")) {
		// worktree repo
		return fmt.Errorf("already exist")
	}

	repo, err := git.PlainInit(dir, bare, git.WithDefaultBranch(plumbing.ReferenceName("refs/heads/latest")))
	if err != nil {
		return err
	}
	repo.Close()

	return nil
}
