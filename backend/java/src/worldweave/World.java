
package worldweave;

import java.util.ArrayList;

public class World {

    private int time;
    private int population;
    private int food;
    private int water;

    // Checked by Main's loop each iteration — pausing skips the tick
    // entirely rather than changing tick rate or introducing a second
    // timing mechanism. volatile since it's set from an API-handling
    // thread and read from the simulation loop thread.
    private volatile boolean paused = false;

    // =========================================================
    // DYNAMIC CAPACITY (Priority: population-scalable resources)
    // =========================================================
    // Java is the final authority on how much this settlement can
    // actually hold. Capacity now scales with population instead of
    // staying fixed, with a generous absolute safety ceiling above it
    // purely to guard against a malformed/hallucinated upstream
    // request creating an absurd stored value or 3D entity count —
    // never to make resources effectively unlimited.

    private static final int FOOD_CAPACITY_PER_AGENT = 25;
    private static final int FOOD_SAFETY_CEILING = 10_000;

    private static final int WATER_CAPACITY_PER_AGENT = 200;
    private static final int WATER_SAFETY_CEILING = 200_000;

    // Per-call safety ceiling for a single BUILD_HOUSE request (was a
    // flat 20 regardless of population). Callers already compute the
    // exact deficit needed, so this only guards against an absurd
    // single request, not a total-housing cap.
    private static final int HOUSE_BUILD_SAFETY_CEILING = 200;

    // Physical food objects are a *visual* representation of the
    // reserve, not the reserve itself. This was hard-capped at 8
    // regardless of population — a 30-agent settlement still only
    // ever showed 8 food items on the ground. Now it scales, bounded
    // by a render-friendly safety ceiling.
    private static final int PHYSICAL_FOOD_SAFETY_CEILING = 40;

    private static final double WATER_SOURCE_X = 10;
    private static final double WATER_SOURCE_Z = -10;

    private final ArrayList<Agent> agents;
    private final ArrayList<House> houses;
    private final ArrayList<Food> foods;

    // =========================================================
    // EVENT LOG (Phase B — real, not fabricated in React)
    // =========================================================
    // Bounded recent-events buffer. Every entry is written at the
    // exact point a real state change happens (production, crisis,
    // a Director action's actual effect) — never a presentation-layer
    // guess. Newest first.

    private static final int MAX_EVENTS = 40;
    private final java.util.LinkedList<String> recentEvents =
        new java.util.LinkedList<>();

    // =========================================================
    // CONSUMPTION RATE FIX (Phase 1 stability pass)
    // =========================================================
    // Root cause of the "food counts down 10,9,8...1 in seconds" bug:
    // capacity scales as population*25, but consumption was applied
    // as `population` units EVERY tick (every 500ms) — for any
    // population >= 4 that's a fixed 25-tick (12.5s) full-to-empty
    // cycle regardless of settlement size, and far less for smaller
    // starting values. This accumulator applies the same per-agent
    // consumption amount, just once every CONSUMPTION_INTERVAL_TICKS
    // ticks instead of every tick — the 500ms tick rate itself is
    // untouched, only how often resource consumption is applied
    // within it.
    private static final int CONSUMPTION_INTERVAL_TICKS = 10;
    private int ticksSinceConsumption = 0;

    private synchronized void logEvent(String message) {
        recentEvents.addFirst(time + "s: " + message);
        while (recentEvents.size() > MAX_EVENTS) {
            recentEvents.removeLast();
        }
    }

    public synchronized java.util.List<String> getRecentEvents() {
        return new java.util.ArrayList<>(recentEvents);
    }

    public World() {
        time = 0;
        population = 0;

        food = 100;
        water = 1000;

        agents = new ArrayList<>();
        houses = new ArrayList<>();
        foods = new ArrayList<>();
    }

    public synchronized int getTime() {
        return time;
    }

    public synchronized int getPopulation() {
        return population;
    }

    public synchronized int getFood() {
        return food;
    }

    public synchronized int getWater() {
        return water;
    }

    public synchronized int getFoodCapacity() {
        return Math.min(
            FOOD_SAFETY_CEILING,
            Math.max(
                100,
                population * FOOD_CAPACITY_PER_AGENT
            )
        );
    }

    public synchronized int getWaterCapacity() {
        return Math.min(
            WATER_SAFETY_CEILING,
            Math.max(
                1000,
                population * WATER_CAPACITY_PER_AGENT
            )
        );
    }

    public boolean isPaused() {
        return paused;
    }

    public synchronized String pause() {
        paused = true;
        return "Simulation paused.";
    }

