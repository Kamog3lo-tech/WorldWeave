import type { WorldObservation } from "./types"

export type DirectorDecision = {
  action: "SPAWN_FOOD" | "SPAWN_WATER" | "BUILD_HOUSE" | "OBSERVE"
  amount: number
  reason: string
  classification: "AUTONOMOUS" | "REQUIRES_APPROVAL" | "UNCERTAIN"

  // Which layer produced this decision:
  // - "LLM"       Groq reasoning, validated by Python
  // - "FALLBACK"  Python's deterministic think(), used when Groq fails
  // - "EMERGENCY" this file's makeDecision(), used only when the Python
  //               Director service itself is unreachable (Layer 3)
  source: "LLM" | "FALLBACK" | "EMERGENCY"
}

type InterventionAction = Exclude<DirectorDecision["action"], "OBSERVE">

function boundedAmount(
  action: InterventionAction,
  requested: number,
  population: number
): number {
  const count = Math.max(1, Math.floor(population))
  const limit =
    action === "SPAWN_FOOD"
      ? Math.min(10_000, Math.max(100, count * 25))
      : action === "SPAWN_WATER"
        ? Math.min(200_000, Math.max(1000, count * 200))
        : Math.min(200, Math.max(20, count))

  return Math.max(1, Math.min(limit, Math.floor(requested)))
}

// =============================================================
// LAYER 3 — EMERGENCY FALLBACK
// =============================================================
// Used only when the Python Director cannot be reached at all
// (not when Gemini fails inside it — that's handled server-side).
// Called from director.ts's catch block around askPythonDirector().

export function makeDecision(
  observation: WorldObservation,
  blockedActions: Set<DirectorDecision["action"]>
): DirectorDecision {

  const food =
    observation.food ?? 0

  const physicalFood =
    observation.foodEntityCount ?? 0

  const water =
    observation.water ?? 0

  const population =
    observation.population ??
    observation.agentCount ??
    1

  const houses =
    observation.houseCount ?? 0

  // =====================================================
  // 1. FOOD
  // =====================================================
  // Match Python's policy: depleted reserves or no physical food for
  // hungry agents both count as an active food crisis.

  if (
    (food <= 0 ||
      (physicalFood <= 0 && observation.hungryAgentCount > 0)) &&
    !blockedActions.has("SPAWN_FOOD")
  ) {

    const amount = boundedAmount(
      "SPAWN_FOOD",
      Math.max(10, population * 10),
      population
    )

    return {
      action: "SPAWN_FOOD",
      amount,
      reason:
        `Food availability is critical. ` +
        `The population is ${population}, ` +
        `the food reserve is ${food}, ` +
        `and ${physicalFood} physical food source(s) remain. ` +
        `Restoring food availability.`,
      source: "EMERGENCY",
      classification: "AUTONOMOUS",
    }
  }

  // =====================================================
  // 2. WATER
  // =====================================================
  // Aligned with Python's think(): same population*50 threshold
  // (already matched), amount now scales with population instead
  // of a flat value.

  const minimumWater =
    population * 50

  if (
    water < minimumWater &&
    !blockedActions.has("SPAWN_WATER")
  ) {

    const amount = boundedAmount(
      "SPAWN_WATER",
      Math.max(100, population * 100),
      population
    )

    return {
      action: "SPAWN_WATER",
      amount,
      reason:
        `Water shortage detected. ` +
        `Population: ${population}, ` +
        `Water: ${water}. ` +
        `Spawning water.`,
      source: "EMERGENCY",
      classification: "AUTONOMOUS",
    }
  }

  // =====================================================
  // 3. HOUSING
  // =====================================================
  // Aligned with Python's think(): same required-houses formula
  // (already matched), amount is now the exact deficit instead of
  // always building one house at a time.

  const requiredHouses =
    Math.ceil(population / 2)

  if (
    houses < requiredHouses &&
    !blockedActions.has("BUILD_HOUSE")
  ) {

    const amount = boundedAmount(
      "BUILD_HOUSE",
      requiredHouses - houses,
      population
    )

    return {
      action: "BUILD_HOUSE",
      amount,
      reason:
        `Housing deficit detected. ` +
        `Population: ${population}, ` +
        `Houses: ${houses}. ` +
        `Building ${amount} additional house(s).`,
      source: "EMERGENCY",
      classification: "REQUIRES_APPROVAL",
    }
  }

  // =====================================================
  // 4. OBSERVE
  // =====================================================

  return {
    action: "OBSERVE",
    amount: 0,
    reason:
      "World parameters are within acceptable limits. Continuing monitoring.",
    source: "EMERGENCY",
    classification: "AUTONOMOUS",
  }
}
