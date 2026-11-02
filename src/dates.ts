const pad = (n: number) => String(n).padStart(2, '0')
export function localDate(date = new Date()): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
export function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  const result = new Date(0)
  result.setFullYear(year!, month! - 1, day!)
  result.setHours(12, 0, 0, 0)
  return result
}
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const [year, month, day] = value.split('-').map(Number)
  if (month! < 1 || month! > 12 || day! < 1) return false
  const leap = year! % 4 === 0 && (year! % 100 !== 0 || year! % 400 === 0)
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day! <= monthDays[month! - 1]!
}
export function shiftDate(value: string, days: number): string {
  const date = parseDate(value)
  date.setDate(date.getDate() + days)
  return localDate(date)
}
export const formatDate = (value: string) => new Intl.DateTimeFormat('ar-EG', {
  calendar: 'gregory', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
}).format(parseDate(value))
export function weekStart(today: string): string {
  // Saturday is the first day of the week, explicitly labelled in the UI.
  return shiftDate(today, -((parseDate(today).getDay() + 1) % 7))
}
