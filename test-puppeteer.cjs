const puppeteer = require('puppeteer');
(async () => {
  try {
    const browser = await puppeteer.launch({ 
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: '/usr/bin/google-chrome'
    });
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle2' });
    const content = await page.content();
    console.log("HTML length:", content.length);
    if (content.includes("Sistem Absensi Terintegrasi")) {
      console.log("Found title text");
    }
    await browser.close();
  } catch (err) {
    console.error(err);
  }
})();
