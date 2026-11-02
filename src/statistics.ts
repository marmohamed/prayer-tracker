import { type DailyPrayerRecord, emptyRecord, total, prayers } from './model'
import { shiftDate, weekStart } from './dates'
export function statistics(records: DailyPrayerRecord[], today: string) {
  const byPrayer = emptyRecord(today)
  let allTime = 0, daily = 0, weekly = 0, monthly = 0, activeDays = 0
  const start = weekStart(today)
  for (const record of records) {
    const sum = total(record)
    allTime += sum
    for (const prayer of prayers) byPrayer[prayer.key] += record[prayer.key]
    if (record.date === today) daily += sum
    if (record.date >= start && record.date <= today) weekly += sum
    if (record.date.slice(0, 7) === today.slice(0, 7) && record.date <= today) monthly += sum
    if (sum > 0) activeDays++
  }
  return { allTime, daily, weekly, monthly, activeDays, recordedDays: records.length, byPrayer }
}
export function chartDays(records: DailyPrayerRecord[], today: string, days: number) {
  const byDate = new Map(records.map(r => [r.date, r]))
  return Array.from({ length: days }, (_, i) => {
    const date = shiftDate(today, i - days + 1)
    const row = byDate.get(date)
    return { date, recorded: !!row, total: row ? total(row) : 0 }
  })
}
