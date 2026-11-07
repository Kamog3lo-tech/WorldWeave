import { useWorldStore } from "../store/worldStore"
import {
  executeWorldCommand,
} from "../api/worldApi"
import type { DirectorDecision } from "./decision"

export async function executeDecision(
  decision: DirectorDecision
) {
  // OBSERVE does not need a Java command
  if (decision.action === "OBSERVE") {
    return {
      success: true,
      result: "No action required.",
      updatedWorld: useWorldStore.getState(),
    }
  }

  try {
    console.log("⚙️ EXECUTING DIRECTOR ACTION:", {
      action: decision.action,
      amount: decision.amount,
    })

    // Send the command through the ONE authoritative Java endpoint.
    const commandResult = await executeWorldCommand(
      decision.action,
      decision.amount
    )

    console.log("🇯🇵 JAVA COMMAND RESULT:", commandResult)

    // Java returns:
    //
    // {
    //   result: "...",
    //   updatedWorld: {...}
    // }
    //
    // We must sync ONLY updatedWorld.
    const javaWorld = commandResult.updatedWorld

    if (!javaWorld) {
      throw new Error(
        "Java command succeeded but returned no updatedWorld."
      )
    }

    // Java is authoritative.
    useWorldStore
      .getState()
      .syncJavaWorld(javaWorld)

    const freshState = useWorldStore.getState()

    console.log("🌍 ZUSTAND AFTER JAVA SYNC:", {
      food: freshState.food,
      water: freshState.water,
      population: freshState.population,
      entities: freshState.entities.length,

      foodEntities: freshState.entities.filter(
        (entity) => entity.type === "food"
      ).length,

      houses: freshState.entities.filter(
        (entity) => entity.type === "house"
      ).length,
    })

    return {
      success: true,
      result: commandResult.result,
      updatedWorld: freshState,
    }
  } catch (error) {
    console.error(
      "❌ DIRECTOR ACTION FAILED:",
      error
    )

    return {
      success: false,
      result:
        error instanceof Error
          ? error.message
          : "Unknown execution error.",
      updatedWorld: useWorldStore.getState(),
    }
  }
}
