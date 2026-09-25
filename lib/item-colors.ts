// The colours a team member can give a calendar item (Production Timeline,
// Social Calendar, Events / Others). Stored as meta.color = key. Browser-safe.
export const ITEM_COLORS = [
  { key: 'red',    label: 'Red',    fg: '#C2302A', bg: 'rgba(194,48,42,.16)' },
  { key: 'orange', label: 'Orange', fg: '#D9731A', bg: 'rgba(217,115,26,.18)' },
  { key: 'yellow', label: 'Yellow', fg: '#B8940F', bg: 'rgba(230,190,40,.26)' },
  { key: 'green',  label: 'Green',  fg: '#2E8B57', bg: 'rgba(46,139,87,.17)' },
  { key: 'teal',   label: 'Teal',   fg: '#16877F', bg: 'rgba(22,135,127,.17)' },
  { key: 'blue',   label: 'Blue',   fg: '#1E5FC4', bg: 'rgba(30,95,196,.16)' },
  { key: 'purple', label: 'Purple', fg: '#7A4FB5', bg: 'rgba(122,79,181,.17)' },
  { key: 'pink',   label: 'Pink',   fg: '#C8407E', bg: 'rgba(200,64,126,.16)' },
] as const

export type ItemColor = (typeof ITEM_COLORS)[number]
export const colorOf = (key: unknown): ItemColor | undefined => ITEM_COLORS.find(c => c.key === key)

// CSS variables the chip / tag / list row read (--tone, --tone-bg).
export const colorStyle = (key: unknown) => {
  const c = colorOf(key)
  return c ? ({ '--tone': c.fg, '--tone-bg': c.bg } as React.CSSProperties) : undefined
}
