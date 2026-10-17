import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// GLTFExporter uses this browser API to join its binary buffers. No images or
// external assets are involved in this model.
globalThis.FileReader ??= class BufferFileReader {
  async readAsArrayBuffer(blob) {
    try {
      this.result = await blob.arrayBuffer();
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    } catch (error) {
      this.error = error;
      this.onerror?.({ target: this });
    }
  }

  async readAsDataURL(blob) {
    try {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    } catch (error) {
      this.error = error;
      this.onerror?.({ target: this });
    }
  }
};

const materials = {
  coat: new THREE.MeshStandardMaterial({ name: 'coat', color: '#bd8b60', roughness: 0.95, flatShading: true }),
  muzzle: new THREE.MeshStandardMaterial({ name: 'muzzle', color: '#9b6a48', roughness: 1, flatShading: true }),
  hair: new THREE.MeshStandardMaterial({ name: 'mane-and-tail', color: '#302820', roughness: 1, flatShading: true }),
  hoof: new THREE.MeshStandardMaterial({ name: 'hooves', color: '#302e2b', roughness: 0.9, flatShading: true }),
  sock: new THREE.MeshStandardMaterial({ name: 'ivory-markings', color: '#f2e8d6', roughness: 1, flatShading: true }),
  saddle: new THREE.MeshStandardMaterial({ name: 'black-leather', color: '#202121', roughness: 0.85, flatShading: true }),
  pad: new THREE.MeshStandardMaterial({ name: 'saddle-pad', color: '#e0d9c9', roughness: 1, flatShading: true }),
  eye: new THREE.MeshStandardMaterial({ name: 'eyes-and-nostrils', color: '#101313', roughness: 0.35, flatShading: true }),
  glint: new THREE.MeshStandardMaterial({ name: 'eye-glints', color: '#fff9eb', roughness: 0.4 }),
};

const horse = new THREE.Group();
horse.name = 'HuberHorse';
horse.scale.setScalar(0.9);
horse.userData = {
  title: 'Huber street horse',
  author: 'Huber',
  license: 'MIT',
  coordinates: '+X forward, +Y up, +Z left; hooves touch Y=0',
};

function mesh(parent, name, geometry, material, position = [0, 0, 0], scale = [1, 1, 1]) {
  const result = new THREE.Mesh(geometry, material);
  result.name = name;
  result.position.fromArray(position);
  result.scale.fromArray(scale);
  result.castShadow = true;
  result.receiveShadow = true;
  parent.add(result);
  return result;
}

function ellipsoid(parent, name, position, scale, material, segments = 10, rings = 6) {
  return mesh(parent, name, new THREE.SphereGeometry(1, segments, rings), material, position, scale);
}

function bone(parent, name, start, end, upperRadius, lowerRadius, material = materials.coat, sides = 7) {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const delta = to.clone().sub(from);
  const result = mesh(parent, name, new THREE.CylinderGeometry(lowerRadius, upperRadius, delta.length(), sides, 1), material);
  result.position.copy(from.add(to).multiplyScalar(0.5));
  // Cylinder top is +Y. Put its wider bottom at the start of a downward bone.
  result.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return result;
}

function tube(parent, name, points, radius, material, segments = 10) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  return mesh(parent, name, new THREE.TubeGeometry(curve, segments, radius, 4, false), material);
}

