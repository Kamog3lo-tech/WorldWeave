package worldweave;

import java.io.IOException;

public class Main {

    public static void main(String[] args)
        throws IOException {

        World world = new World();

        // ==========================================
        // STARTING SETTLEMENT
        // ==========================================

        world.addHouse(
            new House(
                "house-1",
                0,
                0
            )
        );

        // Initial physical food

        world.addFood(
            new Food(
                "food-1",
                14,
                12
            )
        );

        world.addFood(
            new Food(
                "food-2",
                -13,
                11
            )
        );

        // Initial population

        world.addAgent(
            new Agent(
                "agent-1",
                -4,
                -3
            )
        );

        world.addAgent(
            new Agent(
                "agent-2",
                3,
                -5
            )
        );

        world.addAgent(
            new Agent(
                "agent-3",
                -2,
                4
            )
        );

        // ==========================================
        // SIMULATION
        // ==========================================

        Simulation simulation =
            new Simulation(world);

        // ==========================================
        // API
        // ==========================================

        ApiServer apiServer =
            new ApiServer(world);

        try {

            apiServer.start();

        } catch (IOException e) {

            System.err.println(
                "Failed to start API server: " +
                e.getMessage()
            );
        }

        // ==========================================
        // MAIN LOOP
        // ==========================================

        while (true) {

            if (!world.isPaused()) {
                simulation.tick(1);
            }

            WorldState state =
                world.getState();

            System.out.println(
                "\nTIME: " +
                state.getTime() +
                " | POP: " +
                state.getPopulation() +
                " | FOOD: " +
                state.getFood() +
                " | WATER: " +
                state.getWater() +
                " | HOUSES: " +
                state.getHouses().size() +
                " | FOOD OBJECTS: " +
                state.getFoods().size()
            );

            for (
                Agent agent :
                state.getAgents()
            ) {

                System.out.println(
                    agent.getId()
                    + " | Pos: ("
                    + String.format(
                        "%.1f",
                        agent.getX()
                    )
                    + ", "
                    + String.format(
                        "%.1f",
                        agent.getZ()
                    )
                    + ")"
                    + " | Energy: "
                    + String.format(
                        "%.0f",
                        agent.getEnergy()
                    )
                    + " | Hunger: "
                    + String.format(
                        "%.0f",
                        agent.getHunger()
                    )
                    + " | Thirst: "
                    + String.format(
                        "%.0f",
                        agent.getThirst()
                    )
                    + " | Goal: "
                    + agent.getGoal()
                );
            }

            System.out.println(
                "-----------------------------"
            );

            try {

                Thread.sleep(500);

            } catch (
                InterruptedException e
            ) {

                Thread.currentThread()
                    .interrupt();

                break;
            }
        }
    }
}