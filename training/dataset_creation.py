import gymnasium as gym
import torch
import numpy as np

def heuristic_expert(state):
    angle_targ = state[0] * 0.5 + state[2] * 1.0
    angle_targ = np.clip(angle_targ, -0.4, 0.4)
    
    hover_targ = 0.55 * np.abs(state[0])
    
    angle_todo = (angle_targ - state[4]) * 0.5 - state[5] * 1.0
    hover_todo = (hover_targ - state[1]) * 0.5 - state[3] * 0.5
    
    if state[6] or state[7]:
        angle_todo = 0.0
        hover_todo = -(state[3]) * 0.5
        
    main_engine = (hover_todo * 20.0) - 1.0
    side_engine = -angle_todo * 20.0
    
    return np.clip(np.array([main_engine, side_engine], dtype=np.float32), -1.0, 1.0)

def generate_offline_dataset(num_episodes, save_path):
    env = gym.make("LunarLander-v3", continuous=True)
    
    dataset = {
        "states": [],
        "actions": [],
        "returns_to_go": [],
        "timesteps": []
    }
    
    for episode in range(num_episodes):
        state, _ = env.reset()
        
        ep_states = []
        ep_actions = []
        ep_rewards = []
        
        skill_level = np.random.choice([0, 1, 2, 3], p=[0.15, 0.30, 0.30, 0.25])
        
        done = False
        truncated = False
        
        while not (done or truncated):
            if skill_level == 0:
                action = env.action_space.sample()
            else:
                action = heuristic_expert(state)
                if skill_level == 1:
                    action += np.random.normal(0, 0.7, size=action.shape).astype(np.float32)
                elif skill_level == 2:
                    action += np.random.normal(0, 0.25, size=action.shape).astype(np.float32)
                elif skill_level == 3:
                    action += np.random.normal(0, 0.02, size=action.shape).astype(np.float32)
                action = np.clip(action, -1.0, 1.0)
                
            next_state, reward, done, truncated, _ = env.step(action)
            
            ep_states.append(state)
            ep_actions.append(action)
            ep_rewards.append(reward)
            
            state = next_state
            
        ep_returns_to_go = []
        current_return = 0.0
        
        for r in reversed(ep_rewards):
            current_return += r
            ep_returns_to_go.insert(0, current_return)
            
        ep_timesteps = list(range(len(ep_states)))
        
        dataset["states"].append(torch.tensor(np.array(ep_states), dtype=torch.float32))
        dataset["actions"].append(torch.tensor(np.array(ep_actions), dtype=torch.float32))
        dataset["returns_to_go"].append(torch.tensor(np.array(ep_returns_to_go), dtype=torch.float32).unsqueeze(-1))
        dataset["timesteps"].append(torch.tensor(np.array(ep_timesteps), dtype=torch.long))

    torch.save(dataset, save_path)
    print(f"Successfully generated dataset with {num_episodes} episodes.")
    env.close()

if __name__ == "__main__":
    generate_offline_dataset(num_episodes=2000, save_path="lunar_lander_dataset.pt")