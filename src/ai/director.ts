import type { WorldState } from "../types/world"
import { observeWorld } from "./observer"
import { executeDecision } from "./executor"
import { askPythonDirector } from "./pythonDirector"
import { makeDecision } from "./decision"
import { useWorldStore } from "../store/worldStore"
import type { WorldObservation } from "./types"
import type { DirectorDecision } from "./decision"
import type { WorldSituation } from "./analyzer"
import type { DirectorResult } from "./directorState"

function verifyAction(
  before: WorldObservation,
  after: WorldObservation,
  decision: DirectorDecision
) {
  switch (decision.action) {
    case "SPAWN_FOOD": {
      const improved =
        after.food > before.food ||
        after.foodEntityCount > before.foodEntityCount

      return {
        success: improved,
        message: improved
          ? `Food recovery verified. Food: ${before.food} → ${after.food}.`
          : `Food recovery not yet visible. Food: ${after.food}.`,
      }
    }

    case "SPAWN_WATER": {
      const improved =
        after.water > before.water

      return {
        success: improved,
        message: improved
          ? `Water recovery verified. Water: ${before.water} → ${after.water}.`
          : `Water recovery not yet visible. Water: ${after.water}.`,
      }
    }

    case "BUILD_HOUSE": {
      const improved =
        after.houseCount > before.houseCount

      return {
        success: improved,
        message: improved
          ? `Housing verified. Houses: ${before.houseCount} → ${after.houseCount}.`
          : `Housing structure not yet visible.`,
      }
    }

    case "OBSERVE":
    default:
      return {
        success: true,
        message: "World stable.",
      }
  }
}

function situationFor(
  decision: DirectorDecision,
  severity: WorldSituation["severity"]
): WorldSituation {
  const type: WorldSituation["type"] =
    decision.action === "SPAWN_FOOD"
      ? "LOW_FOOD"
      : decision.action === "SPAWN_WATER"
        ? "LOW_WATER"
        : decision.action === "BUILD_HOUSE"
          ? "NO_HOUSING"
          : "STABLE"

  return {
    type,
    severity,
    description: decision.reason,
  }
}

export type DirectorDecisionOutcome = {
  observationBefore: WorldObservation
  decision: DirectorDecision
  situations: WorldSituation[]
}

// =============================================================
// DECIDE — observe + decide, no execution
// =============================================================
// This is the human-in-the-loop boundary: everything up to and
// including this function runs automatically every Director cycle.
// Nothing past this point runs without explicit user approval
// (see executeAndVerify below), except the OBSERVE case, which needs
// no approval because nothing changes.

export async function decideOnly(
  world: WorldState
): Promise<DirectorDecisionOutcome> {
  const observationBefore = observeWorld(world)

  console.log("👁️ DIRECTOR OBSERVATION:", {
    time: observationBefore.time,
    population: observationBefore.population,
    food: observationBefore.food,
    water: observationBefore.water,
    houses: observationBefore.houseCount,
    foodEntities: observationBefore.foodEntityCount,
  })

  let decision: DirectorDecision

  try {
    // PRIMARY + Python's own deterministic fallback both live behind
    // this one call — Python only throws here if the request itself
    // failed (network error, non-2xx, bad JSON), meaning the Python
    // Director service is unreachable, not merely that Groq failed.
    decision = await askPythonDirector(world)

    console.log(
      `${decision.source === "LLM" ? "🧠" : "🛡️"} PYTHON DIRECTOR DECISION [${decision.source}]:`,
      {
        action: decision.action,
        amount: decision.amount,
        reason: decision.reason,
      }
    )
  } catch (error) {
    // LAYER 3 — the Python Director service itself is unreachable.
    // Java must still be able to receive a valid, safe decision
    // once/if the user approves it.
    console.error(
      "🚨 PYTHON DIRECTOR UNREACHABLE — using TypeScript emergency fallback (Layer 3):",
      error
    )

    decision = makeDecision(observationBefore, new Set())

    console.log("🚨 EMERGENCY DIRECTOR DECISION:", {
      action: decision.action,
      amount: decision.amount,
      reason: decision.reason,
    })
  }

  // Reclassify from the live observation on the TypeScript side. The
  // server-provided classification is useful for display, but it is
  // never authority to bypass approval.
  decision = {
    ...decision,
    classification: classifyDecision(decision, observationBefore),
  }

  const severity: WorldSituation["severity"] =
    decision.action === "OBSERVE" ? "LOW" : "HIGH"

  return {
    observationBefore,
    decision,
    situations: [situationFor(decision, severity)],
  }
}

// =============================================================
// EXECUTE + VERIFY — runs only after user approval (or for the
// no-op OBSERVE case, which needs no approval since nothing changes)
// =============================================================

