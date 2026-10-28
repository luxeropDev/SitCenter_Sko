import { describe, expect, it } from 'vitest'
import { toCsv } from '@/lib/csv'

describe('toCsv', () => {
  it('writes a header row and CRLF line endings', () => {
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('a,b\r\n1,x')
  })
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv(['v'], [['a,b'], ['say "hi"'], ['line\nbreak']])).toBe('v\r\n"a,b"\r\n"say ""hi"""\r\n"line\nbreak"')
  })
  it('neutralises spreadsheet formula injection', () => {
    expect(toCsv(['v'], [['=SUM(A1)'], ['+1'], ['-1'], ['@cmd']])).toBe("v\r\n'=SUM(A1)\r\n'+1\r\n'-1\r\n'@cmd")
  })
  it('renders null/undefined as empty cells', () => {
    expect(toCsv(['a', 'b', 'c'], [[null, undefined, 0]])).toBe('a,b,c\r\n,,0')
  })
})
