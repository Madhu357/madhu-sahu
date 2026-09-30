import { LandingPad, Point, TerrainSegment } from './types';

export interface TerrainData {
  points: Point[];
  segments: TerrainSegment[];
  pads: LandingPad[];
}

/**
 * Generates procedural jagged vector lunar terrain with guaranteed flat landing pads
 */
export function generateTerrain(width: number, height: number): TerrainData {
  const points: Point[] = [];
  const segments: TerrainSegment[] = [];
  const pads: LandingPad[] = [];

  // Base parameters
  const minPadY = height * 0.65;
  const maxPadY = height * 0.86;

  // Define 3 landing pads of varying widths and multipliers
  // Pad 1: Wide landing pad (Easy, 2X)
  const pad1Width = 110 + Math.floor(Math.random() * 25);
  const pad1X = width * 0.12 + Math.random() * (width * 0.15);
  const pad1Y = minPadY + Math.random() * (maxPadY - minPadY);

  const pad1: LandingPad = {
    id: 'pad-alpha',
    label: 'SITE ALPHA',
    x1: Math.round(pad1X),
    x2: Math.round(pad1X + pad1Width),
    y: Math.round(pad1Y),
    width: pad1Width,
    multiplier: 2,
  };

  // Pad 2: Medium landing pad (Medium, 3X)
  const pad2Width = 75 + Math.floor(Math.random() * 15);
  const pad2X = width * 0.45 + Math.random() * (width * 0.12);
  const pad2Y = minPadY + Math.random() * (maxPadY - minPadY);

  const pad2: LandingPad = {
    id: 'pad-bravo',
    label: 'SITE BRAVO',
    x1: Math.round(pad2X),
    x2: Math.round(pad2X + pad2Width),
    y: Math.round(pad2Y),
    width: pad2Width,
    multiplier: 3,
  };

  // Pad 3: Narrow landing pad (Hard / Expert, 5X)
  const pad3Width = 50 + Math.floor(Math.random() * 12);
  const pad3X = width * 0.76 + Math.random() * (width * 0.10);
  const pad3Y = minPadY + Math.random() * (maxPadY - minPadY);

  const pad3: LandingPad = {
    id: 'pad-charlie',
    label: 'SITE CHARLIE',
    x1: Math.round(pad3X),
    x2: Math.round(pad3X + pad3Width),
    y: Math.round(pad3Y),
    width: pad3Width,
    multiplier: 5,
  };

  pads.push(pad1, pad2, pad3);

  // Helper to recursively displace segments to create rugged moon terrain
  function displace(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    roughness: number,
    depth: number
  ): Point[] {
    if (depth <= 0 || Math.abs(x2 - x1) < 18) {
      return [{ x: x1, y: y1 }];
    }

    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2 + (Math.random() * 2 - 1) * roughness * (x2 - x1) * 0.6;
    // Constrain within sensible vertical boundaries
    const clampedMidY = Math.max(height * 0.52, Math.min(height * 0.94, midY));

    return [
      ...displace(x1, y1, midX, clampedMidY, roughness * 0.8, depth - 1),
      ...displace(midX, clampedMidY, x2, y2, roughness * 0.8, depth - 1),
    ];
  }

  // Construct continuous path from x = 0 to x = width
  const startY = height * 0.72 + (Math.random() * 2 - 1) * 50;
  const endY = height * 0.72 + (Math.random() * 2 - 1) * 50;

  // Sequence of terrain anchors:
  // 0 -> pad1.x1 -> pad1.x2 -> pad2.x1 -> pad2.x2 -> pad3.x1 -> pad3.x2 -> width
  const pts0 = displace(0, startY, pad1.x1, pad1.y, 0.45, 4);
  points.push(...pts0);

  // Flat Pad 1
  points.push({ x: pad1.x1, y: pad1.y });
  points.push({ x: pad1.x2, y: pad1.y });

  // Jagged terrain between Pad 1 and Pad 2 (with dramatic lunar peak or crater)
  const peakX = (pad1.x2 + pad2.x1) / 2;
  const peakY = height * 0.56 + (Math.random() * 2 - 1) * 35;
  const pts1a = displace(pad1.x2, pad1.y, peakX, peakY, 0.5, 3);
  const pts1b = displace(peakX, peakY, pad2.x1, pad2.y, 0.5, 3);
  points.push(...pts1a.slice(1));
  points.push(...pts1b.slice(1));

  // Flat Pad 2
  points.push({ x: pad2.x1, y: pad2.y });
  points.push({ x: pad2.x2, y: pad2.y });

  // Jagged terrain between Pad 2 and Pad 3
  const valleyX = (pad2.x2 + pad3.x1) / 2;
  const valleyY = height * 0.82 + (Math.random() * 2 - 1) * 30;
  const pts2a = displace(pad2.x2, pad2.y, valleyX, valleyY, 0.5, 3);
  const pts2b = displace(valleyX, valleyY, pad3.x1, pad3.y, 0.5, 3);
  points.push(...pts2a.slice(1));
  points.push(...pts2b.slice(1));

  // Flat Pad 3
  points.push({ x: pad3.x1, y: pad3.y });
  points.push({ x: pad3.x2, y: pad3.y });

  // Jagged terrain to the right edge
  const pts3 = displace(pad3.x2, pad3.y, width, endY, 0.5, 4);
  points.push(...pts3.slice(1));
  points.push({ x: width, y: endY });

  // Build segments and identify landing pads
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    // Check if this segment exactly matches any pad
    const pad = pads.find(
      (p) => Math.abs(p.x1 - p1.x) < 2 && Math.abs(p.x2 - p2.x) < 2 && Math.abs(p.y - p1.y) < 2
    );

    segments.push({
      p1,
      p2,
      isPad: Boolean(pad),
      padData: pad,
    });
  }

  return { points, segments, pads };
}

/**
 * Returns the terrain surface Y elevation at given x coordinate
 */
export function getTerrainHeightAt(x: number, segments: TerrainSegment[]): number {
  for (const seg of segments) {
    const minX = Math.min(seg.p1.x, seg.p2.x);
    const maxX = Math.max(seg.p1.x, seg.p2.x);

    if (x >= minX && x <= maxX) {
      if (Math.abs(maxX - minX) < 0.0001) {
        return Math.min(seg.p1.y, seg.p2.y);
      }
      const t = (x - seg.p1.x) / (seg.p2.x - seg.p1.x);
      return seg.p1.y + t * (seg.p2.y - seg.p1.y);
    }
  }

  // Fallback to first or last
  if (segments.length > 0) {
    if (x < segments[0].p1.x) return segments[0].p1.y;
    return segments[segments.length - 1].p2.y;
  }

  return 600;
}
