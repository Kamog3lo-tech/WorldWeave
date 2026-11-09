export type JavaAgent = {
  id: string
  x: number
  z: number
  energy: number
  hunger: number
  thirst: number
  goal: string
  occupation: string
  money: number
}

export type JavaHouse = {
  id: string
  x: number
  z: number
}

export type JavaFood = {
  id: string
  x: number
  z: number
}

export type JavaWorldState = {
  time: number
  population: number
  food: number
  water: number
  // Java-authoritative dynamic capacity — the actual ceiling for this
  // settlement's population, not a fixed constant.
  foodCapacity: number
  waterCapacity: number
  paused: boolean
  // Real events — generated in Java at the exact point a state change
  // happened, newest first. Never fabricated in React.
  events: string[]
  agents: JavaAgent[]
  houses: JavaHouse[]
  foods: JavaFood[]
}

export type JavaCommandResult = {
  result: string
  updatedWorld: JavaWorldState
}

const JAVA_API_URL =
  import.meta.env.VITE_JAVA_API_URL || "http://localhost:8080"

const API_BASE = `${JAVA_API_URL}/api`

// A genuinely stalled connection (not a fast error — Java simply
// never responding) would otherwise leave a fetch() pending forever.
// This hit once already: the Director's approve path hung on exactly
// this, and every caller of these two functions shares the same
// underlying risk. Fixed once here instead of wrapping every call
// site. 8s is longer than any real Java round-trip should ever take
// but short enough that the 150ms poll's next cycle recovers quickly.
const REQUEST_TIMEOUT_MS = 8000

async function fetchWithTimeout(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController()

  const timeoutId = setTimeout(() => {
    controller.abort()
  }, REQUEST_TIMEOUT_MS)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        `Java API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${url}`,
        { cause: error },
      )
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

// ========================================================
// GET WORLD
// ========================================================

export async function fetchWorldState(): Promise<JavaWorldState> {
  const response = await fetchWithTimeout(
    `${API_BASE}/world`
  )

  if (!response.ok) {
    throw new Error(
      `Java API error: ${response.status}`
    )
  }

  return response.json()
}

// ========================================================
// EXECUTE COMMAND
// ========================================================

export async function executeWorldCommand(
  action: string,
  amount?: number
): Promise<JavaCommandResult> {

  const body: {
    action: string
    amount?: number
  } = {
    action,
  }

  if (amount !== undefined) {
    body.amount = amount
  }

  const response = await fetchWithTimeout(
    `${API_BASE}/command`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(body),
    }
  )

  if (!response.ok) {
    throw new Error(
      `Java command error: ${response.status}`
    )
  }

  return response.json()
}
