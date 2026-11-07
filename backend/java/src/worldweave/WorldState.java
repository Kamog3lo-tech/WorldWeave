package worldweave;

import java.util.ArrayList;

public class WorldState {

    private int time;
    private int population;
    private int food;
    private int water;

    private ArrayList<Agent> agents;
    private ArrayList<House> houses;
    private ArrayList<Food> foods;

    public WorldState(
        int time,
        int population,
        int food,
        int water,
        ArrayList<Agent> agents,
        ArrayList<House> houses,
        ArrayList<Food> foods
    ) {
        this.time = time;
        this.population = population;
        this.food = food;
        this.water = water;
        this.agents = agents;
        this.houses = houses;
        this.foods = foods;
    }

    public int getTime() {
        return time;
    }

    public int getPopulation() {
        return population;
    }

    public int getFood() {
        return food;
    }

    public int getWater() {
        return water;
    }

    public ArrayList<Agent> getAgents() {
        return agents;
    }

    public ArrayList<House> getHouses() {
        return houses;
    }

    public ArrayList<Food> getFoods() {
        return foods;
    }
}