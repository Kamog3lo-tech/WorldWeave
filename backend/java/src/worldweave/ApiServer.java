package worldweave;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Scanner;

public class ApiServer {

private final World world;
private HttpServer server;

public ApiServer(World world) {
    this.world = world;
}

public void start() throws IOException {
int port = Integer.parseInt(
    System.getenv().getOrDefault("PORT", "8080")
);

server = HttpServer.create(new InetSocketAddress(port), 0);
    server.createContext("/api/world", this::handleWorld);
    server.createContext("/api/command", this::handleCommand);

    server.setExecutor(null);
    server.start();

    System.out.println("API server running on port " + port);
    System.out.println("  GET  /api/world");
    System.out.println("  POST /api/command");
}

// ==================== CORS helper ====================

private void addCorsHeaders(HttpExchange exchange) {
 String allowedOrigin = System.getenv().getOrDefault(
    "FRONTEND_ORIGIN",
    "http://localhost:5173"
);

exchange.getResponseHeaders().set(
    "Access-Control-Allow-Origin",
    allowedOrigin
);

    exchange.getResponseHeaders().set(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
    );

    exchange.getResponseHeaders().set(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );
}

// ==================== GET /api/world ====================

private void handleWorld(HttpExchange exchange) throws IOException {

    addCorsHeaders(exchange);

    if (exchange.getRequestMethod().equalsIgnoreCase("OPTIONS")) {
        exchange.sendResponseHeaders(204, -1);
        exchange.close();
        return;
    }

    WorldState state = world.getState();

    StringBuilder response = new StringBuilder();

    response.append("{");

    response.append("\"time\":")
        .append(state.getTime())
        .append(",");

    response.append("\"population\":")
        .append(state.getPopulation())
        .append(",");

    response.append("\"food\":")
        .append(state.getFood())
        .append(",");

    response.append("\"water\":")
        .append(state.getWater())
        .append(",");

    response.append("\"foodCapacity\":")
        .append(world.getFoodCapacity())
        .append(",");

    response.append("\"waterCapacity\":")
        .append(world.getWaterCapacity())
        .append(",");

    response.append("\"paused\":")
        .append(world.isPaused())
        .append(",");

    response.append("\"events\":[");

    java.util.List<String> recentEvents = world.getRecentEvents();

    for (int i = 0; i < recentEvents.size(); i++) {

        String escaped =
            recentEvents.get(i)
                .replace("\\", "\\\\")
                .replace("\"", "\\\"");

        response.append("\"").append(escaped).append("\"");

        if (i < recentEvents.size() - 1) {
            response.append(",");
        }
    }

    response.append("],");

    // ==================== Agents ====================

    response.append("\"agents\":[");

    for (
        int i = 0;
        i < state.getAgents().size();
        i++
    ) {

        Agent a = state.getAgents().get(i);

        response.append("{");

        response.append("\"id\":\"")
            .append(a.getId())
            .append("\",");

        response.append("\"x\":")
            .append(a.getX())
            .append(",");

        response.append("\"z\":")
            .append(a.getZ())
            .append(",");

        response.append("\"energy\":")
            .append(a.getEnergy())
            .append(",");

        response.append("\"hunger\":")
            .append(a.getHunger())
            .append(",");

        response.append("\"thirst\":")
            .append(a.getThirst())
            .append(",");

        response.append("\"goal\":\"")
            .append(a.getGoal())
            .append("\",");

        response.append("\"occupation\":\"")
            .append(a.getOccupation())
            .append("\",");

        response.append("\"money\":")
            .append(a.getMoney());

        response.append("}");

        if (
            i <
            state.getAgents().size() - 1
        ) {
            response.append(",");
        }
    }

    response.append("],");

    // ==================== Houses ====================

    response.append("\"houses\":[");

    for (
        int i = 0;
        i < state.getHouses().size();
        i++
    ) {

        House h = state.getHouses().get(i);

        response.append("{");

        response.append("\"id\":\"")
            .append(h.getId())
            .append("\",");

        response.append("\"x\":")
            .append(h.getX())
            .append(",");

        response.append("\"z\":")
            .append(h.getZ());

        response.append("}");

        if (
            i <
            state.getHouses().size() - 1
        ) {
            response.append(",");
        }
    }

    response.append("],");

    // ==================== Food ====================

    response.append("\"foods\":[");

    for (
        int i = 0;
        i < state.getFoods().size();
        i++
    ) {

        Food f = state.getFoods().get(i);

        response.append("{");

        response.append("\"id\":\"")
            .append(f.getId())
            .append("\",");

        response.append("\"x\":")
            .append(f.getX())
            .append(",");

        response.append("\"z\":")
            .append(f.getZ());

        response.append("}");

        if (
            i <
            state.getFoods().size() - 1
        ) {
            response.append(",");
        }
    }

    response.append("]");

    response.append("}");

    // IMPORTANT:
    // This method only returns the WORLD state.
    sendJson(
        exchange,
        200,
        response.toString()
    );
}

// ==================== POST /api/command ====================

private void handleCommand(
    HttpExchange exchange
) throws IOException {

    addCorsHeaders(exchange);

    if (
        exchange.getRequestMethod()
            .equalsIgnoreCase("OPTIONS")
    ) {

        exchange.sendResponseHeaders(204, -1);
        exchange.close();
        return;
    }

    if (
        !exchange.getRequestMethod()
            .equalsIgnoreCase("POST")
    ) {

        sendJson(
            exchange,
            405,
            "{\"error\":\"Method not allowed\"}"
        );

        return;
    }

    // ==================== Read request ====================

    String body = readBody(exchange);

    System.out.println(
        "Received command: " + body
    );

    String action =
        extractString(body, "action");

    String result;

    // ==================== Execute command ====================

    try {

        switch (action) {

            case "SPAWN_FOOD": {

                double x =
                    extractDouble(
                        body,
                        "x",
                        (Math.random() - 0.5) * 16
                    );

                double z =
                    extractDouble(
                        body,
                        "z",
                        (Math.random() - 0.5) * 16
                    );

                int amount =
                    (int) extractDouble(
                        body,
                        "amount",
                        10
                    );

                result =
                    world.spawnFood(
                        x,
                        z,
                        amount
                    );

                break;
            }

            case "RESET_WORLD": {

                result =
                    world.resetWorld();

                break;
            }

            case "ADD_AGENT": {

                double x =
                    extractDouble(
                        body,
                        "x",
                        (Math.random() - 0.5) * 16
                    );

                double z =
                    extractDouble(
                        body,
                        "z",
                        (Math.random() - 0.5) * 16
                    );

                String agentId =
                    "agent-" +
                    System.nanoTime();

                world.addAgent(
                    new Agent(agentId, x, z)
                );

                result =
                    "Agent added at (" +
                    x + ", " + z +
                    "). Population: " +
                    world.getPopulation();

                break;
            }

            case "CREATE_FOOD_CRISIS": {

                result =
                    world.createFoodCrisis();

                break;
            }

            case "CREATE_WATER_CRISIS": {

                result =
                    world.createWaterCrisis();

                break;
            }

            case "CREATE_HOUSING_CRISIS": {

                result =
                    world.createHousingCrisis();

                break;
            }

            case "CREATE_POPULATION_CRISIS": {

                result =
                    world.createPopulationCrisis();

                break;
            }

            case "BUILD_HOUSE": {

                double x =
                    extractDouble(
                        body,
                        "x",
                        (Math.random() - 0.5) * 16
                    );

                double z =
                    extractDouble(
                        body,
                        "z",
                        (Math.random() - 0.5) * 16
                    );

                int amount =
                    (int) extractDouble(
                        body,
                        "amount",
                        1
                    );

                result =
                    world.buildHouse(
                        x,
                        z,
                        amount
                    );

                break;
            }

            case "SPAWN_WATER": {

                int amount =
                    (int) extractDouble(
                        body,
                        "amount",
                        1000
                    );

                result =
                    world.spawnWater(amount);

                break;
            }

            case "PAUSE": {

                result = world.pause();

                break;
            }

            case "RESUME": {

                result = world.resume();

                break;
            }

            case "SET_FOOD": {

                int amount =
                    (int) extractDouble(
                        body,
                        "amount",
                        0
                    );

                result =
                    world.setFood(amount);

                break;
            }

            case "SET_WATER": {

                int amount =
                    (int) extractDouble(
                        body,
                        "amount",
                        0
                    );

                result =
                    world.setWater(amount);

                break;
            }

            case "OBSERVE": {

                result =
                    "Observing world...";

                break;
            }

            default: {

                result =
                    "Unknown action: " + action;
            }
        }

    } catch (Exception e) {

        result =
            "Error executing command: " +
            e.getMessage();

        e.printStackTrace();
    }

    // ==================== Get authoritative state ====================

    WorldState updatedState =
        world.getState();

    System.out.println(
        "→ " + result
    );

    // ==================== Build response ====================

    String safeResult =
        result
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", " ")
            .replace("\r", " ");

    StringBuilder response =
        new StringBuilder();

    response.append("{");

    response.append("\"result\":\"")
        .append(safeResult)
        .append("\",");

    // ==================== WORLD ====================

    response.append("\"updatedWorld\":{");

    response.append("\"time\":")
        .append(updatedState.getTime())
        .append(",");

    response.append("\"population\":")
        .append(updatedState.getPopulation())
        .append(",");

    response.append("\"food\":")
        .append(updatedState.getFood())
        .append(",");

    response.append("\"water\":")
        .append(updatedState.getWater())
        .append(",");

    response.append("\"foodCapacity\":")
        .append(world.getFoodCapacity())
        .append(",");

    response.append("\"waterCapacity\":")
        .append(world.getWaterCapacity())
        .append(",");

    response.append("\"paused\":")
        .append(world.isPaused())
        .append(",");

    response.append("\"events\":[");

    java.util.List<String> recentEventsAfterCommand = world.getRecentEvents();

    for (int i = 0; i < recentEventsAfterCommand.size(); i++) {

        String escaped =
            recentEventsAfterCommand.get(i)
                .replace("\\", "\\\\")
                .replace("\"", "\\\"");

        response.append("\"").append(escaped).append("\"");

        if (i < recentEventsAfterCommand.size() - 1) {
            response.append(",");
        }
    }

    response.append("],");

    // ==================== AGENTS ====================

    response.append("\"agents\":[");

    for (
        int i = 0;
        i < updatedState.getAgents().size();
        i++
    ) {

        Agent a =
            updatedState.getAgents().get(i);

        response.append("{");

        response.append("\"id\":\"")
            .append(a.getId())
            .append("\",");

        response.append("\"x\":")
            .append(a.getX())
            .append(",");

        response.append("\"z\":")
            .append(a.getZ())
            .append(",");

        response.append("\"energy\":")
            .append(a.getEnergy())
            .append(",");

        response.append("\"hunger\":")
            .append(a.getHunger())
            .append(",");

        response.append("\"thirst\":")
            .append(a.getThirst())
            .append(",");

        response.append("\"goal\":\"")
            .append(a.getGoal())
            .append("\",");

        response.append("\"occupation\":\"")
            .append(a.getOccupation())
            .append("\",");

        response.append("\"money\":")
            .append(a.getMoney());

        response.append("}");

        if (
            i <
            updatedState.getAgents().size() - 1
        ) {
            response.append(",");
        }
    }

    response.append("],");

    // ==================== HOUSES ====================

    response.append("\"houses\":[");

    for (
        int i = 0;
        i < updatedState.getHouses().size();
        i++
    ) {

        House h =
            updatedState.getHouses().get(i);

        response.append("{");

        response.append("\"id\":\"")
            .append(h.getId())
            .append("\",");

        response.append("\"x\":")
            .append(h.getX())
            .append(",");

        response.append("\"z\":")
            .append(h.getZ());

        response.append("}");

        if (
            i <
            updatedState.getHouses().size() - 1
        ) {
            response.append(",");
        }
    }

    response.append("],");

    // ==================== FOOD ====================

    response.append("\"foods\":[");

    for (
        int i = 0;
        i < updatedState.getFoods().size();
        i++
    ) {

        Food f =
            updatedState.getFoods().get(i);

        response.append("{");

        response.append("\"id\":\"")
            .append(f.getId())
            .append("\",");

        response.append("\"x\":")
            .append(f.getX())
            .append(",");

        response.append("\"z\":")
            .append(f.getZ());

        response.append("}");

        if (
            i <
            updatedState.getFoods().size() - 1
        ) {
            response.append(",");
        }
    }

    response.append("]");

    response.append("}");

    response.append("}");

    sendJson(
        exchange,
        200,
        response.toString()
    );
}

// ==================== Helpers ====================

private String readBody(
    HttpExchange exchange
) throws IOException {

    try (
        InputStream is =
            exchange.getRequestBody();

        Scanner scanner =
            new Scanner(
                is,
                StandardCharsets.UTF_8.name()
            )
    ) {

        scanner.useDelimiter("\\A");

        return scanner.hasNext()
            ? scanner.next()
            : "";
    }
}

private void sendJson(
    HttpExchange exchange,
    int status,
    String json
) throws IOException {

    exchange.getResponseHeaders()
        .set(
            "Content-Type",
            "application/json"
        );

    byte[] bytes =
        json.getBytes(
            StandardCharsets.UTF_8
        );

    exchange.sendResponseHeaders(
        status,
        bytes.length
    );

    try (
        OutputStream os =
            exchange.getResponseBody()
    ) {

        os.write(bytes);
    }
}

// ==================== Simple JSON extractors ====================

private String extractString(
    String json,
    String key
) {

    String search =
        "\"" + key + "\":\"";

    int start =
        json.indexOf(search);

    if (start == -1) {
        return "";
    }

    start += search.length();

    int end =
        json.indexOf("\"", start);

    return end == -1
        ? ""
        : json.substring(start, end);
}

private double extractDouble(
    String json,
    String key,
    double defaultValue
) {

    String search =
        "\"" + key + "\":";

    int start =
        json.indexOf(search);

    if (start == -1) {
        return defaultValue;
    }

    start += search.length();

    while (
        start < json.length() &&
        Character.isWhitespace(
            json.charAt(start)
        )
    ) {

        start++;
    }

    int end = start;

    while (
        end < json.length() &&
        (
            Character.isDigit(
                json.charAt(end)
            ) ||
            json.charAt(end) == '.' ||
            json.charAt(end) == '-'
        )
    ) {

        end++;
    }

    try {

        return Double.parseDouble(
            json.substring(start, end)
        );

    } catch (Exception e) {

        return defaultValue;
    }
}

}