const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// UI Elements Reference
const ui = {
    start: document.getElementById("start-screen"),
    gameOver: document.getElementById("game-over-screen"),
    score: document.getElementById("score-txt"),
    arrows: document.getElementById("arrows-txt"),
    finalScore: document.getElementById("final-score"),
    wind: document.getElementById("wind-txt"),
    comboBox: document.getElementById("combo-box"),
    comboTxt: document.getElementById("combo-txt"),
    container: document.getElementById("game-container"),
    inGameControls: document.getElementById("in-game-controls")
};

// Advanced Game State Object
const Game = {
    score: 0,
    arrows: 5,
    combo: 1,
    wind: 0,
    isOver: false,
    isSetup: false,
    gravity: 0.22,
    particles: [],
    floatTexts: [],
    shockwaves: [], // New for target hit explosion
    shakeAmount: 0 // For screen shake effect
};

// Entities
const bow = { x: 150, y: 375, radius: 65 };

let arrow = { 
    x: bow.x, y: bow.y, vx: 0, vy: 0, 
    isFlying: false, isDragging: false, 
    pullX: 0, pullY: 0, angle: 0, length: 80,
    trail: [] // Stores previous positions for neon trail
};

let target = { 
    x: 1180, y: 375, radius: 60, speed: 4, direction: 1, 
    baseSpeed: 4, baseRadius: 60 
};

// New Obstacle Entity (Moving Shield)
let obstacle = {
    x: 800, y: 375, width: 20, height: 120, 
    speed: 5, direction: -1, active: true
};

// Audio System (Synthesized sounds)
let audioCtx = null;
function playSound(type) {
    if (!audioCtx) return; 
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'shoot') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.15);
        osc.start(); osc.stop(audioCtx.currentTime + 0.15);
    } else if (type === 'hit') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.setValueAtTime(1200, audioCtx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
        osc.start(); osc.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'bounce') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'gameover') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(50, audioCtx.currentTime + 0.8);
        gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.8);
        osc.start(); osc.stop(audioCtx.currentTime + 0.8);
    }
}

function updateWind() {
    Game.wind = (Math.random() * 6 - 3).toFixed(1);
    ui.wind.innerText = Math.abs(Game.wind) + (Game.wind > 0 ? " ▼" : " ▲");
    ui.wind.style.color = Game.wind > 0 ? "#ffcc00" : "#0099ff";
}

function initAndStartGame() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    if (ui.container.requestFullscreen) ui.container.requestFullscreen();
    
    ui.start.style.opacity = '0';
    setTimeout(() => {
        ui.start.style.display = 'none';
        ui.inGameControls.style.display = 'flex';
    }, 400);
    
    if(!Game.isSetup) {
        setupControls();
        Game.isSetup = true;
        updateWind();
        requestAnimationFrame(gameLoop);
    } else {
        restartGame();
    }
}

function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height)
    };
}

function setupControls() {
    const startDrag = (e) => {
        if (Game.isOver || arrow.isFlying) return;
        if(e.target.tagName === 'BUTTON') return; 

        let coords = getCanvasCoords(e);
        if (Math.hypot(coords.x - bow.x, coords.y - bow.y) < 150) {
            arrow.isDragging = true;
            arrow.trail = []; 
        }
    };

    const moveDrag = (e) => {
        if (!arrow.isDragging) return;
        let coords = getCanvasCoords(e);
        let dx = coords.x - bow.x;
        let dy = coords.y - bow.y;
        let dist = Math.hypot(dx, dy);
        
        const maxPull = 160; 
        if (dist > maxPull) {
            dx = (dx / dist) * maxPull;
            dy = (dy / dist) * maxPull;
        }

        if(dx > 20) dx = 20; 
        arrow.pullX = dx;
        arrow.pullY = dy;
        arrow.angle = Math.atan2(-dy, -dx);
    };

    const endDrag = () => {
        if (!arrow.isDragging) return;
        arrow.isDragging = false;
        
        let pullDist = Math.hypot(arrow.pullX, arrow.pullY);
        if (pullDist > 30) {
            const releaseForce = 0.16; 
            arrow.vx = Math.cos(arrow.angle) * pullDist * releaseForce;
            arrow.vy = Math.sin(arrow.angle) * pullDist * releaseForce;
            arrow.isFlying = true;
            arrow.x = bow.x;
            arrow.y = bow.y;
            playSound('shoot');
        } else {
            arrow.pullX = 0; arrow.pullY = 0;
        }
    };

    canvas.addEventListener("mousedown", startDrag);
    canvas.addEventListener("mousemove", moveDrag);
    window.addEventListener("mouseup", endDrag);
    canvas.addEventListener("touchstart", startDrag, {passive: true});
    canvas.addEventListener("touchmove", moveDrag, {passive: true});
    window.addEventListener("touchend", endDrag);
}

