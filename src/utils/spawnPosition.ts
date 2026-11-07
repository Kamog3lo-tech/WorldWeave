import type { WorldEntity } from "../types/world"

type EntityType = WorldEntity["type"]

const WORLD_SIZE = 40
const HALF_WORLD = WORLD_SIZE / 2

const CLEARANCE: Record<EntityType, number> = {
  house: 2.2,
  agent: 0.8,
  food: 0.7,
  tree: 0.4,
}

function distance(
  x1: number,
  z1: number,
  x2: number,
  z2: number
) {
  const dx = x1 - x2
  const dz = z1 - z2

  return Math.sqrt(dx * dx + dz * dz)
}

export function getSpawnPosition(
  type: EntityType,
  entities: WorldEntity[]
): [number, number, number] {
  for (let attempt = 0; attempt < 100; attempt++) {
    let x = 0
    let z = 0

    if (type === "house") {
      // Houses stay near the village centre.
      x = Math.random() * 16 - 8
      z = Math.random() * 16 - 8
    }

    if (type === "agent") {
      // Agents stay close to the village.
      x = Math.random() * 18 - 9
      z = Math.random() * 18 - 9
    }

    if (type === "food") {
      // Food appears around the settlement.
      x = Math.random() * 20 - 10
      z = Math.random() * 20 - 10
    }

    if (type === "tree") {
      // Trees prefer the outer areas.
      const side = Math.floor(Math.random() * 4)

      if (side === 0) {
        x = Math.random() * WORLD_SIZE - HALF_WORLD
        z = Math.random() * 6 - 20
      } else if (side === 1) {
        x = Math.random() * WORLD_SIZE - HALF_WORLD
        z = Math.random() * 6 + 14
      } else if (side === 2) {
        x = Math.random() * 6 - 20
        z = Math.random() * WORLD_SIZE - HALF_WORLD
      } else {
        x = Math.random() * 6 + 14
        z = Math.random() * WORLD_SIZE - HALF_WORLD
      }
    }

    // Keep everything inside the world.
    x = Math.max(-18, Math.min(18, x))
    z = Math.max(-18, Math.min(18, z))

    const blocked = entities.some((entity) => {
      // Trees may overlap trees.
      if (
        type === "tree" &&
        entity.type === "tree"
      ) {
        return false
      }

      const requiredDistance =
        CLEARANCE[type] +
        CLEARANCE[entity.type]

      return (
        distance(
          x,
          z,
          entity.position[0],
          entity.position[2]
        ) < requiredDistance
      )
    })

    if (!blocked) {
      const y =
        type === "house" || type === "agent"
          ? 1
          : type === "food"
            ? 0.4
            : 0

      return [x, y, z]
    }
  }

  // Safe fallback.
  return [
    0,
    type === "house" || type === "agent"
      ? 1
      : type === "food"
        ? 0.4
        : 0,
    0,
  ]
}