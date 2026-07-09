// ==========================================================
// ai-config.js - AI/API 키 설정 모달 및 모델 목록 로드
// ==========================================================

let currentLoadedConfig = null;

function loadAIConfig(retryCount = 0) {
    const modelSel = document.getElementById('model-select');
    const chatModelSel = document.getElementById('ai-chat-model-select');
    const promptInput = document.getElementById('ai-promptInput');
    
    // Wails 바인딩이 아직 안 올라왔거나 핵심 DOM 요소가 마운트되지 않은 상태라면 200ms 뒤 재시도
    if (typeof window.apiGetAIConfig !== 'function' || !modelSel || !chatModelSel) {
        if (retryCount < 8) {
            setTimeout(() => loadAIConfig(retryCount + 1), 200);
        } else {
            console.error("Wails apiGetAIConfig 바인딩 또는 핵심 모델 선택 DOM 요소를 찾을 수 없다.");
        }
        return;
    }
    
    window.apiGetAIConfig().then(config => {
        let hasAnyModel = false;
        if (modelSel) modelSel.innerHTML = '<option value="">⚠️ 모델 미설정</option>';
        if (chatModelSel) chatModelSel.innerHTML = '<option value="">⚠️ 모델 미설정</option>';

        // 상단 AI설정 드롭다운 모델 목록 렌더링용 변수
        const dropdownModelsList = document.getElementById('ai-dropdown-models-list');
        if (dropdownModelsList) {
            dropdownModelsList.innerHTML = "";
        }
        
        let allModels = [];

        const addGroup = (label, providerName, providerData) => {
            const hasApiKey = providerData && providerData.apiKey && providerData.apiKey.trim() !== "";
            const isOllama = providerName === "ollama";
            const hasModels = providerData && providerData.models && providerData.models.length > 0;
            
            // Ollama는 API Key 없이 모델만 있으면 활성화, 그 외는 API Key 필수
            if ((hasApiKey || isOllama) && hasModels) {
                const group = document.createElement('optgroup');
                group.label = label;
                providerData.models.forEach(model => {
                    const opt = document.createElement('option');
                    opt.value = providerName + "|" + model.name;
                    opt.textContent = "✨ " + model.alias;
                    group.appendChild(opt);
                    hasAnyModel = true;
                    
                    allModels.push({
                        value: providerName + "|" + model.name,
                        label: `✨ [${label.replace(" API", "")}] ${model.alias}`
                    });
                });
                if (modelSel) modelSel.appendChild(group);
                if (chatModelSel) chatModelSel.appendChild(group.cloneNode(true));
            }
        };

        if (config) {
            currentLoadedConfig = config;
            addGroup("Google API", "google", config.google);
            addGroup("Groq API", "groq", config.groq);
            addGroup("Ollama API", "ollama", config.ollama);
            addGroup("Upstage API", "upstage", config.upstage);
        }

        if (!hasAnyModel) {
            if (promptInput) promptInput.disabled = true;
            return;
        }

        if (promptInput) promptInput.disabled = false;

        // 우선순위: 키 파일에 보존된 current -> 로컬 스토리지 정보 순
        let savedModel = (config && config.current) ? config.current : localStorage.getItem('selected-ai-model');
        
        // 현재 로드된 option 목록 중 savedModel이 실제로 존재하는지 체크
        let isValidModelSaved = false;
        if (savedModel && hasAnyModel) {
            const allOpts = [];
            if (modelSel) allOpts.push(...Array.from(modelSel.querySelectorAll('option')).flatMap(opt => opt.value ? [opt.value] : []));
            if (chatModelSel) allOpts.push(...Array.from(chatModelSel.querySelectorAll('option')).flatMap(opt => opt.value ? [opt.value] : []));
            
            // 중복제거된 전체 옵션 값 중에 존재하는지 확인
            isValidModelSaved = allOpts.includes(savedModel);
        }

        // 유효하지 않거나 비어있는 경우, 첫 번째 사용 가능한 모델로 롤백
        if (!isValidModelSaved && hasAnyModel && allModels.length > 0) {
            let fallbackModel = allModels[0].value;
            if (fallbackModel) {
                savedModel = fallbackModel;
                localStorage.setItem('selected-ai-model', savedModel);
            }
        }

        const applySelection = (selectElem) => {
            if (!selectElem) return;
            const options = Array.from(selectElem.querySelectorAll('option'));
            const exists = options.some(opt => opt.value === savedModel && opt.value !== "");
            if (exists) {
                selectElem.value = savedModel;
            } else {
                // value가 빈 값이 아닌 실제 유효 AI 모델 옵션 검출
                const validOpt = options.find(opt => opt.value && opt.value !== "");
                if (validOpt) {
                    selectElem.value = validOpt.value;
                    localStorage.setItem('selected-ai-model', validOpt.value);
                    savedModel = validOpt.value; // 다음 applySelection 호출을 위해 로컬 변수도 동기화
                } else {
                    selectElem.value = "";
                }
            }
        };

        applySelection(modelSel);
        applySelection(chatModelSel);

        // 앱 시작 직후 타이밍 에러 방지를 위한 2차 검증(self-healing) 지연 실행
        // 600ms 후에도 여전히 미설정 상태이거나 매핑이 유실되어 있다면 1회 재동기화 유도
        if (retryCount === 0) {
            setTimeout(() => {
                const checkSel = document.getElementById('model-select');
                if (checkSel && (!checkSel.value || checkSel.value === "")) {
                    console.log("초기 로딩 시 모델 누락 감지 - 자가 교정 동기화 재실행");
                    loadAIConfig(1);
                }
            }, 600);
        }
    }).catch(err => {
        console.error("API 설정 로드 실패:", err);
    });
}

