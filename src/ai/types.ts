import type { WorldState } from "../types/world"

export type WorldObservation = {
  time: number
  population: number
  food: number
  water: number

  entityCount: number
  agentCount: number
  houseCount: number
  treeCount: number
  foodEntityCount: number
  hungryAgentCount: number
  exhaustedAgentCount: number
  wanderingAgentCount: number

  entities: WorldState["entities"]
}