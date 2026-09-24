# Decision Transformer for Continuous Control (Lunar Lander)

An offline reinforcement learning model that reformulates continuous control in OpenAI Gymnasium's `LunarLanderContinuous-v2` as conditional sequence modeling.

Instead of computing value functions (Q-learning) or calculating policy gradients (PPO/SAC), this architecture utilizes an autoregressive decoder-only Transformer to model joint distributions over sequences of returns-to-go, states, and actions. At inference time, the model generates continuous thrust actions conditioned on a desired target return.

---

## 1. Formulation: Reinforcement Learning as Sequence Modeling

Traditional RL optimizes for expected cumulative reward:

$$\max_{\pi} \mathbb{E}_{\tau \sim \pi} \left[ \sum_{t=0}^{T} r_t \right]$$

The Decision Transformer drops temporal difference backups and value estimations entirely. A trajectory is represented as a sequence of three interleaved modalities: Return-to-Go ($\hat{R}$), State ($s$), and Action ($a$):

$$\tau = \left( \hat{R}_1, s_1, a_1, \hat{R}_2, s_2, a_2, \dots, \hat{R}_T, s_T, a_T \right)$$

Where Return-to-Go represents the sum of future rewards from timestep $t$ until the end of the episode:

$$\hat{R}_t = \sum_{t'=t}^{T} r_{t'}$$

During execution, action generation simplifies to conditional autoregressive modeling:

$$a_t = \arg\max_a P\left(a \mid \tau_{<t}, \hat{R}_t, s_t\right)$$

To achieve optimal behavior, we prompt the model with a high initial return ($\hat{R}_0 \ge +200$) and let it emit actions consistent with expert performance.

---

## 2. Model Architecture

The core network (`core/model.py`) is an autoregressive decoder Transformer operating over a context window of length $K = 20$ timesteps (60 tokens).

### Multimodal Token Embedding
Because the modalities have mismatched raw dimensions, each input is linearly projected into a shared latent dimension $d_{\text{model}} = 128$:

* **Return-to-Go:** Linear projection $\mathbb{R}^1 \to \mathbb{R}^{128}$
* **State Space:** Linear projection $\mathbb{R}^8 \to \mathbb{R}^{128}$ (coordinates, linear velocities, angle, angular velocity, ground contact flags)
* **Action Space:** Linear projection $\mathbb{R}^2 \to \mathbb{R}^{128}$ (continuous main and lateral engine thrust)

### Global Timestep Embedding
Unlike standard NLP models where positional encodings represent token index in the context buffer, the Decision Transformer uses **global episode timestep embeddings**.

Because $\hat{R}_t$, $s_t$, and $a_t$ correspond to the exact same physical instant, all three tokens receive the identical timestep embedding vector $e_t \in \mathbb{R}^{128}$:

$$z_{\hat{R}_t} = \text{Embed}_R(\hat{R}_t) + e_t$$
$$z_{s_t} = \text{Embed}_s(s_t) + e_t$$
$$z_{a_t} = \text{Embed}_a(a_t) + e_t$$

Tokens are interleaved chronologically:

$$Z = \left[ z_{\hat{R}_1}, z_{s_1}, z_{a_1}, z_{\hat{R}_2}, z_{s_2}, z_{a_2}, \dots, z_{\hat{R}_t}, z_{s_t} \right]$$

### Causal Masking & Attention Pattern
The sequence is passed through stacked Multi-Head Self-Attention layers:

$$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}} + M\right)V$$

To prevent the model from attending to future transitions or looking ahead at action $a_t$ before generating it, a lower-triangular causal mask $M$ is enforced:

$$M_{i,j} = \begin{cases} 0 & j \le i \\ -\infty & j > i \end{cases}$$

Under this causal structure, the state token $z_{s_t}$ attends strictly to:
* All past returns, states, and actions: $\hat{R}_{1:t-1}, s_{1:t-1}, a_{1:t-1}$
* The current target return: $\hat{R}_t$
* The current environment state: $s_t$

### Continuous Action Prediction Head
The transformer outputs hidden states $h \in \mathbb{R}^{3K \times 128}$. The hidden state corresponding to the current state token $h_{s_t}$ is sliced out and passed through a raw linear projection without non-linear activations:

$$\hat{a}_t = W_a h_{s_t} + b_a$$

Action bounds and continuous values are learned directly via regression against the target continuous action vectors using Mean Squared Error (MSE) loss:

$$\mathcal{L}_{\text{MSE}} = \frac{1}{\vert{}B\vert{}} \sum_{i \in B} \Vert{}\hat{a}_t^{(i)} - a_t^{(i)}\Vert{}_2^2$$

---

## 3. Offline Dataset Pipeline

Decision Transformers require diverse offline datasets spanning both expert and sub-optimal trajectories so the model learns the structural relationship between conditioned returns and generated control policies.

* **Trajectory Collection (`training/dataset_creation.py`):** Runs rollouts in `LunarLanderContinuous-v2` across various behavioral checkpoints to capture an unbiased distribution of states, continuous control inputs, and terminal landing rewards.
* **Return-to-Go Processing (`training/dataset_loading.py`):** Trajectories are processed in reverse ($T \to 0$) to compute cumulative returns at every timestep. Sequences are batched, sliced into context windows of length $K$, and padded.
* **Dataset Artifact (`training/lunar_lander_dataset.pt`):** Serialized PyTorch tensor dataset containing pre-computed states, actions, returns-to-go, timesteps, and causal masks.

---

## 4. Closed-Loop Inference Loop

At evaluation time, the environment provides observations sequentially. The rollout loop maintains a sliding context buffer:

1. **Initialize:** Condition the context buffer with the requested Target Return $\hat{R}_0$ (e.g., $200.0$) and initial environment state $s_0$.
2. **Predict:** Pass the context window $\tau_{t-K:t}$ through the Transformer. Slice out the output corresponding to $s_t$ to retrieve action vector $\hat{a}_t = [\text{main thrust}, \text{side thrust}]$.
3. **Step Environment:** Execute $\hat{a}_t$ in the environment, observe step reward $r_t$ and next state $s_{t+1}$.
4. **Update Return-to-Go:** Compute the remaining target return:
   $$\hat{R}_{t+1} = \hat{R}_t - r_t$$
5. **Shift Context:** Append $\hat{R}_{t+1}$ and $s_{t+1}$ to the context tensor. If sequence length exceeds context limit $K$, slide the window forward by dropping the oldest transition.

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

Open `http://localhost:5173` to access the mission control dashboard. Adjust the Return-to-Go slider from $-200$ (conditioned crash) to $+250$ (conditioned soft landing) to observe how the transformer dynamically adapts its control policy based on return conditioning.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.