const http = require('http');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
const PORT = process.env.API_PORT || 3333;

// 確保資料目錄與檔案存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SCORES_FILE)) fs.writeFileSync(SCORES_FILE, '[]', 'utf8');

// ── 讀寫 JSON ──

function readScores() {
    try {
        return JSON.parse(fs.readFileSync(SCORES_FILE, 'utf8'));
    } catch {
        return [];
    }
}

function writeScores(scores) {
    fs.writeFileSync(SCORES_FILE, JSON.stringify(scores, null, 2), 'utf8');
}

let idCounter = Date.now();
function nextId() {
    return String(idCounter++);
}

// ── HTTP 伺服器 ──

const server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // POST /api/scores — 新增成績
    if (req.method === 'POST' && pathname === '/api/scores') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const record = JSON.parse(body);
                record.id = nextId();
                if (!record.timestamp) record.timestamp = new Date().toISOString();
                const scores = readScores();
                scores.push(record);
                writeScores(scores);
                json(res, 201, { success: true, id: record.id });
            } catch (e) {
                json(res, 400, { error: 'Invalid JSON' });
            }
        });
        return;
    }

    // POST /api/scores/batch — 批次新增（離線同步用）
    if (req.method === 'POST' && pathname === '/api/scores/batch') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const records = JSON.parse(body);
                if (!Array.isArray(records)) { json(res, 400, { error: 'Expected array' }); return; }
                const scores = readScores();
                const ids = [];
                for (const record of records) {
                    record.id = nextId();
                    if (!record.timestamp) record.timestamp = new Date().toISOString();
                    scores.push(record);
                    ids.push(record.id);
                }
                writeScores(scores);
                json(res, 201, { success: true, count: ids.length, ids });
            } catch (e) {
                json(res, 400, { error: 'Invalid JSON' });
            }
        });
        return;
    }

    // GET /api/scores — 查詢成績（支援篩選、排序、限制筆數）
    if (req.method === 'GET' && pathname === '/api/scores') {
        const scores = readScores();
        let results = scores;

        // 篩選
        const userName = url.searchParams.get('userName');
        const status = url.searchParams.get('status');
        const qID = url.searchParams.get('qID');
        const gameMode = url.searchParams.get('gameMode');
        const excludeClass = url.searchParams.get('excludeClass');

        if (userName) results = results.filter(r => r.userName === userName);
        if (status) results = results.filter(r => r.status === status);
        if (qID) results = results.filter(r => r.qID === qID);
        if (gameMode) results = results.filter(r => r.gameMode === gameMode);
        if (excludeClass) {
            const excluded = excludeClass.split(',').map(s => s.trim());
            results = results.filter(r => !excluded.includes(r.className));
        }

        // 排序
        const sortBy = url.searchParams.get('sortBy');
        const sortOrder = url.searchParams.get('sortOrder') || 'asc';
        if (sortBy) {
            results.sort((a, b) => {
                const va = a[sortBy], vb = b[sortBy];
                if (va == null && vb == null) return 0;
                if (va == null) return 1;
                if (vb == null) return -1;
                if (typeof va === 'number' && typeof vb === 'number') {
                    return sortOrder === 'desc' ? vb - va : va - vb;
                }
                return sortOrder === 'desc'
                    ? String(vb).localeCompare(String(va))
                    : String(va).localeCompare(String(vb));
            });
        }

        // 限制筆數
        const limitParam = url.searchParams.get('limit');
        if (limitParam) results = results.slice(0, parseInt(limitParam));

        json(res, 200, results);
        return;
    }

    // GET /api/health — 健康檢查
    if (req.method === 'GET' && pathname === '/api/health') {
        json(res, 200, { status: 'ok', scores: readScores().length });
        return;
    }

    // POST|DELETE /api/scores/test-data — 刪除測試資料（保留 __TEST__ 教師）
    if ((req.method === 'POST' || req.method === 'DELETE') && pathname === '/api/scores/test-data') {
        const scores = readScores();
        const kept = scores.filter(r => r.className === '__TEST__');
        const removed = scores.length - kept.length;
        writeScores(kept);
        json(res, 200, { success: true, removed, remaining: kept.length });
        return;
    }

    // 404
    json(res, 404, { error: 'Not found' });
});

function json(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
}

server.listen(PORT, () => {
    console.log(`📦 JSON API server running on http://localhost:${PORT}`);
    console.log(`   Data file: ${SCORES_FILE}`);
});
