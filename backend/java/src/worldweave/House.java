package worldweave;

public class House {

    private String id;
    private double x;
    private double z;

    public House(String id, double x, double z) {
        this.id = id;
        this.x = x;
        this.z = z;
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
}