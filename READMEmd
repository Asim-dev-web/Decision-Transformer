# Decision Transformer: Lunar Lander

An offline reinforcement learning implementation that frames the continuous Lunar Lander control problem as autoregressive sequence modeling. The system conditions on a user-specified Target Return-to-Go (RTG) to generate trajectory actions, served via a FastAPI inference backend and visualized through an interactive HTML5 Canvas flight deck.

---

## Overview

Unlike standard reinforcement learning algorithms that optimize policy or value functions using temporal difference updates (such as PPO or SAC), the Decision Transformer casts policy execution as conditional sequence generation.

During inference, the model is prompted with an initial target return R_0, an initial environment state S_0, and an initial action prompt. At each subsequent environment step t, the backend updates the remaining return:

R_{t+1} = R_t - r_t

The Transformer processes the interleaved context sequence:

tau = (R_1, S_1, A_1, R_2, S_2, A_2, ..., R_t, S_t)

Using a causal attention mask, the network outputs continuous action predictions (main thrust, side thrust) conditioned on achieving the requested trajectory return.

---

## Architecture and Key Specifications

### 1. Model Backbone (PyTorch)
* Token Embeddings: Modality-specific linear projections mapping scalar Return-to-Go, state vector (R^8), and continuous action vector (R^2) into a shared 128-dimensional embedding space.
* Timestep Embeddings: Global episode step embeddings shared equally across (R_t, S_t, A_t) at each time step.
* Causal Transformer: Multi-head self-attention with lower-triangular causal masking to enforce strictly autoregressive sequence generation.
* Continuous Action Head: Linear projection on the S_t hidden state, trained with Mean Squared Error (MSE) loss against offline expert and sub-optimal trajectories.

### 2. Backend Service (FastAPI & Docker)
* Exposes `POST /simulate` to accept a specified `target_return`.
* Executes the closed-loop rollout against the OpenAI Gymnasium `LunarLanderContinuous-v2` / `v3` environment.
* Returns structured frame-by-frame telemetry arrays (coordinates, angles, velocities, engine states, rewards, step termination flags).
* Packaged in a lightweight Docker container for uniform execution.

### 3. Frontend & Visualizer (React, Vite, HTML5 Canvas)
* Real-time vector-style canvas rendering decoupled from React state updates to maintain a stable 60 FPS animation loop without UI thread blocking.
* Interactive Target Return slider allowing real-time trajectory comparison between sub-optimal returns (e.g., negative or low RTG) and clean landing trajectories (e.g., +200 to +250 RTG).
* Integrated telemetry HUD displaying altitude, vertical/horizontal velocity, and thrust vectors.

---

## Repository Structure

```text
.
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI service and /simulate endpoint
│   │   ├── model.py             # Decision Transformer PyTorch architecture
│   │   └── rollout.py           # Closed-loop evaluation and rollout loop
│   ├── weights/                 # Model checkpoints (.pt)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── SimCanvas.jsx    # 60 FPS vector renderer and animation loop
│   │   │   ├── TelemetryHUD.jsx # Flight metrics and status displays
│   │   │   └── Controls.jsx     # Return slider and trigger actions
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── .gitignore
├── LICENSE
└── README.md
```

---

## Getting Started

### Prerequisites

* Docker and Docker Compose (recommended), OR Python 3.10+
* Node.js (v18+) and npm

---

### Backend Setup

#### Option A: Running via Docker (Recommended)

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Build the Docker image:
   ```bash
   docker build -t lunar-lander-api .
   ```

3. Run the container:
   ```bash
   docker run -p 8000:8000 lunar-lander-api
   ```

The API will be available at `http://127.0.0.1:8000`. You can inspect endpoints and test queries directly via Swagger documentation at `http://127.0.0.1:8000/docs`.

#### Option B: Running Locally with Python

1. Navigate to the backend directory and set up a virtual environment:
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Start the FastAPI server:
   ```bash
   uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```

---

### Frontend Setup

1. Open a separate terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Vite development server:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:5173` in your browser.

---

## API Reference

### `POST /simulate`

Runs an autoregressive rollout loop conditioned on the requested Target Return.

**Request Payload:**
```json
{
  "target_return": 200.0
}
```

**Response Format:**
```json
{
  "status": "LANDED",
  "total_reward": 218.4,
  "steps": 142,
  "frames": [
    {
      "step": 0,
      "x": 0.012,
      "y": 1.402,
      "vx": -0.05,
      "vy": -0.12,
      "angle": 0.02,
      "angular_velocity": 0.01,
      "main_thrust": 0.78,
      "side_thrust": -0.12,
      "reward": 0.45,
      "rtg": 200.0
    }
  ]
}
```

---

## Technical Details: Decoupled Canvas Rendering

To maintain smooth frame delivery and avoid input latency, the frontend isolates the rendering loop from React state:

* React handles outer UI state (input sliders, connection indicators, mission configuration).
* High-frequency telemetry updates (velocity, coordinates, frame stepping) are painted directly to the Canvas via `requestAnimationFrame` context calls rather than triggering React component reconciliations on every frame.
* CSS rules avoid expensive real-time filter overlays like full-viewport `backdrop-filter` or cumulative `drop-shadow`, preserving frame rates on integrated GPUs.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.