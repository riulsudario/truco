import { expect, test } from '@playwright/test'

const SHOTS = process.env.SHOTS_DIR

test.skip(!SHOTS, 'only takes screenshots when SHOTS_DIR is set')

test('screen screenshots', async ({ page }) => {
  await page.goto('/')
  await page.screenshot({ path: `${SHOTS}/1-menu.png` })

  await page.getByRole('button', { name: 'Partida local' }).click()
  await expect(page.getByText('Vale')).toBeVisible()
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${SHOTS}/2-practice.png` })

  await page.getByRole('button', { name: /Provocar/ }).click()
  await page.getByRole('menuitem', { name: 'Tá com medinho?' }).click()
  await page.waitForTimeout(1600)
  await page.screenshot({ path: `${SHOTS}/2b-taunt.png` })
  await page.getByRole('button', { name: 'Sair da mesa' }).click()

  await page.goto('/salas')
  await page.getByLabel('Seu apelido').fill('Riul')
  await page.getByRole('button', { name: 'Criar sala' }).click()
  await page.getByRole('button', { name: 'Criar', exact: true }).click()
  await expect(page.getByText('Código:')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/3-room.png` })

  await page.getByRole('button', { name: 'Começar partida' }).click()
  await expect(page.getByText('Vale')).toBeVisible()
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${SHOTS}/4-online.png` })
})
