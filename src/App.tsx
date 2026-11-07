import { Canvas, useFrame } from "@react-three/fiber"
import {
  OrbitControls,
  Text,
  Sky,
} from "@react-three/drei"
import { useWorldStore } from "./store/worldStore"
import { useDirectorStore } from "./ai/directorState"
import { startDirector, stopDirector } from "./ai/directorLoop"
import { DirectorPanel } from "./components/DirectorPanel"
import { WorldPrompt } from "./components/WorldPrompt"
import { DecisionFeed } from "./components/DecisionFeed"
import * as THREE from "three"
import { useEffect,useRef ,useState } from "react"
import type { JavaWorldState } from "./api/worldApi"
import { fetchWorldState, executeWorldCommand } from "./api/worldApi"
import { ChallengePanel } from "./components/ChallengePanel"

function House({
  position,
}: {
  position: [number, number, number]
}) {
  return (
    <group position={position}>
      {/* Main building */}
      <mesh
        position={[0, 0, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[2.4, 1.8, 2.2]} />
        <meshStandardMaterial
          color="#d9a066"
          roughness={0.85}
        />
      </mesh>

      {/* Roof */}
      <mesh
        position={[0, 1.55, 0]}
        rotation={[0, Math.PI / 4, 0]}
        castShadow
      >
        <coneGeometry args={[1.85, 1.7, 4]} />
        <meshStandardMaterial
          color="#7b3f35"
          roughness={0.75}
        />
      </mesh>

      {/* Door */}
      <mesh
        position={[0, -0.25, 1.16]}
        castShadow
      >
        <boxGeometry args={[0.55, 1.1, 0.12]} />
        <meshStandardMaterial
          color="#5a3825"
          roughness={0.8}
        />
      </mesh>

      {/* Door handle */}
      <mesh position={[0.17, -0.2, 1.23]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>

      {/* Left window */}
      <mesh
        position={[-0.7, 0.35, 1.16]}
        castShadow
      >
        <boxGeometry args={[0.5, 0.5, 0.1]} />
        <meshStandardMaterial
          color="#8fd3e8"
          emissive="#3b8fa8"
          emissiveIntensity={0.2}
        />
      </mesh>

      {/* Right window */}
      <mesh
        position={[0.7, 0.35, 1.16]}
        castShadow
      >
        <boxGeometry args={[0.5, 0.5, 0.1]} />
        <meshStandardMaterial
          color="#8fd3e8"
          emissive="#3b8fa8"
          emissiveIntensity={0.2}
        />      
      </mesh>

      {/* Window frames */}
      <mesh position={[-0.7, 0.35, 1.22]}>
        <boxGeometry args={[0.08, 0.55, 0.05]} />
        <meshStandardMaterial />
      </mesh>

      <mesh position={[0.7, 0.35, 1.22]}>
        <boxGeometry args={[0.08, 0.55, 0.05]} />
        <meshStandardMaterial />
      </mesh>

      {/* Chimney */}
      <mesh
        position={[0.65, 2.05, -0.35]}
        castShadow
      >
        <boxGeometry args={[0.35, 0.8, 0.35]} />
        <meshStandardMaterial roughness={0.9} />
      </mesh>

      {/* Small front porch */}
      <mesh
        position={[0, -0.85, 1.35]}
        castShadow
      >
        <boxGeometry args={[1.1, 0.15, 0.6]} />
        <meshStandardMaterial roughness={0.9} />
      </mesh>

      {/* Porch posts */}
      <mesh
        position={[-0.45, -0.35, 1.55]}
        castShadow
      >
        <boxGeometry args={[0.12, 0.9, 0.12]} />
        <meshStandardMaterial />
      </mesh>

      <mesh
        position={[0.45, -0.35, 1.55]}
        castShadow
      >
        <boxGeometry args={[0.12, 0.9, 0.12]} />
        <meshStandardMaterial />
      </mesh>
    </group>
  )
}



function Tree({
  position,
}: {
  position: [number, number, number]
}) {
  return (
    <group position={position}>
      {/* Trunk */}
      <mesh
        position={[0, 0.9, 0]}
        castShadow
      >
        <cylinderGeometry args={[0.22, 0.35, 1.8, 10]} />
        <meshStandardMaterial
          color="#65452f"
          roughness={1}
        />
      </mesh>

      {/* Branch */}
      <mesh
        position={[0, 1.45, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.12, 0.16, 0.9, 8]} />
        <meshStandardMaterial
          color="#2e8b57"
          roughness={1}
        />
      </mesh>

      {/* Main canopy */}
      <mesh
        position={[0, 2.05, 0]}
        castShadow
      >
        <sphereGeometry args={[1.15, 14, 12]} />
        <meshStandardMaterial
          color="#2f6f3e"
          roughness={0.9}
        />
      </mesh>

      {/* Upper canopy */}
      <mesh
        position={[0.15, 2.75, 0]}
        castShadow
      >
        <sphereGeometry args={[0.85, 14, 12]} />
        <meshStandardMaterial roughness={0.9} />
      </mesh>

      {/* Side canopy */}
      <mesh
        position={[-0.65, 2.35, 0.15]}
        castShadow
      >
        <sphereGeometry args={[0.65, 12, 10]} />
        <meshStandardMaterial roughness={0.9} />
      </mesh>

      {/* Small side canopy */}
      <mesh
        position={[0.65, 2.35, -0.15]}
        castShadow
      >
        <sphereGeometry args={[0.6, 12, 10]} />
        <meshStandardMaterial roughness={0.9} />
      </mesh>
    </group>
  )
}

function Agent({
  position,
  energy,
  hunger,
  goal,
}: {
  position: [number, number, number]
  energy?: number
  hunger?: number
  thirst?: number
  goal?: string
}) {
  const groupRef = useRef<THREE.Group>(null)

  const currentEnergy = energy ?? 100
  const currentHunger = hunger ?? 0
  

  useFrame((_, delta) => {
  if (!groupRef.current) return

  groupRef.current.position.x =
    THREE.MathUtils.damp(
      groupRef.current.position.x,
      position[0],
      2.5,
      delta
    )

  groupRef.current.position.y =
    THREE.MathUtils.damp(
      groupRef.current.position.y,
      position[1],
      2.5,
      delta
    )

  groupRef.current.position.z =
    THREE.MathUtils.damp(
      groupRef.current.position.z,
      position[2],
      2.5,
      delta
    )

  const dx =
    position[0] -
    groupRef.current.position.x

  const dz =
    position[2] -
    groupRef.current.position.z

  if (
    Math.abs(dx) > 0.05 ||
    Math.abs(dz) > 0.05
  ) {
    const targetRotation =
      Math.atan2(dx, dz)

    groupRef.current.rotation.y =
      THREE.MathUtils.damp(
        groupRef.current.rotation.y,
        targetRotation,
        6.0,
        delta
      )
  }
})

  const stateLabel =
    goal === "FIND_FOOD"
      ? "🍎 Seeking food"
      : goal === "FIND_WATER"
        ? "💧 Seeking water"
        : goal === "REST"
          ? "🏠 Resting"
          : goal === "WORK"
            ? "⚙️ Working"
            : "🚶 Exploring"

  // Color-coded purely from the goal Java already assigned — no new
  // state, just a clearer read of the existing authoritative value.
  const stateColor =
    goal === "FIND_FOOD"
      ? "#ff8f6b"
      : goal === "FIND_WATER"
        ? "#7fc8ff"
        : goal === "REST"
          ? "#8fe0a8"
          : goal === "WORK"
            ? "#ffd166"
            : "#dddddd"

  // The more hungry an agent is (Java's own `hunger` value), the more
  // visibly it "glows" distress. Fully derived — nothing simulated here.
  const hungerGlow =
    currentHunger >= 60
      ? Math.min(1, (currentHunger - 60) / 40)
      : 0

  return (
    <group ref={groupRef}>
      {/* STATE */}
      <Text
        position={[0, 2.15, 0]}
        fontSize={0.22}
        color={stateColor}
        anchorX="center"
        anchorY="middle"
      >
        {stateLabel}
      </Text>

      {/* BODY */}
      <mesh
        position={[0, 0.55, 0]}
       // castShadow
      >
        <capsuleGeometry args={[0.38, 0.75, 8, 16]} />
        <meshStandardMaterial
          color="#e8b44f"
          roughness={0.6}
          emissive="#ff3b30"
          emissiveIntensity={hungerGlow * 0.6}
        />
      </mesh>

      {/* HEAD */}
      <mesh
        position={[0, 1.25, 0]}
        //castShadow
      >
        <sphereGeometry args={[0.42, 16, 16]} />
          <meshStandardMaterial
          color="#f0c878"
          roughness={0.65}
        />
      </mesh>

      {/* EYES */}
      <mesh position={[-0.15, 1.32, 0.37]}>
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshStandardMaterial />
      </mesh>

      <mesh position={[0.15, 1.32, 0.37]}>
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshStandardMaterial />
      </mesh>

      {/* ENERGY BAR */}
      <mesh position={[0, 1.72, 0]}>
        <boxGeometry args={[1.2, 0.1, 0.08]} />
        <meshBasicMaterial color="black" />
      </mesh>

      <mesh
        position={[
          -0.6 + (currentEnergy / 100) * 0.6,
          1.72,
          0.06,
        ]}
        scale={[
          Math.max(0.01, currentEnergy / 100),
          1,
          1,
        ]}
      >
        <boxGeometry args={[1.2, 0.1, 0.08]} />
        <meshBasicMaterial color="lime" />
      </mesh>

      {/* HUNGER BAR */}
      <mesh position={[0, 1.58, 0]}>
        <boxGeometry args={[1.2, 0.1, 0.08]} />
        <meshBasicMaterial color="black" />
      </mesh>

      <mesh
        position={[
          -0.6 + (currentHunger / 100) * 0.6,
          1.58,
          0.06,
        ]}
        scale={[
          Math.max(0.01, currentHunger / 100),
          1,
          1,
        ]}
      >
        <boxGeometry args={[1.2, 0.1, 0.08]} />
        <meshBasicMaterial color="orange" />
      </mesh>
    </group>
  )
}



function Food({
  position,
}: {
  position: [number, number, number]
}) {
  return (
    <group position={position}>
      <mesh
        position={[0, 0.35, 0]}
        castShadow
      >
        <sphereGeometry args={[0.35, 16, 16]} />
  
      <meshStandardMaterial
        color="#e85d4a"
      emissiveIntensity={0.4}
        roughness={0.5}
      />

      </mesh>

      <mesh position={[0, 0.7, 0]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial />
      </mesh>
    </group>
  )
}

function World() {
  const entities = useWorldStore((state) => state.entities)
  const theme = useWorldStore((state) => state.theme)

  // Ground color and sky atmosphere per theme. Deliberately just a
  // material/prop swap on the existing plane and Sky component — no
  // new shaders, no procedural terrain, no rendering architecture.
  const groundColor =
    theme === "desert"
      ? "#d9c288"
      : theme === "city"
        ? "#6b6b6f"
        : theme === "forest"
          ? "#2f6b3f"
          : "#4f7f52" // standard — unchanged original color

  const skyProps =
    theme === "desert"
      ? { turbidity: 8, rayleigh: 1, mieCoefficient: 0.02, mieDirectionalG: 0.9 }
      : theme === "city"
        ? { turbidity: 6, rayleigh: 1.2, mieCoefficient: 0.01, mieDirectionalG: 0.8 }
        : theme === "forest"
          ? { turbidity: 3, rayleigh: 2, mieCoefficient: 0.003, mieDirectionalG: 0.8 }
          : { turbidity: 5, rayleigh: 1.5, mieCoefficient: 0.005, mieDirectionalG: 0.8 } // standard — unchanged original values

  return (
    <>
      {/* SKY */}
      <Sky
        sunPosition={[100, 35, 100]}
        turbidity={skyProps.turbidity}
        rayleigh={skyProps.rayleigh}
        mieCoefficient={skyProps.mieCoefficient}
        mieDirectionalG={skyProps.mieDirectionalG}
      />

            {/* Main terrain */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[40, 40, 1, 1]} />
        <meshStandardMaterial
          color={groundColor}
          roughness={0.95}
        />
      </mesh>

      {/* Village plaza */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 0]}
        receiveShadow
      >
        <circleGeometry args={[4, 48]} />
        <meshStandardMaterial
          color="#b89b6a"
          roughness={0.95}
        />
      </mesh>

      {/* Main road */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.025, 0]}
        receiveShadow
      >
        <planeGeometry args={[2, 18]} />
        <meshStandardMaterial
          color="#8b7355"
          roughness={1}
        />
      </mesh>

      {/* Cross road */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.026, 0]}
        receiveShadow
      >
        <planeGeometry args={[18, 2]} />
        <meshStandardMaterial roughness={1} />
      </mesh>

      {/* Lake outer surface */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[10, 0.04, -10]}
        receiveShadow
      >
        <circleGeometry args={[5.5, 64]} />
        <meshStandardMaterial
          color="#3b82a0"
          transparent
          opacity={0.8}
          roughness={0.12}
          metalness={0.25}
        />
      </mesh>

      {/* Lake inner surface */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[10, 0.045, -10]}
      >
        <circleGeometry args={[4.6, 64]} />
        <meshStandardMaterial
          color="#256b87"
          transparent
          opacity={0.55}
          roughness={0.08}
          metalness={0.15}
        />
      </mesh>

      {/* Small island */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[10, 0.06, -10]}
      >
        <circleGeometry args={[1.1, 32]} />
        <meshStandardMaterial
          color="#4f7f52"
          roughness={1}
        />
      </mesh>

      {/* WORLD ENTITIES */}
      {entities.map((entity) => {
        if (entity.type === "house") {
          return (
            <House
              key={entity.id}
              position={entity.position}
            />
          )
        }

        if (entity.type === "tree") {
          return (
            <Tree
              key={entity.id}
              position={entity.position}
            />
          )
        }

        if (entity.type === "food") {
          return (
            <Food
              key={entity.id}
              position={entity.position}
            />
          )
        }

        if (entity.type === "agent") {
          return (
            <Agent
              key={entity.id}
              position={entity.position}
              energy={entity.energy}
              hunger={entity.hunger}
              goal={entity.goal}
            />
          )
        }

        return null
      })}

      {/* LIGHTING */}
      <ambientLight intensity={0.45} />

      <directionalLight
        position={[10, 18, 8]}
        intensity={2.8}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={60}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
      />

      <hemisphereLight intensity={0.8} />
    </>
  )
}


