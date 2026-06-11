// Deeper smoke test: teleport near enemies, verify combat, pause flow.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('pageerror', (e) => {
  if (!e.message.includes('pointer lock')) errors.push('PAGEERROR: ' + e.message)
})

await page.goto('http://localhost:4173/')
await page.waitForTimeout(1000)
await page.click('img[alt="newgame"]')
await page.waitForTimeout(1500)

// teleport in front of the vassago at cell (15,13), facing it
await page.evaluate(() => {
  const { game } = window.__doom
  game.px = 15.5 * 4
  game.pz = 16.5 * 4
  game.yaw = Math.PI // face -z... adjust: enemy is north (lower z)
})
await page.waitForTimeout(900)
// face the enemy: dir to (62,54) from (62,66) is -z, yaw=atan2 etc; -z forward is yaw=0
await page.evaluate(() => { window.__doom.game.yaw = 0 })
await page.waitForTimeout(700)
await page.screenshot({ path: '/tmp/shot_enemy.png' })

// shoot at it a few times
for (let i = 0; i < 5; i++) {
  await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up()
  await page.waitForTimeout(420)
}
await page.screenshot({ path: '/tmp/shot_fight.png' })

const info = await page.evaluate(() => {
  const { game } = window.__doom
  return {
    enemies: game.enemies.filter((e) => e.state !== 'idle').map((e) => ({ kind: e.kind, hp: e.hp, state: e.state })),
    projectiles: game.projectiles.length,
    health: game.health,
    bullets: game.bullets,
  }
})
console.log('INFO', JSON.stringify(info, null, 1))

// wait for enemy fireballs / damage
await page.waitForTimeout(2500)
await page.screenshot({ path: '/tmp/shot_fight2.png' })
const info2 = await page.evaluate(() => ({
  health: window.__doom.game.health,
  proj: window.__doom.game.projectiles.length,
}))
console.log('INFO2', JSON.stringify(info2))
console.log('ERRORS', errors.length ? errors : 'none')
await browser.close()
