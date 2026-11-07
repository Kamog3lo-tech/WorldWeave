import { create } from "zustand"
import type { WorldState } from "../types/world"
import type { JavaWorldState } from "../api/worldApi"

export type WorldTheme = "desert" | "city" | "forest" | "standard"

type WorldStore = WorldState & {
  // Java-authoritative dynamic capacity, added locally to the store's
  // type rather than the shared WorldState type — these are ambient
  // world properties read directly where needed (e.g. DirectorPanel),
  // not part of a Director observation snapshot.
  foodCapacity: number
  waterCapacity: number
  paused: boolean

  // Purely visual, like trees — Java has no concept of a "theme" and
  // never sends one, so this is never touched by syncJavaWorld.
  theme: WorldTheme

  // Occupation/money per agent id — kept as a separate keyed map
  // rather than added to each entity, for the same reason foodCapacity
  // and waterCapacity are separate fields: the external entities type
  // isn't something this store defines.
  agentDetails: Record<string, { occupation: string; money: number }>

  // Real events generated in Java, newest first. Never fabricated here.
  events: string[]

  advanceTime: (amount: number) => void
  addEntity: (entity: WorldState["entities"][number]) => void
  addFood: (amount: number) => void
  addWater: (amount: number) => void
  setTheme: (theme: WorldTheme) => void
  syncJavaWorld: (javaWorld: JavaWorldState) => void
  resetWorld: () => void
}

export const useWorldStore = create<WorldStore>((set) => ({
  time: 0,
  population: 0,
  food: 100,
  water: 1000,
  foodCapacity: 100,
  waterCapacity: 1000,
  paused: false,
  theme: "standard",
  agentDetails: {},
  events: [],
  entities: [],

  // Java is the simulation authority.
  // This function is intentionally a no-op.
  // Smooth visual movement is handled by Agent.tsx
  // using Three.js frame interpolation.
  advanceTime: () => {
    // Simulation is controlled by Java.
  },

  addEntity: (entity) =>
    set((state) => ({
      entities: [...state.entities, entity],
      population:
        entity.type === "agent"
          ? state.population + 1
          : state.population,
    })),

  addFood: (amount) =>
    set((state) => ({
      food: Math.min(
        100,
        state.food + Math.max(0, amount)
      ),
    })),

  addWater: (amount) =>
    set((state) => ({
      water: Math.min(
        1000,
        state.water + Math.max(0, amount)
      ),
    })),

  setTheme: (theme) => set({ theme }),

  // Java is the single source of truth for agents, houses, and food.
  // Trees are purely decorative and have no equivalent in Java's
  // World model, so they must be preserved rather than dropped here.
  syncJavaWorld: (javaWorld) =>
    set((state) => {
      const trees: WorldState["entities"] =
        state.entities.filter(
          (entity) => entity.type === "tree"
        )

      const agents: WorldState["entities"] =
        javaWorld.agents.map((agent) => ({
          id: agent.id,
          type: "agent",
          position: [agent.x, 0.5, agent.z],
          energy: agent.energy,
          hunger: agent.hunger,
          thirst: agent.thirst,
          goal:
            agent.goal === "FIND_FOOD" ||
            agent.goal === "FIND_WATER" ||
            agent.goal === "REST" ||
            agent.goal === "WORK" ||
            agent.goal === "WANDER"
              ? agent.goal
              : "WANDER",
        }))

      const agentDetails: Record<
        string,
        { occupation: string; money: number }
      > = {}

      for (const agent of javaWorld.agents) {
        agentDetails[agent.id] = {
          occupation: agent.occupation,
          money: agent.money,
        }
      }

      const houses: WorldState["entities"] =
        javaWorld.houses.map((house) => ({
          id: house.id,
          type: "house",
          position: [house.x, 1, house.z],
        }))

      const foods: WorldState["entities"] =
        javaWorld.foods.map((food) => ({
          id: food.id,
          type: "food",
          position: [food.x, 0.5, food.z],
        }))

      return {
        time: javaWorld.time,
        population: javaWorld.population,
        food: javaWorld.food,
        water: javaWorld.water,
        foodCapacity: javaWorld.foodCapacity,
        waterCapacity: javaWorld.waterCapacity,
        paused: javaWorld.paused,
        agentDetails,
        events: javaWorld.events,
        entities: [
          ...agents,
          ...houses,
          ...foods,
          ...trees,
        ],
      }
    }),

  resetWorld: () =>
    set({
      time: 0,
      population: 0,
      food: 100,
      water: 1000,
      foodCapacity: 100,
      waterCapacity: 1000,
      paused: false,
      theme: "standard",
      agentDetails: {},
      events: [],
      entities: [],
    }),
}))
