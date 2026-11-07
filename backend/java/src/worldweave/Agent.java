package worldweave;

public class Agent {

    private String id;
    private double x;
    private double z;

    private double energy;
    private double hunger;
    private double thirst;

    private String goal;

    // =========================================================
    // OCCUPATION (Phase 2 — lightweight NPC economy)
    // =========================================================
    // Assigned once at creation, deterministically from the agent's
    // own id (same pattern as the desync seeding below). Farmers and
    // Gatherers have a chance to contribute to the shared food
    // reserve while WORKing; all occupations earn a small amount of
    // money while WORKing. This is intentionally simple — no trading,
    // no price system, no inter-agent economy yet.

    private static final String[] OCCUPATIONS = {
        "FARMER", "GATHERER", "BUILDER", "TRADER"
    };

    private final String occupation;
    private double money;

    // =========================================================
    // DESYNCHRONIZATION (Priority 5)
    // =========================================================
    // Each agent gets its own small decay-rate variation and initial
    // state spread, so agents don't all become hungry/thirsty/tired
    // at exactly the same moment. Seeded from the agent's own id, so
    // results are deterministic per agent (same id -> same modifiers
    // every run) rather than different on every simulation launch.

    private final double hungerRate;
    private final double thirstRate;
    private final double energyDecayRate;

    // Wander heading state (Priority 6) — holding a direction for a
    // few ticks instead of re-randomizing every single tick avoids
    // the "vibrating in place" look of an independent random walk.
    private double wanderAngle;
    private int wanderTicksRemaining;

    // WORK session/break state. workUtility alone is a strict
    // deterministic comparison — without a bounded duration, a
    // healthy agent would stay in WORK forever once it started,
    // since nothing in the formula ever makes it dip back below
    // wanderUtility on its own. This is what actually produces
    // alternation, not the utility constant by itself.
    private int workSessionTicksRemaining;
    private int workBreakTicksRemaining;

    public Agent(String id, double x, double z) {
        this.id = id;
        this.x = x;
        this.z = z;

        java.util.Random variation =
            new java.util.Random(id.hashCode());

        // Multipliers centered on 1.0 (range 0.85-1.15) so the
        // settlement's overall pacing/balance is unchanged on
        // average — only individual agents diverge from each other.
        this.hungerRate = 0.85 + variation.nextDouble() * 0.3;
        this.thirstRate = 0.85 + variation.nextDouble() * 0.3;
        this.energyDecayRate = 0.85 + variation.nextDouble() * 0.3;

        // Small initial spread instead of every agent starting in
        // perfect lockstep at energy=100/hunger=0/thirst=0.
        this.energy = 90 + variation.nextDouble() * 10;
        this.hunger = variation.nextDouble() * 10;
        this.thirst = variation.nextDouble() * 10;

        this.wanderAngle = variation.nextDouble() * Math.PI * 2;
        this.wanderTicksRemaining = 0;

        this.workSessionTicksRemaining = 0;
        this.workBreakTicksRemaining = 0;

        this.occupation = OCCUPATIONS[variation.nextInt(OCCUPATIONS.length)];
        this.money = 10 + variation.nextDouble() * 20;

        this.goal = "WANDER";
    }

    public String getId() {
        return id;
    }

    public double getX() {
        return x;
    }

    public double getZ() {
        return z;
    }

    public double getEnergy() {
        return energy;
    }

    public double getHunger() {
        return hunger;
    }

    public double getThirst() {
        return thirst;
    }

    public String getGoal() {
        return goal;
    }

    public String getOccupation() {
        return occupation;
    }

    public double getMoney() {
        return money;
    }

    // ==================== LIFE UPDATE ====================

