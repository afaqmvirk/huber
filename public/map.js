import * as ML from './vendor/maplibre-gl.mjs';
import { createHorseLayer } from './vendor/horse-layer.js';
import { escape as e, horseMark, rideMap } from './illustrations.js';

const GEO = { byward: [-75.6920764, 45.4284575], parliament: [-75.7009, 45.4236], glebe: [-75.6838, 45.4006], canal: [-75.6945, 45.4251], hub: [-75.6988, 45.4203], park: [-75.6984, 45.4277] };
const ROAD_NAME = ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']];
const ROAD_WIDTH = ['interpolate', ['linear'], ['zoom'], 12, 1, 14, 4, 16, 12, 18, 32];
const STYLE = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: { streets: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>' } },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#f0f1f3' } },
    { id: 'green-space', type: 'fill', source: 'streets', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass', 'scrub']]], paint: { 'fill-color': '#e1e8df', 'fill-opacity': .75 } },
    { id: 'parks', type: 'fill', source: 'streets', 'source-layer': 'park', paint: { 'fill-color': '#e1e8df', 'fill-opacity': .8 } },
    { id: 'water', type: 'fill', source: 'streets', 'source-layer': 'water', paint: { 'fill-color': '#b7d0db' } },
    { id: 'waterways', type: 'line', source: 'streets', 'source-layer': 'waterway', paint: { 'line-color': '#b7d0db', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 17, 8] } },
    { id: 'buildings', type: 'fill', source: 'streets', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': '#e3e5e8', 'fill-opacity': .7 } },
    { id: 'roads-outline', type: 'line', source: 'streets', 'source-layer': 'transportation', filter: ['!', ['in', ['get', 'class'], ['literal', ['rail', 'transit', 'ferry', 'aerialway', 'path']]]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#dfe2e5', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 14, 5.5, 16, 13.5, 18, 33.5] } },
    { id: 'roads', type: 'line', source: 'streets', 'source-layer': 'transportation', filter: ['!', ['in', ['get', 'class'], ['literal', ['rail', 'transit', 'ferry', 'aerialway', 'path']]]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ROAD_WIDTH } },
    { id: 'paths', type: 'line', source: 'streets', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'path'], minzoom: 15, paint: { 'line-color': '#d9ddd7', 'line-width': 1.5, 'line-dasharray': [2, 2] } },
    { id: 'street-names', type: 'symbol', source: 'streets', 'source-layer': 'transportation_name', minzoom: 14.5, filter: ['!', ['in', ['get', 'class'], ['literal', ['path', 'rail', 'ferry']]]], layout: { 'symbol-placement': 'line', 'symbol-spacing': 340, 'text-field': ROAD_NAME, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10, 17, 12], 'text-max-angle': 25, 'text-padding': 12 }, paint: { 'text-color': '#6b7078', 'text-halo-color': '#ffffff', 'text-halo-width': 1.7 } },
    { id: 'neighbourhoods', type: 'symbol', source: 'streets', 'source-layer': 'place', minzoom: 13, maxzoom: 16.2, filter: ['in', ['get', 'class'], ['literal', ['neighbourhood', 'suburb', 'quarter']]], layout: { 'text-field': ROAD_NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-transform': 'uppercase', 'text-letter-spacing': .12, 'text-max-width': 8, 'text-padding': 28 }, paint: { 'text-color': '#7e858b', 'text-halo-color': '#f0f1f3', 'text-halo-width': 2 } },
  ],
};

let map, loaded = false, failed = false, current, horseLayer, startingFleet = false, lastRoute = '';
let markers = [], routingGraph;
const metres = (a, b) => Math.hypot((b[0] - a[0]) * 78500, (b[1] - a[1]) * 111320);
function fallback(options) {
  document.getElementById('map').innerHTML = rideMap(options);
  document.querySelector('.map-caption').textContent = 'Ottawa';
  document.querySelector('.walking-card').hidden = true;
  document.querySelector('.map-tools').hidden = true;
}
function lineFeatures(layer) {
  return map.querySourceFeatures('streets', { sourceLayer: layer }).flatMap(feature => {
    const lines = feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry.type === 'MultiLineString' ? feature.geometry.coordinates : [];
    return lines.map(coordinates => ({ coordinates, properties: feature.properties }));
  });
}
function buildGraph() {
  const nodes = new Map();
  const node = point => { const key = point.map(value => value.toFixed(4)).join(','); if (!nodes.has(key)) nodes.set(key, { key, point, edges: new Map() }); return nodes.get(key); };
  for (const feature of lineFeatures('transportation')) {
    if (['rail', 'transit', 'ferry', 'aerialway'].includes(feature.properties.class)) continue;
    for (let i = 1; i < feature.coordinates.length; i++) {
      const a = node(feature.coordinates[i - 1]), b = node(feature.coordinates[i]), distance = metres(a.point, b.point);
      a.edges.set(b.key, distance); b.edges.set(a.key, distance);
    }
  }
  const visited = new Set(); let largest = [];
  for (const node of nodes.values()) {
    if (visited.has(node.key)) continue;
    const component = [], pending = [node.key]; visited.add(node.key);
    while (pending.length) {
      const key = pending.pop(); component.push(key);
      for (const next of nodes.get(key).edges.keys()) if (!visited.has(next)) { visited.add(next); pending.push(next); }
    }
    if (component.length > largest.length) largest = component;
  }
  routingGraph = new Map(largest.map(key => [key, nodes.get(key)]));
}
function streetRoute(start, end) {
  if (!routingGraph?.size) return [start, end];
  const nearest = point => [...routingGraph.values()].reduce((best, candidate) => metres(candidate.point, point) < metres(best.point, point) ? candidate : best);
  const a = nearest(start), b = nearest(end), distances = new Map([[a.key, 0]]), previous = new Map(), pending = new Set([a.key]), done = new Set();
  while (pending.size) {
    let key;
    for (const candidate of pending) if (key === undefined || distances.get(candidate) < distances.get(key)) key = candidate;
    if (key === b.key) break;
    pending.delete(key); done.add(key);
    for (const [next, cost] of routingGraph.get(key).edges) {
      if (done.has(next)) continue;
      const distance = distances.get(key) + cost;
      if (distance < (distances.get(next) ?? Infinity)) { distances.set(next, distance); previous.set(next, key); pending.add(next); }
    }
    if (done.size > 12000) break;
  }
  if (!previous.has(b.key)) return [start, end];
  const coordinates = [b.point]; let key = b.key;
  while (previous.has(key)) { key = previous.get(key); coordinates.unshift(routingGraph.get(key).point); }
  return [start, ...coordinates, end];
}
function nearbyPaths() {
  const { width, height } = map.getContainer().getBoundingClientRect(), candidates = [], seen = new Set();
  for (const feature of lineFeatures('transportation_name')) {
    const p = feature.properties, name = p['name:en'] || p.name_en || p['name:latin'] || p.name;
    if (!name || ['path', 'rail', 'ferry', 'motorway', 'trunk'].includes(p.class)) continue;
    for (let i = 1; i < feature.coordinates.length; i++) {
      const a = feature.coordinates[i - 1], b = feature.coordinates[i], distance = metres(a, b);
      if (distance < 32) continue;
      const midpoint = map.project([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      if (midpoint.x < 50 || midpoint.x > width - 50 || midpoint.y < 65 || midpoint.y > height - 80) continue;
      const key = [a, b].map(point => point.map(value => value.toFixed(5)).join(',')).sort().join(':');
      if (seen.has(key)) continue; seen.add(key);
      candidates.push({ name, coordinates: [a, b], midpoint, rank: Math.hypot(midpoint.x - width * .52, midpoint.y - height * .5) - (name.includes('York') ? 80 : 0) });
    }
  }
  candidates.sort((a, b) => a.rank - b.rank);
  const selected = [];
  for (const separation of [85, 55, 25]) for (const candidate of candidates) {
    if (selected.length === 12) return selected;
    if (selected.includes(candidate) || selected.some(other => Math.hypot(other.midpoint.x - candidate.midpoint.x, other.midpoint.y - candidate.midpoint.y) < separation)) continue;
    selected.push(candidate);
  }
  return selected.slice(0, 12);
}
async function startFleet() {
  if (horseLayer || startingFleet || !loaded) return;
  const paths = nearbyPaths();
  if (paths.length < 4) return;
  startingFleet = true;
  try {
    horseLayer = await createHorseLayer(map, current.horses, paths, horse => { document.getElementById('map').dataset.selectedHorse = horse.id; });
    document.querySelector('.nearby-badge').innerHTML = `<i></i> ${paths.length} horses nearby`;
    document.querySelector('.walking-card').hidden = false;
    document.getElementById('map').dataset.streetPaths = String(paths.length);
  } catch (error) {
    console.error('The 3D horse could not load.', error);
    paths.forEach((path, i) => {
      const horse = current.horses[i % current.horses.length], element = document.createElement('button');
      element.className = 'simple-horse-marker'; element.dataset.action = 'select-horse'; element.dataset.horse = horse.id;
      element.setAttribute('aria-label', `Select ${horse.name}`); element.innerHTML = horseMark(25, '#222');
      new ML.Marker({ element }).setLngLat(path.coordinates[0]).addTo(map);
    });
    document.querySelector('.walking-card').hidden = true;
  }
}
function fitRoute(animate = false) {
  if (!map || !current) return;
  horseLayer?.recenter();
  const bounds = new ML.LngLatBounds().extend(GEO[current.pickup.id]).extend(GEO[current.destination.id]);
  const small = window.innerWidth <= 650;
  map.fitBounds(bounds, { padding: { top: small ? 65 : 100, bottom: small ? 60 : 100, left: small ? 70 : 140, right: small ? 70 : 140 }, maxZoom: small ? 15.4 : 15.65, pitch: 0, bearing: 0, duration: animate ? 650 : 0 });
}
function drawRoute() {
  const start = GEO[current.pickup.id], end = GEO[current.destination.id];
  const coordinates = current.selected ? streetRoute(start, end) : [];
  map.getSource('route').setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } });
  markers.forEach(marker => marker.remove()); markers = [];
  for (const [position, label, kind] of [[start, current.pickup.name, 'pickup'], [end, current.destination.name, 'dropoff']]) {
    const element = document.createElement('div'); element.className = `route-pin ${kind}`;
    element.innerHTML = `<span></span><strong>${e(label)}</strong>`;
    markers.push(new ML.Marker({ element, anchor: 'bottom-left', offset: [-10, 10] }).setLngLat(position).addTo(map));
  }
}
export function updateMap(options) {
  current = options;
  if (failed) return fallback(options);
  if (!map) {
    try {
      ML.setWorkerUrl('/vendor/maplibre-gl-worker.mjs'); ML.setWorkerCount(2);
      document.getElementById('map').innerHTML = '';
      map = new ML.Map({ container: 'map', style: STYLE, center: [-75.695, 45.4265], zoom: 15.55, pitch: 0, attributionControl: false, canvasContextAttributes: { antialias: true }, maxZoom: 19, minZoom: 12 });
      map.addControl(new ML.AttributionControl({ compact: true }), 'bottom-right');
      map.addControl(new ML.NavigationControl({ showCompass: false }), 'bottom-right');
      map.on('load', () => {
        loaded = true;
        map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 9 } });
        map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#17191b', 'line-width': 4.5 } });
        buildGraph(); drawRoute();
        map.once('idle', () => { buildGraph(); drawRoute(); });
        map.on('idle', () => startFleet());
        startFleet();
      });
      map.on('huber:recenter', () => fitRoute(true));
      new ResizeObserver(() => map?.resize()).observe(document.getElementById('map'));
      document.getElementById('map-perspective').addEventListener('click', event => {
        const pitched = map.getPitch() < 15;
        event.currentTarget.setAttribute('aria-pressed', String(pitched));
        map.easeTo({ pitch: pitched ? 45 : 0, duration: 700 });
      });
      map.on('pitchend', () => document.getElementById('map-perspective').setAttribute('aria-pressed', String(map.getPitch() >= 15)));
    } catch { failed = true; return fallback(options); }
  }
  const route = `${options.pickup.id}:${options.destination.id}`;
  if (route !== lastRoute) { fitRoute(); lastRoute = route; }
  if (loaded) { buildGraph(); drawRoute(); if (options.activeHorseId) horseLayer?.select(options.activeHorseId); }
  document.querySelector('.map-caption').textContent = '';
}
export function recenterMap() { fitRoute(true); }
