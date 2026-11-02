import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
const base = '/prayer-tracker/'
const manifest = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'))
assert.equal(manifest.name, 'قضاء الصلوات')
assert.equal(manifest.short_name, 'قضاء الصلوات')
assert.equal(manifest.start_url, base)
assert.equal(manifest.scope, base)
assert.equal(manifest.id, base)
assert.equal(manifest.display, 'standalone')
assert.equal(manifest.lang, 'ar')
assert.equal(manifest.dir, 'rtl')
for (const [file, size, purpose] of [['icon-192.png', 192, 'any'], ['icon-512.png', 512, 'any'], ['maskable-512.png', 512, 'maskable']]) {
  assert(manifest.icons.some(i => i.src.endsWith(file) && i.sizes === `${size}x${size}` && i.purpose === purpose))
  const png = readFileSync(`dist/icons/${file}`)
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  assert.equal(png.readUInt32BE(16), size)
  assert.equal(png.readUInt32BE(20), size)
}
const html = readFileSync('dist/index.html', 'utf8')
assert(html.includes('lang="ar" dir="rtl"'))
assert(html.includes(`${base}manifest.webmanifest`))
assert(html.includes(`${base}assets/`))
const sw = readFileSync('dist/sw.js', 'utf8')
assert(sw.includes('index.html'))
assert(sw.includes('precacheAndRoute'))
assert(sw.includes('SKIP_WAITING'))
const config = readFileSync('vite.config.ts', 'utf8')
assert(config.includes("registerType: 'prompt'"))
assert(config.includes('skipWaiting: false'))
function walk(path) {
  return readdirSync(path).flatMap(name => {
    const file = join(path, name)
    return statSync(file).isDirectory() ? walk(file) : [file.replace(/^dist\//, '')]
  })
}
for (const file of walk('dist').filter(file => /\.(js|css|html|png|svg)$/.test(file) && !/^(sw|workbox-)/.test(file))) {
  assert(sw.includes(file), `Essential asset missing from precache: ${file}`)
}
console.log('PWA manifest, icons, base paths and precache verified.')
