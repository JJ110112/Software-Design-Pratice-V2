// ── JSON API 設定 ──
const API_BASE = window.API_BASE || `${window.location.protocol}//${window.location.hostname}:3333`;

let apiReady = false;

// 啟動時檢查 API 是否可用，其他函式可 await 此 Promise
const apiReadyPromise = (async () => {
    try {
        const r = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
        if (r.ok) { apiReady = true; console.log("📦 JSON API 連線成功"); }
    } catch (e) {
        console.warn("⚠️ JSON API 無法連線，系統將以本機 LocalStorage 模擬儲存過關紀錄。");
    }
})();

// ── 快取工具函式 (改用 localStorage，F5 不會清掉) ──
// TTL 預設 2 小時
const CACHE_TTL = 7200000;

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
        if (!raw) {
            cacheSet(key, [newRecord]);
            return;
        }
        const obj = JSON.parse(raw);
        if (!Array.isArray(obj.data)) obj.data = [];
        obj.data.push(newRecord);
        obj.time = Date.now();
        localStorage.setItem(key, JSON.stringify(obj));
    } catch (e) {}
}

// ── 同步機制 ──

/**
 * 登入時：嘗試上傳離線成績（不清除快取）
 */
window.syncOnLogin = async function (userName) {
    if (!apiReady || !userName) return;
    await window.syncOfflineScores(userName);
};

/**
 * 登出時：清除該使用者的快取
 */
window.syncOnLogout = function (userName) {
    if (userName) localStorage.removeItem(`fb_cache_${userName}`);
    localStorage.removeItem('fb_cache_overall_ranking');
    localStorage.removeItem('fb_cache_dashboard_teacher');
};

/**
 * 回到 map 頁面時：節流背景同步（每 10 分鐘最多一次）
 * 快取有效時直接用快取，不額外查 API
 */
const SYNC_COOLDOWN = 600000; // 10 分鐘
window.syncOnMapLoad = async function (userName) {
    if (!apiReady || !userName) return;
    await window.syncOfflineScores(userName);
    const lastSyncKey = `last_sync_${userName}`;
    const lastSync = parseInt(localStorage.getItem(lastSyncKey) || '0');
    if (Date.now() - lastSync < SYNC_COOLDOWN) return;
    localStorage.setItem(lastSyncKey, String(Date.now()));
    try {
        const r = await fetch(`${API_BASE}/api/scores?userName=${encodeURIComponent(userName)}`);
        const apiResults = await r.json();
        apiResults.forEach(r => { r.gameMode = normalizeMode(r.gameMode); });
        const cacheKey = `fb_cache_${userName}`;
        const cached = cacheGet(cacheKey) || [];
        const cachedIds = new Set(cached.filter(r => r.id).map(r => r.id));
        const cachedKeys = new Set(cached.map(r => `${r.qID}_${r.gameMode}_${r.timestamp}`));
        let added = 0;
        apiResults.forEach(r => {
            if (r.id && !cachedIds.has(r.id)) {
                const key = `${r.qID}_${r.gameMode}_${r.timestamp}`;
                if (!cachedKeys.has(key)) { cached.push(r); added++; }
            }
        });
        if (added > 0) cacheSet(cacheKey, cached);
    } catch (e) {
        console.error("背景同步失敗:", e);
    }
};

/**
 * 離線成績重試：把 local_scores 中未上傳的補傳到 API
 */
