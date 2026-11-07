import os
import concurrent.futures
from typing import Literal, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="WorldWeave AI Director")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================
# CONFIG
# =============================================================

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
# openai/gpt-oss-120b is Groq's current recommended production text model
# as of this writing — llama-3.3-70b-versatile (the previous default) was
# deprecated by Groq on 2026-08-16. Override via GROQ_MODEL if that
# changes again; check console.groq.com/docs/models for the current list.
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
LLM_TIMEOUT_SECONDS = 4.0

# Population-scaled upper bounds. These exist purely so a malformed
# or hallucinated LLM response can never send an extreme value to
# Java — Java itself also clamps using the same population-scaled
# capacity formulas plus absolute safety ceilings, so these are a
# second line of defense, not
# the actual ceiling. They scale with population so a larger
# settlement's legitimately larger request is never rejected here
# only to be technically satisfiable at the Java layer.
def _amount_bounds(action: str, population: int) -> tuple[int, int]:
    population = max(1, population)

    # Same population*N formulas Java's getFoodCapacity()/getWaterCapacity()
    # use, plus the same absolute safety ceilings Java enforces — kept
    # numerically identical across Java/Python/TypeScript by convention,
    # not by shared code (different languages), so this comment is the
    # one place that intent is written down for anyone touching either side.
    if action == "SPAWN_FOOD":
        return (1, min(10_000, max(100, population * 25)))
    if action == "SPAWN_WATER":
        return (1, min(200_000, max(1000, population * 200)))
    if action == "BUILD_HOUSE":
        return (1, min(200, max(20, population)))

    return (0, 0)  # OBSERVE


def _bounded_amount(action: str, amount: int, population: int) -> int:
    low, high = _amount_bounds(action, population)
    return max(low, min(high, amount))

_client = None
if GROQ_API_KEY:
    try:
        from groq import Groq
        import instructor
        # GPT-OSS can emit a `commentary` channel that Groq's tool-call
        # path may treat as an undeclared tool. JSON_SCHEMA uses Groq's
        # supported response_format path instead; Instructor still
        # validates against LLMProposal and retries invalid responses.
        _client = instructor.from_groq(
            Groq(api_key=GROQ_API_KEY, timeout=5.0, max_retries=0),
            mode=instructor.Mode.JSON_SCHEMA,
        )
    except Exception as import_error:
        print(
            "WARNING: groq/instructor not available or failed to initialize — "
            "Director will run in FALLBACK-only mode ("
            f"{type(import_error).__name__})."
        )
        _client = None
else:
    print(
        "WARNING: GROQ_API_KEY not set — Director will run in "
        "FALLBACK-only mode (deterministic rules)."
    )

# =============================================================
# MODELS
# =============================================================

class WorldEntity(BaseModel):
    id: str
    type: str
    position: list[float] | None = None
    hunger: float | None = None
    energy: float | None = None
    goal: str | None = None

class WorldSnapshot(BaseModel):
    time: int
    population: int
    food: int
    water: int
    entities: list[WorldEntity] = Field(default_factory=list)

class DirectorDecision(BaseModel):
    action: Literal[
        "SPAWN_FOOD",
        "SPAWN_WATER",
        "BUILD_HOUSE",
        "OBSERVE"
    ]
    amount: int
    reason: str
    source: Literal["LLM", "FALLBACK"]
    classification: Literal[
        "AUTONOMOUS",
        "REQUIRES_APPROVAL",
        "UNCERTAIN",
    ]

# Flat schema for what the LLM itself returns, validated by instructor
# before Python ever sees it. Separate from DirectorDecision because
# the LLM doesn't know about `source`, and `amount` here is pre-clamp
# (population-aware clamping still happens in Python afterward — this
# schema only guarantees *shape*, not that the number is sane for the
# current settlement size).
class LLMProposal(BaseModel):
    situation: str = Field(..., max_length=60)
    severity: Literal["LOW", "MEDIUM", "HIGH"]
    reasoning: str = Field(..., max_length=400)
    recommendedAction: Literal[
        "SPAWN_FOOD",
        "SPAWN_WATER",
        "BUILD_HOUSE",
        "OBSERVE"
    ]
    amount: int = Field(..., ge=0)

