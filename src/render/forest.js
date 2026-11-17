/**
 * The woods, as trees.
 *
 * The woods used to be a texture: a tile of treetops that stopped dead at
 * the edge of the rough. This plants them instead — individual trees with
 * trunks, standing in rows that overlap front to back, each throwing a
 * shadow — over a floor of darker undergrowth (the old tile, without its
 * highlights, which `holeView.js` still paints first).
 *
 * THE RULE, which is the rule of everything drawn on a hole: a tree is
 * only planted where the simulation says there are trees. `fits` asks
 * `lieAt` about every pixel of the tree's picture (and the pixels touching
 * it, because the terrain under it is drawn on rounded coordinates), and
 * a tree that would put one leaf over rough, sand, water or green is not
 * planted — a smaller one is tried in its place, and if nothing fits the
 * undergrowth shows. So a ball that looks clear of the trees is clear of
 * them. Shadows are different: a shadow is light, not ground, and falls
 * across whatever is next to the tree.
 *
 * WHERE. Sites sit on a lattice anchored to the canvas, not to the hole,
 * nudged a pixel either way by a hash of their own row and column. So the
 * forest is the same every frame, the same on either side of a plot's
 * edge on the resort map, and never random at draw time.
 *
 * `plantForest` is pure (it runs in the tests, against `lieAt`).
 * `drawForest` paints what it returns, once, into two off-screen layers —
 * shadows and trees — and blits those every frame after.
 */
import { PALETTE } from './palette.js';
import { SPRITES, drawSprite } from './sprites.js';
import { SHADOW_ALPHA, currentLight } from './light.js';
import { lieAt, LIE, greenRadius } from '../sim/terrain.js';
import { greenCentre } from '../sim/hole.js';
import { distanceToPath } from '../sim/geometry.js';

/** Yards of rough beyond the fairway band, mirroring terrain.js#lieAt. */
const ROUGH_MARGIN = 22;

/**
 * What is planted. `kinds` is what a site gets (picked by its hash, so
 * two broadleaves to every conifer); `fallback` is what is tried instead,
 * largest first, when that would overhang something that is not woods —
 * which is what gives the woods a ragged edge of younger trees, the way
 * a real one has.
 *
 * Rows are closer together than a tree is tall, so each row hides the
 * trunks of the row behind it and the forest reads as overlapping crowns.
 * The resort map and a single hole plant the same trees at the same
 * size: a hole on the map is smaller, but the pixels are the same pixels.
 */
const STAND = {
  stepX: 7, stepY: 5, jitter: 1,
  kinds: ['treeRound', 'treeRound', 'treePine'],
  fallback: ['treeRoundSmall', 'treePineSmall', 'treeSapling'],
};

/** One site in this many is left empty: a forest with no gaps is a hedge. */
const CLEARING = 0.1;

/** A fixed number in 0–1 for lattice cell (ix, iy): the same on every
 * frame and every machine. */
function hash(ix, iy, salt) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(salt, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const footprints = new Map();

/** Every pixel of `sprite` that is painted, plus every pixel touching
 * one, as `[dx, dy]` from the sprite's top-left corner. */
function footprint(sprite) {
  let cells = footprints.get(sprite);
  if (cells) return cells;
  const seen = new Set();
  cells = [];
  for (let row = 0; row < sprite.length; row++) {
    for (let col = 0; col < sprite[row].length; col++) {
      if (sprite[row][col] === '.') continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const key = `${col + dx},${row + dy}`;
          if (seen.has(key)) continue;
          seen.add(key);
          cells.push([col + dx, row + dy]);
        }
      }
    }
  }
  footprints.set(sprite, cells);
  return cells;
}

function prepare(plot) {
  const { hole } = plot;
  return {
    ...plot,
    centre: greenCentre(hole),
    radius: greenRadius(hole),
    halfBand: hole.corridorWidth / 2 + ROUGH_MARGIN,
    hazards: hole.features.filter((f) => f.type === 'pond' || f.type === 'bunker'),
  };
}

