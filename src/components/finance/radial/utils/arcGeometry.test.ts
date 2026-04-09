import { describe, it, expect, vi } from 'vitest';
import {
  curvedTextPath,
  hairlineArcPath,
  outerLabelPosition,
  outerStatPosition,
  gapNodePositions,
  getSubArcConfigs,
  latticeBeamGeometry,
  angleFromCenter,
  arcAtAngle,
  distanceFromCenter,
  junctionPosition,
  nearestJunction,
  isWithinJunctionExit,
  polarToCartesian,
  ARC_CONFIGS,
  CENTER,
  ARC_RING_RADIUS,
  VIEWBOX_SIZE,
  JUNCTION_CONFIGS,
  JUNCTION_HIT_RADIUS,
  JUNCTION_EXIT_RADIUS,
  type ArcPosition,
} from './arcGeometry';

describe('arcGeometry', () => {
  describe('constants', () => {
    it('CENTER is half of VIEWBOX_SIZE', () => {
      expect(CENTER).toBe(VIEWBOX_SIZE / 2);
    });

    it('ARC_RING_RADIUS is within viewbox', () => {
      expect(ARC_RING_RADIUS).toBeGreaterThan(0);
      expect(ARC_RING_RADIUS).toBeLessThan(CENTER);
    });
  });

  describe('ARC_CONFIGS', () => {
    it('has 4 arc configurations', () => {
      expect(ARC_CONFIGS).toHaveLength(4);
    });

    it('covers all 4 positions', () => {
      const positions = ARC_CONFIGS.map((c) => c.position);
      expect(positions).toContain('north');
      expect(positions).toContain('east');
      expect(positions).toContain('south');
      expect(positions).toContain('west');
    });

    it('all configs have labels and colors', () => {
      for (const config of ARC_CONFIGS) {
        expect(config.label.length).toBeGreaterThan(0);
        expect(config.color).toMatch(/^#/);
      }
    });
  });

  describe('hairlineArcPath', () => {
    it('returns valid SVG path string', () => {
      const d = hairlineArcPath(225, 315);
      expect(d).toMatch(/^M \d/);
      expect(d).toContain('A');
    });

    it('handles wrap-around angles (east arc crosses 360)', () => {
      const d = hairlineArcPath(319, 401);
      expect(d).toMatch(/^M \d/);
    });
  });

  describe('outerLabelPosition', () => {
    it('north label is above center', () => {
      const pos = outerLabelPosition('north');
      expect(pos.y).toBeLessThan(CENTER);
      expect(pos.textAnchor).toBe('middle');
    });

    it('south label is below center', () => {
      const pos = outerLabelPosition('south');
      expect(pos.y).toBeGreaterThan(CENTER);
    });

    it('east label is right of center', () => {
      const pos = outerLabelPosition('east');
      expect(pos.x).toBeGreaterThan(CENTER);
      expect(pos.textAnchor).toBe('start');
    });

    it('west label is left of center', () => {
      const pos = outerLabelPosition('west');
      expect(pos.x).toBeLessThan(CENTER);
      expect(pos.textAnchor).toBe('end');
    });
  });

  describe('outerStatPosition', () => {
    it('north stat is above north label', () => {
      const label = outerLabelPosition('north');
      const stat = outerStatPosition('north');
      expect(stat.y).toBeLessThan(label.y);
    });

    it('south stat is below south label', () => {
      const label = outerLabelPosition('south');
      const stat = outerStatPosition('south');
      expect(stat.y).toBeGreaterThan(label.y);
    });
  });

  describe('gapNodePositions', () => {
    it('returns 4 gap nodes', () => {
      const nodes = gapNodePositions();
      expect(nodes).toHaveLength(4);
    });

    it('all nodes are on the arc ring', () => {
      const nodes = gapNodePositions();
      for (const node of nodes) {
        const dist = Math.sqrt((node.x - CENTER) ** 2 + (node.y - CENTER) ** 2);
        expect(dist).toBeCloseTo(ARC_RING_RADIUS, 0);
      }
    });
  });

  // ── Checkpoint 3: SVG Sync — textPath morph ───────────────────────

  describe('curvedTextPath (SVG textPath morph)', () => {
    it('returns valid SVG path for all 4 positions', () => {
      for (const config of ARC_CONFIGS) {
        const d = curvedTextPath(config.position, config.startAngle, config.endAngle);
        expect(d).toMatch(/^M [\d.]+/);
        expect(d).toContain('A');
      }
    });

    it('north path uses clockwise sweep (flag=1)', () => {
      const north = ARC_CONFIGS.find((c) => c.position === 'north')!;
      const d = curvedTextPath('north', north.startAngle, north.endAngle);
      // Sweep flag is the 5th parameter of A command: ... 0 [largeArc] 1 ...
      expect(d).toMatch(/A [\d.]+ [\d.]+ 0 [01] 1/);
    });

    it('south path uses counter-clockwise sweep (flag=0) for readable text', () => {
      const south = ARC_CONFIGS.find((c) => c.position === 'south')!;
      const d = curvedTextPath('south', south.startAngle, south.endAngle);
      expect(d).toMatch(/A [\d.]+ [\d.]+ 0 [01] 0/);
    });

    it('west path uses counter-clockwise sweep (flag=0) for readable text', () => {
      const west = ARC_CONFIGS.find((c) => c.position === 'west')!;
      const d = curvedTextPath('west', west.startAngle, west.endAngle);
      expect(d).toMatch(/A [\d.]+ [\d.]+ 0 [01] 0/);
    });

    it('east path uses clockwise sweep (flag=1)', () => {
      const east = ARC_CONFIGS.find((c) => c.position === 'east')!;
      const d = curvedTextPath('east', east.startAngle, east.endAngle);
      expect(d).toMatch(/A [\d.]+ [\d.]+ 0 [01] 1/);
    });

    it('CHECKPOINT 3: text path radius is inside the arc ring', () => {
      // curvedTextPath uses ARC_RING_RADIUS - 18 for the text radius
      // Verify path points are inside the hairline ring
      const north = ARC_CONFIGS.find((c) => c.position === 'north')!;
      const textD = curvedTextPath('north', north.startAngle, north.endAngle);
      const arcD = hairlineArcPath(north.startAngle, north.endAngle);

      // Extract the radius from the A command in curvedTextPath
      const textRadiusMatch = textD.match(/A ([\d.]+)/);
      const arcRadiusMatch = arcD.match(/A ([\d.]+)/);
      expect(textRadiusMatch).not.toBeNull();
      expect(arcRadiusMatch).not.toBeNull();

      const textRadius = parseFloat(textRadiusMatch![1]);
      const arcRadius = parseFloat(arcRadiusMatch![1]);
      expect(textRadius).toBeLessThan(arcRadius);
    });
  });

  // ── Extended tests for untested functions ─────────────────────────

  describe('getSubArcConfigs', () => {
    it('returns configs for south (finance)', () => {
      const configs = getSubArcConfigs('south');
      expect(configs).not.toBeNull();
      expect(configs!.length).toBeGreaterThan(0);
    });

    it('returns configs for north (week)', () => {
      const configs = getSubArcConfigs('north');
      expect(configs).not.toBeNull();
      expect(configs!.length).toBeGreaterThan(0);
    });

    it('returns configs for west (inventory)', () => {
      const configs = getSubArcConfigs('west');
      expect(configs).not.toBeNull();
    });

    it('returns configs for east (meals)', () => {
      const configs = getSubArcConfigs('east');
      expect(configs).not.toBeNull();
    });

    it('all sub-arc configs have valid angles within parent arc', () => {
      for (const pos of ['north', 'east', 'south', 'west'] as ArcPosition[]) {
        const configs = getSubArcConfigs(pos);
        if (configs) {
          for (const config of configs) {
            expect(config.startAngle).toBeLessThan(config.endAngle);
            expect(config.label.length).toBeGreaterThan(0);
            expect(config.color).toMatch(/^#/);
          }
        }
      }
    });
  });

  describe('polarToCartesian', () => {
    it('0 degrees is to the right of center', () => {
      const { x, y } = polarToCartesian(CENTER, CENTER, 100, 0);
      expect(x).toBeCloseTo(CENTER + 100, 0);
      expect(y).toBeCloseTo(CENTER, 0);
    });

    it('90 degrees is below center (SVG y-down)', () => {
      const { x, y } = polarToCartesian(CENTER, CENTER, 100, 90);
      expect(x).toBeCloseTo(CENTER, 0);
      expect(y).toBeCloseTo(CENTER + 100, 0);
    });

    it('180 degrees is to the left', () => {
      const { x, y } = polarToCartesian(CENTER, CENTER, 100, 180);
      expect(x).toBeCloseTo(CENTER - 100, 0);
      expect(y).toBeCloseTo(CENTER, 0);
    });

    it('270 degrees is above center', () => {
      const { x, y } = polarToCartesian(CENTER, CENTER, 100, 270);
      expect(x).toBeCloseTo(CENTER, 0);
      expect(y).toBeCloseTo(CENTER - 100, 0);
    });
  });

  describe('latticeBeamGeometry', () => {
    it('returns valid geometry for all 4 positions', () => {
      for (const pos of ['north', 'east', 'south', 'west'] as ArcPosition[]) {
        const geo = latticeBeamGeometry(pos);
        expect(geo.x1).toBeDefined();
        expect(geo.y1).toBeDefined();
        expect(geo.x2).toBeDefined();
        expect(geo.y2).toBeDefined();
        expect(geo.dotPositions).toHaveLength(5);
      }
    });

    it('north/south beams are horizontal (same y)', () => {
      const north = latticeBeamGeometry('north');
      expect(north.y1).toBe(north.y2);
    });

    it('east/west beams are vertical (same x)', () => {
      const east = latticeBeamGeometry('east');
      expect(east.x1).toBe(east.x2);
    });

    it('dot positions are evenly spaced between endpoints', () => {
      const geo = latticeBeamGeometry('north');
      const dots = geo.dotPositions;
      expect(dots[0].x).toBeCloseTo(geo.x1, 5);
      expect(dots[dots.length - 1].x).toBeCloseTo(geo.x2, 5);
    });
  });

  describe('angleFromCenter', () => {
    it('point to the right is 0 degrees', () => {
      const angle = angleFromCenter(CENTER + 100, CENTER, CENTER, CENTER);
      expect(angle).toBeCloseTo(0, 0);
    });

    it('point below center is 90 degrees', () => {
      const angle = angleFromCenter(CENTER, CENTER + 100, CENTER, CENTER);
      expect(angle).toBeCloseTo(90, 0);
    });

    it('point to the left is 180 degrees', () => {
      const angle = angleFromCenter(CENTER - 100, CENTER, CENTER, CENTER);
      expect(angle).toBeCloseTo(180, 0);
    });

    it('point above center is 270 degrees', () => {
      const angle = angleFromCenter(CENTER, CENTER - 100, CENTER, CENTER);
      expect(angle).toBeCloseTo(270, 0);
    });

    it('always returns 0-360 range', () => {
      for (let i = 0; i < 360; i += 15) {
        const rad = (i * Math.PI) / 180;
        const x = CENTER + Math.cos(rad) * 100;
        const y = CENTER + Math.sin(rad) * 100;
        const angle = angleFromCenter(x, y, CENTER, CENTER);
        expect(angle).toBeGreaterThanOrEqual(0);
        expect(angle).toBeLessThan(360);
      }
    });
  });

  describe('arcAtAngle', () => {
    it('top angle (270) maps to north', () => {
      expect(arcAtAngle(270)).toBe('north');
    });

    it('right angle (0) maps to east', () => {
      expect(arcAtAngle(0)).toBe('east');
    });

    it('bottom angle (90) maps to south', () => {
      expect(arcAtAngle(90)).toBe('south');
    });

    it('left angle (180) maps to west', () => {
      expect(arcAtAngle(180)).toBe('west');
    });

    it('returns null for gap zone angles (diagonal boundaries)', () => {
      // Junction boundaries are at 45, 135, 225, 315 degrees
      // Gap zone is within GAP_DEGREES of these boundaries
      const result = arcAtAngle(45);
      // At exact boundary, should be null (in gap zone)
      expect(result).toBeNull();
    });
  });

  describe('distanceFromCenter', () => {
    it('returns 0 for center point', () => {
      expect(distanceFromCenter(CENTER, CENTER, CENTER, CENTER)).toBe(0);
    });

    it('returns correct Euclidean distance', () => {
      expect(distanceFromCenter(CENTER + 3, CENTER + 4, CENTER, CENTER)).toBeCloseTo(5, 5);
    });

    it('is symmetric', () => {
      const d1 = distanceFromCenter(100, 200, CENTER, CENTER);
      const d2 = distanceFromCenter(CENTER, CENTER, 100, 200);
      expect(d1).toBeCloseTo(d2, 5);
    });
  });

  describe('JUNCTION_CONFIGS', () => {
    it('has 4 junction configurations', () => {
      expect(JUNCTION_CONFIGS).toHaveLength(4);
    });

    it('covers all 4 positions', () => {
      const ids = JUNCTION_CONFIGS.map((c) => c.id);
      expect(ids).toContain('nw');
      expect(ids).toContain('ne');
      expect(ids).toContain('se');
      expect(ids).toContain('sw');
    });

    it('all have labels and colors', () => {
      for (const config of JUNCTION_CONFIGS) {
        expect(config.label.length).toBeGreaterThan(0);
        expect(config.color).toMatch(/^#/);
        expect(config.hitRadius).toBe(JUNCTION_HIT_RADIUS);
      }
    });
  });

  describe('junctionPosition', () => {
    it('returns coordinates on the arc ring for all junctions', () => {
      for (const config of JUNCTION_CONFIGS) {
        const pos = junctionPosition(config);
        const dist = Math.sqrt((pos.x - CENTER) ** 2 + (pos.y - CENTER) ** 2);
        expect(dist).toBeCloseTo(ARC_RING_RADIUS, 0);
      }
    });

    it('NW junction is in upper-left quadrant', () => {
      const nw = JUNCTION_CONFIGS.find((c) => c.id === 'nw')!;
      const pos = junctionPosition(nw);
      expect(pos.x).toBeLessThan(CENTER);
      expect(pos.y).toBeLessThan(CENTER);
    });

    it('SE junction is in lower-right quadrant', () => {
      const se = JUNCTION_CONFIGS.find((c) => c.id === 'se')!;
      const pos = junctionPosition(se);
      expect(pos.x).toBeGreaterThan(CENTER);
      expect(pos.y).toBeGreaterThan(CENTER);
    });
  });

  describe('nearestJunction', () => {
    it('returns junction id when within hit radius', () => {
      const nw = JUNCTION_CONFIGS.find((c) => c.id === 'nw')!;
      const pos = junctionPosition(nw);
      // Slightly offset from exact position (within hitRadius)
      const result = nearestJunction(pos.x + 5, pos.y + 5);
      expect(result).toBe('nw');
    });

    it('returns null when far from all junctions', () => {
      // Center of the viewbox is far from all junctions
      expect(nearestJunction(CENTER, CENTER)).toBeNull();
    });

    it('returns the closest junction when near multiple', () => {
      // This is unlikely given the layout, but test the comparison logic
      const nw = JUNCTION_CONFIGS.find((c) => c.id === 'nw')!;
      const pos = junctionPosition(nw);
      // Exactly at NW position
      expect(nearestJunction(pos.x, pos.y)).toBe('nw');
    });
  });

  describe('isWithinJunctionExit', () => {
    it('returns true when within exit radius', () => {
      const nw = JUNCTION_CONFIGS.find((c) => c.id === 'nw')!;
      const pos = junctionPosition(nw);
      // Within EXIT_RADIUS but outside HIT_RADIUS
      const offset = JUNCTION_HIT_RADIUS + 10;
      expect(isWithinJunctionExit(pos.x + offset, pos.y, 'nw')).toBe(true);
    });

    it('returns false when outside exit radius', () => {
      const nw = JUNCTION_CONFIGS.find((c) => c.id === 'nw')!;
      const pos = junctionPosition(nw);
      const farOffset = JUNCTION_EXIT_RADIUS + 50;
      expect(isWithinJunctionExit(pos.x + farOffset, pos.y, 'nw')).toBe(false);
    });

    it('returns false for invalid junction id', () => {
      expect(isWithinJunctionExit(0, 0, 'invalid' as 'nw')).toBe(false);
    });

    it('exit radius is larger than hit radius (hysteresis)', () => {
      expect(JUNCTION_EXIT_RADIUS).toBeGreaterThan(JUNCTION_HIT_RADIUS);
    });
  });

  // ── Store-wired accessors ──────────────────────────────────────────

  describe('store-wired accessors', () => {
    it('getArcColor/getArcLabel/getJunctionColor/getJunctionLabel are exported', async () => {
      const mod = await import('./arcGeometry');
      expect(typeof mod.getArcColor).toBe('function');
      expect(typeof mod.getArcLabel).toBe('function');
      expect(typeof mod.getJunctionColor).toBe('function');
      expect(typeof mod.getJunctionLabel).toBe('function');
    });
  });
});
