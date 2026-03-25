/**
 * 在瀏覽器 localStorage 模擬登入
 * 必須在 page.goto() 之前呼叫
 */
async function mockLogin(page, baseURL) {
  // 先到首頁設定 localStorage
  await page.goto(baseURL || '/index.html');
  await page.evaluate(() => {
    localStorage.setItem('sw_quiz_user', JSON.stringify({
      className: '測試班',
      no: 1,
      name: '測試學生',
      loginTime: new Date().toISOString()
    }));
  });
}

/**
 * 等待 api.js 模組載入完成（window.saveScore 可用）
 */
async function waitForApi(page) {
  await page.waitForFunction(() => typeof window.saveScore === 'function', { timeout: 10000 });
}

module.exports = { mockLogin, waitForApi };
