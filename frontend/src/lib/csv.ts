/** RFC 4180-style CSV export with proper escaping and UTF-8 BOM for Excel. */
export function toCsv(headers: string[], rows: (string | number | null | undefined | boolean)[][]): string {
  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    let s = String(v)
    // Neutralise spreadsheet formula injection.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
    return s
  }
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n')
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
