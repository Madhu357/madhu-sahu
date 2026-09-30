import { Lander, LandingResult, Point, TerrainSegment } from './types';
import { getTerrainHeightAt } from './terrain';

export const PHYSICS_CONSTANTS = {
  GRAVITY: 26.0,          // Downward gravity in px/s^2
  THRUST_FORCE: 70.0,     // Upward thrust power in px/s^2
  ROTATION_SPEED: 2.1,    // Radians per second
  SAFE_V_SPEED: 18.0,     // Max vertical touch speed in px/s
  SAFE_H_SPEED: 11.0,     // Max horizontal touch speed in px/s
  SAFE_ANGLE_RAD: 0.12,   // Max allowable tilt angle (~6.8 degrees)
  MAIN_FUEL_BURN: 22.0,   // Fuel units / sec
  RCS_FUEL_BURN: 4.0,     // Fuel units / sec
  WIDTH: 1000,
  HEIGHT: 700,
};

export interface LanderContactPoints {
  leftFoot: Point;
  rightFoot: Point;
  nozzle: Point;
  cabinTop: Point;
  cabinLeft: Point;
  cabinRight: Point;
  hullBottomLeft: Point;
  hullBottomRight: Point;
}

/**
 * Calculates current world coordinates for all lander contact points
 */
export function getLanderContactPoints(lander: Lander): LanderContactPoints {
  const cos = Math.cos(lander.angle);
  const sin = Math.sin(lander.angle);

  const rotate = (rx: number, ry: number): Point => ({
    x: lander.x + (rx * cos - ry * sin),
    y: lander.y + (rx * sin + ry * cos),
  });

  return {
    leftFoot: rotate(-14, 15),
    rightFoot: rotate(14, 15),
    nozzle: rotate(0, 11),
    cabinTop: rotate(0, -14),
    cabinLeft: rotate(-9, -7),
    cabinRight: rotate(9, -7),
    hullBottomLeft: rotate(-11, 7),
    hullBottomRight: rotate(11, 7),
  };
}

/**
 * Calculates altitude as distance from lowest landing foot to terrain directly beneath
 */
export function calculateAltitude(lander: Lander, segments: TerrainSegment[]): number {
  const points = getLanderContactPoints(lander);
  const footX = (points.leftFoot.x + points.rightFoot.x) / 2;
  const footY = Math.max(points.leftFoot.y, points.rightFoot.y);
  const groundY = getTerrainHeightAt(footX, segments);
  return Math.max(0, Math.round(groundY - footY));
}

/**
 * Checks if line segments (p1-p2) and (p3-p4) intersect
 */
