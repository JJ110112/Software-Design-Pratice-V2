// @ts-check
const { test, expect } = require('@playwright/test');
const { mockLogin } = require('./helpers');

// 每個測試前先登入
test.beforeEach(async ({ page }) => {
  await mockLogin(page);
});

// ══════════════════════════════════════════
//  所有練習頁面冒煙測試
//  確保每個頁面都能正常載入、不會 JS 錯誤
// ══════════════════════════════════════════

const PAGES = [
  { name: '首頁', url: '/' },
  { name: '排行榜', url: '/leaderboard.html' },
  { name: 'Dashboard', url: '/dashboard.html' },
  { name: '連連看', url: '/pages/連連看.html?q=SETUP&t=T01' },
  { name: '記憶翻牌遊戲', url: '/pages/記憶翻牌遊戲.html?q=SETUP&t=T01' },
  { name: '中英選擇題', url: '/pages/中英選擇題.html?q=SETUP&t=T01' },
  { name: '程式碼朗讀練習', url: '/pages/程式碼朗讀練習.html?q=SETUP&t=T01' },
  { name: '一行程式碼翻譯', url: '/pages/一行程式碼翻譯.html?q=SETUP&t=T01' },
  { name: '錯誤找找看', url: '/pages/錯誤找找看.html?q=SETUP&t=T01' },
  { name: '程式碼排列重組', url: '/pages/程式碼排列重組.html?q=SETUP&t=T01' },
  { name: '程式與結果配對', url: '/pages/程式與結果配對.html?q=SETUP&t=T01' },
  { name: '逐行中文注解填空', url: '/pages/逐行中文注解填空.html?q=SETUP&t=T01' },
  { name: '打字-關鍵字', url: '/pages/打字練習.html?q=SETUP&t=T01&sub=keyword' },
  { name: '打字-單行', url: '/pages/打字練習.html?q=SETUP&t=T01&sub=line' },
  { name: '打字-完整', url: '/pages/打字練習.html?q=SETUP&t=T01&sub=full' },
  { name: '看中文寫程式', url: '/pages/看中文寫程式.html?q=SETUP&t=T01' },
  { name: '程式填空', url: '/pages/程式填空.html?q=SETUP&t=T01' },
  { name: '獨立全程式撰寫', url: '/pages/獨立全程式撰寫.html?q=SETUP&t=T01' },
  { name: '錯誤程式除錯', url: '/pages/錯誤程式除錯.html?q=SETUP&t=T01' },
  { name: '模擬考', url: '/pages/模擬考.html' },
  { name: '闖關地圖', url: '/pages/map.html?tab=map&dev=1' },
];

for (const pg of PAGES) {
  test(`[冒煙] ${pg.name} 頁面正常載入`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    const response = await page.goto(pg.url, { waitUntil: 'domcontentloaded' });

    // HTTP 狀態碼應為 200
    expect(response.status()).toBe(200);

    // 不應有 JS 錯誤
    expect(errors).toEqual([]);

    // 頁面應有內容
    const body = await page.locator('body').textContent();
    expect(body.length).toBeGreaterThan(10);
  });
}

// ══════════════════════════════════════════
//  各練習頁面功能測試
// ══════════════════════════════════════════

test.describe('打字練習', () => {

  test('關鍵字模式自動進入', async ({ page }) => {
    await page.goto('/pages/打字練習.html?q=Q1&t=T01&sub=keyword');
    // 模式選擇應該被跳過，直接進入打字區
    await expect(page.locator('#typing-area')).toBeVisible();
    await expect(page.locator('#mode-select')).toBeHidden();
  });

  test('單行模式不含前導空白', async ({ page }) => {
    await page.goto('/pages/打字練習.html?q=Q1&t=T01&sub=line');
    await page.waitForTimeout(500);

    // 取得第一個提示文字，不應以空白開頭
    const firstChar = await page.evaluate(() => {
      const chars = document.querySelectorAll('#prompt-chars .char');
      return chars.length > 0 ? chars[0].dataset.real : '';
    });
    expect(firstChar).not.toBe(' ');
  });

  test('清除按鈕可以使用', async ({ page }) => {
    await page.goto('/pages/打字練習.html?q=SETUP&t=T01&sub=keyword');
    await page.waitForTimeout(500);

    const input = page.locator('#typing-input');
    await page.locator('#prompt-box').click();
    await page.keyboard.type('test', { delay: 20 });

    // 按清除
    await page.click('#btn-clear');
    const val = await input.inputValue();
    expect(val).toBe('');
  });
});