    public synchronized String resume() {
        paused = false;
        return "Simulation resumed.";
    }

    public synchronized ArrayList<Agent> getAgents() {
        return agents;
    }

    public synchronized ArrayList<House> getHouses() {
        return houses;
    }

    public synchronized ArrayList<Food> getFoods() {
        return foods;
    }

    // =========================================================
    // AGENTS
    // =========================================================

    public synchronized void addAgent(Agent agent) {
        agents.add(agent);
        population++;
    }

    // =========================================================
    // HOUSES
    // =========================================================

    public synchronized void addHouse(House house) {
        houses.add(house);
    }

    // =========================================================
    // FOOD
    // =========================================================

    public synchronized void addFood(Food foodObj) {
        foods.add(foodObj);
    }

    public synchronized void addFood(int amount) {
        food = Math.min(
            getFoodCapacity(),
            food + Math.max(0, amount)
        );
    }

    // Sets the reserve to an exact value rather than adding to it —
    // used by World Prompt to honor an explicit starting quantity
    // (including an explicit 0), which SPAWN_FOOD's additive
    // semantics can't express on their own.
    public synchronized String setFood(int amount) {
        int capacity = getFoodCapacity();
        food = Math.max(0, Math.min(capacity, amount));
        return "Food reserve set to " + food + "/" + capacity;
    }

    // =========================================================
    // WATER
    // =========================================================

    public synchronized void addWater(int amount) {
        water = Math.min(
            getWaterCapacity(),
            water + Math.max(0, amount)
        );
    }

    // Sets the reserve to an exact value rather than adding to it —
    // same rationale as setFood().
    public synchronized String setWater(int amount) {
        int capacity = getWaterCapacity();
        water = Math.max(0, Math.min(capacity, amount));
        return "Water reserve set to " + water + "/" + capacity;
    }

    // =========================================================
    // BULK FOOD RECOVERY
    // =========================================================

    public synchronized String spawnFood(
    double x,
    double z,
    int amount
) {

    int requested = Math.max(1, amount);

    int before = food;

    int capacity = getFoodCapacity();

    food = Math.min(
        capacity,
        food + requested
    );

    int restored = food - before;

    // Keep enough visible food objects for the population, bounded by
    // a render-friendly safety ceiling instead of a flat 8 regardless
    // of settlement size.
    int physicalFoodTarget =
        Math.min(
            PHYSICAL_FOOD_SAFETY_CEILING,
            Math.max(1, population)
        );

    int objectsNeeded =
        Math.max(
            0,
            physicalFoodTarget - foods.size()
        );

    for (int i = 0; i < objectsNeeded; i++) {

        double angle =
            (Math.PI * 2 * i) /
            Math.max(1, objectsNeeded);

        // Widened from a tight 1.5 — objects were previously packed
        // into one small cluster per spawn event. Still one
        // accessible zone (not scattered map-wide), just visibly
        // spread out instead of stacked on top of each other.
        double radius = 4.0 + Math.random() * 1.5;

        double foodX =
            clamp(
                x + Math.cos(angle) * radius,
                -18,
                18
            );

        double foodZ =
            clamp(
                z + Math.sin(angle) * radius,
                -18,
                18
            );

        String id =
            "food-auto-" +
            System.nanoTime() +
            "-" +
            i;

        foods.add(
            new Food(
                id,
                foodX,
                foodZ
            )
        );
    }

    logEvent("Food reserve restored: +" + restored + " (now " + food + "/" + capacity + ").");

    return
        "Food recovery: +" +
        restored +
        " reserve, " +
        objectsNeeded +
        " visible food objects. " +
        "Reserve: " +
        food +
        "/" +
        capacity;
}

    // =========================================================
    // BULK HOUSE RECOVERY
    // =========================================================

    public synchronized String buildHouse(
        double preferredX,
        double preferredZ
    ) {

        return buildHouses(
            preferredX,
            preferredZ,
            1
        );
    }

    public synchronized String buildHouse(
        double preferredX,
        double preferredZ,
        int amount
    ) {

        return buildHouses(
            preferredX,
            preferredZ,
            amount
        );
    }