function lineIntersects(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const ccw = (A: Point, B: Point, C: Point) => {
    return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
  };
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

/**
 * Evaluates whether lander has touched ground, landed safely, or crashed
 */
export function checkCollision(
  lander: Lander,
  segments: TerrainSegment[],
  worldWidth: number,
  worldHeight: number
): { collided: boolean; result?: LandingResult } {
  // 1. Off-screen boundary check
  if (
    lander.x < -10 ||
    lander.x > worldWidth + 10 ||
    lander.y < -80 ||
    lander.y > worldHeight + 40
  ) {
    return {
      collided: true,
      result: {
        success: false,
        reason: 'CRITICAL TRAJECTORY: CRAFT DRIFTED OUT OF SECTOR',
        scoreGained: 0,
        fuelBonus: 0,
        speedBonus: 0,
        padBonus: 0,
      },
    };
  }

  const contacts = getLanderContactPoints(lander);
  const contactList: Point[] = [
    contacts.leftFoot,
    contacts.rightFoot,
    contacts.nozzle,
    contacts.cabinTop,
    contacts.cabinLeft,
    contacts.cabinRight,
    contacts.hullBottomLeft,
    contacts.hullBottomRight,
  ];

  // 2. Check if any contact point penetrated terrain
  let hitGround = false;
  let groundYAtLeftFoot = 0;
  let groundYAtRightFoot = 0;

  for (const pt of contactList) {
    const gy = getTerrainHeightAt(pt.x, segments);
    if (pt === contacts.leftFoot) groundYAtLeftFoot = gy;
    if (pt === contacts.rightFoot) groundYAtRightFoot = gy;

    if (pt.y >= gy) {
      hitGround = true;
      break;
    }
  }

  // 3. Also check line collision between lander landing base and terrain segments
  if (!hitGround) {
    for (const seg of segments) {
      if (lineIntersects(contacts.leftFoot, contacts.rightFoot, seg.p1, seg.p2)) {
        hitGround = true;
        break;
      }
    }
  }

  if (!hitGround) {
    return { collided: false };
  }

  // A ground impact occurred. Test for clean touchdown!
  // Find which pad the feet are on, if any.
  let matchingPad = null;
  for (const seg of segments) {
    if (seg.isPad && seg.padData) {
      const pad = seg.padData;
      // Both landing pads must be inside the horizontal pad range with slight tolerance
      const leftInside = contacts.leftFoot.x >= pad.x1 - 2 && contacts.leftFoot.x <= pad.x2 + 2;
      const rightInside = contacts.rightFoot.x >= pad.x1 - 2 && contacts.rightFoot.x <= pad.x2 + 2;

      if (leftInside && rightInside) {
        matchingPad = pad;
        break;
      }
    }
  }

  const vSpeed = Math.abs(lander.vy);
  const hSpeed = Math.abs(lander.vx);
  const angleDeg = (Math.abs(lander.angle) * 180) / Math.PI;

  // Criteria for successful landing
  const onPad = Boolean(matchingPad);
  const safeVertical = vSpeed <= PHYSICS_CONSTANTS.SAFE_V_SPEED;
  const safeHorizontal = hSpeed <= PHYSICS_CONSTANTS.SAFE_H_SPEED;
  const safeAngle = Math.abs(lander.angle) <= PHYSICS_CONSTANTS.SAFE_ANGLE_RAD;

  // Check if cabin or hull hit first
  const cabinHit =
    contacts.cabinTop.y >= getTerrainHeightAt(contacts.cabinTop.x, segments) ||
    contacts.cabinLeft.y >= getTerrainHeightAt(contacts.cabinLeft.x, segments) ||
    contacts.cabinRight.y >= getTerrainHeightAt(contacts.cabinRight.x, segments);

  if (onPad && safeVertical && safeHorizontal && safeAngle && !cabinHit) {
    const padBonus = 100 * (matchingPad?.multiplier || 1);
    const fuelBonus = Math.floor(lander.fuel * 2.5);
    const speedBonus = Math.max(
      0,
      Math.floor((PHYSICS_CONSTANTS.SAFE_V_SPEED - vSpeed) * 12) +
        Math.floor((PHYSICS_CONSTANTS.SAFE_H_SPEED - hSpeed) * 8)
    );
    const totalScore = padBonus + fuelBonus + speedBonus;

    return {
      collided: true,
      result: {
        success: true,
        reason: `EAGLE HAS LANDED ON ${matchingPad?.label}!`,
        pad: matchingPad || undefined,
        scoreGained: totalScore,
        fuelBonus,
        speedBonus,
        padBonus,
      },
    };
  }

  // Crash failure reason diagnosis
  let failureReason = 'CRAFT DESTROYED ON RUGGED LUNAR CRAGS';
  if (cabinHit || angleDeg > 18) {
    failureReason = `STRUCTURAL INVERSION: MODULE ROLLED OVER (${angleDeg.toFixed(1)}° TILT)`;
  } else if (!onPad) {
    failureReason = 'MISSED DESIGNATED LANDING SITE: IMPACTED ROCKY TERRAIN';
  } else if (!safeVertical && !safeHorizontal) {
    failureReason = `EXCESSIVE IMPACT: V-SPEED ${vSpeed.toFixed(1)} & H-SPEED ${hSpeed.toFixed(1)} EXCEEDED LIMITS`;
  } else if (!safeVertical) {
    failureReason = `HARD CRASH-DOWN: DESCENT RATE ${vSpeed.toFixed(1)} EXCEEDED LIMIT (${PHYSICS_CONSTANTS.SAFE_V_SPEED})`;
  } else if (!safeHorizontal) {
    failureReason = `LATERAL SHEAR: HORIZONTAL DRIFT ${hSpeed.toFixed(1)} EXCEEDED LIMIT (${PHYSICS_CONSTANTS.SAFE_H_SPEED})`;
  } else if (!safeAngle) {
    failureReason = `UNEVEN TOUCHDOWN: TILT ${angleDeg.toFixed(1)}° EXCEEDED SAFE TOLERANCE (6.8°)`;
  }

  return {
    collided: true,
    result: {
      success: false,
      reason: failureReason,
      scoreGained: 0,
      fuelBonus: 0,
      speedBonus: 0,
      padBonus: 0,
    },
  };
}
