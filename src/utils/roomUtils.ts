/**
 * Derives a room code from the property name + room number.
 * "House 1" + "R1" → "1-R1"
 */
export function buildRoomCode(propertyName: string, roomNumber: string): string {
  const houseNum = propertyName.match(/\d+/)?.[0] ?? '1'
  return `${houseNum}-${roomNumber}`
}