type Tab =
  | "build"
  | "edit"
  | "agents"
  | "director"
  | "stress"
  | "experiment"
  | "status"

function App() {

  const [javaWorld, setJavaWorld] = useState<JavaWorldState | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>("build")

  const paused = useWorldStore((state) => state.paused)
  const directorResult = useDirectorStore(
    (state) => state.latestDirectorResult
  )
  const directorOnline =
    directorResult !== null &&
    directorResult.verification?.success !== false

  useEffect(() => {

    // Guards against overlapping requests piling up if one fetch is
    // slow — without this, a stalled connection could stack dozens
    // of in-flight requests across many 150ms ticks before any one
    // of them actually times out.
    let pollInFlight = false

    const updateWorld = () => {

      if (pollInFlight) return
      pollInFlight = true

      fetchWorldState()
        .then((data) => {
          setJavaWorld(data)
          useWorldStore.getState().syncJavaWorld(data)
        })
        .catch((error) => {
          console.error("JAVA FETCH FAILED:", error)
        })
        .finally(() => {
          pollInFlight = false
        })
    }

    updateWorld()

    const interval = setInterval(updateWorld, 150)

    return () => clearInterval(interval)

  }, [])

  useEffect(() => {
    startDirector()

    return () => {
      stopDirector()
    }
  }, [])

  const handleTogglePause = async () => {
    try {
      await executeWorldCommand(paused ? "RESUME" : "PAUSE")
      // No optimistic local update — the next 150ms poll picks up
      // Java's real paused state, same as every other command.
    } catch (error) {
      console.error("Failed to toggle pause:", error)
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "#0b0f16",
        color: "white",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <TopBar
        javaConnected={!!javaWorld}
        directorConnected={directorOnline}
        paused={paused}
        onTogglePause={handleTogglePause}
      />

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <Sidebar activeTab={activeTab} onChangeTab={setActiveTab} />

        {/* 3D WORLD — never covered by any panel */}
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <Canvas
            shadows
            camera={{
              position: [18, 14, 18],
              fov: 50,
            }}
          >
            <World />

            <OrbitControls
              enableDamping
              dampingFactor={0.08}
              minDistance={5}
              maxDistance={35}
              maxPolarAngle={Math.PI / 2.05}
            />
          </Canvas>
        </div>
      </div>

      {/* LIVE EVENT / ACTIVITY FEED */}
      <div
        style={{
          height: 64,
          flexShrink: 0,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <DecisionFeed />
      </div>
    </div>
  )
}

function TopBar({
  javaConnected,
  directorConnected,
  paused,
  onTogglePause,
}: {
  javaConnected: boolean
  directorConnected: boolean
  paused: boolean
  onTogglePause: () => void
}) {
  return (
    <div
      style={{
        height: 48,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "0 16px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        fontSize: 12,
      }}
    >
      <strong style={{ fontSize: 13, letterSpacing: 0.5 }}>
        WORLDWEAVE
      </strong>

      <StatusDot label="JAVA" on={javaConnected} />
      <StatusDot label="AI DIRECTOR" on={directorConnected} />

      <button
        onClick={onTogglePause}
        style={{
          marginLeft: "auto",
          padding: "5px 12px",
          borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.15)",
          background: paused
            ? "rgba(255,180,84,0.15)"
            : "rgba(255,255,255,0.06)",
          color: paused ? "#ffb454" : "white",
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {paused ? "▶ RESUME" : "⏸ PAUSE"}
      </button>
    </div>
  )
}

function StatusDot({ label, on }: { label: string; on: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        opacity: 0.8,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: on ? "#45d483" : "#ff6b6b",
          boxShadow: on
            ? "0 0 6px rgba(69,212,131,0.7)"
            : "0 0 6px rgba(255,107,107,0.7)",
        }}
      />
      {label}
    </div>
  )
}

const SIDEBAR_TABS: { tab: Tab; icon: string; label: string }[] = [
  { tab: "build", icon: "🌍", label: "Build" },
  { tab: "edit", icon: "🛠", label: "Edit" },
  { tab: "agents", icon: "👥", label: "Agents" },
  { tab: "director", icon: "🧠", label: "Director" },
  { tab: "stress", icon: "💥", label: "Stress" },
  { tab: "experiment", icon: "🔬", label: "Experiment" },
  { tab: "status", icon: "📊", label: "Status" },
]

function Sidebar({
  activeTab,
  onChangeTab,
}: {
  activeTab: Tab
  onChangeTab: (tab: Tab) => void
}) {
  return (
    <div
      style={{
        width: 360,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.015)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {SIDEBAR_TABS.map(({ tab, icon, label }) => (
          <button
            key={tab}
            onClick={() => onChangeTab(tab)}
            style={{
              flex: "1 0 25%",
              padding: "8px 4px",
              border: "none",
              borderBottom:
                activeTab === tab
                  ? "2px solid #6688ff"
                  : "2px solid transparent",
              background:
                activeTab === tab
                  ? "rgba(100,140,255,0.1)"
                  : "transparent",
              color: "white",
              cursor: "pointer",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 0.3,
            }}
          >
            <div style={{ fontSize: 15 }}>{icon}</div>
            {label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {activeTab === "build" && <WorldPrompt />}
        {activeTab === "edit" && (
          <ComingSoonPanel
            icon="🛠"
            title="Edit World"
            description="Natural-language editing of an existing world — add a building, reassign a resident's role, adjust a resource — is planned for a future phase. World creation (Build tab) and the Stress scenarios are fully functional today."
          />
        )}
        {activeTab === "agents" && <AgentsPanel />}
        {activeTab === "director" && <DirectorPanel />}
        {activeTab === "stress" && <ChallengePanel />}
        {activeTab === "experiment" && (
          <ComingSoonPanel
            icon="🔬"
            title="Experiment"
            description="Branching what-if simulation forks (fork the world, try two interventions, compare outcomes) are planned for a future phase."
          />
        )}
        {activeTab === "status" && <StatusPanel />}
      </div>
    </div>
  )
}

function ComingSoonPanel({
  icon,
  title,
  description,
}: {
  icon: string
  title: string
  description: string
}) {
  return (
    <div>
      <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>
        {icon} {title}
      </h2>
      <div
        style={{
          padding: 14,
          borderRadius: 10,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          fontSize: 12,
          lineHeight: 1.5,
          opacity: 0.7,
        }}
      >
        {description}
      </div>
    </div>
  )
}

const OCCUPATION_ICON: Record<string, string> = {
  FARMER: "🌾",
  GATHERER: "🧺",
  BUILDER: "🔨",
  TRADER: "💰",
}

function AgentsPanel() {
  const entities = useWorldStore((state) => state.entities)
  const agentDetails = useWorldStore((state) => state.agentDetails)
  const agents = entities.filter((entity) => entity.type === "agent")

  const goalLabel: Record<string, string> = {
    FIND_FOOD: "🍎 Seeking food",
    FIND_WATER: "💧 Seeking water",
    REST: "🏠 Resting",
    WORK: "⚙️ Working",
    WANDER: "🚶 Exploring",
  }

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>
        👥 Agents
      </h2>
      <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 14 }}>
        {agents.length} resident{agents.length === 1 ? "" : "s"} — live
        needs, synced directly from Java.
      </div>

      {agents.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.5 }}>
          No agents yet. Build a world from the Build tab.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {agents.map((agent) => (
            <div
              key={agent.id}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                <span>
                  {OCCUPATION_ICON[agentDetails[agent.id]?.occupation ?? ""] ?? "👤"}{" "}
                  {agent.id}
                </span>
                <span style={{ opacity: 0.6, fontWeight: 400 }}>
                  {goalLabel[agent.goal ?? "WANDER"] ?? "🚶 Exploring"}
                </span>
              </div>

              {agentDetails[agent.id] && (
                <div style={{ fontSize: 9, opacity: 0.45, marginTop: 2 }}>
                  {agentDetails[agent.id].occupation} · $
                  {agentDetails[agent.id].money.toFixed(0)}
                </div>
              )}

              <div
                style={{
                  marginTop: 6,
                  display: "flex",
                  gap: 12,
                  fontSize: 10,
                  opacity: 0.6,
                }}
              >
                <span>Hunger {Math.round(agent.hunger ?? 0)}</span>
                <span>Energy {Math.round(agent.energy ?? 100)}</span>
                {typeof agent.thirst === "number" && (
                  <span>Thirst {Math.round(agent.thirst)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusPanel() {
  const time = useWorldStore((state) => state.time)
  const food = useWorldStore((state) => state.food)
  const water = useWorldStore((state) => state.water)
  const foodCapacity = useWorldStore((state) => state.foodCapacity)
  const waterCapacity = useWorldStore((state) => state.waterCapacity)
  const population = useWorldStore((state) => state.population)
  const entities = useWorldStore((state) => state.entities)

  const houses = entities.filter((e) => e.type === "house").length

  const healthy = food > 0 && water > 0

  return (
    <div>
      <h2 style={{ margin: "0 0 14px", fontSize: 16 }}>
        📊 Status
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        <StatBox
          label="Population"
          value={`${population}`}
          critical={false}
        />
        <StatBox
          label="Time"
          value={`${time.toFixed(0)}s`}
          critical={false}
        />
        <StatBox
          label="Food"
          value={`${food.toFixed(0)} / ${foodCapacity}`}
          critical={food <= 0}
        />
        <StatBox
          label="Water"
          value={`${water.toFixed(0)} / ${waterCapacity}`}
          critical={water <= 0}
        />
        <StatBox
          label="Housing"
          value={`${houses} / ${Math.ceil((population + 1) / 2)}`}
          critical={houses < Math.ceil((population + 1) / 2)}
        />
      </div>

      <div
        style={{
          marginTop: 14,
          padding: "10px 12px",
          borderRadius: 10,
          background: healthy
            ? "rgba(60,200,120,0.12)"
            : "rgba(220,60,60,0.15)",
          border: healthy
            ? "1px solid rgba(80,220,140,0.3)"
            : "1px solid rgba(255,90,90,0.4)",
          fontSize: 12,
          fontWeight: 700,
          color: healthy ? "#7cf0ae" : "#ff8080",
        }}
      >
        {healthy ? "● Stable" : "● Needs attention"}
      </div>
    </div>
  )
}

function StatBox({
  label,
  value,
  critical,
}: {
  label: string
  value: string
  critical: boolean
}) {
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: critical ? "#ff8080" : "white",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 9, opacity: 0.45, marginTop: 2 }}>
        {label}
      </div>
    </div>
  )
}

export default App
