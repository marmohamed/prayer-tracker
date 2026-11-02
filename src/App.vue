<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import { liveQuery } from 'dexie'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { db, changeCount, ensureRecord, restoreBackup } from './db'
import { localDate, formatDate, parseDate } from './dates'
import { emptyRecord, number, prayers, total, type DailyPrayerRecord, type Prayer } from './model'
import { chartDays, statistics } from './statistics'
import { backupFilename, createBackup, parseBackup, type Backup } from './backup'
import PrayerCounter from './components/PrayerCounter.vue'
import AppIcon from './components/AppIcon.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'

type Tab = 'today' | 'history' | 'statistics' | 'settings'
const tab = ref<Tab>('today')
const today = ref(localDate())
const records = ref<DailyPrayerRecord[]>([])
const loading = ref(true), storageError = ref(false), pending = ref(0), busy = ref(false)
const feedback = ref(''), feedbackError = ref(false)
const expanded = ref(''), chosenDate = ref(today.value)
const days = ref(7)
const importFile = ref<HTMLInputElement>()
const restore = ref<Backup | null>(null), deleting = ref<string | null>(null)
const online = ref(navigator.onLine), persistent = ref(false)
const heading = ref<HTMLElement>()
const tabs = [
  { key: 'today', title: 'اليوم', icon: 'sun' },
  { key: 'history', title: 'السجل', icon: 'history' },
  { key: 'statistics', title: 'الإحصائيات', icon: 'chart' }
] as const
const title = computed(() => ({ today: 'اليوم', history: 'السجل', statistics: 'الإحصائيات', settings: 'الإعدادات' })[tab.value])
const current = computed(() => records.value.find(r => r.date === today.value) ?? emptyRecord(today.value))
const stats = computed(() => statistics(records.value, today.value))
const chart = computed(() => chartDays(records.value, today.value, days.value))
const chartMax = computed(() => Math.max(1, ...chart.value.map(d => d.total)))
const locked = computed(() => loading.value || storageError.value || busy.value)
function notify(message: string, error = false) { feedback.value = message; feedbackError.value = error }
function storageFailure() { storageError.value = true; loading.value = false; notify('تعذّر الوصول إلى التخزين. قد تكون المساحة ممتلئة أو التخزين محظورًا. أعد المحاولة؛ لم نؤكد حفظ التغيير.', true) }
let subscription: { unsubscribe: () => void } | undefined
function subscribe() {
  subscription?.unsubscribe()
  loading.value = true
  subscription = liveQuery(() => db.records.orderBy('date').reverse().toArray()).subscribe({
    next: rows => { records.value = rows; loading.value = false; storageError.value = false },
    error: storageFailure
  })
}
async function retry() {
  try { await db.open(); subscribe(); feedback.value = '' } catch { storageFailure() }
}
async function update(date: string, prayer: Prayer, value: number, mode: 'delta' | 'set' = 'delta') {
  if (locked.value) return
  pending.value++
  try { await changeCount(db, date, prayer, value, mode) }
  catch { notify('تعذّر حفظ التغيير. راجع العدد الظاهر وأعد المحاولة. تحقّق من مساحة الجهاز وإتاحة التخزين.', true) }
  finally { pending.value-- }
}
function updateToday(prayer: Prayer, value: number) {
  refreshClock()
  return update(today.value, prayer, value)
}
async function addDay() {
  if (locked.value || !chosenDate.value) return
  pending.value++
  try { await ensureRecord(db, chosenDate.value); expanded.value = chosenDate.value; notify('السجل جاهز للتعديل، وتُحفظ الأعداد تلقائيًا.') }
  catch { notify('تعذّر فتح سجل اليوم. تحقّق من التاريخ والتخزين وأعد المحاولة.', true) }
  finally { pending.value-- }
}
async function deleteDay() {
  if (!deleting.value || pending.value) return
  busy.value = true
  try { await db.records.delete(deleting.value); deleting.value = null; notify('تم حذف سجل اليوم.') }
  catch { notify('تعذّر حذف السجل. أعد المحاولة.', true) }
  finally { busy.value = false }
}
async function exportData() {
  if (locked.value || pending.value) return
  busy.value = true
  try {
    const all = await db.records.orderBy('date').toArray()
    const url = URL.createObjectURL(new Blob([createBackup(all)], { type: 'application/json;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = backupFilename(); document.body.append(anchor); anchor.click(); anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    notify('تم تجهيز النسخة الاحتياطية للتنزيل. احتفظ بالملف في مكان آمن.')
  } catch { notify('تعذّر تصدير النسخة الاحتياطية. أعد المحاولة.', true) }
  finally { busy.value = false }
}
async function chooseBackup(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  busy.value = true
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('حجم الملف كبير جدًا. الحد الأقصى ٢٠ ميغابايت.')
    restore.value = parseBackup(await file.text())
  } catch (error) { notify(error instanceof Error ? error.message : 'تعذّرت قراءة الملف.', true) }
  finally { input.value = ''; busy.value = false }
}
async function confirmRestore() {
  if (!restore.value || pending.value) return
  busy.value = true
  try { await restoreBackup(db, restore.value); restore.value = null; expanded.value = ''; notify('تمت استعادة النسخة الاحتياطية بنجاح.') }
  catch { notify('تعذّرت الاستعادة. لم تُستبدل بياناتك الحالية. تحقّق من التخزين وأعد المحاولة.', true); restore.value = null }
  finally { busy.value = false }
}
async function requestPersistence() {
  try {
    persistent.value = !!(await navigator.storage?.persist?.())
    notify(persistent.value ? 'تم منح التخزين الدائم. واظب على النسخ الاحتياطي أيضًا.' : 'لم يمنح المتصفح التخزين الدائم. يمكنك متابعة الاستخدام والاحتفاظ بنسخ احتياطية.')
  } catch { notify('تعذّر طلب التخزين الدائم. احتفظ بنسخ احتياطية منتظمة.', true) }
}
interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
const install = ref<InstallEvent | null>(null)
function captureInstall(event: Event) { event.preventDefault(); install.value = event as InstallEvent }
function installed() { install.value = null }
async function installApp() {
  const event = install.value
  if (!event) return
  try { await event.prompt(); await event.userChoice } catch { notify('يمكنك تثبيت التطبيق من قائمة المتصفح.') }
  install.value = null
}
const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
  onRegisterError() { notify('تعذّر تجهيز التطبيق للعمل دون اتصال. افتحه متصلًا بالإنترنت ثم أعد المحاولة.', true) }
})
async function applyUpdate() {
  if (pending.value || busy.value) return
  try { await updateServiceWorker(true) } catch { notify('تعذّر تحديث التطبيق. حاول لاحقًا.', true) }
}
function refreshClock() { today.value = localDate(); online.value = navigator.onLine }
function beforeUnload(event: BeforeUnloadEvent) { if (pending.value || busy.value) { event.preventDefault(); event.returnValue = '' } }
let clock: ReturnType<typeof setInterval>
onMounted(() => {
  subscribe(); clock = setInterval(refreshClock, 15_000)
  window.addEventListener('focus', refreshClock)
  document.addEventListener('visibilitychange', refreshClock)
  window.addEventListener('online', refreshClock); window.addEventListener('offline', refreshClock)
  window.addEventListener('beforeinstallprompt', captureInstall); window.addEventListener('appinstalled', installed)
  window.addEventListener('beforeunload', beforeUnload)
  navigator.storage?.persisted?.().then(value => persistent.value = value).catch(() => {})
})
onUnmounted(() => {
  subscription?.unsubscribe(); clearInterval(clock)
  window.removeEventListener('focus', refreshClock); document.removeEventListener('visibilitychange', refreshClock)
  window.removeEventListener('online', refreshClock); window.removeEventListener('offline', refreshClock)
  window.removeEventListener('beforeinstallprompt', captureInstall); window.removeEventListener('appinstalled', installed)
  window.removeEventListener('beforeunload', beforeUnload)
})
watch(tab, async () => { feedback.value = ''; await nextTick(); heading.value?.focus(); window.scrollTo(0, 0) })
</script>