# =============================================================
# SHARED THRESHOLD ASSESSMENT
# =============================================================
# Single source of truth for what counts as a food/water/housing
# crisis. Both think() and the crisis-lock gate below use this, so
# there is exactly one place these thresholds are ever defined.

def _assess(world: WorldSnapshot) -> dict:
    population = max(1, world.population)

    houses = sum(
        1
        for entity in world.entities
        if entity.type == "house"
    )

    food_objects = sum(
        1 for entity in world.entities
        if entity.type == "food"
    )

    hungry_agents = sum(
        1 for entity in world.entities
        if entity.type == "agent"
        and (entity.hunger or 0) >= 60
    )

    food_crisis = (
        world.food <= 0
        or (food_objects == 0 and hungry_agents > 0)
    )

    required_houses = (population + 1) // 2
    water_target = population * 50

    return {
        "population": population,
        "houses": houses,
        "food_objects": food_objects,
        "required_houses": required_houses,
        "water_target": water_target,
        "food_crisis": food_crisis,
        "water_crisis": world.water < water_target,
        "housing_crisis": houses < required_houses,
    }

# =============================================================
# DETERMINISTIC POLICY (fallback + validation ground truth)
# =============================================================
# This is the exact logic that existed before the LLM layer was
# added, now expressed in terms of _assess() instead of recomputing
# the same thresholds inline. It is never removed — it is the safety
# net the LLM's recommendation is checked against, and what runs
# whenever the LLM is unavailable, slow, misconfigured, or returns
# something that doesn't validate.

def think(world: WorldSnapshot) -> DirectorDecision:
    a = _assess(world)
    population = a["population"]
    food = world.food
    water = world.water
    houses = a["houses"]
    food_objects = a["food_objects"]

    if a["food_crisis"]:
        amount = _bounded_amount(
            "SPAWN_FOOD", max(10, population * 10), population
        )

        food_source_note = (
            "there are no physical food sources remaining"
            if food_objects == 0
            else f"only {food_objects} physical food source(s) remain"
        )

        return DirectorDecision(
            action="SPAWN_FOOD",
            amount=amount,
            reason=(
                f"Food availability is critical. "
                f"The population is {population}, "
                f"the food reserve is {food}, "
                f"and {food_source_note}. "
                f"Restoring food availability."
            ),
            source="FALLBACK",
            classification="AUTONOMOUS",
        )

    if a["water_crisis"]:
        amount = _bounded_amount(
            "SPAWN_WATER", max(100, population * 100), population
        )
        return DirectorDecision(
            action="SPAWN_WATER",
            amount=amount,
            reason=(
                f"Water availability is below the required "
                f"reserve for population {population}. "
                f"Current water: {water}. "
                f"Restoring the water reserve."
            ),
            source="FALLBACK",
            classification="AUTONOMOUS",
        )

    if a["housing_crisis"]:
        amount = _bounded_amount(
            "BUILD_HOUSE",
            a["required_houses"] - houses,
            population,
        )
        return DirectorDecision(
            action="BUILD_HOUSE",
            amount=amount,
            reason=(
                f"Housing capacity is insufficient. "
                f"Population: {population}, "
                f"houses: {houses}. "
                f"Building {amount} additional house(s)."
            ),
            source="FALLBACK",
            classification="REQUIRES_APPROVAL",
        )

    return DirectorDecision(
        action="OBSERVE",
        amount=0,
        reason=(
            "The world currently has sufficient "
            "food availability, water, and housing. "
            "Continue monitoring."
        ),
        source="FALLBACK",
        classification="AUTONOMOUS",
    )

# =============================================================
# LLM REASONING LAYER
# =============================================================

