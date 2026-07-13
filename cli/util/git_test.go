package util

import (
	"fmt"
	"testing"

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
