import { useState } from "react"
import { executeWorldCommand } from "../api/worldApi"
import { forceDirectorEvaluation } from "../ai/directorLoop"

type Scenario =
  | "FAMINE"
  | "DROUGHT"
  | "HOUSING"
  | "POPULATION"
  | "EVALUATE"

export function ChallengePanel() {
  const [active, setActive] = useState<Scenario | null>(null)
  const [message, setMessage] = useState(
    "Trigger a scenario and watch the world react."
  )

  async function trigger(scenario: Scenario, action: string) {
    setActive(scenario)
    setMessage("Applying...")

    try {
      const response = await executeWorldCommand(action)
      setMessage(
        response.result ??
          "Applied. The Director will evaluate on its next cycle."
      )
    } catch (error) {
      console.error(error)
      setMessage("Could not reach Java backend.")
    }
  }

  function scenarioButton(
    scenario: Scenario,
    icon: string,
    title: string,
    description: string,
    onClick: () => void
  ) {
    const isActive = active === scenario

    return (
      <button
        onClick={onClick}
        style={{
          width: "100%",
          padding: "12px",
          marginBottom: 8,
          borderRadius: 10,
          border: isActive
            ? "1px solid rgba(255,255,255,0.4)"
            : "1px solid rgba(255,255,255,0.08)",
          background: isActive
            ? "rgba(255,255,255,0.15)"
            : "rgba(255,255,255,0.06)",
          color: "white",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 20 }}>{icon}</span>

          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {title}
            </div>

            <div
              style={{
                fontSize: 11,
                opacity: 0.55,
                marginTop: 2,
              }}
            >
              {description}
            </div>
          </div>
        </div>
      </button>
    )
  }

  return (
    <div style={{ color: "white", fontFamily: "sans-serif" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>
        💥 Stress
      </h2>

      <div
        style={{
          fontSize: 11,
          opacity: 0.55,
          marginBottom: 16,
          lineHeight: 1.4,
        }}
      >
        These are testing tools — they introduce a problem but don't
        fix it. The Director observes and proposes; you decide.
      </div>

      {scenarioButton(
        "FAMINE",
        "🍎",
        "Famine",
        "Reduce available food to zero",
        () => trigger("FAMINE", "CREATE_FOOD_CRISIS")
      )}

      {scenarioButton(
        "DROUGHT",
        "💧",
        "Drought",
        "Reduce available water to zero",
        () => trigger("DROUGHT", "CREATE_WATER_CRISIS")
      )}

      {scenarioButton(
        "HOUSING",
        "🏠",
        "Housing Strain",
        "Clear housing, increasing population pressure",
        () => trigger("HOUSING", "CREATE_HOUSING_CRISIS")
      )}

      {scenarioButton(
        "POPULATION",
        "👥",
        "Population Surge",
        "Add agents quickly to stress-test resources",
        () => trigger("POPULATION", "CREATE_POPULATION_CRISIS")
      )}

      {scenarioButton(
        "EVALUATE",
        "⚡",
        "Force Evaluation",
        "Ask the Director to inspect the world right now",
        () => {
          setActive("EVALUATE")
          setMessage("Director evaluation requested.")
          forceDirectorEvaluation()
        }
      )}

      <div
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          fontSize: 12,
          lineHeight: 1.5,
          opacity: 0.7,
        }}
      >
        {message}
      </div>
    </div>
  )
}
