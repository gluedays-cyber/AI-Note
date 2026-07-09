package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"syscall"
	"time"
	"unsafe"

	"github.com/jchv/go-webview2"

	"note/pkg/api"
	"note/pkg/server"
)

const (
	SW_HIDE              = 0
	SW_SHOW              = 5
	ERROR_ALREADY_EXISTS = 183
	WM_CLOSE             = 0x0010
)

var GWL_WNDPROC = uintptr(^uint32(3))

var (
	kernel32                     = syscall.NewLazyDLL("kernel32.dll")
	procCreateMutex              = kernel32.NewProc("CreateMutexW")
	procGetLastError             = kernel32.NewProc("GetLastError")
	procSetProcessWorkingSetSize = kernel32.NewProc("SetProcessWorkingSetSize")
	procGetCurrentProcess        = kernel32.NewProc("GetCurrentProcess")

	user32                  = syscall.NewLazyDLL("user32.dll")
	procShowWindow          = user32.NewProc("ShowWindow")
	procFindWindowW         = syscall.NewLazyDLL("user32.dll").NewProc("FindWindowW") // just use user32
	procSetForegroundWindow = user32.NewProc("SetForegroundWindow")
	procSetWindowLongPtr    = user32.NewProc("SetWindowLongPtrW")
	procCallWindowProc      = user32.NewProc("CallWindowProcW")
	procIsZoomed            = user32.NewProc("IsZoomed")
	procPostMessageW        = user32.NewProc("PostMessageW")
	procReleaseCapture      = user32.NewProc("ReleaseCapture")
	procSendMessageW        = user32.NewProc("SendMessageW")
	procKeybdEvent          = user32.NewProc("keybd_event")

	dwmapi                           = syscall.NewLazyDLL("dwmapi.dll")
	procDwmExtendFrameIntoClientArea = dwmapi.NewProc("DwmExtendFrameIntoClientArea")
	procDwmSetWindowAttribute        = dwmapi.NewProc("DwmSetWindowAttribute")

	originalWndProc uintptr
	globalHwnd      uintptr
	globalWInstance webview2.WebView
	isHidden        bool = true
)

func isAlreadyRunning() bool {
	mutexName, _ := syscall.UTF16PtrFromString("Antigravity_IDE_App_Mutex")
	handle, _, err := procCreateMutex.Call(0, 0, uintptr(unsafe.Pointer(mutexName)))
	if handle == 0 {
		return false
	}
	if err != nil && err.(syscall.Errno) == ERROR_ALREADY_EXISTS {
		return true
	}
	return false
}

func activateExistingInstance(filePath string) {
	className, _ := syscall.UTF16PtrFromString("webview")
	titleName, _ := syscall.UTF16PtrFromString("Note - Editor & AIWriter")
	hwnd, _, _ := procFindWindowW.Call(uintptr(unsafe.Pointer(className)), uintptr(unsafe.Pointer(titleName)))
	if hwnd != 0 {
		if filePath != "" {
			utf16Path, _ := syscall.UTF16FromString(filePath)
			var cds struct {
				DwData uintptr
				CbData uint32
				LpData uintptr
			}
			cds.DwData = 1
			cds.CbData = uint32(len(utf16Path) * 2)
			cds.LpData = uintptr(unsafe.Pointer(&utf16Path[0]))

			sendMessage := user32.NewProc("SendMessageW")
			sendMessage.Call(hwnd, 0x004A, 0, uintptr(unsafe.Pointer(&cds)))
		}

		procShowWindow.Call(hwnd, uintptr(SW_SHOW))
		procSetForegroundWindow.Call(hwnd)
	}
}

func flushMemory() {
	handle, _, _ := procGetCurrentProcess.Call()
	procSetProcessWorkingSetSize.Call(handle, ^uintptr(0), ^uintptr(0))
}

func wndProcHook(hwnd uintptr, msg uint32, wParam uintptr, lParam unsafe.Pointer) uintptr {
	if msg == 0x0083 { // WM_NCCALCSIZE
		if wParam == 1 {
			// Draw client area over the entire title bar region
			return 0
		}
	}

	if msg == 0x004A { // WM_COPYDATA
		cds := (*struct {
			DwData uintptr
			CbData uint32
			LpData *uint16
		})(lParam)

		if cds.DwData == 1 {
			pathSlice := unsafe.Slice(cds.LpData, cds.CbData/2)
			filePath := syscall.UTF16ToString(pathSlice)

			if globalWInstance != nil {
				pathBytes, _ := json.Marshal(filePath)
				script := "if(window.openFileFromPath) window.openFileFromPath(" + string(pathBytes) + ");"
				globalWInstance.Dispatch(func() {
					globalWInstance.Eval(script)
				})
			}
		}
		return 1
	}

	if msg == WM_CLOSE {
		os.Exit(0)
	}
	ret, _, _ := procCallWindowProc.Call(originalWndProc, hwnd, uintptr(msg), wParam, uintptr(lParam))
	return ret
}

