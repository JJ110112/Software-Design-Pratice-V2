import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, orderBy, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// TODO: 請將以下 firebaseConfig 替換為您的 Firebase 專案金鑰
const firebaseConfig = {
    apiKey: "AIzaSyBrhpROyzAwz5FldPXGwFVyuJKFwIrNlqo",
    authDomain: "software-design-pratice.firebaseapp.com",
    projectId: "software-design-pratice",
    storageBucket: "software-design-pratice.firebasestorage.app",
    messagingSenderId: "911451146505",
    appId: "1:911451146505:web:a68442e94003714d016bd8",
    measurementId: "G-5MRVDNK2PQ"
};

let app, db;

// 檢查是否已填入有效金鑰
if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY_HERE") {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        console.log("🔥 Firebase Firestore 連線成功");
    } catch (e) {
        console.error("Firebase 初始化失敗:", e);
    }
} else {
    console.warn("⚠️ 尚未設定 Firebase 金鑰，系統將以本機 LocalStorage 模擬儲存過關紀錄。");
}

// ── 快取工具函式 (改用 localStorage，F5 不會清掉) ──
// TTL 預設 30 分鐘 (1800000ms)
const CACHE_TTL = 1800000;

function cacheGet(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (Date.now() - obj.time > CACHE_TTL) {
            localStorage.removeItem(key);
            return null;
        }
        return obj.data;
    } catch (e) {
        return null;
    }
}

function cacheSet(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify({ time: Date.now(), data }));
    } catch (e) {
        // localStorage 滿了就跳過
    }
}

function cacheAppend(key, newRecord) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const obj = JSON.parse(raw);
        obj.data.push(newRecord);
        localStorage.setItem(key, JSON.stringify(obj));
    } catch (e) {}
}

/**
 * 儲存使用者的過關成績到 Firestore
 */
window.saveScore = async function (className, userName, qID, gameMode, timeSpent, status = "PASS", stars = 3) {
    if (!db) {
        let localScores = JSON.parse(localStorage.getItem('local_scores') || '[]');
        localScores.push({ className, userName, qID, gameMode, timeSpent, status, stars, timestamp: new Date().toISOString() });
        localStorage.setItem('local_scores', JSON.stringify(localScores));
        return { success: true, localOnly: true };
    }

    try {
        // Sanitizing all inputs to prevent Firebase "Unsupported field value: undefined" synchronous crashes
        const newRecord = {
            className: className || "未分班", 
            userName: userName || "訪客", 
            qID: qID || "Q1", 
            gameMode: gameMode || "未知模式", 
            timeSpent: Number(timeSpent) || 0, 
            status: status || "PASS", 
            stars: Number(stars) || 1,
            timestamp: new Date().toISOString()
        };

        // Optimistic UI Update: 先同步更新個人快取，確保就算離線斷網，玩家回到地圖也能馬上看到星星！
        const cacheKey = `fb_cache_${newRecord.userName}`;
        cacheAppend(cacheKey, newRecord);

        // 讓排行榜／儀表板快取失效，下次重新撈
        localStorage.removeItem('fb_cache_overall_ranking');
        localStorage.removeItem('fb_cache_dashboard_teacher');

        // 接著才正式送出 DB。如果網路在此刻卡住 pends，至少前端遊戲已經顯示星星了！
        const docRef = await addDoc(collection(db, "scores"), newRecord);
        newRecord.id = docRef.id;

        return { success: true, id: docRef.id };
    } catch (e) {
        console.error("寫入 Firestore 錯誤:", e);
        return { success: false, error: e };
    }
};

/**
 * 從 Firestore 取得各關卡排行榜
 */
window.getLeaderboard = async function (qID, gameMode) {
    if (!db) {
        return [
            { className: "資訊二", userName: "王小明", timeSpent: 35, timestamp: new Date().toISOString() },
            { className: "電子二", userName: "林小華", timeSpent: 42, timestamp: new Date().toISOString() }
        ];
    }

    try {
        const q = query(
            collection(db, "scores"),
            where("qID", "==", qID),
            where("gameMode", "==", gameMode),
            where("status", "==", "PASS"),
            orderBy("timeSpent", "asc"),
            limit(10)
        );
        const snapshot = await getDocs(q);
        const results = [];
        snapshot.forEach(doc => results.push(doc.data()));
        return results;
    } catch (e) {
        console.error("載入排行榜失敗:", e);
        return [];
    }
};

/**
 * 教師儀表板專用 API
 * ✅ 改動：limit 500 → 50，改用 localStorage 快取
 */
