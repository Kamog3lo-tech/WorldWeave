import { useWorldStore } from "../store/worldStore"

export function observeWorld() {
  const state = useWorldStore.getState()
  const physicalFoodCount = state.entities.filter(e => e.type === "food").length
  const houseCount = state.entities.filter(e => e.type === "house").length

  return {
    time: state.time,
    population: state.population,
    food: state.food,
    water: state.water,
    foodEntityCount: physicalFoodCount,
    houseCount,

    entities: state.entities.map((entity) => ({
      id: entity.id,
      type: entity.type,
      position: entity.position,
      energy: entity.energy,
      hunger: entity.hunger,
    })),
  }
}