func main() {
	targetFile := ""
	for _, arg := range os.Args[1:] {
		if arg != "--silent" {
			absPath, err := filepath.Abs(arg)
			if err == nil {
				targetFile = absPath
			} else {
				targetFile = arg
			}
			break
		}
	}

	if isAlreadyRunning() {
		activateExistingInstance(targetFile)
		return
	}

	localAppData := os.Getenv("LOCALAPPDATA")
	userDataFolder := filepath.Join(localAppData, "AntigravityIDE", "User Data")

	wInstance := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     true,
		AutoFocus: true,
		DataPath:  userDataFolder,
		WindowOptions: webview2.WindowOptions{
			Title:  "Note - [Ctrl+.] AI Assistant",
			Width:  1280,
			Height: 900,
			Hidden: false,
			Center: true,
		},
	})
	if wInstance == nil {
		panic("Failed to create webview")
	}
	defer wInstance.Destroy()

	globalHwnd = uintptr(wInstance.Window())
	globalWInstance = wInstance

	if globalHwnd != 0 {
		getSystemMetrics := user32.NewProc("GetSystemMetrics")
		setWindowPos := user32.NewProc("SetWindowPos")

		screenWidth, _, _ := getSystemMetrics.Call(0)
		screenHeight, _, _ := getSystemMetrics.Call(1)

		width := uintptr(1280)
		height := uintptr(900)

		x := (screenWidth - width) / 2
		y := (screenHeight - height) / 2
		// Remove WS_CAPTION from window style to hide titlebar completely
		procGetWindowLongW := user32.NewProc("GetWindowLongW")
		procSetWindowLongW := user32.NewProc("SetWindowLongW")
		style, _, _ := procGetWindowLongW.Call(globalHwnd, ^uintptr(15)) // GWL_STYLE = -16
		style &^= 0x00C00000                                             // WS_CAPTION = 0x00C00000
		procSetWindowLongW.Call(globalHwnd, ^uintptr(15), style)

		// Enable drop shadow without extending any DWM frame into client area.
		// Using {0,0,0,0}: shadow is retained but DWM does NOT overpaint
		// any pixel of the client area (WebView2 content), eliminating the top white line.
		type Margins struct {
			CxLeftWidth    int32
			CxRightWidth   int32
			CyTopHeight    int32
			CyBottomHeight int32
		}
		margins := Margins{0, 0, 0, 0}
		procDwmExtendFrameIntoClientArea.Call(globalHwnd, uintptr(unsafe.Pointer(&margins)))

		// Disable DWM border color (DWMWA_COLOR_NONE = 0xFFFFFFFE) to remove the border
		borderColor := uint32(0xFFFFFFFE)
		procDwmSetWindowAttribute.Call(globalHwnd, 34, uintptr(unsafe.Pointer(&borderColor)), 4)

		// Update frame to apply style changes
		setWindowPos.Call(globalHwnd, 0, x, y, width, height, 0x0020|0x0004) // SWP_FRAMECHANGED | SWP_NOACTIVATE

		cb := syscall.NewCallback(wndProcHook)
		oldProc, _, _ := procSetWindowLongPtr.Call(globalHwnd, uintptr(GWL_WNDPROC), cb)
		if oldProc == 0 {
			// Fallback for 32-bit compilation if SetWindowLongPtrW fails
			oldProc, _, _ = procSetWindowLongW.Call(globalHwnd, uintptr(GWL_WNDPROC), cb)
		}
		originalWndProc = oldProc

		getModuleHandle := kernel32.NewProc("GetModuleHandleW")
		hInst, _, _ := getModuleHandle.Call(0)
		loadImage := user32.NewProc("LoadImageW")
		hIcon, _, _ := loadImage.Call(hInst, uintptr(1), 1, 0, 0, 0x00008000|0x00000040)
		if hIcon != 0 {
			sendMessage := user32.NewProc("SendMessageW")
			sendMessage.Call(globalHwnd, 0x0080, 0, hIcon)
			sendMessage.Call(globalHwnd, 0x0080, 1, hIcon)
		}
	}

	api.RegisterAPIs(wInstance)

	wInstance.Bind("apiMinimize", func() {
		procShowWindow.Call(globalHwnd, 6) // SW_MINIMIZE = 6
	})
	wInstance.Bind("apiMaximize", func() {
		isZoomed, _, _ := procIsZoomed.Call(globalHwnd)
		if isZoomed != 0 {
			procShowWindow.Call(globalHwnd, 9) // SW_RESTORE = 9
		} else {
			procShowWindow.Call(globalHwnd, 3) // SW_MAXIMIZE = 3
		}
	})
	wInstance.Bind("apiClose", func() {
		procPostMessageW.Call(globalHwnd, 0x0010, 0, 0) // WM_CLOSE = 0x0010
	})
	wInstance.Bind("apiStartDrag", func() {
		procReleaseCapture.Call()
		procSendMessageW.Call(globalHwnd, 0x00A1, 2, 0) // WM_NCLBUTTONDOWN = 0x00A1, HTCAPTION = 2
	})

	startURL := server.StartLocalServer()
	wInstance.Navigate(startURL)

	silent := false
	for _, arg := range os.Args {
		if arg == "--silent" {
			silent = true
			break
		}
	}
	if !silent {
		if globalWInstance != nil {
			procShowWindow.Call(globalHwnd, uintptr(SW_SHOW))
		} else {
			procShowWindow.Call(globalHwnd, uintptr(SW_SHOW))
		}
		procSetForegroundWindow.Call(globalHwnd)
		isHidden = false

		// 앱 시작 후 Tab을 시뮬레이션하여 편집창 포커스 획득
		go func() {
			time.Sleep(500 * time.Millisecond)
			const (
				VK_TAB  = 0x09
				KEYEVENTF_KEYUP = 0x0002
			)
			// Tab 누름
			procKeybdEvent.Call(VK_TAB, 0, 0, 0)
			procKeybdEvent.Call(VK_TAB, 0, KEYEVENTF_KEYUP, 0)
		}()
	}

	flushMemory()
	wInstance.Run()
}
