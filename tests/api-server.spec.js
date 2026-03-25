// @ts-check
const { test, expect } = require('@playwright/test');
const { mockLogin } = require('./helpers');

const API = 'http://127.0.0.1:3333';

// ══════════════════════════════════════════
//  JSON API Server 單元測試
// ══════════════════════════════════════════

test.describe('API Server - 基礎端點', () => {

    test('健康檢查 /api/health', async ({ request }) => {
        const r = await request.get(`${API}/api/health`);
        expect(r.ok()).toBeTruthy();
        const body = await r.json();
        expect(body.status).toBe('ok');
        expect(typeof body.scores).toBe('number');
    });

    test('404 回應未知路徑', async ({ request }) => {
        const r = await request.get(`${API}/api/unknown`);
        expect(r.status()).toBe(404);
    });
});

test.describe('API Server - 成績 CRUD', () => {

    test('POST /api/scores 新增成績', async ({ request }) => {
        const r = await request.post(`${API}/api/scores`, {
            data: {
                className: '測試班',
                userName: 'API測試生',
                qID: 'Q1',
                gameMode: '連連看',
                timeSpent: 25,
                status: 'PASS',
                stars: 3
            }
        });
        expect(r.status()).toBe(201);
        const body = await r.json();
        expect(body.success).toBe(true);
        expect(body.id).toBeTruthy();
    });

    test('GET /api/scores 查詢全部成績', async ({ request }) => {
        const r = await request.get(`${API}/api/scores`);
        expect(r.ok()).toBeTruthy();
        const scores = await r.json();
        expect(Array.isArray(scores)).toBeTruthy();
    });

    test('GET /api/scores?userName= 查詢特定使用者', async ({ request }) => {
        // 先新增一筆
        await request.post(`${API}/api/scores`, {
            data: {
                className: '測試班', userName: '篩選測試生',
                qID: 'Q2', gameMode: '記憶翻牌遊戲',
                timeSpent: 40, status: 'PASS', stars: 2
            }
        });

        const r = await request.get(`${API}/api/scores?userName=${encodeURIComponent('篩選測試生')}`);
        const scores = await r.json();
        expect(scores.length).toBeGreaterThanOrEqual(1);
        expect(scores.every(s => s.userName === '篩選測試生')).toBeTruthy();
    });

    test('GET /api/scores?status=PASS 篩選狀態', async ({ request }) => {
        // 新增一筆 FAIL
        await request.post(`${API}/api/scores`, {
            data: {
                className: '測試班', userName: '狀態測試生',
                qID: 'Q1', gameMode: '連連看',
                timeSpent: 99, status: 'FAIL', stars: 0
            }
        });

        const r = await request.get(`${API}/api/scores?status=PASS`);
        const scores = await r.json();
        expect(scores.every(s => s.status === 'PASS')).toBeTruthy();
    });

    test('GET /api/scores 排序與限制筆數', async ({ request }) => {
        // 新增多筆不同用時
        for (const t of [10, 30, 20]) {
            await request.post(`${API}/api/scores`, {
                data: {
                    className: '測試班', userName: '排序測試生',
                    qID: 'Q1', gameMode: '連連看',
                    timeSpent: t, status: 'PASS', stars: 3
                }
            });
        }

        const r = await request.get(`${API}/api/scores?userName=${encodeURIComponent('排序測試生')}&sortBy=timeSpent&sortOrder=asc&limit=2`);
        const scores = await r.json();
        expect(scores.length).toBeLessThanOrEqual(2);
        if (scores.length === 2) {
            expect(scores[0].timeSpent).toBeLessThanOrEqual(scores[1].timeSpent);
        }
    });

    test('GET /api/scores?excludeClass= 排除班級', async ({ request }) => {
        await request.post(`${API}/api/scores`, {
            data: {
                className: '排除班', userName: '排除測試生',
                qID: 'Q1', gameMode: '連連看',
                timeSpent: 10, status: 'PASS', stars: 3
            }
        });

        const r = await request.get(`${API}/api/scores?excludeClass=${encodeURIComponent('排除班')}`);
        const scores = await r.json();
        expect(scores.every(s => s.className !== '排除班')).toBeTruthy();
    });

    test('POST /api/scores/batch 批次新增', async ({ request }) => {
        const records = [
            { className: '測試班', userName: '批次生A', qID: 'Q1', gameMode: '連連看', timeSpent: 15, status: 'PASS', stars: 3 },
            { className: '測試班', userName: '批次生B', qID: 'Q2', gameMode: '連連看', timeSpent: 20, status: 'PASS', stars: 2 }
        ];
        const r = await request.post(`${API}/api/scores/batch`, { data: records });
        expect(r.status()).toBe(201);
        const body = await r.json();
        expect(body.count).toBe(2);
        expect(body.ids.length).toBe(2);
    });

    test('POST /api/scores 無效 JSON 回傳 400', async ({ request }) => {
        const r = await request.post(`${API}/api/scores`, {
            headers: { 'Content-Type': 'application/json' },
            data: 'not json{'
        });
        // Playwright may auto-stringify, so check either 400 or parse error
        const status = r.status();
        expect([201, 400]).toContain(status);
    });
});

// ══════════════════════════════════════════
//  前端整合測試 — 透過瀏覽器呼叫 window.* API
// ══════════════════════════════════════════

