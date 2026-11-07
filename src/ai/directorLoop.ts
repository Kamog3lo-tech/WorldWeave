import {
  decideOnly,
  executeAndVerify,
  dismissedResult,
  isProposalStillValid,
  staleProposalResult,
} from "./director"
import { observeWorld } from "./observer"
import { useWorldStore } from "../store/worldStore"
import type { WorldState } from "../types/world"
import {
  setDirectorResult,
  getPendingProposal,
  setPendingProposal,
  type DirectorResult,
} from "./directorState"

let directorInterval: number | null = null
let directorRunning = false

// Task C race-condition fix: without this, a 2-second Director cycle
// landing WHILE an approved proposal is executing (between
// setPendingProposal(null) and Java's response coming back) would see
// no pending proposal and create a fresh one for the same crisis —
// a duplicate approval prompt for something already being fixed.
let isExecutingProposal = false

const DIRECTOR_TIMEOUT = 9000
const AUTONOMOUS_RETRY_COOLDOWN_MS = 5000
type SurvivalAction = "SPAWN_FOOD" | "SPAWN_WATER"
const autonomousRetryAt = new Map<SurvivalAction, number>()
const autonomousFailureLock = new Set<SurvivalAction>()

function createErrorResult(error: unknown): DirectorResult {
  const state = useWorldStore.getState()
  const observation = observeWorld({
    time: state.time,
    population: state.population,
    food: state.food,
    water: state.water,
    entities: state.entities,
  })

  const message =
    error instanceof Error
      ? error.message
      : "Unknown Director error."

  return {
    observation,

    situations: [
      {
        type: "STABLE",
        severity: "LOW",
        description: `Director error: ${message}`,
      },
    ],

    decision: {
      action: "OBSERVE",
      amount: 0,
      reason: `Director could not complete this cycle: ${message}`,
      source: "FALLBACK",
      classification: "UNCERTAIN",
    },

    actionResult: message,

    verification: {
      success: false,
      message,
    },
  }
}

async function runDirectorTick() {
  if (directorRunning) {
    console.log("⏳ DIRECTOR BUSY")
    return
  }

  directorRunning = true

  try {
    const state = useWorldStore.getState()

    if (state.paused) {
      console.log("DIRECTOR IDLE: simulation is paused.")
      return
    }

    const worldState = {
      time: state.time,
      population: state.population,
      food: state.food,
      water: state.water,
      entities: state.entities ?? [],
    }
    const currentObservation = observeWorld(worldState)
    for (const action of ["SPAWN_FOOD", "SPAWN_WATER"] as const) {
      const probe = {
        action,
        amount: 0,
        reason: "",
        source: "FALLBACK" as const,
        classification: "AUTONOMOUS" as const,
      }
      if (!isProposalStillValid(probe, currentObservation)) {
        autonomousRetryAt.delete(action)
        autonomousFailureLock.delete(action)
      }
    }

    const pendingProposal = getPendingProposal()
    const foodCrisisActive =
      currentObservation.food <= 0 ||
      (currentObservation.foodEntityCount === 0 &&
        currentObservation.hungryAgentCount > 0)
    const waterCrisisActive =
      currentObservation.water < currentObservation.population * 50

    if (
      pendingProposal?.decision.action === "BUILD_HOUSE" &&
      isProposalStillValid(pendingProposal.decision, currentObservation) &&
      !foodCrisisActive &&
      !waterCrisisActive
    ) {
      console.log(
        "HOUSING proposal already pending approval — skipping duplicate evaluation."
      )
      return
    }

    console.log("🧠 DIRECTOR TICK", {
      time: worldState.time,
      population: worldState.population,
      food: worldState.food,
      water: worldState.water,
      entities: worldState.entities.length,
    })

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            "Director timed out while waiting for a backend response."
          )
        )
      }, DIRECTOR_TIMEOUT)
    })

    const outcome = await Promise.race([
      decideOnly(worldState),
      timeoutPromise,
    ])

    const { observationBefore, decision, situations } = outcome

    if (decision.action === "OBSERVE") {
      // Nothing to approve — the world is stable, there's no change
      // to propose. Clear any proposal that's no longer relevant
      // (e.g. the crisis resolved by some other means) and show the
      // stable state directly.
      setPendingProposal(null)

      const result = await executeAndVerify(
        observationBefore,
        decision,
        situations
      )

      console.log("✅ DIRECTOR RESULT (stable)", result)
      setDirectorResult(result)
      return
    }

    // HUMAN-IN-THE-LOOP: a real intervention is being recommended.
    // Do NOT execute automatically — surface it as a proposal and
    // wait for the user to approve or dismiss it (see directorState's
    // pendingProposal and executeApprovedProposal/dismissPendingProposal
    // below).
    if (
      decision.classification === "AUTONOMOUS" &&
      (decision.action === "SPAWN_FOOD" ||
        decision.action === "SPAWN_WATER") &&
      isProposalStillValid(decision, observationBefore)
    ) {
      const action = decision.action

      if (autonomousFailureLock.has(action)) {
        console.warn(
          "Autonomous survival intervention is paused after an ineffective action. Use Force Evaluation to retry."
        )
        return
      }

      const retryAt = autonomousRetryAt.get(action) ?? 0
      if (Date.now() < retryAt || isExecutingProposal) {
        return
      }

      const existing = getPendingProposal()
      if (existing?.decision.action === action) {
        setPendingProposal(null)
      }

      console.log("AUTONOMOUS SURVIVAL INTERVENTION:", {
        action,
        amount: decision.amount,
        reason: decision.reason,
      })

      isExecutingProposal = true
      try {
        const result = await Promise.race([
          executeAndVerify(observationBefore, decision, situations),
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error("Autonomous action timed out."))
            }, DIRECTOR_TIMEOUT)
          }),
        ])

        setDirectorResult(result)
        const stillNeeded = isProposalStillValid(
          decision,
          result.observationAfter ?? observationBefore
        )

        if (!result.verification?.success) {
          autonomousFailureLock.add(action)
        } else if (stillNeeded) {
          autonomousRetryAt.set(
            action,
            Date.now() + AUTONOMOUS_RETRY_COOLDOWN_MS
          )
        } else {
          autonomousRetryAt.delete(action)
          autonomousFailureLock.delete(action)
        }
      } catch (error) {
        autonomousFailureLock.add(action)
        setDirectorResult(createErrorResult(error))
      } finally {
        isExecutingProposal = false
      }

      return
    }

    const existing = getPendingProposal()

    if (existing && existing.decision.action === decision.action) {
      // Same unresolved situation as an already-pending proposal —
      // don't replace it (that would reset what the user is looking
      // at); just leave it as-is for them to act on.
      console.log(
        `⏸️ Proposal for ${decision.action} already pending approval — not replacing.`
      )
      return
    }

    if (isExecutingProposal) {
      // An approved proposal is actively being executed right now —
      // never surface a second proposal while that's in flight.
      console.log(
        `⏸️ A proposal is currently executing — holding off on a new ${decision.action} proposal this cycle.`
      )
      return
    }

    console.log("📋 NEW PROPOSAL AWAITING APPROVAL:", {
      action: decision.action,
      amount: decision.amount,
      source: decision.source,
    })

    setPendingProposal({ observationBefore, decision, situations })

  } catch (error) {
    console.error("❌ DIRECTOR ERROR", error)

    const errorResult = createErrorResult(error)

    setDirectorResult(errorResult)

  } finally {
    directorRunning = false
  }
}

