// Browser-safe: used by the Calendar tab (client) and lib/calendar.ts.
// Leave: made with the 🌴 Leave option (tagged in Google), or any all-day event
// whose title says so — "Annual leave", "MC", "OOO", "Cuti", "Off day"…
// (Public holidays are not anyone's leave, so "holiday" is not a leave word.)
const LEAVE_WORDS = /\b(leave|medical|sick|out of office|off day|day off|cuti|bercuti|vacation)\b/i
const LEAVE_CODES = /\b(AL|MC|EL|OOO)\b/   // upper-case only, so "al" in a name doesn't count
export const isLeave = (e: { kind?: string; title: string; allDay: boolean }) =>
  e.kind === 'leave' || (e.allDay && (LEAVE_WORDS.test(e.title) || LEAVE_CODES.test(e.title)))