/** Whether a sprite with its top-left at (`left`, `top`) lies wholly on
 * ground `lieAt` calls trees, for every plot it touches. */
function fits(sprite, left, top, plots) {
  const w = sprite[0].length;
  const h = sprite.length;
  for (const plot of plots) {
    const { rect, t, hole } = plot;
    if (!plot.unbounded && (left + w + 1 <= rect.x || left - 1 >= rect.x + rect.width
      || top + h + 1 <= rect.y || top - 1 >= rect.y + rect.height)) continue;

    // The quick answer: nothing but woods within reach of the whole
    // picture. True of nearly every tree, and saves asking pixel by pixel.
    const mid = t.toWorld({ x: left + w / 2, y: top + h / 2 });
    const reach = (Math.hypot(w / 2 + 1, h / 2 + 1) + 0.5) / t.scale;
    const clear = distanceToPath(hole.corridor, mid) > plot.halfBand + reach
      && Math.hypot(mid.x - plot.centre.x, mid.y - plot.centre.y) > plot.radius + reach
      && plot.hazards.every((f) => Math.hypot(mid.x - f.x, mid.y - f.y) > f.size + reach);
    if (clear) continue;

    for (const [dx, dy] of footprint(sprite)) {
      const px = left + dx;
      const py = top + dy;
      if (!plot.unbounded && (px < rect.x || px >= rect.x + rect.width
        || py < rect.y || py >= rect.y + rect.height)) continue;
      if (lieAt(hole, t.toWorld({ x: px + 0.5, y: py + 0.5 })) !== LIE.TREES) return false;
    }
  }
  return true;
}

/** Plants the first of `names` that fits with its trunk at (x, y). */
function place(trees, names, x, y, plots) {
  for (const name of names) {
    const sprite = SPRITES[name];
    const left = x - Math.floor(sprite[0].length / 2);
    const top = y - sprite.length + 1;
    if (fits(sprite, left, top, plots)) {
      trees.push({ x, y, name, left, top });
      return true;
    }
  }
  return false;
}

/**
 * Every tree standing in `area` (a rectangle of canvas pixels), back row
 * first.
 *
 * `plots` are the holes drawn inside it: `{ hole, rect, t, unbounded }`,
 * where `t` is the hole's `computeHoleTransform` for `rect`. A plot's
 * hole is only consulted for pixels inside its `rect` — beyond it is
 * somebody else's ground — unless it is `unbounded`, which is how a hole
 * drawn on its own (the editor, the play screen) says there is nothing
 * out there but itself.
 *
 * Each tree is `{ x, y, name, left, top }`: its trunk stands at (x, y),
 * `name` is its sprite, and (left, top) is where that sprite is drawn.
 */
export function plantForest({ area, plots = [] }) {
  const stand = STAND;
  const ground = plots.filter((p) => p.hole?.corridor?.length > 1).map(prepare);
  const trees = [];

  const tallest = SPRITES[stand.kinds[0]].length;
  const widest = SPRITES[stand.kinds[0]][0].length;
  const x0 = area.x - widest;
  const x1 = area.x + area.width + widest;
  const y0 = area.y;
  const y1 = area.y + area.height + tallest;

  for (let iy = Math.floor(y0 / stand.stepY); iy * stand.stepY <= y1; iy++) {
    // Alternate rows are set half a step across, like any planted wood.
    const shift = iy & 1 ? Math.floor(stand.stepX / 2) : 0;
    for (let ix = Math.floor((x0 - shift) / stand.stepX); ix * stand.stepX + shift <= x1; ix++) {
      if (hash(ix, iy, 1) < CLEARING) continue;
      const x = ix * stand.stepX + shift + Math.round((hash(ix, iy, 2) - 0.5) * 2 * stand.jitter);
      const y = iy * stand.stepY + Math.round((hash(ix, iy, 3) - 0.5) * 2 * stand.jitter);
      const first = stand.kinds[Math.floor(hash(ix, iy, 4) * stand.kinds.length)];
      place(trees, [first, ...stand.fallback], x, y, ground);
    }
  }

  // A clump of trees placed in the editor may be smaller than the gaps in
  // the lattice, and a clump with nothing standing in it is a dark disc.
  // So every clump is offered one tree of its own, in the middle.
  for (const plot of ground) {
    for (const f of plot.hole.features) {
      if (f.type !== 'trees') continue;
      const p = plot.t.toScreen(f);
      const names = [stand.kinds[0], ...stand.fallback];
      for (const name of names) {
        const sprite = SPRITES[name];
        const x = Math.round(p.x);
        const y = Math.round(p.y + sprite.length / 2 - 1);
        if (place(trees, [name], x, y, ground)) break;
      }
    }
  }

  trees.sort((a, b) => a.y - b.y || a.x - b.x);
  return trees;
}

