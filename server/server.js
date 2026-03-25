const http = require('http');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
const PORT = process.env.API_PORT || 3333;

// ── 安全設定 ──
const MAX_BODY_SIZE = 512 * 1024;           // 請求 body 上限 512KB
const RATE_LIMIT_WINDOW = 60 * 1000;        // 速率限制窗口 60 秒
const RATE_LIMIT_MAX = 60;                  // 每窗口最多 60 次請求
const BATCH_MAX_RECORDS = 50;               // 批次上傳最多 50 筆
const ALLOWED_SORT_FIELDS = ['timestamp', 'timeSpent', 'stars', 'userName', 'className', 'qID', 'gameMode', 'status'];
const SCORE_FIELDS = ['className', 'userName', 'qID', 'gameMode', 'timeSpent', 'status', 'stars'];
const MAX_FIELD_LENGTH = 100;               // 字串欄位最大長度

// 速率限制記錄 (IP → { count, resetTime })
const rateLimitMap = new Map();

function checkRateLimit(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetTime) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return true;
    }
    entry.count++;
    return entry.count <= RATE_LIMIT_MAX;
}

// 定時清理過期的速率限制記錄
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
        if (now > entry.resetTime) rateLimitMap.delete(ip);
    }
}, RATE_LIMIT_WINDOW);

// ── 輸入驗證 ──

function validateScoreRecord(record) {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) {
        return 'Record must be an object';
    }
    // 只保留允許的欄位
    const cleaned = {};
    for (const field of SCORE_FIELDS) {
        if (record[field] !== undefined) cleaned[field] = record[field];
    }
    // 必填欄位檢查
    if (!cleaned.className || !cleaned.userName || !cleaned.qID || !cleaned.gameMode) {
        return 'Missing required fields: className, userName, qID, gameMode';
    }
    // 字串欄位長度與型態檢查
    for (const field of ['className', 'userName', 'qID', 'gameMode', 'status']) {
        if (cleaned[field] !== undefined) {
            if (typeof cleaned[field] !== 'string') return `${field} must be a string`;
            if (cleaned[field].length > MAX_FIELD_LENGTH) return `${field} exceeds max length`;
        }
    }
    // 數值欄位檢查
    if (cleaned.timeSpent !== undefined) {
        cleaned.timeSpent = Number(cleaned.timeSpent);
        if (isNaN(cleaned.timeSpent) || cleaned.timeSpent < 0 || cleaned.timeSpent > 36000) {
            return 'timeSpent must be 0-36000';
        }
    }
    if (cleaned.stars !== undefined) {
        cleaned.stars = Number(cleaned.stars);
        if (![1, 2, 3].includes(cleaned.stars)) return 'stars must be 1, 2, or 3';
    }
    return cleaned;
}

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

// ── 讀取請求 body（帶大小限制）──

function readBody(req, callback) {
    let body = '';
    let size = 0;
    req.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BODY_SIZE) {
            req.destroy();
            callback(new Error('Body too large'));
            return;
        }
        body += chunk;
    });
    req.on('end', () => callback(null, body));
    req.on('error', err => callback(err));
}

// ── HTTP 伺服器 ──

const server = http.createServer((req, res) => {
    // CORS — 只允許同主機來源
    const origin = req.headers.origin;
    const host = req.headers.host;
    // 允許同主機的不同 port（例如 :5500 → :3333）以及無 origin 的直接請求
    if (origin) {
        try {
            const originUrl = new URL(origin);
            const hostHostname = (host || '').split(':')[0];
            if (originUrl.hostname === hostHostname ||
                originUrl.hostname === 'localhost' ||
                originUrl.hostname === '127.0.0.1' ||
                /^192\.168\./.test(originUrl.hostname)) {
                res.setHeader('Access-Control-Allow-Origin', origin);
            } else {
                json(res, 403, { error: 'Origin not allowed' });
                return;
            }
        } catch {
            json(res, 403, { error: 'Invalid origin' });
            return;
        }
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // 速率限制
    const clientIp = req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) {
        res.setHeader('Retry-After', '60');
        json(res, 429, { error: 'Too many requests' });
        return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // POST /api/scores — 新增成績
    if (req.method === 'POST' && pathname === '/api/scores') {
        readBody(req, (err, body) => {
            if (err) { json(res, 413, { error: 'Request body too large' }); return; }
            try {
                const raw = JSON.parse(body);
                const validated = validateScoreRecord(raw);
                if (typeof validated === 'string') { json(res, 400, { error: validated }); return; }
                validated.id = nextId();
                validated.timestamp = new Date().toISOString();
                const scores = readScores();
                scores.push(validated);
                writeScores(scores);
                json(res, 201, { success: true, id: validated.id });
            } catch (e) {
                json(res, 400, { error: 'Invalid JSON' });
            }
        });
        return;
    }

    // POST /api/scores/batch — 批次新增（離線同步用）
    if (req.method === 'POST' && pathname === '/api/scores/batch') {
        readBody(req, (err, body) => {
            if (err) { json(res, 413, { error: 'Request body too large' }); return; }
            try {
                const records = JSON.parse(body);
                if (!Array.isArray(records)) { json(res, 400, { error: 'Expected array' }); return; }
                if (records.length > BATCH_MAX_RECORDS) {
                    json(res, 400, { error: `Batch limit is ${BATCH_MAX_RECORDS} records` }); return;
                }
                const scores = readScores();
                const ids = [];
                for (const raw of records) {
                    const validated = validateScoreRecord(raw);
                    if (typeof validated === 'string') { json(res, 400, { error: validated }); return; }
                    validated.id = nextId();
                    validated.timestamp = new Date().toISOString();
                    scores.push(validated);
                    ids.push(validated.id);
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

        // 排序（白名單驗證）
        const sortBy = url.searchParams.get('sortBy');
        const sortOrder = url.searchParams.get('sortOrder') || 'asc';
        if (sortBy && ALLOWED_SORT_FIELDS.includes(sortBy)) {
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

        // 限制筆數（上限 500）
        const limitParam = url.searchParams.get('limit');
        const limit = Math.min(Math.max(parseInt(limitParam) || 500, 1), 500);
        results = results.slice(0, limit);

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

// 綁定到 127.0.0.1 — 只接受本機連線，外網無法直接存取
server.listen(PORT, '127.0.0.1', () => {
    console.log(`📦 JSON API server running on http://127.0.0.1:${PORT}`);
    console.log(`   Data file: ${SCORES_FILE}`);
});