    public void update(int amount) {

        hunger = Math.min(
            100,
            hunger + amount * 1.2 * hungerRate
        );

        thirst = Math.min(
            100,
            thirst + amount * 1.4 * thirstRate
        );

        energy = Math.max(
            0,
            energy - amount * 1.5 * energyDecayRate
        );

        /*
         * Lightweight utility AI: each candidate action gets a score,
         * the highest wins. This replaces the old fixed if/elif
         * chain, but the scoring is deliberately calibrated so the
         * crossover points land at essentially the same thresholds
         * as before (thirst>=70, hunger>=65, energy<=25) — survival
         * needs still dominate identically to before. WORK is new:
         * it only scores above WANDER when the agent is in decent
         * shape, so idle-but-healthy agents go work instead of just
         * wandering, without ever overriding an urgent need.
         */

        if (workBreakTicksRemaining > 0) {
            workBreakTicksRemaining -= amount;
        }

        double waterUtility = Math.max(0, thirst - 59);
        double foodUtility = Math.max(0, hunger - 54);
        double restUtility = energy <= 25 ? (25 - energy) + 11 : 0;
        // Lowered from 20 — still favored over plain wandering when
        // healthy, but close enough to wanderUtility that the break
        // mechanism below (not the margin itself) is what actually
        // drives alternation.
        double workUtility =
            (energy > 40 && hunger < 50 && thirst < 50 && workBreakTicksRemaining <= 0)
                ? 12
                : 0;
        double wanderUtility = 10;

        String nextGoal = "WANDER";
        double best = wanderUtility;

        if (waterUtility > best) {
            best = waterUtility;
            nextGoal = "FIND_WATER";
        }

        if (foodUtility > best) {
            best = foodUtility;
            nextGoal = "FIND_FOOD";
        }

        if (restUtility > best) {
            best = restUtility;
            nextGoal = "REST";
        }

        if (workUtility > best) {
            best = workUtility;
            nextGoal = "WORK";
        }

        goal = nextGoal;

        // Bounded work sessions: work for roughly 4-6.5 real seconds
        // (8-13 ticks), then force a break of roughly 2-3.5 seconds
        // (4-7 ticks) during which workUtility is suppressed to 0, so
        // WANDER naturally wins and the agent actually moves again.
        // Any other goal (urgent need) resets the session cleanly so
        // the next work period starts fresh rather than resuming a
        // stale countdown.
        if (goal.equals("WORK")) {

            if (workSessionTicksRemaining <= 0) {
                workSessionTicksRemaining = 8 + (int) (Math.random() * 6);
            }

            workSessionTicksRemaining -= amount;

            if (workSessionTicksRemaining <= 0) {
                workBreakTicksRemaining = 4 + (int) (Math.random() * 4);
            }

        } else {
            workSessionTicksRemaining = 0;
        }

        // Normal exploration — holds a heading for a few ticks rather
        // than picking a brand-new random direction every single tick,
        // which is what made movement look twitchy/robotic before.
        if (goal.equals("WANDER")) {

            if (wanderTicksRemaining <= 0) {

                // Modest destination variety: most of the time just
                // nudge the current heading (smooth drift), but
                // occasionally pick a fresh random heading so agents
                // don't settle into visiting the same small area
                // repeatedly over a long session.
                if (Math.random() < 0.25) {
                    wanderAngle = Math.random() * Math.PI * 2;
                } else {
                    wanderAngle +=
                        (Math.random() - 0.5)
                        * Math.PI
                        * 0.6;
                }

                wanderTicksRemaining =
                    2 + (int) (Math.random() * 3);
            }

            wanderTicksRemaining--;

            double speed = amount * 0.85;

            x += Math.cos(wanderAngle) * speed;
            z += Math.sin(wanderAngle) * speed;

            // Keep agents inside the world
            x = Math.max(
                -18,
                Math.min(18, x)
            );

            z = Math.max(
                -18,
                Math.min(18, z)
            );
        }
    }

    // ==================== WORK ====================
    // Agent stays in place while WORKing (no movement block here,
    // unlike WANDER) — a simple, visually-distinct way to read
    // "this agent is occupied" without needing new 3D assets.
 
    public void work(int amount) {
        money += amount * 0.4;
    }
 
    // ==================== WATER ====================

    public boolean drinkWater(
        double waterX,
        double waterZ
    ) {

        double dx = waterX - x;
        double dz = waterZ - z;

        double distance =
            Math.sqrt(
                dx * dx +
                dz * dz
            );

        if (distance > 1.8) {

            double speed = 0.8;

            // Small perpendicular jitter on top of the direct approach
            // — still converges reliably (jitter is much smaller than
            // speed), just avoids a perfectly straight robotic line.
            double jitter = (Math.random() - 0.5) * 0.15;
            double perpX = -dz / distance;
            double perpZ = dx / distance;

            x +=
                (dx / distance) * speed
                + perpX * jitter;

            z +=
                (dz / distance) * speed
                + perpZ * jitter;

            return false;
        }

        thirst =
            Math.max(
                0,
                thirst - 85
            );

        energy =
            Math.min(
                100,
                energy + 20
            );

        goal = "WANDER";

        return true;
    }

    // ==================== REST ====================

    public void restAt(House house) {

        double dx =
            house.getX() - x;

        double dz =
            house.getZ() - z;

        double distance =
            Math.sqrt(
                dx * dx +
                dz * dz
            );

        if (distance > 1.8) {

            double speed = 0.22;

            double jitter = (Math.random() - 0.5) * 0.06;
            double perpX = -dz / distance;
            double perpZ = dx / distance;

            x +=
                (dx / distance) * speed
                + perpX * jitter;

            z +=
                (dz / distance) * speed
                + perpZ * jitter;

        } else {

            energy =
                Math.min(
                    100,
                    energy + 5
                );

            hunger =
                Math.max(
                    0,
                    hunger - 0.5
                );
        }
    }

    // ==================== FOOD ====================

    public boolean eatFood(Food food) {

        double dx =
            food.getX() - x;

        double dz =
            food.getZ() - z;

        double distance =
            Math.sqrt(
                dx * dx +
                dz * dz
            );

        if (distance > 1.2) {

            double speed = 0.8;

            double jitter = (Math.random() - 0.5) * 0.15;
            double perpX = -dz / distance;
            double perpZ = dx / distance;

            x +=
                (dx / distance) * speed
                + perpX * jitter;

            z +=
                (dz / distance) * speed
                + perpZ * jitter;

            return false;
        }

        hunger =
            Math.max(
                0,
                hunger - 85
            );

        energy =
            Math.min(
                100,
                energy + 35
            );

        goal = "WANDER";

        return true;
    }
}
