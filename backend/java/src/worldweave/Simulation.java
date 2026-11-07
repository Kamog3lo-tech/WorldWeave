package worldweave;

public class Simulation {

    private World world;

    public Simulation(World world) {
        this.world = world;
    }

    public void tick(int amount) {
        world.advanceTime(amount);
    }

    public World getWorld() {
        return world;
    }
}