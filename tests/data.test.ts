import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { changeCount, ensureRecord, PrayerDatabase, restoreBackup } from '../src/db'
import { emptyRecord, total } from '../src/model'
import { backupFilename, createBackup, parseBackup, validateBackup, type Backup } from '../src/backup'
import { chartDays, statistics } from '../src/statistics'
import { localDate, shiftDate, validDate, weekStart } from '../src/dates'

let db: PrayerDatabase
const date = '2026-11-02'
const makeBackup = (records = [emptyRecord(date)]): Backup => ({ schemaVersion: 1, exportedAt: '2026-11-02T10:00:00.000Z', records })
beforeEach(() => { db = new PrayerDatabase(`test-${crypto.randomUUID()}`) })
afterEach(async () => { vi.restoreAllMocks(); await db.delete() })

describe('daily records and concurrent writes', () => {
  it('creates one zero-valued record and preserves it', async () => {
    expect(await ensureRecord(db, date)).toEqual(emptyRecord(date))
    expect(await db.records.count()).toBe(1)
    expect(total((await db.records.get(date))!)).toBe(0)
  })
  it('increments, decrements and never goes negative', async () => {
    await changeCount(db, date, 'fajr', 1)
    await changeCount(db, date, 'fajr', 1)
    expect((await changeCount(db, date, 'fajr', -1)).fajr).toBe(1)
    expect((await changeCount(db, date, 'fajr', -50)).fajr).toBe(0)
  })
  it('retains 100 consecutive updates without lost increments', async () => {
    await Promise.all(Array.from({ length: 100 }, () => changeCount(db, date, 'fajr', 1)))
    expect((await db.records.get(date))?.fajr).toBe(100)
    expect(await db.records.count()).toBe(1)
  })
  it('serializes reads and writes across separate database connections', async () => {
    const other = new PrayerDatabase(db.name)
    try {
      await Promise.all(Array.from({ length: 40 }, (_, i) => changeCount(i % 2 ? db : other, date, 'dhuhr', 1)))
      expect((await db.records.get(date))?.dhuhr).toBe(40)
    } finally { other.close() }
  })
  it('keeps the ordering of mixed operations', async () => {
    await Promise.all([changeCount(db, date, 'asr', 8, 'set'), changeCount(db, date, 'asr', 1), changeCount(db, date, 'asr', -1)])
    expect((await db.records.get(date))?.asr).toBe(8)
  })
  it('edits historical counts and recalculates statistics', async () => {
    await changeCount(db, '2025-01-02', 'isha', 12, 'set')
    await changeCount(db, date, 'fajr', 5, 'set')
    expect(statistics(await db.records.toArray(), date).allTime).toBe(17)
    await changeCount(db, '2025-01-02', 'isha', 3, 'set')
    expect(statistics(await db.records.toArray(), date).allTime).toBe(8)
  })
  it('prevents duplicate dates under concurrent creation and primary-key inserts', async () => {
    await Promise.all(Array.from({ length: 15 }, () => ensureRecord(db, date)))
    await expect(db.records.add(emptyRecord(date))).rejects.toThrow()
    expect(await db.records.count()).toBe(1)
  })
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])('rejects invalid absolute count %s', async count => {
    await expect(changeCount(db, date, 'fajr', count, 'set')).rejects.toThrow()
    expect(await db.records.count()).toBe(0)
  })
  it('rejects invalid dates before writing', async () => {
    await expect(ensureRecord(db, '2026-02-30')).rejects.toThrow()
    expect(await db.records.count()).toBe(0)
  })
  it('survives closing and reopening the database', async () => {
    await changeCount(db, date, 'maghrib', 4, 'set')
    db.close(); await db.open()
    expect((await db.records.get(date))?.maghrib).toBe(4)
  })
})

describe('statistics and chart', () => {
  const rows = [
    { ...emptyRecord('2026-10-30'), fajr: 1 },
    { ...emptyRecord('2026-10-31'), dhuhr: 2 },
    { ...emptyRecord('2026-11-01'), asr: 3 },
    { ...emptyRecord(date), maghrib: 4, isha: 5 },
    emptyRecord('2026-10-29')
  ]
  it('calculates all-time, individual, daily, Saturday-week and month-to-date totals', () => {
    expect(statistics(rows, date)).toEqual({
      allTime: 15, daily: 9, weekly: 14, monthly: 12, activeDays: 4, recordedDays: 5,
      byPrayer: { date, fajr: 1, dhuhr: 2, asr: 3, maghrib: 4, isha: 5 }
    })
  })
  it('handles a week spanning a year boundary', () => {
    const r = [{ ...emptyRecord('2025-12-31'), fajr: 3 }, { ...emptyRecord('2026-01-01'), fajr: 2 }]
    expect(statistics(r, '2026-01-01')).toMatchObject({ allTime: 5, weekly: 5, monthly: 2 })
  })
  it('represents missing days separately from recorded zeros', () => {
    const chart = chartDays(rows, date, 7)
    expect(chart).toHaveLength(7)
    expect(chart[0]).toEqual({ date: '2026-10-27', recorded: false, total: 0 })
    expect(chart[2]).toEqual({ date: '2026-10-29', recorded: true, total: 0 })
    expect(chart[6]).toEqual({ date, recorded: true, total: 9 })
    expect(chartDays([], date, 30)).toHaveLength(30)
  })
  it('returns zero summaries for an empty database', () => {
    expect(statistics([], date)).toMatchObject({ allTime: 0, daily: 0, weekly: 0, monthly: 0, activeDays: 0 })
  })
})