function loft(parent, name, sections, sides, material) {
  const vertices = [];
  const indices = [];
  for (const [x, y, ry, rz] of sections) {
    for (let side = 0; side < sides; side++) {
      const angle = (side / sides) * Math.PI * 2;
      vertices.push(x, y + Math.cos(angle) * ry, Math.sin(angle) * rz);
    }
  }
  for (let ring = 0; ring < sections.length - 1; ring++) {
    for (let side = 0; side < sides; side++) {
      const a = ring * sides + side;
      const b = ring * sides + (side + 1) % sides;
      const c = b + sides;
      const d = a + sides;
      indices.push(a, b, d, b, c, d);
    }
  }
  const start = vertices.length / 3;
  vertices.push(sections[0][0], sections[0][1], 0);
  const end = vertices.length / 3;
  vertices.push(sections.at(-1)[0], sections.at(-1)[1], 0);
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    indices.push(start, next, side);
    const base = (sections.length - 1) * sides;
    indices.push(end, base + side, base + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return mesh(parent, name, geometry, material);
}

function group(parent, name, position) {
  const result = new THREE.Group();
  result.name = name;
  result.position.fromArray(position);
  parent.add(result);
  return result;
}

const body = group(horse, 'HorseBody', [0, 1.16, 0]);
loft(body, 'FacetedBarrel', [
  [-0.84, 0.03, 0.12, 0.14],
  [-0.68, 0.03, 0.30, 0.29],
  [-0.36, 0.01, 0.345, 0.34],
  [0.18, 0, 0.32, 0.325],
  [0.53, 0.04, 0.33, 0.285],
  [0.74, 0.03, 0.17, 0.18],
], 10, materials.coat);
ellipsoid(body, 'PowerfulHaunches', [-0.57, 0.01, 0], [0.32, 0.335, 0.325], materials.coat);
ellipsoid(body, 'Chest', [0.49, -0.025, 0], [0.28, 0.35, 0.275], materials.coat);

// The neck and head form a continuous, long horse silhouette, rather than a
// short toy-animal muzzle. Their pivots also make the walking nod visible.
const neck = group(body, 'HorseNeck', [0.43, 0.11, 0]);
bone(neck, 'SlopingNeck', [-0.02, -0.04, 0], [0.405, 0.485, 0], 0.265, 0.16);
ellipsoid(neck, 'NeckChestBlend', [-0.005, -0.015, 0], [0.255, 0.28, 0.235], materials.coat);

const maneShape = new THREE.Shape();
maneShape.moveTo(-0.19, -0.02);
maneShape.lineTo(-0.135, 0.14);
maneShape.lineTo(-0.05, 0.245);
maneShape.lineTo(-0.012, 0.34);
maneShape.lineTo(0.08, 0.415);
maneShape.lineTo(0.125, 0.51);
maneShape.lineTo(0.24, 0.59);
maneShape.lineTo(0.37, 0.535);
maneShape.lineTo(0.22, 0.40);
maneShape.lineTo(0.065, 0.19);
maneShape.lineTo(-0.035, -0.025);
maneShape.closePath();
mesh(neck, 'CroppedMane', new THREE.ExtrudeGeometry(maneShape, { depth: 0.09, bevelEnabled: false }), materials.hair, [0, 0, -0.045]);

const head = group(neck, 'HorseHead', [0.405, 0.49, 0]);
ellipsoid(head, 'Skull', [0.10, 0.015, 0], [0.265, 0.205, 0.175], materials.coat);
const face = ellipsoid(head, 'LongFace', [0.295, -0.077, 0], [0.30, 0.155, 0.151], materials.coat);
face.rotation.z = -0.31;
ellipsoid(head, 'VelvetMuzzle', [0.485, -0.142, 0], [0.16, 0.117, 0.155], materials.muzzle);
ellipsoid(head, 'UnderJaw', [0.165, -0.105, 0], [0.21, 0.145, 0.14], materials.coat);

for (const side of [-1, 1]) {
  const ear = group(head, side > 0 ? 'LeftEar' : 'RightEar', [0.015, 0.225, side * 0.105]);
  ear.rotation.z = -0.19;
  ear.rotation.x = side * 0.16;
  mesh(ear, `EarCoat${side}`, new THREE.ConeGeometry(0.062, 0.235, 5), materials.coat, [0, 0.03, 0], [1, 1, 0.75]);
  mesh(ear, `EarInner${side}`, new THREE.ConeGeometry(0.035, 0.15, 4), materials.hair, [0.012, 0.045, side * 0.026], [0.65, 1, 0.28]);
  ellipsoid(head, `Eye${side}`, [0.176, 0.069, side * 0.157], [0.034, 0.03, 0.018], materials.eye, 8, 5);
  ellipsoid(head, `EyeGlint${side}`, [0.186, 0.079, side * 0.171], [0.009, 0.008, 0.004], materials.glint, 5, 3);
  ellipsoid(head, `Nostril${side}`, [0.532, -0.125, side * 0.138], [0.033, 0.023, 0.009], materials.eye, 7, 4);
  tube(head, `Mouth${side}`, [[0.42, -0.222, side * 0.105], [0.515, -0.222, side * 0.12], [0.59, -0.191, side * 0.10]], 0.006, materials.hair, 5);
}
ellipsoid(head, 'Forelock', [0.09, 0.168, 0], [0.12, 0.055, 0.095], materials.hair, 7, 4);

const blazeShape = new THREE.Shape();
blazeShape.moveTo(0, 0.12);
blazeShape.lineTo(-0.04, 0.015);
blazeShape.lineTo(0.005, -0.095);
blazeShape.lineTo(0.035, 0.01);
blazeShape.closePath();
const blaze = mesh(head, 'SmallForeheadBlaze', new THREE.ShapeGeometry(blazeShape), materials.sock, [0.28, 0.045, 0]);
blaze.rotation.y = Math.PI / 2;
blaze.rotation.x = -0.45;

// A small functional-looking saddle, pad and girth stay readable even at map
// scale. All leather is dark; the coat alone is intentionally recolourable.
ellipsoid(body, 'CreamSaddlePad', [-0.09, 0.327, 0], [0.365, 0.06, 0.305], materials.pad, 10, 5);
ellipsoid(body, 'BlackSaddleSeat', [-0.075, 0.376, 0], [0.305, 0.072, 0.245], materials.saddle, 10, 5);
ellipsoid(body, 'SaddleCantle', [-0.325, 0.411, 0], [0.055, 0.087, 0.235], materials.saddle, 8, 5);
ellipsoid(body, 'SaddlePommel', [0.17, 0.414, 0], [0.045, 0.055, 0.17], materials.saddle, 8, 5);
for (const side of [-1, 1]) {
  const flap = mesh(body, `SaddleFlap${side}`, new THREE.BoxGeometry(0.285, 0.22, 0.035), materials.saddle, [-0.03, 0.235, side * 0.29]);
  flap.rotation.x = side * -0.2;
  tube(body, `StirrupLeather${side}`, [[0.015, 0.335, side * 0.29], [0.045, 0.11, side * 0.342], [0.05, 0.015, side * 0.34]], 0.012, materials.saddle, 5);
}
const girth = mesh(body, 'BellyGirth', new THREE.TorusGeometry(0.335, 0.014, 4, 14), materials.saddle, [0.035, -0.005, 0]);
girth.rotation.y = Math.PI / 2;
girth.scale.y = 1.015;
girth.scale.x = 0.98;

const tail = group(body, 'HorseTail', [-0.795, 0.18, 0]);
bone(tail, 'TailRoot', [0, 0, 0], [-0.20, -0.17, 0], 0.07, 0.085, materials.hair, 6);
bone(tail, 'TailFall', [-0.18, -0.145, 0], [-0.32, -0.65, 0], 0.105, 0.055, materials.hair, 6);
for (let strand = 0; strand < 5; strand++) {
  const z = (strand - 2) * 0.028;
  bone(tail, `TailStrand${strand}`, [-0.27, -0.39, z], [-0.37 - Math.abs(strand - 2) * 0.012, -0.735 + Math.abs(strand - 2) * 0.025, z * 0.6], 0.035, 0.013, materials.hair, 4);
}

const legs = [];
function createLeg(name, x, z, rear, phase) {
  const upperLength = rear ? 0.37 : 0.48;
  const lowerLength = rear ? 0.43 : 0.44;
  const cannonLength = rear ? 0.16 : 0;
  const hoofHeight = 0.15;
  const restAngles = rear ? [0.42, -0.82, 0.43] : [-0.02, 0.04, 0];
  const neutralHeight = upperLength * Math.cos(restAngles[0])
    + lowerLength * Math.cos(restAngles[0] + restAngles[1])
    + cannonLength * Math.cos(restAngles.reduce((sum, value) => sum + value, 0))
    + hoofHeight;
  const upper = group(body, `${name}Upper`, [x, neutralHeight - 1.16, z]);
  upper.rotation.z = restAngles[0];
  const lower = group(upper, `${name}Lower`, [0, -upperLength, 0]);
  lower.rotation.z = restAngles[1];
  const cannon = rear ? group(lower, `${name}Cannon`, [0, -lowerLength, 0]) : null;
  if (cannon) cannon.rotation.z = restAngles[2];
  const hoof = group(cannon || lower, `${name}Hoof`, [0, -(cannonLength || lowerLength), 0]);
  hoof.rotation.z = -restAngles.reduce((sum, value) => sum + value, 0);

  bone(upper, `${name}Thigh`, [0, 0.04, 0], [0, -upperLength + 0.025, 0], rear ? 0.145 : 0.106, rear ? 0.08 : 0.07);
  ellipsoid(upper, `${name}Shoulder`, [0, -0.035, 0], [rear ? 0.17 : 0.125, rear ? 0.22 : 0.17, rear ? 0.15 : 0.12], materials.coat, 8, 5);
  ellipsoid(lower, `${name}KneeJoint`, [0, 0, 0], [0.074, 0.077, 0.072], materials.coat, 7, 4);
  bone(lower, `${name}Shin`, [0, 0, 0], [0, -lowerLength, 0], 0.064, 0.047);
  if (cannon) {
    ellipsoid(cannon, `${name}HockJoint`, [0, 0, 0], [0.068, 0.075, 0.063], materials.coat, 7, 4);
    bone(cannon, `${name}Pastern`, [0, 0, 0], [0, -cannonLength, 0], 0.05, 0.045, materials.sock);
  } else {
    bone(lower, `${name}WhiteSock`, [0, -lowerLength + 0.13, 0], [0, -lowerLength, 0], 0.052, 0.047, materials.sock);
  }
  loft(hoof, `${name}DarkHoof`, [
    [-0.071, -0.081, 0.067, 0.058],
    [-0.04, -0.081, 0.069, 0.076],
    [0.085, -0.085, 0.065, 0.076],
    [0.115, -0.092, 0.058, 0.05],
  ], 8, materials.hoof);
  legs.push({ name, upper, lower, cannon, hoof, upperLength, lowerLength, cannonLength, hoofHeight, restAngles, phase, x, z });
}

createLeg('FrontLeft', 0.555, 0.235, false, 0);
createLeg('FrontRight', 0.555, -0.235, false, Math.PI);
createLeg('HindLeft', -0.57, 0.25, true, Math.PI);
createLeg('HindRight', -0.57, -0.25, true, 0);

const duration = 1.12;
const samples = 49;
const times = Array.from({ length: samples }, (_, i) => duration * i / (samples - 1));
const tracks = [];
const quaternion = new THREE.Quaternion();
const euler = new THREE.Euler();

function rotationTrack(node, sampleRotation) {
  const values = [];
  for (const time of times) {
    const rotation = sampleRotation(time / duration * Math.PI * 2);
    quaternion.setFromEuler(euler.set(...rotation));
    values.push(...quaternion.toArray());
  }
  tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, times, values));
}

