// Headless smoke test: load the app, start a game, simulate input,
// capture console errors and screenshots.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto('http://localhost:4173/')
await page.waitForTimeout(1200)
await page.screenshot({ path: '/tmp/shot_menu.png' })

// start the game via the New Game item
await page.click('img[alt="newgame"]')
await page.waitForTimeout(2500)
await page.screenshot({ path: '/tmp/shot_game1.png' })

// walk forward + turn for a couple of seconds
await page.keyboard.down('w')
await page.waitForTimeout(1400)
await page.keyboard.up('w')
await page.keyboard.down('d')
await page.waitForTimeout(300)
await page.keyboard.up('d')
await page.waitForTimeout(400)
await page.screenshot({ path: '/tmp/shot_game2.png' })

// fire a few times
await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up()
await page.waitForTimeout(500)
await page.screenshot({ path: '/tmp/shot_game3.png' })

// pause via Escape: in headless there is no pointer lock, so ESC handling
// may differ; test the store directly
const state = await page.evaluate(() => {
  const el = document.querySelector('.stbar-img')
  return { hasBar: !!el, weaponVisible: !!document.querySelector('.weapon-img')?.getAttribute('src') }
})

console.log('STATE', JSON.stringify(state))
console.log('ERRORS', errors.length ? errors.slice(0, 10) : 'none')
await browser.close()