window.getAllScoresForDashboard = async function () {
    if (!db) {
        return JSON.parse(localStorage.getItem('local_scores') || '[]');
    }

    const sysCacheKey = 'fb_cache_dashboard_teacher';
    const cached = cacheGet(sysCacheKey);
    if (cached) return cached;

    try {
        // ✅ 從 500 改成 50，大幅減少 reads
        const q = query(
            collection(db, "scores"),
            orderBy("timestamp", "desc"),
            limit(50)
        );
        const snapshot = await getDocs(q);
        const results = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            results.push(data);
        });

        cacheSet(sysCacheKey, results);
        return results;
    } catch (e) {
        console.error("載入儀表板資料失敗:", e);
        return [];
    }
};

/**
 * 資料庫模式名稱對應到 HTML 檔名
 */
const DB_TO_PAGE_MODE = {
    "英中單字配對": "連連看",
    "圖卡翻牌記憶": "記憶翻牌遊戲",
    "全程式撰寫": "獨立全程式撰寫"
};
function normalizeMode(mode) {
    return DB_TO_PAGE_MODE[mode] || mode;
}

/**
 * 取得特定使用者的所有紀錄
 * ✅ 改動：改用 localStorage 快取，TTL 30 分鐘
 */
window.getScoresForUser = async function (userName) {
    if (!db) {
        let localScores = JSON.parse(localStorage.getItem('local_scores') || '[]');
        return localScores.filter(s => s.userName === userName).map(s => {
            s.gameMode = normalizeMode(s.gameMode);
            return s;
        });
    }

    const cacheKey = `fb_cache_${userName}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
        const q = query(
            collection(db, "scores"),
            where("userName", "==", userName)
        );
        const snapshot = await getDocs(q);
        const results = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            data.gameMode = normalizeMode(data.gameMode);
            results.push(data);
        });

        cacheSet(cacheKey, results);
        return results;
    } catch (e) {
        console.error("載入個人紀錄失敗:", e);
        return [];
    }
};

/**
 * 取得綜合排行榜
 * ✅ 改動：改用 localStorage 快取，TTL 30 分鐘
 */
window.getOverallRanking = async function (classFilter = "ALL") {
    try {
        let results = [];
        if (!db) {
            results = JSON.parse(localStorage.getItem('local_scores') || '[]');
        } else {
            const sysCacheKey = 'fb_cache_overall_ranking';
            const cached = cacheGet(sysCacheKey);
            if (cached) {
                results = cached;
            } else {
                const q = query(
                    collection(db, "scores"),
                    orderBy("timestamp", "desc"),
                    limit(2000)
                );
                const snapshot = await getDocs(q);
                snapshot.forEach(doc => {
                    const data = doc.data();
                    data.id = doc.id;
                    results.push(data);
                });
                cacheSet(sysCacheKey, results);
            }
        }

        let filtered = results.filter(r => r.status === "PASS");
        if (classFilter !== "ALL") {
            filtered = filtered.filter(r => r.className === classFilter);
        }

        const studentMap = {};
        filtered.forEach(r => {
            const key = `${r.className}_${r.userName}`;
            if (!studentMap[key]) {
                studentMap[key] = {
                    className: r.className,
                    userName: r.userName,
                    bestLevelInfo: {}
                };
            }
            const s = studentMap[key];
            const levelKey = `${r.qID}_${r.gameMode}`;
            const currentStars = r.stars !== undefined ? r.stars : 1;
            const currentTime = parseInt(r.timeSpent) || 0;

            if (!s.bestLevelInfo[levelKey]) {
                s.bestLevelInfo[levelKey] = { stars: currentStars, timeSpent: currentTime };
            } else {
                const currentBest = s.bestLevelInfo[levelKey];
                if (currentStars > currentBest.stars || (currentStars === currentBest.stars && currentTime < currentBest.timeSpent)) {
                    s.bestLevelInfo[levelKey] = { stars: currentStars, timeSpent: currentTime };
                }
            }
        });

        const rankingList = Object.values(studentMap).map(s => {
            let totalStars = 0, totalBestTime = 0, uniqueClears = 0;
            for (let k in s.bestLevelInfo) {
                totalStars += s.bestLevelInfo[k].stars;
                totalBestTime += s.bestLevelInfo[k].timeSpent;
                uniqueClears++;
            }
            return { className: s.className, userName: s.userName, stars: totalStars, uniqueClears, totalBestTime };
        });

        rankingList.sort((a, b) => {
            if (b.stars !== a.stars) return b.stars - a.stars;
            if (a.totalBestTime !== b.totalBestTime) return a.totalBestTime - b.totalBestTime;
            return b.uniqueClears - a.uniqueClears;
        });

        return rankingList;
    } catch (e) {
        console.error("載入綜合排行榜失敗:", e);
        return [];
    }
};

// ── Global dynamic styling for Stages ──
const MODE_TO_STAGE = {
    '連連看': 1, '記憶翻牌遊戲': 1, '中英選擇題': 1,
    '一行程式碼翻譯': 2, '錯誤找找看': 2, '程式碼朗讀練習': 2,
    '程式碼排列重組': 3, '程式與結果配對': 3, '逐行中文注解填空': 3,
    '程式填空': 4, '看中文寫程式': 4,
    '獨立全程式撰寫': 5, '打字練習': 5, '打字-關鍵字': 5, '打字-單行': 5, '打字-完整': 5, '錯誤程式除錯': 5, '模擬考': 5
};

/**
 * 取得特定使用者的星數統計
 */
window.getUserStarStats = async function (userName) {
    const scores = await window.getScoresForUser(userName);
    const passScores = scores.filter(s => s.status === 'PASS');

    const levelStars = {};
    passScores.forEach(r => {
        const key = `${r.qID}_${r.gameMode}`;
        const stars = r.stars !== undefined ? r.stars : 1;
        if (!levelStars[key] || stars > levelStars[key].stars) {
            levelStars[key] = { stars, mode: r.gameMode };
        }
    });

    let currentStars = 0;
    const stageStars = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const modeStars = {};

    for (let k in levelStars) {
        const entry = levelStars[k];
        currentStars += entry.stars;
        const stage = MODE_TO_STAGE[entry.mode] || 1;
        stageStars[stage] += entry.stars;
        modeStars[entry.mode] = (modeStars[entry.mode] || 0) + entry.stars;
    }

    return {
        currentStars,
        totalPossibleStars: 912,
        stageStars,
        modeStars
    };
};

window.addEventListener('DOMContentLoaded', () => {
    const p = window.location.pathname;
    const isMap = p.includes('map.html');
    const isLevel = p.includes('/pages/') && !isMap;

    function applyStageBg(mode) {
        if (!mode) return 1;
        const stage = MODE_TO_STAGE[mode] || 1;
        document.body.className = document.body.className.replace(/stage-bg-\d/g, '').trim();
        document.body.classList.add('stage-bg-' + stage);
        return stage;
    }

    if (isMap) {
        const urlParams = new URLSearchParams(window.location.search);
        let currentMode = urlParams.get('mode');
        if (!currentMode) {
            const activeChip = document.querySelector('.mode-chip.active');
            if (activeChip) currentMode = activeChip.textContent.trim();
        }
        applyStageBg(currentMode || '連連看');

        document.querySelectorAll('.mode-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                applyStageBg(btn.textContent.trim());
            });
        });
    }

    if (isLevel) {
        let modeName = decodeURIComponent(p.split('/').pop().replace('.html', ''));
        const stage = applyStageBg(modeName);

        const urlParams = new URLSearchParams(window.location.search);
        const qID = urlParams.get('q') || 'Q1';

        let qTitle = '';
        if (typeof QUIZ_DATA !== 'undefined' && QUIZ_DATA[qID]) {
            qTitle = QUIZ_DATA[qID].title;
        } else {
            const h1 = document.querySelector('h1');
            if (h1) qTitle = h1.textContent.replace(modeName, '').trim();
        }

        const tID = urlParams.get('t') || '';
        const topBar = document.createElement('div');
        topBar.className = 'level-top-bar stage-bar-' + stage;
        let tStr = qID === 'SETUP' ? 'Form1_Load(表單載入)' : (qID + ' ' + qTitle + (tID ? '(' + tID + ')' : ''));
        topBar.innerHTML = '<span class="level-top-bar-title">' + tStr + ' ' + modeName + '</span>';

        const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        if (user && typeof window.getUserStarStats === 'function') {
            window.getUserStarStats(user.name).then(stats => {
                const starBadge = document.createElement('div');
                starBadge.style.cssText = 'background: rgba(0,0,0,0.3); padding: 4px 12px; border-radius: 20px; font-weight: bold; font-size: 0.85rem; color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); z-index: 8500; white-space: nowrap; margin-left: auto; margin-right: clamp(170px, 15vw, 210px); flex-shrink: 0;';
                const userInfoSpan = `<span style="color: #e2e8f0; font-weight: normal; margin-right: 10px;">${user.className || ''} <span style="font-weight: 800; color: #fff;">${user.name}</span></span>`;
                starBadge.innerHTML = `${userInfoSpan}⭐ ${stats.currentStars} / ${stats.totalPossibleStars}`;
                topBar.appendChild(starBadge);
            });
        }

        document.body.prepend(topBar);

        const toolbar = document.querySelector('.game-toolbar');
        if (toolbar) toolbar.style.top = '10px';

        const gameSec = document.querySelector('.game-section');
        if (gameSec) {
            gameSec.style.marginTop = '85px';
        } else {
            document.body.style.paddingTop = '95px';
        }
    }
});
