package code

import (
	"context"
	"fmt"
	mathRand "math/rand/v2"
	"os"
	"os/exec"
	"path"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/go-git/go-git/v6"
	"github.com/go-git/go-git/v6/plumbing"
	gitObject "github.com/go-git/go-git/v6/plumbing/object"
	"github.com/stretchr/testify/assert"
	"go.yaml.in/yaml/v3"
)

func makeTestRepo(t *testing.T, repoDir string) {
	// do not set seed (use zeros)
	// there's a bug (maybe feature) related to splitsh-lite:
	// https://github.com/splitsh/lite/issues/88
	seed := [32]byte{}
	// _, err := rand.Read(seed[:])
	// if !assert.NoError(t, err) {
	// 	t.FailNow()
	// }
	// fmt.Printf("seed: %x\n", seed)

	mathRng := mathRand.NewChaCha8(seed)

	repo, err := git.PlainInit(
		repoDir,
		false,
		git.WithDefaultBranch(plumbing.ReferenceName("refs/heads/test")),
	)
	if !assert.NoError(t, err) {
		t.FailNow()
	}
	defer repo.Close()
	worktree, err := repo.Worktree()
	if !assert.NoError(t, err) {
		t.FailNow()
	}
	fakeCommitter := &gitObject.Signature{
		Name:  "Test User",
		Email: "dev+magicrew-cli-test@magicrew.ai",
		When:  time.Now(),
	}

	// make fake empty magicrew.yml
	err = os.WriteFile(path.Join(repoDir, "magicrew.yml"), []byte("# stub for test\n"), 0644)
	if !assert.NoError(t, err) {
		t.FailNow()
	}
	_, err = worktree.Add("magicrew.yml")
	if !assert.NoError(t, err) {
		t.FailNow()
	}
	_, err = worktree.Commit("Initial commit", &git.CommitOptions{
		Author:    fakeCommitter,
		Committer: fakeCommitter,
	})
	if !assert.NoError(t, err) {
		t.FailNow()
	}

	// create fake commits
	for range 64 {
		subdir := fmt.Sprintf("project%d", mathRng.Uint64()%4)
		fileNames := []string{
			"project.go",
			"init.py",
			"Readme.md",
			"util.c",
			"42.php",
		}
		file := fileNames[mathRng.Uint64()%uint64(len(fileNames))]
		action := "modify"
		if mathRng.Uint64()%2 == 0 {
			action = "delete"
		}
		var content string
		switch {
		case strings.HasSuffix(file, ".go"):
			content = fmt.Sprintf("package %s\n// test file for subtree test\nconst someFakeVar = %d\n", subdir, mathRng.Uint64())
		case strings.HasSuffix(file, ".py"):
			content = fmt.Sprintf("# test file for subtree test\nSOME_FAKE_VAR = %d\n", mathRng.Uint64())
		case strings.HasSuffix(file, ".md"):
			content = fmt.Sprintf("# test subdir %s\n\nfor subtree test\n\n```\n%d\n```", subdir, mathRng.Uint64())
		case strings.HasSuffix(file, ".c"):
			content = fmt.Sprintf("//for subtree test\n\n#include <stdint.h>\n\nconst uint64_t someFakeVar = %d\n```", mathRng.Uint64())
		case strings.HasSuffix(file, ".php"):
			content = fmt.Sprintf("<?php\n//for subtree test\n\nconst $someFakeVar = %d;\n```", mathRng.Uint64())
		default:
			// wtf?
			t.Fatalf("wtf")
		}

		err = os.MkdirAll(path.Join(repoDir, subdir), 0755)
		if !assert.NoError(t, err) {
			t.FailNow()
		}

		switch action {
		case "modify":
			err = os.WriteFile(path.Join(repoDir, subdir, file), []byte(content), 0644)
			if !assert.NoError(t, err) {
				t.FailNow()
			}
		case "delete":
			if _, err = os.Stat(path.Join(repoDir, subdir, file)); err != nil {
				err = os.WriteFile(path.Join(repoDir, subdir, file), []byte(content), 0644)
				if !assert.NoError(t, err) {
					t.FailNow()
				}
			} else {
				err = os.Remove(path.Join(repoDir, subdir, file))
				if !assert.NoError(t, err) {
					t.FailNow()
				}
			}
		}

		_, err = worktree.Add(path.Join(subdir, file))
		if !assert.NoError(t, err) {
			t.FailNow()
		}

		_, err = worktree.Commit(fmt.Sprintf("%s/chore: fake commit", subdir), &git.CommitOptions{
			Author:    fakeCommitter,
			Committer: fakeCommitter,
		})
		if !assert.NoError(t, err) {
			t.FailNow()
		}
	}
}

