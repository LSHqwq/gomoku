# backend/zhipu_client.py
import json
import re
from typing import Optional, Tuple
from zai import ZhipuAiClient  # 使用新SDK

class ZhipuClient:
    def __init__(self, api_key: str):
        # 初始化客户端，只需传入 API Key
        self.client = ZhipuAiClient(api_key=api_key)
    
    async def get_next_move(self, board: list, player: int) -> Optional[Tuple[int, int]]:
        """
        调用智谱API获取下一步落子位置
        board: 15x15的二维数组
        player: 当前轮到谁下 (1=玩家, 2=AI)
        """
        # 构建棋盘描述
        board_str = self._format_board(board)
        
        # 构建提示词
        system_prompt = """你是一个专业的五子棋AI，执白子(用2表示)。
规则：
1. 棋盘是15x15，坐标范围0-14
2. 黑子(1)先手，白子(2)后手
3. 你需要分析当前棋局，选择最优的落子位置
4. 输出格式必须是严格的JSON: {"x": 列索引, "y": 行索引}
5. 不要输出任何其他文字，只输出JSON"""

        user_prompt = f"""当前棋盘状态如下：
{board_str}

请分析棋局，告诉我下一步应该下在哪个位置。
输出格式：{{"x": 列索引, "y": 行索引}}"""

        try:
            # 使用SDK调用API，代码简洁了很多
            response = self.client.chat.completions.create(
                model="glm-4-flash",  # 可以换成 glm-4、glm-4.7 等
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,
                max_tokens=50
            )
            
            # 直接从响应对象中提取内容
            ai_response = response.choices[0].message.content
            
            # 解析JSON坐标
            json_match = re.search(r'\{[^{}]*\}', ai_response)
            if json_match:
                coords = json.loads(json_match.group())
                x = int(coords.get("x", -1))
                y = int(coords.get("y", -1))
                if 0 <= x < 15 and 0 <= y < 15:
                    return (x, y)
            
            return None
            
        except Exception as e:
            print(f"调用智谱API失败: {e}")
            return None

    def _format_board(self, board: list) -> str:
        """将棋盘格式化为易读的字符串"""
        rows = []
        for i, row in enumerate(board):
            row_str = f"{i:2d} | " + " ".join(str(cell) for cell in row)
            rows.append(row_str)
        header = "    " + " ".join(f"{j:2d}" for j in range(15))
        return header + "\n" + "\n".join(rows)