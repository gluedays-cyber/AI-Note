// ==========================================================
// ai-chat.js - AI 대화 팝업, 빠른 질문 버튼, 프롬프트 이력 탐색
// ==========================================================

let currentPopupSelectedText = "";
let currentPopupFullResponse = "";
let isAiProcessing = false;

// 프롬프트 이력 관리
let promptHistory = [];
let promptHistoryIndex = -1;
let tempPromptValue = "";

function triggerAiChatPopup() {
    let selectedText = getSelectedText();

    let selectedModel = localStorage.getItem('selected-ai-model') || '';
    const modelSel = document.getElementById('ai-chat-model-select');
    
    if (modelSel && !selectedModel) {
        selectedModel = modelSel.value;
    }

    if (!selectedModel) {
        window.apiGetAIConfig().then(config => {
            let firstFound = "";
            if (config) {
                if (config.google && config.google.apiKey && config.google.models && config.google.models.length > 0) {
                    firstFound = "google|" + config.google.models[0].name;
                } else if (config.groq && config.groq.apiKey && config.groq.models && config.groq.models.length > 0) {
                    firstFound = "groq|" + config.groq.models[0].name;
                } else if (config.ollama && config.ollama.models && config.ollama.models.length > 0) {
                    firstFound = "ollama|" + config.ollama.models[0].name;
                } else if (config.upstage && config.upstage.apiKey && config.upstage.models && config.upstage.models.length > 0) {
                    firstFound = "upstage|" + config.upstage.models[0].name;
                }
            }
            if (firstFound) {
                localStorage.setItem('selected-ai-model', firstFound);
                // 셀렉트 박스 동기화 유도
                if (window.loadAIConfig) window.loadAIConfig();
                // 팝업 열기 재시도
                triggerAiChatPopup();
            } else {
                alert("모델이 설정되지 않았다. API 키 설정에서 모델을 등록하라.");
            }
        }).catch(() => {
            alert("모델이 설정되지 않았다. API 키 설정에서 모델을 등록하라.");
        });
        return;
    }

    // 만약 셀렉트 박스에 매핑은 비어있으나 모델명이 존재한다면 싱크
    if (modelSel && !modelSel.value && selectedModel) {
        modelSel.value = selectedModel;
    }

    const modal = document.getElementById('ai-chat-modal');
    const selectedTextElem = document.getElementById('ai-chat-selected-text');
    const modalContent = document.getElementById('ai-chat-modal-content');
    const promptInput = document.getElementById('ai-chat-prompt');
    
    currentPopupSelectedText = selectedText;
    currentPopupFullResponse = "";

    if (selectedTextElem) {
        selectedTextElem.value = selectedText;
    }
    if (modalContent) {
        modalContent.value = "";
    }
    if (modal) {
        modal.classList.add('show');
        if (promptInput) {
            promptInput.focus();
            setTimeout(() => promptInput.focus(), 50);
            setTimeout(() => promptInput.focus(), 150);
        }
    }
}

function executeAiRequest(instruction, userVisibleText) {
    sendAiChatPopupPrompt(instruction, userVisibleText);
}

// 빠른 질문 지시 버튼 클릭 이벤트 처리
document.addEventListener('click', (e) => {
    if (e.target && e.target.classList.contains('quick-prompt-btn')) {
        e.preventDefault();
        const promptType = e.target.getAttribute('data-prompt');
        let instruction = "";
        
        const promptInput = document.getElementById('ai-chat-prompt');
        const userPrompt = promptInput ? promptInput.value.trim() : "";

        switch (promptType) {
            case '뜻':
                instruction = `다음 선택된 부분의 뜻을 설명하라.`;
                break;
            case '요약':
                instruction = `다음 선택된 내용을 요점만 항목별로 요약하라.`;
                break;
            case '영어로':
                instruction = `다음 선택된 내용을 영어로 번역하라.`;
                break;
            case '한글로':
                instruction = `다음 선택된 내용을 한글로 번역하라.`;
                break;
            case '개념확장':
                instruction = `다음 선택된 개념을 가르치기 위한 과정을 블릿이 붙은 제목(주제)만을 순서대로 나열하라. 부가 설명은 일절 배제하라.`;
                break;
            case '개념설명':
                instruction = `다음 주어진 제목(개념)을 가르치기 위한 상세히 설명하는 내용을 작성하라.`;
                break;
            case '전개예측':
                instruction = `다음 선택된 내용이 이후에 어떤 내용으로 전개될 것인지 예측하여 본문 컨텐츠를 확장하여 작성하라.`;
                break;
            default:
                instruction = promptType;
        }
        
        executeAiRequest(instruction, userPrompt);
    }
});

function clearAiChatPopup() {
    currentPopupFullResponse = "";
    const modalContent = document.getElementById('ai-chat-modal-content');
    if (modalContent) {
        modalContent.value = "";
    }
    const promptInput = document.getElementById('ai-chat-prompt');
    if (promptInput) {
        promptInput.value = "";
        promptInput.focus();
    }
}

function insertAiChatToEditor() {
    const modalContent = document.getElementById('ai-chat-modal-content');
    let insertText = modalContent ? modalContent.value.trim() : "";
    
    if (!insertText) {
        alert("삽입할 내용이 없다.");
        return;
    }
    
    closeAiChatModal();
    editorElement.focus();
    
    const currentVal = editorElement.value;
    const separator = currentVal.endsWith("\n") || currentVal === "" ? "" : "\n";
    const newVal = currentVal + separator + "\n" + insertText + "\n";
    
    editorElement.value = newVal;
    editorElement.selectionStart = editorElement.selectionEnd = newVal.length;
    saveDocumentContent(newVal);
}

