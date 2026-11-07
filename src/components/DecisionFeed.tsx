import { useEffect, useState } from "react"
import {
  getDirectorHistory,
} from "../ai/directorState"
import type { DirectorResult } from "../ai/directorState"
import { useWorldStore } from "../store/worldStore"

type FeedItem = {
  time: number
  icon: string
  text: string
  // Used only for key stability and to keep Director items visually
  // distinct from raw simulation events in the strip.
  source: "director" | "world"
}

function directorFeedItem(result: DirectorResult): FeedItem {
  const dismissed = result.actionResult === "Dismissed — no action taken."
  const notExecuted =
    result.actionResult === "Not executed — recommendation was no longer needed."
  const after = result.observationAfter ?? result.observation

  const icon = dismissed
    ? "🚫"
    : result.decision.action === "SPAWN_FOOD"
      ? "🍎"
      : result.decision.action === "SPAWN_WATER"
        ? "💧"
        : result.decision.action === "BUILD_HOUSE"
          ? "🏠"
          : "👁️"

  const actionSummary =
    result.decision.action === "SPAWN_FOOD"
      ? "Food reserve +" +
        Math.max(0, after.food - result.observation.food) +
        "; ground food " +
        result.observation.foodEntityCount +
        "→" +
        after.foodEntityCount +
        "."
      : result.decision.action === "SPAWN_WATER"
        ? "Water reserve +" +
          Math.max(0, after.water - result.observation.water) +
          "."
        : result.decision.action === "BUILD_HOUSE"
          ? "Houses " +
            result.observation.houseCount +
            "→" +
            after.houseCount +
            "."
          : "World observed — stable."

  const text = dismissed
    ? "Recommendation dismissed by user."
    : notExecuted
      ? "Recommendation was no longer needed; Java was not changed."
    : result.verification?.success === false
      ? "Director could not verify this cycle."
    : result.decision.action === "OBSERVE"
      ? actionSummary
      : result.decision.classification === "AUTONOMOUS"
        ? "Autonomous intervention: " + actionSummary
        : "Approved intervention: " + actionSummary

  return {
    time: result.observation.time,
    icon,
    text,
    source: "director",
  }
}

// Java events are formatted as "<time>s: <message>" (see World.java's
// logEvent). Parsed here purely for display — the message itself is
// never altered or invented.
function worldFeedItem(raw: string): FeedItem {
  const match = raw.match(/^(\d+)s: (.*)$/)
  const time = match ? parseInt(match[1], 10) : 0
  const text = match ? match[2] : raw

  const icon =
    text.includes("crisis")
      ? "⚠️"
      : text.includes("critical level")
        ? "🔴"
        : text.includes("produced food")
          ? "🌾"
          : text.includes("drank water")
            ? "💧"
            : text.includes("ate food")
              ? "🍖"
              : text.includes("restored")
                ? "✅"
                : text.includes("built")
                  ? "🏠"
                  : text.includes("surge")
                    ? "👥"
                    : "•"

  return { time, icon, text, source: "world" }
}

export function DecisionFeed() {
  const [directorHistory, setDirectorHistory] =
    useState<DirectorResult[]>(getDirectorHistory())

  const worldEvents = useWorldStore((state) => state.events)

  useEffect(() => {
    const interval = setInterval(() => {
      setDirectorHistory(getDirectorHistory())
    }, 250)

    return () => clearInterval(interval)
  }, [])

  // Merge both real sources into one time-sorted stream. Director
  // decisions and raw simulation events are genuinely different kinds
  // of thing, so this is a deliberate merge, not one source pretending
  // to be the other.
  const merged: FeedItem[] = [
    ...directorHistory.map(directorFeedItem),
    ...worldEvents.map(worldFeedItem),
  ]
    .sort((a, b) => b.time - a.time)
    .slice(0, 40)

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 16px",
        overflowX: "auto",
        color: "white",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          fontSize: 9,
          letterSpacing: 1.5,
          opacity: 0.4,
          fontWeight: 700,
        }}
      >
        LIVE EVENTS
      </div>

      {merged.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.4 }}>
          No activity yet — build a world to see agents live.
        </div>
      ) : (
        merged.map((item, index) => (
          <div
            key={`${item.source}-${item.time}-${index}`}
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderRadius: 8,
              background:
                item.source === "director"
                  ? "rgba(80,160,255,0.12)"
                  : "rgba(255,255,255,0.04)",
              border:
                item.source === "director"
                  ? "1px solid rgba(80,160,255,0.25)"
                  : "1px solid transparent",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: 15 }}>{item.icon}</span>

            <span style={{ fontSize: 12 }}>{item.text}</span>

            <span style={{ fontSize: 9, opacity: 0.4 }}>
              T+{item.time.toFixed(0)}
            </span>
          </div>
        ))
      )}
    </div>
  )
}