export async function executeAndVerify(
  observationBefore: WorldObservation,
  decision: DirectorDecision,
  situations: WorldSituation[]
): Promise<DirectorResult> {
  if (decision.action === "OBSERVE") {
    return {
      observation: observationBefore,
      observationAfter: observationBefore,
      situations,
      decision,
      actionResult: "No action required.",
      verification: {
        success: true,
        message: decision.reason,
      },
    }
  }

  const actionResult = await executeDecision(decision)

  console.log("⚙️ ACTION EXECUTED:", {
    action: decision.action,
    amount: decision.amount,
    result: actionResult,
  })

  // executeDecision already synchronizes Java's
  // authoritative updatedWorld into Zustand.
  const freshState = useWorldStore.getState()

  const updatedWorld: WorldState = {
    time: freshState.time,
    population: freshState.population,
    food: freshState.food,
    water: freshState.water,
    entities: freshState.entities,
  }

  // EXACT STATE AFTER JAVA ACTION
  const observationAfter = observeWorld(updatedWorld)

  console.log("🌍 WORLD AFTER ACTION:", {
    food: observationAfter.food,
    water: observationAfter.water,
    houses: observationAfter.houseCount,
    foodEntities: observationAfter.foodEntityCount,
  })

  const verification = verifyAction(
    observationBefore,
    observationAfter,
    decision
  )

  console.log("🔍 ACTION VERIFICATION:", verification)

  const finalSituation = situationFor(
    decision,
    verification.success ? "MEDIUM" : "HIGH"
  )

  return {
    observation: observationBefore,
    observationAfter,
    situations: [finalSituation],
    decision,
    actionResult:
      typeof actionResult === "string"
        ? actionResult
        : JSON.stringify(actionResult),
    verification,
  }
}

// =============================================================
// DISMISS — user declined the proposal; no Java call at all
// =============================================================

export function dismissedResult(
  observationBefore: WorldObservation,
  decision: DirectorDecision,
  situations: WorldSituation[]
): DirectorResult {
  return {
    observation: observationBefore,
    observationAfter: observationBefore,
    situations,
    decision,
    actionResult: "Dismissed — no action taken.",
    verification: {
      success: true,
      message: "You chose not to act on this recommendation.",
    },
  }
}

// =============================================================
// STALE-PROPOSAL CHECK — Task C: the world keeps moving while a
// proposal awaits approval, so by the time the user clicks Approve,
// the underlying condition may have already resolved on its own
// (a Farmer produced enough food, another action already fixed it,
// etc.). Thresholds here deliberately mirror Python's _assess() and
// decision.ts's makeDecision() exactly, so "still valid" means the
// same thing everywhere in the system.
// =============================================================

export function isProposalStillValid(
  decision: DirectorDecision,
  freshObservation: WorldObservation
): boolean {
  return crisisIsActive(decision.action, freshObservation)
}

function crisisIsActive(
  action: DirectorDecision["action"],
  freshObservation: WorldObservation
): boolean {
  switch (action) {
    case "SPAWN_FOOD":
      return (
        freshObservation.food <= 0 ||
        (
          freshObservation.foodEntityCount === 0 &&
          freshObservation.hungryAgentCount > 0
        )
      )
    case "SPAWN_WATER":
      return freshObservation.water < freshObservation.population * 50
    case "BUILD_HOUSE": {
      const requiredHouses = Math.ceil(freshObservation.population / 2)
      return freshObservation.houseCount < requiredHouses
    }
    case "OBSERVE":
    default:
      return true
  }
}

function classifyDecision(
  decision: DirectorDecision,
  observation: WorldObservation
): DirectorDecision["classification"] {
  if (decision.action === "OBSERVE") {
    return "AUTONOMOUS"
  }

  if (
    (decision.action === "SPAWN_FOOD" ||
      decision.action === "SPAWN_WATER") &&
    crisisIsActive(decision.action, observation)
  ) {
    return "AUTONOMOUS"
  }

  if (
    decision.action === "BUILD_HOUSE" &&
    crisisIsActive(decision.action, observation)
  ) {
    return "REQUIRES_APPROVAL"
  }

  return "UNCERTAIN"
}

export function staleProposalResult(
  decision: DirectorDecision,
  freshObservation: WorldObservation
): DirectorResult {
  const resourceLabel =
    decision.action === "SPAWN_FOOD"
      ? "Food"
      : decision.action === "SPAWN_WATER"
        ? "Water"
        : decision.action === "BUILD_HOUSE"
          ? "Housing"
          : "This situation"

  return {
    observation: freshObservation,
    observationAfter: freshObservation,
    situations: [situationFor(decision, "LOW")],
    decision,
    actionResult: "Not executed — recommendation was no longer needed.",
    verification: {
      success: true,
      message: `${resourceLabel} already recovered before you approved this — no action was taken.`,
    },
  }
}
