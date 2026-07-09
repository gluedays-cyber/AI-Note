$ErrorActionPreference = "Stop"

Write-Host "기존 리소스 파일(.syso)을 정리한다."
Remove-Item *.syso -ErrorAction SilentlyContinue

# 아이콘 포함 및 제목표시줄 아이콘 표시
# go-winres가 winres.json의 아이콘 설정을 빌드에 병합하여 실행 파일 및 창 좌측 상단 아이콘으로 적용한다.
Write-Host "winres.json을 바탕으로 리소스를 생성한다."
go-winres make --arch amd64 --in winres\winres.json
if ($LASTEXITCODE -ne 0) { throw "리소스 생성에 실패했다." }

# frontend 자산은 main.go 내부의 //go:embed 지시어를 통해 go build 수행 시 바이너리에 자동 포함된다.
# -H windowsgui: 앱 실행 시 콘솔창이 뜨지 않도록 강제한다.
Write-Host "Go 바이너리 빌드를 진행한다."
go build -ldflags="-s -w -H windowsgui" -o Note.exe
if ($LASTEXITCODE -ne 0) { throw "바이너리 빌드에 실패했다." }

Write-Host "빌드가 성공적으로 완료되었다. 결과물: Note.exe" -ForegroundColor Green