def _build_prompt(world: WorldSnapshot) -> str:
    houses = sum(1 for e in world.entities if e.type == "house")
    food_objects = sum(1 for e in world.entities if e.type == "food")
    population = max(1, world.population)
    food_capacity = min(10_000, max(100, population * 25))
    water_capacity = min(200_000, max(1000, population * 200))
    food_amount_limit = min(10_000, max(100, population * 25))
    water_amount_limit = min(200_000, max(1000, population * 200))
    house_amount_limit = min(200, max(20, population))

    agents = [e for e in world.entities if e.type == "agent"]
    hungry = sum(1 for a in agents if (a.hunger or 0) >= 60)
    exhausted = sum(1 for a in agents if (a.energy or 100) <= 30)

    return f"""You are the AI Director of a small simulated settlement called WorldWeave.
You observe the world and recommend ONE action to keep the settlement alive and stable.

Current world state:
- time: {world.time}
- population: {world.population}
- food reserve: {world.food} / {food_capacity}
- water reserve: {world.water} / {water_capacity}
- physical food sources visible: {food_objects}
- houses: {houses}
- hungry agents (hunger >= 60): {hungry}
- exhausted agents (energy <= 30): {exhausted}

You may recommend EXACTLY ONE of these actions, nothing else:
- SPAWN_FOOD (amount = how much to add to the food reserve, 1-{food_amount_limit})
- SPAWN_WATER (amount = how much to add to the water reserve, 1-{water_amount_limit})
- BUILD_HOUSE (amount = how many houses to build, 1-{house_amount_limit})
- OBSERVE (amount must be 0 — use this when the world is stable)

Respond with ONLY a JSON object in exactly this shape, no other text:
{{
  "situation": "<short uppercase snake_case label>",
  "severity": "LOW" | "MEDIUM" | "HIGH",
  "reasoning": "<1-3 sentences explaining what you observed and why this action helps>",
  "recommendedAction": "SPAWN_FOOD" | "SPAWN_WATER" | "BUILD_HOUSE" | "OBSERVE",
  "amount": <integer>
}}"""


def _call_llm_raw(world: WorldSnapshot) -> Optional[LLMProposal]:
    if _client is None:
        return None

    # max_retries=1: if Groq's response doesn't validate against
    # LLMProposal, instructor automatically retries once (with the
    # validation error fed back to the model) before giving up — this
    # is the "one automatic retry" requirement, handled natively by
    # the library rather than hand-rolled.
    return _client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "user", "content": _build_prompt(world)}
        ],
        response_model=LLMProposal,
        max_retries=1,
        temperature=0.4,
        max_completion_tokens=2048,
        reasoning_effort="low",
    )


def _call_llm_with_timeout(world: WorldSnapshot) -> Optional[LLMProposal]:
    """Runs the LLM call (including instructor's own internal retry)
    with a hard wall-clock timeout, independent of whether the
    underlying SDK supports one itself."""
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    future = pool.submit(_call_llm_raw, world)
    try:
        result = future.result(timeout=LLM_TIMEOUT_SECONDS)
    except concurrent.futures.TimeoutError:
        future.cancel()
        # Do not block the API response while the request is timing out.
        # The Groq client also has a finite network timeout so the worker
        # will exit shortly even when the running call cannot be cancelled.
        pool.shutdown(wait=False, cancel_futures=True)
        print("WARNING: LLM call timed out — using deterministic rules.")
        return None
    except Exception as error:
        pool.shutdown(wait=False, cancel_futures=True)
        # Covers instructor exhausting its retry and any API-level error.
        # Log only the exception type; provider exceptions can contain
        # request details, so avoid echoing them into application logs.
        print(
            "WARNING: LLM call failed — using deterministic rules ("
            f"{type(error).__name__})."
        )
        return None
    else:
        pool.shutdown(wait=False, cancel_futures=True)
        return result


def _classification_for(
    action: str, assessment: dict
) -> Literal["AUTONOMOUS", "REQUIRES_APPROVAL", "UNCERTAIN"]:
    if action == "OBSERVE":
        return "AUTONOMOUS"
    if action == "SPAWN_FOOD" and assessment["food_crisis"]:
        return "AUTONOMOUS"
    if action == "SPAWN_WATER" and assessment["water_crisis"]:
        return "AUTONOMOUS"
    if action == "BUILD_HOUSE" and assessment["housing_crisis"]:
        return "REQUIRES_APPROVAL"
    return "UNCERTAIN"


def _finalize_llm_decision(
    proposal: LLMProposal, world: WorldSnapshot
) -> DirectorDecision:
    """instructor/Pydantic already guarantee `proposal` matches
    LLMProposal's shape and types. The one thing left to enforce here
    is population-aware amount clamping — Pydantic's Field(ge=0) only
    guarantees non-negative, not "sane for this settlement size"."""

    assessment = _assess(world)
    amount = _bounded_amount(
        proposal.recommendedAction,
        proposal.amount,
        assessment["population"],
    )

    return DirectorDecision(
        action=proposal.recommendedAction,
        amount=amount,
        reason=proposal.reasoning.strip() or f"AI Director recommends {proposal.recommendedAction}.",
        source="LLM",
        classification=_classification_for(
            proposal.recommendedAction, assessment
        ),
    )


