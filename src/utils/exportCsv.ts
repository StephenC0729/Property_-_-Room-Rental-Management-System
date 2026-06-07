import Papa from 'papaparse'

/**
 * Triggers a browser download of the provided data as a UTF-8 CSV file.
 * @param data - Array of objects to export (keys become column headers)
 * @param filename - The download filename (without extension)
 */
export function exportToCsv<T extends Record<string, unknown>>(
  data: T[],
  filename: string
): void {
  const csv = Papa.unparse(data)
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Formats a number as Malaysian Ringgit: "RM 450.00"
 */
export function formatRinggit(amount: number): string {
  return `RM ${amount.toFixed(2)}`
}
