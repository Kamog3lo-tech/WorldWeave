import { useState } from "react"
import type { ReactNode } from "react"
import type { CSSProperties } from "react"

import {
  useDirectorStore,
  type DirectorResult,
} from "../ai/directorState"
import {
  forceDirectorEvaluation,
  executeApprovedProposal,
  dismissPendingProposal,
} from "../ai/directorLoop"
import { useWorldStore } from "../store/worldStore"
import type { DirectorDecision } from "../ai/decision"

function crisisLabelFor(action: DirectorDecision["action"]): string {
  return action === "SPAWN_FOOD"
    ? "FOOD CRISIS"
    : action === "SPAWN_WATER"
      ? "WATER CRISIS"
      : action === "BUILD_HOUSE"
        ? "HOUSING CRISIS"
        : "SITUATION DETECTED"
}

function classificationLabel(
  classification: DirectorDecision["classification"]
): string {
  return classification === "AUTONOMOUS"
    ? "AUTONOMOUS"
    : classification === "REQUIRES_APPROVAL"
      ? "APPROVAL REQUIRED"
      : "UNCERTAIN · REVIEW REQUIRED"
}

function actionMetaFor(action: DirectorDecision["action"]) {
  return action === "SPAWN_FOOD"
    ? { icon: "🍎", label: "Increase food supply" }
    : action === "SPAWN_WATER"
      ? { icon: "💧", label: "Increase water supply" }
      : action === "BUILD_HOUSE"
        ? { icon: "🏠", label: "Build housing" }
        : { icon: "👁️", label: "Observe" }
}

function shorten(text: string): string {
  const trimmed = text.trim()
  const cut = trimmed.indexOf(". ")
  const firstSentence = cut === -1 ? trimmed : trimmed.slice(0, cut + 1)
  return firstSentence.length > 140
    ? firstSentence.slice(0, 137).trimEnd() + "…"
    : firstSentence
}

function actualAmountFor(result: DirectorResult): number {
  if (result.actionResult === "Dismissed — no action taken.") {
    return result.decision.amount
  }

  const after = result.observationAfter
  if (!after) return result.decision.amount

  switch (result.decision.action) {
    case "SPAWN_FOOD":
      return Math.max(0, after.food - result.observation.food)
    case "SPAWN_WATER":
      return Math.max(0, after.water - result.observation.water)
    case "BUILD_HOUSE":
      return Math.max(0, after.houseCount - result.observation.houseCount)
    case "OBSERVE":
    default:
      return 0
  }
}

