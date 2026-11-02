export const prayers = [
  { key: 'fajr', name: 'الفجر', hint: 'مع إشراقة يومك' },
  { key: 'dhuhr', name: 'الظهر', hint: 'خطوة في طريقك' },
  { key: 'asr', name: 'العصر', hint: 'كل صلاة تُحتسب' },
  { key: 'maghrib', name: 'المغرب', hint: 'خيرٌ يتجدد' },
  { key: 'isha', name: 'العشاء', hint: 'ختامٌ بالطمأنينة' }
] as const
export type Prayer = typeof prayers[number]['key']
export type DailyPrayerRecord = { date: string } & Record<Prayer, number>
export function emptyRecord(date: string): DailyPrayerRecord {
  return { date, fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }
}
export const total = (record: DailyPrayerRecord) => prayers.reduce((sum, p) => sum + record[p.key], 0)
export const number = (value: number) => new Intl.NumberFormat('ar-EG').format(value)
export function validCount(value: unknown): value is number {
  // Bound each count so sums over the five prayers are exactly representable.
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= Math.floor(Number.MAX_SAFE_INTEGER / 5)
}
