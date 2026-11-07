import type { WorldState } from "../types/world"

export type PythonDirectorDecision = {
  action:
    | "SPAWN_FOOD"
    | "SPAWN_WATER"
    | "BUILD_HOUSE"
    | "OBSERVE"

  amount: number
  reason: string
  classification:
    | "AUTONOMOUS"
    | "REQUIRES_APPROVAL"
    | "UNCERTAIN"

  // Whether this decision came from the LLM reasoning layer or the
  // deterministic fallback policy. Always present as of the Python
  // Director's LLM upgrade.
  source: "LLM" | "FALLBACK"
}

export async function askPythonDirector(
  world: WorldState
): Promise<PythonDirectorDecision> {

  const response = await fetch(
    "http://127.0.0.1:8000/director/decide",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        time: world.time,
        population: world.population,
        food: world.food,
        water: world.water,

        entities: world.entities.map((entity) => ({
          id: entity.id,
          type: entity.type,
          position: entity.position,
          hunger: entity.hunger,
          energy: entity.energy,
          goal: entity.goal,
        })),
      }),
    }
  )

  if (!response.ok) {
    throw new Error(
      `Python Director returned ${response.status}`
    )
  }

  const decision = (await response.json()) as PythonDirectorDecision
  const population = Math.max(1, Math.floor(world.population))
  const amountLimit =
    decision.action === "SPAWN_FOOD"
      ? Math.min(10_000, Math.max(100, population * 25))
      : decision.action === "SPAWN_WATER"
        ? Math.min(200_000, Math.max(1000, population * 200))
        : decision.action === "BUILD_HOUSE"
          ? Math.min(200, Math.max(20, population))
          : 0

  if (
    !["SPAWN_FOOD", "SPAWN_WATER", "BUILD_HOUSE", "OBSERVE"].includes(
      decision.action
    )
  ) {
    throw new Error("Python Director returned an unknown action.")
  }

  if (
    !Number.isInteger(decision.amount) ||
    decision.amount < 0 ||
    decision.amount > amountLimit ||
    (decision.action === "OBSERVE" && decision.amount !== 0) ||
    (decision.action !== "OBSERVE" && decision.amount < 1)
  ) {
    throw new Error("Python Director returned an invalid action amount.")
  }

  if (
    typeof decision.reason !== "string" ||
    decision.reason.trim().length === 0
  ) {
    throw new Error("Python Director returned no decision reason.")
  }

  if (!["LLM", "FALLBACK"].includes(decision.source)) {
    throw new Error("Python Director returned an invalid decision source.")
  }

  if (
    !["AUTONOMOUS", "REQUIRES_APPROVAL", "UNCERTAIN"].includes(
      decision.classification
    )
  ) {
    throw new Error("Python Director returned an invalid classification.")
  }

  return decision
}
