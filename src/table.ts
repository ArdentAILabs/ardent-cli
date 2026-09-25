import stringWidth from 'string-width'

import {terminalText} from './terminal.js'

const graphemeSegmenter = new Intl.Segmenter(undefined, {granularity: 'grapheme'})

export interface TableColumn<Row> {
  header: string
  maxWidth?: number
  minWidth?: number
  shrinkPriority?: number
  value: (row: Row) => string
}

export function renderTable<Row>(rows: Row[], columns: TableColumn<Row>[], terminalWidth = 120): string[] {
  const headers = columns.map(({header}) => terminalText(header))
  const values = rows.map((row) => columns.map(({value}) => terminalText(value(row))))
  const widths = columns.map((column, index) => {
    const headerWidth = stringWidth(headers[index])
    const naturalWidth = Math.max(headerWidth, ...values.map((row) => stringWidth(row[index])))
    return Math.min(naturalWidth, Math.max(headerWidth, column.maxWidth ?? naturalWidth))
  })
  const preferredMinimumWidths = columns.map((column, index) =>
    Math.min(widths[index], Math.max(stringWidth(headers[index]), column.minWidth ?? stringWidth(headers[index]))),
  )
  const frameWidth = columns.length * 3 + 1
  const availableWidth = Number.isFinite(terminalWidth) ? Math.floor(terminalWidth) : 120
  const narrowestTableWidth = frameWidth + columns.length
  let overflow = widths.reduce((total, width) => total + width, frameWidth) - Math.max(narrowestTableWidth, availableWidth)
  const shrinkOrder = columns
    .map((column, index) => ({index, priority: column.shrinkPriority ?? index}))
    .sort((left, right) => left.priority - right.priority)
  for (const minimumWidths of [preferredMinimumWidths, columns.map(() => 1)]) {
    for (const {index} of shrinkOrder) {
      const reduction = Math.min(Math.max(0, overflow), widths[index] - minimumWidths[index])
      widths[index] -= reduction
      overflow -= reduction
    }
  }

  const border = (left: string, divider: string, right: string) =>
    `${left}${widths.map((width) => '─'.repeat(width + 2)).join(divider)}${right}`
  const cell = (value: string, width: number) => {
    let display = value
    if (stringWidth(value) > width) {
      const contentWidth = width - stringWidth('…')
      let truncatedWidth = 0
      display = ''
      for (const {segment} of graphemeSegmenter.segment(value)) {
        const segmentWidth = stringWidth(segment)
        if (truncatedWidth + segmentWidth > contentWidth) break
        display += segment
        truncatedWidth += segmentWidth
      }
      display += '…'
    }
    return display + ' '.repeat(width - stringWidth(display))
  }
  const line = (row: string[]) => `│ ${row.map((value, index) => cell(value, widths[index])).join(' │ ')} │`

  return [
    border('┌', '┬', '┐'),
    line(headers),
    border('├', '┼', '┤'),
    ...values.map(line),
    border('└', '┴', '┘'),
  ]
}
