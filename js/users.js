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

// 工具函式：取得當前登入的使用者
function getCurrentUser() {
    const user = localStorage.getItem('sw_quiz_user');
    return user ? JSON.parse(user) : null;
}

// 工具函式：設定登入
function loginUser(className, studentNo, studentName) {
    const userStr = JSON.stringify({
        className: className,
        no: studentNo,
        name: studentName,
        loginTime: new Date().toISOString()
    });
    localStorage.setItem('sw_quiz_user', userStr);
    // 登入時觸發雲端同步
    if (typeof window.syncOnLogin === 'function') {
        window.syncOnLogin(studentName);
    }
}

// 工具函式：登出
function logoutUser() {
    const user = getCurrentUser();
    // 登出時清除快取
    if (user && typeof window.syncOnLogout === 'function') {
        window.syncOnLogout(user.name);
    }
    localStorage.removeItem('sw_quiz_user');
}

// 全域登入防護
(function enforceLogin() {
    const path = window.location.pathname;
    const isIndex = path.endsWith('index.html') || path === '/' || path.endsWith('/Software%20Design%20Pratice/') || path.endsWith('/Software-Design-Pratice-V1.01/');
    if (!getCurrentUser() && !isIndex) {
        window.location.href = '../index.html';
    }
})();
