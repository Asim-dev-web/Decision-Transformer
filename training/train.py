import torch
import torch.nn as nn
from torch.utils.data import DataLoader, random_split
from core.model import DecisionTransformer
from training.dataset_loading import SequenceDataset

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Training on {device}...")

dataset = SequenceDataset("training/lunar_lander_dataset.pt", context_len=20)

train_size = int(0.8 * len(dataset))
val_size = len(dataset) - train_size
train_dataset, val_dataset = random_split(dataset, [train_size, val_size])

train_loader = DataLoader(train_dataset, batch_size=64, shuffle=True)
val_loader = DataLoader(val_dataset, batch_size=64, shuffle=False)

model = DecisionTransformer(
    state_dim=8, 
    act_dim=2, 
    embed_dim=128, 
    max_ep_len=1000, 
    num_blocks=3, 
    heads=4
).to(device)

optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)
loss_fn = nn.MSELoss()

epochs = 50
best_val_loss = float('inf')

for epoch in range(epochs):
    model.train()
    train_loss = 0
    
    for s, a, rtg, t in train_loader:
        s = s.to(device)
        a = a.to(device)
        rtg = rtg.to(device)
        t = t.to(device)
        
        action_preds = model(s, a, rtg, t)
        loss = loss_fn(action_preds, a)
        
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        train_loss += loss.item()
        
    model.eval()
    val_loss = 0
    
    with torch.no_grad():
        for s, a, rtg, t in val_loader:
            s = s.to(device)
            a = a.to(device)
            rtg = rtg.to(device)
            t = t.to(device)
            
            action_preds = model(s, a, rtg, t)
            loss = loss_fn(action_preds, a)
            
            val_loss += loss.item()
            
    avg_train_loss = train_loss / len(train_loader)
    avg_val_loss = val_loss / len(val_loader)
    
    print(f"Epoch {epoch+1} | Train Loss: {avg_train_loss:.4f} | Val Loss: {avg_val_loss:.4f}")
    
    if avg_val_loss < best_val_loss:
        best_val_loss = avg_val_loss
        torch.save(model.state_dict(), "core/dt_lunar_lander.pth")