// --- Painting -----------------------------------------------------------

/**
 * Which trees show their trunk: the ones with nothing standing in front.
 *
 * Deep in the woods a trunk is hidden by the next row, and where the rows
 * do not quite meet a brown pixel peeps through — hundreds of them, which
 * reads as static, not as trunks. So a trunk is only painted brown where
 * a person would see one: along the front edge of the woods and at the
 * back of a clearing, with a patch of bare floor OPEN_FLOOR pixels square
 * at its foot (a single column is a chink between two crowns, not a
 * clearing). Everywhere else
 * it is the colour of the shade it stands in. Pure: one flag per tree.
 */
const OPEN_FLOOR = 3;

export function exposedTrunks(trees, area) {
  const w = Math.max(1, area.width);
  const h = Math.max(1, area.height);
  const owner = new Int32Array(w * h).fill(-1);
  trees.forEach((tree, i) => {
    const sprite = SPRITES[tree.name];
    for (let row = 0; row < sprite.length; row++) {
      const y = tree.top + row - area.y;
      if (y < 0 || y >= h) continue;
      for (let col = 0; col < sprite[row].length; col++) {
        const x = tree.left + col - area.x;
        if (sprite[row][col] === '.' || x < 0 || x >= w) continue;
        owner[y * w + x] = i;
      }
    }
  });
  return trees.map((tree, i) => {
    const x = tree.x - area.x;
    const y = tree.y - area.y;
    if (x < 1 || x + 1 >= w || y < 0 || y + OPEN_FLOOR >= h) return false;
    if (owner[y * w + x] !== i) return false;
    for (let below = 1; below <= OPEN_FLOOR; below++) {
      for (let across = -1; across <= 1; across++) {
        if (owner[(y + below) * w + x + across] !== -1) return false;
      }
    }
    return true;
  });
}

const spriteCanvases = new Map();

/** A sprite, painted once onto a canvas of its own, so that planting two
 * thousand trees is two thousand blits and not sixty thousand pixels.
 * Two of each: with its trunk showing, and with its trunk in shade. */
function spriteCanvas(name, trunkShows) {
  const key = `${name}|${trunkShows}`;
  let canvas = spriteCanvases.get(key);
  if (canvas) return canvas;
  const sprite = trunkShows ? SPRITES[name] : SPRITES[name].map((row) => row.replaceAll('E', 'J'));
  canvas = document.createElement('canvas');
  canvas.width = sprite[0].length;
  canvas.height = sprite.length;
  drawSprite(canvas.getContext('2d'), sprite, 0, 0);
  spriteCanvases.set(key, canvas);
  return canvas;
}

function paintTrees(layer, trees, area) {
  const tctx = layer.getContext('2d');
  tctx.clearRect(0, 0, layer.width, layer.height);
  const shows = exposedTrunks(trees, area);
  trees.forEach((tree, i) => {
    tctx.drawImage(spriteCanvas(tree.name, shows[i]), tree.left - area.x, tree.top - area.y);
  });
}

/** A tree is taller than its picture: the sprite is a few pixels because
 * the screen is, but what it stands for is the tallest thing on the
 * course, and its shadow should say so. */
const TREE_SHADOW_HEIGHT = 1.5;

