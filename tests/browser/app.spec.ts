import { expect, test } from '@playwright/test'
const base = '/prayer-tracker/'
const backup = { schemaVersion: 1, exportedAt: '2026-11-02T10:00:00.000Z', records: [{ date: '2026-10-31', fajr: 5, dhuhr: 3, asr: 0, maghrib: 0, isha: 0 }] }

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00Z'))
  await page.goto(base)
  await expect(page.getByRole('button', { name: 'زيادة الفجر', exact: true })).toBeEnabled()
})

test('rapid taps persist across reload and concurrent tabs', async ({ page, context }) => {
  await page.getByRole('button', { name: 'زيادة الفجر', exact: true }).evaluate(button => {
    for (let i = 0; i < 50; i++) (button as HTMLButtonElement).click()
  })
  await expect(page.getByLabel('عدد صلوات الفجر', { exact: true })).toHaveText('٥٠')
  const other = await context.newPage()
  await other.clock.setFixedTime(new Date('2026-11-02T10:00:00Z'))
  await other.goto(base)
  await expect(other.getByLabel('عدد صلوات الفجر', { exact: true })).toHaveText('٥٠')
  await Promise.all([page.getByRole('button', { name: 'زيادة الفجر', exact: true }).click(), other.getByRole('button', { name: 'زيادة الفجر', exact: true }).click()])
  await expect(page.getByLabel('عدد صلوات الفجر', { exact: true })).toHaveText('٥٢')
  await page.reload()
  await expect(page.getByLabel('عدد صلوات الفجر', { exact: true })).toHaveText('٥٢')
})

test('history permits direct editing, zeros and confirmed deletion', async ({ page }) => {
  await page.getByRole('button', { name: 'السجل', exact: true }).click()
  await page.getByLabel('إضافة يوم أو تعديل سجل').fill('2026-10-31')
  await page.getByRole('button', { name: 'فتح اليوم' }).click()
  const field = page.getByRole('spinbutton', { name: 'عدد صلوات الفجر', exact: true })
  await field.fill('12'); await field.blur()
  await expect(field).toHaveValue('12')
  await page.getByRole('button', { name: 'فتح اليوم' }).click()
  await expect(page.locator('.history-day')).toHaveCount(1)
  await page.getByRole('button', { name: 'حذف اليوم', exact: true }).click()
  await page.getByRole('button', { name: 'إلغاء', exact: true }).click()
  await expect(page.locator('.history-day')).toHaveCount(1)
  await page.getByRole('button', { name: 'حذف اليوم', exact: true }).click()
  await page.getByRole('button', { name: 'حذف السجل', exact: true }).click()
  await expect(page.locator('.history-day')).toHaveCount(0)
})

test('validates backups, requires confirmation and exports portable JSON', async ({ page }) => {
  await page.getByRole('button', { name: 'زيادة الفجر', exact: true }).click()
  await expect(page.getByLabel('عدد صلوات الفجر', { exact: true })).toHaveText('١')
  await page.getByRole('button', { name: 'الإعدادات', exact: true }).click()
  const file = page.getByLabel('اختيار ملف النسخة الاحتياطية')
  await file.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{') })
  await expect(page.getByRole('alert')).toContainText('تعذّرت قراءة الملف')
  await file.setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
  await expect(page.getByRole('dialog')).toContainText('١ سجل')
  await page.getByRole('button', { name: 'إلغاء', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'تصدير نسخة احتياطية', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('prayer-tracker-backup-2026-11-02.json')
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  expect(exported.schemaVersion).toBe(1)
  expect(exported.records[0].fajr).toBe(1)
  await file.setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
  await page.getByRole('button', { name: 'استبدال البيانات واستعادة النسخة', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'تمت استعادة' })).toBeVisible()
  await page.getByRole('button', { name: 'السجل', exact: true }).click()
  await expect(page.locator('.history-day')).toHaveCount(1)
  await expect(page.locator('.day-toggle strong')).toContainText('٨')
})

test('loads and records prayers offline using the production service worker', async ({ page, context }) => {
  await expect.poll(() => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return registration.active?.state
  })).toBe('activated')
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('button', { name: 'زيادة الظهر', exact: true }).click()
  await expect(page.getByLabel('عدد صلوات الظهر', { exact: true })).toHaveText('١')
  await page.getByRole('button', { name: 'السجل', exact: true }).click()
  await expect(page.locator('.history-day')).toHaveCount(1)
  await page.getByRole('button', { name: 'الإحصائيات', exact: true }).click()
  await expect(page.locator('.hero-number')).toContainText('١')
  await page.getByRole('button', { name: 'الإعدادات', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'تصدير نسخة احتياطية', exact: true }).click()
  expect((await download).suggestedFilename()).toMatch(/\.json$/)
  await page.getByLabel('اختيار ملف النسخة الاحتياطية').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
  await page.getByRole('button', { name: 'استبدال البيانات واستعادة النسخة', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'تمت استعادة' })).toBeVisible()
  await context.setOffline(false)
})

test('fits a narrow phone viewport and has Arabic document direction', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  expect(await page.locator('html').getAttribute('dir')).toBe('rtl')
  expect(await page.locator('html').getAttribute('lang')).toBe('ar')
  for (const name of ['اليوم', 'السجل', 'الإحصائيات', 'الإعدادات']) {
    await page.getByRole('button', { name, exact: true }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})