# =============================================================
# CRISIS LOCK — one LLM call per NEW crisis, not per cycle
# =============================================================
# Tracks whether each crisis type is already "being handled" so an
# unresolved crisis doesn't spend a fresh LLM call every 2-second
# Director cycle. In-memory / per-process is fine here: this is a
# single-instance dev server for a hackathon demo, and state resets
# cleanly on restart, which is the correct behavior anyway.

_active_crisis_lock = {
    "food": False,
    "water": False,
    "housing": False,
}

_CRISIS_KEY_BY_ACTION = {
    "SPAWN_FOOD": "food",
    "SPAWN_WATER": "water",
    "BUILD_HOUSE": "housing",
}


def decide_with_llm_or_fallback(world: WorldSnapshot) -> DirectorDecision:
    assessment = _assess(world)

    # Unlock any crisis type whose condition has genuinely cleared.
    # This checks each type's own raw condition independently — not
    # just whichever single action think() happens to report this
    # cycle — since think() only ever surfaces its highest-priority
    # action and would otherwise mask an already-resolved crisis of
    # a lower-priority type.
    if not assessment["food_crisis"]:
        _active_crisis_lock["food"] = False
    if not assessment["water_crisis"]:
        _active_crisis_lock["water"] = False
    if not assessment["housing_crisis"]:
        _active_crisis_lock["housing"] = False

    # Cheap, no-network baseline using the exact same thresholds the
    # deterministic policy already relies on — this is not a second
    # copy of the logic, it IS think(), so there's no way for the
    # "should we bother calling LLM" check to drift out of sync
    # with what the fallback actually decides.
    baseline = think(world)

    if baseline.action == "OBSERVE":
        # World is stable by the deterministic policy's own thresholds.
        # Skip the LLM call entirely — this endpoint is still hit
        # every Director cycle for observation/verification, so nothing
        # about the loop's cadence changes, only the LLM spend.
        print("INFO: World stable — skipping LLM call this cycle.")
        return baseline

    crisis_key = _CRISIS_KEY_BY_ACTION[baseline.action]

    if _active_crisis_lock[crisis_key]:
        # Same unresolved crisis as a previous cycle — already
        # attempted (via LLM or fallback). Keep observing/verifying
        # through the deterministic baseline without spending another
        # LLM call on a crisis that's already being handled.
        print(f"INFO: {crisis_key.upper()} crisis already handled — skipping LLM call.")
        return baseline

    # NEW crisis of this type. Lock immediately, before even attempting
    # LLM — if the call below fails, this crisis still counts as
    # "attempted" (fallback executes instead) and must not retry every
    # cycle just because LLM itself failed.
    _active_crisis_lock[crisis_key] = True

    proposal = _call_llm_with_timeout(world)

    if proposal is not None:
        llm_decision = _finalize_llm_decision(proposal, world)
        if llm_decision.action == baseline.action:
            # The deterministic policy owns the action and bounded amount.
            # LLM reasoning may explain that action, but cannot redirect or
            # enlarge an intervention.
            return DirectorDecision(
                action=baseline.action,
                amount=baseline.amount,
                reason=llm_decision.reason,
                source="LLM",
                classification=baseline.classification,
            )

        # Do not let an LLM recommendation suppress or replace the
        # deterministic policy's active crisis response.
        return baseline

    return baseline

# =============================================================
# ROUTES
# =============================================================

@app.get("/")
def root():
    return {
        "service": "WorldWeave AI Director",
        "status": "online",
        "llmEnabled": _client is not None,
    }

@app.post("/director/decide", response_model=DirectorDecision)
def decide(world: WorldSnapshot):
    decision = decide_with_llm_or_fallback(world)
    print(
        f"AI DIRECTOR [{decision.source}/{decision.classification}]:",
        decision.action,
        "| amount:",
        decision.amount,
        "|",
        decision.reason,
    )
    return decision

