package util

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/go-git/go-git/v6"
	gitHttp "github.com/go-git/go-git/v6/plumbing/transport/http"
	"github.com/go-git/go-git/v6/storage/memory"
	"github.com/stretchr/testify/assert"
)

func TestGitURLLocalPath(t *testing.T) {
	testCases := []struct {
		url  string
		path string
	}{
		{
			url:  "https://github.com/octocat/Hello-World",
			path: "",
		},
		{
			url:  "https://github.com/octocat/Hello-World.git",
			path: "",
		},
		{
			url:  "git@github.com:octocat/Hello-World.git",
			path: "",
		},
		{
			url:  "../../a/.git",
			path: "../../a/.git",
		},
		{
			url:  "../.git",
			path: "../.git",
		},
		{
			url:  "somerepo",
			path: "somerepo",
		},
		{
			url:  "D:\\somerepo",
			path: "D:\\somerepo",
		},
		{
			url:  "D:/somerepo",
			path: "D:/somerepo",
		},
		{
			url:  "\\\\.\\D:\\somerepo",
			path: "\\\\.\\D:\\somerepo",
		},
		{
			url:  "git+ssh://git@github.com:octocat/Hello-World.git",
			path: "",
		},
		{
			url:  "git+file:///path/to/repo",
			path: "/path/to/repo",
		},
		{
			url:  "git+file:///path/to/repo#cafebabe",
			path: "/path/to/repo#cafebabe",
		},
		{
			url:  "file:///path/to/repo?this=is&filename",
			path: "/path/to/repo?this=is&filename",
		},
		{
			url:  "file://",
			path: "",
		},
		{
			url:  "file://D:\\somerepo",
			path: "D:\\somerepo",
		},
		{
			url:  "file://D:/somerepo",
			path: "D:/somerepo",
		},
		{
			url:  "git+file://",
			path: "",
		},
	}

	for i, tc := range testCases {
		t.Run(fmt.Sprintf("%d", i), func(t *testing.T) {
			got := GitURLLocalPath(tc.url)
			assert.Equal(t, tc.path, got, "GitURLLocalPath(%s) is no expected", tc.url)
		})
	}
}

func TestGetGoGitRepoGitDir(t *testing.T) {
	t.Run("NotOSRepo", func(t *testing.T) {
		storer := memory.NewStorage()
		// worktreeFs := memfs.New()
		repo, err := git.Init(storer, git.WithDefaultBranch("refs/heads/latest"))
		if !assert.NoError(t, err) {
			t.FailNow()
		}
		defer repo.Close()

		assert.Empty(t, GetGoGitRepoGitDir(repo))
	})
	t.Run("Worktree", func(t *testing.T) {
		tmpdir := t.TempDir()
		repo, err := git.PlainInit(tmpdir, false, git.WithDefaultBranch("refs/heads/latest"))
		if !assert.NoError(t, err) {
			t.FailNow()
		}

		assert.NotEmpty(t, GetGoGitRepoGitDir(repo))
		assert.DirExists(t, GetGoGitRepoGitDir(repo))
		assert.DirExists(t, fmt.Sprintf("%s/objects", GetGoGitRepoGitDir(repo)))
	})
	t.Run("Bare", func(t *testing.T) {
		tmpdir := t.TempDir()
		repo, err := git.PlainInit(tmpdir, true, git.WithDefaultBranch("refs/heads/latest"))
		if !assert.NoError(t, err) {
			t.FailNow()
		}

		assert.NotEmpty(t, GetGoGitRepoGitDir(repo))
		assert.DirExists(t, GetGoGitRepoGitDir(repo))
		assert.DirExists(t, fmt.Sprintf("%s/objects", GetGoGitRepoGitDir(repo)))
	})
}

func TestGetGitCredential(t *testing.T) {
	cmd := Command{
		Args: []string{
			"git", "version",
		},
	}
	err := cmd.Run(context.Background())
	if err != nil {
		t.Skip("skip no git")
	}
	t.Run("BadProto", func(t *testing.T) {
		ctx := context.Background()
		_, err := GetGitHTTPCredential(ctx, nil, "bad", "example.org")
		assert.ErrorContains(t, err, "not implemented protocol")
	})
	t.Run("Common", func(t *testing.T) {
		ctx := context.Background()
		tmpdir := t.TempDir()

		// generate fake helper for testing
		err := os.WriteFile(filepath.Join(tmpdir, "fakehelper"), []byte(`#!/bin/sh
# assert GIT_DIR
if [ ! -d "${GIT_DIR}/objects" ]
then
	echo "GIT_DIR is not set" >&2
	exit 1
fi

# read kv
while read -r line
do
	k="${line%%=*}"
	v="${line##*=}"
	if [ "$k" = "protocol" ]
	then
		proto="$v"
	elif [ "$k" = "host" ]
	then
		host="$v"
	fi
done

if [ "$proto" != "https" ]
then
	echo bad proto "$proto" >&2
	exit 1
fi
if [ "$host" != "example.org" ]
then
	echo bad host "$host" >&2
	exit 1
fi

echo "protocol=$proto"
echo "host=$host"
echo "username=user" # gitleaks:allow
echo "password=topsecret" # gitleaks:allow
`), 0o755)
		if !assert.NoError(t, err) {
			t.FailNow()
		}

		// generate git dir
		repo, err := git.PlainInit(filepath.Join(tmpdir, "testrepo"), false, git.WithDefaultBranch("refs/heads/latest"))
		if !assert.NoError(t, err) {
			t.FailNow()
		}
		defer repo.Close()

		// setup helper
		f, err := os.OpenFile(filepath.Join(tmpdir, "testrepo", ".git", "config"), os.O_WRONLY|os.O_APPEND, 0o644)
		if !assert.NoError(t, err) {
			t.FailNow()
		}
		_, err = f.Write([]byte(`
[credential]
    helper = ` + filepath.Join(tmpdir, "fakehelper") + `
`))
		if !assert.NoError(t, err) {
			t.FailNow()
		}
		f.Close()

		_cred, err := GetGitHTTPCredential(ctx, repo, "https", "example.org")

		cred, ok := _cred.(*gitHttp.BasicAuth)
		if !assert.True(t, ok) {
			t.FailNow()
		}

		assert.Equal(t, "user", cred.Username)      //gitleaks:allow
		assert.Equal(t, "topsecret", cred.Password) //gitleaks:allow
	})
}
