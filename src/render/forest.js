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
import { PALETTE, mix, withAlpha } from './palette.js';
import { SPRITES } from './sprites.js';
import { resolution } from './paint.js';
import { animationTime } from './animClock.js';
import { ambientWeather, treeSway } from './ambient.js';
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

// --- Painting -----------------------------------------------------------
//
// The trees are painted, not blitted from the pixel sprites: a round crown
// of overlapping lobes under one gradient, lit from the top left, or a
// conifer's stacked tiers. Each picture stays inside its sprite's box, so
// everything `fits` checked about the sprite is true of the painting (the
// checked footprint is the sprite plus a pixel of margin all round).

/** Device pixels per logical pixel in a tree's bitmap: enough that a tree
 * on the zoomed-in play screen is still sharp. */
function treeDetail() {
  return Math.min(32, Math.max(8, resolution() * 4));
}

/** Three tones of each kind, chosen per tree, so a forest is not one tree
 * repeated: as planted, a little yellower, a little darker. */
const TONES = [
  (c) => PALETTE[c],
  (c) => mix(c, 'ROUGH', 0.22),
  (c) => mix(c, 'TREE_SHADOW', 0.28),
];

function toneOf(tree) {
  return Math.floor(hash(tree.x, tree.y, 9) * TONES.length);
}

/** Path of a crown: a main disc and lobes round it, in a `w`×`h` box. */
function crownPath(c, cx, cy, r) {
  c.beginPath();
  c.moveTo(cx + r * 0.8, cy);
  c.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const lx = cx + Math.cos(a) * r * 0.45;
    const ly = cy + Math.sin(a) * r * 0.45;
    c.moveTo(lx + r * 0.5, ly);
    c.arc(lx, ly, r * 0.5, 0, Math.PI * 2);
  }
}

function paintTrunk(c, w, h, top, shows) {
  const tw = Math.max(0.5, w * 0.13);
  c.fillStyle = shows ? PALETTE.TEE : PALETTE.TREE_SHADOW;
  c.fillRect(w / 2 - tw / 2, top, tw, h - top);
}

function paintBroadleaf(c, w, h, tone, shows) {
  const trunkTop = h * 0.72;
  const r = Math.min(w / 2, trunkTop / 2 + 0.3) * 0.97;
  const cx = w / 2;
  const cy = r + 0.05;
  paintTrunk(c, w, h, trunkTop, shows);
  // The crown's own shade on the ground and the trunk, down and right.
  c.fillStyle = withAlpha('OUTLINE', 0.3);
  c.beginPath();
  c.arc(cx + r * 0.1, cy + r * 0.14, r * 0.92, 0, Math.PI * 2);
  c.fill();
  const g = c.createRadialGradient(cx - r * 0.45, cy - r * 0.5, 0, cx - r * 0.1, cy - r * 0.1, r * 1.45);
  g.addColorStop(0, tone('TREE_HIGHLIGHT'));
  g.addColorStop(0.3, tone('TREE_LIGHT'));
  g.addColorStop(0.68, tone('TREE'));
  g.addColorStop(1, tone('TREE_SHADOW'));
  crownPath(c, cx, cy, r);
  c.fillStyle = g;
  c.fill();
  c.lineWidth = Math.max(0.12, r * 0.06);
  c.strokeStyle = withAlpha('OUTLINE', 0.4);
  c.stroke();
  // Clusters of leaves: catching the light on the sunny side, in shade on the other.
  for (const [dx, dy, lit] of [[-0.45, -0.2, 1], [-0.15, -0.55, 1], [0.1, -0.15, 1], [0.35, 0.35, 0], [-0.1, 0.45, 0], [0.5, 0, 0]]) {
    c.fillStyle = lit ? withAlpha('TREE_HIGHLIGHT', 0.45) : withAlpha('TREE_SHADOW', 0.45);
    c.beginPath();
    c.arc(cx + dx * r, cy + dy * r, r * 0.17, 0, Math.PI * 2);
    c.fill();
  }
}

