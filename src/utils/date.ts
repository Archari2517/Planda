/**
 * Local-date helpers.
 *
 * IMPORTANT: Never use `date.toISOString().split('T')[0]` to get a "YYYY-MM-DD"
 * string for a Date that represents a LOCAL calendar day (e.g. `new Date()`,
 * `new Date(y, m, d)`, or a Date after `.setDate(...)`). `toISOString()` first
 * converts the Date to UTC, which shifts the date backward by one day for any
 * positive UTC-offset timezone (e.g. Bangkok, UTC+7) whenever local time is
 * before the UTC offset catches up (e.g. midnight–7am in Bangkok), and can
 * shift dates around month/day-grid boundaries too.
 *
 * Always build "YYYY-MM-DD" strings from the LOCAL year/month/date fields
 * instead, using `toLocalDateStr` below.
 */
export function toLocalDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Today's date as "YYYY-MM-DD" in the user's local timezone. */
export function getLocalTodayStr(): string {
  return toLocalDateStr(new Date());
}

/**
 * จำนวนวันที่เหลือถึง targetDateStr ("YYYY-MM-DD") นับจากวันนี้ (local time)
 * ค่าบวก = ยังเหลือเวลา, 0 = วันนี้คือวันครบกำหนด, ค่าลบ = เลยกำหนดมาแล้วกี่วัน
 * ใช้ร่วมกับ Deadline Task (งานที่มีกำหนดส่ง) เพื่อคำนวณตัวนับถอยหลัง
 */
export function daysUntil(targetDateStr: string, fromDateStr: string = getLocalTodayStr()): number {
  const target = new Date(targetDateStr + 'T00:00:00');
  const from = new Date(fromDateStr + 'T00:00:00');
  const diffMs = target.getTime() - from.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

// สถานะความเร่งด่วนของงานที่มีกำหนดส่ง — ใช้เลือกสี/สไตล์ของ badge นับถอยหลัง
export type DeadlineUrgency = 'overdue' | 'today' | 'soon' | 'upcoming';

export function getDeadlineUrgency(daysLeft: number): DeadlineUrgency {
  if (daysLeft < 0) return 'overdue';
  if (daysLeft === 0) return 'today';
  if (daysLeft <= 3) return 'soon';
  return 'upcoming';
}

/** ข้อความตัวนับถอยหลังของ Deadline Task เช่น "เหลืออีก 3 วัน" / "ครบกำหนดวันนี้" / "เลยกำหนด 2 วัน" */
export function formatDeadlineCountdown(daysLeft: number, language: 'th' | 'en' = 'th'): string {
  if (language === 'th') {
    if (daysLeft < 0) return `เลยกำหนด ${Math.abs(daysLeft)} วัน`;
    if (daysLeft === 0) return 'ครบกำหนดวันนี้';
    if (daysLeft === 1) return 'เหลืออีก 1 วัน';
    return `เหลืออีก ${daysLeft} วัน`;
  }
  if (daysLeft < 0) return `${Math.abs(daysLeft)}d overdue`;
  if (daysLeft === 0) return 'Due today';
  if (daysLeft === 1) return '1 day left';
  return `${daysLeft} days left`;
}
