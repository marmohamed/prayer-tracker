import Dexie, { type Table } from 'dexie'
import { emptyRecord, validCount, type DailyPrayerRecord, type Prayer, prayers } from './model'
import { validDate } from './dates'
import { validateBackup, type Backup } from './backup'

export class PrayerDatabase extends Dexie {
  declare records: Table<DailyPrayerRecord, string>
  constructor(name = 'prayer-tracker') {
    super(name)
    // Keep this name and primary key stable. Add version(2).stores(...).upgrade(...)
    // for future migrations; service-worker updates never delete this database.
    this.version(1).stores({ records: '&date' })
  }
}
export const db = new PrayerDatabase()
function checkDate(date: string) {
  if (!validDate(date)) throw new Error('اختر تاريخًا صحيحًا.')
}
export async function ensureRecord(database: PrayerDatabase, date: string) {
  checkDate(date)
  return database.transaction('rw', database.records, async () => {
    const existing = await database.records.get(date)
    if (existing) return existing
    const row = emptyRecord(date)
    await database.records.add(row)
    return row
  })
}
// Read and write in the same transaction: fast taps and other tabs serialize safely.
export async function changeCount(database: PrayerDatabase, date: string, prayer: Prayer, change: number, mode: 'delta' | 'set' = 'delta') {
  checkDate(date)
  if (!prayers.some(p => p.key === prayer) || !Number.isSafeInteger(change)) throw new Error('عدد الصلوات غير صالح.')
  return database.transaction('rw', database.records, async () => {
    const row = await database.records.get(date) ?? emptyRecord(date)
    const next = mode === 'set' ? change : Math.max(0, row[prayer] + change)
    if (!validCount(next)) throw new Error('أدخل عددًا صحيحًا غير سالب ضمن الحد المسموح.')
    row[prayer] = next
    await database.records.put(row)
    return row
  })
}
export async function restoreBackup(database: PrayerDatabase, backup: Backup) {
  const validated = validateBackup(backup) // Entire input validated before opening a write transaction.
  await database.transaction('rw', database.records, async () => {
    await database.records.clear()
    await database.records.bulkAdd(validated.records)
  })
}