    public synchronized String buildHouses(
        double preferredX,
        double preferredZ,
        int amount
    ) {

        int count =
            Math.min(
                HOUSE_BUILD_SAFETY_CEILING,
                Math.max(0, amount)
            );

        if (count == 0) {
            return "No houses required.";
        }

        for (int i = 0; i < count; i++) {

            double x = preferredX;
            double z = preferredZ;

            for (int attempt = 0; attempt < 20; attempt++) {

                boolean tooClose = false;

                for (House house : houses) {

                    double dx =
                        house.getX() - x;

                    double dz =
                        house.getZ() - z;

                    double distance =
                        Math.sqrt(
                            dx * dx +
                            dz * dz
                        );

                    if (distance < 4.5) {
                        tooClose = true;
                        break;
                    }
                }

                if (!tooClose) {
                    break;
                }

                x =
                    (Math.random() - 0.5) * 22;

                z =
                    (Math.random() - 0.5) * 22;
            }

            String id =
                "house-auto-" +
                System.nanoTime() +
                "-" +
                i;

            houses.add(
                new House(
                    id,
                    x,
                    z
                )
            );
        }

        logEvent(count + " house(s) built (now " + houses.size() + " total).");

        return
            "Built " +
            count +
            " houses. " +
            "Housing: " +
            houses.size() +
            "/" +
            population;
    }

    // =========================================================
    // BULK WATER RECOVERY
    // =========================================================

    public synchronized String spawnWater(int amount) {

        int requested =
            Math.max(0, amount);

        int before = water;

        int capacity = getWaterCapacity();

        water =
            Math.min(
                capacity,
                water + requested
            );

        int restored =
            water - before;

        logEvent("Water reserve restored: +" + restored + "L (now " + water + "/" + capacity + "L).");

        return
            "Water recovery: +" +
            restored +
            "L. Reserve: " +
            water +
            "/" +
            capacity +
            "L";
    }

    // =========================================================
    // RESET
    // =========================================================

    public synchronized String resetWorld() {

        time = 0;
        population = 0;

        food = 100;
        water = 1000;

        agents.clear();
        houses.clear();
        foods.clear();

        return "World reset to default state.";
    }

    // =========================================================
    // CRISES
    // =========================================================

    public synchronized String createFoodCrisis() {

        food = 0;
        foods.clear();

        logEvent("Food crisis triggered — reserves depleted.");

        return
            "FOOD CRISIS: Food reserves critically low.";
    }

    public synchronized String createWaterCrisis() {

        water = 0;

        logEvent("Water crisis triggered — reserves depleted.");

        return
            "WATER CRISIS: Water reserves critically low.";
    }

    public synchronized String createHousingCrisis() {

        houses.clear();

        logEvent("Housing crisis triggered — houses cleared.");

        return
            "HOUSING CRISIS: Population has no available housing.";
    }

    public synchronized String createPopulationCrisis() {

        int startingPopulation =
            agents.size();

        for (
            int i = startingPopulation;
            i < startingPopulation + 3;
            i++
        ) {

            double x =
                (i - startingPopulation) * 2 - 2;

            double z = -6;

            addAgent(
                new Agent(
                    "agent-" +
                    System.nanoTime() +
                    "-" +
                    i,
                    x,
                    z
                )
            );
        }

        logEvent("Population surge — 3 new residents arrived.");

        return
            "POPULATION CRISIS: Population increased rapidly.";
    }

    // =========================================================
    // SIMULATION
    // =========================================================

