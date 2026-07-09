// ==========================================================
// tabs.js - 탭 상태 관리 및 렌더링
// ==========================================================

let tabs = [];
let activeTabId = null;
const MAX_TABS = 10;

// 탭 바 렌더링 함수
function renderTabs() {
    const tabsListElem = document.getElementById('tabs-list');
    if (!tabsListElem) return;
    
    tabsListElem.innerHTML = '';
    tabs.forEach(tab => {
        const tabElem = document.createElement('div');
        tabElem.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
        tabElem.onclick = () => switchTab(tab.id);

        const iconSpan = document.createElement('span');
        iconSpan.className = 'tab-icon';
        iconSpan.innerHTML = '📝';
        iconSpan.style.marginRight = '6px';
        iconSpan.style.fontSize = '12px';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'tab-title';
        const displayPath = tab.filePath || '제목 없음';
        const parts = displayPath.split('/');
        let fileName = parts[parts.length - 1];
        if (fileName === "noname.txt") {
            fileName = "제목 없음";
        }
        titleSpan.textContent = fileName;
        titleSpan.title = displayPath;
        
        const closeSpan = document.createElement('span');
        closeSpan.className = 'tab-close';
        closeSpan.innerHTML = '&times;';
        closeSpan.onclick = (e) => {
            e.stopPropagation();
            closeTab(tab.id);
        };
        
        tabElem.appendChild(iconSpan);
        tabElem.appendChild(titleSpan);
        tabElem.appendChild(closeSpan);
        tabsListElem.appendChild(tabElem);
    });
}

// 탭 추가 함수
function addNewTab(filePath = "", content = "") {
    if (tabs.length >= MAX_TABS) {
        alert("최대 탭 개수(10개)를 초과할 수 없다.");
        return null;
    }
    
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
    const newTab = {
        id: id,
        filePath: filePath || "noname.txt",
        content: content
    };
    
    tabs.push(newTab);
    activeTabId = id;
    
    currentFilePath = newTab.filePath;
    setValue(editorElement, newTab.content);
    updateTitleDisplay(currentFilePath);
    
    renderTabs();
    return newTab;
}

// 탭 전환 함수
function switchTab(id) {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab) {
        activeTab.content = getValue(editorElement);
    }
    
    const targetTab = tabs.find(t => t.id === id);
    if (!targetTab) return;
    
    activeTabId = id;
    currentFilePath = targetTab.filePath;
    setValue(editorElement, targetTab.content);
    updateTitleDisplay(currentFilePath);
    
    renderTabs();
}

// 탭 닫기 함수
function closeTab(id) {
    const tabIndex = tabs.findIndex(t => t.id === id);
    if (tabIndex === -1) return;
    
    if (tabs.length === 1) {
        if (window.apiClose) {
            window.apiClose();
        }
        return;
    }
    
    tabs.splice(tabIndex, 1);
    
    if (activeTabId === id) {
        const nextActiveIndex = tabIndex === 0 ? 0 : tabIndex - 1;
        const nextActiveTab = tabs[nextActiveIndex];
        activeTabId = nextActiveTab.id;
        currentFilePath = nextActiveTab.filePath;
        setValue(editorElement, nextActiveTab.content);
        updateTitleDisplay(currentFilePath);
    }
    
    renderTabs();
}
