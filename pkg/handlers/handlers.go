package handlers

import (
	"fmt"
	"os"
	"path/filepath"
)

type DocData struct {
	Content  string `json:"content"`
	FileName string `json:"filename"`
}

func ApiLoad(path string, targetFile string) (DocData, error) {
	reqPath := path
	if reqPath == "" {
		reqPath = targetFile
	} else {
		reqPath = filepath.Clean(reqPath)
	}

	if reqPath == "" {
		return DocData{}, fmt.Errorf("열고자 하는 파일 경로가 유효하지 않습니다.")
	}

	content, err := os.ReadFile(reqPath)
	if err != nil {
		return DocData{}, fmt.Errorf("파일을 읽을 수 없습니다: %v", err)
	}

	return DocData{
		Content:  string(content),
		FileName: filepath.Base(reqPath),
	}, nil
}

func ApiSave(path string, content string) error {
	savePath := filepath.Clean(path)
	return os.WriteFile(savePath, []byte(content), 0644)
}