function sendAiChatPopupPrompt(customInstruction = null, userVisibleText = null) {
    if (isAiProcessing) {
        alert("현재 AI가 응답을 처리 중이다. 완료 후 다시 시도하라.");
        return;
    }

    const promptInput = document.getElementById('ai-chat-prompt');
    const userTypedText = promptInput ? promptInput.value.trim() : "";

    let instruction = "";
    if (customInstruction) {
        instruction = customInstruction;
    } else {
        instruction = userTypedText;
        if (!instruction) return;
    }

    const displayText = userVisibleText !== null ? userVisibleText : userTypedText;
    if (promptInput) {
        promptInput.value = displayText;
    }

    const historyText = displayText;
    if (historyText) {
        if (promptHistory.length === 0 || promptHistory[promptHistory.length - 1] !== historyText) {
            promptHistory.push(historyText);
        }
        promptHistoryIndex = promptHistory.length;
        tempPromptValue = "";
    }

    const modelSel = document.getElementById('ai-chat-model-select');
    const selectedModel = modelSel ? modelSel.value : '';
    if (!selectedModel) {
        alert("모델이 설정되지 않았다.");
        return;
    }

    const modalContent = document.getElementById('ai-chat-modal-content');
    
    if (modalContent) {
        modalContent.value = "⚡ 답변 준비중...";
    }

    if (promptInput) {
        promptInput.focus();
    }

    const editor = document.getElementById('editor');
    const mainDoc = editor ? editor.value : "";
    
    isAiProcessing = true;

    let chunkResponse = "";
    window.onAiChunk = (data) => {
        if (data.response) {
            chunkResponse += data.response;
            if (modalContent) {
                modalContent.value = chunkResponse;
            }
            currentPopupFullResponse = chunkResponse;
        }

        if (data.done) {
            isAiProcessing = false;
            if (chunkResponse === "") {
                const errMsg = '❌ 응답 없음: API 키 또는 네트워크 오류일 수 있다.';
                if (modalContent) {
                    modalContent.value = errMsg;
                }
            } else {
                if (modalContent) {
                    modalContent.value = chunkResponse;
                }
                currentPopupFullResponse = chunkResponse;
            }
        }
    };

    window.apiAiChat(instruction, mainDoc, currentPopupSelectedText, selectedModel)
    .catch(error => {
        isAiProcessing = false;
        console.error("통신 에러 발생:", error);
        const errMsg = "❌ 통신 에러 발생!\n" + error.message;
        if (modalContent) {
            modalContent.value = errMsg;
        }
    });
}

// AI 대화 모달 닫기 및 배경 클릭 감지
function closeAiChatModal() {
    const modal = document.getElementById('ai-chat-modal');
    if (modal) {
        modal.classList.remove('show');
    }
}

const aiChatModal = document.getElementById('ai-chat-modal');
if (aiChatModal) {
    aiChatModal.addEventListener('click', function(e) {
        if (e.target === aiChatModal) {
            closeAiChatModal();
        }
    });
}

// 프롬프트 입력창 키보드 이벤트 (Enter, 이력 탐색)
const aiChatPromptInputElem = document.getElementById('ai-chat-prompt');
if (aiChatPromptInputElem) {
    aiChatPromptInputElem.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
            e.preventDefault();
            sendAiChatPopupPrompt();
        } else if (e.key === 'ArrowUp') {
            const start = this.selectionStart;
            const currentVal = this.value;
            const beforeCursor = currentVal.substring(0, start);
            
            if (!beforeCursor.includes('\n')) {
                if (promptHistory.length > 0 && promptHistoryIndex > 0) {
                    e.preventDefault();
                    if (promptHistoryIndex === promptHistory.length) {
                        tempPromptValue = currentVal;
                    }
                    promptHistoryIndex--;
                    this.value = promptHistory[promptHistoryIndex];
                    this.selectionStart = this.selectionEnd = this.value.length;
                }
            }
        } else if (e.key === 'ArrowDown') {
            const end = this.selectionEnd;
            const currentVal = this.value;
            const afterCursor = currentVal.substring(end);
            
            if (!afterCursor.includes('\n')) {
                if (promptHistoryIndex < promptHistory.length) {
                    e.preventDefault();
                    promptHistoryIndex++;
                    if (promptHistoryIndex === promptHistory.length) {
                        this.value = tempPromptValue;
                    } else {
                        this.value = promptHistory[promptHistoryIndex];
                    }
                    this.selectionStart = this.selectionEnd = this.value.length;
                } else if (currentVal.trim() !== "") {
                    e.preventDefault();
                    tempPromptValue = "";
                    this.value = "";
                    promptHistoryIndex = promptHistory.length;
                }
            }
        }
    });
}

// 도움말 모달
window.triggerHelpPopup = function() {
    const modal = document.getElementById('help-modal');
    if (modal) {
        modal.classList.add('show');
    }
};

window.closeHelpModal = function() {
    const modal = document.getElementById('help-modal');
    if (modal) {
        modal.classList.remove('show');
    }
};

const helpModal = document.getElementById('help-modal');
if (helpModal) {
    helpModal.addEventListener('click', function(e) {
        if (e.target === helpModal) {
            closeHelpModal();
        }
    });
}
