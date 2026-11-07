// =============================================================
// WORLD PROMPT PARSER
// =============================================================
// Deterministic, local, zero-latency, zero-API-cost parsing of
// world-building prompts like "create a desert with 6 agents and
// 0 water". This is a lightweight regex/keyword intent layer, not
// an NLP system — it never calls an LLM. Gemini/Groq stays reserved
// for AI Director reasoning during the living simulation, which is
// the part where an LLM actually adds value.
//
// The one rule everything else here serves: an explicit user value
// (including an explicit 0) must NEVER be overridden by a theme
// default. That's why extraction below uses `undefined` as "not
// mentioned" — 0 !== undefined, so an explicit zero always survives
// the merge.

export type WorldTheme = "desert" | "city" | "forest" | "standard"

export interface WorldConfig {
  theme: WorldTheme
  houses: number
  agents: number
  trees: number
  food: number
  water: number
}

export type WorldConfigField = keyof Omit<WorldConfig, "theme">

export interface ParsedWorldPrompt {
  config: WorldConfig
  // Which numeric fields the user explicitly specified, as opposed
  // to inheriting the theme default. Drives the "USER SPECIFIED" tag
  // in the preview UI.
  userSpecified: Record<WorldConfigField, boolean>
  interpretation: string
}

// =============================================================
// THEME DETECTION
// =============================================================

const THEME_PATTERNS: { theme: WorldTheme; pattern: RegExp }[] = [
  { theme: "desert", pattern: /\b(desert|wasteland|arid)\b/i },
  { theme: "city", pattern: /\b(city|town|metropolis)\b/i },
  { theme: "forest", pattern: /\b(forest|jungle|woods)\b/i },
]

/**
 * Returns the explicitly detected theme, or null if no theme keyword
 * was found in the prompt at all. This null-vs-"standard" distinction
 * matters: callers use it to decide whether a prompt is a world-
 * creation request in the first place, before falling back to
 * treating it as a possible crisis-control phrase instead.
 */
export function detectTheme(prompt: string): WorldTheme | null {
  for (const { theme, pattern } of THEME_PATTERNS) {
    if (pattern.test(prompt)) {
      return theme
    }
  }
  return null
}

// =============================================================
// THEME PRESETS
// =============================================================

const THEME_PRESETS: Record<WorldTheme, Omit<WorldConfig, "theme">> = {
  desert: { houses: 1, agents: 2, trees: 1, food: 5, water: 20 },
  city: { houses: 12, agents: 10, trees: 3, food: 40, water: 200 },
  forest: { houses: 2, agents: 3, trees: 35, food: 35, water: 150 },
  standard: { houses: 4, agents: 4, trees: 10, food: 20, water: 100 },
}

// =============================================================
// QUANTITY EXTRACTION
// =============================================================
// Each field supports an explicit-number form ("6 agents") and,
// where the spec's examples call for it, a "no X" form ("no water"
// -> 0). Extraction returns undefined when the field isn't mentioned
// at all, so it can be distinguished from an explicit 0.

const FIELD_SYNONYMS: Record<WorldConfigField, string> = {
  agents: "agents?|people|citizens?|villagers?|bots?",
  food: "food|rations?|apples?",
  houses: "houses?|homes?|shelters?|buildings?",
  trees: "trees?|forest",
  water: "water|wells?|lakes?",
}

function extractQuantity(
  prompt: string,
  field: WorldConfigField
): number | undefined {
  const synonyms = FIELD_SYNONYMS[field]

  const numberPattern = new RegExp(
    `(\\d+)\\s*(?:${synonyms})`,
    "i"
  )
  const numberMatch = prompt.match(numberPattern)
  if (numberMatch) {
    const value = parseInt(numberMatch[1], 10)
    // Reject invalid negative quantities safely — \d+ can't actually
    // capture a minus sign, but guard anyway in case of future changes.
    return Number.isFinite(value) && value >= 0 ? value : undefined
  }

  const noPattern = new RegExp(
    `\\bno\\s+(?:${synonyms})\\b`,
    "i"
  )
  if (noPattern.test(prompt)) {
    return 0
  }

  return undefined
}

// =============================================================
// MAIN PARSER
// =============================================================

export function parseWorldPrompt(prompt: string): ParsedWorldPrompt {
  const theme = detectTheme(prompt) ?? "standard"
  const preset = THEME_PRESETS[theme]

  const fields: WorldConfigField[] = [
    "houses",
    "agents",
    "trees",
    "food",
    "water",
  ]

  const explicit: Partial<Record<WorldConfigField, number>> = {}
  const userSpecified = {
    houses: false,
    agents: false,
    trees: false,
    food: false,
    water: false,
  } as Record<WorldConfigField, boolean>

  for (const field of fields) {
    const value = extractQuantity(prompt, field)
    if (value !== undefined) {
      explicit[field] = value
      userSpecified[field] = true
    }
  }

  const config: WorldConfig = {
    theme,
    houses: explicit.houses ?? preset.houses,
    agents: explicit.agents ?? preset.agents,
    trees: explicit.trees ?? preset.trees,
    food: explicit.food ?? preset.food,
    water: explicit.water ?? preset.water,
  }

  return {
    config,
    userSpecified,
    interpretation: buildInterpretation(theme, config, userSpecified),
  }
}

// =============================================================
// INTERPRETATION SENTENCE
// =============================================================

const THEME_LABEL: Record<WorldTheme, string> = {
  desert: "Desert",
  city: "City",
  forest: "Forest",
  standard: "Standard",
}

function buildInterpretation(
  theme: WorldTheme,
  config: WorldConfig,
  userSpecified: Record<WorldConfigField, boolean>
): string {
  const parts: string[] = []

  if (userSpecified.agents) {
    parts.push(
      `${config.agents} agent${config.agents === 1 ? "" : "s"}`
    )
  }

  if (userSpecified.food) {
    parts.push(config.food === 0 ? "no starting food" : `${config.food} food`)
  }

  if (userSpecified.water) {
    parts.push(
      config.water === 0 ? "no starting water" : `${config.water} water`
    )
  }

  if (userSpecified.houses) {
    parts.push(
      `${config.houses} house${config.houses === 1 ? "" : "s"}`
    )
  }

  if (userSpecified.trees) {
    parts.push(`${config.trees} trees`)
  }

  const base = `${THEME_LABEL[theme]} environment`

  if (parts.length === 0) {
    return `${base}.`
  }

  return `${base} with ${parts.join(", ")}.`
}
