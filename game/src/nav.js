// The bot route graph: hand-placed waypoints over the map's lanes, connectors and
// sites, with a breadth-first path between any two. Coordinates match world.js
// exactly; every node sits in open ground. Bots steer node to node, never through
// walls, and the same graph drives patrols, pushes and retakes.
import * as THREE from 'three';

// id: [x, z, tags]. Tags: spawnA, spawnB, lane, mid, connector, site, hold.
const NODES = [
  [0, 13, 'spawnA'], [-16, 8, 'lane'], [0, 8, 'mid'], [16, 8, 'lane'],
  [-16, 0, 'lane'], [-4, 0, 'mid'], [4, 0, 'mid'], [16, 0, 'lane'],
  [-8, 4, 'connector'], [8, 4, 'connector'], [-8, -6, 'connector'], [8, -6, 'connector'],
  [0, 4, 'mid'], [0, -4, 'mid'], [0, -10, 'mid'], [0, -12, 'mid'],
  [-16, -4, 'lane'], [16, -4, 'lane'], [-16, -11, 'site'], [16, -11, 'site'],
  [-19, -8, 'hold'], [-13, -8, 'hold'], [19, -8, 'hold'], [13, -8, 'hold'],
  [0, -13, 'spawnB'], [-4, -12, 'hold'], [4, -12, 'hold'],
];
const EDGES = [
  [0, 1], [0, 2], [0, 3], [1, 4], [3, 7], [2, 12], [12, 5], [12, 6], [5, 13], [6, 13],
  [4, 16], [7, 17], [4, 8], [7, 9], [8, 12], [9, 12], [8, 10], [9, 11], [10, 13], [11, 13],
  [10, 16], [11, 17], [13, 14], [14, 15], [15, 24], [15, 25], [15, 26], [16, 18], [17, 19],
  [18, 20], [18, 21], [19, 22], [19, 23], [24, 25], [24, 26], [25, 14], [26, 14],
  [16, 10], [17, 11], [20, 16], [22, 17], [21, 10], [23, 11],
];
const adjacency = NODES.map(() => []);
for (const [a, b] of EDGES) {
  adjacency[a].push(b);
  adjacency[b].push(a);
}
const points = NODES.map(([x, z]) => new THREE.Vector3(x, 0, z));

export function nearestNode(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const d = (points[i].x - x) ** 2 + (points[i].z - z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

export function nodePoint(id) {
  return points[id];
}

export function nodesByTag(tag) {
  const out = [];
  for (let i = 0; i < NODES.length; i += 1) if (NODES[i][2] === tag) out.push(i);
  return out;
}

// Breadth-first path from node a to node b, as an array of node ids including both
// ends. The graph is small and static, so BFS is exact and cheap.
export function findPath(a, b) {
  if (a === b) return [a];
  const prev = new Array(NODES.length).fill(-1);
  const queue = [a];
  prev[a] = a;
  while (queue.length) {
    const cur = queue.shift();
    for (const next of adjacency[cur]) {
      if (prev[next] !== -1) continue;
      prev[next] = cur;
      if (next === b) {
        const path = [b];
        let node = b;
        while (node !== a) { node = prev[node]; path.unshift(node); }
        return path;
      }
      queue.push(next);
    }
  }
  return [a, b];
}

// True when nothing in obstacles stands between eye and target. The caller passes one
// shared raycaster; this module allocates nothing per call.
export function losClear(raycaster, obstacles, from, to) {
  const dir = to.clone().sub(from);
  const dist = dir.length();
  if (dist < 0.001) return true;
  dir.divideScalar(dist);
  raycaster.set(from, dir);
  raycaster.far = dist - 0.05;
  return raycaster.intersectObjects(obstacles, false).length === 0;
}
