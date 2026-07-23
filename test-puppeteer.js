import puppeteer from 'puppeteer';
(async () => {
  try {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('PAGE ERROR:', msg.text());
      }
    });
    page.on('pageerror', err => console.log('PAGE EXCEPTION:', err.toString()));
    
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Fill login
    await page.type('input[type="text"]', 'admin');
    await page.type('input[type="password"]', 'admin');
    await page.click('button[type="submit"]');
    
    await new Promise(r => setTimeout(r, 2000));
    
    // Check if error overlay exists
    const errorText = await page.evaluate(() => {
      const viteOverlay = document.querySelector('vite-error-overlay');
      if (viteOverlay && viteOverlay.shadowRoot) {
        return viteOverlay.shadowRoot.textContent;
      }
      return document.body.innerText;
    });
    console.log("Overlay or Body Text:", errorText.substring(0, 1000));
    
    await browser.close();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