function paintConifer(c, w, h, tone, shows) {
  const trunkTop = h * 0.8;
  paintTrunk(c, w, h, trunkTop, shows);
  const tiers = [[0, 0.42, 0.55], [0.22, 0.66, 0.8], [0.42, 0.88, 1]];
  tiers.forEach(([apex, base, spread], i) => {
    const ay = apex * h;
    const by = base * h;
    const half = (w / 2) * spread;
    c.beginPath();
    c.moveTo(w / 2, ay);
    c.lineTo(w / 2 + half, by);
    c.quadraticCurveTo(w / 2, by + h * 0.05, w / 2 - half, by);
    c.closePath();
    const g = c.createLinearGradient(w / 2 - half, 0, w / 2 + half, 0);
    g.addColorStop(0, tone(i === 0 ? 'TREE_HIGHLIGHT' : 'TREE_LIGHT'));
    g.addColorStop(0.45, tone('TREE'));
    g.addColorStop(1, tone('TREE_SHADOW'));
    c.fillStyle = g;
    c.fill();
    c.lineWidth = Math.max(0.12, w * 0.025);
    c.strokeStyle = withAlpha('OUTLINE', 0.4);
    c.stroke();
  });
}

const PAINTERS = {
  treeRound: paintBroadleaf,
  treeRoundSmall: paintBroadleaf,
  treeSapling: paintBroadleaf,
  treePine: paintConifer,
  treePineSmall: paintConifer,
};

const treeBitmaps = new Map();

/** One kind of tree, in one tone, with its trunk showing or not, painted
 * once into a bitmap the size of its sprite's box. */
function treeBitmap(name, tone, shows) {
  const detail = treeDetail();
  const key = `${name}|${tone}|${shows}|${detail}`;
  let canvas = treeBitmaps.get(key);
  if (canvas) return canvas;
  const sprite = SPRITES[name];
  const w = sprite[0].length;
  const h = sprite.length;
  canvas = document.createElement('canvas');
  canvas.width = Math.round(w * detail);
  canvas.height = Math.round(h * detail);
  const c = canvas.getContext('2d');
  c.scale(detail, detail);
  (PAINTERS[name] ?? paintBroadleaf)(c, w, h, TONES[tone], shows);
  treeBitmaps.set(key, canvas);
  return canvas;
}

function drawTree(c, tree, shows, sway = 0) {
  const sprite = SPRITES[tree.name];
  const bitmap = treeBitmap(tree.name, toneOf(tree), shows);
  if (!sway) {
    c.drawImage(bitmap, tree.left, tree.top, sprite[0].length, sprite.length);
    return;
  }
  // Leaning from the foot of the trunk: the base stays put, the crown moves.
  const fx = tree.x + 0.5;
  const fy = tree.y + 1;
  c.save();
  c.translate(fx, fy);
  c.transform(1, 0, sway, 1, 0, 0);
  c.drawImage(bitmap, tree.left - fx, tree.top - fy, sprite[0].length, sprite.length);
  c.restore();
}

/** A tree is taller than its picture: the picture is a few pixels because
 * the screen is, but what it stands for is the tallest thing on the
 * course, and its shadow should say so. */
const TREE_SHADOW_HEIGHT = 1.5;

/**
 * Every tree's shadow as one path: a round-ended band from the foot of
 * the trunk to where the top of the tree lands, three quarters as wide as
 * the crown. Stroked once per width, so where two shadows cross they are
 * no darker than one.
 */
