import { expect, test, type Page } from '@playwright/test'

test.setTimeout(8 * 60_000)

async function enter(page: Page, nick: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Jogar online' }).click()
  await page.getByLabel('Seu apelido').fill(nick)
}

/** Makes whatever obvious move is available; returns true if it acted. */
async function playIfMyTurn(page: Page): Promise<boolean> {
  for (const name of ['Descer', 'Jogar']) {
    const button = page.getByRole('button', { name, exact: true })
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => {})
      return true
    }
  }
  const card = page.locator('.my-hand button.card:not([disabled])').first()
  if (await card.isVisible().catch(() => false)) {
    await card.click().catch(() => {})
    return true
  }
  return false
}

test('two people and two bots play a full game', async ({ browser }) => {
  // Unique name: the test also runs against production, where the lobby is shared.
  const room = `Mesa E2E ${Date.now().toString(36)}`
  const riul = await (await browser.newContext()).newPage()
  const ana = await (await browser.newContext()).newPage()

  await enter(riul, 'Riul')
  await riul.getByRole('button', { name: 'Criar sala' }).click()
  await riul.getByLabel('Nome da sala').fill(room)
  await riul.getByRole('button', { name: 'Criar', exact: true }).click()
  await expect(riul.getByText('Código:')).toBeVisible()

  await enter(ana, 'Ana')
  await ana.getByRole('button', { name: room }).click()
  await expect(ana.getByText('Time A')).toBeVisible()
  await expect(riul.getByText('Ana', { exact: true })).toBeVisible()

  await riul.getByRole('button', { name: 'Começar partida' }).click()
  await expect(riul.getByText('Vale')).toBeVisible()
  await expect(ana.getByText('Vale')).toBeVisible()
  await expect(riul.locator('.scene .name')).toHaveCount(3)

  const finished = /Vocês ganharam!|Eles ganharam/
  while (!(await riul.getByRole('heading', { name: finished }).isVisible())) {
    const acted = (await playIfMyTurn(riul)) || (await playIfMyTurn(ana))
    await (acted ? riul.waitForTimeout(150) : riul.waitForTimeout(300))
  }

  // Riul and Ana land on opposite teams: one's "Nós × Eles" is the reverse of the other's.
  const score = async (page: Page) => (await page.locator('.score b').allInnerTexts()).map(Number)
  await expect(ana.getByRole('heading', { name: finished })).toBeVisible()
  const [riulUs, riulThem] = await score(riul)
  expect(await score(ana)).toEqual([riulThem, riulUs])
  expect(Math.max(riulUs!, riulThem!)).toBe(12)
  await expect(riul.getByRole('button', { name: 'Jogar de novo' })).toBeVisible()
  await expect(ana.getByRole('button', { name: 'Jogar de novo' })).toHaveCount(0)
})
