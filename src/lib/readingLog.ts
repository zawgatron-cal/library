import { useEffect, useState } from 'react'

const KEY = 'library:reading-log'
const EVENT = 'library:reading-log'

type Log = Record<string, number>

const dayKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function readLog(): Log {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function logReading(seconds: number) {
  const log = readLog()
  const key = dayKey()
  log[key] = (log[key] ?? 0) + seconds
  localStorage.setItem(KEY, JSON.stringify(log))
  window.dispatchEvent(new Event(EVENT))
}

function streakFrom(log: Log) {
  let streak = 0
  const day = new Date()
  if (!log[dayKey(day)]) day.setDate(day.getDate() - 1)
  while ((log[dayKey(day)] ?? 0) >= 60) {
    streak++
    day.setDate(day.getDate() - 1)
  }
  return streak
}

function lastDays(log: Log, count: number) {
  const days: { key: string; label: string; seconds: number }[] = []
  const day = new Date()
  day.setDate(day.getDate() - (count - 1))
  for (let i = 0; i < count; i++) {
    days.push({
      key: dayKey(day),
      label: day.toLocaleDateString(undefined, { weekday: 'narrow' }),
      seconds: log[dayKey(day)] ?? 0,
    })
    day.setDate(day.getDate() + 1)
  }
  return days
}

export function useReadingLog() {
  const [log, setLog] = useState(readLog)

  useEffect(() => {
    const refresh = () => setLog(readLog())
    window.addEventListener(EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  return {
    today: log[dayKey()] ?? 0,
    streak: streakFrom(log),
    week: lastDays(log, 7),
  }
}
