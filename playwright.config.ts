import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { ...devices['Pixel 7'], browserName: 'chromium', locale: 'ar-EG', timezoneId: 'Africa/Cairo', baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173/prayer-tracker/', reuseExistingServer: !process.env.CI }
})