export function DirectorPanel() {

  const [showDetails, setShowDetails] = useState(false)

  const result =
    useDirectorStore((state) => state.latestDirectorResult)

  const pendingProposal =
    useDirectorStore((state) => state.pendingProposal)

  const foodCapacity =
    useWorldStore((state) => state.foodCapacity)

  const waterCapacity =
    useWorldStore((state) => state.waterCapacity)

  const directorStatus =
    result?.verification?.success === false
      ? "ATTENTION"
      : pendingProposal
        ? "REVIEW REQUIRED"
        : result
          ? "ACTIVE"
          : "OBSERVING"

  const isStable =
    result?.decision.action === "OBSERVE" &&
    result.verification?.success !== false

  const isActing = !isStable

  const situation =
    result?.situations.find(
      (situation) => {
        if (result.decision.action === "SPAWN_FOOD") {
          return (
            situation.type === "LOW_FOOD" ||
            situation.type === "HUNGRY_AGENTS"
          )
        }
        if (result.decision.action === "SPAWN_WATER") {
          return situation.type === "LOW_WATER"
        }
        if (result.decision.action === "BUILD_HOUSE") {
          return situation.type === "NO_HOUSING"
        }
        return false
      }
    ) ?? result?.situations[0]

  const bannerState:
    | "CRISIS"
    | "RECOVERED"
    | "STABLE" =
    situation?.severity === "HIGH" && isActing
      ? result?.verification?.success
        ? "RECOVERED"
        : "CRISIS"
      : "STABLE"

  const hasMoreDetail =
    !!result &&
    result.decision.reason.trim().length >
      shorten(result.decision.reason).length
  const completedActionAmount =
    result ? actualAmountFor(result) : 0

  return (
    <div style={{ color: "white", fontFamily: "Inter, Arial, sans-serif" }}>

      <h2 style={{ margin: "0 0 2px", fontSize: 16 }}>
        🧠 Director
      </h2>

      <div style={{ fontSize: 10, opacity: 0.45, marginBottom: 12 }}>
        Observe → Classify → Stabilize or request approval → Verify
      </div>

      {/* ONLINE */}

      <div style={liveBarStyle}>
        <span
          style={{
            ...dotStyle,
            ...(directorStatus === "ATTENTION"
              ? {
                  background: "#ff6b6b",
                  boxShadow: "0 0 8px rgba(255,107,107,0.8)",
                }
              : {}),
          }}
        />
        {directorStatus}
        <span style={{ marginLeft: "auto", opacity: 0.4 }}>LIVE</span>
      </div>

      {/* FORCE EVALUATION */}

      <button
        onClick={() => forceDirectorEvaluation()}
        style={{
          marginTop: 8,
          width: "100%",
          padding: "7px 10px",
          borderRadius: 7,
          border: "1px solid rgba(255,255,255,0.15)",
          background: "rgba(255,255,255,0.06)",
          color: "white",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.5,
          cursor: "pointer",
        }}
      >
        ⚡ Force Evaluation
      </button>

      {/* ================================================= */}
      {/* PENDING PROPOSAL — human-in-the-loop gate           */}
      {/* ================================================= */}

      {pendingProposal ? (
        <>
          <div
            style={{
              marginTop: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 7,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.5,
              background:
                pendingProposal.decision.source === "LLM"
                  ? "rgba(140,100,255,0.18)"
                  : pendingProposal.decision.source === "EMERGENCY"
                    ? "rgba(255,90,60,0.18)"
                    : "rgba(255,255,255,0.08)",
              border:
                pendingProposal.decision.source === "LLM"
                  ? "1px solid rgba(160,120,255,0.4)"
                  : pendingProposal.decision.source === "EMERGENCY"
                    ? "1px solid rgba(255,110,80,0.5)"
                    : "1px solid rgba(255,255,255,0.15)",
            }}
          >
            {pendingProposal.decision.source === "LLM"
              ? "🧠 AI Reasoning"
              : pendingProposal.decision.source === "EMERGENCY"
                ? "🚨 Emergency Policy"
                : "🛡 Standard Policy"}
            {" · "}
            {classificationLabel(pendingProposal.decision.classification)}
          </div>

          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
              textAlign: "center",
              animation: "worldweave-pulse 1.4s ease-in-out infinite",
              background: "rgba(220,60,60,0.22)",
              border: "1px solid rgba(255,90,90,0.5)",
              color: "#ff8080",
            }}
          >
            {pendingProposal.decision.classification === "UNCERTAIN"
              ? "❔ UNCERTAIN DECISION — REVIEW REQUIRED"
              : "⚠ " +
                crisisLabelFor(pendingProposal.decision.action) +
                " — AWAITING YOUR DECISION"}

            <style>
              {`@keyframes worldweave-pulse {
                  0%, 100% { opacity: 1; }
                  50% { opacity: 0.55; }
                }`}
            </style>
          </div>

          <Section title="OBSERVATION">
            <div style={cardStyle}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {pendingProposal.decision.action === "SPAWN_FOOD" && (
                  <>
                    <MetricPill
                      label="Food Reserve"
                      value={`${pendingProposal.observationBefore.food} / ${foodCapacity}`}
                    />
                    <MetricPill
                      label="Hungry"
                      value={pendingProposal.observationBefore.hungryAgentCount}
                    />
                  </>
                )}
                {pendingProposal.decision.action === "SPAWN_WATER" && (
                  <MetricPill
                    label="Water Reserve"
                    value={`${pendingProposal.observationBefore.water} / ${waterCapacity}`}
                  />
                )}
                {pendingProposal.decision.action === "BUILD_HOUSE" && (
                  <>
                    <MetricPill
                      label="Population"
                      value={pendingProposal.observationBefore.population}
                    />
                    <MetricPill
                      label="Houses"
                      value={pendingProposal.observationBefore.houseCount}
                    />
                  </>
                )}
              </div>
            </div>
          </Section>

          <Section title="WHY">
            <div style={cardStyle}>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
                {shorten(pendingProposal.decision.reason)}
              </div>

              {pendingProposal.decision.reason.trim().length >
                shorten(pendingProposal.decision.reason).length && (
                <button
                  onClick={() => setShowDetails((v) => !v)}
                  style={detailsButtonStyle}
                >
                  {showDetails ? "Hide details" : "Details"}
                </button>
              )}

              {showDetails && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    opacity: 0.65,
                    lineHeight: 1.4,
                  }}
                >
                  {pendingProposal.decision.reason}
                </div>
              )}
            </div>
          </Section>

          <Section title="RECOMMENDATION">
            <div
              style={{
                ...cardStyle,
                background: "rgba(80,120,255,0.15)",
                border: "1px solid rgba(100,140,255,0.35)",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {actionMetaFor(pendingProposal.decision.action).icon}{" "}
                {actionMetaFor(pendingProposal.decision.action).label}
                {pendingProposal.decision.amount > 0 &&
                  ` (+${pendingProposal.decision.amount})`}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                onClick={() => executeApprovedProposal()}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 8,
                  border: "1px solid rgba(80,220,140,0.5)",
                  background: "rgba(60,200,120,0.25)",
                  color: "#9cf5bd",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                ✓ Approve
              </button>

              <button
                onClick={() => dismissPendingProposal()}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.05)",
                  color: "white",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Do Nothing
              </button>
            </div>
          </Section>
        </>
      ) : !result ? (

        <div
          style={{
            marginTop: 16,
            padding: 14,
            background: "rgba(255,255,255,0.05)",
            borderRadius: 10,
            fontSize: 12,
          }}
        >
          Monitoring world...
        </div>

      ) : isStable ? (

        /* ================================================= */
        /* STABLE — concise, no repeated long reasoning       */
        /* ================================================= */

        <div style={{ marginTop: 16, ...cardStyle }}>

          <div style={{ fontSize: 14, fontWeight: 700, color: "#7cf0ae" }}>
            ✓ WORLD STABLE
          </div>

          <div style={{ ...gridStyle, marginTop: 10 }}>
            <Stat
              label="Food Reserve"
              value={`${result.observation.food} / ${foodCapacity}`}
            />
            <Stat
              label="Water Reserve"
              value={`${result.observation.water} / ${waterCapacity}`}
            />
            <Stat label="Population" value={result.observation.population} />
            <Stat label="Houses" value={result.observation.houseCount} />
          </div>

          <div
            style={{
              marginTop: 10,
              fontSize: 9,
              letterSpacing: 1.5,
              opacity: 0.4,
              fontWeight: 600,
            }}
          >
            AGENTS
          </div>

          <div
            style={{
              marginTop: 4,
              display: "flex",
              gap: 14,
              fontSize: 11,
              opacity: 0.75,
            }}
          >
            <span>Hungry: {result.observation.hungryAgentCount}</span>
            <span>Exhausted: {result.observation.exhaustedAgentCount}</span>
          </div>

          <div style={{ marginTop: 10, fontSize: 11, opacity: 0.5 }}>
            No action required.
          </div>

        </div>

      ) : (

        /* ================================================= */
        /* COMPLETED — a past approved/dismissed decision     */
        /* ================================================= */

        <>
          <div
            style={{
              marginTop: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 7,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.5,
              background:
                result.decision.source === "LLM"
                  ? "rgba(140,100,255,0.18)"
                  : result.decision.source === "EMERGENCY"
                    ? "rgba(255,90,60,0.18)"
                    : "rgba(255,255,255,0.08)",
              border:
                result.decision.source === "LLM"
                  ? "1px solid rgba(160,120,255,0.4)"
                  : result.decision.source === "EMERGENCY"
                    ? "1px solid rgba(255,110,80,0.5)"
                    : "1px solid rgba(255,255,255,0.15)",
            }}
          >
            {result.decision.source === "LLM"
              ? "🧠 AI Reasoning"
              : result.decision.source === "EMERGENCY"
                ? "🚨 Emergency Policy"
                : "🛡 Standard Policy"}
          </div>

          {bannerState !== "STABLE" && (
            <div
              style={{
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 700,
                textAlign: "center",
                background:
                  bannerState === "RECOVERED"
                    ? "rgba(60,200,120,0.2)"
                    : "rgba(220,60,60,0.22)",
                border:
                  bannerState === "RECOVERED"
                    ? "1px solid rgba(80,220,140,0.5)"
                    : "1px solid rgba(255,90,90,0.5)",
                color: bannerState === "RECOVERED" ? "#7cf0ae" : "#ff8080",
              }}
            >
              {bannerState === "RECOVERED"
                ? "✓ RECOVERY VERIFIED"
                : `⚠ ${crisisLabelFor(result.decision.action)}`}
            </div>
          )}

          <Section title="WHY">
            <div style={cardStyle}>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
                {shorten(result.decision.reason)}
              </div>

              {hasMoreDetail && (
                <button
                  onClick={() => setShowDetails((v) => !v)}
                  style={detailsButtonStyle}
                >
                  {showDetails ? "Hide details" : "Details"}
                </button>
              )}

              {showDetails && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    opacity: 0.65,
                    lineHeight: 1.4,
                  }}
                >
                  {result.decision.reason}
                </div>
              )}
            </div>
          </Section>

          <Section title="ACTION">
            <div style={{ marginBottom: 6, fontSize: 10, opacity: 0.55 }}>
              {classificationLabel(result.decision.classification)}
            </div>
            <div
              style={{
                ...cardStyle,
                background: "rgba(80,120,255,0.15)",
                border: "1px solid rgba(100,140,255,0.35)",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {actionMetaFor(result.decision.action).icon}{" "}
                {actionMetaFor(result.decision.action).label}
                {completedActionAmount > 0 &&
                  ` (+${completedActionAmount})`}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  opacity: 0.6,
                }}
              >
                {result.actionResult === "Dismissed — no action taken."
                  ? "You dismissed this recommendation."
                  : result.actionResult === "Not executed — recommendation was no longer needed."
                    ? "The crisis resolved before approval; Java was not changed."
                  : result.verification?.success === false
                    ? "No change was verified. Automatic retries are paused for this crisis."
                    : result.decision.classification === "AUTONOMOUS"
                      ? "Automatically stabilized through Java."
                      : "Approved and executed through Java."}
              </div>
            </div>
          </Section>

          {result.actionResult !== "Dismissed — no action taken." && (
            <Section title="RESULT">
              <div style={cardStyle}>

                {result.decision.action === "SPAWN_FOOD" && (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      Food Reserve: {result.observation.food} →{" "}
                      {result.observationAfter?.food ?? "?"} / {foodCapacity}
                    </div>
                    <div style={{ marginTop: 5, fontSize: 11, opacity: 0.65 }}>
                      Ground Food: {result.observation.foodEntityCount} →{" "}
                      {result.observationAfter?.foodEntityCount ?? "?"}
                    </div>
                    <div style={{ marginTop: 5, fontSize: 11, opacity: 0.65 }}>
                      Hungry: {result.observation.hungryAgentCount} →{" "}
                      {result.observationAfter?.hungryAgentCount ?? "?"}
                    </div>
                  </>
                )}

                {result.decision.action === "SPAWN_WATER" && (
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    Water Reserve: {result.observation.water} →{" "}
                    {result.observationAfter?.water ?? "?"} / {waterCapacity}
                  </div>
                )}

                {result.decision.action === "BUILD_HOUSE" && (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      Houses: {result.observation.houseCount} →{" "}
                      {result.observationAfter?.houseCount ?? "?"}
                    </div>
                    <div style={{ marginTop: 5, fontSize: 11, opacity: 0.65 }}>
                      Population: {result.observation.population}
                    </div>
                  </>
                )}

              </div>
            </Section>
          )}

          {result.verification && (
            <Section title="VERIFICATION">
              <div
                style={{
                  ...cardStyle,
                  background: result.verification.success
                    ? "rgba(60,200,120,0.1)"
                    : "rgba(255,255,255,0.05)",
                  border: result.verification.success
                    ? "1px solid rgba(80,220,140,0.3)"
                    : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                  {result.verification.success ? "✓ " : "⚠ "}
                  {result.verification.message}
                </div>
              </div>
            </Section>
          )}
        </>
      )}

      {result && !pendingProposal && (
        <div
          style={{
            marginTop: 16,
            fontSize: 10,
            opacity: 0.35,
            textAlign: "right",
          }}
        >
          T+{result.observation.time.toFixed(0)}
        </div>
      )}

    </div>
  )
}