func TestSubtree(t *testing.T) {
	var err error

	if runtime.GOOS != "linux" {
		t.Skipf("this test is only designed for linux")
	}

	var codeDir, prefix, mainRepoBranch string
	codeDir = os.Getenv("MAGICREW_CLI_TEST_SUBTREE_CODE_DIR")
	if codeDir == "" {
		tempWorktreeDir, err := os.MkdirTemp("/tmp", "magicrew-cli-test-code-subtree-")
		if !assert.NoError(t, err) {
			t.FailNow()
		}
		defer os.RemoveAll(tempWorktreeDir)
		makeTestRepo(t, tempWorktreeDir)
		codeDir = tempWorktreeDir
		entries, err := os.ReadDir(tempWorktreeDir)
		if !assert.NoError(t, err) {
			t.FailNow()
		}
		for _, dir := range entries {
			if strings.HasPrefix(dir.Name(), "project") {
				prefix = dir.Name()
				break
			}
		}
		mainRepoBranch = "test"
	} else {
		prefix = os.Getenv("MAGICREW_CLI_TEST_SUBTREE_PREFIX")
		if prefix == "" {
			t.Skip("Skipping MAGICREW_CLI_TEST_SUBTREE_PREFIX is not set")
		}
		mainRepoBranch = os.Getenv("MAGICREW_CLI_TEST_SUBTREE_MAIN_REPO_BRANCH")
		if mainRepoBranch == "" {
			t.Skip("Skipping MAGICREW_CLI_TEST_SUBTREE_MAIN_REPO_BRANCH is not set")
		}
	}

	testRepo, err := git.PlainOpen(codeDir)
	if !assert.NoError(t, err) {
		t.FailNow()
	}

	code := &Code{
		BaseDir:    codeDir,
		Repository: testRepo,
	}

	// prepare dest dir
	tempDestDir, err := os.MkdirTemp("/tmp", "magicrew-cli-test-code-subtree-dest-")
	if !assert.NoError(t, err) {
		t.FailNow()
	}
	defer os.RemoveAll(tempDestDir)

	testSpliter := func(t *testing.T, spliter SubtreeSpliter) {
		subtreeSplit := SubtreeSplit{
			Prefix:  prefix,
			DestURL: tempDestDir,
			Branch:  mainRepoBranch,
		}
		// reinit dest git dir
		err = os.RemoveAll(path.Join(tempDestDir, ".git"))
		if !assert.NoError(t, err) {
			t.FailNow()
		}
		destGit, err := git.PlainInit(
			tempDestDir,
			false,
		)
		if !assert.NoError(t, err) {
			t.FailNow()
		}
		defer destGit.Close()

		err = spliter.Split(context.Background(), code, subtreeSplit, false)
		if !assert.NoError(t, err) {
			t.Fatalf("failed to split subtree: %v", err)
		}

		destRepoBranch, err := destGit.Reference(plumbing.NewBranchReferenceName("test"), true)
		if !assert.NoError(t, err) {
			t.Fatalf("destRepoBranch not created: %v", err)
		}

		commitIter, err := destGit.Log(&git.LogOptions{
			From: destRepoBranch.Hash(),
		})
		if !assert.NoError(t, err) {
			t.Fatalf("git log failed: %v", err)
		}

		err = commitIter.ForEach(func(c *gitObject.Commit) error {
			// assert commit message is starts with subdir
			if !assert.True(t, strings.HasPrefix(c.Message, prefix)) {
				return fmt.Errorf("commit %s have bad message %s", c.Hash.String(), c.Message)
			}
			return nil
		})
		if !assert.NoError(t, err) {
			t.Fatalf("bad commit: %v", err)
		}
	}

	t.Run("CmdGit", func(t *testing.T) {

		testConfigStr := `
kind: cmd
cmdKind: git
`

		var testConfig yaml.Node
		err = yaml.Unmarshal([]byte(testConfigStr), &testConfig)
		if !assert.NoError(t, err) {
			t.Fatalf("failed to unmarshal test config: %v", err)
		}

		spliter, err := NewSubtreeSpliter(testConfig)
		if !assert.NoError(t, err) {
			t.Fatalf("failed to create subtree spliter: %v", err)
		}

		testSpliter(t, spliter)
	})

	t.Run("CmdSplitshLite", func(t *testing.T) {
		var err error
		splitshLitePath := os.Getenv("MAGICREW_CLI_TEST_SPLITSH_LITE")
		if splitshLitePath == "" {
			splitshLitePath, err = exec.LookPath("splitsh-lite")
			if err != nil {
				t.Skip("skip without splitsh-lite")
			}
		}

		testConfigStr := `
kind: cmd
cmdKind: splitsh-lite
cmdPath: "` + splitshLitePath + `"
`

		var testConfig yaml.Node
		err = yaml.Unmarshal([]byte(testConfigStr), &testConfig)
		if !assert.NoError(t, err) {
			t.Fatalf("failed to unmarshal test config: %v", err)
		}

		spliter, err := NewSubtreeSpliter(testConfig)
		if !assert.NoError(t, err) {
			t.Fatalf("failed to create subtree spliter: %v", err)
		}

		testSpliter(t, spliter)
	})

	t.Run("Lite", func(t *testing.T) {
		var err error

		testConfigStr := `
kind: lite
showHEADRev: true
`

		var testConfig yaml.Node
		err = yaml.Unmarshal([]byte(testConfigStr), &testConfig)
		if !assert.NoError(t, err) {
			t.Fatalf("failed to unmarshal test config: %v", err)
		}

		spliter, err := NewSubtreeSpliter(testConfig)
		if !assert.NoError(t, err) {
			t.Fatalf("failed to create subtree spliter: %v", err)
		}

		testSpliter(t, spliter)
	})
}
