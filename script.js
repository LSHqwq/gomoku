// ========== 配置 ==========
const API_BASE = 'https://gomoku-backend-production.up.railway.app';
let authToken = localStorage.getItem('token') || '';
let currentUser = null;
let currentRoom = null;
let game = null;

// DOM 元素
const authModal = document.getElementById('auth-modal');
const lobby = document.getElementById('lobby');
const gameRoom = document.getElementById('game-room');
const authTitle = document.getElementById('auth-title');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authSwitchText = document.getElementById('auth-switch-text');
const authSwitchLink = document.getElementById('auth-switch-link');
const authError = document.getElementById('auth-error');
const displayUsername = document.getElementById('display-username');
const logoutBtn = document.getElementById('logout-btn');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomInput = document.getElementById('join-room-input');
const joinRoomBtn = document.getElementById('join-room-btn');
const lobbyError = document.getElementById('lobby-error');
const roomCodeDisplay = document.getElementById('room-code-display');
const blackName = document.getElementById('black-name');
const whiteName = document.getElementById('white-name');
const gameHint = document.getElementById('game-hint');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const winModal = document.getElementById('win-modal');
const winnerDisplay = document.getElementById('winner-display');
const winDescription = document.getElementById('win-description');
const modalRestartBtn = document.getElementById('modal-restart-btn');

