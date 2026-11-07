import { useState } from "react"
import { useWorldStore } from "../store/worldStore"
import { getSpawnPosition } from "../utils/spawnPosition"
import {
  parseWorldPrompt,
  detectTheme,
  type ParsedWorldPrompt,
} from "../ai/worldPromptParser"
import { executeWorldCommand } from "../api/worldApi"

// =============================================================
// DETERMINISTIC INTENT MATCHER
// =============================================================
// Lightweight keyword/regex matching for obvious crisis/event
// intents on the EXISTING world (Food Crisis, Water Crisis, etc.).
// This is checked only when the prompt has no explicit environment/
// theme keyword — a world-creation prompt like "make a desert with
// no water" must be parsed as a new desert world with water=0, not
// misfire as a CREATE_WATER_CRISIS command on whatever world already
// exists. World Prompt and the Crisis Controls remain complementary:
// this matcher only ever fires for phrasing with no theme signal at
// all (a bare "drought" or "there is no food"), exactly mirroring
// what ChallengePanel's buttons already do.

const DETERMINISTIC_INTENTS: {
  pattern: RegExp
  action: string
}[] = [
  {
    pattern: /\b(food crisis|food shortage|no food|starving|starvation|famine)\b/i,
    action: "CREATE_FOOD_CRISIS",
  },
  {
    pattern: /\b(water crisis|no water|drought|dehydrat\w*)\b/i,
    action: "CREATE_WATER_CRISIS",
  },
  {
    pattern: /\b(housing crisis|destroy (the |some )?houses?|no (more )?housing|homeless)\b/i,
    action: "CREATE_HOUSING_CRISIS",
  },
  {
    pattern: /\b(population surge|population (boom|growth)|add (more )?people|increase (the )?population)\b/i,
    action: "CREATE_POPULATION_CRISIS",
  },
]

function matchDeterministicIntent(prompt: string): string | null {
  for (const { pattern, action } of DETERMINISTIC_INTENTS) {
    if (pattern.test(prompt)) {
      return action
    }
  }
  return null
}

const THEME_ICON: Record<string, string> = {
  desert: "🌵",
  city: "🏙️",
  forest: "🌲",
  standard: "🏘️",
}

const THEME_LABEL: Record<string, string> = {
  desert: "Desert",
  city: "City",
  forest: "Forest",
  standard: "Standard",
}