/* ========================================================= */
/* SECTION */
/* ========================================================= */

function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          fontSize: 9,
          letterSpacing: 1.5,
          opacity: 0.4,
          marginBottom: 6,
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

/* ========================================================= */
/* STAT */
/* ========================================================= */

function Stat({
  label,
  value,
}: {
  label: string
  value: number | string
}) {
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 9, opacity: 0.45, marginTop: 2 }}>{label}</div>
    </div>
  )
}

/* ========================================================= */
/* METRIC PILL */
/* ========================================================= */

function MetricPill({
  label,
  value,
}: {
  label: string
  value: number | string
}) {
  return (
    <span
      style={{
        padding: "4px 8px",
        borderRadius: 6,
        fontSize: 11,
        background: "rgba(255,255,255,0.06)",
      }}
    >
      {label}: {value}
    </span>
  )
}

/* ========================================================= */
/* STYLES */
/* ========================================================= */

const liveBarStyle: CSSProperties = {
  marginTop: 4,
  padding: "7px 10px",
  borderRadius: 8,
  background: "rgba(40,180,100,0.08)",
  border: "1px solid rgba(40,180,100,0.15)",
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontSize: 10,
}

const dotStyle: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "#45d483",
  boxShadow: "0 0 8px rgba(69,212,131,0.8)",
}

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 7,
}

const cardStyle: CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
}

const detailsButtonStyle: CSSProperties = {
  marginTop: 8,
  padding: "4px 0",
  border: "none",
  background: "transparent",
  color: "#8fb8ff",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.3,
  cursor: "pointer",
  textDecoration: "underline",
}