test.describe('獨立全程式撰寫', () => {

  test('頁面載入並顯示正確標題', async ({ page }) => {
    await page.goto('/pages/獨立全程式撰寫.html?q=Q1&t=T01');
    await page.waitForTimeout(1000);

    // common.css 隱藏了 .page-header，改用 level-top-bar 檢查
    const topBar = page.locator('.level-top-bar');
    await expect(topBar).toBeVisible();
    const text = await topBar.textContent();
    expect(text).toContain('Q1');
  });

  test('SETUP 顯示正確的 IDE 標題和提示', async ({ page }) => {
    await page.goto('/pages/獨立全程式撰寫.html?q=SETUP&t=T01');
    await page.waitForTimeout(500);

    const ideTitle = await page.locator('#ide-title').textContent();
    expect(ideTitle).toBe('Form1_Load.vb');
  });

  test('提示按鈕可以使用', async ({ page }) => {
    await page.goto('/pages/獨立全程式撰寫.html?q=SETUP&t=T01');
    await page.waitForTimeout(500);

    await page.click('#btn-hint');
    const hintBox = page.locator('#hint-box');
    await expect(hintBox).toBeVisible();
  });

  test('清除一行按鈕可以使用', async ({ page }) => {
    await page.goto('/pages/獨立全程式撰寫.html?q=Q1&t=T01');
    const editor = page.locator('#editor');
    await editor.fill('line1\nline2\nline3');
    await editor.focus();

    await page.click('#btn-clear-line');
    const val = await editor.inputValue();
    expect(val.split('\n').filter(l => l).length).toBeLessThan(3);
  });
});

test.describe('錯誤程式除錯', () => {

  test('SETUP 關卡有 bug 可以找', async ({ page }) => {
    await page.goto('/pages/錯誤程式除錯.html?q=SETUP&t=T01');
    await page.waitForTimeout(500);

    // 應該有多行程式碼
    const lines = page.locator('.code-line');
    const count = await lines.count();
    expect(count).toBeGreaterThan(3);

    // 應顯示進度
    const progress = await page.locator('#bug-progress').textContent();
    expect(progress).toContain('第 1');
  });

  test('提示按鈕可以使用', async ({ page }) => {
    await page.goto('/pages/錯誤程式除錯.html?q=SETUP&t=T01');
    await page.waitForTimeout(500);

    await page.click('#btn-hint-debug');
    const hintArea = page.locator('#hint-area');
    await expect(hintArea).toBeVisible();
    const text = await hintArea.textContent();
    expect(text).toMatch(/前半段|後半段|仔細/);
  });
});

test.describe('看中文寫程式', () => {

  test('頁面載入並顯示提示', async ({ page }) => {
    await page.goto('/pages/看中文寫程式.html?q=SETUP&t=T01');
    await page.waitForTimeout(500);

    // 應有輸入框
    await expect(page.locator('#code-input')).toBeVisible();

    // 應顯示中文提示
    const zh = await page.locator('#step-zh').textContent();
    expect(zh.length).toBeGreaterThan(2);
  });

  test('清除按鈕可以使用', async ({ page }) => {
    await page.goto('/pages/看中文寫程式.html?q=SETUP&t=T01');
    const input = page.locator('#code-input');
    await input.fill('test');
    await page.click('#btn-clear-input');
    await expect(input).toHaveValue('');
  });
});

test.describe('闖關地圖', () => {

  test('dev 模式下所有階段都解鎖', async ({ page }) => {
    await page.goto('/pages/map.html?tab=map&dev=1&mode=連連看');
    await page.waitForTimeout(1000);

    // 所有練習模式卡片都不應該被灰階
    const grids = page.locator('.mode-grid');
    const count = await grids.count();
    for (let i = 0; i < count; i++) {
      const opacity = await grids.nth(i).evaluate(el => getComputedStyle(el).opacity);
      expect(opacity).toBe('1');
    }
  });
});
