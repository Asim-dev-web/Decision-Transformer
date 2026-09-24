# Decision Transformer: Lunar Lander

This is a PyTorch implementation of a Decision Transformer solving the continuous Lunar Lander environment. 

Standard RL algorithms like PPO or SAC optimize policies by calculating expected future rewards. This project takes a different approach by treating reinforcement learning purely as a sequence modeling problem. You prompt the transformer with a target score, and it outputs the actions needed to get that score.

## How It Works

The model doesn't estimate values. It processes a flat sequence of three variables: `[Return_to_Go, State, Action, ...]`

* **Return-to-Go (RTG):** The total reward left to achieve in the episode.
* **State:** The 8D observation vector from the environment.
* **Action:** The 2D continuous thrust vector.

At inference time, you give the model the current environment state and the return you want it to achieve (e.g., 200 for a perfect landing). The transformer looks at the past context and predicts the exact engine thrust needed to hit that target.

## Architecture Details

The core model is a causal decoder-only transformer with a context window of 20 timesteps. 

* **Embeddings:** Return, State, and Action have different dimensions. They are each passed through their own linear layer to project them into a shared 128D space.
* **Timesteps:** Since a Return, State, and Action all happen at the exact same moment in the environment, all three tokens get the exact same global timestep embedding.
* **Masking:** A standard causal mask is applied. The model can only attend to past transitions and the current state to predict the next action.
* **Action Head:** The output hidden state for the current state token is passed through a basic linear layer to predict the 2D action. It learns this via simple MSE loss against the offline dataset.

## The Offline Dataset

Decision Transformers learn from offline data. They need to see both crashes and successful landings to understand the relationship between actions and final returns.

The dataset pipeline handles this:
1. `dataset_creation.py` runs rollouts in the environment using different policies to collect a mix of good and bad trajectories.
2. `dataset_loading.py` processes these trajectories backwards to calculate the cumulative Return-to-Go at every single step. It batches everything into sequences of 20 timesteps.

## Repository Structure

    .
    ├── api/
    │   └── main.py                 # FastAPI backend
    ├── core/
    │   ├── dt_lunar_lander.pth     # Trained PyTorch weights
    │   └── model.py                # Transformer architecture
    ├── frontend/
    │   ├── src/                    # React and Canvas visualizer
    │   ├── package.json
    │   └── vite.config.js
    ├── training/
    │   ├── dataset_creation.py     # Script to generate rollouts
    │   ├── dataset_loading.py      # Dataloader and RTG math
    │   ├── lunar_lander_dataset.pt # Saved offline dataset
    │   └── train.py                # Training loop
    ├── .gitignore
    ├── Dockerfile                  # API container setup
    ├── LICENSE                     
    ├── play.py                     # Local rollout test script
    ├── README.md
    └── requirements.txt            

## Setup and Usage

### 1. Install Dependencies
Clone the repo and set up your Python environment:

    git clone https://github.com/<username>/decision-transformer.git
    cd decision-transformer
    python -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt

### 2. Train the Model
If you want to train the model from scratch using the provided dataset script:

    python training/train.py

This will save the new weights to `core/dt_lunar_lander.pth`.

### 3. Run a Local Test
You can watch the model play the game directly in your terminal using Gymnasium's renderer:

    python play.py

## Running the Web Dashboard

The project includes a web dashboard to visualize the model in real-time. It uses a decoupled HTML5 Canvas loop in React to render 60 FPS without blocking the UI thread.

**Start the API:**
You can run the FastAPI backend using Docker:

    docker build -t lunar-lander-api .
    docker run -p 8000:8000 lunar-lander-api

*(Or run it locally with `uvicorn api.main:app --reload`)*

**Start the Frontend:**
Open a new terminal and run the React app:

    cd frontend
    npm install
    npm run dev

Open `http://localhost:5173`. You can use the slider to change the target return on the fly. Setting it to -200 will make the model intentionally crash, while setting it to +200 will make it land smoothly.

## License
MIT License