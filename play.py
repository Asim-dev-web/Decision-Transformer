import torch
import gymnasium as gym
import numpy as np
from core.model import DecisionTransformer

device = "cuda" if torch.cuda.is_available() else "cpu"

env = gym.make("LunarLander-v3", continuous=True, render_mode="human")

model = DecisionTransformer(
    state_dim=8, 
    act_dim=2, 
    embed_dim=128, 
    max_ep_len=1000, 
    num_blocks=3, 
    heads=4
).to(device)

model.load_state_dict(torch.load("core/dt_lunar_lander.pth", map_location=device))
model.eval()

context_len = 20
episodes_to_play = 5

for episode in range(episodes_to_play):
    state, _ = env.reset()
    
    target_return = 300.0/200.0
    
    states = [state]
    actions = [np.zeros(2)] 
    returns_to_go = [target_return]
    timesteps = [0]
    
    done = False
    truncated = False
    step = 0
    total_reward = 0
    
    while not (done or truncated):
        s = torch.tensor(np.array(states[-context_len:]), dtype=torch.float32).unsqueeze(0).to(device)
        a = torch.tensor(np.array(actions[-context_len:]), dtype=torch.float32).unsqueeze(0).to(device)
        rtg = torch.tensor(np.array(returns_to_go[-context_len:]), dtype=torch.float32).unsqueeze(0).unsqueeze(-1).to(device)
        t = torch.tensor(np.array(timesteps[-context_len:]), dtype=torch.long).unsqueeze(0).to(device)
        
        with torch.no_grad():
            action_preds = model(s, a, rtg, t)
            
        current_action = action_preds[0, -1, :].cpu().numpy()
        
        next_state, reward, done, truncated, _ = env.step(current_action)
        
        step += 1
        total_reward += reward
        target_return -= reward/200.00
        
        states.append(next_state)
        actions[-1] = current_action 
        actions.append(np.zeros(2))  
        returns_to_go.append(target_return)
        timesteps.append(step)

    print(f"Episode {episode + 1} finished with Total Reward: {total_reward:.2f}")

env.close()