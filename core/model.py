import torch
import torch.nn as nn

class DecisionTransformer(nn.Module):
    def __init__(self, state_dim, act_dim, embed_dim, max_ep_len, num_blocks, heads):
        super().__init__()
        self.embed_state = nn.Linear(state_dim, embed_dim)
        self.embed_action = nn.Linear(act_dim, embed_dim)
        self.embed_return = nn.Linear(1, embed_dim)
        self.embed_timestep = nn.Embedding(max_ep_len, embed_dim)
        self.blocks = nn.ModuleList([Block(max_ep_len * 3, embed_dim, heads) for _ in range(num_blocks)])
        self.ln_f = nn.LayerNorm(embed_dim)
        self.predict_action = nn.Linear(embed_dim, act_dim)
        
    def forward(self, state, action, return_to_go, timestep):
        timestep_embed = self.embed_timestep(timestep)
        
        state = self.embed_state(state)
        state_position = state + timestep_embed
        
        action = self.embed_action(action)
        action_position = action + timestep_embed
        
        return_to_go = self.embed_return(return_to_go)
        return_to_go_position = return_to_go + timestep_embed
        
        B, T, C = state.shape
        
        combined_embed = torch.stack([return_to_go_position, state_position, action_position],dim=2)
        combined_embed = combined_embed.reshape(B,T*3,C)
        
        for block in self.blocks:
            combined_embed = block(combined_embed)
    
        combined_embed = self.ln_f(combined_embed)
        state_embeddings = combined_embed[:,1::3,:]
        action_preds = self.predict_action(state_embeddings)
        
        return action_preds
        
        
class Attention(nn.Module):
    def __init__(self, context_len, d_model, heads):
        super().__init__()
        self.heads = heads
        
        self.query = nn.Linear(d_model, d_model)
        self.key = nn.Linear(d_model, d_model)
        self.val = nn.Linear(d_model, d_model)
        
        self.out_proj = nn.Linear(d_model, d_model)
        
        mask = torch.tril(torch.ones(context_len, context_len))
        self.register_buffer("mask", mask, persistent=False)
        
    def forward(self, x):
        B, T, C = x.shape
        
        Q = self.query(x)
        Q = Q.reshape(B, T, self.heads, C//self.heads).transpose(1,2)
        
        K = self.key(x)
        K = K.reshape(B, T, self.heads, C//self.heads).transpose(1,2)
        
        V = self.val(x)
        V = V.reshape(B, T, self.heads, C//self.heads).transpose(1,2)
        
        scores = Q @ K.transpose(-2, -1)
        scores = scores / (C//self.heads) ** 0.5
        
        scores = scores.masked_fill(self.mask[:T, :T] == 0, float('-inf'))
        
        scores_softmax = torch.softmax(scores, dim=-1)
        
        attention = scores_softmax @ V
        attention = attention.transpose(1,2).contiguous().view(B,T,C)
        
        attention = self.out_proj(attention)
        return attention
        
class Block(nn.Module):
    def __init__(self, context_len, d_model, heads):
        super().__init__()
        
        self.attn = Attention(context_len, d_model, heads)
        self.ln1 = nn.LayerNorm(d_model)
        self.ln2 = nn.LayerNorm(d_model)
        self.ffn = nn.Sequential(
                nn.Linear(d_model, 4 * d_model),
                nn.ReLU(),
                nn.Linear(4 * d_model, d_model)
            )
        
    def forward(self, x):
        x = x + self.attn(self.ln1(x))
        x = x + self.ffn(self.ln2(x))
        
        return x
        
        
        