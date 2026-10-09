// Real weather for the "local" weather setting, from Open-Meteo (free, no API key). Nothing is fetched unless the user
// picks local weather. Each place is looked up at most once per REFRESH, and any failure reads as clear.
import type { Weather } from "./wallpaper"

export const REFRESH = 30 * 60_000

export interface Forecast {
  weather: Weather
  latitude?: number
}

const cache = new Map<string, { at: number; result: Forecast }>()

export async function forecast(location: string): Promise<Forecast> {
  const cached = cache.get(location)
  if (cached && Date.now() - cached.at < REFRESH) return cached.result
  const result = await lookup(location).catch((): Forecast => ({ weather: "clear" }))
  cache.set(location, { at: Date.now(), result })
  return result
}

// A location written as "latitude,longitude".
export function coordinatesOf(location: string) {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(location)
  if (!match) return undefined
  return { latitude: Number(match[1]), longitude: Number(match[2]) }
}

async function lookup(location: string): Promise<Forecast> {
  const place = coordinatesOf(location) ?? (await geocode(location))
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=weather_code`, { signal: AbortSignal.timeout(10_000) })
  const body = (await response.json()) as { current?: { weather_code?: number } }
  return { weather: weatherFor(body.current?.weather_code), latitude: place.latitude }
}

// A place name such as "Berlin"; Open-Meteo searches names only, so anything after a comma is dropped.
async function geocode(name: string) {
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(name.split(",")[0].trim())}`, { signal: AbortSignal.timeout(10_000) })
  const body = (await response.json()) as { results?: { latitude: number; longitude: number }[] }
  const place = body.results?.[0]
  if (!place) throw new Error(`no place called ${name}`)
  return place
}

// WMO weather codes: 3 overcast, 45 and 48 fog, 71-77 and 85-86 snow, 51 and up (drizzle, rain, showers, storms) rain.
function weatherFor(code: number | undefined): Weather {
  if (code === undefined) return "clear"
  if (code === 45 || code === 48) return "fog"
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow"
  if (code >= 51) return "rain"
  if (code === 3) return "overcast"
  return "clear"
}
