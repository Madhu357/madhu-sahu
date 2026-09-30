export interface Point {
  x: number;
  y: number;
}

export interface LandingPad {
  id: string;
  x1: number;
  x2: number;
  y: number;
  width: number;
  multiplier: number;
  label: string;
}

export interface TerrainSegment {
  p1: Point;
  p2: Point;
  isPad: boolean;
  padData?: LandingPad;
}

export interface Lander {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number; // in radians, 0 is straight up
  fuel: number;
  maxFuel: number;
  thrustActive: boolean;
  rotateLeftActive: boolean;
  rotateRightActive: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  isLine?: boolean;
  length?: number;
  angle?: number;
  rotationSpeed?: number;
}

export type GameStatus = 'TITLE' | 'PLAYING' | 'LANDED' | 'CRASHED' | 'PAUSED';

export interface LandingResult {
  success: boolean;
  reason: string;
  pad?: LandingPad;
  scoreGained: number;
  fuelBonus: number;
  speedBonus: number;
  padBonus: number;
}

export type ColorTheme = 'vector-white' | 'phosphor-green' | 'amber-crt' | 'cyan-glow';