// 상단 드롭다운 클릭 이벤트 및 외부 영역 클릭 리스너 설정
document.addEventListener('DOMContentLoaded', () => {
    const fileBtn = document.getElementById('file-menu-btn');
    const fileContent = document.getElementById('file-menu-dropdown-content');
    const headerSetupBtn = document.getElementById('header-model-setup-btn');

    if (fileBtn && fileContent) {
        fileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileContent.classList.toggle('show');
        });
    }

    if (headerSetupBtn) {
        headerSetupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const apiKeySetupBtn = document.getElementById('api-key-setup-btn') || document.getElementById('ai-chat-model-setup-btn');
            if (apiKeySetupBtn) {
                apiKeySetupBtn.click();
            }
        });
    }

    // 두 모델 드롭다운 박스(헤더 메뉴바용 & AI 대화 모달용) 변경 시 싱크 및 로컬 스토리지 동기화
    const headerModelSelect = document.getElementById('model-select');
    const chatModelSelectElem = document.getElementById('ai-chat-model-select');

    function handleModelSelectionChange(newValue) {
        localStorage.setItem('selected-ai-model', newValue);
        
        // 키 파일(.apikeys.json)에 동시 보존
        if (currentLoadedConfig) {
            currentLoadedConfig.current = newValue;
            window.apiSaveAIConfig(currentLoadedConfig).catch(err => {
                console.error("키 파일에 선택 모델 저장 실패:", err);
            });
        }

        const hSel = document.getElementById('model-select');
        const cSel = document.getElementById('ai-chat-model-select');
        if (hSel && hSel.value !== newValue) {
            hSel.value = newValue;
        }
        if (cSel && cSel.value !== newValue) {
            cSel.value = newValue;
        }
    }

    if (headerModelSelect) {
        headerModelSelect.addEventListener('change', () => {
            handleModelSelectionChange(headerModelSelect.value);
        });
    }

    if (chatModelSelectElem) {
        chatModelSelectElem.addEventListener('change', () => {
            handleModelSelectionChange(chatModelSelectElem.value);
        });
    }

    // 드롭다운 외부 클릭 시 숨김 처리
    window.addEventListener('click', (e) => {
        if (fileContent && fileContent.classList.contains('show')) {
            if (fileBtn && !fileBtn.contains(e.target) && !fileContent.contains(e.target)) {
                fileContent.classList.remove('show');
            }
        }
    });
});

// API 키 설정 모달 DOM 참조
const apiKeyModal = document.getElementById('api-key-modal');
const apiKeySetupBtn = document.getElementById('api-key-setup-btn') || document.getElementById('ai-chat-model-setup-btn');
const apiKeyClose = document.getElementById('api-key-close');
const apiKeyCancel = document.getElementById('api-key-cancel');
const apiKeyConfirm = document.getElementById('api-key-confirm');

// Google
const googleApiKey = document.getElementById('google-api-key');
const googleModel1Name = document.getElementById('google-model1-name');
const googleModel1Alias = document.getElementById('google-model1-alias');
const googleModel2Name = document.getElementById('google-model2-name');
const googleModel2Alias = document.getElementById('google-model2-alias');

// Groq
const groqApiKey = document.getElementById('groq-api-key');
const groqModel1Name = document.getElementById('groq-model1-name');
const groqModel1Alias = document.getElementById('groq-model1-alias');
const groqModel2Name = document.getElementById('groq-model2-name');
const groqModel2Alias = document.getElementById('groq-model2-alias');

// Ollama
const ollamaApiKey = document.getElementById('ollama-api-key');
const ollamaModel1Name = document.getElementById('ollama-model1-name');
const ollamaModel1Alias = document.getElementById('ollama-model1-alias');
const ollamaModel2Name = document.getElementById('ollama-model2-name');
const ollamaModel2Alias = document.getElementById('ollama-model2-alias');

// Upstage
const upstageApiKey = document.getElementById('upstage-api-key');
const upstageModel1Name = document.getElementById('upstage-model1-name');
const upstageModel1Alias = document.getElementById('upstage-model1-alias');
const upstageModel2Name = document.getElementById('upstage-model2-name');
const upstageModel2Alias = document.getElementById('upstage-model2-alias');