window.syncOfflineScores = async function (userName) {
    if (!apiReady) return;
    let localScores = JSON.parse(localStorage.getItem('local_scores') || '[]');
    if (localScores.length === 0) return;
    const toUpload = userName ? localScores.filter(s => s.userName === userName) : localScores;
    const remaining = userName ? localScores.filter(s => s.userName !== userName) : [];
    try {
        const r = await fetch(`${API_BASE}/api/scores/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toUpload)
        });
        if (r.ok) {
            const result = await r.json();
            console.log(`✅ 離線成績補傳: ${result.count} 筆`);
        } else {
            remaining.push(...toUpload);
        }
    } catch (e) {
        remaining.push(...toUpload);
    }
    localStorage.setItem('local_scores', JSON.stringify(remaining));
};

/**
 * 儲存使用者的過關成績到 JSON API
 * 策略：先寫入本地快取（樂觀更新），再嘗試寫 API
 *        如果 API 失敗，同時存入 local_scores 備份
 */
window.saveScore = async function (className, userName, qID, gameMode, timeSpent, status = "PASS", stars = 3) {
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

    // 1. 永遠先寫入本地快取（樂觀更新，確保星星立即可見）
    const cacheKey = `fb_cache_${newRecord.userName}`;
    cacheAppend(cacheKey, newRecord);

    // 2. 嘗試寫入 API
    if (!apiReady) {
        console.warn("⚠️ saveScore: API 未連線，成績僅存本地", newRecord.qID, newRecord.gameMode);
        let localScores = JSON.parse(localStorage.getItem('local_scores') || '[]');
        localScores.push(newRecord);
        localStorage.setItem('local_scores', JSON.stringify(localScores));
        return { success: true, localOnly: true };
    }

    try {
        const r = await fetch(`${API_BASE}/api/scores`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newRecord)
        });
        const result = await r.json();
        if (r.ok) {
            newRecord.id = result.id;
            console.log("✅ API 寫入成功:", newRecord.qID, newRecord.gameMode, "stars:", newRecord.stars);
            return { success: true, id: result.id };
        }
        throw new Error(result.error || 'API error');
    } catch (e) {
        console.error("❌ API 寫入失敗:", e.message);
        let localScores = JSON.parse(localStorage.getItem('local_scores') || '[]');
        localScores.push(newRecord);
        localStorage.setItem('local_scores', JSON.stringify(localScores));
        return { success: false, error: e, backedUp: true };
    }
};

/**
 * 從 API 取得各關卡排行榜
 */
window.getLeaderboard = async function (qID, gameMode) {
    if (!apiReady) {
        return [
            { className: "資訊二", userName: "王小明", timeSpent: 35, timestamp: new Date().toISOString() },
            { className: "電子二", userName: "林小華", timeSpent: 42, timestamp: new Date().toISOString() }
        ];
    }

    try {
        const params = new URLSearchParams({
            qID, gameMode, status: 'PASS',
            sortBy: 'timeSpent', sortOrder: 'asc', limit: '10'
        });
        const r = await fetch(`${API_BASE}/api/scores?${params}`);
        return await r.json();
    } catch (e) {
        console.error("載入排行榜失敗:", e);
        return [];
    }
};

/**
 * 教師儀表板專用 API
 */
window.getAllScoresForDashboard = async function () {
    if (!apiReady) {
        return JSON.parse(localStorage.getItem('local_scores') || '[]');
    }

    const sysCacheKey = 'fb_cache_dashboard_teacher';
    const DASH_TTL = 14400000; // 4 小時
    try {
        const raw = localStorage.getItem(sysCacheKey);
        if (raw) { const obj = JSON.parse(raw); if (Date.now() - obj.time < DASH_TTL) return obj.data; }
    } catch(e) {}

    try {
        const params = new URLSearchParams({
            sortBy: 'timestamp', sortOrder: 'desc',
            limit: '500', excludeClass: '測試用'
        });
        const r = await fetch(`${API_BASE}/api/scores?${params}`);
        const results = await r.json();
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
 */
window.getScoresForUser = async function (userName) {
    function mergeLocalScores(results, userName) {
        const localScores = JSON.parse(localStorage.getItem('local_scores') || '[]');
        const pending = localScores.filter(s => s.userName === userName);
        if (pending.length > 0) {
            const existingKeys = new Set(results.map(r => `${r.qID}_${r.gameMode}_${r.timestamp}`));
            pending.forEach(s => {
                s.gameMode = normalizeMode(s.gameMode);
                const key = `${s.qID}_${s.gameMode}_${s.timestamp}`;
                if (!existingKeys.has(key)) results.push(s);
            });
        }
        return results;
    }

    await apiReadyPromise;

    if (!apiReady) {
        let localScores = JSON.parse(localStorage.getItem('local_scores') || '[]');
        return localScores.filter(s => s.userName === userName).map(s => {
            s.gameMode = normalizeMode(s.gameMode);
            return s;
        });
    }

    const cacheKey = `fb_cache_${userName}`;
    const cached = cacheGet(cacheKey);
    if (cached) return mergeLocalScores(cached, userName);

    try {
        const r = await fetch(`${API_BASE}/api/scores?userName=${encodeURIComponent(userName)}`);
        const results = await r.json();
        results.forEach(r => { r.gameMode = normalizeMode(r.gameMode); });
        cacheSet(cacheKey, results);
        return mergeLocalScores(results, userName);
    } catch (e) {
        console.error("載入個人紀錄失敗:", e);
        const fallback = cacheGet(cacheKey) || [];
        return mergeLocalScores(fallback, userName);
    }
};

/**
 * 取得綜合排行榜
 */
window.getOverallRanking = async function (classFilter = "ALL") {
    try {
        let results = [];
        if (!apiReady) {
            results = JSON.parse(localStorage.getItem('local_scores') || '[]');
        } else {
            const sysCacheKey = 'fb_cache_overall_ranking';
            const RANKING_TTL = 14400000; // 4 小時
            try {
                const raw = localStorage.getItem(sysCacheKey);
                if (raw) {
                    const obj = JSON.parse(raw);
                    if (Date.now() - obj.time < RANKING_TTL) {
                        results = obj.data;
                    }
                }
            } catch(e) {}
            if (results.length === 0) {
                const r = await fetch(`${API_BASE}/api/scores?status=PASS`);
                results = await r.json();
                try { localStorage.setItem(sysCacheKey, JSON.stringify({ time: Date.now(), data: results })); } catch(e) {}
            }
        }

        let filtered = results.filter(r => r.status === "PASS" && r.className !== '測試用');
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
    '打字-關鍵字': 4, '打字-單行': 4, '看中文寫程式': 4, '打字-完整': 4, '打字練習': 4,
    '程式填空': 5, '獨立全程式撰寫': 5, '錯誤程式除錯': 5, '模擬考': 5
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

    // 每個模式最多 19 關 × 3 星 = 57 星，防止超額
    for (let m in modeStars) {
        if (modeStars[m] > 57) modeStars[m] = 57;
    }
    currentStars = Object.values(modeStars).reduce((a, b) => a + b, 0);
    for (let s = 1; s <= 5; s++) stageStars[s] = 0;
    for (let k in levelStars) {
        const entry = levelStars[k];
        const stage = MODE_TO_STAGE[entry.mode] || 1;
        stageStars[stage] += entry.stars;
    }
    const STAGE_MAX = { 1: 171, 2: 171, 3: 171, 4: 228, 5: 171 };
    for (let s = 1; s <= 5; s++) {
        if (stageStars[s] > STAGE_MAX[s]) stageStars[s] = STAGE_MAX[s];
    }
    currentStars = Math.min(currentStars, 912);

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
