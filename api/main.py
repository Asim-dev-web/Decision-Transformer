import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import gymnasium as gym
import numpy as np
import torch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.model import DecisionTransformer

app = FastAPI(title="Lunar Lander DT API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

device = "cpu"
model = DecisionTransformer(
    state_dim=8, act_dim=2, embed_dim=128, max_ep_len=1000, num_blocks=3, heads=4
).to(device)
model.load_state_dict(torch.load("core/dt_lunar_lander.pth", map_location=device))
model.eval()

class SimulationRequest(BaseModel):
    target_return: float

@app.get("/api/health")
@app.get("/health")
def health_check():
    return {"status": "alive"}

@app.post("/simulate")
def simulate(request: SimulationRequest):
    env = gym.make("LunarLander-v3", continuous=True)
    state, _ = env.reset()

    target_return = request.target_return / 200.0
    context_len = 20

    states = [state]
    actions = [np.zeros(2)]
    returns_to_go = [target_return]
    timesteps = [0]

    frames = []
    total_reward = 0.0
    step = 0
    done = False
    truncated = False

    while not (done or truncated):
        s = torch.tensor(np.array(states[-context_len:]), dtype=torch.float32).unsqueeze(0).to(device)
        a = torch.tensor(np.array(actions[-context_len:]), dtype=torch.float32).unsqueeze(0).to(device)
        rtg = torch.tensor(np.array(returns_to_go[-context_len:]), dtype=torch.float32).unsqueeze(0).unsqueeze(-1).to(device)
        t = torch.tensor(np.array(timesteps[-context_len:]), dtype=torch.long).unsqueeze(0).to(device)

        with torch.no_grad():
            action_preds = model(s, a, rtg, t)

        current_action = action_preds[0, -1, :].numpy()
        next_state, reward, done, truncated, _ = env.step(current_action)

        frames.append({
            "step": step,
            "x": float(state[0]),
            "y": float(state[1]),
            "vx": float(state[2]),
            "vy": float(state[3]),
            "angle": float(state[4]),
            "angular_velocity": float(state[5]),
            "left_leg": float(state[6]),
            "right_leg": float(state[7]),
            "main_thrust": float(current_action[0]),
            "side_thrust": float(current_action[1]),
            "reward": float(reward)
        })

        step += 1
        total_reward += float(reward)
        target_return -= float(reward) / 200.0

        states.append(next_state)
        actions[-1] = current_action
        actions.append(np.zeros(2))
        returns_to_go.append(target_return)
        timesteps.append(step)
        state = next_state

    env.close()

    status = "completed"
    if done:
        if reward >= 100:
            status = "landed"
        elif reward <= -100:
            status = "crashed"

    return {
        "target_return": request.target_return,
        "total_reward": round(total_reward, 2),
        "steps": step,
        "status": status,
        "trajectory": frames
    }