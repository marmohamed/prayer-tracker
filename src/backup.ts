import { prayers, validCount, type DailyPrayerRecord } from './model'
import { localDate, validDate } from './dates'
export interface Backup { schemaVersion: 1; exportedAt: string; records: DailyPrayerRecord[] }
export function validateRecord(value: unknown): DailyPrayerRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('يوجد سجل غير صالح في الملف.')
  const row = value as Record<string, unknown>
  if (!validDate(row.date)) throw new Error('يوجد تاريخ غير صالح في الملف.')
  if (Object.keys(row).length !== 6 || !prayers.every(p => validCount(row[p.key]))) {
    throw new Error('يجب أن تكون أعداد الصلوات أعدادًا صحيحة غير سالبة ضمن الحد المسموح.')
  }
  return { date: row.date, fajr: row.fajr as number, dhuhr: row.dhuhr as number, asr: row.asr as number, maghrib: row.maghrib as number, isha: row.isha as number }
}
export function validateBackup(value: unknown): Backup {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ملف النسخة الاحتياطية غير صالح.')
  const data = value as Record<string, unknown>
  if (data.schemaVersion !== 1) throw new Error('إصدار النسخة الاحتياطية غير مدعوم.')
  if (typeof data.exportedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?Z$/.test(data.exportedAt) || !validDate(data.exportedAt.slice(0, 10)) || !Number.isFinite(Date.parse(data.exportedAt))) {
    throw new Error('وقت تصدير النسخة الاحتياطية غير صالح.')
  }
  if (!Array.isArray(data.records)) throw new Error('قائمة السجلات غير صالحة.')
  const records = data.records.map(validateRecord)
  if (new Set(records.map(r => r.date)).size !== records.length) throw new Error('الملف يحتوي على تواريخ مكررة.')
  return { schemaVersion: 1, exportedAt: data.exportedAt, records }
}
export function parseBackup(text: string): Backup {
  let data: unknown
  try { data = JSON.parse(text) } catch { throw new Error('تعذّرت قراءة الملف. اختر نسخة احتياطية بصيغة JSON.') }
  return validateBackup(data)
}
export function createBackup(records: DailyPrayerRecord[], now = new Date()): string {
  return JSON.stringify(validateBackup({ schemaVersion: 1, exportedAt: now.toISOString(), records }), null, 2)
}
export const backupFilename = (now = new Date()) => `prayer-tracker-backup-${localDate(now)}.json`
