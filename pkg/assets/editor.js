// ==========================================================
// editor.js - 에디터 핵심 로직: 초기화, 저장, 파일 입출력, 단축키
// ==========================================================

const mainContainer = document.querySelector('.main-container');

let currentFilePath = "";
const editorElement = document.getElementById('editor');

// 앱 초기화 완료 전까지 Tab 키 삽입을 원천 차단
// Wails WebView2는 창 활성화 시 내부적으로 Tab 이벤트를 합성하므로 이 플래그가 반드시 필요하다
let appReady = false;

// 테마 초기 클래스 적용
document.body.className = 'light-theme';

// getValue / setValue 헬퍼 함수
function getValue(element) {
    return element ? element.value : "";
}

function setValue(element, value) {
    if (element) {
        element.value = value;
        // 커서를 항상 맨 앞(0)으로 악시적 리셋 – 시작 시 전체 선택된 뚝새 블록 방지
        element.selectionStart = 0;
        element.selectionEnd = 0;
        element.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

// UI Title 업데이트 함수
function updateTitleDisplay(filePath) {
    const fileTitleElem = document.getElementById('file-title');
    if (filePath && filePath !== "noname.txt") {
        const parts = filePath.split('/');
        const fileName = parts[parts.length - 1];
        if (fileTitleElem) fileTitleElem.textContent = fileName;
        document.title = "StyledText - " + fileName;
    } else {
        if (fileTitleElem) fileTitleElem.textContent = "제목 없음";
        document.title = "StyledText - 제목 없음";
    }
}

// 단어 선택 영역 텍스트 추출 함수
function getSelectedText() {
    const editor = document.getElementById('editor');
    if (editor) {
        return editor.value.substring(editor.selectionStart, editor.selectionEnd).trim();
    }
    return "";
}

// 문서 저장 함수 (에디터 변경 사항 API 전송 및 활성 탭 동기화)
function saveDocumentContent(content) {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab) {
        activeTab.content = content;
    }
    if (!currentFilePath || currentFilePath === "noname.txt") return;
    window.apiSave(currentFilePath, content).catch(err => console.error("임시 저장 실패:", err));
}

// editor 입력 감지 시 자동 저장 및 탭 상태 업데이트
editorElement.addEventListener('input', function() {
    saveDocumentContent(this.value);
});

// Tab 키 처리 함수
function handleTabKey(e, element) {
    if (e.key === 'Tab') {
        // 앱이 완전히 초기화되기 전까지는 Tab 삽입을 완전 차단
        if (!appReady) {
            e.preventDefault();
            return;
        }
        // 인라인 고스트 제안 상태가 활성화되어 있다면 들여쓰기를 방지하고 리턴
        if (window.ghostSuggestionState && window.ghostSuggestionState.active) {
            e.preventDefault();
            return;
        }
        e.preventDefault();
        const start = element.selectionStart;
        const end = element.selectionEnd;
        const value = element.value;
        element.value = value.substring(0, start) + '    ' + value.substring(end);
        element.selectionStart = element.selectionEnd = start + 4;
    }
}

editorElement.addEventListener('keydown', function(e) {
    // 1. 인라인 고스트 제안 상태가 활성화되어 있다면 제안 조작 로직이 모든 탭/엔터/방향키를 완벽 가로챔
    if (window.ghostSuggestionState && window.ghostSuggestionState.active) {
        const state = window.ghostSuggestionState;
        
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            state.selectedIndex = (state.selectedIndex - 1 + state.suggestions.length) % state.suggestions.length;
            window.updateGhostTextDisplay();
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            state.selectedIndex = (state.selectedIndex + 1) % state.suggestions.length;
            window.updateGhostTextDisplay();
            return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            window.commitGhostSuggestion();
            return;
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopPropagation();
            window.commitGhostSuggestion();
            return;
        }
    }
    
    // 2. 제안 비활성 시에만 일반 Tab 들여쓰기 기능 구동
    handleTabKey(e, this);
});

function focusEditor() {
    if (editorElement) {
        editorElement.focus();
    }
}

// 새 파일 트리거 함수
function triggerNewFile() {
    addNewTab();
}

// 파일 불러오기 트리거 함수
function triggerLoadFile() {
    window.apiOpenDialog(currentFilePath)
    .then(res => {
        if (res && res.path) {
            window.openFileFromPath(res.path);
        }
    })
    .catch(err => console.error("열기 창 로드 실패:", err));
}

window.openFileFromPath = function(path) {
    if (path) {
        const cleanPath = path.replace(/\\/g, '/');
        const existingTab = tabs.find(t => t.filePath === cleanPath);
        if (existingTab) {
            switchTab(existingTab.id);
            return;
        }
        
        window.apiLoad(cleanPath)
        .then(data => {
            if (tabs.length === 1 && tabs[0].filePath === "noname.txt" && getValue(editorElement).trim() === "") {
                tabs[0].filePath = cleanPath;
                tabs[0].content = data.content;
                currentFilePath = cleanPath;
                setValue(editorElement, data.content);
                updateTitleDisplay(currentFilePath);
                renderTabs();
            } else {
                addNewTab(cleanPath, data.content);
            }
        })
        .catch(err => console.error("파일 로드 실패:", err));
    }
};

