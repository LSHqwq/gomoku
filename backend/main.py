from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Tuple
import os
from zhipu_client import ZhipuClient

app = FastAPI(title="五子棋AI服务")

# 配置CORS，允许前端访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境建议指定具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化智谱客户端
ZHIPU_API_KEY = os.getenv("ZHIPU_API_KEY")
if not ZHIPU_API_KEY:
    raise ValueError("请在环境变量中设置 ZHIPU_API_KEY")

zhipu_client = ZhipuClient(ZHIPU_API_KEY)

# 请求模型
class MoveRequest(BaseModel):
    board: List[List[int]]  # 15x15棋盘
    player: int  # 1=玩家, 2=AI

# 响应模型
class MoveResponse(BaseModel):
    x: int
    y: int
    success: bool
    message: Optional[str] = None

@app.get("/")
async def root():
    return {"message": "五子棋AI服务已启动", "status": "running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.post("/api/ai-move", response_model=MoveResponse)
async def get_ai_move(request: MoveRequest):
    """
    获取AI下一步落子位置
    """
    # 验证棋盘大小
    if len(request.board) != 15 or any(len(row) != 15 for row in request.board):
        raise HTTPException(status_code=400, detail="棋盘必须是15x15")
    
    # 调用智谱API
    move = await zhipu_client.get_next_move(request.board, request.player)
    
    if move is None:
        return MoveResponse(
            x=-1, y=-1, success=False, 
            message="AI无法确定落子位置，请重试"
        )
    
    x, y = move
    # 验证落子位置是否为空
    if request.board[y][x] != 0:
        return MoveResponse(
            x=-1, y=-1, success=False,
            message=f"AI建议的位置 ({x}, {y}) 已被占用"
        )
    
    return MoveResponse(x=x, y=y, success=True)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)