function spawnParticles(x, y, color, amount = 30) {
    for(let i=0; i<amount; i++) {
        Game.particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 20, // Increased speed for better explosion
            vy: (Math.random() - 0.5) * 20,
            radius: Math.random() * 5 + 2,
            alpha: 1,
            color: color
        });
    }
}

function triggerScoreText(x, y, text, color) {
    Game.floatTexts.push({ 
        x: x - 50, y: y, text: text, alpha: 1, color: color 
    });
}

function triggerScreenShake(intensity) {
    Game.shakeAmount = intensity;
}

function checkCollisions() {
    // 1. Obstacle Collision (Moving Shield)
    if (arrow.x + arrow.length/2 > obstacle.x - obstacle.width/2 && 
        arrow.x - arrow.length/2 < obstacle.x + obstacle.width/2 &&
        arrow.y > obstacle.y - obstacle.height/2 && 
        arrow.y < obstacle.y + obstacle.height/2) {
        
        arrow.vx *= -0.5;
        arrow.vy += (Math.random() - 0.5) * 5;
        playSound('bounce');
        spawnParticles(arrow.x, arrow.y, "#ff3366", 15);
        triggerScoreText(arrow.x, arrow.y - 20, "BLOCKED!", "#ff3366");
        triggerScreenShake(3);
    }

    // 2. Target Collision
    if (arrow.x >= target.x - 20 && arrow.x <= target.x + 30) {
        let hitDist = Math.abs(arrow.y - target.y);
        
        if (hitDist <= target.radius && arrow.vx > 0) { 
            let basePoints = 0;
            let label = "";
            let color = "#ffffff";

            if (hitDist <= target.radius * 0.18) {
                basePoints = 100; label = "BULLSEYE!"; color = "#00ffcc";
                triggerScreenShake(10); 
            } else if (hitDist <= target.radius * 0.5) {
                basePoints = 50; label = "GREAT!"; color = "#0099ff";
                triggerScreenShake(6);
            } else {
                basePoints = 20; label = "HIT!"; color = "#ffcc00";
                triggerScreenShake(3);
            }

            let earnedPoints = basePoints * Game.combo;
            Game.score += earnedPoints;
            ui.score.innerText = Game.score;
            
            // TARGET HIT EFFECTS - Explodes from the center of the target!
            spawnParticles(target.x, target.y, color, 60); 
            Game.shockwaves.push({ x: target.x, y: target.y, radius: target.radius, alpha: 1, color: color });
            triggerScoreText(target.x - 60, target.y - 50, `${label} +${earnedPoints}`, color);
            
            Game.combo++;
            if(Game.combo > 1) {
                ui.comboBox.style.display = "block";
                ui.comboTxt.innerText = Game.combo;
            }

            // Increase Difficulty
            if(target.speed < 12) target.speed += 0.5; 
            if(target.radius > 35) target.radius -= 1;
            if(obstacle.speed < 10) obstacle.speed += 0.3;

            playSound('hit');
            updateWind();
            resetArrow(false);
        }
    }
}

function resetArrow(isMiss) {
    arrow.isFlying = false;
    arrow.x = bow.x; arrow.y = bow.y;
    arrow.vx = 0; arrow.vy = 0;
    arrow.pullX = 0; arrow.pullY = 0;
    arrow.trail = [];
    
    if(isMiss) {
        Game.combo = 1;
        ui.comboBox.style.display = "none";
        updateWind();
        
        Game.arrows--;
        ui.arrows.innerText = Game.arrows;
        
        if(Game.arrows <= 0) {
            Game.isOver = true;
            playSound('gameover');
            ui.finalScore.innerText = Game.score;
            ui.gameOver.style.display = "flex";
            ui.inGameControls.style.display = "none";
        }
    }
}

