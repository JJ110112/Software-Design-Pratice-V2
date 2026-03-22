const CLASS_ROSTER = {
    "資訊二": [
        { no: 1, name: "李亦澄" },
        { no: 2, name: "湯仁民" },
        { no: 3, name: "徐子翔" },
        { no: 4, name: "楊秉閔" },
        { no: 5, name: "楊斯晴" },
        { no: 6, name: "薛明全" },
        { no: 7, name: "李景豪" },
        { no: 8, name: "白旻承" },
        { no: 9, name: "吳憶軒" },
        { no: 10, name: "林秦穎" },
        { no: 11, name: "張淳恩" },
        { no: 13, name: "陳宗佑" },
        { no: 15, name: "陳毅弘" },
        { no: 16, name: "辜竑誌" },
        { no: 17, name: "楊俊毅" },
        { no: 18, name: "葉芃承" },
        { no: 20, name: "賴英傑" },
        { no: 22, name: "簡恩璟" },
        { no: 23, name: "顏泓毅" },
        { no: 25, name: "邱文馨" }
    ],
    "電子二": [
        { no: 1, name: "梁博凱" },
        { no: 2, name: "梁博鈞" },
        { no: 5, name: "林品諠" },
        { no: 6, name: "林毅恩" },
        { no: 7, name: "徐楷倫" },
        { no: 8, name: "郭宥廷" },
        { no: 12, name: "游宗翰" },
        { no: 13, name: "葉兆洺" },
        { no: 14, name: "楊善崴" }
    ]
};

// ── 登入儲存策略 ──
// 預設用 sessionStorage（關瀏覽器自動登出）
// 勾選「保持登入」時用 localStorage（永久）
const SESSION_KEY = 'sw_quiz_user';
const PERSIST_KEY = 'sw_quiz_persist'; // 'true' = 永久登入
const IDLE_TIMEOUT = 30 * 60 * 1000;  // 30 分鐘閒置登出
let idleTimer = null;

function _getStorage() {
    return localStorage.getItem(PERSIST_KEY) === 'true' ? localStorage : sessionStorage;
}

// 工具函式：取得當前登入的使用者
function getCurrentUser() {
    // 先查 sessionStorage，再查 localStorage（永久登入）
    let raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const user = JSON.parse(raw);

    // 檢查閒置時間（永久登入不檢查）
    if (localStorage.getItem(PERSIST_KEY) !== 'true' && user.lastActive) {
        const idle = Date.now() - new Date(user.lastActive).getTime();
        if (idle > IDLE_TIMEOUT) {
            logoutUser();
            return null;
        }
    }
    return user;
}

// 工具函式：設定登入
function loginUser(className, studentNo, studentName, persist = false) {
    const userData = {
        className: className,
        no: studentNo,
        name: studentName,
        loginTime: new Date().toISOString(),
        lastActive: new Date().toISOString()
    };
    const userStr = JSON.stringify(userData);

    if (persist) {
        localStorage.setItem(PERSIST_KEY, 'true');
        localStorage.setItem(SESSION_KEY, userStr);
    } else {
        localStorage.removeItem(PERSIST_KEY);
        localStorage.removeItem(SESSION_KEY);
        sessionStorage.setItem(SESSION_KEY, userStr);
    }

    // 登入時觸發雲端同步
    if (typeof window.syncOnLogin === 'function') {
        window.syncOnLogin(studentName);
    }

    // 啟動閒置計時
    resetIdleTimer();
}

// 工具函式：登出
function logoutUser() {
    const user = getCurrentUser();
    if (user && typeof window.syncOnLogout === 'function') {
        window.syncOnLogout(user.name);
    }
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(PERSIST_KEY);
    clearTimeout(idleTimer);
}

// ── 閒置自動登出 ──
function resetIdleTimer() {
    if (localStorage.getItem(PERSIST_KEY) === 'true') return; // 永久登入不計時

    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        const user = getCurrentUser();
        if (user) {
            logoutUser();
            alert('已閒置超過 30 分鐘，系統已自動登出。');
            window.location.href = window.location.pathname.includes('/pages/') ? '../index.html' : 'index.html';
        }
    }, IDLE_TIMEOUT);

    // 更新 lastActive
    const storage = _getStorage();
    const raw = storage.getItem(SESSION_KEY);
    if (raw) {
        const user = JSON.parse(raw);
        user.lastActive = new Date().toISOString();
        storage.setItem(SESSION_KEY, JSON.stringify(user));
    }
}

// 監聽使用者活動，重置閒置計時
['click', 'keydown', 'mousemove', 'touchstart', 'scroll'].forEach(evt => {
    document.addEventListener(evt, () => {
        if (getCurrentUser()) resetIdleTimer();
    }, { passive: true });
});

// 頁面載入時啟動閒置計時
if (getCurrentUser()) resetIdleTimer();

// 全域登入防護
(function enforceLogin() {
    const path = window.location.pathname;
    const isIndex = path.endsWith('index.html') || path === '/' || path.endsWith('/Software%20Design%20Pratice/') || path.endsWith('/Software-Design-Pratice-V1.01/');
    if (!getCurrentUser() && !isIndex) {
        window.location.href = '../index.html';
    }
})();
