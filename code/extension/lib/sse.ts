export type SseEvent = {
  event: string | null
  data: string
}

export function parseSseEvents(buffer: string, finalize = false): { events: SseEvent[]; rest: string } {
  const lines = buffer.split(/\r?\n/)
  const events: SseEvent[] = []
  let currentEvent: string | null = null
  let currentData: string[] = []

  const limit = finalize ? lines.length : Math.max(lines.length - 1, 0)
  for (let index = 0; index < limit; index += 1) {
    const line = lines[index]

    if (!line) {
      if (currentData.length > 0) {
        events.push({ event: currentEvent, data: currentData.join("\n") })
        currentEvent = null
        currentData = []
      }
      continue
    }

    if (line.startsWith("event:")) {
      currentEvent = line.slice("event:".length).trim()
      continue
    }

    if (line.startsWith("data:")) {
      currentData.push(line.slice("data:".length).trimStart())
    }
  }

  if (finalize && currentData.length > 0) {
    events.push({ event: currentEvent, data: currentData.join("\n") })
  }

  return {
    events,
    rest: finalize ? "" : lines[lines.length - 1] ?? ""
  }
}