package util

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/go-git/go-billy/v6/osfs"
	"github.com/go-git/go-git/v6"
	"github.com/go-git/go-git/v6/plumbing"
	gitClient "github.com/go-git/go-git/v6/plumbing/client"
	gitHttp "github.com/go-git/go-git/v6/plumbing/transport/http"
	"github.com/go-git/go-git/v6/storage/filesystem"
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
		if stat, err := os.Stat(filepath.Join(dir, "HEAD")); err != nil || stat.IsDir() {
			return false
		}
		if stat, err := os.Stat(filepath.Join(dir, "objects")); err != nil || !stat.IsDir() {
			return false
		}
		if stat, err := os.Stat(filepath.Join(dir, "refs")); err != nil || !stat.IsDir() {
			return false
		}
		return true
	}

	if isGitDir(dir) {
		// bare repo
		return fmt.Errorf("already exist")
	}
	if isGitDir(filepath.Join(dir, ".git")) {
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

func GetGoGitRepoGitDir(repo *git.Repository) string {
	if repo == nil {
		// ??
		return ""
	}
	if fsStorage, ok := repo.Storer.(*filesystem.Storage); ok {
		billyFs := fsStorage.Filesystem()
		_, isBoundOS := billyFs.(*osfs.BoundOS)
		_, isRootOS := billyFs.(*osfs.RootOS)
		if isBoundOS || isRootOS {
			// is osfs
			return filepath.Clean(billyFs.Root())
		}
	}
	return ""
}

func GetGitHTTPCredential(
	ctx context.Context,
	repo *git.Repository,
	proto string,
	host string,
) (gitClient.HTTPAuth, error) {
	if proto != "http" && proto != "https" {
		return nil, fmt.Errorf("not implemented protocol: %s", proto)
	}

	// prepare environments
	env := map[string]string{}
	for _, environ := range os.Environ() {
		pair := strings.SplitN(environ, "=", 2)
		env[pair[0]] = pair[1]
	}
	// GIT_DIR
	env["GIT_DIR"] = GetGoGitRepoGitDir(repo)
	// GIT_WORK_DIR
	// TODO

	// execute helper
	input := bytes.NewBufferString(fmt.Sprintf("protocol=%s\nhost=%s\n", proto, host))
	output := bytes.NewBuffer(nil)
	cmd := Command{
		Args: []string{
			"git",
			"credential",
			"fill",
		},
		Env:    env,
		Stdin:  input,
		Stdout: output,
		Stderr: os.Stderr,
	}
	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	err := cmd.Run(timeoutCtx)
	if err != nil {
		return nil, fmt.Errorf("failed exec cred helper: %w", err)
	}

	// parse output
	scanner := bufio.NewScanner(output)
	var username, password string
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])

		switch key {
		case "username":
			username = val
		case "password":
			password = val
		}
	}
	if password == "" {
		return nil, fmt.Errorf("credential helper gives no password")
	}

	cred := &gitHttp.BasicAuth{
		Username: username,
		Password: password,
	}
	return cred, nil
}