// 파일 저장 트리거 함수
function triggerSaveFile() {
    window.apiSaveAsDialog(currentFilePath)
    .then(res => {
        if (res && res.path) {
            const cleanPath = res.path.replace(/\\/g, '/');
            currentFilePath = cleanPath;
            
            const activeTab = tabs.find(t => t.id === activeTabId);
            if (activeTab) {
                activeTab.filePath = cleanPath;
                activeTab.content = getValue(editorElement);
            }
            
            window.apiSave(cleanPath, getValue(editorElement))
            .then(() => {
                updateTitleDisplay(cleanPath);
                renderTabs();
            })
            .catch(err => console.error("파일 저장 실패:", err));
        }
    })
    .catch(err => console.error("저장 창 로드 실패:", err));
}

// 문서 초기 로드 및 에디터 데이터 삽입
function loadDocument(retryCount = 0) {
    // Wails 바인딩이 아직 안 올라온 상태라면 200ms 뒤 재시도
    if (typeof window.getInitData !== 'function') {
        if (retryCount < 5) {
            setTimeout(() => loadDocument(retryCount + 1), 200);
        } else {
            console.error("Wails getInitData 바인딩을 찾을 수 없다.");
        }
        return;
    }

    const markReady = () => {
        // 먼저 포커스를 줘서 WebView2 합성 Tab 이벤트를 appReady=false 구간에서 소진시킨다
        focusEditor();
        // 합성 이벤트가 모두 소진된 이후에 Tab 삽입 허용 및 모델 설정 로드
        setTimeout(() => { 
            appReady = true; 
            loadAIConfig();
        }, 600);
    };

    const loadFile = () => {
        window.apiLoad(currentFilePath)
        .then(data => {
            addNewTab(currentFilePath, data.content);
            markReady();
        })
        .catch(err => {
            console.error("파일 로드 실패:", err);
            addNewTab();
            markReady();
        });
    };

    window.getInitData()
    .then(data => {
        if (data && data.targetFile) {
            currentFilePath = data.targetFile.replace(/\\/g, '/');
            loadFile();
        } else {
            addNewTab();
            markReady();
        }
    })
    .catch(err => {
        console.error("초기 경로 로드 실패:", err);
        addNewTab();
        markReady();
    });
}

// 단축키 전역 등록
window.addEventListener('keydown', function(e) {
    const key = e.key.toLowerCase();

    if (e.ctrlKey && key === 'a') {
        const active = document.activeElement;
        const editor = document.getElementById('editor');
        // 편집창이 이미 포커스를 가지고 있다면 브라우저 기본 Ctrl+A로 처리
        if (active === editor) return;
        const isInput = active && (
            active.tagName === 'INPUT' || 
            active.tagName === 'TEXTAREA' || 
            active.isContentEditable
        );
        if (!isInput) {
            e.preventDefault();
            if (editor) editor.focus();
        }
    }
    if (e.ctrlKey && key === 'n') {
        e.preventDefault();
        triggerNewFile();
    }
    if (e.ctrlKey && key === 's') {
        e.preventDefault();
        triggerSaveFile();
    }
    if (e.ctrlKey && key === 'o') {
        e.preventDefault();
        triggerLoadFile();
    }
    if (e.ctrlKey && key === 'l') {
        e.preventDefault();
        const editor = document.getElementById('editor');
        const selected = getSelectedText();
        if (selected && editor) {
            triggerTranslationAndSuggestions(selected, editor.selectionStart, editor.selectionEnd);
        }
    }
    if (e.ctrlKey && key === '.') {
        e.preventDefault();
        triggerAiChatPopup();
    }

    if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        const aiModal = document.getElementById('ai-chat-modal');
        if (aiModal && aiModal.classList.contains('show')) {
            const buttons = document.querySelectorAll('.ai-quick-actions .quick-btn');
            const index = parseInt(e.key) - 1;
            if (index >= 0 && index < buttons.length) {
                e.preventDefault();
                buttons[index].click();
            }
        }
    }
    if (e.ctrlKey && e.key === 'Enter') {
        const aiModal = document.getElementById('ai-chat-modal');
        if (aiModal && aiModal.classList.contains('show')) {
            e.preventDefault();
            insertAiChatToEditor();
        }
    }
    if (e.key === 'F1') {
        e.preventDefault();
        triggerHelpPopup();
    }
    if (e.key === 'Escape') {
        const overlayContainer = document.getElementById('suggestion-overlay-container');
        if (overlayContainer && overlayContainer.style.display !== 'none') {
            e.preventDefault();
            overlayContainer.style.display = 'none';
            // 제안 상태 해제
            if (window.ghostSuggestionState) {
                window.ghostSuggestionState.active = false;
            }
            const editor = document.getElementById('editor');
            if (editor) editor.focus();
        }
        const aiModal = document.getElementById('ai-chat-modal');
        if (aiModal && aiModal.classList.contains('show')) {
            e.preventDefault();
            closeAiChatModal();
        }
        const hModal = document.getElementById('help-modal');
        if (hModal && hModal.classList.contains('show')) {
            e.preventDefault();
            closeHelpModal();
        }
    }
});



// 창 드래그 처리
const tabBar = document.getElementById('tab-bar');
if (tabBar) {
    tabBar.addEventListener('mousedown', (e) => {
        if (e.target.closest('.tab') || e.target.closest('button') || e.target.closest('.window-controls')) {
            return;
        }
        if (window.apiStartDrag) {
            window.apiStartDrag();
        }
    });
}

// 초기화 호출
loadDocument();

// 포커스는 loadDocument의 markReady() 내부에서 처리하므로 별도 setTimeout 호출 불필요
