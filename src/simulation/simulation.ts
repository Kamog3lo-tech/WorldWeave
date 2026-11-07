import { useWorldStore } from "../store/worldStore"

export function runSimulationStep(amount: number) {
  useWorldStore.getState().advanceTime(amount)
}