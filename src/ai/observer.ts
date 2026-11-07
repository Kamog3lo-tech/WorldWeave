import type { WorldState } from "../types/world"
import type { WorldObservation } from "./types"

export function observeWorld(world: WorldState): WorldObservation {
  const entities = Array.isArray(world.entities)
    ? world.entities
    : []

  const agents = entities.filter(
    (entity) => entity.type === "agent"
  )

  const houses = entities.filter(
    (entity) => entity.type === "house"
  )

  const trees = entities.filter(
    (entity) => entity.type === "tree"
  )

  const foods = entities.filter(
    (entity) => entity.type === "food"
  )

  const hungryAgentCount = agents.filter(
    (agent) => (agent.hunger ?? 0) >= 60
  ).length

  const exhaustedAgentCount = agents.filter(
    (agent) => (agent.energy ?? 100) <= 30
  ).length

  const wanderingAgentCount = agents.filter(
    (agent) => (agent.goal ?? "WANDER") === "WANDER"
  ).length

  return {
    time: world.time,
    population: world.population,
    food: world.food,
    water: world.water,

    entityCount: entities.length,
    agentCount: agents.length,
    houseCount: houses.length,
    treeCount: trees.length,
    foodEntityCount: foods.length,

    hungryAgentCount,
    exhaustedAgentCount,
    wanderingAgentCount,

    entities,
  }
}