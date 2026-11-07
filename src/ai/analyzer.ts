import type { WorldObservation } from "./types"

export type WorldSituation = {
  type:
    | "LOW_FOOD"
    | "LOW_WATER"
    | "NO_HOUSING"
    | "HUNGRY_AGENTS"
    | "EXHAUSTED_AGENTS"
    | "STABLE"

  severity: "LOW" | "MEDIUM" | "HIGH"
  description: string
}

export function analyzeWorld(
  observation: WorldObservation
): WorldSituation[] {

  const situations: WorldSituation[] = []

  const population =
    Math.max(
      1,
      observation.population
    )

  const entities =
    Array.isArray(observation.entities)
      ? observation.entities
      : []

  // =====================================================
  // FOOD
  // =====================================================
  // Food decisions are based on actual food availability:
  // 1. Food reserve
  // 2. Physical food objects in the world
  //
  // Hunger does NOT independently trigger LOW_FOOD.

  const foodReserve =
    Math.max(
      0,
      observation.food
    )

  const physicalFood =
    Math.max(
      0,
      observation.foodEntityCount
    )

  const totalFoodAvailability =
    foodReserve + physicalFood

  if (
    foodReserve <= 0 &&
    physicalFood <= 0
  ) {

    situations.push({
      type: "LOW_FOOD",

      severity: "HIGH",

      description:
        "No food is currently available in the world. " +
        "Food reserve and physical food are both depleted.",
    })

  } else if (
    foodReserve < population &&
    physicalFood < population
  ) {

    situations.push({
      type: "LOW_FOOD",

      severity: "MEDIUM",

      description:
        `Food availability is low. ` +
        `Reserve: ${foodReserve}. ` +
        `Visible food: ${physicalFood}. ` +
        `Population: ${population}.`,
    })
  }

  // =====================================================
  // HUNGRY AGENTS
  // =====================================================
  // This is informational.
  // Hunger does not determine whether food should be spawned.

  const hungryAgents =
    entities.filter(
      entity =>
        entity.type === "agent" &&
        (entity.hunger ?? 0) >= 70
    ).length

  if (
    hungryAgents > 0
  ) {

    situations.push({
      type: "HUNGRY_AGENTS",

      severity:
        hungryAgents >= 2
          ? "HIGH"
          : "MEDIUM",

      description:
        `${hungryAgents} agent` +
        `${hungryAgents > 1 ? "s are" : " is"}` +
        ` hungry. ` +
        `Available food: ${totalFoodAvailability}.`,
    })
  }

  // =====================================================
  // WATER
  // =====================================================

  const waterTarget =
    population * 2

  const waterDeficit =
    Math.max(
      0,
      waterTarget - observation.water
    )

  if (
    waterDeficit > 0
  ) {

    situations.push({
      type: "LOW_WATER",

      severity:
        observation.water <= population
          ? "HIGH"
          : "MEDIUM",

      description:
        `Water is ${observation.water}/${waterTarget}. ` +
        `Population is ${population}. ` +
        `Water deficit: ${waterDeficit}.`,
    })
  }

  // =====================================================
  // HOUSING
  // =====================================================

  const houseDeficit =
    Math.max(
      0,
      population -
        observation.houseCount
    )

  if (
    houseDeficit > 0
  ) {

    situations.push({
      type: "NO_HOUSING",

      severity:
        houseDeficit >= 2
          ? "HIGH"
          : "MEDIUM",

      description:
        `Housing is ` +
        `${observation.houseCount}/${population}. ` +
        `Need ${houseDeficit} more house` +
        `${houseDeficit === 1 ? "" : "s"}.`,
    })
  }

  // =====================================================
  // EXHAUSTED AGENTS
  // =====================================================

  const exhaustedAgents =
    entities.filter(
      entity =>
        entity.type === "agent" &&
        (entity.energy ?? 100) <= 30
    ).length

  if (
    exhaustedAgents > 0
  ) {

    situations.push({
      type: "EXHAUSTED_AGENTS",

      severity:
        exhaustedAgents >= 2
          ? "HIGH"
          : "MEDIUM",

      description:
        `${exhaustedAgents} agent` +
        `${exhaustedAgents > 1 ? "s are" : " is"}` +
        ` exhausted.`,
    })
  }

  // =====================================================
  // STABLE
  // =====================================================

  if (
    situations.length === 0
  ) {

    situations.push({
      type: "STABLE",

      severity: "LOW",

      description:
        "The world is stable and resources are sufficient for the current population.",
    })
  }

  return situations
}