describe('backup validation and atomic restoration', () => {
  it('exports version, timestamp, exact records and a local-date filename', () => {
    const now = new Date(2026, 10, 2, 0, 15)
    const records = [{ ...emptyRecord(date), fajr: 5, dhuhr: 3 }]
    const json = createBackup(records, now)
    expect(parseBackup(json)).toEqual({ schemaVersion: 1, exportedAt: now.toISOString(), records })
    expect(backupFilename(now)).toBe('prayer-tracker-backup-2026-11-02.json')
  })
  it.each(['not json', '{', 'null', '[]', '{}'])('rejects malformed backup %s', input => {
    expect(() => parseBackup(input)).toThrow()
  })
  it('rejects unsupported versions, invalid lists and invalid export timestamps', () => {
    expect(() => validateBackup({ ...makeBackup(), schemaVersion: 2 })).toThrow()
    expect(() => validateBackup({ ...makeBackup(), records: {} })).toThrow()
    expect(() => validateBackup({ ...makeBackup(), exportedAt: 'yesterday' })).toThrow()
    expect(() => validateBackup({ ...makeBackup(), exportedAt: '2026-02-30T10:00:00Z' })).toThrow()
  })
  it.each(['2026-02-29', '2026-11-31', '2026-1-02', '0000-01-01', '', '2026-11-02T00:00:00Z'])('rejects invalid record date %s', date => {
    expect(() => validateBackup(makeBackup([emptyRecord(date)]))).toThrow()
  })
  it.each([-1, 0.5, '3', null, NaN, Infinity, Number.MAX_SAFE_INTEGER])('rejects invalid count %s', count => {
    const backup = makeBackup()
    ;(backup.records[0] as unknown as Record<string, unknown>).asr = count
    expect(() => validateBackup(backup)).toThrow()
  })
  it('rejects missing fields, extra record fields and duplicate dates', () => {
    expect(() => validateBackup(makeBackup([emptyRecord(date), emptyRecord(date)]))).toThrow()
    expect(() => validateBackup({ ...makeBackup(), records: [{ date, fajr: 0 }] })).toThrow()
    expect(() => validateBackup({ ...makeBackup(), records: [{ ...emptyRecord(date), extra: 1 }] })).toThrow()
  })
  it('replaces all records and supports an intentionally empty backup', async () => {
    await ensureRecord(db, '2025-01-01')
    await restoreBackup(db, makeBackup([{ ...emptyRecord(date), fajr: 8 }]))
    expect(await db.records.toArray()).toEqual([{ ...emptyRecord(date), fajr: 8 }])
    await restoreBackup(db, makeBackup([]))
    expect(await db.records.count()).toBe(0)
  })
  it('keeps existing data when validation fails, including a late invalid row', async () => {
    await changeCount(db, date, 'fajr', 7, 'set')
    const bad = makeBackup([emptyRecord('2025-01-01'), { ...emptyRecord('2025-01-02'), isha: -1 }])
    await expect(restoreBackup(db, bad)).rejects.toThrow()
    expect((await db.records.toArray())).toEqual([{ ...emptyRecord(date), fajr: 7 }])
  })
  it('rolls back the clear AND a partial write when restoration fails', async () => {
    await changeCount(db, date, 'isha', 9, 'set')
    vi.spyOn(db.records, 'bulkAdd').mockImplementationOnce((async () => {
      // Fail after clear() and after one successful write inside the transaction.
      await db.records.add(emptyRecord('2025-01-01'))
      throw new Error('simulated storage failure')
    }) as typeof db.records.bulkAdd)
    await expect(restoreBackup(db, makeBackup())).rejects.toThrow('simulated storage failure')
    expect(await db.records.toArray()).toEqual([{ ...emptyRecord(date), isha: 9 }])
  })
})

describe('local calendar dates', () => {
  it('uses local calendar components instead of slicing UTC ISO strings', () => {
    const local = new Date(2026, 10, 2, 0, 5)
    expect(localDate(local)).toBe(date)
    const fakeLocal = { getFullYear: () => 2026, getMonth: () => 10, getDate: () => 2, toISOString: () => '2026-11-01T22:05:00.000Z' }
    expect(localDate(fakeLocal as Date)).toBe(date)
  })
  it('handles leap days, year boundaries and early years', () => {
    expect(validDate('2024-02-29')).toBe(true)
    expect(validDate('2026-02-29')).toBe(false)
    expect(shiftDate('2024-02-28', 1)).toBe('2024-02-29')
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31')
    expect(validDate('0001-01-01')).toBe(true)
  })
  it('uses Saturday as the start of each week', () => {
    expect(weekStart('2026-11-02')).toBe('2026-10-31')
    expect(weekStart('2026-10-31')).toBe('2026-10-31')
    expect(weekStart('2026-11-06')).toBe('2026-10-31')
  })
  it('steps across daylight saving dates as calendar days', () => {
    expect(shiftDate('2026-03-28', 1)).toBe('2026-03-29')
    expect(shiftDate('2026-10-29', 1)).toBe('2026-10-30')
  })
})
