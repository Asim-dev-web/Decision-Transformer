import torch
from torch.utils.data import Dataset, DataLoader

class SequenceDataset(Dataset):
    def __init__(self, data_path, context_len=20):
        self.data = torch.load(data_path)
        self.context_len = context_len
        self.num_episodes = len(self.data["states"])
        
    def __len__(self):
        return self.num_episodes * 5
        
    def __getitem__(self, idx):
        ep_idx = torch.randint(0, self.num_episodes, (1,)).item()
        ep_len = self.data["states"][ep_idx].shape[0]
        
        max_start = max(1, ep_len - self.context_len)
        start_t = torch.randint(0, max_start, (1,)).item()
        
        end_t = start_t + self.context_len
        
        s = self.data["states"][ep_idx][start_t:end_t]
        a = self.data["actions"][ep_idx][start_t:end_t]
        rtg = self.data["returns_to_go"][ep_idx][start_t:end_t] / 200.0
        t = self.data["timesteps"][ep_idx][start_t:end_t]
        
        if s.shape[0] < self.context_len:
            pad_len = self.context_len - s.shape[0]
            
            s = torch.cat([s, torch.zeros(pad_len, s.shape[1])])
            a = torch.cat([a, torch.zeros(pad_len, a.shape[1])])
            rtg = torch.cat([rtg, torch.zeros(pad_len, 1)])
            t = torch.cat([t, torch.zeros(pad_len, dtype=torch.long)])
            
        return s, a, rtg, t