// Called by the Approve button in the UI. Runs the exact same
// execute+verify path a fully-automatic Director would have run —
// the only difference is WHEN it runs (after a human click, not
// automatically).
export async function executeApprovedProposal() {
  const proposal = getPendingProposal()
  if (!proposal) return

  setPendingProposal(null)
  isExecutingProposal = true

  try {
    // Task C: re-validate against CURRENT Java state before executing.
    // The world keeps moving while a proposal awaits approval (NPCs
    // act, production happens), so the condition that justified this
    // proposal may already be resolved by the time the user clicks
    // Approve. Using a fresh observation here, not the original
    // proposal.observationBefore, which could now be stale.
    const liveState = useWorldStore.getState()

    const liveWorld: WorldState = {
      time: liveState.time,
      population: liveState.population,
      food: liveState.food,
      water: liveState.water,
      entities: liveState.entities ?? [],
    }

    const freshObservation = observeWorld(liveWorld)

    if (!isProposalStillValid(proposal.decision, freshObservation)) {
      console.log(
        `ℹ️ Proposal for ${proposal.decision.action} is no longer needed — world already recovered. Skipping execution.`
      )
      setDirectorResult(
        staleProposalResult(proposal.decision, freshObservation)
      )
      return
    }

    // Same timeout protection decideOnly() already has in
    // runDirectorTick() below — without this, a hung Java call here
    // would leave isExecutingProposal stuck true forever, permanently
    // blocking every future proposal (the actual bug this fixes).
    const executeTimeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            "Approved action timed out while waiting for Java."
          )
        )
      }, DIRECTOR_TIMEOUT)
    })

    const result = await Promise.race([
      executeAndVerify(
        freshObservation,
        proposal.decision,
        proposal.situations
      ),
      executeTimeoutPromise,
    ])

    console.log("✅ DIRECTOR RESULT (approved)", result)
    setDirectorResult(result)
  } catch (error) {
    console.error("❌ APPROVED ACTION FAILED", error)
    setDirectorResult(createErrorResult(error))
  } finally {
    isExecutingProposal = false
  }
}

// Called by the Dismiss/"Do nothing" button. No Java call at all —
// this is the explicit human override of an AI recommendation.
export function dismissPendingProposal() {
  const proposal = getPendingProposal()
  if (!proposal) return

  setPendingProposal(null)

  console.log("🚫 PROPOSAL DISMISSED BY USER:", {
    action: proposal.decision.action,
  })

  setDirectorResult(
    dismissedResult(
      proposal.observationBefore,
      proposal.decision,
      proposal.situations
    )
  )
}

export function startDirector() {
  if (directorInterval !== null) {
    console.log("⚠️ DIRECTOR ALREADY RUNNING")
    return
  }

  console.log("🚀 STARTING AI DIRECTOR")

  void runDirectorTick()

  directorInterval = window.setInterval(() => {
    void runDirectorTick()
  }, 2000)
}

export function stopDirector() {
  if (directorInterval !== null) {
    window.clearInterval(directorInterval)
    directorInterval = null
  }

  directorRunning = false

  console.log("🛑 AI DIRECTOR STOPPED")
}

// Manual trigger for "Force Evaluation" in the UI. Reuses the exact
// same runDirectorTick() the 2-second interval calls — same overlap
// guard (directorRunning), same decide pipeline, same Python-side
// crisis lock, and the same human-in-the-loop gate: a forced
// evaluation that finds a problem still produces a proposal to
// approve, not an automatic action.
export function forceDirectorEvaluation() {
  autonomousFailureLock.clear()
  autonomousRetryAt.clear()
  void runDirectorTick()
}