export function WorldPrompt() {
  const [prompt, setPrompt] = useState("")
  const [plan, setPlan] = useState<ParsedWorldPrompt | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const addEntity = useWorldStore(
    (state) => state.addEntity
  )

  const resetWorld = useWorldStore(
    (state) => state.resetWorld
  )

  const setTheme = useWorldStore(
    (state) => state.setTheme
  )

  const createEntity = (
    type: "house" | "tree" | "agent" | "food"
  ) => {
    const entities =
      useWorldStore.getState().entities

    const position = getSpawnPosition(
      type,
      entities
    )

    addEntity({
      id: crypto.randomUUID(),
      type,
      position,

      ...(type === "agent"
        ? {
            energy: 100,
            hunger: 0,
            goal: "WANDER" as const,
          }
        : {}),
    })
  }

  const generatePlan = async () => {
    if (!prompt.trim()) return

    // Only treat this as a possible crisis-control phrase when there's
    // no explicit environment/theme keyword — "make a desert with no
    // water" must become a new desert world with water=0, not a
    // CREATE_WATER_CRISIS command fired at whatever world exists now.
    if (!detectTheme(prompt)) {
      const matchedAction = matchDeterministicIntent(prompt)

      if (matchedAction) {
        setStatusMessage("Applying recognized command...")

        try {
          const response = await executeWorldCommand(matchedAction)
          setStatusMessage(response.result ?? "Command applied.")
        } catch (error) {
          console.error("Failed to execute matched intent:", error)
          setStatusMessage("Could not reach Java backend.")
        }

        setPrompt("")
        return
      }
    }

    const parsed = parseWorldPrompt(prompt)
    setPlan(parsed)
  }

  const executePlan = async () => {
  if (!plan) return

  const { config } = plan

  // Clear the local view immediately (including any old decorative
  // trees) for instant feedback while Java processes the real commands.
  resetWorld()

  try {
    // Java is authoritative for population, houses, and resource
    // reserves. Every one of these goes through the same command
    // endpoint ChallengePanel uses — never a direct Zustand mutation.
    await executeWorldCommand("RESET_WORLD")

    if (config.houses > 0) {
      await executeWorldCommand("BUILD_HOUSE", config.houses)
    }

    for (let i = 0; i < config.agents; i++) {
      await executeWorldCommand("ADD_AGENT")
    }

    // SET_FOOD/SET_WATER (exact value, not additive) run after agents
    // are added so Java's population-scaled capacity reflects the
    // real final population before these get clamped against it.
    await executeWorldCommand("SET_FOOD", config.food)
    await executeWorldCommand("SET_WATER", config.water)

    // Theme is purely visual/client-side, like trees — Java has no
    // concept of it.
    setTheme(config.theme)

    // Trees have no equivalent in Java's World model and are never
    // reasoned about by the Director, so they stay purely decorative
    // and client-side. worldStore.syncJavaWorld preserves them.
    for (let i = 0; i < config.trees; i++) {
      createEntity("tree")
    }
  } catch (error) {
    console.error("Failed to execute world plan:", error)
  }

  setPlan(null)
  setPrompt("")
}

const cancelPlan = () => {
  setPlan(null)
}
  return (
    <div style={{ color: "white", fontFamily: "Arial, sans-serif" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>
        🌍 Build
      </h2>
      <div
        style={{
          fontSize: 11,
          opacity: 0.5,
          marginBottom: 16,
        }}
      >
        Describe the world you want. Houses, agents, food and water
        go through Java; theme and trees are visual only.
      </div>

      {!plan ? (
            <>
              <textarea
                value={prompt}
                onChange={(event) =>
                  setPrompt(event.target.value)
                }
                placeholder="Build a small farming village..."
                style={{
                  width: "100%",
                  height: 110,
                  marginTop: 10,
                  padding: 12,
                  boxSizing: "border-box",
                  resize: "none",
                  borderRadius: 10,
                  border:
                    "1px solid rgba(255,255,255,0.12)",
                  background:
                    "rgba(255,255,255,0.06)",
                  color: "white",
                  outline: "none",
                  fontSize: 13,
                  fontFamily: "Arial, sans-serif",
                }}
              />

              <button
                onClick={generatePlan}
                disabled={!prompt.trim()}
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 10,
                  border: "none",
                  background: prompt.trim()
                    ? "rgba(80,120,255,0.85)"
                    : "rgba(255,255,255,0.08)",
                  color: "white",
                  cursor: prompt.trim()
                    ? "pointer"
                    : "default",
                  fontWeight: "bold",
                }}
              >
                🧠 Generate World Plan
              </button>

              {statusMessage && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.05)",
                    fontSize: 11,
                    opacity: 0.7,
                  }}
                >
                  {statusMessage}
                </div>
              )}
            </>
          ) : (
            <>
              <div
                style={{
                  marginTop: 18,
                  fontSize: 10,
                  letterSpacing: 1.5,
                  opacity: 0.45,
                }}
              >
                WORLD INTERPRETATION
              </div>

              <div
                style={{
                  marginTop: 8,
                  padding: 14,
                  borderRadius: 12,
                  background:
                    "rgba(80,120,255,0.12)",
                  border:
                    "1px solid rgba(100,140,255,0.2)",
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  "{prompt}"
                </div>
              </div>

              <div
                style={{
                  marginTop: 14,
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                {THEME_ICON[plan.config.theme]} {THEME_LABEL[plan.config.theme]}
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <PlanStat
                  icon="👥"
                  label="AGENTS"
                  value={plan.config.agents}
                  specified={plan.userSpecified.agents}
                />

                <PlanStat
                  icon="🏠"
                  label="HOUSES"
                  value={plan.config.houses}
                  specified={plan.userSpecified.houses}
                />

                <PlanStat
                  icon="🌳"
                  label="TREES"
                  value={plan.config.trees}
                  specified={plan.userSpecified.trees}
                />

                <PlanStat
                  icon="🍎"
                  label="FOOD"
                  value={plan.config.food}
                  specified={plan.userSpecified.food}
                />

                <PlanStat
                  icon="💧"
                  label="WATER"
                  value={plan.config.water}
                  specified={plan.userSpecified.water}
                />
              </div>

              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 10,
                  background:
                    "rgba(255,255,255,0.05)",
                  fontSize: 12,
                  opacity: 0.7,
                  lineHeight: 1.4,
                }}
              >
                {plan.interpretation}
              </div>

              <button
                onClick={executePlan}
                style={{
                  width: "100%",
                  marginTop: 12,
                  padding: 13,
                  borderRadius: 10,
                  border: "none",
                  background:
                    "rgba(60,190,120,0.85)",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                🌍 Create This World
              </button>

              <button
                onClick={cancelPlan}
                style={{
                  width: "100%",
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 10,
                  border:
                    "1px solid rgba(255,255,255,0.1)",
                  background:
                    "rgba(255,255,255,0.05)",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                ← Change Prompt
              </button>
            </>
          )}
    </div>
  )
}

function PlanStat({
  icon,
  label,
  value,
  specified,
}: {
  icon: string
  label: string
  value: number
  specified?: boolean
}) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background:
          "rgba(255,255,255,0.06)",
      }}
    >
      <div>{icon}</div>

      <div
        style={{
          marginTop: 4,
          fontSize: 20,
          fontWeight: "bold",
        }}
      >
        {value}
      </div>

      <div
        style={{
          fontSize: 9,
          opacity: 0.45,
        }}
      >
        {label}
      </div>

      {specified && (
        <div
          style={{
            marginTop: 4,
            fontSize: 8,
            letterSpacing: 0.5,
            fontWeight: 700,
            color: "#8fb8ff",
          }}
        >
          USER SPECIFIED
        </div>
      )}
    </div>
  )
}