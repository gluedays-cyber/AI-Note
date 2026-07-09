package dialogs

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
)

func ApiOpenDialog(currentPath string) (map[string]string, error) {
	initialDirCmd := ""
	if currentPath != "" {
		dir := filepath.Dir(filepath.Clean(currentPath))
		escapedDir := strings.ReplaceAll(dir, "'", "''")
		initialDirCmd = fmt.Sprintf(`$f.InitialDirectory = '%s'; `, escapedDir)
	}

	psCommand := fmt.Sprintf(
		`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; %s$f.Filter = 'Text Files (*.txt;*.css;*.js;*.html;*.go;*.py)|*.txt;*.css;*.js;*.html;*.go;*.py|All Files (*.*)|*.*'; if($f.ShowDialog() -eq 'OK'){Write-Host -NoNewline $f.FileName}`,
		initialDirCmd,
	)

	cmd := exec.Command("powershell", "-NoProfile", "-WindowStyle", "Hidden", "-Command", psCommand)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}

	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("파일 열기 창을 실행할 수 없습니다: %v", err)
	}

	filePath := strings.TrimSpace(string(output))
	if filePath == "" {
		return nil, nil
	}

	return map[string]string{"path": filePath}, nil
}

func ApiSaveAsDialog(currentPath string) (map[string]string, error) {
	initialDirCmd := ""
	defaultNameCmd := ""
	if currentPath != "" {
		dir := filepath.Dir(filepath.Clean(currentPath))
		escapedDir := strings.ReplaceAll(dir, "'", "''")
		initialDirCmd = fmt.Sprintf(`$f.InitialDirectory = '%s'; `, escapedDir)

		base := filepath.Base(currentPath)
		escapedBase := strings.ReplaceAll(base, "'", "''")
		defaultNameCmd = fmt.Sprintf(`$f.FileName = '%s'; `, escapedBase)
	}

	psCommand := fmt.Sprintf(
		`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.SaveFileDialog; %s%s$f.Filter = 'Text Files (*.txt;*.css;*.js;*.html;*.go;*.py)|*.txt;*.css;*.js;*.html;*.go;*.py|All Files (*.*)|*.*'; if($f.ShowDialog() -eq 'OK'){Write-Host -NoNewline $f.FileName}`,
		initialDirCmd,
		defaultNameCmd,
	)

	cmd := exec.Command("powershell", "-NoProfile", "-WindowStyle", "Hidden", "-Command", psCommand)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}

	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("파일 저장 창을 실행할 수 없습니다: %v", err)
	}

	filePath := strings.TrimSpace(string(output))
	if filePath == "" {
		return nil, nil
	}

	return map[string]string{"path": filePath}, nil
}

func ApiRename(oldPath string, newName string) (map[string]string, error) {
	cleanOldPath := filepath.Clean(oldPath)
	dir := filepath.Dir(cleanOldPath)

	if !strings.HasSuffix(strings.ToLower(newName), ".txt") {
		newName += ".txt"
	}
	newPath := filepath.Join(dir, newName)

	if _, err := os.Stat(cleanOldPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("원본 파일이 존재하지 않습니다")
	}

	if err := os.Rename(cleanOldPath, newPath); err != nil {
		return nil, fmt.Errorf("파일명 변경 실패: %v", err)
	}

	return map[string]string{"newPath": newPath}, nil
}
