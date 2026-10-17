import { escape as e, horseMark, rideMap } from './illustrations.js';

const GEO = { byward: [45.4284575, -75.6920764], parliament: [45.4225085, -75.6962171], glebe: [45.4006, -75.6838], canal: [45.4251, -75.6945], hub: [45.4203, -75.6988], park: [45.4276, -75.6964] };
let map, layers, failed = false, current;
function fallback(options) {
  document.getElementById('map').innerHTML = rideMap(options);
  document.querySelector('.map-caption').textContent = 'Illustrated fallback · simulated locations';
}
export function updateMap(options) {
  current = options;
  if (failed || !window.L) return fallback(options);
  const L = window.L;
  if (!map) {
    document.getElementById('map').innerHTML = '';
    map = L.map('map', { zoomControl: false, attributionControl: true, scrollWheelZoom: true, zoomSnap: .25 }).setView([45.4252, -75.6954], 15);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    let loaded = false, errors = 0;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' })
      .on('tileload', () => { loaded = true; })
      .on('tileerror', () => { if (!loaded && ++errors === 3) { map.remove(); map = null; failed = true; fallback(current); } }).addTo(map);
    layers = L.layerGroup().addTo(map);
    new ResizeObserver(() => { if (map) map.invalidateSize({ pan: false }); }).observe(document.getElementById('map'));
  }
  layers.clearLayers();
  const start = GEO[options.pickup.id], end = GEO[options.destination.id];
  if (options.selected) {
    const route = options.pickup.id === 'byward' && options.destination.id === 'parliament'
      ? [start, [45.42765, -75.69185], [45.42625, -75.69218], [45.42555, -75.69400], [45.42468, -75.69505], [45.42305, -75.69552], end]
      : [start, [start[0] * .6 + end[0] * .4, start[1]], [end[0], start[1] * .3 + end[1] * .7], end];
    L.polyline(route, { color: '#fff', weight: 9, lineJoin: 'round' }).addTo(layers);
    L.polyline(route, { color: '#000', weight: 5, lineJoin: 'round' }).addTo(layers);
  }
  for (const [position, label, kind] of [[start, options.pickup.name, 'pickup'], [end, options.destination.name, 'dropoff']]) {
    L.marker(position, { icon: L.divIcon({ className: 'trip-marker', iconSize: [22,22], iconAnchor:[11,11], html: `<span class="map-point ${kind}"></span>` }) })
      .bindTooltip(e(label), { direction: 'top', offset: [0,-15], className: 'stop-tooltip' }).addTo(layers);
  }
  const horsePoints = [[45.4271,-75.6915],[45.4255,-75.7000],[45.4212,-75.6897]];
  options.horses.filter(h => !options.activeHorseId || h.id === options.activeHorseId).forEach(h => {
    const i = options.horses.indexOf(h);
    L.marker(horsePoints[i], { icon: L.divIcon({ className:'map-horse', iconSize:[40,40], iconAnchor:[20,20], html:`<button data-action="select-horse" data-horse="${e(h.id)}" aria-label="Select ${e(h.name)}">${horseMark(27,'#111')}</button>` }) }).addTo(layers);
  });
  map.fitBounds([start, end], { padding: [80,75], maxZoom: 15.25, animate: false });
  document.querySelector('.map-caption').textContent = 'Demo · simulated route and horse locations';
}
export function recenterMap() { if (current) updateMap(current); }
