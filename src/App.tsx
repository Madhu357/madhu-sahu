/**
 * Lunar Lander Arcade - HTML5 Canvas Vector Simulation
 * 2D Newtonian Physics, Procedural Lunar Surface, Vector Wireframe Graphics & Telemetry
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Volume2,
  VolumeX,
  RotateCcw,
  Pause,
  Play,
  HelpCircle,
  Trophy,
  Palette,
  ChevronRight,
  Flame,
  ArrowUp,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { ColorTheme, GameStatus, Lander, LandingPad, LandingResult, Particle, Point } from './types';
import { generateTerrain, TerrainData } from './terrain';
import {
  calculateAltitude,
  checkCollision,
  getLanderContactPoints,
  PHYSICS_CONSTANTS,
} from './physics';
import { sound } from './sound';

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 700;

const THEMES: Record<
  ColorTheme,
  { name: string; stroke: string; glow: string; accent: string; bgClass: string }
> = {
  'vector-white': {
    name: 'Apollo White',
    stroke: '#ffffff',
    glow: '#ffffff',
    accent: '#38bdf8',
    bgClass: 'bg-black',
  },
  'phosphor-green': {
    name: 'Radar Green',
    stroke: '#22c55e',
    glow: '#4ade80',
    accent: '#86efac',
    bgClass: 'bg-slate-950',
  },
  'amber-crt': {
    name: 'Amber CRT',
    stroke: '#f59e0b',
    glow: '#fbbf24',
    accent: '#fde047',
    bgClass: 'bg-stone-950',
  },
  'cyan-glow': {
    name: 'Vector Cyan',
    stroke: '#06b6d4',
    glow: '#22d3ee',
    accent: '#67e8f9',
    bgClass: 'bg-zinc-950',
  },
};

interface Star {
  x: number;
  y: number;
  size: number;
  alpha: number;
  pulseSpeed: number;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // High-level React UI state
  const [gameStatus, setGameStatus] = useState<GameStatus>('TITLE');
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('lunar_lander_highscore');
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });
  const [missionNum, setMissionNum] = useState<number>(1);
  const [lastResult, setLastResult] = useState<LandingResult | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [currentTheme, setCurrentTheme] = useState<ColorTheme>('vector-white');
  const [showHelp, setShowHelp] = useState<boolean>(false);

  // Live HUD metrics for UI overlay (updated every few animation frames)
  const [hudFuel, setHudFuel] = useState<number>(1000);
  const [hudAltitude, setHudAltitude] = useState<number>(500);
  const [hudVSpeed, setHudVSpeed] = useState<number>(0);
  const [hudHSpeed, setHudHSpeed] = useState<number>(0);
  const [hudAngle, setHudAngle] = useState<number>(0);

  // Game Engine Mutable State Refs (for smooth 60fps physics with zero stutter)
  const gameStateRef = useRef<{
    status: GameStatus;
    lander: Lander;
    terrain: TerrainData;
    particles: Particle[];
    debris: Particle[];
    stars: Star[];
    keys: {
      up: boolean;
      left: boolean;
      right: boolean;
    };
    lastTime: number;
    score: number;
    round: number;
    activeTheme: ColorTheme;
  }>({
    status: 'TITLE',
    lander: {
      x: 200,
      y: 90,
      vx: 12,
      vy: 0,
      angle: 0,
      fuel: 1000,
      maxFuel: 1000,
      thrustActive: false,
      rotateLeftActive: false,
      rotateRightActive: false,
    },
    terrain: generateTerrain(CANVAS_WIDTH, CANVAS_HEIGHT),
    particles: [],
    debris: [],
    stars: [],
    keys: { up: false, left: false, right: false },
    lastTime: performance.now(),
    score: 0,
    round: 1,
    activeTheme: 'vector-white',
  });

  // Keep activeTheme in ref synced
  useEffect(() => {
    gameStateRef.current.activeTheme = currentTheme;
  }, [currentTheme]);

  // Generate background stars
  useEffect(() => {
    const stars: Star[] = [];
    for (let i = 0; i < 75; i++) {
      stars.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * (CANVAS_HEIGHT * 0.65),
        size: Math.random() > 0.85 ? 2 : 1,
        alpha: 0.3 + Math.random() * 0.7,
        pulseSpeed: 1 + Math.random() * 3,
      });
    }
    gameStateRef.current.stars = stars;
  }, []);

  // Update high score in storage
  const updateHighScore = useCallback((newScore: number) => {
    setHighScore((prev) => {
      if (newScore > prev) {
        try {
          localStorage.setItem('lunar_lander_highscore', newScore.toString());
        } catch {
          // Ignore
        }
        return newScore;
      }
      return prev;
    });
  }, []);

  // Initialize a new round/mission
  const initRound = useCallback((resetScore: boolean = true) => {
    const newTerrain = generateTerrain(CANVAS_WIDTH, CANVAS_HEIGHT);
    // Spawn lander near top with slight initial random lateral drift
    const startX = 180 + Math.random() * 300;
    const initialVx = (Math.random() * 14 - 7);

    const initialLander: Lander = {
      x: startX,
      y: 80,
      vx: initialVx,
      vy: 2,
      angle: 0,
      fuel: 1000,
      maxFuel: 1000,
      thrustActive: false,
      rotateLeftActive: false,
      rotateRightActive: false,
    };

    if (resetScore) {
      setScore(0);
      setMissionNum(1);
      gameStateRef.current.score = 0;
      gameStateRef.current.round = 1;
    }

    gameStateRef.current.lander = initialLander;
    gameStateRef.current.terrain = newTerrain;
    gameStateRef.current.particles = [];
    gameStateRef.current.debris = [];
    gameStateRef.current.status = 'PLAYING';
    gameStateRef.current.lastTime = performance.now();

    sound.stopThruster();
    setGameStatus('PLAYING');
    setLastResult(null);
  }, []);

  // Spawn explosion debris on crash
  const triggerCrash = useCallback((result: LandingResult) => {
    sound.playCrash();
    setGameStatus('CRASHED');
    setLastResult(result);
    gameStateRef.current.status = 'CRASHED';

    const lander = gameStateRef.current.lander;
    const debris: Particle[] = [];

    // Create 35 tumbling vector line fragments and spark points
    for (let i = 0; i < 35; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * 120;
      debris.push({
        x: lander.x,
        y: lander.y,
        vx: Math.cos(angle) * speed + lander.vx * 0.4,
        vy: Math.sin(angle) * speed + lander.vy * 0.4,
        life: 1.0,
        maxLife: 1.0 + Math.random() * 1.5,
        size: 1 + Math.random() * 2,
        color: '#ff4444',
        isLine: Math.random() > 0.35,
        length: 6 + Math.random() * 14,
        angle: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() * 2 - 1) * 8,
      });
    }

    gameStateRef.current.debris = debris;
  }, []);

  // Trigger win / safe touchdown
  const triggerWin = useCallback((result: LandingResult) => {
    sound.playTouchdown();
    setGameStatus('LANDED');
    setLastResult(result);
    gameStateRef.current.status = 'LANDED';

    const newScore = gameStateRef.current.score + result.scoreGained;
    gameStateRef.current.score = newScore;
    setScore(newScore);
    updateHighScore(newScore);

    // Gently snap lander upright on pad
    if (result.pad) {
      const l = gameStateRef.current.lander;
      l.vy = 0;
      l.vx = 0;
      l.angle = 0;
      l.y = result.pad.y - 14;
    }
  }, [updateHighScore]);

  // Keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent scrolling with arrows/space
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }

      const keys = gameStateRef.current.keys;
      const state = gameStateRef.current.status;

      if (e.code === 'KeyM') {
        const muted = sound.toggleMute();
        setIsMuted(muted);
        return;
      }

      if (e.code === 'KeyP') {
        if (state === 'PLAYING') {
          gameStateRef.current.status = 'PAUSED';
          setGameStatus('PAUSED');
          sound.stopThruster();
        } else if (state === 'PAUSED') {
          gameStateRef.current.status = 'PLAYING';
          gameStateRef.current.lastTime = performance.now();
          setGameStatus('PLAYING');
        }
        return;
      }

      if (e.code === 'Space') {
        if (state === 'TITLE' || state === 'CRASHED') {
          initRound(true);
        } else if (state === 'LANDED') {
          // Next round, keep score
          const nextMission = gameStateRef.current.round + 1;
          gameStateRef.current.round = nextMission;
          setMissionNum(nextMission);
          initRound(false);
        }
        return;
      }

      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        if (!keys.up && state === 'PLAYING' && gameStateRef.current.lander.fuel > 0) {
          sound.startThruster();
        }
        keys.up = true;
      }

      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        if (!keys.left && state === 'PLAYING') {
          sound.playRcs();
        }
        keys.left = true;
      }

      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        if (!keys.right && state === 'PLAYING') {
          sound.playRcs();
        }
        keys.right = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const keys = gameStateRef.current.keys;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        keys.up = false;
        sound.stopThruster();
      }
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        keys.left = false;
      }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        keys.right = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [initRound]);

  // Main 60FPS Game Loop with requestAnimationFrame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let hudUpdateCounter = 0;

    const gameLoop = (currentTime: number) => {
      const dt = Math.min((currentTime - gameStateRef.current.lastTime) / 1000, 0.05);
      gameStateRef.current.lastTime = currentTime;

      const state = gameStateRef.current.status;
      const lander = gameStateRef.current.lander;
      const keys = gameStateRef.current.keys;
      const theme = THEMES[gameStateRef.current.activeTheme];

      // 1. UPDATE PHYSICS (if playing)
      if (state === 'PLAYING') {
        // Rotation controls
        lander.rotateLeftActive = keys.left;
        lander.rotateRightActive = keys.right;

        if (keys.left) {
          lander.angle -= PHYSICS_CONSTANTS.ROTATION_SPEED * dt;
          lander.fuel = Math.max(0, lander.fuel - PHYSICS_CONSTANTS.RCS_FUEL_BURN * dt);
        }
        if (keys.right) {
          lander.angle += PHYSICS_CONSTANTS.ROTATION_SPEED * dt;
          lander.fuel = Math.max(0, lander.fuel - PHYSICS_CONSTANTS.RCS_FUEL_BURN * dt);
        }

        // Main Thruster
        if (keys.up && lander.fuel > 0) {
          lander.thrustActive = true;
          lander.fuel = Math.max(0, lander.fuel - PHYSICS_CONSTANTS.MAIN_FUEL_BURN * dt);

          // Force applied in the direction the lander faces
          // angle = 0 is straight up (-Y axis)
          const thrustAx = Math.sin(lander.angle) * PHYSICS_CONSTANTS.THRUST_FORCE;
          const thrustAy = -Math.cos(lander.angle) * PHYSICS_CONSTANTS.THRUST_FORCE;

          lander.vx += thrustAx * dt;
          lander.vy += (thrustAy + PHYSICS_CONSTANTS.GRAVITY) * dt;

          // Sound alarm if fuel is critical
          if (lander.fuel < 200 && lander.fuel > 0) {
            sound.playLowFuelAlarm();
          }

          // Spawn thruster particle effects from engine nozzle
          const cos = Math.cos(lander.angle);
          const sin = Math.sin(lander.angle);
          const nozzleX = lander.x + (0 * cos - 12 * sin);
          const nozzleY = lander.y + (0 * sin + 12 * cos);

          for (let i = 0; i < 3; i++) {
            const spread = (Math.random() - 0.5) * 0.5;
            const particleSpeed = 60 + Math.random() * 70;
            // Particles shoot backward out of the nozzle
            const pvx = -Math.sin(lander.angle + spread) * particleSpeed + lander.vx * 0.3;
            const pvy = Math.cos(lander.angle + spread) * particleSpeed + lander.vy * 0.3;

            gameStateRef.current.particles.push({
              x: nozzleX + (Math.random() * 4 - 2),
              y: nozzleY + (Math.random() * 4 - 2),
              vx: pvx,
              vy: pvy,
              life: 1.0,
              maxLife: 0.35 + Math.random() * 0.35,
              size: 1.2 + Math.random() * 2,
              color: Math.random() > 0.5 ? '#ffffff' : theme.glow,
            });
          }
        } else {
          lander.thrustActive = false;
          if (keys.up && lander.fuel <= 0) {
            sound.stopThruster();
          }
          // Pure gravity in freefall
          lander.vy += PHYSICS_CONSTANTS.GRAVITY * dt;
        }

        // Update position
        lander.x += lander.vx * dt;
        lander.y += lander.vy * dt;

        // Collision detection against terrain and boundaries
        const collision = checkCollision(
          lander,
          gameStateRef.current.terrain.segments,
          CANVAS_WIDTH,
          CANVAS_HEIGHT
        );

        if (collision.collided && collision.result) {
          if (collision.result.success) {
            triggerWin(collision.result);
          } else {
            triggerCrash(collision.result);
          }
        }
      }

      // 2. UPDATE PARTICLES & DEBRIS
      // Thruster exhaust particles
      gameStateRef.current.particles = gameStateRef.current.particles.filter((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt / p.maxLife;
        return p.life > 0;
      });

      // Explosion debris
      gameStateRef.current.debris = gameStateRef.current.debris.filter((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += PHYSICS_CONSTANTS.GRAVITY * 1.5 * dt; // Debris pulled down by lunar gravity
        if (p.angle !== undefined && p.rotationSpeed) {
          p.angle += p.rotationSpeed * dt;
        }
        p.life -= dt / p.maxLife;
        return p.life > 0;
      });

      // 3. HUD STATE SYNC (Throttle state updates to avoid React overhead)
      hudUpdateCounter++;
      if (hudUpdateCounter % 3 === 0) {
        setHudFuel(Math.round(lander.fuel));
        setHudAltitude(calculateAltitude(lander, gameStateRef.current.terrain.segments));
        setHudVSpeed(lander.vy);
        setHudHSpeed(lander.vx);
        setHudAngle((lander.angle * 180) / Math.PI);
      }

      // 4. CANVAS RENDERING
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Background stars
      const timeSec = currentTime / 1000;
      ctx.fillStyle = '#ffffff';
      for (const star of gameStateRef.current.stars) {
        const pulse = 0.5 + 0.5 * Math.sin(timeSec * star.pulseSpeed + star.x);
        ctx.globalAlpha = star.alpha * pulse;
        ctx.fillRect(star.x, star.y, star.size, star.size);
      }
      ctx.globalAlpha = 1.0;

      // Distant Earth crescent
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#0ea5e9';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(880, 110, 24, 0.4 * Math.PI, 1.6 * Math.PI);
      ctx.stroke();
      ctx.restore();

      // Render Terrain
      ctx.save();
      ctx.strokeStyle = theme.stroke;
      ctx.shadowColor = theme.glow;
      ctx.shadowBlur = 4;
      ctx.lineWidth = 2.0;

      const segments = gameStateRef.current.terrain.segments;
      const pads = gameStateRef.current.terrain.pads;

      // Draw vector jagged ground line
      ctx.beginPath();
      if (segments.length > 0) {
        ctx.moveTo(segments[0].p1.x, segments[0].p1.y);
        for (const seg of segments) {
          ctx.lineTo(seg.p2.x, seg.p2.y);
        }
      }
      ctx.stroke();

      // Draw subtle Atari-style vector vertical hatching lines down to canvas bottom
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.0;
      for (let x = 0; x <= CANVAS_WIDTH; x += 32) {
        const gy = calculateAltitude(
          {
            x,
            y: 0,
            vx: 0,
            vy: 0,
            angle: 0,
            fuel: 0,
            maxFuel: 0,
            thrustActive: false,
            rotateLeftActive: false,
            rotateRightActive: false,
          },
          segments
        );
        const terrainY = CANVAS_HEIGHT - gy;
        ctx.beginPath();
        ctx.moveTo(x, terrainY);
        ctx.lineTo(x, CANVAS_HEIGHT);
        ctx.stroke();
      }

      // Draw Landing Pads with landing deck indicators and blinking beacons
      for (const pad of pads) {
        // Double highlighted deck line for landing pads
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 8;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(pad.x1, pad.y);
        ctx.lineTo(pad.x2, pad.y);
        ctx.stroke();

        // Cross braces under pad to signify engineered structure
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = theme.stroke;
        ctx.beginPath();
        ctx.moveTo(pad.x1, pad.y);
        ctx.lineTo(pad.x1, pad.y + 12);
        ctx.moveTo(pad.x2, pad.y);
        ctx.lineTo(pad.x2, pad.y + 12);
        ctx.stroke();

        // Blinking hazard beacons on the edge of each pad
        const beaconBlink = Math.sin(timeSec * 6) > 0;
        if (beaconBlink) {
          ctx.fillStyle = pad.multiplier >= 5 ? '#f43f5e' : pad.multiplier >= 3 ? '#fbbf24' : '#22c55e';
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(pad.x1, pad.y - 3, 2.5, 0, Math.PI * 2);
          ctx.arc(pad.x2, pad.y - 3, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Multiplier label underneath pad
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 4;
        ctx.fillText(`${pad.multiplier}X`, (pad.x1 + pad.x2) / 2, pad.y + 22);
        ctx.font = '9px "Share Tech Mono", monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillText(pad.label, (pad.x1 + pad.x2) / 2, pad.y + 34);

        ctx.restore();
      }
      ctx.restore();

      // Render Particles (Thruster smoke/exhaust)
      ctx.save();
      for (const p of gameStateRef.current.particles) {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 4;
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Render Debris (Crash explosion)
      ctx.save();
      for (const p of gameStateRef.current.debris) {
        ctx.strokeStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.lineWidth = 1.6;
        ctx.globalAlpha = p.life;

        if (p.isLine && p.length && p.angle !== undefined) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          ctx.beginPath();
          ctx.moveTo(-p.length / 2, 0);
          ctx.lineTo(p.length / 2, 0);
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // Render Apollo Lunar Module (Wireframe) - unless crashed with debris flying
      if (state !== 'CRASHED') {
        ctx.save();
        ctx.translate(lander.x, lander.y);
        ctx.rotate(lander.angle);

        ctx.strokeStyle = theme.stroke;
        ctx.shadowColor = theme.glow;
        ctx.shadowBlur = 5;
        ctx.lineWidth = 1.6;

        // 1. Descent Stage (Octagonal core body)
        ctx.beginPath();
        ctx.moveTo(-12, -2);
        ctx.lineTo(-7, -7);
        ctx.lineTo(7, -7);
        ctx.lineTo(12, -2);
        ctx.lineTo(12, 6);
        ctx.lineTo(7, 10);
        ctx.lineTo(-7, 10);
        ctx.lineTo(-12, 6);
        ctx.closePath();
        ctx.stroke();

        // 2. Ascent Stage (Cabin on top)
        ctx.beginPath();
        ctx.moveTo(-8, -7);
        ctx.lineTo(-5, -14);
        ctx.lineTo(5, -14);
        ctx.lineTo(8, -7);
        ctx.stroke();

        // Cockpit window / front visor
        ctx.beginPath();
        ctx.moveTo(-3, -11);
        ctx.lineTo(3, -11);
        ctx.stroke();

        // Docking antenna on top
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(0, -18);
        ctx.stroke();

        // 3. Engine Bell Nozzle
        ctx.beginPath();
        ctx.moveTo(-4, 10);
        ctx.lineTo(-6, 14);
        ctx.lineTo(6, 14);
        ctx.lineTo(4, 10);
        ctx.stroke();

        // 4. Landing Gear Struts & Pads
        // Left Leg
        ctx.beginPath();
        ctx.moveTo(-9, 7);
        ctx.lineTo(-14, 15);
        ctx.moveTo(-17, 15);
        ctx.lineTo(-11, 15); // foot horizontal pad
        ctx.stroke();

        // Right Leg
        ctx.beginPath();
        ctx.moveTo(9, 7);
        ctx.lineTo(14, 15);
        ctx.moveTo(11, 15);
        ctx.lineTo(17, 15); // foot horizontal pad
        ctx.stroke();

        // Center cross struts
        ctx.beginPath();
        ctx.moveTo(-14, 15);
        ctx.lineTo(-6, 10);
        ctx.moveTo(14, 15);
        ctx.lineTo(6, 10);
        ctx.stroke();

        // 5. Reaction Control System (RCS) thrusters on sides
        ctx.beginPath();
        ctx.moveTo(-12, 1);
        ctx.lineTo(-15, 1);
        ctx.moveTo(12, 1);
        ctx.lineTo(15, 1);
        ctx.stroke();

        // Thruster flame animation if main thrust is firing
        if (lander.thrustActive && lander.fuel > 0) {
          const flameLength = 10 + Math.random() * 12;
          ctx.beginPath();
          ctx.strokeStyle = '#fbbf24';
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 10;
          ctx.lineWidth = 1.8;
          ctx.moveTo(-4, 14);
          ctx.lineTo(0, 14 + flameLength);
          ctx.lineTo(4, 14);
          ctx.stroke();

          // Inner white core
          ctx.beginPath();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          ctx.moveTo(-2, 14);
          ctx.lineTo(0, 14 + flameLength * 0.6);
          ctx.lineTo(2, 14);
          ctx.stroke();
        }

        // Side RCS thruster puffs
        if (lander.rotateLeftActive) {
          ctx.beginPath();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          ctx.moveTo(15, 1);
          ctx.lineTo(20 + Math.random() * 4, 1);
          ctx.stroke();
        }
        if (lander.rotateRightActive) {
          ctx.beginPath();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          ctx.moveTo(-15, 1);
          ctx.lineTo(-20 - Math.random() * 4, 1);
          ctx.stroke();
        }

        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [triggerCrash, triggerWin]);

  // Touch control handlers for on-screen mobile controls
  const handleTouchThrustStart = () => {
    gameStateRef.current.keys.up = true;
    if (gameStatus === 'PLAYING' && gameStateRef.current.lander.fuel > 0) {
      sound.startThruster();
    }
  };
  const handleTouchThrustEnd = () => {
    gameStateRef.current.keys.up = false;
    sound.stopThruster();
  };

  const handleTouchLeftStart = () => {
    gameStateRef.current.keys.left = true;
    if (gameStatus === 'PLAYING') sound.playRcs();
  };
  const handleTouchLeftEnd = () => {
    gameStateRef.current.keys.left = false;
  };

  const handleTouchRightStart = () => {
    gameStateRef.current.keys.right = true;
    if (gameStatus === 'PLAYING') sound.playRcs();
  };
  const handleTouchRightEnd = () => {
    gameStateRef.current.keys.right = false;
  };

  const isSafeVertical = Math.abs(hudVSpeed) <= PHYSICS_CONSTANTS.SAFE_V_SPEED;
  const isSafeHorizontal = Math.abs(hudHSpeed) <= PHYSICS_CONSTANTS.SAFE_H_SPEED;
  const isSafeAngle = Math.abs(hudAngle) <= (PHYSICS_CONSTANTS.SAFE_ANGLE_RAD * 180) / Math.PI;

  return (
    <div className="relative w-screen h-screen bg-black flex flex-col items-center justify-center select-none overflow-hidden font-tech">
      {/* Subtle retro CRT scanlines layer */}
      <div className="absolute inset-0 crt-overlay pointer-events-none z-30" />

      {/* Top Bar / Header */}
      <header className="w-full max-w-5xl px-4 py-2 flex items-center justify-between text-xs tracking-wider z-20 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-sm">
        {/* Brand Zone */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold tracking-widest text-zinc-100 flex items-center gap-1.5 font-arcade text-base">
            <span className="inline-block w-2.5 h-2.5 bg-emerald-400 rounded-none shadow-[0_0_8px_#34d399]" />
            LUNAR LANDER 1979
          </span>
          <span className="hidden sm:inline text-zinc-600">|</span>
          <span className="hidden sm:inline text-zinc-400">APOLLO GUIDANCE COMPUTER</span>
        </div>

        {/* Global Toolbar Actions */}
        <div className="flex items-center gap-2">
          {/* Theme Selector */}
          <div className="flex items-center gap-1 bg-zinc-900 px-2 py-1 border border-zinc-800">
            <Palette className="w-3.5 h-3.5 text-zinc-400" />
            {(Object.keys(THEMES) as ColorTheme[]).map((themeKey) => (
              <button
                key={themeKey}
                onClick={() => setCurrentTheme(themeKey)}
                title={THEMES[themeKey].name}
                className={`px-1.5 py-0.5 text-[10px] transition-colors ${
                  currentTheme === themeKey
                    ? 'bg-zinc-100 text-zinc-950 font-bold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {themeKey === 'vector-white'
                  ? 'WHT'
                  : themeKey === 'phosphor-green'
                  ? 'GRN'
                  : themeKey === 'amber-crt'
                  ? 'AMB'
                  : 'CYN'}
              </button>
            ))}
          </div>

          {/* Sound Toggle */}
          <button
            onClick={() => {
              const muted = sound.toggleMute();
              setIsMuted(muted);
            }}
            title={isMuted ? 'Unmute Sound (M)' : 'Mute Sound (M)'}
            className="p-1.5 border border-zinc-800 hover:border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white transition-colors"
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
          </button>

          {/* Help Toggle */}
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="p-1.5 border border-zinc-800 hover:border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white transition-colors"
            title="Flight Manual & Keys"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Game Screen Container */}
      <div className="relative flex-1 w-full max-w-5xl flex flex-col justify-center items-center p-2 sm:p-4">
        {/* Vector Canvas Container */}
        <div className="relative w-full aspect-[10/7] max-h-[72vh] border border-zinc-800 shadow-[0_0_30px_rgba(0,0,0,0.8)] overflow-hidden bg-black flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="w-full h-full object-contain block"
          />

          {/* Live In-Game HUD Telemetry Display (Overlay on top of vector canvas) */}
          <div className="absolute top-3 inset-x-4 flex justify-between pointer-events-none select-none z-10 text-[11px] sm:text-xs">
            {/* Left Telemetry: Mission & Score */}
            <div className="flex flex-col gap-1 bg-black/60 backdrop-blur-xs p-2 border border-zinc-800/80">
              <div className="flex items-center gap-3">
                <span className="text-zinc-500 font-mono">SCORE</span>
                <span className="text-white font-bold tracking-wider">{score.toString().padStart(5, '0')}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-zinc-500 font-mono">HIGH</span>
                <span className="text-amber-400 font-bold tracking-wider">{highScore.toString().padStart(5, '0')}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-zinc-500 font-mono">MISSION</span>
                <span className="text-zinc-300 font-mono">SITE #{missionNum}</span>
              </div>
            </div>

            {/* Center Status Banner (Safe vs Danger speed alert) */}
            {gameStatus === 'PLAYING' && (
              <div className="hidden md:flex flex-col items-center justify-center px-3 py-1 bg-black/70 border border-zinc-800">
                {isSafeVertical && isSafeHorizontal && isSafeAngle ? (
                  <span className="text-emerald-400 font-bold tracking-widest text-[11px] flex items-center gap-1.5 animate-pulse">
                    ● SAFE LANDING ATTITUDE
                  </span>
                ) : (
                  <span className="text-rose-500 font-bold tracking-widest text-[11px] flex items-center gap-1.5 animate-pulse">
                    ▲ WARNING: HAZARDOUS VELOCITY
                  </span>
                )}
                <span className="text-[10px] text-zinc-500">
                  PADS: 2X (WIDE) · 3X (MED) · 5X (NARROW)
                </span>
              </div>
            )}

            {/* Right Telemetry: Fuel, Altitude, V-Speed, H-Speed */}
            <div className="flex flex-col gap-1 bg-black/60 backdrop-blur-xs p-2 border border-zinc-800/80 min-w-[170px]">
              {/* Fuel Gauge */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-500 font-mono">FUEL</span>
                <span
                  className={`font-bold font-mono ${
                    hudFuel < 150
                      ? 'text-rose-500 animate-pulse'
                      : hudFuel < 350
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {hudFuel.toString().padStart(4, '0')} LBS
                </span>
              </div>
              {/* Visual Fuel Bar */}
              <div className="w-full h-1 bg-zinc-800 rounded-none overflow-hidden">
                <div
                  className={`h-full transition-all duration-75 ${
                    hudFuel < 150 ? 'bg-rose-500' : hudFuel < 350 ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, (hudFuel / 1000) * 100))}%` }}
                />
              </div>

              {/* Altitude */}
              <div className="flex items-center justify-between gap-3 pt-0.5">
                <span className="text-zinc-500 font-mono">ALTITUDE</span>
                <span className="text-white font-mono font-bold">{hudAltitude} M</span>
              </div>

              {/* Vertical Speed Indicator (Red if > safe threshold, Green if within safe) */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-500 font-mono">V-SPEED</span>
                <span
                  className={`font-mono font-bold flex items-center gap-1 ${
                    isSafeVertical ? 'text-emerald-400' : 'text-rose-500 font-extrabold'
                  }`}
                >
                  {hudVSpeed >= 0 ? '↓' : '↑'} {Math.abs(hudVSpeed).toFixed(1)}
                  <span className="text-[9px] text-zinc-500 font-normal">
                    (&le;{PHYSICS_CONSTANTS.SAFE_V_SPEED})
                  </span>
                </span>
              </div>

              {/* Horizontal Speed Indicator (Red if > safe threshold, Green if within safe) */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-500 font-mono">H-SPEED</span>
                <span
                  className={`font-mono font-bold flex items-center gap-1 ${
                    isSafeHorizontal ? 'text-emerald-400' : 'text-rose-500 font-extrabold'
                  }`}
                >
                  {hudHSpeed >= 0 ? '→' : '←'} {Math.abs(hudHSpeed).toFixed(1)}
                  <span className="text-[9px] text-zinc-500 font-normal">
                    (&le;{PHYSICS_CONSTANTS.SAFE_H_SPEED})
                  </span>
                </span>
              </div>

              {/* Pitch Angle Indicator */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-500 font-mono">PITCH</span>
                <span
                  className={`font-mono font-bold ${
                    isSafeAngle ? 'text-emerald-400' : 'text-rose-500'
                  }`}
                >
                  {hudAngle > 0 ? '+' : ''}{hudAngle.toFixed(1)}°
                </span>
              </div>
            </div>
          </div>

          {/* OVERLAY: TITLE SCREEN */}
          {gameStatus === 'TITLE' && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center z-20">
              <div className="max-w-md w-full border border-zinc-700 bg-zinc-950 p-6 shadow-2xl">
                <div className="mb-2 text-zinc-400 text-xs tracking-widest">
                  NASA / APOLLO PROGRAMME 1969
                </div>
                <h1 className="text-3xl sm:text-4xl font-arcade font-bold tracking-widest text-white mb-2">
                  LUNAR LANDER
                </h1>
                <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                  Pilot the Lunar Module to safe touchdown on designated landing pads. Control vertical descent, lateral drift, and attitude under low lunar gravity.
                </p>

                {/* Key specs */}
                <div className="grid grid-cols-2 gap-2 text-left text-xs mb-6 bg-zinc-900/60 p-3 border border-zinc-800">
                  <div>
                    <span className="text-zinc-500 block text-[10px]">MAIN ENGINE</span>
                    <span className="text-zinc-200">UP ARROW / W</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">ATTITUDE RCS</span>
                    <span className="text-zinc-200">LEFT / RIGHT ARROWS</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">SAFE V-SPEED</span>
                    <span className="text-emerald-400">&le; 18.0 M/S</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">SAFE H-SPEED</span>
                    <span className="text-emerald-400">&le; 11.0 M/S</span>
                  </div>
                </div>

                <button
                  onClick={() => initRound(true)}
                  className="w-full py-3 bg-white hover:bg-zinc-200 text-black font-bold tracking-widest text-sm transition-all transform active:scale-98 shadow-[0_0_15px_rgba(255,255,255,0.4)] flex items-center justify-center gap-2"
                >
                  START MISSION <ChevronRight className="w-4 h-4" />
                </button>
                <div className="mt-3 text-[11px] text-zinc-500">
                  PRESS <span className="text-zinc-300 font-bold">SPACEBAR</span> OR CLICK TO LAUNCH
                </div>
              </div>
            </div>
          )}

          {/* OVERLAY: LANDED / SUCCESS SCREEN */}
          {gameStatus === 'LANDED' && lastResult && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center z-20">
              <div className="max-w-md w-full border border-emerald-500/80 bg-zinc-950 p-6 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                <div className="text-emerald-400 text-xs tracking-widest font-bold mb-1 flex items-center justify-center gap-1.5">
                  <Trophy className="w-4 h-4" />
                  TOUCHDOWN CONFIRMED
                </div>
                <h2 className="text-2xl sm:text-3xl font-arcade font-bold tracking-widest text-white mb-4">
                  {lastResult.pad ? lastResult.pad.label : 'TRANQUILITY BASE'}
                </h2>

                {/* Score breakdown */}
                <div className="space-y-2 text-xs mb-6 bg-zinc-900/60 p-4 border border-zinc-800 text-left">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Pad Multiplier ({lastResult.pad?.multiplier}X):</span>
                    <span className="text-emerald-400 font-bold">+{lastResult.padBonus} PTS</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Remaining Fuel Bonus:</span>
                    <span className="text-emerald-400 font-bold">+{lastResult.fuelBonus} PTS</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Touchdown Softness:</span>
                    <span className="text-emerald-400 font-bold">+{lastResult.speedBonus} PTS</span>
                  </div>
                  <div className="pt-2 border-t border-zinc-800 flex justify-between font-bold text-sm">
                    <span className="text-white">ROUND SCORE:</span>
                    <span className="text-white font-mono">+{lastResult.scoreGained}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400 pt-1">
                    <span>TOTAL SCORE:</span>
                    <span className="text-amber-400 font-mono font-bold">{score}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const next = missionNum + 1;
                    setMissionNum(next);
                    gameStateRef.current.round = next;
                    initRound(false);
                  }}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold tracking-widest text-sm transition-all shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                >
                  NEXT SITE (PRESS SPACE)
                </button>
              </div>
            </div>
          )}

          {/* OVERLAY: CRASH SCREEN */}
          {gameStatus === 'CRASHED' && lastResult && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center z-20">
              <div className="max-w-md w-full border border-rose-600 bg-zinc-950 p-6 shadow-[0_0_30px_rgba(225,29,72,0.3)]">
                <div className="text-rose-500 text-xs tracking-widest font-bold mb-1">
                  CRITICAL TELEMETRY LOSS
                </div>
                <h2 className="text-2xl sm:text-3xl font-arcade font-bold tracking-widest text-rose-500 mb-2">
                  MODULE DESTROYED
                </h2>
                <p className="text-xs text-zinc-300 mb-6 bg-rose-950/40 border border-rose-900/50 p-3 leading-relaxed">
                  {lastResult.reason}
                </p>

                <div className="flex justify-between text-xs text-zinc-400 mb-6 px-4">
                  <span>FINAL SCORE: <strong className="text-white">{score}</strong></span>
                  <span>HIGH SCORE: <strong className="text-amber-400">{highScore}</strong></span>
                </div>

                <button
                  onClick={() => initRound(true)}
                  className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold tracking-widest text-sm transition-all shadow-[0_0_15px_rgba(225,29,72,0.4)]"
                >
                  RETRY MISSION (PRESS SPACE)
                </button>
              </div>
            </div>
          )}

          {/* OVERLAY: PAUSED SCREEN */}
          {gameStatus === 'PAUSED' && (
            <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center z-20">
              <div className="border border-zinc-700 bg-zinc-950 px-8 py-6 text-center">
                <h3 className="text-2xl font-arcade text-white tracking-widest mb-3">MISSION PAUSED</h3>
                <p className="text-xs text-zinc-400 mb-4">PRESS 'P' OR BUTTON BELOW TO RESUME</p>
                <button
                  onClick={() => {
                    gameStateRef.current.status = 'PLAYING';
                    gameStateRef.current.lastTime = performance.now();
                    setGameStatus('PLAYING');
                  }}
                  className="px-6 py-2 bg-white text-black font-bold text-xs tracking-wider"
                >
                  RESUME
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Responsive Mobile / Touch Controls Bar */}
        <div className="w-full max-w-5xl mt-3 flex items-center justify-between gap-2 px-1">
          {/* Left/Right Rotate Touch Controls */}
          <div className="flex items-center gap-2">
            <button
              onPointerDown={handleTouchLeftStart}
              onPointerUp={handleTouchLeftEnd}
              onPointerLeave={handleTouchLeftEnd}
              className="h-12 w-14 sm:w-16 bg-zinc-900 border border-zinc-700 active:bg-zinc-700 text-zinc-200 flex flex-col items-center justify-center text-[10px] font-bold select-none active:scale-95 transition-transform"
              title="Rotate Left (Left Arrow or A)"
            >
              <ArrowLeft className="w-4 h-4 mb-0.5" />
              <span>LEFT</span>
            </button>

            <button
              onPointerDown={handleTouchRightStart}
              onPointerUp={handleTouchRightEnd}
              onPointerLeave={handleTouchRightEnd}
              className="h-12 w-14 sm:w-16 bg-zinc-900 border border-zinc-700 active:bg-zinc-700 text-zinc-200 flex flex-col items-center justify-center text-[10px] font-bold select-none active:scale-95 transition-transform"
              title="Rotate Right (Right Arrow or D)"
            >
              <ArrowRight className="w-4 h-4 mb-0.5" />
              <span>RIGHT</span>
            </button>
          </div>

          {/* Quick Action restart/pause on mobile */}
          <div className="flex items-center gap-2 text-zinc-400 text-xs">
            <button
              onClick={() => {
                if (gameStatus === 'PLAYING') {
                  initRound(false);
                } else if (gameStatus === 'TITLE' || gameStatus === 'CRASHED') {
                  initRound(true);
                } else if (gameStatus === 'LANDED') {
                  const next = missionNum + 1;
                  setMissionNum(next);
                  gameStateRef.current.round = next;
                  initRound(false);
                }
              }}
              className="h-12 px-3 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 flex items-center gap-1.5 text-xs font-bold transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">RESET</span>
            </button>

            <button
              onClick={() => {
                if (gameStatus === 'PLAYING') {
                  gameStateRef.current.status = 'PAUSED';
                  setGameStatus('PAUSED');
                  sound.stopThruster();
                } else if (gameStatus === 'PAUSED') {
                  gameStateRef.current.status = 'PLAYING';
                  gameStateRef.current.lastTime = performance.now();
                  setGameStatus('PLAYING');
                }
              }}
              className="h-12 px-3 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 flex items-center gap-1.5 text-xs font-bold transition-colors"
            >
              {gameStatus === 'PAUSED' ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{gameStatus === 'PAUSED' ? 'RESUME' : 'PAUSE'}</span>
            </button>
          </div>

          {/* Main Thrust Touch Button */}
          <button
            onPointerDown={handleTouchThrustStart}
            onPointerUp={handleTouchThrustEnd}
            onPointerLeave={handleTouchThrustEnd}
            className="h-12 px-5 sm:px-8 bg-zinc-100 hover:bg-white active:bg-zinc-300 text-black border border-white flex items-center justify-center gap-2 text-xs font-bold select-none active:scale-95 transition-transform shadow-[0_0_12px_rgba(255,255,255,0.3)]"
            title="Fire Main Thruster (Up Arrow or W)"
          >
            <Flame className="w-4 h-4 text-amber-500 fill-amber-500" />
            <span>MAIN THRUST</span>
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>

        {/* Desktop Keyboard Hints Footer */}
        <div className="hidden sm:flex items-center justify-between w-full max-w-5xl mt-2 text-[11px] text-zinc-500 px-2">
          <div>
            CONTROLS: <span className="text-zinc-400">↑ / W</span> THRUST &middot;{' '}
            <span className="text-zinc-400">← / A &amp; → / D</span> ROTATE &middot;{' '}
            <span className="text-zinc-400">SPACE</span> RESTART / NEXT &middot;{' '}
            <span className="text-zinc-400">M</span> MUTE &middot;{' '}
            <span className="text-zinc-400">P</span> PAUSE
          </div>
          <div>
            CRITERIA: V-SPEED &le; 18.0 &middot; H-SPEED &le; 11.0 &middot; TILT &le; 6.8&deg;
          </div>
        </div>
      </div>

      {/* Flight Manual / Help Modal */}
      {showHelp && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-zinc-950 border border-zinc-700 p-6 shadow-2xl text-xs space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h2 className="text-sm font-bold text-white tracking-widest font-arcade text-lg">
                APOLLO LUNAR MODULE FLIGHT MANUAL
              </h2>
              <button
                onClick={() => setShowHelp(false)}
                className="text-zinc-400 hover:text-white px-2 py-1 bg-zinc-900 border border-zinc-800"
              >
                CLOSE
              </button>
            </div>

            <div className="space-y-3 text-zinc-300">
              <p>
                Welcome, Commander. You are piloting the Apollo Lunar Module descent stage. Your objective is to achieve a controlled touchdown on the rugged lunar surface.
              </p>

              <div className="border border-zinc-800 bg-zinc-900/50 p-3 space-y-1.5">
                <div className="font-bold text-white text-[11px]">LANDING REQUIREMENTS:</div>
                <ul className="list-disc list-inside space-y-1 text-zinc-400 text-[11px]">
                  <li>Both landing gear pads must touch down squarely on a flat landing pad.</li>
                  <li>Vertical Speed ($V_y$) must not exceed <strong>18.0 m/s</strong> (Indicator turns green).</li>
                  <li>Horizontal Drift ($V_x$) must not exceed <strong>11.0 m/s</strong> (Indicator turns green).</li>
                  <li>Lander tilt pitch must be upright within <strong>6.8&deg;</strong> of vertical.</li>
                  <li>Do not let the cabin or descent hull strike rocks.</li>
                </ul>
              </div>

              <div className="border border-zinc-800 bg-zinc-900/50 p-3 space-y-1.5">
                <div className="font-bold text-white text-[11px]">PAD MULTIPLIERS:</div>
                <div className="grid grid-cols-3 gap-2 text-center text-[11px] pt-1">
                  <div className="p-2 bg-black border border-zinc-800">
                    <span className="block font-bold text-emerald-400">2X</span>
                    <span className="text-zinc-400">Wide Pad</span>
                  </div>
                  <div className="p-2 bg-black border border-zinc-800">
                    <span className="block font-bold text-amber-400">3X</span>
                    <span className="text-zinc-400">Medium Pad</span>
                  </div>
                  <div className="p-2 bg-black border border-zinc-800">
                    <span className="block font-bold text-rose-400">5X</span>
                    <span className="text-zinc-400">Narrow Ledge</span>
                  </div>
                </div>
              </div>

              <div className="text-zinc-500 text-[11px]">
                Tip: Feather the thruster in short pulses to conserve fuel and maintain stable descent velocity without over-correcting!
              </div>
            </div>

            <button
              onClick={() => setShowHelp(false)}
              className="w-full py-2.5 bg-zinc-100 text-black font-bold tracking-wider hover:bg-white"
            >
              RETURN TO COCKPIT
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
