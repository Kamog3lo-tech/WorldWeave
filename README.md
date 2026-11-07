# WorldWeave

WorldWeave is a browser based 3D settlement simulation. Java owns simulation state and NPC behavior, React and Three.js render the world, and the Python AI Director recommends or performs bounded interventions.

## Services

- Frontend: React, TypeScript, Vite at `http://localhost:5173`
- Simulation API: Java at `http://localhost:8080`
- AI Director API: FastAPI at `http://localhost:8000`

Java is the source of truth for agents, needs, resources, buildings, and simulation time. The Director uses deterministic rules when its optional Groq integration is unavailable. Food and water crises can be stabilized autonomously within Java's resource caps. Housing construction requires user approval. Actions are verified against the returned Java world state.

## Requirements

- A JDK with `java` and `javac` on `PATH`
- Node.js and npm
- Python 3.11 or newer

## Install dependencies

From the project root, install frontend dependencies:

```powershell
npm ci
```

Install the Python service dependencies in a virtual environment:

```powershell
cd backend\python
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
cd ..\..
```

The Groq integration is optional. To enable it in the current PowerShell session, set the key without saving it in the project:

```powershell
$env:GROQ_API_KEY = "your-key"
$env:GROQ_MODEL = "openai/gpt-oss-120b"
```

Without `GROQ_API_KEY`, the Director uses deterministic rules.

## Start manually

Compile and start Java in one terminal:

```powershell
cd backend\java
New-Item -ItemType Directory -Force out | Out-Null
javac -d out src\worldweave\*.java
java -cp out worldweave.Main
```

Start the Python Director in another terminal:

```powershell
cd backend\python
.\.venv\Scripts\Activate.ps1
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Start the frontend in a third terminal from the project root:

```powershell
npm run dev -- --host localhost
```

Open `http://localhost:5173`.

## Windows launcher

Run `Run.bat` from Explorer or a terminal. It checks the required tools and installed dependencies, compiles the Java backend from source, then opens separate windows for Java, Python, and Vite. It does not install dependencies automatically. If a dependency check fails, follow the install steps above and run it again.

## Build checks

```powershell
npm run build
```

```powershell
cd backend\python
python -m py_compile main.py
```

```powershell
cd backend\java
javac -d out src\worldweave\*.java
```

The Stress tab can trigger food, water, housing, and population scenarios for a demonstration. Keep the Director panel open to show autonomous recovery, approval requests, and verification.