/**
 * Every tree's shadow, as one flat mask: a wedge from the foot of the
 * trunk, widening to the width of the crown where the top of the tree
 * lands. Painted solid, and laid over the course at SHADOW_ALPHA as a
 * single image, so two shadows crossing are no darker than one.
 */
function paintShadows(layer, trees, area, light) {
  const sctx = layer.getContext('2d');
  sctx.clearRect(0, 0, layer.width, layer.height);
  sctx.fillStyle = PALETTE.OUTLINE;
  for (const tree of trees) {
    const sprite = SPRITES[tree.name];
    const ox = Math.round(light.dx * sprite.length * TREE_SHADOW_HEIGHT);
    const oy = Math.round(light.dy * sprite.length * TREE_SHADOW_HEIGHT);
    const steps = Math.max(Math.abs(ox), Math.abs(oy));
    if (steps === 0) continue;
    const crown = Math.max(1, sprite[0].length - 2);
    const depth = Math.max(1, Math.round(crown / 2));
    for (let k = 1; k <= steps; k++) {
      const width = Math.max(1, Math.round(crown * Math.min(1, 0.4 + (1.2 * k) / steps)));
      const cx = tree.x - area.x + Math.round((ox * k) / steps);
      const cy = tree.y - area.y + Math.round((oy * k) / steps);
      sctx.fillRect(cx - Math.floor(width / 2), cy - Math.floor(depth / 2), width, depth);
    }
  }
}

function plotKey(plot) {
  const { hole, rect } = plot;
  return [
    rect.x, rect.y, rect.width, rect.height, plot.unbounded ? 'u' : 'b',
    hole.corridorWidth, hole.greenPreset,
    hole.corridor.map((p) => `${p.x},${p.y}`).join(';'),
    hole.features.map((f) => `${f.type},${f.x},${f.y},${f.size}`).join(';'),
  ].join('|');
}

/** Painted forests, newest last. A handful is plenty: the map, the day
 * playback, the editor and the play screen each ask for one. */
const layers = new Map();
const MAX_LAYERS = 6;

function layerFor(area, plots) {
  const key = `${area.x},${area.y},${area.width},${area.height}|${plots.map(plotKey).join('#')}`;
  let layer = layers.get(key);
  if (layer) {
    // Touched: move it to the back of the queue for eviction.
    layers.delete(key);
    layers.set(key, layer);
    return layer;
  }
  const trees = plantForest({ area, plots });
  const make = () => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, area.width);
    canvas.height = Math.max(1, area.height);
    return canvas;
  };
  layer = { trees, treeLayer: make(), shadowLayer: make(), shadowKey: null };
  paintTrees(layer.treeLayer, trees, area);
  layers.set(key, layer);
  if (layers.size > MAX_LAYERS) layers.delete(layers.keys().next().value);
  return layer;
}

/**
 * Draws the forest over `area`: shadows first, then the trees. Everything
 * the trees must keep off — the holes in `plots` — has to be on the
 * canvas already.
 */
export function drawForest(ctx, { area, plots = [] }) {
  const whole = {
    x: Math.floor(area.x),
    y: Math.floor(area.y),
    width: Math.ceil(area.x + area.width) - Math.floor(area.x),
    height: Math.ceil(area.y + area.height) - Math.floor(area.y),
  };
  const built = plots.filter((p) => p.hole?.corridor?.length > 1);
  const layer = layerFor(whole, built);

  const light = currentLight();
  // Shadows only move a whole pixel at a time, so they are repainted only
  // when the light has moved far enough to move one.
  const shadowKey = `${Math.round(light.dx * 8)},${Math.round(light.dy * 8)}`;
  if (shadowKey !== '0,0') {
    if (layer.shadowKey !== shadowKey) {
      paintShadows(layer.shadowLayer, layer.trees, whole, light);
      layer.shadowKey = shadowKey;
    }
    ctx.save();
    ctx.globalAlpha = SHADOW_ALPHA;
    ctx.drawImage(layer.shadowLayer, whole.x, whole.y);
    ctx.restore();
  }
  ctx.drawImage(layer.treeLayer, whole.x, whole.y);
}
