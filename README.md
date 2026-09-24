# Decision Transformer for Continuous Control (Lunar Lander)

An offline reinforcement learning model that reformulates continuous control in OpenAI Gymnasium's `LunarLanderContinuous-v2` as conditional sequence modeling.

Instead of computing value functions (Q-learning) or calculating policy gradients (PPO/SAC), this architecture utilizes an autoregressive decoder-only Transformer to model joint distributions over sequences of returns-to-go, states, and actions. At inference time, the model generates continuous thrust actions conditioned on a desired target return.

---

## 1. Formulation: Reinforcement Learning as Sequence Modeling

Traditional RL algorithms optimize for expected cumulative reward by assigning values to specific states. The Decision Transformer drops value estimation entirely. 

Instead, a trajectory is represented as a flat sequence of three interleaved modalities:
`[Return_1, State_1, Action_1, Return_2, State_2, Action_2, ..., Return_T, State_T, Action_T]`

* **Return-to-Go (RTG):** The sum of all future rewards from the current timestep until the end of the episode.
* **State:** The environment observation at that step.
* **Action:** The action taken at that step.

During execution, action generation simplifies to a standard autoregressive prediction task: the model looks at the past sequence, the current state, and the target return it needs to achieve, and predicts the exact action required to stay on track. To achieve optimal behavior, we simply prompt the model with a high initial return (e.g., 200) and let it emit actions consistent with a perfect landing.

---

## 2. Model Architecture

The core network (`core/model.py`) is an autoregressive decoder Transformer operating over a context window of 20 timesteps (60 total tokens).

### Multimodal Token Embedding
Because the modalities have mismatched raw dimensions, each input is passed through its own linear layer to project it into a shared 128-dimensional embedding space:
* **Return-to-Go:** 1D scalar -> 128D vector
* **State Space:** 8D vector -> 128D vector (coordinates, velocities, angle, angular velocity, ground contact flags)
* **Action Space:** 2D vector -> 128D vector (continuous main and lateral engine thrust)

### Global Timestep Embedding
Unlike standard NLP models where positional encodings represent a token's index in a sentence, the Decision Transformer uses **global episode timestep embeddings**.

Because the Return, State, and Action at step 5 all correspond to the exact same physical instant in time, all three tokens receive the identical timestep embedding vector. 

### Causal Masking & Attention Pattern
The sequence is passed through stacked Multi-Head Self-Attention layers. 

To prevent the model from "cheating" by attending to future transitions—or looking ahead at the action it is supposed to generate—a standard lower-triangular causal mask is enforced. When predicting the next action, the state token can only attend to past transitions, the current target return, and the current state observation.

### Continuous Action Prediction Head
The transformer outputs a sequence of hidden states. The hidden state corresponding to the current state token is sliced out and passed through a raw linear projection layer to output the 2D continuous action vector.

Action bounds and continuous values are learned directly via regression against the offline dataset using a standard Mean Squared Error (MSE) loss.

---

## 3. Offline Dataset Pipeline

Decision Transformers require diverse offline datasets spanning both expert and sub-optimal trajectories so the model learns the structural relationship between conditioned returns (crashes vs. safe landings) and control policies.

* **Trajectory Collection (`training/dataset_creation.py`):** Runs rollouts in `LunarLanderContinuous-v2` across various behavioral checkpoints to capture an unbiased distribution of states, continuous control inputs, and terminal landing rewards.
* **Return-to-Go Processing (`training/dataset_loading.py`):** Trajectories are processed in reverse to compute cumulative returns at every timestep. Sequences are batched, sliced into context windows of length 20, and padded.
* **Dataset Artifact (`training/lunar_lander_dataset.pt`):** Serialized PyTorch tensor dataset containing pre-computed states, actions, returns-to-go, timesteps, and causal masks.

---

## 4. Closed-Loop Inference Loop

At evaluation time, the environment provides observations sequentially. The rollout loop maintains a sliding context buffer:

1. **Initialize:** Condition the context buffer with the requested Target Return (e.g., 200.0) and initial environment state.
2. **Predict:** Pass the context window through the Transformer. Slice out the output corresponding to the current state to retrieve the action vector `[main_thrust, side_thrust]`.
3. **Step Environment:** Execute the action in the environment, observe the step reward and next state.
4. **Update Return-to-Go:** Subtract the step reward from the current Target Return to calculate the new remaining Return-to-Go.
5. **Shift Context:** Append the new Return-to-Go and State to the context tensor. Slide the window forward if it exceeds the maximum context length.

---

## 5. Repository Layout

```text
.
├── api/
│   └── main.py                 # FastAPI inference service exposing POST /simulate
├── core/
│   ├── dt_lunar_lander.pth     # Trained PyTorch Decision Transformer checkpoint
│   └── model.py                # PyTorch architecture (embeddings, causal attention, linear action head)
├── frontend/
│   ├── src/                    # React + Vite retro vector visualizer (60 FPS Canvas HUD)
│   ├── package.json
│   └── vite.config.js
├── training/
│   ├── dataset_creation.py     # Trajectory sampling across performance tiers
│   ├── dataset_loading.py      # Sequence batching, padding, and RTG computation
│   ├── lunar_lander_dataset.pt # Offline training trajectory dataset
│   └── train.py                # Autoregressive training loop and loss tracking
├── .gitignore
├── Dockerfile                  # Container build file for the inference API
├── LICENSE                     # MIT License
├── play.py                     # Standalone local rollout and evaluation script
├── README.md
└── requirements.txt            # Core dependencies (torch, gymnasium, fastapi, uvicorn)
```

---

## 6. Getting Started

### Installation

Clone the repository and set up a Python virtual environment:

```bash
git clone [https://github.com/](https://github.com/)<username>/decision-transformer.git
cd decision-transformer

python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Model Training

To retrain the Decision Transformer from the offline dataset:

```bash
python training/train.py
```

The script trains the autoregressive sequence head over `training/lunar_lander_dataset.pt` and exports weights to `core/dt_lunar_lander.pth`.

### Local Inference & Rollout

Run a rollout in Gymnasium to evaluate the model locally:

```bash
python play.py
```

---

## 7. Serving & Visualization

The repository includes a lightweight inference API and a decoupled HTML5 canvas visualizer.

### 1. Launch Inference API (FastAPI)

Run via Docker:
```bash
docker build -t lunar-lander-api .
docker run -p 8000:8000 lunar-lander-api
```

Or run directly with Uvicorn:
```bash
uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload
```

The service exposes `POST /simulate`, which accepts a JSON payload `{"target_return": 200.0}`, executes the closed-loop Decision Transformer rollout, and streams back trajectory frames.

### 2. Launch Visualizer (React + Canvas)

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` to access the mission control dashboard. Adjust the Return-to-Go slider from -200 (conditioned crash) to +250 (conditioned soft landing) to observe how the transformer dynamically adapts its control policy based on return conditioning.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.