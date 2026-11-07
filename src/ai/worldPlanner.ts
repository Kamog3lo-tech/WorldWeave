
export type WorldPlan = {
  houses: number
  agents: number
  trees: number
  food: number
  water: number
}

const DEFAULT_PLAN: WorldPlan = {
  houses: 2,
  agents: 3,
  trees: 10,
  food: 5,
  water: 20,
}

export function planWorld(prompt: string): WorldPlan {
  const text = prompt.toLowerCase()

  const plan: WorldPlan = {
    ...DEFAULT_PLAN,
  }

  // Explicit numbers
  const houses = text.match(/(\d+)\s*(house|houses)/)
  const agents = text.match(/(\d+)\s*(agent|agents|people|villagers)/)
  const trees = text.match(/(\d+)\s*(tree|trees)/)
  const food = text.match(/(\d+)\s*(food|foods|apple|apples)/)
  const water = text.match(/(\d+)\s*(water|water units)/)

  if (houses) {
    plan.houses = Number(houses[1])
  }

  if (agents) {
    plan.agents = Number(agents[1])
  }

  if (trees) {
    plan.trees = Number(trees[1])
  }

  if (food) {
    plan.food = Number(food[1])
  }

  if (water) {
    plan.water = Number(water[1])
  }

  // Intent-based world types
  if (
    text.includes("village") ||
    text.includes("settlement")
  ) {
    plan.houses = Math.max(plan.houses, 6)
    plan.agents = Math.max(plan.agents, 8)
    plan.trees = Math.max(plan.trees, 20)
    plan.food = Math.max(plan.food, 15)
  }

  if (
    text.includes("forest") ||
    text.includes("woodland")
  ) {
    plan.trees = Math.max(plan.trees, 40)
  }

  if (
    text.includes("farm") ||
    text.includes("farming")
  ) {
    plan.houses = Math.max(plan.houses, 4)
    plan.agents = Math.max(plan.agents, 6)
    plan.trees = Math.max(plan.trees, 10)
    plan.food = Math.max(plan.food, 30)
  }

  if (
    text.includes("city") ||
    text.includes("town")
  ) {
    plan.houses = Math.max(plan.houses, 12)
    plan.agents = Math.max(plan.agents, 20)
    plan.trees = Math.max(plan.trees, 25)
    plan.food = Math.max(plan.food, 30)
  }

  if (
    text.includes("empty") ||
    text.includes("wilderness")
  ) {
    plan.houses = 0
    plan.agents = 0
    plan.food = 0
    plan.trees = 30
  }

  return plan
}