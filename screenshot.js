const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({width: 1200, height: 800});
  await page.goto('file:///Users/ismail/FUNDX-1/index.html', {waitUntil: 'networkidle0'});
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({path: 'debug.png'});
  await browser.close();
})();
