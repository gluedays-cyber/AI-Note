// ==========================================================
// suggestion.js - Ctrl+L 번역·인라인 순환 고스트 제안 구현
// ==========================================================

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// 순환 고스트 제안 상태 정의
window.ghostSuggestionState = {
    active: false,
    suggestions: [],
    selectedIndex: 0,
    selectionStart: 0,   // Ctrl+L 호출 시점의 선택 시작 위치
    selectionEnd: 0,     // Ctrl+L 호출 시점의 선택 끝 위치
    selectedText: ''     // 선택된 원본 텍스트
};

// Ctrl+L 번역 및 자연스러운 표현 추천 기능
function triggerTranslationAndSuggestions(selectedText, selStart, selEnd) {
    const translationArea = document.getElementById('bottom-translation');

    let selectedModel = localStorage.getItem('selected-ai-model') || '';
    if (!selectedModel) {
        const modelSel = document.getElementById('ai-chat-model-select');
        selectedModel = modelSel ? modelSel.value : '';
    }

    if (!selectedModel) {
        window.apiGetAIConfig().then(config => {
            let firstFound = '';
            if (config) {
                if (config.google && config.google.apiKey && config.google.models && config.google.models.length > 0) {
                    firstFound = 'google|' + config.google.models[0].name;
                } else if (config.groq && config.groq.apiKey && config.groq.models && config.groq.models.length > 0) {
                    firstFound = 'groq|' + config.groq.models[0].name;
                } else if (config.ollama && config.ollama.models && config.ollama.models.length > 0) {
                    firstFound = 'ollama|' + config.ollama.models[0].name;
                } else if (config.upstage && config.upstage.apiKey && config.upstage.models && config.upstage.models.length > 0) {
                    firstFound = 'upstage|' + config.upstage.models[0].name;
                }
            }
            if (firstFound) {
                localStorage.setItem('selected-ai-model', firstFound);
                triggerTranslationAndSuggestions(selectedText, selStart, selEnd);
            } else {
                alert('모델이 설정되지 않았다. API 키 설정에서 모델을 등록하라.');
            }
        }).catch(() => {
            alert('모델이 설정되지 않았다. API 키 설정에서 모델을 등록하라.');
        });
        return;
    }

    translationArea.value = '⚡ 번역 중...';
    window.ghostSuggestionState.active = false;
    window.ghostSuggestionState.selectionStart = (selStart !== undefined) ? selStart : 0;
    window.ghostSuggestionState.selectionEnd   = (selEnd   !== undefined) ? selEnd   : 0;
    window.ghostSuggestionState.selectedText   = selectedText;

    // 1. 영어 번역 요청
    const transInstruction = `Translate the selected text into English clearly and naturally without any markdown or conversational filler.`;
    let transResponse = '';
    const prevOnAiChunk = window.onAiChunk;

    window.onAiChunk = (data) => {
        if (data.response) {
            transResponse += data.response;
            translationArea.value = transResponse;
        }
        if (data.done) {
            window.onAiChunk = prevOnAiChunk;
            requestSuggestions(selectedText, selectedModel, prevOnAiChunk);
        }
    };

    window.apiAiChat(transInstruction, '', selectedText, selectedModel)
    .catch(error => {
        window.onAiChunk = prevOnAiChunk;
        translationArea.value = '❌ 번역 오류: ' + error.message;
    });
}

function requestSuggestions(selectedText, selectedModel, prevOnAiChunk) {

    const sugInstruction = `다음 선택된 한국어 텍스트에 이어지기에 가장 자연스러운 한국어 표현을 정확히 3개 추천하라. JSON 포맷이나 설명 없이 오직 3개의 문장 또는 구문만 개행(new line)으로 구분하여 정밀하게 출력하라.`;
    let sugResponse = "";

    window.onAiChunk = (data) => {
        if (data.response) {
            sugResponse += data.response;
        }
        if (data.done) {
            window.onAiChunk = prevOnAiChunk;
            const suggestions = sugResponse.split('\n')
                .map(s => s.replace(/^\d+\.\s*/, '').trim())
                .filter(s => s.length > 0)
                .slice(0, 3);
            
            while (suggestions.length < 3) {
                suggestions.push(`이어지는 표현 ${suggestions.length + 1}`);
            }

            // 고스트 상태 업데이트
            window.ghostSuggestionState.suggestions = suggestions;
            window.ghostSuggestionState.selectedIndex = 0;
            window.ghostSuggestionState.active = true;

            // 하단 패널 및 고스트 디스플레이 노출
            const sugBar = document.getElementById('suggestion-bar');
            if (sugBar) sugBar.style.display = 'flex';
            window.updateGhostTextDisplay();
        }
    };

    window.apiAiChat(sugInstruction, '', selectedText, selectedModel)
    .catch(error => {
        window.onAiChunk = prevOnAiChunk;
        console.error("추천 오류:", error);
    });
}

// 추천 문구 렌더링 업데이트
window.updateGhostTextDisplay = function() {
    const state = window.ghostSuggestionState;
    const ghostText = document.getElementById('ghost-suggested-text');
    const ghostBadge = document.getElementById('ghost-suggested-badge');
    
    if (ghostText && ghostBadge && state.suggestions.length > 0) {
        ghostText.textContent = state.suggestions[state.selectedIndex];
        ghostBadge.textContent = `${state.selectedIndex + 1}/${state.suggestions.length}`;
    }
};

// 추천 문구 바 초기화 (비활성화 시)
window.clearSuggestionListPanel = function() {
    const sugBar = document.getElementById('suggestion-bar');
    if (sugBar) sugBar.style.display = 'none';
};


// 하단 패널 클릭으로 특정 인덱스 문구 삽입
window.commitSuggestionByIndex = function(index) {
    const state = window.ghostSuggestionState;
    if (!state.active || index >= state.suggestions.length) return;
    state.selectedIndex = index;
    window.commitGhostSuggestion();
};

// 제안을 본문에 확정 삽입하는 로직
window.commitGhostSuggestion = function() {
    const state = window.ghostSuggestionState;
    const editor = document.getElementById('editor');
    
    if (state.active && state.suggestions.length > 0 && editor) {
        const val = state.suggestions[state.selectedIndex];
        const text = editor.value;
        const selStart = state.selectionStart;
        const selEnd   = state.selectionEnd;
        const selText  = state.selectedText || '';

        // 단어 판별: 공백/줄바꿈/마침표류가 없으면 단일 단어로 간주 → 선택 범위를 추천 문구로 덮어씀
        const isWord = selText.length > 0 && !/[\s.。!?！？,，;；]/.test(selText);

        let newValue, newCursor;
        if (isWord) {
            newValue  = text.substring(0, selStart) + val + text.substring(selEnd);
            newCursor = selStart + val.length;
        } else {
            newValue  = text.substring(0, selEnd) + val + text.substring(selEnd);
            newCursor = selEnd + val.length;
        }

        editor.focus();
        editor.value = newValue;
        editor.selectionStart = editor.selectionEnd = newCursor;
        
        saveDocumentContent(editor.value);
        
        state.active = false;
        window.clearSuggestionListPanel();
    }
};
