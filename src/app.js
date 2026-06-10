/* ============================================================================
   AirHub Waypoint Creator — application logic
   Sections: utils · geo · cameras · state · registry · missions ·
             waypoint helpers · export · map · profile · panel · stats ·
             validation · history · settings · main
   Single inlined script (no ES imports) so the bundler can concatenate it.
   ========================================================================== */
(function () {
'use strict';

/* ── tiny utils ───────────────────────────────────────────────────────────*/
var $ = function (id) { return document.getElementById(id); };
var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
var lerp = function (a, b, t) { return a + (b - a) * t; };
var num = function (v, d) { var n = parseFloat(v); return isFinite(n) ? n : (d || 0); };
var r = function (n, d) { return +n.toFixed(d); };
var r1 = function (n) { return r(n, 1); }, r2 = function (n) { return r(n, 2); },
    r3 = function (n) { return r(n, 3); }, r7 = function (n) { return r(n, 7); };
var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
var nowISO = function () { return new Date().toISOString(); };
var OUTPREVIEWMAX = 20000;

/* ── geo (all lat-first) ──────────────────────────────────────────────────*/
var D2R = Math.PI / 180, R2D = 180 / Math.PI, ER = 6371000;
var MPD_LAT = 111320; // metres per degree latitude (approx)
function mpdLon(lat) { return 111320 * Math.cos(lat * D2R); }

function bearing(lat1, lon1, lat2, lon2) {
  var f1 = lat1 * D2R, f2 = lat2 * D2R, dl = (lon2 - lon1) * D2R;
  var y = Math.sin(dl) * Math.cos(f2);
  var x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (Math.atan2(y, x) * R2D + 360) % 360;
}
function dist(lat1, lon1, lat2, lon2) {
  var dLat = (lat2 - lat1) * D2R, dLon = (lon2 - lon1) * D2R;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return ER * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function destination(lat, lon, brngDeg, distM) {
  if (distM < 0) { distM = -distM; brngDeg += 180; }
  var d = distM / ER, b = brngDeg * D2R, la1 = lat * D2R, lo1 = lon * D2R;
  var la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b));
  var lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return { lat: la2 * R2D, lon: lo2 * R2D };
}
function centroid(verts) {
  var la = 0, lo = 0; verts.forEach(function (v) { la += v.lat; lo += v.lon; });
  return { lat: la / verts.length, lon: lo / verts.length };
}
function avgAngle(a, b) {
  var x = Math.cos(a * D2R) + Math.cos(b * D2R), y = Math.sin(a * D2R) + Math.sin(b * D2R);
  return (Math.atan2(y, x) * R2D + 360) % 360;
}
function estimateMission(wps, spd) {
  var d = 0;
  for (var i = 1; i < wps.length; i++) {
    var a = wps[i - 1].location, b = wps[i].location;
    var h = dist(a.lat, a.lon, b.lat, b.lon), v = Math.abs(b.alt - a.alt);
    d += Math.sqrt(h * h + v * v);
  }
  return { dist: Math.round(d), dur: spd > 0 ? Math.round(d / spd) : 0 };
}
// densify a polyline into points no more than `step` apart (keeps endpoints)
function densify(a, b, step) {
  var L = dist(a.lat, a.lon, b.lat, b.lon);
  if (step <= 0 || L <= step) return [a, b];
  var n = Math.ceil(L / step), out = [], brng = bearing(a.lat, a.lon, b.lat, b.lon);
  for (var i = 0; i <= n; i++) out.push(destination(a.lat, a.lon, brng, L * i / n));
  return out;
}

/* ── lens types (FOV degrees) ────────────────────────────────────────────── */
var LENSES = {
  wide:       { h: 72.0, v: 56.0 },
  narrowband: { h: 40.0, v: 30.0 },
  infrared:   { h: 45.0, v: 35.0 },
  zoom:       { h: 30.0, v: 22.0 }
};
function camFOV() { return LENSES[state.shared.camera.lens] || null; }
function laneSpacingFor(alt) {
  var ov = clamp(state.shared.camera.sideOverlap / 100, 0, 0.95), c = camFOV();
  if (c) return Math.max(0.5, 2 * alt * Math.tan(c.h * D2R / 2) * (1 - ov));
  return Math.max(1, alt * 0.8);
}
function photoSpacingFor(alt) {
  var ov = clamp(state.shared.camera.frontOverlap / 100, 0, 0.95), c = camFOV();
  if (c) return Math.max(0.5, 2 * alt * Math.tan(c.v * D2R / 2) * (1 - ov));
  return Math.max(1, alt * 0.5);
}

/* ── waypoint helpers ──────────────────────────────────────────────────────*/
function loc(lat, lon, alt) { return { lat: r7(lat), lon: r7(lon), alt: r3(alt) }; }
function gimbal(pitch) { return { type: 'gimbalRotate', order: 0, parameters: { gimbalRotate: { pitch: r1(pitch), roll: 0, yaw: 0 } } }; }
function photo(order) { return { type: 'takePhoto', order: order == null ? 1 : order }; }
function rotateYaw(h) { return { type: 'rotateYaw', order: 0, parameters: { rotateYaw: { aircraftHeading: r2(h), aircraftPathMode: 'clockwise' } } }; }
function trigShot(ctx) { return ctx.trigger === 'waypoint' || ctx.trigger === 'distance'; }
// Photo spacing (m) used to densify a path. Distance mode → capture every photoDistance m;
// waypoint mode → use the mission's own spacing field (0 = capture only at structural points).
function photoStep(ctx, ownSpacing) {
  if (ctx.trigger === 'distance') return Math.max(0.5, +ctx.photoDistance || 10);
  return ownSpacing > 0 ? ownSpacing : 0;
}
function wpPhoto(lat, lon, alt, spd, heading, pitch, ctx, extraActions) {
  var hdg = r2(((heading % 360) + 360) % 360);
  var acts = [rotateYaw(hdg)];
  if (pitch != null) acts.push(gimbal(pitch));
  if (extraActions) acts = acts.concat(extraActions);
  if (trigShot(ctx)) acts.push(photo());
  acts.forEach(function (a, i) { a.order = i; });
  var wp = { location: loc(lat, lon, alt), waypointType: 'waypoint', headingMode: 'fixed', speed: spd };
  if (acts.length) wp.actions = acts;
  return wp;
}
function dedupeYaw(wps) {
  var lastHdg = null;
  wps.forEach(function (wp) {
    if (wp.headingMode !== 'fixed' || !wp.actions) return;
    var idx = -1;
    wp.actions.forEach(function (a, i) { if (a.type === 'rotateYaw') idx = i; });
    if (idx === -1) return;
    var hdg = wp.actions[idx].parameters.rotateYaw.aircraftHeading;
    if (hdg === lastHdg) {
      wp.actions.splice(idx, 1);
      wp.actions.forEach(function (a, i) { a.order = i; });
    } else {
      lastHdg = hdg;
    }
  });
  return wps;
}

/* ── transect heading (perpendicular to A-B, toward POI) ────────────────────*/
function autoHeadingDetails(A, B, POI) {
  var travel = bearing(A.lat, A.lon, B.lat, B.lon);
  var mid = { lat: (A.lat + B.lat) / 2, lon: (A.lon + B.lon) / 2 };
  var toPOI = bearing(mid.lat, mid.lon, POI.lat, POI.lon);
  var delta = ((toPOI - travel + 540) % 360) - 180;
  var side = delta >= 0 ? 'right' : 'left';
  var heading = (travel + (delta >= 0 ? 90 : -90) + 360) % 360;
  return { travel: travel, toPOI: toPOI, heading: heading, side: side };
}

/* ── mission registry ───────────────────────────────────────────────────── */
var MISSIONS = {};
var ORDER = ['transect', 'orbit', 'spiral', 'facade', 'corridor', 'perimeter'];
var CATS = [
  { name: 'Line', ids: ['transect', 'corridor', 'perimeter', 'facade'] },
  { name: 'Inspection', ids: ['orbit', 'spiral'] }
];
function reg(m) { MISSIONS[m.id] = m; }
var RING_COLORS = ['#4eadea', '#4ade80', '#fb923c', '#f87171', '#a78bfa', '#34d399', '#60a5fa', '#f472b6'];
var RING_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

var DEMO = { lat: 58.92045759696814, lon: 5.7362006464208575 };

/* ============================== MISSION: TRANSECT ========================= */
reg({
  id: 'transect', label: 'Vertical transect', cat: 'Line', icon: 'arrow-up-down',
  desc: 'Flies an A↔B zig-zag that climbs in altitude steps then descends on a staggered offset, camera locked toward a point of interest. Use it to capture a tall vertical face — cliff, dam, building, ship hull — at even height intervals for inspection or 3D reconstruction.',
  geometry: 'POINTS', hasProfile: true,
  points: [
    { key: 'A', label: 'A · start', color: 'var(--success)' },
    { key: 'B', label: 'B · end', color: 'var(--danger)' },
    { key: 'POI', label: 'POI · target', color: 'var(--accent-light)' }
  ],
  defaults: {
    A: { lat: 58.91944655661257, lon: 5.735056039452445 },
    B: { lat: 58.91928146032262, lon: 5.736448455815037 },
    POI: { lat: 58.919, lon: 5.73575 },
    minAlt: 10, maxAlt: 60, upStep: 10, startSide: 'A', heading: null
  },
  fields: [
    { key: 'minAlt', label: 'Min AGL', unit: 'm', type: 'number', step: 5, min: 0 },
    { key: 'maxAlt', label: 'Max AGL', unit: 'm', type: 'number', step: 5, min: 0 },
    { key: 'upStep', label: 'Ascent step', unit: 'm', type: 'number', step: 1, min: 1 },
    { key: 'heading', label: 'Heading (blank=auto)', unit: '°', type: 'number', step: 1 },
    { key: 'startSide', label: 'Take off / land at', type: 'select', options: [{ v: 'A', l: 'Point A' }, { v: 'B', l: 'Point B' }] }
  ],
  zigzag: function (minA, maxA, up) {
    var legs = [], side = 'A', alt;
    for (alt = minA; alt <= maxA + 1e-9; alt += up) { legs.push({ side: side, alt: alt }); legs.push({ side: side === 'A' ? 'B' : 'A', alt: alt }); side = side === 'A' ? 'B' : 'A'; }
    var d = maxA - up / 2;
    while (d >= minA - 1e-9) { legs.push({ side: side, alt: d }); legs.push({ side: side === 'A' ? 'B' : 'A', alt: d }); side = side === 'A' ? 'B' : 'A'; d -= up; }
    return legs;
  },
  buildWaypoints: function (c) {
    if (c.maxAlt < c.minAlt || c.upStep <= 0) return [];
    var hd = autoHeadingDetails(c.A, c.B, c.POI);
    var heading = (c.heading != null && isFinite(c.heading)) ? c.heading : hd.heading;
    var legs = this.zigzag(c.minAlt, c.maxAlt, c.upStep);
    var coords = { A: c.A, B: c.B }, sideMap = c.startSide === 'A' ? { A: 'A', B: 'B' } : { A: 'B', B: 'A' };
    var out = [];
    var first = coords[sideMap[legs[0].side]];
    var fw = wpPhoto(first.lat, first.lon, c.ground + legs[0].alt, c.speed, heading, null, c);
    out.push(fw);
    for (var i = 1; i < legs.length; i++) { var p = coords[sideMap[legs[i].side]]; out.push(wpPhoto(p.lat, p.lon, c.ground + legs[i].alt, c.speed, heading, null, c)); }
    var last = coords[sideMap[legs[legs.length - 1].side]];
    if (Math.abs(legs[legs.length - 1].alt - c.minAlt) > 1e-9) out.push(wpPhoto(last.lat, last.lon, c.ground + c.minAlt, c.speed, heading, null, c));
    return out;
  },
  drawMap: function (c, H) {
    H.line([[c.A.lat, c.A.lon], [c.B.lat, c.B.lon]], { color: '#4eadea', weight: 3, opacity: 0.9, dashArray: '6 6' });
    var hd = autoHeadingDetails(c.A, c.B, c.POI);
    var heading = (c.heading != null && isFinite(c.heading)) ? c.heading : hd.heading;
    var mid = { lat: (c.A.lat + c.B.lat) / 2, lon: (c.A.lon + c.B.lon) / 2 };
    var tip = destination(mid.lat, mid.lon, heading, Math.max(8, dist(c.A.lat, c.A.lon, c.B.lat, c.B.lon) * 0.7));
    H.line([[mid.lat, mid.lon], [tip.lat, tip.lon]], { color: '#fb923c', weight: 2.5 });
    H.dot(tip.lat, tip.lon, '#fb923c', 4);
  },
  summary: function (c) {
    var hd = autoHeadingDetails(c.A, c.B, c.POI);
    var heading = (c.heading != null && isFinite(c.heading)) ? c.heading : hd.heading;
    return 'heading ' + r2(heading) + '° · POI on ' + hd.side;
  },
  validate: function (c) {
    var e = [], w = [];
    if (c.maxAlt < c.minAlt) e.push('Max AGL below min AGL');
    if (c.upStep <= 0) e.push('Ascent step must be > 0');
    return { errs: e, warns: w };
  }
});

/* ============================== MISSION: ORBIT ============================ */
reg({
  id: 'orbit', label: 'Circular orbit', cat: 'Inspection', icon: 'orbit',
  desc: 'Flies one or more rings around a point of interest, each ring at its own altitude, radius and gimbal pitch. Use it to photograph a structure — tower, turbine, monument, building — from every side at multiple heights for 360° inspection or photogrammetry.',
  geometry: 'POINTS', hasProfile: true,
  points: [{ key: 'center', label: 'Center · POI', color: 'var(--accent-light)' }],
  defaults: {
    center: { lat: DEMO.lat, lon: DEMO.lon },
    globalRadius: 8, wpPerRing: 12, startAngle: 0, orbitDir: 'CW', stagger: false, staggerAngle: 15,
    yawMode: 'towardPOI', fixedHeading: 0, nadir: true, nadirAlt: 20,
    rings: [{ alt: 5, pitch: -15, radius: null }, { alt: 12, pitch: -35, radius: null }, { alt: 20, pitch: -55, radius: null }]
  },
  fields: [
    { key: 'globalRadius', label: 'Global radius', unit: 'm', type: 'number', step: 0.5, min: 1 },
    { key: 'wpPerRing', label: 'Waypoints / ring', type: 'number', step: 1, min: 4, max: 72 },
    { key: 'startAngle', label: 'Start angle', unit: '°', type: 'number', step: 5, min: 0, max: 359 },
    { key: 'orbitDir', label: 'Direction', type: 'seg', options: [{ v: 'CW', l: 'CW' }, { v: 'CCW', l: 'CCW' }] },
    { key: 'yawMode', label: 'Heading', type: 'seg', options: [{ v: 'towardPOI', l: 'POI' }, { v: 'tangent', l: 'Tangent' }, { v: 'fixedHeading', l: 'Fixed' }] },
    { key: 'fixedHeading', label: 'Fixed heading', unit: '°', type: 'number', step: 5, min: 0, max: 359, showIf: function (p) { return p.yawMode === 'fixedHeading'; } },
    { key: 'stagger', label: 'Stagger rings (offset start per ring)', type: 'toggle' },
    { key: 'staggerAngle', label: 'Stagger angle', unit: '°', type: 'number', step: 5, min: 0, max: 90, showIf: function (p) { return p.stagger; } },
    { key: 'rings', type: 'rings' },
    { key: 'nadir', label: 'Nadir shot (overhead, −90°)', type: 'toggle' },
    { key: 'nadirAlt', label: 'Nadir altitude', unit: 'm', type: 'number', step: 1, min: 1, showIf: function (p) { return p.nadir; } }
  ],
  ringPts: function (c, radius, ri) {
    var n = Math.max(4, c.wpPerRing | 0), off = c.stagger ? ri * (c.staggerAngle || 0) : 0, pts = [];
    for (var j = 0; j < n; j++) { var raw = c.startAngle + off + (c.orbitDir === 'CW' ? 1 : -1) * (j / n) * 360; pts.push(destination(c.center.lat, c.center.lon, ((raw % 360) + 360) % 360, radius)); }
    return pts;
  },
  wpHeading: function (c, pt) {
    if (c.yawMode === 'towardPOI') return null;
    if (c.yawMode === 'tangent') { var b = bearing(c.center.lat, c.center.lon, pt.lat, pt.lon); return ((b + (c.orbitDir === 'CW' ? 90 : -90)) + 360) % 360; }
    return c.fixedHeading;
  },
  buildWaypoints: function (c) {
    if (!c.rings || !c.rings.length) return [];
    var self = this, gR = c.globalRadius, out = [];
    c.rings.forEach(function (ring, ri) {
      var radius = ring.radius != null ? ring.radius : gR;
      self.ringPts(c, radius, ri).forEach(function (pt) {
        var hdg = self.wpHeading(c, pt);
        var acts = [];
        if (hdg != null) acts.push(rotateYaw(r2(hdg)));
        acts.push(gimbal(ring.pitch));
        if (trigShot(c)) acts.push(photo());
        acts.forEach(function (a, i) { a.order = i; });
        var wp = { location: loc(pt.lat, pt.lon, c.ground + ring.alt), waypointType: 'waypoint', headingMode: c.yawMode === 'towardPOI' ? 'towardPOI' : 'fixed', speed: c.speed, actions: acts };
        if (c.yawMode === 'towardPOI') wp.poiCoordinate = { lat: r7(c.center.lat), lon: r7(c.center.lon) };
        out.push(wp);
      });
    });
    if (c.nadir) { var acts = [gimbal(-90)]; if (trigShot(c)) acts.push(photo()); acts.forEach(function (a, i) { a.order = i; }); out.push({ location: loc(c.center.lat, c.center.lon, c.ground + c.nadirAlt), waypointType: 'waypoint', headingMode: 'fixed', speed: c.speed, actions: acts }); }
    return out;
  },
  drawMap: function (c, H) {
    var self = this, gR = c.globalRadius;
    c.rings.forEach(function (ring, ri) {
      var radius = ring.radius != null ? ring.radius : gR, col = RING_COLORS[ri % RING_COLORS.length];
      H.circle(c.center.lat, c.center.lon, radius, { color: col, weight: 1.5, opacity: 0.7, fill: false });
      self.ringPts(c, radius, ri).forEach(function (pt, j) { H.dot(pt.lat, pt.lon, col, j === 0 ? 4 : 2.5); });
    });
    if (c.nadir) H.dot(c.center.lat, c.center.lon, '#8b9099', 3);
  },
  summary: function (c) { var n = Math.max(4, c.wpPerRing | 0); return c.rings.length + ' rings · ' + (c.rings.length * n + (c.nadir ? 1 : 0)) + ' photos'; },
  center: function (c) { return c.center; },
  validate: function (c) {
    var e = [], w = [];
    if (c.globalRadius < 1) e.push('Global radius must be ≥ 1 m');
    if (!c.rings.length) e.push('Add at least one altitude ring');
    if (c.wpPerRing > 36) w.push(c.wpPerRing + ' waypoints/ring is high — most controllers cap at 36');
    var alts = c.rings.map(function (x) { return x.alt; }), dup = alts.filter(function (a, i) { return alts.indexOf(a) !== i; });
    if (dup.length) w.push('Duplicate ring altitudes: ' + Array.from(new Set(dup)).join(', ') + ' m');
    return { errs: e, warns: w };
  }
});

/* ============================== MISSION: SPIRAL =========================== */
reg({
  id: 'spiral', label: 'Spiral / helix', cat: 'Inspection', icon: 'tornado',
  desc: 'Flies a continuous climb-and-rotate around a point of interest over a set number of turns, gimbal pitch easing as it rises. Use it for smooth helical coverage of a tall asset — chimney, mast, wind turbine — without the stop-start of discrete orbit rings; good for video and dense capture.',
  geometry: 'POINTS', hasProfile: true,
  points: [{ key: 'center', label: 'Center · POI', color: 'var(--accent-light)' }],
  defaults: {
    center: { lat: DEMO.lat, lon: DEMO.lon },
    turns: 4, ptsPerTurn: 16, altStart: 5, altEnd: 40, radiusStart: 10, radiusEnd: 10,
    startAngle: 0, orbitDir: 'CW', pitchStart: -15, pitchEnd: -60
  },
  fields: [
    { key: 'turns', label: 'Turns', type: 'number', step: 0.5, min: 0.5 },
    { key: 'ptsPerTurn', label: 'Points / turn', type: 'number', step: 1, min: 4, max: 48 },
    { key: 'altStart', label: 'Start alt', unit: 'm', type: 'number', step: 1 },
    { key: 'altEnd', label: 'End alt', unit: 'm', type: 'number', step: 1 },
    { key: 'radiusStart', label: 'Start radius', unit: 'm', type: 'number', step: 0.5, min: 1 },
    { key: 'radiusEnd', label: 'End radius', unit: 'm', type: 'number', step: 0.5, min: 1 },
    { key: 'startAngle', label: 'Start angle', unit: '°', type: 'number', step: 5, min: 0, max: 359 },
    { key: 'orbitDir', label: 'Direction', type: 'seg', options: [{ v: 'CW', l: 'CW' }, { v: 'CCW', l: 'CCW' }] },
    { key: 'pitchStart', label: 'Start pitch', unit: '°', type: 'number', step: 5, min: -90, max: 0 },
    { key: 'pitchEnd', label: 'End pitch', unit: '°', type: 'number', step: 5, min: -90, max: 0 }
  ],
  pathPts: function (c) {
    var N = Math.max(2, Math.round(c.turns * c.ptsPerTurn)), pts = [];
    for (var k = 0; k <= N; k++) {
      var t = k / N, ang = c.startAngle + (c.orbitDir === 'CW' ? 1 : -1) * 360 * c.turns * t;
      var rad = lerp(c.radiusStart, c.radiusEnd, t), p = destination(c.center.lat, c.center.lon, ((ang % 360) + 360) % 360, rad);
      pts.push({ lat: p.lat, lon: p.lon, alt: lerp(c.altStart, c.altEnd, t), pitch: lerp(c.pitchStart, c.pitchEnd, t) });
    }
    return pts;
  },
  buildWaypoints: function (c) {
    var pts = this.pathPts(c); if (!pts.length) return [];
    var out = [];
    pts.forEach(function (p) {
      var acts = [gimbal(p.pitch)]; if (trigShot(c)) acts.push(photo());
      out.push({ location: loc(p.lat, p.lon, c.ground + p.alt), waypointType: 'waypoint', headingMode: 'towardPOI', speed: c.speed, poiCoordinate: { lat: r7(c.center.lat), lon: r7(c.center.lon) }, actions: acts });
    });
    return out;
  },
  drawMap: function (c, H) {
    var pts = this.pathPts(c);
    H.line(pts.map(function (p) { return [p.lat, p.lon]; }), { color: '#4eadea', weight: 2 });
    H.dot(c.center.lat, c.center.lon, '#8b9099', 3);
  },
  summary: function (c) { return c.turns + ' turns · ' + Math.max(2, Math.round(c.turns * c.ptsPerTurn) + 1) + ' photos'; },
  center: function (c) { return c.center; },
  validate: function (c) { var e = []; if (c.radiusStart < 1 || c.radiusEnd < 1) e.push('Radius must be ≥ 1 m'); if (c.turns <= 0) e.push('Turns must be > 0'); return { errs: e, warns: [] }; }
});

/* ============================== MISSION: FACADE =========================== */
reg({
  id: 'facade', label: 'Facade / wall scan', cat: 'Line', icon: 'building-2',
  desc: 'Flies boustrophedon (lawnmower) rows across a flat wall, offset from an A–B baseline by a fixed standoff distance, camera facing the surface. Use it for systematic close-range coverage of a building face — crack detection, condition surveys, or facade orthomosaics.',
  geometry: 'POINTS', hasProfile: true,
  points: [
    { key: 'A', label: 'Wall A', color: 'var(--success)' },
    { key: 'B', label: 'Wall B', color: 'var(--danger)' }
  ],
  defaults: {
    A: { lat: 58.91944655661257, lon: 5.735056039452445 },
    B: { lat: 58.91928146032262, lon: 5.736448455815037 },
    standoff: 15, bottomAlt: 5, wallHeight: 40, side: 'right', pitch: 0, vStep: 0, hStep: 0
  },
  fields: [
    { key: 'standoff', label: 'Standoff', unit: 'm', type: 'number', step: 1, min: 1 },
    { key: 'bottomAlt', label: 'Bottom alt', unit: 'm', type: 'number', step: 1 },
    { key: 'wallHeight', label: 'Wall height', unit: 'm', type: 'number', step: 1, min: 1 },
    { key: 'side', label: 'Standoff side', type: 'seg', options: [{ v: 'right', l: 'Right' }, { v: 'left', l: 'Left' }] },
    { key: 'pitch', label: 'Gimbal pitch', unit: '°', type: 'number', step: 5, min: -90, max: 30 },
    { key: 'vStep', label: 'Row step (0=auto)', unit: 'm', type: 'number', step: 1, min: 0 },
    { key: 'hStep', label: 'Col step (0=auto)', unit: 'm', type: 'number', step: 1, min: 0 }
  ],
  geom: function (c) {
    var faceBrng = bearing(c.A.lat, c.A.lon, c.B.lat, c.B.lon);
    var normal = (faceBrng + (c.side === 'right' ? 90 : -90) + 360) % 360;
    var A2 = destination(c.A.lat, c.A.lon, normal, c.standoff), B2 = destination(c.B.lat, c.B.lon, normal, c.standoff);
    var look = (normal + 180) % 360;
    return { faceBrng: faceBrng, normal: normal, A2: A2, B2: B2, look: look, len: dist(c.A.lat, c.A.lon, c.B.lat, c.B.lon) };
  },
  buildWaypoints: function (c) {
    var g = this.geom(c); if (g.len < 0.5 || c.wallHeight <= 0) return [];
    var vStep = c.vStep > 0 ? c.vStep : photoSpacingFor(c.standoff);
    var hStep = photoStep(c, c.hStep > 0 ? c.hStep : laneSpacingFor(c.standoff)) || laneSpacingFor(c.standoff);
    var out = [], flip = false;
    for (var alt = c.bottomAlt + vStep / 2; alt <= c.bottomAlt + c.wallHeight + 1e-9; alt += vStep) {
      var row = densify(g.A2, g.B2, hStep); if (flip) row = row.slice().reverse();
      row.forEach(function (p) { out.push(wpPhoto(p.lat, p.lon, c.ground + alt, c.speed, g.look, c.pitch, c)); });
      flip = !flip;
    }
    return out;
  },
  drawMap: function (c, H) {
    var g = this.geom(c);
    H.line([[c.A.lat, c.A.lon], [c.B.lat, c.B.lon]], { color: '#fb923c', weight: 3 });
    H.line([[g.A2.lat, g.A2.lon], [g.B2.lat, g.B2.lon]], { color: '#4eadea', weight: 2, dashArray: '5 5' });
    H.line([[c.A.lat, c.A.lon], [g.A2.lat, g.A2.lon]], { color: '#4eadea', weight: 1, opacity: 0.5 });
    H.line([[c.B.lat, c.B.lon], [g.B2.lat, g.B2.lon]], { color: '#4eadea', weight: 1, opacity: 0.5 });
  },
  summary: function (c) { var g = this.geom(c); return 'wall ' + r1(g.len) + ' m · standoff ' + c.standoff + ' m'; },
  center: function (c) { return { lat: (c.A.lat + c.B.lat) / 2, lon: (c.A.lon + c.B.lon) / 2 }; },
  validate: function (c) { var e = []; if (dist(c.A.lat, c.A.lon, c.B.lat, c.B.lon) < 0.5) e.push('Wall endpoints A and B coincide'); if (c.wallHeight <= 0) e.push('Wall height must be > 0'); return { errs: e, warns: [] }; }
});

/* ============================== MISSION: CORRIDOR ========================= */
reg({
  id: 'corridor', label: 'Corridor', cat: 'Line', icon: 'route',
  desc: 'Flies symmetric parallel lanes that follow a polyline path. Use it to map linear infrastructure — roads, railways, pipelines, power lines, rivers, shorelines — with even coverage along the whole route.',
  geometry: 'POLYLINE', hasProfile: false,
  defaults: { alt: 40, laneCount: 3, laneSpacing: 10, photoSpacing: 0, pitch: -90 },
  fields: [
    { key: 'alt', label: 'Altitude AGL', unit: 'm', type: 'number', step: 5, min: 1 },
    { key: 'laneCount', label: 'Parallel lanes', type: 'number', step: 1, min: 1, max: 9 },
    { key: 'laneSpacing', label: 'Lane spacing', unit: 'm', type: 'number', step: 1, min: 1 },
    { key: 'photoSpacing', label: 'Photo spacing (0=verts)', unit: 'm', type: 'number', step: 1, min: 0 },
    { key: 'pitch', label: 'Gimbal pitch', unit: '°', type: 'number', step: 5, min: -90, max: 0 }
  ],
  offsetPath: function (path, off) {
    return path.map(function (v, i) {
      var inB = i > 0 ? bearing(path[i - 1].lat, path[i - 1].lon, v.lat, v.lon) : bearing(v.lat, v.lon, path[i + 1].lat, path[i + 1].lon);
      var outB = i < path.length - 1 ? bearing(v.lat, v.lon, path[i + 1].lat, path[i + 1].lon) : inB;
      var normal = (avgAngle(inB, outB) + 90) % 360;
      return destination(v.lat, v.lon, normal, off);
    });
  },
  lanes: function (c) {
    var k = Math.max(1, c.laneCount | 0), out = [];
    for (var i = 0; i < k; i++) { var off = (i - (k - 1) / 2) * c.laneSpacing; out.push({ off: off, path: this.offsetPath(c.vertices, off) }); }
    return out;
  },
  buildWaypoints: function (c) {
    if (!c.vertices || c.vertices.length < 2) return [];
    var lanes = this.lanes(c), out = [], total = 0, ps = photoStep(c, c.photoSpacing || 0);
    lanes.forEach(function (lane, li) {
      var path = li % 2 ? lane.path.slice().reverse() : lane.path;
      for (var s = 0; s < path.length - 1; s++) {
        var hd = bearing(path[s].lat, path[s].lon, path[s + 1].lat, path[s + 1].lon);
        var seg = ps > 0 ? densify(path[s], path[s + 1], ps) : [path[s], path[s + 1]];
        seg.forEach(function (p, idx) {
          if (s > 0 && idx === 0) return; // avoid duplicate vertex
          if (total++ > 4000) return;
          out.push(wpPhoto(p.lat, p.lon, c.ground + c.alt, c.speed, hd, c.pitch, c));
        });
      }
    });
    return out;
  },
  drawMap: function (c, H) {
    if (!c.vertices || c.vertices.length < 2) return;
    this.lanes(c).forEach(function (lane) { H.line(lane.path.map(function (p) { return [p.lat, p.lon]; }), { color: lane.off === 0 ? '#4eadea' : '#4ade80', weight: lane.off === 0 ? 2 : 1.4, opacity: 0.85 }); });
  },
  summary: function (c) { return (c.vertices ? c.vertices.length : 0) + '-pt path · ' + c.laneCount + ' lanes'; },
  validate: function (c) { var e = []; if (!c.vertices || c.vertices.length < 2) e.push('Draw a path — click ≥ 2 points on the map'); return { errs: e, warns: [] }; }
});

/* ============================== MISSION: PERIMETER ======================== */
reg({
  id: 'perimeter', label: 'Polygon perimeter', cat: 'Line', icon: 'hexagon',
  desc: 'Flies a closed boundary loop at a fixed altitude, optionally inset inward, camera facing the centroid or a fixed heading. Use it to patrol or document the edge of a site — property line, construction site, stockpile, field — for security sweeps or boundary records.',
  geometry: 'POLYGON', hasProfile: false,
  defaults: { alt: 30, inset: 0, pointSpacing: 0, pitch: -30, faceCenter: true },
  fields: [
    { key: 'alt', label: 'Altitude AGL', unit: 'm', type: 'number', step: 5, min: 1 },
    { key: 'inset', label: 'Inward inset', unit: 'm', type: 'number', step: 1, min: 0 },
    { key: 'pointSpacing', label: 'Point spacing (0=verts)', unit: 'm', type: 'number', step: 1, min: 0 },
    { key: 'pitch', label: 'Gimbal pitch', unit: '°', type: 'number', step: 5, min: -90, max: 0 },
    { key: 'faceCenter', label: 'Face toward centroid', type: 'toggle' }
  ],
  loop: function (c) {
    var ctr = centroid(c.vertices);
    var vs = c.inset > 0 ? c.vertices.map(function (v) { return destination(v.lat, v.lon, bearing(v.lat, v.lon, ctr.lat, ctr.lon), c.inset); }) : c.vertices;
    return { ctr: ctr, vs: vs };
  },
  buildWaypoints: function (c) {
    if (!c.vertices || c.vertices.length < 3) return [];
    var L = this.loop(c), vs = L.vs.concat([L.vs[0]]), out = [], ps = photoStep(c, c.pointSpacing || 0), total = 0;
    for (var s = 0; s < vs.length - 1; s++) {
      var seg = ps > 0 ? densify(vs[s], vs[s + 1], ps) : [vs[s], vs[s + 1]];
      for (var idx = 0; idx < seg.length; idx++) {
        if (s > 0 && idx === 0) continue;
        var p = seg[idx]; if (total++ > 4000) break;
        var hd = c.faceCenter ? bearing(p.lat, p.lon, L.ctr.lat, L.ctr.lon) : bearing(vs[s].lat, vs[s].lon, vs[s + 1].lat, vs[s + 1].lon);
        out.push(wpPhoto(p.lat, p.lon, c.ground + c.alt, c.speed, hd, c.pitch, c));
      }
    }
    return out;
  },
  drawMap: function (c, H) {
    if (!c.vertices || c.vertices.length < 3) return;
    var L = this.loop(c), pts = L.vs.concat([L.vs[0]]).map(function (p) { return [p.lat, p.lon]; });
    H.line(pts, { color: '#4eadea', weight: 2 });
    if (c.faceCenter) H.dot(L.ctr.lat, L.ctr.lon, '#8b9099', 3);
  },
  summary: function (c) { return (c.vertices ? c.vertices.length : 0) + '-pt boundary · ' + c.alt + ' m'; },
  center: function (c) { return c.vertices && c.vertices.length ? centroid(c.vertices) : null; },
  validate: function (c) { var e = []; if (!c.vertices || c.vertices.length < 3) e.push('Define a polygon — click ≥ 3 points on the map'); return { errs: e, warns: [] }; }
});

/* ── application state ─────────────────────────────────────────────────────*/
var state = {
  version: 1, activeMissionType: 'transect', outFmt: 'airhub',
  shared: {
    flight: { speed: 2.0, ground: 0 },
    camera: { lens: 'wide', trigger: 'waypoint', photoDistance: 10, frontOverlap: 80, sideOverlap: 70 },
    home: null
  },
  params: {},
  geometry: { vertices: [
    { lat: 58.92075, lon: 5.73560 }, { lat: 58.92075, lon: 5.73680 },
    { lat: 58.92015, lon: 5.73680 }, { lat: 58.92015, lon: 5.73560 }
  ] },
  lastWps: []
};
window.__AHW_state = state; // exposed for debugging/verification

function ensureDefaults(id) { if (!state.params[id]) state.params[id] = clone(MISSIONS[id].defaults); }
function activeMission() { return MISSIONS[state.activeMissionType]; }
function resolveContext(m) {
  ensureDefaults(m.id);
  var s = state.shared, ctx = {
    speed: s.flight.speed, ground: s.flight.ground,
    trigger: s.camera.trigger, photoDistance: s.camera.photoDistance, frontOverlap: s.camera.frontOverlap, sideOverlap: s.camera.sideOverlap,
    camera: s.camera,
    vertices: state.geometry.vertices
  };
  var p = state.params[m.id]; for (var k in p) ctx[k] = p[k];
  return ctx;
}
function centerOf(m, c) {
  if (m.center) return m.center(c);
  if (m.points && c[m.points[0].key]) return c[m.points[0].key];
  if (c.vertices && c.vertices.length) return centroid(c.vertices);
  return null;
}

/* ── leaflet map controller ────────────────────────────────────────────────*/
var mapCtrl = (function () {
  var map, editLayer, overlayLayer, mode = 'POINTS', lastFitSig = '';
  function dotIcon(color, sz) { sz = sz || 15; return L.divIcon({ className: '', html: '<div style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;background:' + color + ';border:2px solid #fff;box-shadow:0 0 0 3px rgba(78,173,234,0.3);cursor:grab"></div>', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] }); }
  function homeIcon() { return L.divIcon({ className: '', html: '<div style="width:20px;height:20px;border-radius:4px;background:#fb923c;border:2px solid #fff;box-shadow:0 0 0 3px rgba(251,146,60,0.3);display:flex;align-items:center;justify-content:center;cursor:grab;font-size:11px;line-height:1;color:#fff;font-weight:700">H</div>', iconSize: [20, 20], iconAnchor: [10, 10] }); }
  function cssColor(v) { if (v && v.indexOf('var(') === 0) { var name = v.slice(4, -1).trim(); return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#4eadea'; } return v; }
  function init() {
    map = L.map('map', { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    overlayLayer = L.layerGroup().addTo(map);
    editLayer = L.layerGroup().addTo(map);
    map.setView([DEMO.lat, DEMO.lon], 17);
    map.on('click', onClick);
  }
  function onClick(e) {
    var ll = { lat: +e.latlng.lat.toFixed(7), lon: +e.latlng.lng.toFixed(7) };
    var m = activeMission();
    if (m.geometry === 'POINTS') {
      var radio = document.querySelector('input[name="ptmode"]:checked');
      var key = radio ? radio.value : m.points[0].key;
      ensureDefaults(m.id); state.params[m.id][key] = ll;
    } else {
      state.geometry.vertices.push(ll);
    }
    saveHist(); render();
  }
  function buildHelpers() {
    var arr = [];
    return {
      _arr: arr,
      line: function (latlngs, opts) { var p = L.polyline(latlngs, opts).addTo(overlayLayer); latlngs.forEach(function (x) { arr.push(x); }); return p; },
      dot: function (lat, lon, color, rad) { L.circleMarker([lat, lon], { radius: rad || 3, color: color, fillColor: color, fillOpacity: 1, weight: 1 }).addTo(overlayLayer); arr.push([lat, lon]); },
      circle: function (lat, lon, radius, opts) { L.circle([lat, lon], Object.assign({ radius: radius, fillOpacity: 0.04 }, opts)).addTo(overlayLayer); arr.push([lat, lon]); }
    };
  }
  function renderEditHandles(m, ctx) {
    if (m.geometry === 'POINTS') {
      m.points.forEach(function (pt) {
        var c = ctx[pt.key]; if (!c) return; var col = cssColor(pt.color);
        var mk = L.marker([c.lat, c.lon], { icon: dotIcon(col), draggable: true, keyboard: false }).addTo(editLayer);
        mk.bindTooltip(pt.label.split(' ')[0], { permanent: true, direction: 'top', offset: [0, -8] });
        mk.on('dragend', function (ev) { var p = ev.target.getLatLng(); state.params[m.id][pt.key] = { lat: +p.lat.toFixed(7), lon: +p.lng.toFixed(7) }; saveHist(); render(); });
      });
    } else {
      var vs = state.geometry.vertices, latlngs = vs.map(function (v) { return [v.lat, v.lon]; });
      if (vs.length >= 2) {
        if (m.geometry === 'POLYGON') L.polygon(latlngs, { color: '#4eadea', weight: 1, opacity: 0.6, fillOpacity: 0.05, dashArray: '4 4' }).addTo(editLayer);
        else L.polyline(latlngs, { color: '#4eadea', weight: 1, opacity: 0.6, dashArray: '4 4' }).addTo(editLayer);
      }
      vs.forEach(function (v, i) {
        var mk = L.marker([v.lat, v.lon], { icon: dotIcon('#4eadea', 11), draggable: true, keyboard: false }).addTo(editLayer);
        mk.bindTooltip(String(i + 1), { permanent: false, direction: 'top' });
        mk.on('dragend', function (ev) { var p = ev.target.getLatLng(); state.geometry.vertices[i] = { lat: +p.lat.toFixed(7), lon: +p.lng.toFixed(7) }; saveHist(); render(); });
      });
    }
  }
  function draw(m, ctx, wps) {
    if (!map) return;
    overlayLayer.clearLayers(); editLayer.clearLayers();
    var H = buildHelpers();
    try { if (m.drawMap) m.drawMap(ctx, H); } catch (e) { console.error('drawMap', e); }
    // faint full route
    if (wps && wps.length > 1) L.polyline(wps.map(function (w) { return [w.location.lat, w.location.lon]; }), { color: '#1a7cba', weight: 1, opacity: 0.45 }).addTo(overlayLayer);
    renderEditHandles(m, ctx);
    // home / takeoff-landing marker
    var missionWps = (m.buildWaypoints ? (function () { try { return m.buildWaypoints(ctx) || []; } catch (e) { return []; } })() : []);
    if (state.shared.home === null && missionWps.length > 0) {
      state.shared.home = destination(missionWps[0].location.lat, missionWps[0].location.lon, 270, 20);
    }
    if (state.shared.home) {
      var h = state.shared.home;
      var hm = L.marker([h.lat, h.lon], { icon: homeIcon(), draggable: true, keyboard: false }).addTo(editLayer);
      hm.bindTooltip('Home', { permanent: true, direction: 'top', offset: [0, -10] });
      hm.on('dragend', function (ev) { var p = ev.target.getLatLng(); state.shared.home = { lat: +p.lat.toFixed(7), lon: +p.lng.toFixed(7) }; render(); });
    }
  }
  function invalidate() { if (map) setTimeout(function () { map.invalidateSize(); }, 60); }
  function resetFit() { lastFitSig = ''; }
  function getCenter() { return map ? map.getCenter() : { lat: DEMO.lat, lng: DEMO.lon }; }
  return { init: init, draw: draw, invalidate: invalidate, resetFit: resetFit, getCenter: getCenter };
})();

/* ── side profile (altitude AGL vs cumulative distance) ─────────────────────*/
function drawProfile(ctx, wps, m) {
  var svg = $('profile'); while (svg.firstChild) svg.removeChild(svg.firstChild);
  $('profileTitle').textContent = 'Side profile · AGL';
  if (!wps.length) { $('profileMeta').textContent = ''; return; }
  var rect = svg.getBoundingClientRect(), W = Math.max(200, Math.round(rect.width)), Hh = Math.max(110, Math.round(rect.height));
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Hh); svg.setAttribute('width', W); svg.setAttribute('height', Hh);
  var padL = 42, padR = 12, padT = 12, padB = 22, iW = W - padL - padR, iH = Hh - padT - padB;
  var ns = 'http://www.w3.org/2000/svg';
  var mk = function (t, a) { var el = document.createElementNS(ns, t); for (var k in a) el.setAttribute(k, a[k]); return el; };
  var agl = wps.map(function (w) { return w.location.alt - ctx.ground; });
  var cum = [0]; for (var i = 1; i < wps.length; i++) cum.push(cum[i - 1] + dist(wps[i - 1].location.lat, wps[i - 1].location.lon, wps[i].location.lat, wps[i].location.lon));
  var amin = Math.min.apply(null, agl), amax = Math.max.apply(null, agl), dmax = cum[cum.length - 1] || 1;
  var rng = Math.max(1, amax - amin);
  var xAt = function (d) { return padL + (d / dmax) * iW; }, yAt = function (a) { return padT + (1 - (a - amin) / rng) * iH; };
  svg.appendChild(mk('line', { x1: padL, y1: padT, x2: padL, y2: padT + iH, stroke: 'rgba(255,255,255,0.15)' }));
  svg.appendChild(mk('line', { x1: padL, y1: padT + iH, x2: padL + iW, y2: padT + iH, stroke: 'rgba(255,255,255,0.15)' }));
  [amin, (amin + amax) / 2, amax].forEach(function (v) {
    var y = yAt(v); var t = mk('text', { x: padL - 6, y: y + 3, 'text-anchor': 'end', 'font-size': 9, fill: '#a8c8d8', 'font-family': 'Inter' }); t.textContent = r1(v) + ' m'; svg.appendChild(t);
    svg.appendChild(mk('line', { x1: padL, y1: y, x2: padL + iW, y2: y, stroke: 'rgba(255,255,255,0.05)' }));
  });
  var peak = 0; for (var j = 0; j < agl.length; j++) if (agl[j] >= agl[peak]) peak = j;
  var dUp = '', dDn = '';
  wps.forEach(function (w, k) { var x = xAt(cum[k]), y = yAt(agl[k]); if (k <= peak) dUp += (dUp ? ' L ' : 'M ') + x + ' ' + y; if (k >= peak) dDn += (dDn ? ' L ' : 'M ') + x + ' ' + y; });
  svg.appendChild(mk('path', { d: dUp, stroke: '#4eadea', 'stroke-width': 2, fill: 'none' }));
  svg.appendChild(mk('path', { d: dDn, stroke: '#fb923c', 'stroke-width': 2, fill: 'none' }));
  wps.forEach(function (w, k) { svg.appendChild(mk('circle', { cx: xAt(cum[k]), cy: yAt(agl[k]), r: 2, fill: '#e8f4f8' })); });
  $('profileMeta').textContent = 'Ascent ● · Descent ●';
}
function showTopDownNote(m) {
  $('profileTitle').textContent = 'Pattern';
  $('profileMeta').textContent = '';
  var svg = $('profile'); while (svg.firstChild) svg.removeChild(svg.firstChild);
  var ns = 'http://www.w3.org/2000/svg', t = document.createElementNS(ns, 'text');
  t.setAttribute('x', '50%'); t.setAttribute('y', '50%'); t.setAttribute('text-anchor', 'middle'); t.setAttribute('fill', '#5a8a9f'); t.setAttribute('font-size', '12'); t.setAttribute('font-family', 'Inter');
  t.textContent = 'Top-down preview on map · flat-altitude pattern';
  svg.appendChild(t);
}

/* ── export (AirHub / KML / CSV) ───────────────────────────────────────────*/
function toAirHub(wps) { return JSON.stringify(wps, null, 2); }
function toKML(wps, ctx) {
  var site = 'AirHub Mission';
  var lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>', '  <name>' + site + '</name>', '  <description>Generated ' + nowISO() + '</description>', '  <Style id="wp"><IconStyle><scale>0.8</scale></IconStyle></Style>', '  <Style id="path"><LineStyle><color>ffba7c1a</color><width>2</width></LineStyle></Style>'];
  wps.forEach(function (wp, i) {
    var p = (wp.actions && wp.actions[0] && wp.actions[0].parameters && wp.actions[0].parameters.gimbalRotate) ? wp.actions[0].parameters.gimbalRotate.pitch : '';
    lines.push('  <Placemark><styleUrl>#wp</styleUrl>', '    <name>WP' + (i + 1) + ' ' + wp.waypointType + '</name>', '    <description>alt:' + wp.location.alt + 'm pitch:' + p + ' spd:' + wp.speed + '</description>', '    <Point><altitudeMode>relativeToGround</altitudeMode>', '      <coordinates>' + wp.location.lon + ',' + wp.location.lat + ',' + wp.location.alt + '</coordinates>', '    </Point></Placemark>');
  });
  lines.push('  <Placemark><styleUrl>#path</styleUrl><name>Flight path</name>', '    <LineString><altitudeMode>relativeToGround</altitudeMode>', '      <coordinates>' + wps.map(function (w) { return w.location.lon + ',' + w.location.lat + ',' + w.location.alt; }).join(' ') + '</coordinates>', '    </LineString></Placemark>', '</Document></kml>');
  return lines.join('\n');
}
function toCSV(wps) {
  var rows = ['index,type,latitude,longitude,altitude_m,pitch_deg,heading_deg,heading_mode,speed_mps,trigger'];
  wps.forEach(function (wp, i) {
    var pitch = (wp.actions || []).reduce(function (acc, a) { return (a.parameters && a.parameters.gimbalRotate) ? a.parameters.gimbalRotate.pitch : acc; }, '');
    var trig = (wp.actions || []).some(function (a) { return a.type === 'takePhoto'; }) ? 'photo' : 'none';
    // heading lives on the waypoint for most types; for transect it's only in the rotateYaw action
    var hdg = wp.heading != null ? wp.heading : (wp.actions || []).reduce(function (acc, a) { return (a.parameters && a.parameters.rotateYaw) ? a.parameters.rotateYaw.aircraftHeading : acc; }, '');
    rows.push([i + 1, wp.waypointType, wp.location.lat, wp.location.lon, wp.location.alt, pitch, hdg, wp.headingMode, wp.speed, trig].join(','));
  });
  return rows.join('\n');
}
function buildOutput(wps, ctx) {
  var all = wps;
  if (state.shared.home && wps.length > 0) {
    var h = state.shared.home;
    var homeWp = { location: loc(h.lat, h.lon, ctx.ground), waypointType: 'waypoint', headingMode: 'followWayline', speed: ctx.speed, actions: [] };
    all = [homeWp].concat(wps).concat([clone(homeWp)]);
  }
  if (state.outFmt === 'kml') return { content: toKML(all, ctx), ext: 'kml', mime: 'application/vnd.google-earth.kml+xml', name: 'mission.kml' };
  if (state.outFmt === 'csv') return { content: toCSV(all), ext: 'csv', mime: 'text/csv', name: 'mission.csv' };
  return { content: toAirHub(all), ext: 'json', mime: 'application/json', name: 'mission.json' };
}
function dlBlob(content, mime, filename) {
  var blob = new Blob([content], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* ── stats + validation ────────────────────────────────────────────────────*/
function fmtDist(m) { return m >= 1000 ? (r2(m / 1000) + '<span class="stat-unit">km</span>') : (m + '<span class="stat-unit">m</span>'); }
function fmtTime(s) { var m = Math.floor(s / 60), ss = s % 60; return (m > 0 ? m + '<span class="stat-unit">m</span>' : '') + ss + '<span class="stat-unit">s</span>'; }
function updateStats(wps, ctx) {
  var photos = wps.filter(function (w) { return w.actions && w.actions.some(function (a) { return a.type === 'takePhoto'; }); }).length;
  $('s-total').textContent = wps.length; $('s-photos').textContent = photos; $('s-segs').textContent = Math.max(0, wps.length - 1);
  if (!wps.length) { $('s-dist').innerHTML = '—'; $('s-time').innerHTML = '—'; $('s-maxalt').innerHTML = '—'; return; }
  var est = estimateMission(wps, ctx.speed);
  $('s-dist').innerHTML = fmtDist(est.dist); $('s-time').innerHTML = fmtTime(est.dur);
  var maxAgl = Math.max.apply(null, wps.map(function (w) { return w.location.alt - ctx.ground; }));
  $('s-maxalt').innerHTML = r1(maxAgl) + '<span class="stat-unit">m</span>';
}
function sharedValidate(ctx, wps) {
  var e = [], w = [];
  if (ctx.speed < 0.5) e.push('Speed too low (min 0.5 m/s)');
  if (wps.length > 2000) w.push(wps.length + ' waypoints — large mission, controllers may truncate');
  return { errs: e, warns: w };
}
function renderErrors(errs, warns) {
  var c = $('errList'); c.innerHTML = '';
  errs.forEach(function (msg) { var d = document.createElement('div'); d.className = 'err-item'; d.innerHTML = '<span class="dot"></span><span></span>'; d.lastChild.textContent = msg; c.appendChild(d); });
  warns.forEach(function (msg) { var d = document.createElement('div'); d.className = 'err-item warn'; d.innerHTML = '<span class="dot"></span><span></span>'; d.lastChild.textContent = msg; c.appendChild(d); });
}

/* ── dynamic panel rendering ───────────────────────────────────────────────*/
function renderSwitcher() {
  var host = $('missionSwitcher'); host.innerHTML = '';
  CATS.forEach(function (cat) {
    var wrap = document.createElement('div'); wrap.className = 'switch-cat';
    var lab = document.createElement('div'); lab.className = 'switch-cat-label'; lab.textContent = cat.name; wrap.appendChild(lab);
    var grid = document.createElement('div'); grid.className = 'switch-grid';
    cat.ids.forEach(function (id) {
      var m = MISSIONS[id], b = document.createElement('button');
      b.className = 'switch-btn' + (id === state.activeMissionType ? ' on' : '');
      b.innerHTML = '<i data-lucide="' + m.icon + '"></i><span>' + m.label + '</span>';
      b.onclick = function () { switchMission(id); };
      grid.appendChild(b);
    });
    wrap.appendChild(grid); host.appendChild(wrap);
  });
}
function renderPresets() {
  var bar = $('presetBar'); bar.innerHTML = '';
  var presets = PRESETS[state.activeMissionType];
  if (!presets) { bar.style.display = 'none'; return; }
  bar.style.display = '';
  var lab = document.createElement('span'); lab.className = 'preset-label'; lab.textContent = 'Presets'; bar.appendChild(lab);
  Object.keys(presets).forEach(function (name) {
    var b = document.createElement('button'); b.className = 'preset-btn'; b.textContent = name;
    b.onclick = function () { Object.assign(state.params[state.activeMissionType], clone(presets[name])); renderTypeParams(); saveHist(); render(); flash('✓ ' + name + ' preset loaded'); };
    bar.appendChild(b);
  });
}
function renderGeomControls() {
  var m = activeMission(), host = $('geomControls'), title = $('geomTitle');
  host.innerHTML = '';
  if (m.geometry === 'POINTS') {
    title.textContent = 'Coordinates';
    var hint = document.createElement('div'); hint.className = 'hint';
    var html = 'Click map to set: ';
    html += m.points.map(function (p, i) { return '<label><input type="radio" name="ptmode" value="' + p.key + '"' + (i === 0 ? ' checked' : '') + '>' + p.key + '</label>'; }).join(' · ');
    hint.innerHTML = html; host.appendChild(hint);
    // editable lat/lon for each point
    m.points.forEach(function (p) {
      ensureDefaults(m.id); var c = state.params[m.id][p.key];
      var g = document.createElement('div'); g.className = 'group'; g.style.gap = '6px';
      var gt = document.createElement('div'); gt.className = 'group-title';
      gt.innerHTML = '<span class="dot" style="background:' + p.color + '"></span>' + p.label; g.appendChild(gt);
      var grid = document.createElement('div'); grid.className = 'grid-2';
      grid.appendChild(fieldEl({ key: '__lat', label: 'Latitude', type: 'number', step: 'any' }, c.lat, function (v) { state.params[m.id][p.key].lat = num(v, c.lat); mapCtrl.resetFit(); }));
      grid.appendChild(fieldEl({ key: '__lon', label: 'Longitude', type: 'number', step: 'any' }, c.lon, function (v) { state.params[m.id][p.key].lon = num(v, c.lon); mapCtrl.resetFit(); }));
      g.appendChild(grid); host.appendChild(g);
    });
  } else {
    title.textContent = m.geometry === 'POLYGON' ? 'Area (polygon)' : 'Path (polyline)';
    var tb = document.createElement('div'); tb.className = 'geom-toolbar';
    var bRem = document.createElement('button'); bRem.className = 'btn-xs'; bRem.innerHTML = '<i data-lucide="corner-up-left"></i>Remove last';
    bRem.onclick = function () { if (state.geometry.vertices.length) { state.geometry.vertices.pop(); mapCtrl.resetFit(); saveHist(); render(); } };
    var bClr = document.createElement('button'); bClr.className = 'btn-xs danger'; bClr.innerHTML = '<i data-lucide="trash-2"></i>Clear';
    bClr.onclick = function () { state.geometry.vertices = []; mapCtrl.resetFit(); saveHist(); render(); };
    var cnt = document.createElement('span'); cnt.className = 'vtx-count'; cnt.textContent = state.geometry.vertices.length + ' pts';
    tb.appendChild(bRem); tb.appendChild(bClr); tb.appendChild(cnt); host.appendChild(tb);
    var hint = document.createElement('div'); hint.className = 'hint';
    hint.textContent = 'Click the map to add ' + (m.geometry === 'POLYGON' ? 'area corners' : 'path points') + '. Drag markers to adjust.';
    host.appendChild(hint);
  }
}
function fieldEl(f, value, onInput) {
  var wrap = document.createElement('div'); wrap.className = 'field';
  if (f.type === 'toggle') {
    wrap.className = 'toggle-row';
    var lab = document.createElement('span'); lab.className = 'toggle-label'; lab.textContent = f.label;
    var tg = document.createElement('div'); tg.className = 'toggle' + (value ? ' on' : '');
    tg.onclick = function () { onInput(!value); };
    wrap.appendChild(lab); wrap.appendChild(tg); return wrap;
  }
  var lab2 = document.createElement('label'); lab2.textContent = f.label + (f.unit ? ' (' + f.unit + ')' : ''); wrap.appendChild(lab2);
  if (f.type === 'seg') {
    var seg = document.createElement('div'); seg.className = 'seg';
    f.options.forEach(function (o) { var b = document.createElement('button'); b.className = 'seg-btn' + (value === o.v ? ' on' : ''); b.textContent = o.l; b.onclick = function () { onInput(o.v); }; seg.appendChild(b); });
    wrap.appendChild(seg); return wrap;
  }
  if (f.type === 'select') {
    var sel = document.createElement('select');
    f.options.forEach(function (o) { var op = document.createElement('option'); op.value = o.v; op.textContent = o.l; if (value === o.v) op.selected = true; sel.appendChild(op); });
    sel.onchange = function () { onInput(sel.value); }; wrap.appendChild(sel); return wrap;
  }
  var inp = document.createElement('input'); inp.type = 'number'; if (f.step != null) inp.step = f.step; if (f.min != null) inp.min = f.min; if (f.max != null) inp.max = f.max;
  inp.value = (value == null ? '' : value);
  inp.oninput = function () { onInput(inp.value === '' ? null : num(inp.value)); };
  wrap.appendChild(inp); return wrap;
}
function renderTypeParams() {
  var m = activeMission(); ensureDefaults(m.id); var p = state.params[m.id], host = $('typeParams'); host.innerHTML = '';
  if (m.desc) { var d = document.createElement('div'); d.className = 'mission-desc'; d.textContent = m.desc; host.appendChild(d); }
  var g = document.createElement('div'); g.className = 'group';
  var gt = document.createElement('div'); gt.className = 'group-title'; gt.textContent = m.label + ' parameters'; g.appendChild(gt);
  var grid = document.createElement('div'); grid.className = 'grid-2'; g.appendChild(grid);
  m.fields.forEach(function (f) {
    if (f.showIf && !f.showIf(p)) return;
    if (f.type === 'rings') { g.appendChild(renderRings(m, p)); return; }
    var full = (f.type === 'toggle' || f.type === 'seg' || f.type === 'select' || f.key === 'rings');
    var el = fieldEl(f, p[f.key], function (v) {
      p[f.key] = v;
      if (f.type === 'toggle' || f.type === 'seg') { renderTypeParams(); } // reveal/hide showIf fields
      schedule();
    });
    if (full) { g.appendChild(el); } else { grid.appendChild(el); }
  });
  host.appendChild(g);
  icons();
}
function renderRings(m, p) {
  var wrap = document.createElement('div');
  var gt = document.createElement('div'); gt.className = 'group-title'; gt.textContent = 'Altitude rings'; gt.style.marginTop = '4px'; wrap.appendChild(gt);
  p.rings.forEach(function (ring, i) {
    var col = RING_COLORS[i % RING_COLORS.length], card = document.createElement('div'); card.className = 'ring-card';
    var head = document.createElement('div'); head.className = 'ring-head';
    head.innerHTML = '<span class="ring-name"><span class="ring-dot" style="background:' + col + '"></span>Ring ' + (RING_LABELS[i] || i + 1) + '</span>';
    var acts = document.createElement('div'); acts.className = 'ring-acts';
    var dup = document.createElement('button'); dup.className = 'btn-xs'; dup.innerHTML = '<i data-lucide="copy-plus"></i>';
    dup.onclick = function () { p.rings.splice(i + 1, 0, { alt: ring.alt + 5, pitch: ring.pitch, radius: ring.radius }); renderTypeParams(); saveHist(); render(); };
    var del = document.createElement('button'); del.className = 'btn-xs danger'; del.innerHTML = '<i data-lucide="x"></i>'; del.disabled = p.rings.length <= 1;
    del.onclick = function () { if (p.rings.length > 1) { p.rings.splice(i, 1); renderTypeParams(); saveHist(); render(); } };
    acts.appendChild(dup); acts.appendChild(del); head.appendChild(acts); card.appendChild(head);
    var grid = document.createElement('div'); grid.className = 'ring-grid';
    grid.appendChild(fieldEl({ label: 'Alt', unit: 'm', type: 'number', step: 1, min: 1 }, ring.alt, function (v) { ring.alt = num(v); schedule(); }));
    grid.appendChild(fieldEl({ label: 'Pitch', unit: '°', type: 'number', step: 5, min: -90, max: 0 }, ring.pitch, function (v) { ring.pitch = num(v); schedule(); }));
    grid.appendChild(fieldEl({ label: 'Radius', unit: 'm', type: 'number', step: 0.5, min: 1 }, ring.radius, function (v) { ring.radius = (v == null ? null : num(v)); schedule(); }));
    card.appendChild(grid); wrap.appendChild(card);
  });
  var add = document.createElement('button'); add.className = 'btn-add'; add.innerHTML = '<i data-lucide="plus"></i>Add ring';
  add.onclick = function () { var last = p.rings.length ? p.rings[p.rings.length - 1].alt + 5 : 5; p.rings.push({ alt: last, pitch: -45, radius: null }); renderTypeParams(); saveHist(); render(); };
  wrap.appendChild(add); return wrap;
}

/* ── presets ───────────────────────────────────────────────────────────────*/
var PRESETS = {
  orbit: {
    Tower: { globalRadius: 8, wpPerRing: 12, startAngle: 0, orbitDir: 'CW', stagger: true, staggerAngle: 15, yawMode: 'towardPOI', nadir: true, nadirAlt: 20, rings: [{ alt: 5, pitch: -15, radius: null }, { alt: 12, pitch: -30, radius: null }, { alt: 20, pitch: -45, radius: null }, { alt: 30, pitch: -60, radius: null }] },
    'Flare stack': { globalRadius: 15, wpPerRing: 16, startAngle: 0, orbitDir: 'CW', stagger: true, staggerAngle: 22, yawMode: 'towardPOI', nadir: false, nadirAlt: 40, rings: [{ alt: 10, pitch: -20, radius: null }, { alt: 25, pitch: -35, radius: null }, { alt: 45, pitch: -50, radius: null }] },
    Building: { globalRadius: 25, wpPerRing: 20, startAngle: 0, orbitDir: 'CW', stagger: false, staggerAngle: 15, yawMode: 'towardPOI', nadir: true, nadirAlt: 60, rings: [{ alt: 8, pitch: -10, radius: null }, { alt: 20, pitch: -20, radius: null }, { alt: 35, pitch: -35, radius: null }, { alt: 50, pitch: -50, radius: null }] }
  },
  transect: {
    'Cliff face': { minAlt: 10, maxAlt: 80, upStep: 10, startSide: 'A', heading: null },
    Bridge: { minAlt: 5, maxAlt: 30, upStep: 5, startSide: 'A', heading: null }
  },
  spiral: { Chimney: { turns: 6, ptsPerTurn: 16, altStart: 5, altEnd: 60, radiusStart: 12, radiusEnd: 12, startAngle: 0, orbitDir: 'CW', pitchStart: -10, pitchEnd: -50 }, Cone: { turns: 4, ptsPerTurn: 14, altStart: 5, altEnd: 40, radiusStart: 18, radiusEnd: 6, startAngle: 0, orbitDir: 'CW', pitchStart: -15, pitchEnd: -65 } }
};

/* ── shared inputs <-> state ───────────────────────────────────────────────*/
var SHARED_INPUTS = [
  ['speed', 'flight', 'speed', 'num'], ['ground', 'flight', 'ground', 'num'],
  ['cameraLens', 'camera', 'lens', 'str'], ['photoDistance', 'camera', 'photoDistance', 'num'],
  ['frontOverlap', 'camera', 'frontOverlap', 'num'], ['sideOverlap', 'camera', 'sideOverlap', 'num']
];
function syncSharedInputs() {
  SHARED_INPUTS.forEach(function (s) { var v = state.shared[s[1]][s[2]]; $(s[0]).value = (v == null ? '' : v); });
  $('trigSeg').querySelectorAll('.seg-btn').forEach(function (b) { b.classList.toggle('on', b.dataset.trig === state.shared.camera.trigger); });
  $('distanceField').style.display = state.shared.camera.trigger === 'distance' ? '' : 'none';
  $('fmtTabs').querySelectorAll('.fmt-tab').forEach(function (b) { b.classList.toggle('on', b.dataset.fmt === state.outFmt); });
}

/* ── auto ground elevation ─────────────────────────────────────────────────*/
function autoFetchElevation(pt) {
  fetch('https://api.open-meteo.com/v1/elevation?latitude=' + pt.lat + '&longitude=' + pt.lon)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var elev = data.elevation && data.elevation[0];
      if (elev != null) {
        state.shared.flight.ground = Math.round(elev * 10) / 10;
        $('ground').value = state.shared.flight.ground;
        render();
      }
    })
    .catch(function () { /* silent — user can still type manually */ });
}

/* ── render loop ───────────────────────────────────────────────────────────*/
function render() {
  var m = activeMission(); $('crumbType').textContent = m.label;
  var ctx = resolveContext(m); var wps = [];
  try { wps = m.buildWaypoints(ctx) || []; } catch (e) { console.error('build', e); }
  wps = dedupeYaw(wps);
  state.lastWps = wps;
  mapCtrl.draw(m, ctx, wps);
  if (m.hasProfile) { $('profilePane').style.display = ''; drawProfile(ctx, wps, m); } else { showTopDownNote(m); }
  var tv = m.validate ? m.validate(ctx) : { errs: [], warns: [] }, sv = sharedValidate(ctx, wps);
  var errs = tv.errs.concat(sv.errs), warns = tv.warns.concat(sv.warns);
  renderErrors(errs, warns); updateStats(wps, ctx);
  var out = buildOutput(wps, ctx);
  $('outTitle').textContent = out.name;
  $('output').value = out.content.length > OUTPREVIEWMAX ? out.content.slice(0, OUTPREVIEWMAX) + '\n… (truncated — full file via Download / Preview)' : out.content;
  $('summary').textContent = wps.length ? (wps.length + ' wp · ' + (m.summary ? m.summary(ctx, wps) : '')) : 'no waypoints';
  $('btnDownload').disabled = errs.length > 0 || wps.length === 0;
  var elevPt = centerOf(m, ctx);
  if (elevPt) {
    var moved = !lastElevPt || dist(lastElevPt.lat, lastElevPt.lon, elevPt.lat, elevPt.lon) > 50;
    if (moved) {
      lastElevPt = elevPt;
      clearTimeout(elevTimer);
      elevTimer = setTimeout(function () { autoFetchElevation(elevPt); }, 1200);
    }
  }
  icons();
}
var histTimer, elevTimer, lastElevPt = null;
function schedule() { render(); clearTimeout(histTimer); histTimer = setTimeout(saveHist, 600); }
function icons() { if (window.lucide) try { lucide.createIcons(); } catch (e) {} }

function switchMission(id) {
  if (id === state.activeMissionType) return;
  state.activeMissionType = id; ensureDefaults(id); mapCtrl.resetFit();
  renderSwitcher(); renderPresets(); renderGeomControls(); renderTypeParams(); saveHist(); render();
}

/* ── history (undo/redo over whole state) ──────────────────────────────────*/
var hist = [], hi = -1;
function snapshot() { return JSON.stringify({ activeMissionType: state.activeMissionType, outFmt: state.outFmt, shared: state.shared, params: state.params, geometry: state.geometry }); }
function saveHist() { var s = snapshot(); if (hist[hi] === s) return; hist = hist.slice(0, hi + 1); hist.push(s); hi = hist.length - 1; refreshUR(); }
function applySnap(s) {
  var p = JSON.parse(s);
  state.activeMissionType = p.activeMissionType; state.outFmt = p.outFmt;
  state.shared = p.shared; state.params = p.params; state.geometry = p.geometry;
  mapCtrl.resetFit();
  renderSwitcher(); renderPresets(); renderGeomControls(); renderTypeParams(); syncSharedInputs(); render();
}
function undo() { if (hi > 0) { hi--; applySnap(hist[hi]); refreshUR(); } }
function redo() { if (hi < hist.length - 1) { hi++; applySnap(hist[hi]); refreshUR(); } }
function refreshUR() { $('btnUndo').disabled = hi <= 0; $('btnRedo').disabled = hi >= hist.length - 1; }

/* ── settings import/export ────────────────────────────────────────────────*/
function exportSettings() {
  var s = JSON.parse(snapshot()); s.version = state.version; s.exportedAt = nowISO();
  dlBlob(JSON.stringify(s, null, 2), 'application/json', 'airhub_waypoints_' + nowISO().slice(0, 10) + '.json');
  flash('✓ Settings exported');
}
function importSettings(file) {
  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      var s = JSON.parse(e.target.result);
      if (Array.isArray(s.rings) && !s.activeMissionType) { // migrate legacy orbit v2 file
        ensureDefaults('orbit'); var o = state.params.orbit; o.rings = s.rings; if (s.f) { o.globalRadius = num(s.f.radius, o.globalRadius); o.wpPerRing = num(s.f.wpPerRing, o.wpPerRing); o.center = { lat: num(s.f.lat, DEMO.lat), lon: num(s.f.lon, DEMO.lon) }; }
        s = JSON.parse(snapshot()); s.activeMissionType = 'orbit';
      }
      if (!s.activeMissionType || !s.params) throw new Error('Unrecognised settings file');
      applySnap(JSON.stringify(s)); saveHist(); flash('✓ Settings imported');
    } catch (err) { flash('✕ ' + (err.message || 'Invalid settings file'), true); }
  };
  reader.readAsText(file);
}

/* ── modal + flash ─────────────────────────────────────────────────────────*/
function previewOutput() {
  var m = activeMission(), ctx = resolveContext(m), out = buildOutput(state.lastWps, ctx);
  $('modalTitle').textContent = 'Output preview — ' + out.ext.toUpperCase();
  $('modalBody').textContent = out.content.length > 60000 ? out.content.slice(0, 60000) + '\n… (truncated)' : out.content;
  $('modalBg').classList.add('open');
}
var flashTimer;
function flash(msg, isErr) { var f = $('flash'); f.textContent = msg; f.className = 'flash show' + (isErr ? ' err' : ''); clearTimeout(flashTimer); flashTimer = setTimeout(function () { f.className = 'flash' + (isErr ? ' err' : ''); }, 2400); }

/* ── collapsible sections ──────────────────────────────────────────────────*/
function initCollapsibles() {
  document.querySelectorAll('.section-label[data-sec]').forEach(function (lab) {
    var body = $('sec-' + lab.dataset.sec);
    if (body) body.style.maxHeight = body.scrollHeight + 'px';
    lab.addEventListener('click', function () {
      var closed = lab.classList.toggle('closed');
      body.classList.toggle('closed', closed);
      body.style.maxHeight = closed ? '0' : body.scrollHeight + 'px';
    });
  });
}

/* ── boot ──────────────────────────────────────────────────────────────────*/
function bindShared() {
  SHARED_INPUTS.forEach(function (s) {
    var el = $(s[0]);
    el.addEventListener('input', function () { state.shared[s[1]][s[2]] = s[3] === 'num' ? num(el.value) : el.value; schedule(); });
    el.addEventListener('change', function () { state.shared[s[1]][s[2]] = s[3] === 'num' ? num(el.value) : el.value; schedule(); });
  });
  $('trigSeg').querySelectorAll('.seg-btn').forEach(function (b) {
    b.addEventListener('click', function () { state.shared.camera.trigger = b.dataset.trig; syncSharedInputs(); schedule(); });
  });
  $('fmtTabs').querySelectorAll('.fmt-tab').forEach(function (b) {
    b.addEventListener('click', function () { state.outFmt = b.dataset.fmt; syncSharedInputs(); render(); });
  });
}
function init() {
  ensureDefaults(state.activeMissionType);
  mapCtrl.init();
  renderSwitcher(); renderPresets(); renderGeomControls(); renderTypeParams();
  syncSharedInputs(); bindShared(); initCollapsibles();
  $('btnUndo').onclick = undo; $('btnRedo').onclick = redo;
  $('btnExport').onclick = exportSettings;
  $('importFile').addEventListener('change', function () { if (this.files[0]) importSettings(this.files[0]); this.value = ''; });
  $('btnDownload').onclick = function () { var m = activeMission(), ctx = resolveContext(m), out = buildOutput(state.lastWps, ctx); dlBlob(out.content, out.mime, 'airhub_' + m.id + '_' + nowISO().slice(0, 10) + '.' + out.ext); flash('✓ ' + out.ext.toUpperCase() + ' downloaded'); };
  $('btnElevation').onclick = function () {
    var m = activeMission(), ctx = resolveContext(m);
    var pt = centerOf(m, ctx);
    if (!pt) { var mc = mapCtrl.getCenter(); pt = { lat: mc.lat, lon: mc.lng }; }
    lastElevPt = null; // force re-fetch even if center hasn't moved
    autoFetchElevation(pt);
  };
  $('btnPreview').onclick = previewOutput;
  $('modalClose').onclick = function () { $('modalBg').classList.remove('open'); };
  $('modalBg').addEventListener('click', function (e) { if (e.target === $('modalBg')) $('modalBg').classList.remove('open'); });
  $('modalCopy').onclick = function () { navigator.clipboard.writeText($('modalBody').textContent).then(function () { flash('✓ Copied'); }); };
  $('modalDownload').onclick = function () { $('btnDownload').click(); $('modalBg').classList.remove('open'); };
  saveHist(); render(); mapCtrl.invalidate(); icons();
  window.addEventListener('resize', function () { clearTimeout(window.__rz); window.__rz = setTimeout(render, 180); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

})();
