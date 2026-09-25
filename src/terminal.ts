const terminalControlCharacter = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g

export function terminalText(value: string): string {
  return value.replace(terminalControlCharacter, (character) => {
    const codePoint = character.codePointAt(0)
    if (codePoint === undefined) return ''
    return `\\u${codePoint.toString(16).padStart(4, '0')}`
  })
}
