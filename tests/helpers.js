/**
 * 在瀏覽器 localStorage 模擬登入
 * 必須在 page.goto() 之前呼叫
 */
async function mockLogin(page, baseURL) {
  // 先到首頁設定 localStorage
  await page.goto(baseURL || '/');
  await page.evaluate(() => {
    localStorage.setItem('sw_quiz_user', JSON.stringify({
      className: '測試班',
      no: 1,
      name: '測試學生',
      loginTime: new Date().toISOString()
    }));
  });
}

module.exports = { mockLogin };
