

export type WorldEntity = {
  id: string
  type: "house" | "tree" | "agent" | "food"
  position: [number, number, number]
  energy?: number
  hunger?: number
  thirst?: number
  goal?:
  | "WANDER"
  | "FIND_FOOD"
  | "FIND_WATER"
  | "REST"
  | "WORK"
  homeId?: string
}

export type WorldState = {
  time: number
  entities: WorldEntity[]
  population: number
  food: number
  water: number
}