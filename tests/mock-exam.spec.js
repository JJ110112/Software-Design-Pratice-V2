// @ts-check
const { test, expect } = require('@playwright/test');
const { mockLogin } = require('./helpers');

// 每個測試前先登入
test.beforeEach(async ({ page }) => {
  await mockLogin(page);
});

// ══════════════════════════════════════════
//  模擬考頁面測試
// ══════════════════════════════════════════

test.describe('模擬考 - 抽題畫面', () => {

  test('頁面載入並顯示抽題結果', async ({ page }) => {
    await page.goto('/pages/模擬考.html');

    // 應顯示「模擬考試」標題
    await expect(page.locator('.draw-title')).toHaveText('模擬考試');

    // 應顯示 5 個抽題項目（SETUP + 3Q + 1 第二套）
    const items = page.locator('.draw-item');
    await expect(items).toHaveCount(5);

    // 第一個應該是「通用」標籤
    const firstTag = items.first().locator('.tag');
    await expect(firstTag).toHaveText('通用');

    // 應有「開始考試」按鈕
    await expect(page.locator('#btn-start-exam')).toBeVisible();
  });

  test('抽題規則正確：3 題 Q + 1 種迴圈 + 1 題第二套', async ({ page }) => {
    await page.goto('/pages/模擬考.html');

    const items = page.locator('.draw-item');
    const tags = [];
    for (let i = 0; i < 5; i++) {
      tags.push(await items.nth(i).locator('.tag').textContent());
    }

    // 標籤應為：通用, 第一套, 第一套, 第一套, 第二套
    expect(tags[0]).toBe('通用');
    expect(tags[1]).toBe('第一套');
    expect(tags[2]).toBe('第一套');
    expect(tags[3]).toBe('第一套');
    expect(tags[4]).toBe('第二套');

    // 迴圈指令資訊應存在
    const info = await page.locator('#draw-info').textContent();
    expect(info).toContain('迴圈指令');
    expect(info).toMatch(/For|Do While|Loop/);
  });
});

test.describe('模擬考 - 考試畫面', () => {

  test('點擊開始後顯示考試介面', async ({ page }) => {
    await page.goto('/pages/模擬考.html');
    await page.click('#btn-start-exam');

    // 抽題畫面應隱藏
    await expect(page.locator('#draw-screen')).toBeHidden();

    // 考試畫面應顯示
    await expect(page.locator('#exam-screen')).toBeVisible();

    // 應有 5 個分頁標籤
    const tabs = page.locator('.exam-tab');
    await expect(tabs).toHaveCount(5);

    // 第一個分頁應為 active
    await expect(tabs.first()).toHaveClass(/active/);

    // 倒計時應顯示
    const timer = page.locator('#exam-timer');
    await expect(timer).toBeVisible();
    const timerText = await timer.textContent();
    expect(timerText).toContain('剩餘時間');
  });

  test('計時器正常倒數', async ({ page }) => {
    await page.goto('/pages/模擬考.html');
    await page.click('#btn-start-exam');

    const timer = page.locator('#exam-timer');
    const text1 = await timer.textContent();

    // 等 2 秒
    await page.waitForTimeout(2500);
    const text2 = await timer.textContent();

    // 時間應該減少了
    expect(text2).not.toBe(text1);
  });

  test('可以在分頁間切換', async ({ page }) => {
    await page.goto('/pages/模擬考.html');
    await page.click('#btn-start-exam');

    const tabs = page.locator('.exam-tab');

    // 點第二個分頁
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveClass(/active/);
    await expect(tabs.first()).not.toHaveClass(/active/);

    // 題目標題應該變了
    const title = await page.locator('#exam-q-title').textContent();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test('編輯器可以輸入文字', async ({ page }) => {
    await page.goto('/pages/模擬考.html');
    await page.click('#btn-start-exam');

    const editor = page.locator('#editor');
    await editor.fill('test code');
    await expect(editor).toHaveValue('test code');
  });

  test('禁止貼上', async ({ page }) => {
    await page.goto('/pages/模擬考.html');
    await page.click('#btn-start-exam');

    const editor = page.locator('#editor');
    await editor.focus();

    // 嘗試貼上
    await page.keyboard.insertText('');  // clear
    await editor.evaluate(el => {
      const event = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer()
      });
      el.dispatchEvent(event);
    });

    // 值應該還是空的
    await expect(editor).toHaveValue('');
  });

  test('提示按鈕可以使用', async ({ page }) => {
    await page.goto('/pages/模擬考.html');
    await page.click('#btn-start-exam');

    // 提示區域初始應該隱藏
    await expect(page.locator('#hint-box')).toBeHidden();

    // 點擊提示
    await page.click('#btn-hint');

    // 提示應該顯示
    await expect(page.locator('#hint-box')).toBeVisible();
    const hintText = await page.locator('#hint-box').textContent();
    expect(hintText).toContain('第 1 行');
  });

  test('清除一行按鈕可以使用', async ({ page }) => {
    await page.goto('/pages/模擬考.html');
    await page.click('#btn-start-exam');

    const editor = page.locator('#editor');
    await editor.fill('line1\nline2\nline3');

    // 把游標放在最後
    await editor.focus();

    // 點清除一行
    await page.click('#btn-exam-clear-line');

    const val = await editor.inputValue();
    // 應該少了一行
    expect(val.split('\n').length).toBeLessThan(3);
  });

  test('全部清除按鈕可以使用', async ({ page }) => {
    await page.goto('/pages/模擬考.html');
    await page.click('#btn-start-exam');

    const editor = page.locator('#editor');
    await editor.fill('some code here');

    await page.click('#btn-exam-clear');

    await expect(editor).toHaveValue('');
  });
});

test.describe('模擬考 - 完成流程', () => {

  test('輸入正確答案後分頁標記為完成', async ({ page }) => {
    await page.goto('/pages/模擬考.html');
    await page.click('#btn-start-exam');

    // 取得第一題（SETUP）的正確答案
    const answer = await page.evaluate(() => {
      const steps = generateSteps('SETUP', 'T01');
      return steps.map(s => s.code).join('\n');
    });

    const editor = page.locator('#editor');

    // 逐字輸入（模擬真實打字，避免防作弊機制）
    await editor.focus();
    for (const char of answer) {
      await page.keyboard.type(char, { delay: 5 });
    }

    // 等待驗證
    await page.waitForTimeout(500);

    // 第一個分頁應標記為 done
    const firstTab = page.locator('.exam-tab').first();
    await expect(firstTab).toHaveClass(/done/);

    // 進度應更新
    const progress = await page.locator('#exam-progress').textContent();
    expect(progress).toContain('1');
  });
});