    public synchronized void advanceTime(
        int amount
    ) {

        time += amount;

        // Natural resource consumption — applied once every
        // CONSUMPTION_INTERVAL_TICKS ticks (see field comment above),
        // not every tick. `while`, not `if`, so this stays correct
        // even if advanceTime is ever called with amount > 1.
        ticksSinceConsumption += amount;

        while (ticksSinceConsumption >= CONSUMPTION_INTERVAL_TICKS) {

            ticksSinceConsumption -= CONSUMPTION_INTERVAL_TICKS;

            boolean foodWasAvailable = food > 0;
            boolean waterWasAvailable = water > 0;

            food =
                Math.max(
                    0,
                    food - population
                );

            water =
                Math.max(
                    0,
                    water - population
                );

            if (foodWasAvailable && food <= 0) {
                logEvent("Food reserves reached critical level.");
            }

            if (waterWasAvailable && water <= 0) {
                logEvent("Water reserves reached critical level.");
            }
        }

        for (Agent agent : agents) {

            agent.update(amount);

            // =================================================
            // WATER
            // =================================================

            if (
                agent.getGoal()
                    .equals("FIND_WATER")
                &&
                water > 0
            ) {

                boolean drank =
                    agent.drinkWater(
                        WATER_SOURCE_X,
                        WATER_SOURCE_Z
                    );

                if (drank) {

                    water =
                        Math.max(
                            0,
                            water - 10
                        );

                    System.out.println(
                        "💧 " +
                        agent.getId() +
                        " drank water."
                    );

                    logEvent(agent.getId() + " drank water.");
                }
            }

            // =================================================
            // REST
            // =================================================

            if (
                agent.getGoal()
                    .equals("REST")
                &&
                !houses.isEmpty()
            ) {

                House nearestHouse =
                    houses.get(0);

                double nearestDistance =
                    Double.MAX_VALUE;

                for (
                    House house :
                    houses
                ) {

                    double dx =
                        house.getX() -
                        agent.getX();

                    double dz =
                        house.getZ() -
                        agent.getZ();

                    double distance =
                        Math.sqrt(
                            dx * dx +
                            dz * dz
                        );

                    if (
                        distance <
                        nearestDistance
                    ) {

                        nearestDistance =
                            distance;

                        nearestHouse =
                            house;
                    }
                }

                agent.restAt(
                    nearestHouse
                );
            }

            // =================================================
            // FOOD
            // =================================================

            if (
                agent.getGoal()
                    .equals("FIND_FOOD")
                &&
                !foods.isEmpty()
            ) {

                Food nearestFood =
                    null;

                double nearestDistance =
                    Double.MAX_VALUE;

                for (
                    Food foodObject :
                    foods
                ) {

                    double dx =
                        foodObject.getX() -
                        agent.getX();

                    double dz =
                        foodObject.getZ() -
                        agent.getZ();

                    double distance =
                        Math.sqrt(
                            dx * dx +
                            dz * dz
                        );

                    if (
                        distance <
                        nearestDistance
                    ) {

                        nearestDistance =
                            distance;

                        nearestFood =
                            foodObject;
                    }
                }

                if (
                    nearestFood != null
                ) {

                    boolean eaten =
                        agent.eatFood(
                            nearestFood
                        );

                    if (eaten) {

                        foods.remove(
                            nearestFood
                        );

                        System.out.println(
                            "🍖 " +
                            agent.getId() +
                            " ate food."
                        );

                        logEvent(agent.getId() + " ate food.");
                    }
                }
            }

            // =================================================
            // WORK (Phase 2 — lightweight occupations)
            // =================================================
            // Agent.work() only updates the agent's own money. The
            // shared food reserve is authoritative World state, so
            // the actual production effect happens here, same as
            // every other goal's real-world consequence.

            if (
                agent.getGoal()
                    .equals("WORK")
            ) {

                agent.work(amount);

                boolean producesFood =
                    agent.getOccupation().equals("FARMER") ||
                    agent.getOccupation().equals("GATHERER");

                if (
                    producesFood &&
                    Math.random() < 0.15
                ) {

                    food = Math.min(
                        getFoodCapacity(),
                        food + 1
                    );

                    // Production previously only touched the abstract
                    // reserve — agents can only eat physical objects,
                    // and nothing but a Director-approved SPAWN_FOOD
                    // ever created those, so natural production was
                    // invisible to hungry agents. Tying one physical
                    // object to each successful production event
                    // keeps the reserve and the physical supply
                    // consistent. Bounded by the same safety ceiling
                    // spawnFood() uses, so this can never grow
                    // unbounded even over a long session.
                    boolean physicalSupplyHasRoom =
                        foods.size() < PHYSICAL_FOOD_SAFETY_CEILING;

                    if (physicalSupplyHasRoom) {

                        double producedX =
                            clamp(
                                agent.getX() + (Math.random() - 0.5) * 2,
                                -18,
                                18
                            );

                        double producedZ =
                            clamp(
                                agent.getZ() + (Math.random() - 0.5) * 2,
                                -18,
                                18
                            );

                        String producedId =
                            "food-produced-" + System.nanoTime();

                        foods.add(
                            new Food(producedId, producedX, producedZ)
                        );
                    }

                    System.out.println(
                        "🌾 " +
                        agent.getId() +
                        " (" + agent.getOccupation() + ") " +
                        "produced food."
                    );

                    logEvent(
                        agent.getId() +
                        " (" + agent.getOccupation() + ") produced food."
                    );
                }
            }
        }
    }

    // =========================================================
    // WORLD STATE
    // =========================================================

    public synchronized WorldState getState() {

        return new WorldState(
            time,
            population,
            food,
            water,
            new ArrayList<>(agents),
            new ArrayList<>(houses),
            new ArrayList<>(foods)
        );
    }

    // =========================================================
    // HELPERS
    // =========================================================

    private double clamp(
        double value,
        double min,
        double max
    ) {

        return Math.max(
            min,
            Math.min(max, value)
        );
    }
}
