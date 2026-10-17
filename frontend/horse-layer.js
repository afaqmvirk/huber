import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const EARTH = 111320;
function metres(a, b) { return Math.hypot((b[0] - a[0]) * EARTH * Math.cos(a[1] * Math.PI / 180), (b[1] - a[1]) * EARTH); }
function prepare(path) {
  const distances = [0];
  for (let i = 1; i < path.length; i++) distances.push(distances[i - 1] + metres(path[i - 1], path[i]));
  return { points: path, distances, length: distances.at(-1) };
}
function sample(route, distance) {
  let i = 1;
  while (i < route.distances.length - 1 && route.distances[i] < distance) i++;
  const a = route.points[i - 1], b = route.points[i];
  const t = THREE.MathUtils.clamp((distance - route.distances[i - 1]) / Math.max(.01, route.distances[i] - route.distances[i - 1]), 0, 1);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export async function createHorseLayer(map, horses, paths, onSelect) {
  const host = map.getContainer();
  const canvas = document.createElement('canvas');
  canvas.className = 'horse-scene'; canvas.setAttribute('aria-hidden', 'true');
  const hitareas = document.createElement('div'); hitareas.className = 'horse-hitareas';
  host.append(canvas, hitareas);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera();
  camera.position.set(0, 0, 800); camera.near = .1; camera.far = 1600;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x77746b, 2.5));
  const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(-100, 240, 400); scene.add(light);
  const gltf = await new GLTFLoader().loadAsync('/models/huber-horse.glb');
  let width = 0, height = 0, lead = 0, following = false;
  let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let previous = performance.now(), frame, lastDraw = 0;
  const actors = [], coats = ['#8b4e2c', '#d6b58a', '#40352f', '#af7445', '#eeeadb', '#6d4938', '#323236', '#a56a42', '#c9a27b', '#6e5e51', '#9a4f30', '#dac4a2'];
  const names = ['Sir Neighs-a-Lot', 'Hayoncé', 'Pony Soprano', 'Sherlock Hooves', 'Hoof Jackman', 'Rein Gosling', 'Harry Trotter', 'Pony Stark', 'Al Capony', 'Oat Couture', 'Neighmar', 'Usain Colt'];
  for (let i = 0; i < paths.length; i++) {
    const horse = { ...horses[i % horses.length], name: names[i] || horses[i % horses.length].name }, model = gltf.scene.clone(true), route = prepare(paths[i].coordinates);
    const coat = new THREE.MeshStandardMaterial({ color: coats[i % coats.length], roughness: .9, flatShading: true });
    model.traverse(object => { if (object.isMesh && (object.material.name === 'coat' || object.material.name.startsWith('coat_'))) object.material = coat; });
    const anchor = new THREE.Group(); anchor.add(model); scene.add(anchor);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(.68, 20), new THREE.MeshBasicMaterial({ color: '#222222', transparent: true, opacity: .13, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .015; shadow.scale.set(1.6, .6, 1); anchor.add(shadow);
    const mixer = new THREE.AnimationMixer(model), clip = gltf.animations.find(clip => /walk/i.test(clip.name)) || gltf.animations[0];
    if (clip) mixer.clipAction(clip).play();
    mixer.setTime(i * .173);
    const button = document.createElement('button');
    button.className = 'horse-hotspot'; button.dataset.horse = horse.id; button.dataset.action = 'select-horse'; button.dataset.fleetName = horse.name; button.dataset.fleetId = String(i);
    button.setAttribute('aria-label', `Select ${horse.name}, walking on ${paths[i].name}`);
    button.title = `${horse.name} · ${paths[i].name}`;
    button.addEventListener('click', () => { lead = i; onSelect?.(horse); updateCard(); });
    hitareas.append(button);
    actors.push({ anchor, model, mixer, route, button, horse, street: paths[i].name, distance: route.length * (.2 + (i * .219) % .6), direction: i % 2 ? -1 : 1, speed: 2.4 + (i % 4) * .35, heading: 0, point: route.points[0] });
  }
  const followButton = document.getElementById('follow-horse'), motionButton = document.getElementById('horse-motion');
  function updateCard() {
    const actor = actors[lead]; if (!actor) return;
    document.getElementById('walking-horse-name').textContent = actor.horse.name;
    document.getElementById('walking-horse-street').textContent = `Walking on ${actor.street}`;
    followButton.textContent = following ? 'Back to map' : 'Follow horse';
    followButton.setAttribute('aria-pressed', String(following));
  }
  function toggleFollow() {
    following = !following;
    if (following) map.easeTo({ center: actors[lead].point, zoom: 18, pitch: 42, duration: 1000, essential: false });
    else { map.fire('huber:recenter'); }
    updateCard();
  }
  followButton.addEventListener('click', toggleFollow);
  function updateMotion() {
    motionButton.setAttribute('aria-label', paused ? 'Play walking horses' : 'Pause walking horses');
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.innerHTML = paused ? '<span aria-hidden="true">▶</span>' : '<span aria-hidden="true">Ⅱ</span>';
  }
  motionButton.addEventListener('click', () => { paused = !paused; updateMotion(); });
  map.on('dragstart', () => { following = false; updateCard(); });
  const size = () => {
    const bounds = host.getBoundingClientRect(); width = bounds.width; height = bounds.height;
    renderer.setSize(width, height, false);
    camera.left = -width / 2; camera.right = width / 2; camera.top = height / 2; camera.bottom = -height / 2; camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(size); observer.observe(host); size(); updateMotion(); updateCard();
  host.dataset.horseCount = String(actors.length);
  host.dataset.modelLoaded = 'true';
  function animate(now) {
    frame = requestAnimationFrame(animate);
    if (now - lastDraw < 32 || document.hidden || !host.clientHeight) return;
    const dt = Math.min((now - previous) / 1000, .07); previous = now; lastDraw = now;
    const tilt = THREE.MathUtils.degToRad(62 - map.getPitch() * .35);
    const scale = THREE.MathUtils.clamp(13 * 2 ** ((map.getZoom() - 15.5) * .65), 9, 43);
    actors.forEach((actor, index) => {
      if (!paused) {
        actor.distance += dt * actor.speed * actor.direction;
        if (actor.distance >= actor.route.length || actor.distance <= 0) { actor.distance = THREE.MathUtils.clamp(actor.distance, .1, actor.route.length - .1); actor.direction *= -1; }
        actor.mixer.update(dt * (actor.speed / 2.8));
      }
      const point = sample(actor.route, actor.distance), next = sample(actor.route, THREE.MathUtils.clamp(actor.distance + actor.direction * 2, 0, actor.route.length));
      actor.point = point;
      const projected = map.project(point), ahead = map.project(next);
      const target = Math.atan2(-(ahead.y - projected.y) / Math.sin(tilt), ahead.x - projected.x);
      const delta = Math.atan2(Math.sin(target - actor.heading), Math.cos(target - actor.heading));
      actor.heading += delta * Math.min(1, dt * 8);
      actor.anchor.position.set(projected.x - width / 2, height / 2 - projected.y, 0);
      actor.anchor.rotation.x = tilt; actor.anchor.scale.setScalar(scale * (index === lead ? 1.2 : .88));
      actor.model.rotation.y = actor.heading;
      const visible = projected.x > -80 && projected.y > -80 && projected.x < width + 80 && projected.y < height + 80;
      actor.anchor.visible = visible; actor.button.hidden = !visible;
      actor.button.style.transform = `translate(${projected.x - 25}px, ${projected.y - 46}px)`;
      actor.button.classList.toggle('selected', index === lead);
    });
    if (following && !map.isMoving()) map.jumpTo({ center: actors[lead].point });
    renderer.render(scene, camera);
  }
  frame = requestAnimationFrame(animate);
  return {
    select(horseId) { const found = actors.findIndex(actor => actor.horse.id === horseId); if (found >= 0) { lead = found; updateCard(); } },
    recenter() { following = false; updateCard(); },
    destroy() { cancelAnimationFrame(frame); observer.disconnect(); renderer.dispose(); canvas.remove(); hitareas.remove(); actors.forEach(a => a.mixer.stopAllAction()); },
  };
}
