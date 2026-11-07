import { create } from "zustand"

import type { WorldObservation } from "./types"
import type { WorldSituation } from "./analyzer"
import type { DirectorDecision } from "./decision"

export type DirectorResult = {
  observation: WorldObservation
  // The world as observed immediately after the Director's action was
  // executed and synced from Java. Equal to `observation` for OBSERVE
  // cycles where nothing changed.
  observationAfter?: WorldObservation
  situations: WorldSituation[]
  decision: DirectorDecision
  actionResult: string
  verification?: {
    success: boolean
    message: string
  }
}

// A decision the Director has proposed but not yet executed — awaiting
// the user's approval or dismissal. This is the human-in-the-loop
// gate: nothing in this object has touched Java yet.
export type PendingProposal = {
  observationBefore: WorldObservation
  decision: DirectorDecision
  situations: WorldSituation[]
}

type DirectorStore = {
  latestDirectorResult: DirectorResult | null
  directorHistory: DirectorResult[]
  pendingProposal: PendingProposal | null

  setDirectorResult: (result: DirectorResult) => void
  clearDirectorResult: () => void
  setPendingProposal: (proposal: PendingProposal | null) => void
}

export const useDirectorStore = create<DirectorStore>((set) => ({
  latestDirectorResult: null,

  directorHistory: [],

  pendingProposal: null,

  setDirectorResult: (result) =>
    set((state) => ({
      latestDirectorResult: result,

      directorHistory: [
        result,
        ...state.directorHistory,
      ].slice(0, 20),
    })),

  clearDirectorResult: () =>
    set({
      latestDirectorResult: null,
      directorHistory: [],
    }),

  setPendingProposal: (proposal) =>
    set({ pendingProposal: proposal }),
}))

export function setDirectorResult(result: DirectorResult) {
  console.log("📡 DIRECTOR STATE UPDATE:", result)

  useDirectorStore.getState().setDirectorResult(result)
}

export function getDirectorResult() {
  return useDirectorStore.getState().latestDirectorResult
}

export function getDirectorHistory() {
  return useDirectorStore.getState().directorHistory
}

export function setPendingProposal(proposal: PendingProposal | null) {
  useDirectorStore.getState().setPendingProposal(proposal)
}

export function getPendingProposal() {
  return useDirectorStore.getState().pendingProposal
}