function positionTrack(node, samplePosition) {
  const values = times.flatMap((time) => samplePosition(time / duration * Math.PI * 2));
  tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.position`, times, values));
}

const bounce = (theta) => 1.16 + 0.012 * (1 - Math.cos(theta * 2));
positionTrack(body, (theta) => [0, bounce(theta), 0]);
rotationTrack(body, (theta) => [0.012 * Math.sin(theta), 0.008 * Math.sin(theta), 0.012 * Math.sin(theta * 2)]);
rotationTrack(neck, (theta) => [0, 0, -0.024 * Math.sin(theta * 2 + 0.4)]);
rotationTrack(head, (theta) => [0, 0, 0.018 * Math.sin(theta * 2 + 0.7)]);
rotationTrack(tail, (theta) => [0.14 * Math.sin(theta + 0.6), 0.08 * Math.sin(theta), 0.035 * Math.sin(theta * 2)]);

for (const leg of legs) {
  function angles(theta) {
    const phase = theta + leg.phase;
    const swing = 0.34 * Math.sin(phase);
    const flex = Math.max(0, -Math.sin(phase));
    return [
      leg.restAngles[0] + swing,
      leg.restAngles[1] + (leg.cannon ? 0.44 : -0.62) * flex,
      leg.restAngles[2] + (leg.cannon ? -0.32 : 0) * flex,
    ];
  }
  rotationTrack(leg.upper, (theta) => [0, 0, angles(theta)[0]]);
  rotationTrack(leg.lower, (theta) => [0, 0, angles(theta)[1]]);
  if (leg.cannon) rotationTrack(leg.cannon, (theta) => [0, 0, angles(theta)[2]]);
  rotationTrack(leg.hoof, (theta) => [0, 0, -angles(theta).reduce((sum, value) => sum + value, 0)]);
  // A small local hip correction keeps the supporting hooves grounded as their
  // joints flex. The lifted diagonal pair clears the street by five centimetres.
  positionTrack(leg.upper, (theta) => {
    const [a, b, c] = angles(theta);
    const lift = 0.05 * Math.max(0, -Math.sin(theta + leg.phase));
    const height = leg.upperLength * Math.cos(a)
      + leg.lowerLength * Math.cos(a + b)
      + leg.cannonLength * Math.cos(a + b + c)
      + leg.hoofHeight + lift;
    return [leg.x, height - bounce(theta), leg.z];
  });
}

const walk = new THREE.AnimationClip('Walk', duration, tracks);
horse.animations = [walk];
horse.updateMatrixWorld(true);
const bounds = new THREE.Box3().setFromObject(horse);
const size = bounds.getSize(new THREE.Vector3());
const exporter = new GLTFExporter();
const arrayBuffer = await exporter.parseAsync(horse, { binary: true, animations: [walk], trs: true, onlyVisible: true });
const buffer = Buffer.from(arrayBuffer);
if (buffer.toString('utf8', 0, 4) !== 'glTF' || buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length) {
  throw new Error('The generated asset has an invalid GLB header.');
}
const jsonLength = buffer.readUInt32LE(12);
const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
if (json.animations?.[0]?.name !== 'Walk' || json.animations[0].channels.length !== tracks.length) {
  throw new Error('The GLB is missing its complete Walk animation.');
}
if (!json.materials.some((material) => material.name === 'coat')) throw new Error('Recolourable coat material is missing.');
if (json.images?.length || json.buffers.some((entry) => entry.uri)) throw new Error('The GLB is not self-contained.');
const output = new URL('../public/models/huber-horse.glb', import.meta.url);
await mkdir(new URL('../public/models/', import.meta.url), { recursive: true });
await writeFile(output, buffer);
console.log(JSON.stringify({
  output: fileURLToPath(output),
  bytes: buffer.length,
  meshes: json.meshes.length,
  triangles: json.meshes.reduce((sum, item) => sum + item.primitives.reduce((count, primitive) => count + json.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3, 0), 0),
  nodes: json.nodes.length,
  animation: { name: walk.name, duration, tracks: tracks.length, samples },
  bounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: size.toArray() },
  coordinates: horse.userData.coordinates,
}, null, 2));
