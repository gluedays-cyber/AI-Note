package config

import (
	"os"
	"path/filepath"
)

// 전역 변수 선언
var BaseDir string    // 애플리케이션의 기본 디렉토리를 저장한다.
var TargetFile string // 사용자에게 선택된 파일 경로를 저장한다.

// README.txt 파일에 포함될 기본 콘텐츠를 상수(constant)로 정의한다.
const ReadmeContent = `Note v1

Developed by gluedays@gmail.com
Powered by GEMINI

---

Overview
Note는 간소화된 문서 생성을 위해 설계된 경량의 직관적인 텍스트 에디터이다.`

const EmbeddedKeyPart = "jqSTorHy2KayAlw"

// 초기화 함수
func init() {
	exePath, _ := os.Executable()
	BaseDir = filepath.Dir(exePath)

	for _, arg := range os.Args[1:] {
		if arg != "--silent" {
			absPath, err := filepath.Abs(arg)
			if err == nil {
				TargetFile = absPath
			} else {
				TargetFile = arg
			}
			break
		}
	}
}
