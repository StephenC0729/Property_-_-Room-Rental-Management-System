/**
 * Derives a room code from the property name + room number.
 * "House 1" + "R1" → "1-R1"
 */
export function buildRoomCode(propertyName: string, roomNumber: string): string {
  const houseNum = propertyName.match(/\d+/)?.[0] ?? '1'
  return `${houseNum}-${roomNumber}`
}

/** Room suffix from a full code, e.g. "1222-A1" → "A1". */
export function roomNumberFromCode(roomCode: string): string {
  const parts = roomCode.split('-')
  return parts.length > 1 ? parts.slice(1).join('-') : roomCode
}

/** Compare room numbers like A1, A2, B1, B2 (letter then numeric). */
export function compareRoomNumbers(a: string, b: string): number {
  const parse = (value: string) => {
    const trimmed = value.trim()
    const match = trimmed.match(/^([A-Za-z]+)?(\d+)?$/)
    if (!match) return { letters: trimmed.toUpperCase(), number: 0 }
    return {
      letters: (match[1] ?? '').toUpperCase(),
      number: match[2] ? parseInt(match[2], 10) : 0,
    }
  }

  const pa = parse(a)
  const pb = parse(b)
  const letterCmp = pa.letters.localeCompare(pb.letters)
  if (letterCmp !== 0) return letterCmp
  return pa.number - pb.number
}

/** Property name, then room number — e.g. 1222-A1, 1222-A2, 1222-B1, 1222-B2. */
export function compareReportRoomRows(
  a: { property_name: string; room_number: string; room_code: string },
  b: { property_name: string; room_number: string; room_code: string },
): number {
  const propCmp = a.property_name.localeCompare(b.property_name)
  if (propCmp !== 0) return propCmp
  const roomCmp = compareRoomNumbers(a.room_number, b.room_number)
  if (roomCmp !== 0) return roomCmp
  return a.room_code.localeCompare(b.room_code)
}