// API
async function api(path, method = 'GET', body = null) {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (authToken) options.headers['Authorization'] = `Bearer ${authToken}`;
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${path}`, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '请求失败');
    return data;
}

// ========== 认证 ==========
let isRegister = false;
authSwitchLink.addEventListener('click', (e) => {
    e.preventDefault();
    isRegister = !isRegister;
    authTitle.textContent = isRegister ? '注册' : '登录';
    authSubmitBtn.textContent = isRegister ? '注册' : '登录';
    authSwitchText.textContent = isRegister ? '已有账号？' : '没有账号？';
    authSwitchLink.textContent = isRegister ? '登录' : '注册';
    authError.textContent = '';
});

authSubmitBtn.addEventListener('click', async () => {
    const username = authUsername.value.trim();
    const password = authPassword.value;
    if (!username || !password) { authError.textContent = '请填写完整'; return; }
    try {
        const path = isRegister ? '/api/register' : '/api/login';
        const data = await api(path, 'POST', { username, password });
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('token', authToken);
        authModal.style.display = 'none';
        showLobby();
    } catch (err) { authError.textContent = err.message; }
});

logoutBtn.addEventListener('click', () => {
    authToken = '';
    currentUser = null;
    localStorage.removeItem('token');
    stopSync();
    showAuthModal();
});

// ========== 大厅 ==========
function showAuthModal() {
    authModal.style.display = 'flex';
    lobby.style.display = 'none';
    gameRoom.style.display = 'none';
}

function showLobby() {
    authModal.style.display = 'none';
    lobby.style.display = 'flex';
    gameRoom.style.display = 'none';
    displayUsername.textContent = `👤 ${currentUser.username}`;
    logoutBtn.style.display = 'block';
    lobbyError.textContent = '';
    joinRoomInput.value = '';
}

createRoomBtn.addEventListener('click', async () => {
    try {
        const data = await api('/api/rooms', 'POST');
        currentRoom = { room_code: data.room_code, status: 'waiting' };
        showGameRoom();
        startSync();
    } catch (err) { lobbyError.textContent = err.message; }
});

joinRoomBtn.addEventListener('click', async () => {
    const code = joinRoomInput.value.trim().toUpperCase();
    if (!code) { lobbyError.textContent = '请输入房间号'; return; }
    try {
        const data = await api(`/api/rooms/${code}/join`, 'POST');
        currentRoom = {
            room_code: data.room_code,
            status: 'playing',
            black_player: data.black_player,
            white_player: data.white_player
        };
        showGameRoom();
        // 加入者：游戏直接开始，我是白方
        game.myColor = 'white';
        game.onGameStart();
        startSync();
    } catch (err) { lobbyError.textContent = err.message; }
});

// ========== 同步 ==========
let syncTimer = null;

function startSync() {
    stopSync();
    doSync();
}

function stopSync() {
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
}

async function doSync() {
    if (!currentRoom || !currentRoom.room_code) return;
    
    try {
        const data = await api(`/api/rooms/${currentRoom.room_code}`);
        
        // 更新显示
        if (data.black_player) blackName.textContent = data.black_player;
        if (data.white_player) whiteName.textContent = data.white_player;
        
        // 房主：检测对手加入
        if (data.status === 'playing' && currentRoom.status === 'waiting') {
            currentRoom.status = 'playing';
            game.myColor = 'black';
            game.onGameStart();
        }
        
        // 检测棋盘变化
        if (game && !game.gameOver) {
            const serverBoard = JSON.stringify(data.board_state);
            const localBoard = JSON.stringify(game.pieces);
            if (serverBoard !== localBoard) {
                game.syncFromServer(data);
            }
        }
        
        // 检测游戏结束
        if (data.status === 'finished' && game && !game.gameOver) {
            game.onGameEnd(data);
        }
        
        currentRoom.status = data.status;
    } catch (err) {}
    
    syncTimer = setTimeout(doSync, 1000);
}

// ========== 游戏界面 ==========
function showGameRoom() {
    lobby.style.display = 'none';
    gameRoom.style.display = 'flex';
    roomCodeDisplay.textContent = `房间: ${currentRoom.room_code}`;
    blackName.textContent = currentRoom.black_player || '等待中';
    whiteName.textContent = currentRoom.white_player || '等待中';
    
    if (!game) game = new GomokuOnline();
    game.reset(currentRoom);
}

leaveRoomBtn.addEventListener('click', () => {
    stopSync();
    currentRoom = null;
    game.cleanup();
    showLobby();
});

modalRestartBtn.addEventListener('click', async () => {
    winModal.style.display = 'none';
    if (currentRoom) {
        try {
            await api(`/api/rooms/${currentRoom.room_code}/restart`, 'POST');
            game.reset(currentRoom);
            game.onGameStart();
        } catch (err) {}
    }
});

// ========== 游戏类 ==========
class GomokuOnline {
    constructor() {
        this.boardSize = 15;
        this.cellSize = 40;
        this.padding = 20;
        this.pieces = Array(15).fill(null).map(() => Array(15).fill(null));
        this.currentTurn = 'black';
        this.gameOver = false;
        this.moveCount = 0;
        this.gameStarted = false;
        this.gameStartTime = null;
        this.timerInterval = null;
        this.myColor = null;

        this.canvas = document.getElementById('board');
        this.ctx = this.canvas.getContext('2d');
        this.bindEvents();
        this.drawBoard();
    }

    reset(roomData) {
        this.pieces = Array(15).fill(null).map(() => Array(15).fill(null));
        this.currentTurn = 'black';
        this.gameOver = false;
        this.moveCount = 0;
        this.gameStarted = false;
        this.gameStartTime = null;
        this.stopTimer();
        
        document.getElementById('game-time').textContent = '00:00';
        document.getElementById('move-count').textContent = '0';
        document.getElementById('game-status').textContent = '';
        document.getElementById('game-status').className = 'status-display';
        document.getElementById('game-hint').textContent = '';
        document.getElementById('turn-indicator').className = 'turn-display black-turn';
        document.getElementById('current-player-text').textContent = '黑棋走子';
        
        if (roomData && roomData.status === 'waiting') {
            document.getElementById('game-hint').textContent = '等待对手加入...';
            document.getElementById('game-status').textContent = '⏳ 等待中';
        }
        
        this.updateUI();
        this.drawBoard();
    }

    onGameStart() {
        if (this.gameStarted) return;
        this.gameStarted = true;
        this.gameStartTime = Date.now();
        this.startTimer();
        
        document.getElementById('game-status').textContent = '🎯 游戏进行中';
        document.getElementById('game-status').className = 'status-display';
        
        if (this.myColor === 'black') {
            document.getElementById('game-hint').textContent = '你执黑，请落子';
        } else {
            document.getElementById('game-hint').textContent = '你执白，等待黑棋落子';
        }
        this.updateUI();
    }

    onGameEnd(data) {
        this.gameOver = true;
        this.stopTimer();
        const winner = data.winner || '';
        document.getElementById('game-status').textContent = '🏆 游戏结束';
        document.getElementById('game-status').className = 'status-display win';
        document.getElementById('game-hint').textContent = '游戏结束';
        document.getElementById('winner-display').textContent = winner === currentUser.username ? '🎉 你赢了！' : `💪 ${winner} 获胜`;
        document.getElementById('win-description').textContent = `经过 ${this.moveCount} 步`;
        document.getElementById('win-modal').style.display = 'flex';
    }

    syncFromServer(data) {
        this.pieces = JSON.parse(JSON.stringify(data.board_state));
        this.currentTurn = data.current_turn;
        this.moveCount = (data.move_history || []).length;
        
        if (data.status === 'finished') {
            this.gameOver = true;
            this.stopTimer();
            document.getElementById('game-status').textContent = '🏆 游戏结束';
            document.getElementById('game-status').className = 'status-display win';
            document.getElementById('game-hint').textContent = '游戏结束';
        } else {
            if (this.myColor === this.currentTurn) {
                document.getElementById('game-hint').textContent = '轮到你了！';
            } else {
                document.getElementById('game-hint').textContent = '等待对手落子...';
            }
        }
        
        this.updateUI();
        this.drawBoard();
    }

    bindEvents() {
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleHover(e));
        this.canvas.addEventListener('mouseleave', () => this.drawBoard());
        
        document.getElementById('restart-btn').addEventListener('click', async () => {
            if (currentRoom) {
                try {
                    await api(`/api/rooms/${currentRoom.room_code}/restart`, 'POST');
                    this.reset(currentRoom);
                    this.onGameStart();
                } catch (err) {}
            }
        });
    }

    startTimer() {
        this.stopTimer();
        this.timerInterval = setInterval(() => {
            if (!this.gameOver && this.gameStartTime) {
                const elapsed = Math.floor((Date.now() - this.gameStartTime) / 1000);
                const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const s = (elapsed % 60).toString().padStart(2, '0');
                document.getElementById('game-time').textContent = `${m}:${s}`;
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
    }

    updateUI() {
        document.getElementById('turn-indicator').className = 'turn-display ' + (this.currentTurn === 'black' ? 'black-turn' : 'white-turn');
        document.getElementById('current-player-text').textContent = this.currentTurn === 'black' ? '黑棋走子' : '白棋走子';
        document.getElementById('black-player-card').classList.toggle('active-player', this.currentTurn === 'black');
        document.getElementById('white-player-card').classList.toggle('active-player', this.currentTurn === 'white');
        document.getElementById('move-count').textContent = this.moveCount;
    }

    drawBoard(hx = -1, hy = -1) {
        const ctx = this.ctx, pad = this.padding, cell = this.cellSize, size = this.boardSize;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const bg = ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
        bg.addColorStop(0, '#dcb35c'); bg.addColorStop(1, '#c9a03a');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        ctx.strokeStyle = '#5a4a2a'; ctx.lineWidth = 1;
        for (let i = 0; i < size; i++) {
            ctx.beginPath(); ctx.moveTo(pad + i * cell, pad); ctx.lineTo(pad + i * cell, pad + (size - 1) * cell); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(pad, pad + i * cell); ctx.lineTo(pad + (size - 1) * cell, pad + i * cell); ctx.stroke();
        }
        ctx.strokeStyle = '#3a2a0a'; ctx.lineWidth = 3;
        ctx.strokeRect(pad, pad, (size - 1) * cell, (size - 1) * cell);
        
        [[3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11]].forEach(([x, y]) => {
            ctx.beginPath(); ctx.arc(pad + x * cell, pad + y * cell, 4, 0, Math.PI * 2); ctx.fillStyle = '#3a2a0a'; ctx.fill();
        });
        
        this.pieces.forEach((row, y) => row.forEach((p, x) => { if (p) this.drawPiece(x, y, p, false); }));
        
        if (!this.gameOver && this.gameStarted && this.myColor === this.currentTurn && hx >= 0 && hx < size && hy >= 0 && hy < size && !this.pieces[hy][hx]) {
            this.drawPiece(hx, hy, this.currentTurn, true);
        }
    }

    drawPiece(x, y, color, preview) {
        const ctx = this.ctx, cx = this.padding + x * this.cellSize, cy = this.padding + y * this.cellSize, r = this.cellSize / 2 - 2;
        ctx.save(); if (preview) ctx.globalAlpha = 0.4;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(cx - 3, cy - 3, 2, cx, cy, r);
        if (color === 'black') { g.addColorStop(0, '#555'); g.addColorStop(0.7, '#111'); g.addColorStop(1, '#000'); }
        else { g.addColorStop(0, '#fff'); g.addColorStop(0.7, '#eee'); g.addColorStop(1, '#ccc'); }
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
    }

    handleClick(e) {
        if (this.gameOver || !this.gameStarted || this.myColor !== this.currentTurn) return;
        const rect = this.canvas.getBoundingClientRect();
        const sx = this.canvas.width / rect.width, sy = this.canvas.height / rect.height;
        const mx = (e.clientX - rect.left) * sx, my = (e.clientY - rect.top) * sy;
        const x = Math.round((mx - this.padding) / this.cellSize), y = Math.round((my - this.padding) / this.cellSize);
        if (x < 0 || x >= 15 || y < 0 || y >= 15 || this.pieces[y][x]) return;
        this.makeMove(x, y);
    }

    handleHover(e) {
        if (this.gameOver || !this.gameStarted || this.myColor !== this.currentTurn) return;
        const rect = this.canvas.getBoundingClientRect();
        const sx = this.canvas.width / rect.width, sy = this.canvas.height / rect.height;
        const mx = (e.clientX - rect.left) * sx, my = (e.clientY - rect.top) * sy;
        const x = Math.round((mx - this.padding) / this.cellSize), y = Math.round((my - this.padding) / this.cellSize);
        if (x >= 0 && x < 15 && y >= 0 && y < 15 && !this.pieces[y][x]) this.drawBoard(x, y);
        else this.drawBoard();
    }

    async makeMove(x, y) {
        try {
            const data = await api(`/api/rooms/${this.currentRoomCode || currentRoom.room_code}/move`, 'POST', { x, y });
            this.pieces = JSON.parse(JSON.stringify(data.board_state));
            this.moveCount = (data.move_history || []).length;
            if (data.game_over) {
                this.gameOver = true; this.stopTimer();
                document.getElementById('game-status').textContent = `🏆 ${data.winner} 获胜！`;
                document.getElementById('game-status').className = 'status-display win';
                document.getElementById('game-hint').textContent = '游戏结束';
                document.getElementById('winner-display').textContent = data.winner === currentUser.username ? '🎉 你赢了！' : `💪 ${data.winner} 获胜`;
                document.getElementById('win-description').textContent = `经过 ${this.moveCount} 步`;
                document.getElementById('win-modal').style.display = 'flex';
            } else {
                this.currentTurn = data.current_turn;
                document.getElementById('game-hint').textContent = '等待对手落子...';
            }
            this.updateUI(); this.drawBoard();
        } catch (err) {}
    }

    cleanup() { this.stopTimer(); }
}

// 初始化
window.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        api('/api/me').then(u => { currentUser = u; showLobby(); }).catch(() => { localStorage.removeItem('token'); authToken = ''; showAuthModal(); });
    } else showAuthModal();
});