<template>
  <a class="skip" href="#main">انتقل إلى المحتوى</a>
  <div class="app-shell">
    <header class="app-header">
      <a class="brand" href="#" @click.prevent="tab = 'today'"><span class="brand-mark"><AppIcon name="moon" /></span><span>قضاء الصلوات<small>خطوةٌ كل يوم</small></span></a>
      <button class="icon-button" :class="{ selected: tab === 'settings' }" aria-label="الإعدادات" :aria-pressed="tab === 'settings'" @click="tab = 'settings'"><AppIcon name="settings" /></button>
    </header>
    <main id="main">
      <div class="page-heading"><div><p class="eyebrow">{{ tab === 'today' ? 'قليلٌ دائم، وأثرٌ باقٍ' : 'متابعة قضاء الصلوات' }}</p><h1 ref="heading" tabindex="-1">{{ title }}</h1></div><span class="local-badge"><span></span>{{ online ? 'محفوظ على جهازك' : 'دون اتصال' }}</span></div>
      <div v-if="feedback" :role="feedbackError ? 'alert' : 'status'" class="notice" :class="{ error: feedbackError }"><span>{{ feedback }}</span><button aria-label="إغلاق الرسالة" @click="feedback = ''">×</button></div>
      <div v-if="storageError" class="notice error"><span>التخزين غير متاح حاليًا.</span><button class="text-button" @click="retry">إعادة المحاولة</button></div>
      <div v-if="needRefresh" class="notice"><span>يتوفر إصدار جديد. تُحفظ سجلاتك عند التحديث.</span><button class="text-button" :disabled="pending > 0 || busy" @click="applyUpdate">تحديث الآن</button><button aria-label="تأجيل التحديث" @click="needRefresh = false">×</button></div>
      <p v-if="loading" class="loading" role="status">جارٍ فتح سجلاتك…</p>

      <section v-if="tab === 'today'" aria-label="تسجيل صلوات اليوم">
        <p class="date-line">{{ formatDate(today) }}</p>
        <div class="hero-card"><div><p>ما أتممته اليوم</p><div class="hero-number">{{ number(total(current)) }} <span>صلاة</span></div><small>كل صلاة تقضيها، خطوة للأمام</small></div><div class="hero-art" aria-hidden="true"><AppIcon name="sun" /></div></div>
        <div class="section-label"><h2>صلواتك اليوم</h2><span class="save-status" role="status">{{ pending ? 'جارٍ الحفظ…' : storageError ? 'التخزين غير متاح' : 'حفظ تلقائي' }}<AppIcon v-if="!pending && !storageError" name="check" /></span></div>
        <div class="card prayer-list"><PrayerCounter v-for="prayer in prayers" :key="prayer.key" :prayer="prayer.key" :name="prayer.name" :hint="prayer.hint" :count="current[prayer.key]" :disabled="locked" @delta="updateToday" /></div>
        <p class="quiet-note">سجّل عدد الصلوات التي قضيتها باستخدام + و −</p>
        <button v-if="install" class="install-hint" @click="installApp"><AppIcon name="download" /><span>صلواتك، أقرب إليك<small>ثبّت التطبيق للوصول إليه من شاشة هاتفك</small></span><span>تثبيت</span></button>
        <p v-if="offlineReady" class="offline-note"><AppIcon name="check" />التطبيق جاهز للعمل دون اتصال</p>
      </section>

      <section v-else-if="tab === 'history'" aria-label="سجل الصلوات">
        <p class="page-intro">أيامك المحفوظة، ويمكنك تعديلها في أي وقت.</p>
        <form class="card date-form" @submit.prevent="addDay"><label for="record-date">إضافة يوم أو تعديل سجل</label><div><input id="record-date" v-model="chosenDate" type="date" min="0001-01-01" :max="today" required :disabled="locked" /><button class="button" :disabled="locked || pending > 0">فتح اليوم</button></div></form>
        <div class="section-label"><h2>الأيام المسجّلة</h2><span>{{ number(records.length) }} يوم</span></div>
        <div v-if="!records.length && !loading" class="card empty-state"><AppIcon name="history" /><h2>هنا تبدأ حكاية الاستمرار</h2><p>سجّل أول صلاة من صفحة اليوم، أو اختر تاريخًا لإضافة يوم سابق.</p></div>
        <article v-for="row in records" :key="row.date" class="card history-day">
          <button class="day-toggle" :aria-expanded="expanded === row.date" :aria-controls="`day-${row.date}`" @click="expanded = expanded === row.date ? '' : row.date"><span>{{ formatDate(row.date) }}<small>{{ row.date === today ? 'اليوم · ' : '' }}{{ total(row) === 0 ? 'مسجّل دون صلوات' : 'صلوات مقضيّة' }}</small></span><strong>{{ number(total(row)) }}<small>صلاة</small></strong><AppIcon name="chevron" :class="{ rotated: expanded === row.date }" /></button>
          <div v-if="expanded === row.date" :id="`day-${row.date}`" class="day-details"><PrayerCounter v-for="p in prayers" :key="p.key" :prayer="p.key" :name="p.name" :count="row[p.key]" editable :disabled="locked" @delta="(key, value) => update(row.date, key, value)" @set="(key, value) => update(row.date, key, value, 'set')" @invalid="notify('أدخل عددًا صحيحًا غير سالب.', true)" /><div class="record-footer"><span>التعديل محفوظ تلقائيًا</span><button class="delete-button" :disabled="locked || pending > 0" @click="deleting = row.date"><AppIcon name="trash" />حذف اليوم</button></div></div>
        </article>
      </section>

      <section v-else-if="tab === 'statistics'" aria-label="إحصائيات الصلوات">
        <p class="page-intro">كل ما أتممته، في نظرة واحدة.</p>
        <div class="hero-card"><div><p>مجموع ما قضيته</p><div class="hero-number">{{ number(stats.allTime) }} <span>صلاة</span></div><small>على مدار جميع الأيام المسجّلة</small></div><div class="hero-art" aria-hidden="true"><AppIcon name="chart" /></div></div>
        <div class="stat-grid"><div class="card small-stat"><span>اليوم</span><strong>{{ number(stats.daily) }}</strong><small>صلاة</small></div><div class="card small-stat"><span>هذا الأسبوع</span><strong>{{ number(stats.weekly) }}</strong><small>من السبت إلى اليوم</small></div><div class="card small-stat"><span>هذا الشهر</span><strong>{{ number(stats.monthly) }}</strong><small>حتى اليوم</small></div><div class="card small-stat"><span>أيام النشاط</span><strong>{{ number(stats.activeDays) }}</strong><small>أيام بها صلوات مقضيّة</small></div></div>
        <div class="section-label"><h2>يومًا بيوم</h2><div class="segmented" aria-label="مدة الرسم"><button :aria-pressed="days === 7" @click="days = 7">٧ أيام</button><button :aria-pressed="days === 30" @click="days = 30">٣٠ يومًا</button></div></div>
        <div class="card chart-card"><p class="chart-caption">عدد الصلوات المقضيّة في آخر {{ number(days) }} أيام</p><div class="chart" :style="{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }" role="img" :aria-label="`رسم لعدد الصلوات في آخر ${number(days)} أيام، والتفاصيل في الجدول أدناه`"><div v-for="day in chart" :key="day.date" class="chart-column" :title="`${formatDate(day.date)}: ${day.recorded ? number(day.total) : 'لم يُسجّل'}`"><span v-if="days === 7" class="bar-value">{{ day.recorded ? number(day.total) : '—' }}</span><div class="bar-track"><span class="bar" :class="{ missing: !day.recorded, zero: day.recorded && day.total === 0 }" :style="{ height: day.total ? `${Math.max(3, day.total / chartMax * 100)}%` : '3px' }"></span></div><small v-if="days === 7">{{ new Intl.DateTimeFormat('ar-EG', { weekday: 'short' }).format(parseDate(day.date)) }}</small></div></div><div class="chart-legend"><span><i class="legend-filled"></i>صلوات مقضيّة</span><span><i class="legend-zero"></i>صفر مسجّل</span><span><i class="legend-missing"></i>لم يُسجّل</span></div><details><summary>عرض تفاصيل الأيام</summary><table><thead><tr><th>اليوم</th><th>الصلوات</th></tr></thead><tbody><tr v-for="day in [...chart].reverse()" :key="day.date"><td>{{ formatDate(day.date) }}</td><td>{{ day.recorded ? number(day.total) : 'لم يُسجّل' }}</td></tr></tbody></table></details></div>
        <div class="section-label"><h2>لكل صلاة نصيب</h2><span>جميع الأيام</span></div><div class="card totals-list"><div v-for="p in prayers" :key="p.key"><span>{{ p.name }}</span><strong>{{ number(stats.byPrayer[p.key]) }} <small>صلاة</small></strong></div></div><p class="quiet-note">{{ number(stats.recordedDays) }} يوم مسجّل، بما فيها الأيام المسجّلة بصفر.</p>
      </section>

      <section v-else aria-label="الإعدادات والنسخ الاحتياطي">
        <p class="page-intro">بياناتك تخصّك، ونسخة احتياطية تحفظها.</p>
        <div class="card settings-card"><span class="settings-symbol"><AppIcon name="download" /></span><h2>النسخ الاحتياطي</h2><p>احفظ نسخة من جميع سجلاتك، لاستعادتها هنا أو على جهاز آخر.</p><button class="button wide" :disabled="locked || pending > 0" @click="exportData"><AppIcon name="download" />تصدير نسخة احتياطية</button><button class="button secondary wide" :disabled="locked || pending > 0" @click="importFile?.click()"><AppIcon name="upload" />استعادة نسخة احتياطية</button><input ref="importFile" class="visually-hidden" tabindex="-1" type="file" accept=".json,application/json" aria-label="اختيار ملف النسخة الاحتياطية" @change="chooseBackup" /><p class="storage-warning">مسح بيانات التطبيق أو إلغاء تثبيته قد يحذف سجلاتك. ننصحك بتصدير نسخة احتياطية بانتظام وحفظها خارج الجهاز.</p></div>
        <div class="card settings-card"><h2>محفوظ على جهازك</h2><p>تُحفظ سجلاتك محليًا، وتعمل جميع وظائف التطبيق دون اتصال بعد تحميله أول مرة. لا حسابات ولا تتبّع ولا إرسال لبياناتك.</p><button v-if="!persistent" class="text-button" @click="requestPersistence">طلب التخزين الدائم</button><p v-else class="offline-note"><AppIcon name="check" />التخزين الدائم مفعّل</p><p class="fine-print">التخزين الدائم يقلّل احتمال إزالة البيانات تلقائيًا؛ ولا يغني عن النسخ الاحتياطي.</p></div>
        <div v-if="install" class="card settings-card"><h2>التطبيق على هاتفك</h2><p>وصول أسرع من الشاشة الرئيسية، في نافذة مستقلة.</p><button class="button" @click="installApp">تثبيت التطبيق</button></div>
        <div class="about"><span class="brand-mark"><AppIcon name="moon" /></span><h2>قضاء الصلوات</h2><p>متابعة ما أتممته من قضاء، يومًا بيوم.</p><small>الإصدار ١٫٠٫٠ · بداية الأسبوع: السبت<br />التواريخ حسب التقويم الميلادي والتوقيت المحلي لجهازك.</small></div>
      </section>
    </main>
    <nav class="bottom-nav" aria-label="التنقل الرئيسي"><button v-for="item in tabs" :key="item.key" :aria-current="tab === item.key ? 'page' : undefined" @click="tab = item.key"><span><AppIcon :name="item.icon" /></span>{{ item.title }}</button></nav>
    <ConfirmDialog v-if="deleting" title="حذف سجل اليوم؟" confirm="حذف السجل" :disabled="busy || pending > 0" @cancel="deleting = null" @confirm="deleteDay"><p>{{ formatDate(deleting) }}</p><p>سيُحذف هذا اليوم وصلواته من السجل والإحصائيات. لا يمكن التراجع عن الحذف.</p></ConfirmDialog>
    <ConfirmDialog v-if="restore" title="استعادة النسخة الاحتياطية؟" confirm="استبدال البيانات واستعادة النسخة" :disabled="busy || pending > 0" @cancel="restore = null" @confirm="confirmRestore"><p>تم التحقق من {{ number(restore.records.length) }} سجل في النسخة الاحتياطية.</p><p>ستستبدل هذه النسخة جميع سجلاتك الحالية ({{ number(records.length) }} سجل). ننصح بتصدير بياناتك الحالية أولًا.</p><p v-if="restore.records.length === 0">هذه النسخة فارغة؛ ستُحذف جميع السجلات الحالية عند تأكيد الاستعادة.</p></ConfirmDialog>
  </div>
</template>