function closeApiKeyModal() {
    if (apiKeyModal) {
        apiKeyModal.classList.remove('show');
    }
}

if (apiKeySetupBtn) {
    apiKeySetupBtn.addEventListener('click', () => {
        window.apiGetAIConfig()
            .then(config => {
                const g = config.google || {};
                googleApiKey.value = g.apiKey || '';
                googleModel1Name.value = (g.models && g.models[0]) ? g.models[0].name : '';
                googleModel1Alias.value = (g.models && g.models[0]) ? g.models[0].alias : '';
                googleModel2Name.value = (g.models && g.models[1]) ? g.models[1].name : '';
                googleModel2Alias.value = (g.models && g.models[1]) ? g.models[1].alias : '';
                
                const gr = config.groq || {};
                groqApiKey.value = gr.apiKey || '';
                groqModel1Name.value = (gr.models && gr.models[0]) ? gr.models[0].name : '';
                groqModel1Alias.value = (gr.models && gr.models[0]) ? gr.models[0].alias : '';
                groqModel2Name.value = (gr.models && gr.models[1]) ? gr.models[1].name : '';
                groqModel2Alias.value = (gr.models && gr.models[1]) ? gr.models[1].alias : '';

                const ol = config.ollama || {};
                ollamaApiKey.value = ol.apiKey || '';
                ollamaModel1Name.value = (ol.models && ol.models[0]) ? ol.models[0].name : '';
                ollamaModel1Alias.value = (ol.models && ol.models[0]) ? ol.models[0].alias : '';
                ollamaModel2Name.value = (ol.models && ol.models[1]) ? ol.models[1].name : '';
                ollamaModel2Alias.value = (ol.models && ol.models[1]) ? ol.models[1].alias : '';

                const up = config.upstage || {};
                upstageApiKey.value = up.apiKey || '';
                upstageModel1Name.value = (up.models && up.models[0]) ? up.models[0].name : '';
                upstageModel1Alias.value = (up.models && up.models[0]) ? up.models[0].alias : '';
                upstageModel2Name.value = (up.models && up.models[1]) ? up.models[1].name : '';
                upstageModel2Alias.value = (up.models && up.models[1]) ? up.models[1].alias : '';

                if (apiKeyModal) {
                    apiKeyModal.classList.add('show');
                }
            })
            .catch(err => console.error("설정 로드 에러:", err));
    });
}

if (apiKeyClose) apiKeyClose.addEventListener('click', closeApiKeyModal);
if (apiKeyCancel) apiKeyCancel.addEventListener('click', closeApiKeyModal);
if (apiKeyModal) {
    apiKeyModal.addEventListener('click', (e) => {
        if (e.target === apiKeyModal) {
            closeApiKeyModal();
        }
    });
}

if (apiKeyConfirm) {
    apiKeyConfirm.addEventListener('click', () => {
        const buildProviderPayload = (keyInput, m1Name, m1Alias, m2Name, m2Alias, isOllama = false) => {
            const apiKeyVal = keyInput.value.trim();
            const models = [];
            // Ollama이거나 API 키가 입력되어 있으면 모델 빌드 허용
            if (isOllama || apiKeyVal !== "") {
                const name1 = m1Name.value.trim();
                const alias1 = m1Alias.value.trim();
                if (name1 && alias1) {
                    models.push({ name: name1, alias: alias1 });
                }
                const name2 = m2Name.value.trim();
                const alias2 = m2Alias.value.trim();
                if (name2 && alias2) {
                    models.push({ name: name2, alias: alias2 });
                }
            }
            return {
                apiKey: apiKeyVal,
                models: models
            };
        };

        const payload = {
            current: localStorage.getItem('selected-ai-model') || '',
            google: buildProviderPayload(googleApiKey, googleModel1Name, googleModel1Alias, googleModel2Name, googleModel2Alias, false),
            groq: buildProviderPayload(groqApiKey, groqModel1Name, groqModel1Alias, groqModel2Name, groqModel2Alias, false),
            ollama: buildProviderPayload(ollamaApiKey, ollamaModel1Name, ollamaModel1Alias, ollamaModel2Name, ollamaModel2Alias, true),
            upstage: buildProviderPayload(upstageApiKey, upstageModel1Name, upstageModel1Alias, upstageModel2Name, upstageModel2Alias, false)
        };

        window.apiSaveAIConfig(payload)
        .then(() => {
            closeApiKeyModal();
            loadAIConfig();
        })
        .catch(err => alert("설정 저장에 실패했다: " + err.message));
    });
}

// AI 대화 모달 내 모델 설정 버튼 연결
const aiChatModelSetupBtn = document.getElementById('ai-chat-model-setup-btn');
if (aiChatModelSetupBtn) {
    aiChatModelSetupBtn.addEventListener('click', () => {
        if (apiKeySetupBtn) apiKeySetupBtn.click();
    });
}