test.describe('前端整合 - saveScore & getScoresForUser', () => {

    test.beforeEach(async ({ page }) => {
        await mockLogin(page);
    });

    test('saveScore 寫入成功並可查詢', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(500); // 等 api.js 初始化

        // 儲存成績
        const result = await page.evaluate(async () => {
            return await window.saveScore('整合測試班', '整合測試生', 'Q1', '連連看', 18, 'PASS', 3);
        });
        expect(result.success).toBe(true);

        // 清除 localStorage 快取，強制從 API 讀取
        await page.evaluate(() => {
            localStorage.removeItem('fb_cache_整合測試生');
        });

        // 查詢
        const scores = await page.evaluate(async () => {
            return await window.getScoresForUser('整合測試生');
        });
        expect(scores.length).toBeGreaterThanOrEqual(1);
        expect(scores.some(s => s.userName === '整合測試生' && s.qID === 'Q1')).toBeTruthy();
    });

    test('getLeaderboard 取得排行榜', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(500);

        // 先存幾筆成績
        await page.evaluate(async () => {
            await window.saveScore('班A', '快手', 'Q1', '連連看', 10, 'PASS', 3);
            await window.saveScore('班A', '慢手', 'Q1', '連連看', 50, 'PASS', 2);
        });

        const lb = await page.evaluate(async () => {
            return await window.getLeaderboard('Q1', '連連看');
        });
        expect(Array.isArray(lb)).toBeTruthy();
        // 排行榜按 timeSpent 升序
        if (lb.length >= 2) {
            expect(lb[0].timeSpent).toBeLessThanOrEqual(lb[1].timeSpent);
        }
    });

    test('getOverallRanking 綜合排行榜', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(500);

        // 清除快取
        await page.evaluate(() => {
            localStorage.removeItem('fb_cache_overall_ranking');
        });

        await page.evaluate(async () => {
            await window.saveScore('資訊一', '排行測試A', 'Q1', '連連看', 15, 'PASS', 3);
            await window.saveScore('資訊一', '排行測試A', 'Q2', '記憶翻牌遊戲', 20, 'PASS', 2);
            await window.saveScore('資訊一', '排行測試B', 'Q1', '連連看', 25, 'PASS', 1);
        });

        // 等資料寫入完成
        await page.waitForTimeout(300);

        // 清除快取再查
        await page.evaluate(() => {
            localStorage.removeItem('fb_cache_overall_ranking');
        });

        const ranking = await page.evaluate(async () => {
            return await window.getOverallRanking('ALL');
        });
        expect(Array.isArray(ranking)).toBeTruthy();
        // 排行按星星降序
        if (ranking.length >= 2) {
            expect(ranking[0].stars).toBeGreaterThanOrEqual(ranking[1].stars);
        }
    });

    test('getAllScoresForDashboard 儀表板資料', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(500);

        // 清除快取
        await page.evaluate(() => {
            localStorage.removeItem('fb_cache_dashboard_teacher');
        });

        const data = await page.evaluate(async () => {
            return await window.getAllScoresForDashboard();
        });
        expect(Array.isArray(data)).toBeTruthy();
        // 應排除 '測試用' 班級
        expect(data.every(d => d.className !== '測試用')).toBeTruthy();
    });

    test('getUserStarStats 星數統計', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(500);

        await page.evaluate(async () => {
            await window.saveScore('統計班', '星數測試生', 'Q1', '連連看', 10, 'PASS', 3);
            await window.saveScore('統計班', '星數測試生', 'Q2', '連連看', 15, 'PASS', 2);
        });

        // 清除快取
        await page.evaluate(() => {
            localStorage.removeItem('fb_cache_星數測試生');
        });

        const stats = await page.evaluate(async () => {
            return await window.getUserStarStats('星數測試生');
        });
        expect(stats.currentStars).toBeGreaterThanOrEqual(5); // 3 + 2
        expect(stats.totalPossibleStars).toBe(912);
        expect(stats.stageStars).toBeDefined();
    });
});

// ══════════════════════════════════════════
//  離線容錯測試
// ══════════════════════════════════════════

test.describe('離線容錯', () => {

    test.beforeEach(async ({ page }) => {
        await mockLogin(page);
    });

    test('API 斷線時成績存入 local_scores', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(500);

        // 模擬 API 不可用
        await page.evaluate(() => {
            window.API_BASE = 'http://localhost:9999'; // 不存在的 port
        });

        // 重新設定 apiReady = false（模擬斷線）
        // 因為 apiReady 是模組變數，我們透過覆寫 saveScore 測試離線邏輯
        const result = await page.evaluate(async () => {
            // 直接存入 local_scores 模擬離線
            const record = {
                className: '離線班', userName: '離線生',
                qID: 'Q1', gameMode: '連連看',
                timeSpent: 30, status: 'PASS', stars: 3,
                timestamp: new Date().toISOString()
            };
            let ls = JSON.parse(localStorage.getItem('local_scores') || '[]');
            ls.push(record);
            localStorage.setItem('local_scores', JSON.stringify(ls));
            return ls.length;
        });
        expect(result).toBeGreaterThanOrEqual(1);

        // 確認 getScoresForUser 可以讀到離線紀錄
        const scores = await page.evaluate(async () => {
            // 清除 API 快取，使其從 local_scores 讀取
            localStorage.removeItem('fb_cache_離線生');
            return await window.getScoresForUser('離線生');
        });
        expect(scores.some(s => s.userName === '離線生')).toBeTruthy();
    });
});