function restartGame() {
    Game.score = 0; Game.arrows = 5; Game.combo = 1; Game.isOver = false;
    Game.particles = []; Game.floatTexts = []; Game.shockwaves = [];
    target.speed = target.baseSpeed; target.radius = target.baseRadius;
    obstacle.speed = 5;
    
    ui.score.innerText = Game.score; 
    ui.arrows.innerText = Game.arrows;
    ui.comboBox.style.display = "none";
    ui.gameOver.style.display = "none";
    ui.inGameControls.style.display = "flex";
    
    updateWind();
    resetArrow(false);
}

function gameLoop() {
    if(Game.isOver) {
        requestAnimationFrame(gameLoop);
        return;
    }

    // Apply Screen Shake
    ctx.save();
    if (Game.shakeAmount > 0) {
        let dx = (Math.random() - 0.5) * Game.shakeAmount;
        let dy = (Math.random() - 0.5) * Game.shakeAmount;
        ctx.translate(dx, dy);
        Game.shakeAmount *= 0.9; 
        if(Game.shakeAmount < 0.5) Game.shakeAmount = 0;
    }

    // Motion Blur Background
    ctx.fillStyle = "rgba(10, 11, 26, 0.4)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Cyber Grid Background
    ctx.strokeStyle = "rgba(0, 255, 204, 0.03)";
    ctx.lineWidth = 1;
    for(let i=0; i<canvas.width; i+=60) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke(); }
    for(let j=0; j<canvas.height; j+=60) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(canvas.width, j); ctx.stroke(); }

    // 1. Move Entities
    target.y += target.speed * target.direction;
    if (target.y - target.radius < 50 || target.y + target.radius > canvas.height - 50) {
        target.direction *= -1;
    }

    obstacle.y += obstacle.speed * obstacle.direction;
    if (obstacle.y - obstacle.height/2 < 20 || obstacle.y + obstacle.height/2 > canvas.height - 20) {
        obstacle.direction *= -1;
    }

    // 2. Projectile Physics & Trail Update
    if (arrow.isFlying) {
        arrow.trail.push({x: arrow.x, y: arrow.y});
        if(arrow.trail.length > 15) arrow.trail.shift();

        arrow.vy += Game.gravity + (parseFloat(Game.wind) * 0.04);
        arrow.x += arrow.vx;
        arrow.y += arrow.vy;
        arrow.angle = Math.atan2(arrow.vy, arrow.vx);

        checkCollisions();

        if (arrow.x > canvas.width + 100 || arrow.y > canvas.height + 150 || arrow.y < -150) {
            resetArrow(true);
        }
    }

    // 3. Render Trail
    if (arrow.trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(arrow.trail[0].x, arrow.trail[0].y);
        for(let i = 1; i < arrow.trail.length; i++) {
            ctx.lineTo(arrow.trail[i].x, arrow.trail[i].y);
        }
        ctx.strokeStyle = "rgba(0, 255, 204, 0.5)";
        ctx.lineWidth = 3;
        ctx.shadowBlur = 10; ctx.shadowColor = "#00ffcc";
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // 4. Trajectory Predictor
    if (arrow.isDragging) {
        ctx.fillStyle = "rgba(0, 255, 204, 0.3)";
        let tx = bow.x;
        let ty = bow.y;
        let pullDist = Math.hypot(arrow.pullX, arrow.pullY);
        let tvx = Math.cos(arrow.angle) * pullDist * 0.16;
        let tvy = Math.sin(arrow.angle) * pullDist * 0.16;
        
        for (let i = 0; i < 25; i++) {
            tvy += Game.gravity + (parseFloat(Game.wind) * 0.04); 
            tx += tvx; ty += tvy;
            ctx.beginPath(); ctx.arc(tx, ty, Math.max(3 - (i*0.1), 0.5), 0, Math.PI * 2); ctx.fill();
        }
    }

    // 5. Render Obstacle
    ctx.fillStyle = "rgba(255, 51, 102, 0.2)";
    ctx.strokeStyle = "#ff3366";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 15; ctx.shadowColor = "#ff3366";
    ctx.fillRect(obstacle.x - obstacle.width/2, obstacle.y - obstacle.height/2, obstacle.width, obstacle.height);
    ctx.strokeRect(obstacle.x - obstacle.width/2, obstacle.y - obstacle.height/2, obstacle.width, obstacle.height);
    ctx.shadowBlur = 0;

    // 6. Render Target
    let rings = [target.radius, target.radius * 0.75, target.radius * 0.5, target.radius * 0.18];
    let colors = ["#ffffff", "#0099ff", "#ff3366", "#ffcc00"];
    ctx.shadowBlur = 20; ctx.shadowColor = "#0099ff";
    for (let i = 0; i < rings.length; i++) {
        ctx.beginPath(); ctx.arc(target.x, target.y, rings[i], 0, Math.PI * 2);
        ctx.fillStyle = colors[i]; ctx.fill();
        ctx.strokeStyle = "#030308"; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // 7. Render Shockwaves (Target Hit Effect)
    for (let i = Game.shockwaves.length - 1; i >= 0; i--) {
        let sw = Game.shockwaves[i];
        sw.radius += 10; // Expand ring
        sw.alpha -= 0.04; // Fade out
        
        if (sw.alpha <= 0) {
            Game.shockwaves.splice(i, 1);
        } else {
            ctx.globalAlpha = sw.alpha;
            ctx.strokeStyle = sw.color;
            ctx.lineWidth = 6;
            ctx.shadowBlur = 20; ctx.shadowColor = sw.color;
            ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2); ctx.stroke();
            ctx.shadowBlur = 0; ctx.globalAlpha = 1.0;
        }
    }

    // 8. Render Bow
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#00ffcc";
    ctx.shadowBlur = 15; ctx.shadowColor = "#00ffcc";
    ctx.beginPath(); ctx.arc(bow.x, bow.y, bow.radius, Math.PI * 0.45, Math.PI * 1.55, false); ctx.stroke();

    // Bow String
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(bow.x - 5, bow.y - bow.radius + 8);
    if (arrow.isDragging) ctx.lineTo(bow.x + arrow.pullX, bow.y + arrow.pullY);
    else ctx.lineTo(bow.x, bow.y);
    ctx.lineTo(bow.x - 5, bow.y + bow.radius - 8);
    ctx.stroke();

    // 9. Render Arrow
    if (arrow.isFlying || arrow.isDragging) {
        ctx.save();
        ctx.translate(arrow.isDragging ? bow.x + arrow.pullX : arrow.x, arrow.isDragging ? bow.y + arrow.pullY : arrow.y);
        ctx.rotate(arrow.angle);

        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(-arrow.length, 0); ctx.lineTo(0, 0); ctx.stroke();

        ctx.fillStyle = "#ffcc00";
        ctx.beginPath(); ctx.moveTo(-arrow.length, 0); ctx.lineTo(-arrow.length - 12, -10);
        ctx.lineTo(-arrow.length + 5, 0); ctx.lineTo(-arrow.length - 12, 10); ctx.closePath(); ctx.fill();

        ctx.fillStyle = "#00ffcc"; ctx.shadowBlur = 15; ctx.shadowColor = "#00ffcc";
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-16, -8); ctx.lineTo(-16, 8); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.shadowBlur = 0;
    }

    // 10. Render Particles
    for (let i = Game.particles.length - 1; i >= 0; i--) {
        let p = Game.particles[i];
        p.x += p.vx; p.y += p.vy;
        p.alpha -= 0.03; 
        
        if (p.alpha <= 0) {
            Game.particles.splice(i, 1);
        } else {
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.shadowBlur = 15; ctx.shadowColor = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0; ctx.globalAlpha = 1.0;
        }
    }

    // 11. Render Floating Text
    for (let i = Game.floatTexts.length - 1; i >= 0; i--) {
        let ft = Game.floatTexts[i];
        ft.y -= 1.5;
        ft.alpha -= 0.02;
        
        if (ft.alpha <= 0) {
            Game.floatTexts.splice(i, 1);
        } else {
            ctx.globalAlpha = ft.alpha;
            ctx.fillStyle = ft.color || "#00ffcc";
            ctx.font = "bold 26px 'Courier New'";
            ctx.shadowBlur = 15; ctx.shadowColor = ft.color;
            ctx.fillText(ft.text, ft.x, ft.y);
            ctx.shadowBlur = 0; ctx.globalAlpha = 1.0;
        }
    }

    ctx.restore(); 
    requestAnimationFrame(gameLoop);
}