function strokeShadows(c, trees, light) {
  const byWidth = new Map();
  for (const tree of trees) {
    const sprite = SPRITES[tree.name];
    const width = Math.max(1, sprite[0].length * 0.75);
    if (!byWidth.has(width)) byWidth.set(width, []);
    byWidth.get(width).push(tree);
  }
  c.lineCap = 'round';
  c.strokeStyle = PALETTE.OUTLINE;
  for (const [width, group] of byWidth) {
    c.lineWidth = width;
    c.beginPath();
    for (const tree of group) {
      const height = SPRITES[tree.name].length * TREE_SHADOW_HEIGHT;
      const fx = tree.x + 0.5;
      const fy = tree.y + 0.3;
      c.moveTo(fx, fy);
      c.lineTo(fx + light.dx * height, fy + light.dy * height);
    }
    c.stroke();
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

/** A key for "these plots, drawn in these rectangles": exported so the
 * resort map can cache its ground under the same terms as its forest. */
export function plotsKey(plots) {
  return plots.map(plotKey).join('#');
}

/** Planted forests (and their painted layers), newest last. A handful is
 * plenty: the map, the day playback, the editor and the play screen each
 * ask for one. */
const stands = new Map();
const MAX_STANDS = 6;

function standFor(area, plots) {
  const key = `${area.x},${area.y},${area.width},${area.height}|${plotsKey(plots)}`;
  let stand = stands.get(key);
  if (stand) {
    // Touched: move it to the back of the queue for eviction.
    stands.delete(key);
    stands.set(key, stand);
    return stand;
  }
  const trees = plantForest({ area, plots });
  stand = { trees, shows: exposedTrunks(trees, area), layers: null };
  stands.set(key, stand);
  if (stands.size > MAX_STANDS) stands.delete(stands.keys().next().value);
  return stand;
}

/** An off-screen canvas covering `area` at device resolution, with a
 * context that draws in the same logical units as the screen. */
function layerCanvas(area) {
  const res = resolution();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(area.width * res));
  canvas.height = Math.max(1, Math.round(area.height * res));
  const c = canvas.getContext('2d');
  c.setTransform(res, 0, 0, res, -area.x * res, -area.y * res);
  return { canvas, c };
}

function layersFor(stand, area) {
  const res = resolution();
  if (stand.layers?.res === res) return stand.layers;
  const trees = layerCanvas(area);
  stand.trees.forEach((tree, i) => drawTree(trees.c, tree, stand.shows[i]));
  stand.layers = { res, trees, shadows: layerCanvas(area), shadowKey: null };
  return stand.layers;
}

function overlaps(tree, r) {
  const sprite = SPRITES[tree.name];
  return tree.left < r.x + r.width && tree.left + sprite[0].length > r.x
    && tree.top < r.y + r.height + 14 && tree.top + sprite.length > r.y - 14;
}

/**
 * Draws the forest over `area`: shadows first, then the trees. Everything
 * the trees must keep off — the holes in `plots` — has to be on the
 * canvas already.
 *
 * Painted once into two layers at device resolution and blitted after —
 * except when `visible` is given, the part of `area` actually on screen
 * under a zoom (the play screen), where a layer would be either enormous
 * or blurred: then the trees in view are drawn straight onto the canvas.
 */
export function drawForest(ctx, { area, plots = [], visible = null }) {
  const whole = {
    x: Math.floor(area.x),
    y: Math.floor(area.y),
    width: Math.ceil(area.x + area.width) - Math.floor(area.x),
    height: Math.ceil(area.y + area.height) - Math.floor(area.y),
  };
  const built = plots.filter((p) => p.hole?.corridor?.length > 1);
  const stand = standFor(whole, built);
  const light = currentLight();
  const sunny = light.dx !== 0 || light.dy !== 0;

  if (visible) {
    const inView = [];
    stand.trees.forEach((tree, i) => { if (overlaps(tree, visible)) inView.push(i); });
    if (sunny) {
      ctx.save();
      ctx.globalAlpha = SHADOW_ALPHA;
      strokeShadows(ctx, inView.map((i) => stand.trees[i]), light);
      ctx.restore();
    }
    // Close up, the trees move in the wind. (On the map they are one
    // painted layer and hold still: at that size a sway would not show.)
    const key = ambientWeather();
    const ms = animationTime();
    for (const i of inView) {
      const tree = stand.trees[i];
      drawTree(ctx, tree, stand.shows[i], treeSway(key, tree.x, tree.y, ms));
    }
    return;
  }

  const layers = layersFor(stand, whole);
  if (sunny) {
    // Repainted only when the sun has moved far enough to show.
    const shadowKey = `${Math.round(light.dx * 40)},${Math.round(light.dy * 40)}`;
    if (layers.shadowKey !== shadowKey) {
      const { canvas, c } = layers.shadows;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, canvas.width, canvas.height);
      c.restore();
      strokeShadows(c, stand.trees, light);
      layers.shadowKey = shadowKey;
    }
    ctx.save();
    ctx.globalAlpha = SHADOW_ALPHA;
    ctx.drawImage(layers.shadows.canvas, whole.x, whole.y, whole.width, whole.height);
    ctx.restore();
  }
  ctx.drawImage(layers.trees.canvas, whole.x, whole.y, whole.width, whole.height);
}
