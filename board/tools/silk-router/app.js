// Silk Router 30° — a 30°-snapping trace tool for silkscreen art.
// All geometry is in KiCad board millimetres (x right, y down), so exports
// land at the same coordinates as the loaded .kicad_pcb.
'use strict';
(() => {

// ---------------------------------------------------------------- geometry
const DEG = Math.PI / 180;
const DIRS = [...Array(12)].map((_, k) => ({ x: Math.cos(k * Math.PI / 6), y: Math.sin(k * Math.PI / 6) }));
// Triangular lattice steps (basis e1 = 0°, e2 = 60°) for each of the 12 directions.
// Even k land on nearest neighbours (length 1), odd k on second neighbours (length √3).
const LAT = [[1, 0], [1, 1], [0, 1], [-1, 2], [-1, 1], [-2, 1], [-1, 0], [-1, -1], [0, -1], [1, -2], [1, -1], [2, -1]];
const LATLEN = LAT.map((_, k) => (k % 2 ? Math.sqrt(3) : 1));

const P = (x, y) => ({ x, y });
const add = (a, b) => P(a.x + b.x, a.y + b.y);
const sub = (a, b) => P(a.x - b.x, a.y - b.y);
const mul = (a, s) => P(a.x * s, a.y * s);
const len = (a) => Math.hypot(a.x, a.y);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function ptSegDist(p, a, b) {
	const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
	let t = L ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L : 0;
	t = t < 0 ? 0 : t > 1 ? 1 : t;
	return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function projT(p, a, b) {
	const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
	if (!L) return 0;
	const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L;
	return t < 0 ? 0 : t > 1 ? 1 : t;
}
const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
function segsCross(a, b, c, d) {
	const d1 = orient(c, d, a), d2 = orient(c, d, b), d3 = orient(a, b, c), d4 = orient(a, b, d);
	return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
function segSegDist(a, b, c, d) {
	if (segsCross(a, b, c, d)) return 0;
	return Math.min(ptSegDist(a, c, d), ptSegDist(b, c, d), ptSegDist(c, a, b), ptSegDist(d, a, b));
}
function pointInPoly(p, pts) {
	let ins = false;
	for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
		const a = pts[i], b = pts[j];
		if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) ins = !ins;
	}
	return ins;
}
function dirK(a, b) {
	const k = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 6));
	return ((k % 12) + 12) % 12;
}
function kDiff(a, b) { const d = Math.abs(a - b) % 12; return Math.min(d, 12 - d); }
function isOnDir(a, b) {
	const L = dist(a, b); if (L < 1e-9) return true;
	const d = DIRS[dirK(a, b)];
	return Math.abs((b.x - a.x) * d.y - (b.y - a.y) * d.x) < 1e-6 * Math.max(1, L);
}
// KiCad rotation: positive angle is counter-clockwise on screen (y down).
function rotPt(p, deg) {
	if (!deg) return p;
	const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
	return P(p.x * c + p.y * s, -p.x * s + p.y * c);
}
function circleFrom3(a, b, c) {
	const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
	if (Math.abs(d) < 1e-12) return null;
	const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
	const ux = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
	const uy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
	return { c: P(ux, uy), r: Math.hypot(a.x - ux, a.y - uy) };
}
function arcPts(s, m, e) {
	const C = circleFrom3(s, m, e);
	if (!C) return [s, e];
	const TAU = Math.PI * 2, norm = (x) => ((x % TAU) + TAU) % TAU;
	const a0 = Math.atan2(s.y - C.c.y, s.x - C.c.x);
	const a1 = Math.atan2(m.y - C.c.y, m.x - C.c.x);
	const a2 = Math.atan2(e.y - C.c.y, e.x - C.c.x);
	const sw = norm(a2 - a0), mw = norm(a1 - a0);
	const sweep = mw < sw ? sw : sw - TAU;
	const n = Math.max(4, Math.min(128, Math.ceil(Math.abs(sweep) * C.r / 0.15)));
	const out = [s];
	for (let i = 1; i < n; i++) {
		const a = a0 + sweep * i / n;
		out.push(P(C.c.x + C.r * Math.cos(a), C.c.y + C.r * Math.sin(a)));
	}
	out.push(e);
	return out;
}
function circlePts(c, r, n) {
	n = n || Math.max(16, Math.min(96, Math.ceil(r * 12)));
	const out = [];
	for (let i = 0; i < n; i++) out.push(P(c.x + r * Math.cos(i / n * Math.PI * 2), c.y + r * Math.sin(i / n * Math.PI * 2)));
	return out;
}
function bezierPts(pts) {
	if (pts.length !== 4) return pts;
	const [p0, p1, p2, p3] = pts, out = [];
	for (let i = 0; i <= 24; i++) {
		const t = i / 24, u = 1 - t;
		out.push(P(u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
			u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y));
	}
	return out;
}
function rectPts(w, h, r) {
	const x = w / 2, y = h / 2;
	if (!(r > 1e-6)) return [P(-x, -y), P(x, -y), P(x, y), P(-x, y)];
	r = Math.min(r, x, y);
	const out = [], corners = [[x - r, -y + r, -90], [x - r, y - r, 0], [-x + r, y - r, 90], [-x + r, -y + r, 180]];
	for (const [cx, cy, a0] of corners)
		for (let i = 0; i <= 4; i++) {
			const a = (a0 + i * 22.5) * DEG;
			out.push(P(cx + r * Math.cos(a), cy + r * Math.sin(a)));
		}
	return out;
}
// Parametric pieces of segment a→b that lie outside every disc.
function subtractDiscs(a, b, discs) {
	let iv = [[0, 1]];
	const d = sub(b, a), A = d.x * d.x + d.y * d.y;
	for (const disc of discs) {
		const f = sub(a, disc.c), C = f.x * f.x + f.y * f.y - disc.R * disc.R;
		let t0, t1;
		if (A < 1e-18) { if (C < 0) return []; continue; }
		const B = 2 * (f.x * d.x + f.y * d.y), D = B * B - 4 * A * C;
		if (D <= 0) continue;
		const sq = Math.sqrt(D);
		t0 = (-B - sq) / (2 * A); t1 = (-B + sq) / (2 * A);
		const next = [];
		for (const [u, v] of iv) {
			if (t1 <= u || t0 >= v) { next.push([u, v]); continue; }
			if (t0 > u) next.push([u, t0]);
			if (t1 < v) next.push([t1, v]);
		}
		iv = next;
	}
	return iv.filter(([u, v]) => v - u > 1e-9).map(([u, v]) => [add(a, mul(d, u)), add(a, mul(d, v))]);
}

// Split vector v into non-negative amounts along the two adjacent 30° directions around it.
function decompose(v) {
	let t = Math.atan2(v.y, v.x) / (Math.PI / 6);
	if (t < 0) t += 12;
	let k = Math.floor(t + 1e-9) % 12;
	const d1 = DIRS[k], d2 = DIRS[(k + 1) % 12];
	const det = d1.x * d2.y - d1.y * d2.x;
	let a = (v.x * d2.y - v.y * d2.x) / det, b = (d1.x * v.y - d1.y * v.x) / det;
	if (a < 0) a = 0; if (b < 0) b = 0;
	return { k, a, b };
}
// The two ways to reach q from p with one bend, both legs on 30° multiples. Preferred first.
function postureOptions(p, q, prevK, flip) {
	const v = sub(q, p), L = len(v);
	if (L < 1e-9) return [[p]];
	const { k, a, b } = decompose(v), k2 = (k + 1) % 12;
	const tol = 1e-5;
	if (a < tol || b < tol) return [[p, q]];
	const A = [p, add(p, mul(DIRS[k], a)), q];
	const Bp = [p, add(p, mul(DIRS[k2], b)), q];
	let first;
	if (prevK != null && kDiff(prevK, k) !== kDiff(prevK, k2)) first = kDiff(prevK, k) < kDiff(prevK, k2) ? A : Bp;
	else first = a >= b ? A : Bp;
	const other = first === A ? Bp : A;
	return flip ? [other, first] : [first, other];
}
function simplify(pts) {
	const out = [];
	for (const p of pts) {
		if (out.length && dist(out[out.length - 1], p) < 1e-7) continue;
		if (out.length >= 2) {
			const a = out[out.length - 2], b = out[out.length - 1];
			if (dirK(a, b) === dirK(b, p) && isOnDir(a, p) && Math.abs(orient(a, b, p)) < 1e-7) { out[out.length - 1] = p; continue; }
		}
		out.push(p);
	}
	return out;
}

// ---------------------------------------------------------------- S-expressions
function parseSexpr(text) {
	let i = 0, cur = null, root = null;
	const n = text.length, stack = [];
	while (i < n) {
		const c = text.charCodeAt(i);
		if (c === 40) { const l = []; if (cur) cur.push(l); else root = l; stack.push(cur); cur = l; i++; }
		else if (c === 41) { cur = stack.pop(); i++; if (!cur) break; }
		else if (c <= 32) i++;
		else if (c === 34) {
			let j = i + 1, s = '';
			while (j < n) {
				const ch = text[j];
				if (ch === '\\') { s += text[j + 1]; j += 2; continue; }
				if (ch === '"') break;
				s += ch; j++;
			}
			if (cur) cur.push(s);
			i = j + 1;
		} else {
			let j = i;
			while (j < n) { const ch = text.charCodeAt(j); if (ch <= 32 || ch === 40 || ch === 41) break; j++; }
			if (cur) cur.push(text.slice(i, j));
			i = j;
		}
	}
	return root;
}
function find(l, name) { if (!l) return null; for (let k = 1; k < l.length; k++) { const x = l[k]; if (Array.isArray(x) && x[0] === name) return x; } return null; }
function findAll(l, name) { const out = []; if (l) for (let k = 1; k < l.length; k++) { const x = l[k]; if (Array.isArray(x) && x[0] === name) out.push(x); } return out; }
const num = (l, i = 1) => (l && l[i] !== undefined ? parseFloat(l[i]) : NaN);
const xy = (l) => P(parseFloat(l[1]), parseFloat(l[2]));
const layerOf = (it) => { const l = find(it, 'layer'); return l ? l[1] : null; };
function ptsOf(ptsList) {
	const out = [];
	if (!ptsList) return out;
	for (let k = 1; k < ptsList.length; k++) {
		const x = ptsList[k];
		if (x[0] === 'xy') out.push(xy(x));
		else if (x[0] === 'arc') { const a = arcPts(xy(find(x, 'start')), xy(find(x, 'mid')), xy(find(x, 'end'))); if (out.length) a.shift(); out.push(...a); }
	}
	return out;
}
function strokeWidth(it) {
	const st = find(it, 'stroke');
	const w = st ? num(find(st, 'width')) : num(find(it, 'width'));
	return isFinite(w) ? w : 0;
}
function isFilled(it) { const f = find(it, 'fill'); return !!f && (f[1] === 'yes' || f[1] === 'solid'); }

// ---------------------------------------------------------------- board import
function parseBoard(text) {
	const root = parseSexpr(text);
	if (!root || root[0] !== 'kicad_pcb') throw new Error('Not a KiCad board (.kicad_pcb) file');
	const side = () => ({ strokes: [], fills: [] });
	const B = {
		edgeOpen: [], edgeClosed: [], loops: [], edgeSegs: [],
		silk: { F: side(), B: side() },
		cu: { F: { tracks: [], fills: [] }, B: { tracks: [], fills: [] } },
		pads: { F: [], B: [] }, holes: [],
		cpads: { F: [], B: [] }, // copper pads under solder mask (no opening), e.g. capacitive touch pads
		crt: { F: [], B: [] }, // footprint courtyards as closed polygons: { pts, ref }
	};
	const ident = (p) => p;
	const cuSide = (L) => (L === 'F.Cu' ? 'F' : L === 'B.Cu' ? 'B' : null);
	for (let k = 1; k < root.length; k++) {
		const it = root[k];
		if (!Array.isArray(it)) continue;
		switch (it[0]) {
			case 'gr_line': case 'gr_arc': case 'gr_circle': case 'gr_rect': case 'gr_poly': case 'gr_curve':
				addGraphic(B, it, ident); break;
			case 'segment': case 'arc': {
				const s = cuSide(layerOf(it)); if (!s) break;
				const pts = it[0] === 'arc' ? arcPts(xy(find(it, 'start')), xy(find(it, 'mid')), xy(find(it, 'end'))) : [xy(find(it, 'start')), xy(find(it, 'end'))];
				B.cu[s].tracks.push({ pts, w: num(find(it, 'width')) || 0.2 });
				break;
			}
			case 'via': {
				const c = xy(find(it, 'at'));
				for (const s of ['F', 'B']) B.cu[s].fills.push({ t: 'circ', c, r: num(find(it, 'size')) / 2 });
				B.holes.push({ t: 'circ', c, r: num(find(it, 'drill')) / 2 });
				break;
			}
			case 'zone':
				for (const fp of findAll(it, 'filled_polygon')) {
					const s = cuSide(layerOf(fp)); if (!s) continue;
					B.cu[s].fills.push({ t: 'poly', pts: ptsOf(find(fp, 'pts')) });
				}
				break;
			case 'footprint': addFootprint(B, it); break;
		}
	}
	B.loops = chainLoops(B.edgeOpen).concat(B.edgeClosed);
	for (const loop of B.loops) for (let i = 0; i < loop.length; i++) {
		const a = loop[i], b = loop[(i + 1) % loop.length];
		if (dist(a, b) > 1e-9) B.edgeSegs.push([a, b]);
	}
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
	for (const [a] of B.edgeSegs) { x0 = Math.min(x0, a.x); y0 = Math.min(y0, a.y); x1 = Math.max(x1, a.x); y1 = Math.max(y1, a.y); }
	if (!B.edgeSegs.length) { x0 = y0 = 0; x1 = y1 = 100; }
	B.bbox = { x0, y0, x1, y1 };
	B.center = P(+((x0 + x1) / 2).toFixed(4), +((y0 + y1) / 2).toFixed(4));
	return B;
}
function addGraphic(B, it, T, crt) {
	const L = layerOf(it);
	const isEdge = L === 'Edge.Cuts';
	const silkSide = L === 'F.SilkS' ? 'F' : L === 'B.SilkS' ? 'B' : null;
	const crtSide = crt && (L === 'F.CrtYd' ? 'F' : L === 'B.CrtYd' ? 'B' : null);
	if (!isEdge && !silkSide && !crtSide) return;
	const typ = it[0].slice(3);
	let pts, closed = false;
	switch (typ) {
		case 'line': pts = [xy(find(it, 'start')), xy(find(it, 'end'))]; break;
		case 'arc': pts = arcPts(xy(find(it, 'start')), xy(find(it, 'mid')), xy(find(it, 'end'))); break;
		case 'circle': { const c = xy(find(it, 'center')); pts = circlePts(c, dist(c, xy(find(it, 'end')))); closed = true; break; }
		case 'rect': { const s = xy(find(it, 'start')), e = xy(find(it, 'end')); pts = [s, P(e.x, s.y), e, P(s.x, e.y)]; closed = true; break; }
		case 'poly': pts = ptsOf(find(it, 'pts')); closed = true; break;
		case 'curve': pts = bezierPts(ptsOf(find(it, 'pts'))); break;
		default: return;
	}
	pts = pts.map(T);
	if (crtSide) crt[crtSide][closed ? 'closed' : 'open'].push(pts);
	else if (isEdge) (closed ? B.edgeClosed : B.edgeOpen).push(pts);
	else {
		const S = B.silk[silkSide], w = strokeWidth(it);
		if (w > 0) S.strokes.push({ pts, w, closed });
		if (closed && isFilled(it)) S.fills.push(pts);
	}
}
function addFootprint(B, fp) {
	const at = find(fp, 'at');
	const pos = xy(at), rot = at[3] ? +at[3] : 0;
	const T = (p) => add(pos, rotPt(p, rot));
	const refProp = findAll(fp, 'property').find((x) => x[1] === 'Reference');
	const refText = findAll(fp, 'fp_text').find((x) => x[1] === 'reference');
	const ref = refProp ? refProp[2] : refText ? refText[2] : '';
	const crt = { F: { open: [], closed: [] }, B: { open: [], closed: [] } };
	for (let k = 1; k < fp.length; k++) {
		const c = fp[k];
		if (!Array.isArray(c)) continue;
		if (c[0].startsWith('fp_') && c[0] !== 'fp_text') addGraphic(B, c, T, crt);
		else if (c[0] === 'pad') addPad(B, c, T);
	}
	// Courtyards are usually drawn as separate lines/arcs: chain them into closed outlines.
	for (const s of ['F', 'B'])
		for (const loop of chainLoops(crt[s].open).concat(crt[s].closed)) if (loop.length >= 3) B.crt[s].push({ pts: loop, ref });
}
function capsule(PT, w, h) {
	return w >= h ? { t: 'cap', a: PT(P(-(w - h) / 2, 0)), b: PT(P((w - h) / 2, 0)), r: h / 2 }
		: { t: 'cap', a: PT(P(0, -(h - w) / 2)), b: PT(P(0, (h - w) / 2)), r: w / 2 };
}
function addPad(B, pad, T) {
	const kind = pad[2], shape = pad[3];
	const at = find(pad, 'at');
	const c = T(xy(at));
	const ang = at[3] ? +at[3] : 0; // pad angle in the file already includes the footprint rotation
	const sz = find(pad, 'size');
	const w = num(sz, 1), h = num(sz, 2);
	const layers = (find(pad, 'layers') || []).slice(1);
	const PT = (p) => add(c, rotPt(p, ang));
	const shapes = [];
	const polyOf = (pts) => ({ t: 'poly', pts: pts.map(PT) });
	switch (shape) {
		case 'circle': shapes.push({ t: 'circ', c, r: w / 2 }); break;
		case 'oval': shapes.push(capsule(PT, w, h)); break;
		case 'roundrect': case 'chamfered_rect': {
			const rr = num(find(pad, 'roundrect_rratio')) || 0;
			shapes.push(polyOf(rectPts(w, h, rr * Math.min(w, h)))); break;
		}
		case 'custom': {
			const anc = find(find(pad, 'options'), 'anchor');
			if (anc && anc[1] === 'rect') shapes.push(polyOf(rectPts(w, h, 0)));
			else shapes.push({ t: 'circ', c, r: Math.min(w, h) / 2 });
			const prim = find(pad, 'primitives');
			if (prim) for (let k = 1; k < prim.length; k++) {
				const g = prim[k], pw = strokeWidth(g);
				switch (g[0]) {
					case 'gr_poly': shapes.push(polyOf(ptsOf(find(g, 'pts')))); break;
					case 'gr_circle': { const cc = xy(find(g, 'center')); shapes.push({ t: 'circ', c: PT(cc), r: dist(cc, xy(find(g, 'end'))) + pw / 2 }); break; }
					case 'gr_rect': { const s = xy(find(g, 'start')), e = xy(find(g, 'end')); shapes.push(polyOf([s, P(e.x, s.y), e, P(s.x, e.y)])); break; }
					case 'gr_line': shapes.push({ t: 'cap', a: PT(xy(find(g, 'start'))), b: PT(xy(find(g, 'end'))), r: pw / 2 }); break;
					case 'gr_arc': {
						const ap = arcPts(xy(find(g, 'start')), xy(find(g, 'mid')), xy(find(g, 'end'))).map(PT);
						for (let i = 1; i < ap.length; i++) shapes.push({ t: 'cap', a: ap[i - 1], b: ap[i], r: pw / 2 });
						break;
					}
				}
			}
			break;
		}
		default: shapes.push(polyOf(rectPts(w, h, 0)));
	}
	for (const s of ['F', 'B']) {
		if (layers.includes(s + '.Mask') || layers.includes('*.Mask') || layers.includes('F&B.Mask')) B.pads[s].push(...shapes);
		else if (layers.includes(s + '.Cu') || layers.includes('*.Cu') || layers.includes('F&B.Cu')) B.cpads[s].push(...shapes);
	}
	if (kind === 'thru_hole' || kind === 'np_thru_hole') {
		const dr = find(pad, 'drill');
		if (dr) {
			const ofs = find(dr, 'offset'), o = ofs ? xy(ofs) : P(0, 0);
			if (dr[1] === 'oval') {
				const dw = num(dr, 2), dh = isFinite(num(dr, 3)) ? num(dr, 3) : dw;
				B.holes.push(capsule((p) => PT(add(p, o)), dw, dh));
			} else B.holes.push({ t: 'circ', c: PT(o), r: num(dr, 1) / 2 });
		}
	}
}
function chainLoops(open) {
	const key = (p) => Math.round(p.x * 500) + ',' + Math.round(p.y * 500);
	const items = open.map((pts) => ({ pts, used: false }));
	const ends = new Map();
	const addEnd = (k, i) => { if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i); };
	items.forEach((it, i) => { addEnd(key(it.pts[0]), i); addEnd(key(it.pts[it.pts.length - 1]), i); });
	const loops = [];
	for (let i = 0; i < items.length; i++) {
		if (items[i].used) continue;
		items[i].used = true;
		const loop = items[i].pts.slice(), startK = key(loop[0]);
		for (let guard = 0; guard < items.length; guard++) {
			const endK = key(loop[loop.length - 1]);
			if (endK === startK && loop.length > 2) break;
			const j = (ends.get(endK) || []).find((j) => !items[j].used);
			if (j === undefined) break;
			items[j].used = true;
			let p = items[j].pts;
			if (key(p[0]) !== endK) p = p.slice().reverse();
			loop.push(...p.slice(1));
		}
		if (key(loop[loop.length - 1]) === startK) loop.pop();
		loops.push(loop);
	}
	return loops;
}

// ---------------------------------------------------------------- obstacles
// kinds: 0 edge, 1 hole, 2 exposed pad, 3 existing silk, 4 art, 5 footprint courtyard
const K_EDGE = 0, K_HOLE = 1, K_PAD = 2, K_SILK = 3, K_ART = 4, K_CRT = 5;
let qStamp = 0;
class SpatialHash {
	constructor(cell) { this.cell = cell; this.m = new Map(); this.n = 0; }
	insert(o) {
		const c = this.cell;
		for (let i = Math.floor(o.x0 / c), i1 = Math.floor(o.x1 / c); i <= i1; i++)
			for (let j = Math.floor(o.y0 / c), j1 = Math.floor(o.y1 / c); j <= j1; j++) {
				const k = i * 65536 + j;
				let a = this.m.get(k);
				if (!a) this.m.set(k, (a = []));
				a.push(o);
			}
		this.n++;
	}
	query(x0, y0, x1, y1, fn) {
		const c = this.cell, st = ++qStamp;
		for (let i = Math.floor(x0 / c), i1 = Math.floor(x1 / c); i <= i1; i++)
			for (let j = Math.floor(y0 / c), j1 = Math.floor(y1 / c); j <= j1; j++) {
				const a = this.m.get(i * 65536 + j);
				if (!a) continue;
				for (const o of a) { if (o._q === st) continue; o._q = st; if (fn(o)) return true; }
			}
		return false;
	}
}
function obSeg(a, b, r, k, src) { return { t: 0, a, b, r, k, src, x0: Math.min(a.x, b.x) - r, y0: Math.min(a.y, b.y) - r, x1: Math.max(a.x, b.x) + r, y1: Math.max(a.y, b.y) + r }; }
function obCirc(c, r, k, src) { return { t: 1, c, r, k, src, x0: c.x - r, y0: c.y - r, x1: c.x + r, y1: c.y + r }; }
function obPoly(pts, k, src) {
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
	for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
	return { t: 2, pts, r: 0, k, src, x0, y0, x1, y1 };
}
function shapeOb(sh, k) {
	if (sh.t === 'circ') return obCirc(sh.c, sh.r, k);
	if (sh.t === 'cap') return obSeg(sh.a, sh.b, sh.r, k);
	return obPoly(sh.pts, k);
}
function obsDist(o, a, b) {
	if (o.t === 0) return segSegDist(a, b, o.a, o.b) - o.r;
	if (o.t === 1) return ptSegDist(o.c, a, b) - o.r;
	if (pointInPoly(a, o.pts) || pointInPoly(b, o.pts)) return 0;
	let m = Infinity;
	const pts = o.pts;
	for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
		const d = segSegDist(a, b, pts[j], pts[i]);
		if (d < m) { m = d; if (m === 0) return 0; }
	}
	return m;
}

// ---------------------------------------------------------------- state
const DEFAULTS = {
	width: 0.25, ringOD: 1.0, ringHole: 0.5, ringAuto: false, ringODX: 2, ringHoleX: 1,
	mode: 'walk', clrArt: 0.2, clrPad: 0.15, clrEdge: 0.3, avoidSilk: true, res: 0.2,
	avoidCrt: true, clrCrt: 0, crtIgnore: '', avoidCovPads: true, mask: true, minFrag: 0.4, showMasked: true,
	gridType: 'tri', gridSpacing: 0.5, gridAngle: 90, gridOX: 150, gridOY: 150, snapObjects: true,
	sym: 'none', symX: 150, symY: 150,
	side: 'F', pcbColor: '#f6f6f3', silkColor: '#141414', padColor: '#d6ae5a',
	showCopper: true, showSilk: true, showPads: true, realistic: true, showGrid: true, showViol: true, scrollPans: false,
};
const LS_SETTINGS = 'silkrouter.settings', LS_DOC = 'silkrouter.doc', LS_BOARD = 'silkrouter.board';
let settings = Object.assign({}, DEFAULTS, loadJSON(LS_SETTINGS));
let doc = Object.assign({ segs: [], rings: [], nextId: 1 }, loadJSON(LS_DOC));
const hist = { undo: [], redo: [] };
let board = null, boardName = '', boardPaths = null;
let staticIdx = new SpatialHash(1.5), artIdx = new SpatialHash(1.5);
let derived = { segs: [], rings: [] }, clipped = [], artPaths = null, violations = new Set();
const sel = new Set();
let tool = 'route';
const view = { s: 4, ox: 0, oy: 0, w: 0, h: 0 };
const mouse = { sx: 0, sy: 0, w: P(0, 0), in: false, shift: false, alt: false };
let snap = null; // {p, art, kind}
let route = null; // {fixed:[{a,b,w}], clicks:[n], head:P, prevK, flip, preview}
let hover = null, drag = null, box = null, pan = null, spaceDown = false;
let needsRoute = false, dirty = false;

function loadJSON(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } }
function saveLocal() {
	try { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); localStorage.setItem(LS_DOC, JSON.stringify(doc)); } catch { /* quota */ }
}
const CLR = () => [settings.clrEdge, settings.clrEdge, settings.clrPad, settings.clrArt, settings.clrArt, settings.clrCrt];
const maxClr = () => Math.max(settings.clrEdge, settings.clrPad, settings.clrArt, settings.clrCrt);
const masking = () => !!(settings.mask && board);

// ---------------------------------------------------------------- symmetry & derived geometry
function symMats() {
	const rot = (th) => { const c = Math.cos(th), s = Math.sin(th); return [c, -s, s, c]; };
	const mm = (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
	const M = [-1, 0, 0, 1];
	switch (settings.sym) {
		case 'mirror': return [[1, 0, 0, 1], M];
		case 'rot3': return [0, 1, 2].map((i) => rot(i * 120 * DEG));
		case 'd3': return [0, 1, 2].map((i) => rot(i * 120 * DEG)).concat([0, 1, 2].map((i) => mm(rot(i * 120 * DEG), M)));
		case 'rot6': return [0, 1, 2, 3, 4, 5].map((i) => rot(i * 60 * DEG));
		case 'd6': return [0, 1, 2, 3, 4, 5].map((i) => rot(i * 60 * DEG)).concat([0, 1, 2, 3, 4, 5].map((i) => mm(rot(i * 60 * DEG), M)));
		default: return [[1, 0, 0, 1]];
	}
}
const symC = () => P(settings.symX, settings.symY);
function applyM(m, p, c) { const d = sub(p, c); return P(c.x + m[0] * d.x + m[1] * d.y, c.y + m[2] * d.x + m[3] * d.y); }
function applyMT(m, v) { return P(m[0] * v.x + m[2] * v.y, m[1] * v.x + m[3] * v.y); } // inverse (orthogonal)

function buildDerived() {
	const mats = symMats(), c = symC();
	const segs = [], rings = [];
	mats.forEach((m, ti) => {
		for (const s of doc.segs) segs.push({ a: applyM(m, s.a, c), b: applyM(m, s.b, c), w: s.w, src: s.id, ti });
		for (const r of doc.rings) rings.push({ c: applyM(m, r.c, c), od: r.od, hole: r.hole, src: r.id, ti });
	});
	derived = { segs, rings };
	// De-duplicated + ring-trimmed geometry used for rendering and export.
	const seen = new Set(), q = (v) => Math.round(v * 1e4);
	const uRings = rings.filter((r) => { const k = 'r' + q(r.c.x) + ',' + q(r.c.y) + ',' + q(r.od) + ',' + q(r.hole); if (seen.has(k)) return false; seen.add(k); return true; });
	const mask = masking();
	const keptRings = mask ? uRings.filter((r) => pointFree(r.c, r.od / 2)) : uRings;
	const out = [], ghost = [];
	for (const s of segs) {
		const k1 = q(s.a.x) + ',' + q(s.a.y), k2 = q(s.b.x) + ',' + q(s.b.y);
		const k = (k1 < k2 ? k1 + ';' + k2 : k2 + ';' + k1) + ';' + q(s.w);
		if (seen.has(k)) continue;
		seen.add(k);
		const discs = [];
		for (const r of keptRings) {
			if (r.hole <= 0) continue;
			const R = r.hole / 2 + s.w / 2;
			if (ptSegDist(r.c, s.a, s.b) < R) discs.push({ c: r.c, R });
		}
		const pieces = discs.length ? subtractDiscs(s.a, s.b, discs) : [[s.a, s.b]];
		for (const [a, b] of pieces) {
			if (!mask) { out.push({ a, b, w: s.w }); continue; }
			ghost.push({ a, b, w: s.w });
			for (const [p, q2, ca, cb] of maskSeg(a, b, s.w)) out.push({ a: p, b: q2, w: s.w, ca, cb });
		}
	}
	if (mask) retractCuts(out, keptRings);
	clipped = { segs: out, rings: keptRings, ghostSegs: ghost, ghostRings: mask ? uRings.filter((r) => !keptRings.includes(r)) : [] };
}
// ---------------------------------------------------------------- mask
// Art is drawn freely, then clipped wherever it would land on something that
// can't take silkscreen: outside the board, holes, exposed pads, existing silk
// and (optionally) footprint courtyards. Only the clipped result is exported.
function insideBoard(p) {
	let ins = false;
	for (const l of board.loops) if (pointInPoly(p, l)) ins = !ins;
	return ins;
}
function pointFree(p, h) {
	if (!insideBoard(p)) return false;
	const clr = CLR(), m = h + maxClr();
	return !staticIdx.query(p.x - m, p.y - m, p.x + m, p.y + m, (o) => obsDist(o, p, p) < h + clr[o.k] - 1e-7);
}
// Free sub-pieces of stroke a→b (round caps, so a point test along the centre line is exact).
function maskSeg(a, b, w) {
	const h = w / 2, L = dist(a, b);
	const at = (t) => P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
	const n = Math.max(1, Math.ceil(L / 0.04));
	const free = [];
	for (let i = 0; i <= n; i++) free.push(pointFree(at(i / n), h));
	if (free.every(Boolean)) return [[a, b]];
	// bisect each transition; always return the free side
	const edge = (t0, t1, f0) => {
		for (let it = 0; it < 14; it++) { const tm = (t0 + t1) / 2; if (pointFree(at(tm), h) === f0) t0 = tm; else t1 = tm; }
		return f0 ? t0 : t1;
	};
	const iv = [];
	let start = free[0] ? 0 : null;
	for (let i = 1; i <= n; i++) {
		if (free[i] === free[i - 1]) continue;
		const t = edge((i - 1) / n, i / n, free[i - 1]);
		if (free[i]) start = t; else { iv.push([start, t]); start = null; }
	}
	if (start !== null) iv.push([start, 1]);
	const minF = Math.max(0, settings.minFrag);
	return iv.filter(([t0, t1]) => {
		const l = (t1 - t0) * L;
		if (t0 > 0 && t1 < 1) return l >= minF; // island cut on both ends
		// A stub still attached at an original end continues the neighbouring art;
		// dropping it would leave that art ending in a near-miss instead of a clean cut.
		return l > 1e-3;
	}).map(([t0, t1]) => [at(t0), at(t1), t0 > 0, t1 < 1]);
}
// Ends created by the mask can land a hair away from other art (typically the
// stubs left either side of a masked junction). Pull such cut ends back until
// they clear clrArt, dropping pieces that shrink below the island size.
function retractCuts(segs, rings) {
	const idx = new SpatialHash(1.5), clr = settings.clrArt, step = 0.05;
	segs.forEach((s) => { s.ob = obSeg(s.a, s.b, s.w / 2, K_ART, s); idx.insert(s.ob); });
	for (const r of rings) idx.insert(obCirc(r.c, r.od / 2, K_ART, r));
	const nearMiss = (s) => {
		const h = s.w / 2, m = h + clr + 0.01;
		const x0 = Math.min(s.a.x, s.b.x) - m, y0 = Math.min(s.a.y, s.b.y) - m, x1 = Math.max(s.a.x, s.b.x) + m, y1 = Math.max(s.a.y, s.b.y) + m;
		return idx.query(x0, y0, x1, y1, (o) => {
			if (o.src === s || o.dead) return false;
			const g = obsDist(o, s.a, s.b) - h;
			return g > 1e-4 && g < clr - 1e-6;
		});
	};
	// An end may also be left dangling when the art it joined was masked away
	// entirely (e.g. a short piece over a via). Treat any end not touching
	// other art like a cut end.
	const joined = (p, s) => {
		const h = s.w / 2, m = h + 0.01;
		return idx.query(p.x - m, p.y - m, p.x + m, p.y + m, (o) => o.src !== s && obsDist(o, p, p) - h <= 1e-4);
	};
	for (const s of segs) { s.ca = s.ca || !joined(s.a, s); s.cb = s.cb || !joined(s.b, s); }
	for (const s of segs) {
		if (!(s.ca || s.cb)) continue;
		const L0 = dist(s.a, s.b), u = mul(sub(s.b, s.a), 1 / L0);
		let ta = 0, tb = L0;
		while (nearMiss(s)) {
			if (s.ca) ta += step;
			if (s.cb) tb -= step;
			if (tb - ta < Math.max(settings.minFrag, s.w)) { s.dead = s.ob.dead = true; break; }
			s.a = add(s.a, mul(u, s.ca ? step : 0));
			s.b = sub(s.b, mul(u, s.cb ? step : 0));
			s.ob.a = s.a; s.ob.b = s.b; // bbox only shrinks, so the hash cells stay valid
		}
	}
	for (let i = segs.length - 1; i >= 0; i--) { if (segs[i].dead) segs.splice(i, 1); else delete segs[i].ob; }
}
function buildArtIndex() {
	artIdx = new SpatialHash(1.5);
	for (const s of derived.segs) artIdx.insert(obSeg(s.a, s.b, s.w / 2, K_ART, s));
	for (const r of derived.rings) artIdx.insert(obCirc(r.c, r.od / 2, K_ART, r));
	if (route) {
		const mats = symMats(), c = symC();
		for (const f of route.fixed) for (const m of mats) artIdx.insert(obSeg(applyM(m, f.a, c), applyM(m, f.b, c), f.w / 2, K_ART, null));
	}
}
function buildStaticIndex() {
	staticIdx = new SpatialHash(1.5);
	if (!board) return;
	const s = settings.side;
	for (const [a, b] of board.edgeSegs) staticIdx.insert(obSeg(a, b, 0, K_EDGE));
	for (const h of board.holes) staticIdx.insert(shapeOb(h, K_HOLE));
	for (const p of board.pads[s]) staticIdx.insert(shapeOb(p, K_PAD));
	if (settings.avoidCovPads) for (const p of board.cpads[s]) staticIdx.insert(shapeOb(p, K_PAD));
	if (settings.avoidSilk) {
		for (const st of board.silk[s].strokes) {
			const pts = st.pts, n = pts.length;
			for (let i = 1; i < n + (st.closed ? 1 : 0); i++) staticIdx.insert(obSeg(pts[i - 1], pts[i % n], st.w / 2, K_SILK));
		}
		for (const f of board.silk[s].fills) staticIdx.insert(obPoly(f, K_SILK));
	}
	if (settings.avoidCrt) {
		const skip = crtIgnoreRe();
		for (const c of board.crt[s]) if (!(skip && skip.test(c.ref))) staticIdx.insert(obPoly(c.pts, K_CRT));
	}
}
// "J1, J3 TP*" -> /^(J1|J3|TP.*)$/i — references whose courtyards are not obstacles.
function crtIgnoreRe() {
	const toks = String(settings.crtIgnore || '').split(/[\s,;]+/).filter(Boolean);
	if (!toks.length) return null;
	const esc = (t) => t.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
	return new RegExp('^(' + toks.map(esc).join('|') + ')$', 'i');
}

// ---------------------------------------------------------------- collision
function blocked(a, b, h, excl) {
	const clr = CLR(), m = h + maxClr();
	const x0 = Math.min(a.x, b.x) - m, y0 = Math.min(a.y, b.y) - m, x1 = Math.max(a.x, b.x) + m, y1 = Math.max(a.y, b.y) + m;
	const test = (o) => {
		const need = h + clr[o.k];
		if (o.x0 > x1 - m + need || o.x1 < x0 + m - need || o.y0 > y1 - m + need || o.y1 < y0 + m - need) return false;
		if (obsDist(o, a, b) >= need - 1e-7) return false;
		if (excl) {
			let discs = null;
			for (const e of excl) if (e.set.has(o)) (discs || (discs = [])).push(e);
			if (discs) {
				for (const [p, q] of subtractDiscs(a, b, discs)) if (obsDist(o, p, q) < need - 1e-7) return true;
				return false;
			}
		}
		return true;
	};
	return staticIdx.query(x0, y0, x1, y1, test) || artIdx.query(x0, y0, x1, y1, test);
}
// Obstacles touching point p are ignored inside a disc around p, so a route
// can branch off (or land on) existing art without being blocked by it.
function makeExcl(p, h) {
	const clr = CLR(), m = h + maxClr(), set = new Set();
	let R = 0;
	const fn = (o) => {
		const need = h + clr[o.k];
		if (obsDist(o, p, p) < need + 1e-6) {
			set.add(o);
			const orad = o.t === 2 ? Math.hypot(o.x1 - o.x0, o.y1 - o.y0) / 2 : o.r;
			R = Math.max(R, 2 * (orad + need) + 0.01);
		}
		return false;
	};
	staticIdx.query(p.x - m, p.y - m, p.x + m, p.y + m, fn);
	artIdx.query(p.x - m, p.y - m, p.x + m, p.y + m, fn);
	return set.size ? { c: p, R, set } : null;
}
function pathFree(pts, h, excl) {
	for (let i = 1; i < pts.length; i++) if (blocked(pts[i - 1], pts[i], h, excl)) return false;
	return true;
}

// ---------------------------------------------------------------- walk-around router
// A* over a triangular lattice rooted at the start point: every lattice move is
// one of the 12 allowed directions, so any path it finds is already 30°-legal.
function astar(S, T, h, excl, prevK) {
	const res = Math.max(0.05, settings.res), budget = 30000;
	const e2x = res * 0.5, e2y = res * Math.sqrt(3) / 2;
	const pos = (i, j) => P(S.x + i * res + j * e2x, S.y + j * e2y);
	const OFF = 2048, W = 4096, nodeKey = (i, j) => (i + OFF) * W + (j + OFF);
	const Ni = [], Nj = [], Nk = [], Ng = [], Npar = [];
	const gBest = new Map(), closed = new Set(), edgeCache = new Map();
	const hf = [], hi = []; // binary heap
	const hpush = (f, idx) => {
		let n = hf.length; hf.push(f); hi.push(idx);
		while (n > 0) { const p = (n - 1) >> 1; if (hf[p] <= hf[n]) break; [hf[p], hf[n]] = [hf[n], hf[p]]; [hi[p], hi[n]] = [hi[n], hi[p]]; n = p; }
	};
	const hpop = () => {
		const top = hi[0], lf = hf.pop(), li = hi.pop();
		if (hf.length) {
			hf[0] = lf; hi[0] = li;
			let n = 0;
			for (;;) {
				const l = 2 * n + 1, r = l + 1; let m = n;
				if (l < hf.length && hf[l] < hf[m]) m = l;
				if (r < hf.length && hf[r] < hf[m]) m = r;
				if (m === n) break;
				[hf[m], hf[n]] = [hf[n], hf[m]]; [hi[m], hi[n]] = [hi[n], hi[m]]; n = m;
			}
		}
		return top;
	};
	const mk = (i, j, k, g, par) => { Ni.push(i); Nj.push(j); Nk.push(k); Ng.push(g); Npar.push(par); return Ni.length - 1; };
	const recon = (idx) => { const out = []; for (; idx >= 0; idx = Npar[idx]) out.push(pos(Ni[idx], Nj[idx])); return out.reverse(); };
	hpush(dist(S, T), mk(0, 0, prevK == null ? 12 : prevK, 0, -1));
	let bestIdx = 0, bestD = dist(S, T), exp = 0;
	while (hf.length && exp < budget) {
		const idx = hpop();
		const i = Ni[idx], j = Nj[idx], k = Nk[idx], g = Ng[idx];
		const sk = nodeKey(i, j) * 13 + k;
		if (closed.has(sk)) continue;
		closed.add(sk); exp++;
		const p = pos(i, j), dT = dist(p, T);
		if (dT < bestD - 1e-9) { bestD = dT; bestIdx = idx; }
		if (dT < 4 * res) {
			for (const opt of postureOptions(p, T, k < 12 ? k : null, false))
				if (pathFree(opt, h, excl)) return { pts: recon(idx).concat(opt.slice(1)), partial: false };
		}
		for (let d = 0; d < 12; d++) {
			let pen = 0;
			if (k < 12) {
				const st = kDiff(k, d);
				if (st > 3 && idx !== 0) continue; // no turns sharper than 90°
				if (st) pen = res * (0.6 + 0.5 * st);
			}
			const ni = i + LAT[d][0], nj = j + LAT[d][1];
			const ek = nodeKey(i, j) * 12 + d;
			let bl = edgeCache.get(ek);
			if (bl === undefined) { bl = blocked(p, pos(ni, nj), h, excl); edgeCache.set(ek, bl); }
			if (bl) continue;
			const g2 = g + LATLEN[d] * res + pen, sk2 = nodeKey(ni, nj) * 13 + d;
			const old = gBest.get(sk2);
			if (old !== undefined && old <= g2) continue;
			gBest.set(sk2, g2);
			hpush(g2 + 1.3 * dist(pos(ni, nj), T), mk(ni, nj, d, g2, idx));
		}
	}
	return { pts: recon(bestIdx), partial: true };
}
// Greedy "string pulling": replace runs of waypoints with one-bend postures when clear.
function pullTight(pts, h, excl, prevK) {
	pts = simplify(pts);
	if (pts.length <= 2) return pts;
	const out = [pts[0]];
	let i = 0, lastK = prevK;
	while (i < pts.length - 1) {
		let done = false;
		for (let j = Math.min(pts.length - 1, i + 40); j > i && !done; j--) {
			for (const o of postureOptions(pts[i], pts[j], lastK, false)) {
				if (o.length < 2 || !pathFree(o, h, excl)) continue;
				out.push(...o.slice(1));
				lastK = dirK(o[o.length - 2], o[o.length - 1]);
				i = j; done = true; break;
			}
		}
		if (!done) { out.push(pts[i + 1]); i++; }
	}
	return simplify(out);
}
function computeHead() {
	const S = route.head, T = snap ? snap.p : mouse.w, h = settings.width / 2;
	if (dist(S, T) < 1e-6) return { pts: [S], bad: [], reached: true };
	const excl = [makeExcl(S, h)];
	if (snap && snap.art) excl.push(makeExcl(T, h));
	const ex = excl.filter(Boolean);
	const walk = settings.mode === 'walk';
	let opts;
	if (mouse.shift) {
		// single straight leg along the nearest 30° direction
		const k = dirK(S, T), L = Math.max(0, (T.x - S.x) * DIRS[k].x + (T.y - S.y) * DIRS[k].y);
		let end = add(S, mul(DIRS[k], L));
		if (walk && blocked(S, end, h, ex)) {
			let lo = 0, hi = L;
			for (let it = 0; it < 24; it++) { const mid = (lo + hi) / 2; if (blocked(S, add(S, mul(DIRS[k], mid)), h, ex)) hi = mid; else lo = mid; }
			end = add(S, mul(DIRS[k], lo));
			return { pts: [S, end], bad: [], reached: false, ghost: [S, add(S, mul(DIRS[k], L))] };
		}
		opts = [[S, end]];
		if (!walk) return { pts: opts[0], bad: [blocked(S, end, h, ex)], reached: dist(end, T) < 1e-6 };
		return { pts: opts[0], bad: [], reached: dist(end, T) < 1e-6 };
	}
	opts = postureOptions(S, T, route.prevK, route.flip);
	if (!walk) {
		const pts = opts[0], bad = [];
		for (let i = 1; i < pts.length; i++) bad.push(blocked(pts[i - 1], pts[i], h, ex));
		return { pts, bad, reached: true };
	}
	for (const o of opts) if (pathFree(o, h, ex)) return { pts: o, bad: [], reached: true };
	const r = astar(S, T, h, ex, route.prevK);
	const pts = pullTight(r.pts, h, ex, route.prevK);
	return { pts, bad: [], reached: !r.partial, ghost: r.partial ? opts[0] : null };
}

// ---------------------------------------------------------------- snapping
function gridBasis() {
	const s = settings.gridSpacing, th = settings.gridAngle * DEG;
	return [P(s * Math.cos(th), s * Math.sin(th)), P(s * Math.cos(th + 60 * DEG), s * Math.sin(th + 60 * DEG))];
}
function gridSnap(p) {
	const o = P(settings.gridOX, settings.gridOY), s = settings.gridSpacing;
	if (settings.gridType === 'off' || !(s > 0)) return null;
	if (settings.gridType === 'square') return P(o.x + Math.round((p.x - o.x) / s) * s, o.y + Math.round((p.y - o.y) / s) * s);
	const [e1, e2] = gridBasis(), det = e1.x * e2.y - e1.y * e2.x, d = sub(p, o);
	const u = (d.x * e2.y - d.y * e2.x) / det, v = (e1.x * d.y - e1.y * d.x) / det;
	let best = null, bd = Infinity;
	for (const uu of [Math.floor(u), Math.ceil(u)]) for (const vv of [Math.floor(v), Math.ceil(v)]) {
		const q = P(o.x + uu * e1.x + vv * e2.x, o.y + uu * e1.y + vv * e2.y), dd = dist(q, p);
		if (dd < bd) { bd = dd; best = q; }
	}
	return best;
}
function objectSnap(p, opts = {}) {
	const R = 10 / view.s;
	let best = null, bd = R;
	const consider = (q, kind, pri) => { const d = dist(p, q) - pri; if (d < bd) { bd = d; best = { p: q, art: true, kind }; } };
	const extra = route ? route.fixed : [];
	for (const r of derived.rings) consider(r.c, 'center', R * 0.3);
	for (const s of derived.segs.concat(extra)) { consider(s.a, 'end', R * 0.3); consider(s.b, 'end', R * 0.3); }
	if (best) return best;
	if (opts.endsOnly) return null;
	for (const s of derived.segs.concat(extra)) {
		const t = projT(p, s.a, s.b), q = add(s.a, mul(sub(s.b, s.a), t));
		consider(q, 'on', 0);
	}
	return best;
}
function computeSnap(opts = {}) {
	const p = mouse.w;
	if (mouse.alt) return { p, art: false, kind: 'free' };
	if (settings.snapObjects && !opts.gridOnly) { const o = objectSnap(p, opts); if (o) return o; }
	const g = gridSnap(p);
	return g ? { p: g, art: false, kind: 'grid' } : { p, art: false, kind: 'free' };
}

// ---------------------------------------------------------------- doc ops
function pushUndo() {
	hist.undo.push(JSON.stringify(doc));
	if (hist.undo.length > 500) hist.undo.shift();
	hist.redo.length = 0;
}
function undo() {
	if (route) { routeBackspace(); return; }
	if (!hist.undo.length) return toast('Nothing to undo');
	hist.redo.push(JSON.stringify(doc));
	doc = JSON.parse(hist.undo.pop());
	sel.clear(); docChanged();
}
function redo() {
	if (route || !hist.redo.length) return;
	hist.undo.push(JSON.stringify(doc));
	doc = JSON.parse(hist.redo.pop());
	sel.clear(); docChanged();
}
const newId = () => doc.nextId++;
function docChanged() {
	buildDerived(); buildArtIndex(); buildArtPaths(); computeViolations();
	saveLocal(); updateUI(); redraw();
}
function itemById(id) { return doc.segs.find((s) => s.id === id) || doc.rings.find((r) => r.id === id); }
function deleteSelection() {
	if (!sel.size) return;
	pushUndo();
	doc.segs = doc.segs.filter((s) => !sel.has(s.id));
	doc.rings = doc.rings.filter((r) => !sel.has(r.id));
	sel.clear(); docChanged();
}
function transformSelection(fn) {
	if (!sel.size) return;
	const pts = [];
	for (const id of sel) { const it = itemById(id); if (!it) continue; if (it.c) pts.push(it.c); else pts.push(it.a, it.b); }
	const cen = pts.reduce((a, p) => add(a, mul(p, 1 / pts.length)), P(0, 0));
	const pivot = gridSnap(cen) || cen;
	pushUndo();
	for (const id of sel) {
		const it = itemById(id); if (!it) continue;
		if (it.c) it.c = fn(it.c, pivot); else { it.a = fn(it.a, pivot); it.b = fn(it.b, pivot); }
	}
	docChanged();
}
function rotateSelection(deg) {
	const th = deg * DEG, c = Math.cos(th), s = Math.sin(th);
	transformSelection((p, o) => { const d = sub(p, o); return P(o.x + d.x * c - d.y * s, o.y + d.x * s + d.y * c); });
}
function mirrorSelection() { transformSelection((p, o) => P(2 * o.x - p.x, p.y)); }
function selectConnected() {
	if (!sel.size) return;
	const touches = (x, y) => {
		const tol = 1e-4;
		const segPts = (s) => [s.a, s.b];
		if (x.c && y.c) return dist(x.c, y.c) < x.od / 2 + y.od / 2 + tol;
		if (x.c || y.c) { const r = x.c ? x : y, s = x.c ? y : x; return ptSegDist(r.c, s.a, s.b) < r.od / 2 + s.w / 2 + tol; }
		return segPts(x).some((p) => ptSegDist(p, y.a, y.b) < tol) || segPts(y).some((p) => ptSegDist(p, x.a, x.b) < tol);
	};
	const all = doc.segs.concat(doc.rings);
	const queue = all.filter((i) => sel.has(i.id));
	while (queue.length) {
		const x = queue.pop();
		for (const y of all) if (!sel.has(y.id) && touches(x, y)) { sel.add(y.id); queue.push(y); }
	}
	updateUI(); redraw();
}
function bakeSymmetry() {
	const mats = symMats();
	if (mats.length < 2) return toast('Symmetry is off — nothing to bake');
	pushUndo();
	const c = symC(), segs = [], rings = [];
	for (const m of mats) {
		for (const s of doc.segs) segs.push({ id: 0, a: applyM(m, s.a, c), b: applyM(m, s.b, c), w: s.w });
		for (const r of doc.rings) rings.push({ id: 0, c: applyM(m, r.c, c), od: r.od, hole: r.hole });
	}
	const seen = new Set(), q = (v) => Math.round(v * 1e4);
	doc.segs = segs.filter((s) => { const k1 = q(s.a.x) + ',' + q(s.a.y), k2 = q(s.b.x) + ',' + q(s.b.y), k = (k1 < k2 ? k1 + k2 : k2 + k1) + q(s.w); if (seen.has(k)) return false; seen.add(k); s.id = newId(); return true; });
	doc.rings = rings.filter((r) => { const k = 'r' + q(r.c.x) + q(r.c.y) + q(r.od) + q(r.hole); if (seen.has(k)) return false; seen.add(k); r.id = newId(); return true; });
	settings.sym = 'none';
	sel.clear(); syncInputs(); docChanged();
	toast('Symmetry copies baked into art');
}

// ---------------------------------------------------------------- routing interaction
function startRoute(p) {
	route = { fixed: [], clicks: [], head: p, start: p, prevK: null, flip: false, preview: null };
	needsRoute = true;
	buildArtIndex();
}
function commitPreview() {
	const pv = route.preview;
	if (!pv || pv.pts.length < 2) return false;
	const w = settings.width;
	let n = 0;
	for (let i = 1; i < pv.pts.length; i++) {
		const a = pv.pts[i - 1], b = pv.pts[i];
		if (dist(a, b) < 1e-6) continue;
		route.fixed.push({ a, b, w }); n++;
	}
	if (!n) return false;
	route.clicks.push({ n, head: route.head, prevK: route.prevK });
	const last = route.fixed[route.fixed.length - 1];
	route.head = last.b; route.prevK = dirK(last.a, last.b); route.flip = false;
	buildArtIndex();
	needsRoute = true;
	return true;
}
function finishRoute(ring) {
	if (!route) return;
	if (route.fixed.length || ring) {
		pushUndo();
		for (const f of route.fixed) doc.segs.push({ id: newId(), a: f.a, b: f.b, w: f.w });
		if (ring) doc.rings.push({ id: newId(), c: ring, ...ringSize(ring) });
	}
	route = null;
	docChanged();
}
function routeBackspace() {
	if (!route) return;
	const c = route.clicks.pop();
	if (!c) { route = null; buildArtIndex(); redraw(); return; }
	route.fixed.splice(route.fixed.length - c.n, c.n);
	route.head = c.head; route.prevK = c.prevK;
	buildArtIndex(); needsRoute = true; redraw();
}
function routeClick() {
	snap = computeSnap();
	if (!route) { startRoute(snap.p); redraw(); return; }
	route.preview = computeHead(); needsRoute = false;
	const pv = route.preview;
	const landed = snap.art && pv.reached && dist(pv.pts[pv.pts.length - 1], snap.p) < 1e-6 && dist(snap.p, route.start) > 1e-6;
	commitPreview();
	if (landed) finishRoute();
	redraw();
}
// Ring size for a ring centred at p. With "match trace" on, a ring on a trace of
// width w gets hole = ringHoleX × w and OD = ringODX × w (widest trace touching p wins).
function ringSize(p) {
	const fixed = { od: settings.ringOD, hole: settings.ringHole };
	if (!settings.ringAuto) return fixed;
	let w = 0;
	for (const s of derived.segs.concat(route ? route.fixed : [])) if (ptSegDist(p, s.a, s.b) < 1e-4) w = Math.max(w, s.w);
	return w > 0 ? { od: +(settings.ringODX * w).toFixed(4), hole: +(settings.ringHoleX * w).toFixed(4) } : fixed;
}
function placeRing(p) {
	pushUndo();
	doc.rings.push({ id: newId(), c: p, ...ringSize(p) });
	docChanged();
}

// ---------------------------------------------------------------- hit testing
function hitTest(p) {
	const tol = 5 / view.s;
	let best = null, bd = Infinity;
	for (const r of derived.rings) {
		const d = r.hole > 0 ? Math.max(0, Math.abs(dist(p, r.c) - (r.od + r.hole) / 4) - (r.od - r.hole) / 4) : Math.max(0, dist(p, r.c) - r.od / 2);
		if (d <= tol && d < bd) { bd = d - 1e-3; best = r; }
	}
	for (const s of derived.segs) {
		const d = Math.max(0, ptSegDist(p, s.a, s.b) - s.w / 2);
		if (d <= tol && d < bd) { bd = d; best = s; }
	}
	return best;
}
function itemInBox(it, x0, y0, x1, y1) {
	const inb = (q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
	return it.c ? inb(it.c) : inb(it.a) && inb(it.b);
}

// ---------------------------------------------------------------- violations
function computeViolations() {
	violations = new Set();
	const clr = CLR();
	// With the mask on, check what will actually be printed.
	const src = masking() ? clipped : derived;
	const items = src.segs.map((s) => ({ it: s, ob: obSeg(s.a, s.b, s.w / 2, K_ART, s) }))
		.concat(src.rings.map((r) => ({ it: r, ob: obCirc(r.c, r.od / 2, K_ART, r) })));
	const idx = new SpatialHash(1.5);
	for (const x of items) idx.insert(x.ob);
	const m = maxClr() + 0.01;
	const touch = new Map(), near = [];
	for (const x of items) touch.set(x.it, new Set());
	for (const x of items) {
		const ob = x.ob, a = ob.t === 0 ? ob.a : ob.c, b = ob.t === 0 ? ob.b : ob.c, r = ob.r;
		if (!masking()) staticIdx.query(ob.x0 - m, ob.y0 - m, ob.x1 + m, ob.y1 + m, (o) => {
			if (obsDist(o, a, b) - r < clr[o.k] - 1e-6) { violations.add(x.it); return true; }
			return false;
		});
		// art ↔ art: touching means connected (fine), a near-miss gap is a violation
		idx.query(ob.x0 - m, ob.y0 - m, ob.x1 + m, ob.y1 + m, (o) => {
			if (o === ob) return false;
			const gap = obsDist(o, a, b) - r;
			if (gap <= 1e-4) touch.get(x.it).add(o.src);
			else if (gap < settings.clrArt - 1e-6) near.push([x.it, o.src]);
			return false;
		});
	}
	// ...unless both pieces are joined through a third one: consecutive pieces of a
	// thick trace, or traces meeting at a ring, sit close by construction.
	for (const [p, q] of near) {
		const tp = touch.get(p), tq = touch.get(q);
		let joined = false;
		for (const z of tp) if (tq.has(z)) { joined = true; break; }
		if (!joined) { violations.add(p); violations.add(q); }
	}
}

// ---------------------------------------------------------------- rendering
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const BG = '#0d0f12', ACCENT = '#8fd6ff', DANGER = '#ff5a5a';

function shapePath(path, sh) {
	if (sh.t === 'circ') { path.moveTo(sh.c.x + sh.r, sh.c.y); path.arc(sh.c.x, sh.c.y, sh.r, 0, Math.PI * 2); }
	else if (sh.t === 'cap') {
		const ang = Math.atan2(sh.b.y - sh.a.y, sh.b.x - sh.a.x);
		path.moveTo(sh.a.x + sh.r * Math.cos(ang + Math.PI / 2), sh.a.y + sh.r * Math.sin(ang + Math.PI / 2));
		path.arc(sh.a.x, sh.a.y, sh.r, ang + Math.PI / 2, ang + Math.PI * 1.5);
		path.arc(sh.b.x, sh.b.y, sh.r, ang - Math.PI / 2, ang + Math.PI / 2);
		path.closePath();
	} else polyPath(path, sh.pts);
}
function polyPath(path, pts) {
	if (!pts.length) return;
	path.moveTo(pts[0].x, pts[0].y);
	for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
	path.closePath();
}
function strokeGroups(list) {
	const m = new Map();
	for (const s of list) {
		let p = m.get(s.w);
		if (!p) m.set(s.w, (p = new Path2D()));
		p.moveTo(s.pts[0].x, s.pts[0].y);
		for (let i = 1; i < s.pts.length; i++) p.lineTo(s.pts[i].x, s.pts[i].y);
		if (s.closed) p.closePath();
	}
	return m;
}
function buildBoardPaths() {
	if (!board) { boardPaths = null; return; }
	const s = settings.side, bp = {};
	bp.board = new Path2D();
	for (const l of board.loops) polyPath(bp.board, l);
	bp.cuFill = new Path2D();
	for (const f of board.cu[s].fills) if (f.t === 'poly') polyPath(bp.cuFill, f.pts); else shapePath(bp.cuFill, f);
	bp.cuStroke = strokeGroups(board.cu[s].tracks);
	bp.silkStroke = strokeGroups(board.silk[s].strokes);
	bp.silkFill = new Path2D();
	for (const f of board.silk[s].fills) polyPath(bp.silkFill, f);
	bp.cpads = new Path2D();
	for (const p of board.cpads[s]) shapePath(bp.cpads, p);
	bp.pads = new Path2D();
	for (const p of board.pads[s]) shapePath(bp.pads, p);
	bp.holes = new Path2D();
	for (const h of board.holes) shapePath(bp.holes, h);
	boardPaths = bp;
}
function buildArtPaths() {
	const strokes = new Map();
	for (const s of clipped.segs) {
		let p = strokes.get(s.w);
		if (!p) strokes.set(s.w, (p = new Path2D()));
		p.moveTo(s.a.x, s.a.y); p.lineTo(s.b.x, s.b.y);
	}
	const rings = new Path2D();
	for (const r of clipped.rings) ringPath(rings, r);
	const ghost = new Map(), ghostRings = new Path2D();
	for (const s of clipped.ghostSegs || []) {
		let p = ghost.get(s.w);
		if (!p) ghost.set(s.w, (p = new Path2D()));
		p.moveTo(s.a.x, s.a.y); p.lineTo(s.b.x, s.b.y);
	}
	for (const r of clipped.ghostRings || []) ringPath(ghostRings, r);
	artPaths = { strokes, rings, ghost, ghostRings };
}
function ringPath(path, r) {
	path.moveTo(r.c.x + r.od / 2, r.c.y);
	path.arc(r.c.x, r.c.y, r.od / 2, 0, Math.PI * 2, false);
	if (r.hole > 0) { path.moveTo(r.c.x + r.hole / 2, r.c.y); path.arc(r.c.x, r.c.y, r.hole / 2, Math.PI * 2, 0, true); }
}
function mix(hexA, hexB, t) {
	const pa = parseInt(hexA.slice(1), 16), pb = parseInt(hexB.slice(1), 16);
	const ch = (v, sh) => (v >> sh) & 255;
	const c = [16, 8, 0].map((sh) => Math.round(ch(pa, sh) * (1 - t) + ch(pb, sh) * t));
	return 'rgb(' + c.join(',') + ')';
}
const toScreen = (p) => P(p.x * view.s + view.ox, p.y * view.s + view.oy);
const toWorld = (sx, sy) => P((sx - view.ox) / view.s, (sy - view.oy) / view.s);

function redraw() { if (!dirty) { dirty = true; requestAnimationFrame(frame); } }
function frame() {
	dirty = false;
	if (route && needsRoute && mouse.in) {
		needsRoute = false;
		snap = computeSnap();
		route.preview = computeHead();
		updateStatus();
	}
	draw();
}
function setWorld() { const d = devicePixelRatio || 1; ctx.setTransform(d * view.s, 0, 0, d * view.s, d * view.ox, d * view.oy); }
function draw() {
	const d = devicePixelRatio || 1, px = 1 / view.s;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.fillStyle = BG; ctx.fillRect(0, 0, cv.width, cv.height);
	setWorld();
	ctx.lineCap = 'round'; ctx.lineJoin = 'round';
	const bp = boardPaths;
	if (bp) {
		ctx.fillStyle = settings.pcbColor; ctx.fill(bp.board, 'evenodd');
		if (settings.showCopper) {
			const tint = mix(settings.pcbColor, '#b87333', 0.11);
			ctx.fillStyle = tint; ctx.fill(bp.cuFill); ctx.fill(bp.cpads);
			ctx.strokeStyle = tint;
			for (const [w, p] of bp.cuStroke) { ctx.lineWidth = w; ctx.stroke(p); }
		}
		ctx.save();
		if (settings.realistic) ctx.clip(bp.board, 'evenodd');
		if (settings.showSilk) {
			ctx.strokeStyle = settings.silkColor; ctx.fillStyle = settings.silkColor;
			for (const [w, p] of bp.silkStroke) { ctx.lineWidth = w; ctx.stroke(p); }
			ctx.fill(bp.silkFill);
		}
	}
	// art
	ctx.strokeStyle = settings.silkColor; ctx.fillStyle = settings.silkColor;
	if (settings.showMasked && masking()) {
		ctx.globalAlpha = 0.13;
		for (const [w, p] of artPaths.ghost) { ctx.lineWidth = w; ctx.stroke(p); }
		ctx.fill(artPaths.ghostRings);
		ctx.globalAlpha = 1;
	}
	for (const [w, p] of artPaths.strokes) { ctx.lineWidth = w; ctx.stroke(p); }
	ctx.fill(artPaths.rings);
	if (route) {
		for (const f of route.fixed) { ctx.lineWidth = f.w; ctx.beginPath(); ctx.moveTo(f.a.x, f.a.y); ctx.lineTo(f.b.x, f.b.y); ctx.stroke(); }
	}
	if (bp) {
		ctx.restore();
		if (settings.showPads && settings.realistic) { ctx.fillStyle = settings.padColor; ctx.fill(bp.pads); }
		if (settings.showPads) { ctx.fillStyle = BG; ctx.fill(bp.holes); }
		if (settings.showPads && !settings.realistic) { ctx.globalAlpha = 0.55; ctx.fillStyle = settings.padColor; ctx.fill(bp.pads); ctx.globalAlpha = 1; }
		ctx.strokeStyle = 'rgba(150,160,175,.55)'; ctx.lineWidth = px; ctx.stroke(bp.board);
	}
	drawGrid(px);
	drawSymmetryGuides(px);
	// violations
	if (settings.showViol && violations.size) {
		ctx.strokeStyle = DANGER; ctx.globalAlpha = 0.85;
		for (const it of violations) outlineItem(it, 2.5 * px, true);
		ctx.globalAlpha = 1;
	}
	// selection & hover
	ctx.strokeStyle = ACCENT;
	ctx.globalAlpha = 0.7;
	for (const s of derived.segs) if (sel.has(s.src)) outlineItem(s, 3 * px);
	for (const r of derived.rings) if (sel.has(r.src)) outlineItem(r, 3 * px);
	ctx.globalAlpha = 0.35;
	if (hover && tool === 'select') for (const it of derived.segs.concat(derived.rings)) if (it.src === hover.src) outlineItem(it, 3 * px);
	ctx.globalAlpha = 1;
	drawToolOverlay(px);
	if (box) {
		ctx.setTransform(d, 0, 0, d, 0, 0);
		ctx.fillStyle = 'rgba(143,214,255,.08)'; ctx.strokeStyle = ACCENT; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
		const x = Math.min(box.sx0, box.sx1), y = Math.min(box.sy0, box.sy1), w = Math.abs(box.sx1 - box.sx0), h = Math.abs(box.sy1 - box.sy0);
		ctx.fillRect(x, y, w, h); ctx.strokeRect(x + .5, y + .5, w, h); ctx.setLineDash([]);
	}
}
function outlineItem(it, extra, filled) {
	if (it.c) {
		ctx.lineWidth = extra;
		ctx.beginPath(); ctx.arc(it.c.x, it.c.y, it.od / 2 + extra / 2, 0, Math.PI * 2); ctx.stroke();
	} else {
		ctx.lineWidth = it.w + extra * (filled ? 1 : 1);
		ctx.beginPath(); ctx.moveTo(it.a.x, it.a.y); ctx.lineTo(it.b.x, it.b.y); ctx.stroke();
	}
}
function drawGrid(px) {
	if (!settings.showGrid || settings.gridType === 'off') return;
	const s = settings.gridSpacing;
	let step = 1;
	while (s * step * view.s < 9) step *= 2;
	const tl = toWorld(0, 0), br = toWorld(view.w, view.h), o = P(settings.gridOX, settings.gridOY);
	ctx.fillStyle = mix(settings.pcbColor, '#5a6a80', 0.5);
	ctx.globalAlpha = 0.55;
	const r = 0.9 * px;
	let count = 0;
	if (settings.gridType === 'square') {
		const g = s * step;
		for (let x = o.x + Math.ceil((tl.x - o.x) / g) * g; x <= br.x; x += g)
			for (let y = o.y + Math.ceil((tl.y - o.y) / g) * g; y <= br.y; y += g) { ctx.fillRect(x - r, y - r, 2 * r, 2 * r); if (++count > 60000) break; }
	} else {
		const [e1, e2] = gridBasis(), det = e1.x * e2.y - e1.y * e2.x;
		const uv = (p) => { const d = sub(p, o); return [(d.x * e2.y - d.y * e2.x) / det, (e1.x * d.y - e1.y * d.x) / det]; };
		const cs = [uv(tl), uv(br), uv(P(tl.x, br.y)), uv(P(br.x, tl.y))];
		const u0 = Math.floor(Math.min(...cs.map((c) => c[0])) / step) * step, u1 = Math.max(...cs.map((c) => c[0]));
		const v0 = Math.floor(Math.min(...cs.map((c) => c[1])) / step) * step, v1 = Math.max(...cs.map((c) => c[1]));
		for (let u = u0; u <= u1; u += step) for (let v = v0; v <= v1; v += step) {
			const x = o.x + u * e1.x + v * e2.x, y = o.y + u * e1.y + v * e2.y;
			if (x < tl.x || x > br.x || y < tl.y || y > br.y) continue;
			ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
			if (++count > 60000) break;
		}
	}
	ctx.globalAlpha = 1;
}
function drawSymmetryGuides(px) {
	if (settings.sym === 'none') return;
	const c = symC(), L = 200;
	ctx.strokeStyle = ACCENT; ctx.globalAlpha = 0.35; ctx.lineWidth = px; ctx.setLineDash([6 * px, 6 * px]);
	const angs = settings.sym === 'mirror' ? [90] : settings.sym === 'rot3' ? [90, 210, 330] : [90, 150, 210, 270, 330, 30];
	ctx.beginPath();
	for (const a of angs) { ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + L * Math.cos(a * DEG), c.y - L * Math.sin(a * DEG)); }
	ctx.stroke(); ctx.setLineDash([]);
	ctx.beginPath(); ctx.arc(c.x, c.y, 4 * px, 0, Math.PI * 2); ctx.stroke();
	ctx.globalAlpha = 1;
}
function drawSnapMarker(px) {
	if (!snap || !mouse.in) return;
	const p = snap.p, r = 5 * px;
	ctx.lineWidth = 1.5 * px; ctx.strokeStyle = ACCENT;
	ctx.beginPath();
	if (snap.kind === 'end' || snap.kind === 'center') ctx.rect(p.x - r, p.y - r, 2 * r, 2 * r);
	else if (snap.kind === 'on') { ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r, p.y); ctx.closePath(); }
	else { ctx.moveTo(p.x - r, p.y); ctx.lineTo(p.x + r, p.y); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x, p.y + r); }
	ctx.stroke();
}
function drawToolOverlay(px) {
	if (tool === 'route') {
		if (route && route.preview) {
			const pv = route.preview, mats = symMats(), c = symC();
			if (pv.ghost) {
				ctx.strokeStyle = DANGER; ctx.globalAlpha = 0.6; ctx.lineWidth = px; ctx.setLineDash([4 * px, 4 * px]);
				ctx.beginPath(); pv.ghost.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
				ctx.setLineDash([]); ctx.globalAlpha = 1;
			}
			// symmetry echoes of the head
			if (mats.length > 1) {
				ctx.strokeStyle = settings.silkColor; ctx.globalAlpha = 0.35; ctx.lineWidth = settings.width;
				for (let t = 1; t < mats.length; t++) {
					ctx.beginPath();
					pv.pts.forEach((p, i) => { const q = applyM(mats[t], p, c); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
					for (const f of route.fixed) { const a = applyM(mats[t], f.a, c), b = applyM(mats[t], f.b, c); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
					ctx.stroke();
				}
				ctx.globalAlpha = 1;
			}
			ctx.lineWidth = settings.width;
			for (let i = 1; i < pv.pts.length; i++) {
				ctx.strokeStyle = pv.bad[i - 1] ? DANGER : ACCENT;
				ctx.beginPath(); ctx.moveTo(pv.pts[i - 1].x, pv.pts[i - 1].y); ctx.lineTo(pv.pts[i].x, pv.pts[i].y); ctx.stroke();
			}
		}
		if (route) { ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.arc(route.head.x, route.head.y, 2.5 * px, 0, Math.PI * 2); ctx.fill(); }
		drawSnapMarker(px);
	} else if (tool === 'ring' && snap && mouse.in) {
		ctx.fillStyle = ACCENT; ctx.globalAlpha = 0.7;
		const p = new Path2D(); ringPath(p, { c: snap.p, ...ringSize(snap.p) }); ctx.fill(p);
		ctx.globalAlpha = 1;
		drawSnapMarker(px);
	}
}

// ---------------------------------------------------------------- view
function resize() {
	const r = cv.parentElement.getBoundingClientRect(), d = devicePixelRatio || 1;
	view.w = r.width; view.h = r.height;
	cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d);
	redraw();
}
function fitView() {
	let bb = board ? board.bbox : null;
	if (!bb) {
		const pts = derived.segs.flatMap((s) => [s.a, s.b]).concat(derived.rings.map((r) => r.c));
		if (!pts.length) bb = { x0: 100, y0: 100, x1: 200, y1: 200 };
		else bb = { x0: Math.min(...pts.map((p) => p.x)) - 5, y0: Math.min(...pts.map((p) => p.y)) - 5, x1: Math.max(...pts.map((p) => p.x)) + 5, y1: Math.max(...pts.map((p) => p.y)) + 5 };
	}
	const bw = bb.x1 - bb.x0, bh = bb.y1 - bb.y0;
	view.s = Math.min(view.w / bw, view.h / bh) * 0.92;
	view.ox = view.w / 2 - (bb.x0 + bw / 2) * view.s;
	view.oy = view.h / 2 - (bb.y0 + bh / 2) * view.s;
	updateStatus(); redraw();
}
function zoomAt(sx, sy, f) {
	const w = toWorld(sx, sy);
	view.s = Math.max(0.5, Math.min(800, view.s * f));
	view.ox = sx - w.x * view.s; view.oy = sy - w.y * view.s;
	updateStatus(); redraw();
}

// ---------------------------------------------------------------- input
function setTool(t) {
	if (route && t !== 'route') finishRoute();
	tool = t;
	document.querySelectorAll('#tools [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
	cv.classList.toggle('select', t === 'select');
	hover = null; snap = null;
	updateStatus(); redraw();
}
function onMove(e) {
	const r = cv.getBoundingClientRect();
	mouse.sx = e.clientX - r.left; mouse.sy = e.clientY - r.top;
	mouse.w = toWorld(mouse.sx, mouse.sy); mouse.in = true;
	mouse.shift = e.shiftKey; mouse.alt = e.altKey;
	if (pan) {
		if (!pan.moved && Math.hypot(e.clientX - pan.x, e.clientY - pan.y) >= 4) { pan.moved = true; cv.classList.add('pan'); }
		if (pan.moved) { view.ox = pan.ox + (e.clientX - pan.x); view.oy = pan.oy + (e.clientY - pan.y); redraw(); }
		return;
	}
	if (tool === 'select') {
		if (drag) dragMove();
		else if (box) { box.sx1 = mouse.sx; box.sy1 = mouse.sy; }
		else hover = hitTest(mouse.w);
	} else if (tool === 'route') {
		if (route) needsRoute = true; else snap = computeSnap();
	} else if (tool === 'ring') snap = computeSnap({ endsOnly: false });
	updateStatus(); redraw();
}
function onDown(e) {
	cv.focus();
	if (e.button === 1 || e.button === 2 || (e.button === 0 && spaceDown)) {
		// Right button pans only once it moves past a small threshold; a plain right-click still finishes a route (see onUp).
		const right = e.button === 2;
		pan = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy, right, moved: !right };
		if (!right) cv.classList.add('pan');
		e.preventDefault(); return;
	}
	if (e.button !== 0) return;
	onMove(e);
	if (tool === 'route') routeClick();
	else if (tool === 'ring') { snap = computeSnap(); placeRing(snap.p); }
	else if (tool === 'select') {
		const hit = hitTest(mouse.w);
		if (hit) {
			if (e.shiftKey) { sel.has(hit.src) ? sel.delete(hit.src) : sel.add(hit.src); }
			else if (!sel.has(hit.src)) { sel.clear(); sel.add(hit.src); }
			const verts = hit.c ? [hit.c] : [hit.a, hit.b];
			const anchor = verts.reduce((a, b) => (dist(a, mouse.w) <= dist(b, mouse.w) ? a : b));
			drag = { start: mouse.w, anchor, m: symMats()[hit.ti] || [1, 0, 0, 1], orig: null, moved: false };
		} else {
			box = { sx0: mouse.sx, sy0: mouse.sy, sx1: mouse.sx, sy1: mouse.sy, add: e.shiftKey };
		}
		updateUI(); redraw();
	}
}
function dragMove() {
	const dpx = dist(mouse.w, drag.start) * view.s;
	if (!drag.moved && dpx < 4) return;
	if (!drag.moved) {
		drag.moved = true; pushUndo();
		drag.orig = new Map([...sel].map((id) => [id, JSON.parse(JSON.stringify(itemById(id)))]));
	}
	const target = add(drag.anchor, sub(mouse.w, drag.start));
	const snapped = mouse.alt ? target : gridSnap(target) || target;
	const delta = applyMT(drag.m, sub(snapped, drag.anchor));
	for (const [id, o] of drag.orig) {
		const it = itemById(id); if (!it) continue;
		if (o.c) it.c = add(o.c, delta); else { it.a = add(o.a, delta); it.b = add(o.b, delta); }
	}
	buildDerived(); buildArtPaths();
}
function onUp(e) {
	if (pan) {
		const click = pan.right && !pan.moved;
		pan = null; if (!spaceDown) cv.classList.remove('pan');
		if (click && route) finishRoute();
		return;
	}
	if (drag) { if (drag.moved) docChanged(); drag = null; }
	if (box) {
		const a = toWorld(Math.min(box.sx0, box.sx1), Math.min(box.sy0, box.sy1)), b = toWorld(Math.max(box.sx0, box.sx1), Math.max(box.sy0, box.sy1));
		if (!box.add) sel.clear();
		for (const it of derived.segs.concat(derived.rings)) if (itemInBox(it, a.x, a.y, b.x, b.y)) sel.add(it.src);
		box = null; updateUI(); redraw();
	}
}
function onWheel(e) {
	e.preventDefault();
	const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
	const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
	if (settings.scrollPans && !e.ctrlKey && !e.metaKey) { view.ox -= dx; view.oy -= dy; updateStatus(); redraw(); }
	else zoomAt(sx, sy, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018)));
	onMove(e);
}
function onKey(e) {
	const tag = (e.target.tagName || '').toLowerCase();
	if (tag === 'input' || tag === 'select') { if (e.key === 'Escape' || e.key === 'Enter') e.target.blur(); return; }
	const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
	if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
	if (mod && k === 'y') { e.preventDefault(); redo(); return; }
	if (mod && k === 's') { e.preventDefault(); saveProject(); return; }
	if (mod && k === 'a') { e.preventDefault(); setTool('select'); doc.segs.forEach((s) => sel.add(s.id)); doc.rings.forEach((r) => sel.add(r.id)); updateUI(); redraw(); return; }
	if (mod) return;
	if (e.key === ' ') { spaceDown = true; cv.classList.add('pan'); e.preventDefault(); return; }
	if (e.key === 'Shift' || e.key === 'Alt') { mouse.shift = e.shiftKey; mouse.alt = e.altKey; needsRoute = true; if (!route) snap = mouse.in && tool !== 'select' ? computeSnap() : snap; redraw(); return; }
	switch (k) {
		case 'x': setTool('route'); break;
		case 'o': setTool('ring'); break;
		case 's': setTool('select'); break;
		case 'f': case 'home': fitView(); break;
		case 'escape':
			if (route) finishRoute(); else if (tool !== 'select') setTool('select'); else { sel.clear(); updateUI(); redraw(); }
			break;
		case 'enter': case 'end':
			if (route) { commitPreview(); finishRoute(); }
			break;
		case '/':
			if (route) { route.flip = !route.flip; needsRoute = true; redraw(); }
			break;
		case 'v':
			if (route) {
				commitPreview();
				if (e.shiftKey) {
					pushUndo(); doc.rings.push({ id: newId(), c: route.head, ...ringSize(route.head) });
					buildDerived(); buildArtIndex(); buildArtPaths(); saveLocal(); updateUI(); needsRoute = true; redraw();
				} else finishRoute(route.head);
			}
			break;
		case 'backspace': case 'delete':
			e.preventDefault();
			if (route) routeBackspace(); else deleteSelection();
			break;
		case 'u': if (tool === 'select') selectConnected(); break;
		case 'r': if (tool === 'select') rotateSelection(e.shiftKey ? 30 : -30); break;
		case 'm': if (tool === 'select') mirrorSelection(); break;
	}
}
function onKeyUp(e) {
	if (e.key === ' ') { spaceDown = false; if (!pan) cv.classList.remove('pan'); }
	if (e.key === 'Shift' || e.key === 'Alt') { mouse.shift = e.shiftKey; mouse.alt = e.altKey; needsRoute = true; redraw(); }
}

// ---------------------------------------------------------------- export
const fmt = (v) => (+v.toFixed(4)).toString();
function download(name, text, type) {
	const a = document.createElement('a');
	a.href = URL.createObjectURL(new Blob([text], { type }));
	a.download = name;
	document.body.appendChild(a); a.click(); a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportSVG() {
	if (route) finishRoute();
	const r = buildSVG();
	if (!r) return toast('Nothing to export yet');
	download('silk-art.svg', r.text, 'image/svg+xml');
	toast(`Exported silk-art.svg — ${r.segs} segments, ${r.rings} rings` + (r.negative ? ' (warning: art at negative coordinates)' : ''));
}
function buildSVG() {
	const { segs, rings } = clipped;
	if (!segs.length && !rings.length) return null;
	let mx = 0, my = 0, mnx = Infinity, mny = Infinity;
	for (const s of segs) for (const p of [s.a, s.b]) { mx = Math.max(mx, p.x + s.w); my = Math.max(my, p.y + s.w); mnx = Math.min(mnx, p.x); mny = Math.min(mny, p.y); }
	for (const r of rings) { mx = Math.max(mx, r.c.x + r.od); my = Math.max(my, r.c.y + r.od); mnx = Math.min(mnx, r.c.x); mny = Math.min(mny, r.c.y); }
	const W = Math.ceil(mx + 1), H = Math.ceil(my + 1);
	const byW = new Map();
	for (const s of segs) { if (!byW.has(s.w)) byW.set(s.w, []); byW.get(s.w).push(`M${fmt(s.a.x)} ${fmt(s.a.y)}L${fmt(s.b.x)} ${fmt(s.b.y)}`); }
	const out = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<!-- Silk Router 30° export. Units are KiCad board millimetres with the SVG origin at board (0,0):',
		'     in KiCad use File > Import > Graphics, choose the silkscreen layer and place at X=0, Y=0. -->',
		`<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">`,
		'<g fill="none" stroke="#000000" stroke-linecap="round" stroke-linejoin="round">',
	];
	for (const [w, ds] of byW) out.push(`<path stroke-width="${fmt(w)}" d="${ds.join('')}"/>`);
	for (const r of rings) {
		if (r.hole > 0) out.push(`<circle cx="${fmt(r.c.x)}" cy="${fmt(r.c.y)}" r="${fmt((r.od + r.hole) / 4)}" stroke-width="${fmt((r.od - r.hole) / 2)}"/>`);
		else out.push(`<circle cx="${fmt(r.c.x)}" cy="${fmt(r.c.y)}" r="${fmt(r.od / 2)}" fill="#000000" stroke="none"/>`);
	}
	out.push('</g>', '</svg>', '');
	return { text: out.join('\n'), segs: segs.length, rings: rings.length, negative: mnx < 0 || mny < 0 };
}
function exportKicadMod() {
	if (route) finishRoute();
	const text = buildKicadMod();
	if (!text) return toast('Nothing to export yet');
	download('silk_art.kicad_mod', text, 'text/plain');
	const o = symC();
	toast(`Exported silk_art.kicad_mod — place it at X ${fmt(o.x)}, Y ${fmt(o.y)}`);
}
function buildKicadMod() {
	const { segs, rings } = clipped;
	if (!segs.length && !rings.length) return null;
	const o = symC(), L = settings.side + '.SilkS';
	const rel = (p) => `${fmt(p.x - o.x)} ${fmt(p.y - o.y)}`;
	const out = [
		'(footprint "silk_art"',
		'\t(version 20241229)',
		'\t(generator "silk_router")',
		'\t(layer "F.Cu")',
		`\t(descr "Silkscreen art from Silk Router 30°. Place at X ${fmt(o.x)} Y ${fmt(o.y)}, rotation 0.")`,
		'\t(property "Reference" "ART**" (at 0 0 0) (layer "F.SilkS") (hide yes) (effects (font (size 1 1) (thickness 0.15))))',
		'\t(property "Value" "silk_art" (at 0 0 0) (layer "F.Fab") (hide yes) (effects (font (size 1 1) (thickness 0.15))))',
		'\t(attr board_only exclude_from_pos_files exclude_from_bom)',
	];
	for (const s of segs) out.push(`\t(fp_line (start ${rel(s.a)}) (end ${rel(s.b)}) (stroke (width ${fmt(s.w)}) (type solid)) (layer "${L}"))`);
	for (const r of rings) {
		if (r.hole > 0) {
			const rm = (r.od + r.hole) / 4;
			out.push(`\t(fp_circle (center ${rel(r.c)}) (end ${rel(P(r.c.x + rm, r.c.y))}) (stroke (width ${fmt((r.od - r.hole) / 2)}) (type solid)) (fill no) (layer "${L}"))`);
		} else out.push(`\t(fp_circle (center ${rel(r.c)}) (end ${rel(P(r.c.x + r.od / 2, r.c.y))}) (stroke (width 0) (type solid)) (fill yes) (layer "${L}"))`);
	}
	out.push(')', '');
	return out.join('\n');
}
function saveProject() {
	if (route) finishRoute();
	download('silk-art.json', JSON.stringify({ app: 'silk-router', version: 1, board: boardName, settings, doc }, null, 1), 'application/json');
}
function loadProject(text) {
	const j = JSON.parse(text);
	if (!j.doc) throw new Error('Not a Silk Router project');
	pushUndo();
	doc = Object.assign({ segs: [], rings: [], nextId: 1 }, j.doc);
	doc.nextId = Math.max(doc.nextId, ...doc.segs.map((s) => s.id + 1), ...doc.rings.map((r) => r.id + 1), 1);
	if (j.settings) settings = Object.assign({}, DEFAULTS, j.settings);
	sel.clear(); route = null;
	syncInputs(); buildStaticIndex(); buildBoardPaths(); docChanged();
	toast('Project loaded');
}

// ---------------------------------------------------------------- board loading
function setBoard(text, name, opts = {}) {
	const t0 = performance.now();
	const B = parseBoard(text);
	const first = !board;
	board = B; boardName = name;
	if (opts.cache !== false) { try { localStorage.setItem(LS_BOARD, JSON.stringify({ name, text })); } catch { /* too big for localStorage */ } }
	if (!localStorage.getItem(LS_SETTINGS + '.centered')) {
		settings.gridOX = settings.symX = B.center.x; settings.gridOY = settings.symY = B.center.y;
		localStorage.setItem(LS_SETTINGS + '.centered', '1');
		syncInputs();
	}
	buildStaticIndex(); buildBoardPaths(); buildDerived(); buildArtIndex(); buildArtPaths(); computeViolations();
	document.getElementById('boardName').textContent = name;
	document.getElementById('empty').classList.add('hidden');
	if (first || opts.fit) fitView();
	updateUI(); redraw();
	console.log(`[silk-router] parsed ${name} in ${(performance.now() - t0).toFixed(0)} ms: ${B.edgeSegs.length} edge segs, ${B.pads.F.length} F pads, ${B.holes.length} holes`);
}
async function autoLoadBoard() {
	if (location.protocol.startsWith('http')) {
		try {
			const r = await fetch('../../snowflake.kicad_pcb', { cache: 'no-store' });
			if (r.ok) { setBoard(await r.text(), 'snowflake.kicad_pcb', { cache: false }); return; }
		} catch { /* fall through */ }
	}
	try {
		const c = JSON.parse(localStorage.getItem(LS_BOARD));
		if (c && c.text) { setBoard(c.text, c.name, { cache: false }); return; }
	} catch (err) { console.warn(err); }
	document.getElementById('empty').classList.remove('hidden');
	fitView();
}
function readFile(file) {
	const r = new FileReader();
	r.onload = () => {
		try {
			if (/\.json$/i.test(file.name)) loadProject(r.result);
			else { setBoard(r.result, file.name, { fit: true }); toast('Loaded ' + file.name); }
		} catch (err) { toast('Could not load ' + file.name + ': ' + err.message); console.error(err); }
	};
	r.readAsText(file);
}

// ---------------------------------------------------------------- UI wiring
let toastTimer = 0;
function toast(msg) {
	const t = document.getElementById('toast');
	t.textContent = msg; t.classList.add('show');
	clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
const WIDTHS = [0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.8];
const RINGS = [[0.8, 0.4], [1.0, 0.5], [1.3, 0.6], [1.6, 0.8], [2.0, 1.0], [0.8, 0]];
const THEMES = [
	['White / black', '#f6f6f3', '#141414', '#d6ae5a'],
	['Black / white', '#151515', '#f2f2f2', '#d6ae5a'],
	['Green / white', '#1f5b33', '#f2f2f2', '#c8c8c8'],
	['Blue / white', '#173a73', '#f2f2f2', '#d6ae5a'],
	['Purple / white', '#3d1f5c', '#f2f2f2', '#d6ae5a'],
];
function syncInputs() {
	document.querySelectorAll('[data-k]').forEach((el) => {
		const v = settings[el.dataset.k];
		if (el.type === 'checkbox') el.checked = !!v;
		else el.value = typeof v === 'number' ? +v.toFixed(4) : v;
	});
	document.querySelectorAll('#modeSeg [data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === settings.mode));
	document.querySelectorAll('#widthChips button').forEach((b) => b.classList.toggle('on', +b.dataset.v === settings.width));
	document.querySelectorAll('#ringChips button').forEach((b) => b.classList.toggle('on', b.dataset.v === settings.ringOD + '/' + settings.ringHole));
}
function settingChanged(k) {
	saveLocal();
	if (['side', 'avoidSilk', 'avoidCrt', 'crtIgnore', 'avoidCovPads'].includes(k)) { buildStaticIndex(); buildBoardPaths(); }
	if (['side', 'avoidSilk', 'avoidCrt', 'crtIgnore', 'avoidCovPads', 'clrArt', 'clrPad', 'clrEdge', 'clrCrt', 'mask', 'minFrag', 'showMasked', 'sym', 'symX', 'symY'].includes(k)) {
		buildDerived(); buildArtIndex(); buildArtPaths(); computeViolations();
	}
	needsRoute = true;
	syncInputs(); updateUI(); redraw();
}
function wireUI() {
	document.querySelectorAll('[data-k]').forEach((el) => {
		const k = el.dataset.k;
		const ev = el.type === 'color' ? 'input' : 'change';
		el.addEventListener(ev, () => {
			let v;
			if (el.type === 'checkbox') v = el.checked;
			else if (el.type === 'number' || el.hasAttribute('data-num')) { v = parseFloat(el.value); if (!isFinite(v)) return syncInputs(); }
			else v = el.value;
			settings[k] = v;
			settingChanged(k);
		});
	});
	const chips = (id, list, label, onClick, key) => {
		const box = document.getElementById(id);
		for (const item of list) {
			const b = document.createElement('button');
			b.textContent = label(item); b.dataset.v = key(item);
			b.addEventListener('click', () => onClick(item));
			box.appendChild(b);
		}
	};
	chips('widthChips', WIDTHS, (w) => w.toFixed(2), (w) => { settings.width = w; settingChanged('width'); }, (w) => w);
	chips('ringChips', RINGS, ([o, h]) => (h ? `${o}/${h}` : `dot ${o}`), ([o, h]) => { settings.ringOD = o; settings.ringHole = h; settingChanged('ring'); }, ([o, h]) => o + '/' + h);
	chips('themeChips', THEMES, (t) => t[0], (t) => { settings.pcbColor = t[1]; settings.silkColor = t[2]; settings.padColor = t[3]; settingChanged('theme'); }, (t) => t[0]);
	document.querySelectorAll('#modeSeg [data-mode]').forEach((b) => b.addEventListener('click', () => { settings.mode = b.dataset.mode; settingChanged('mode'); }));
	document.querySelectorAll('[data-center]').forEach((b) => b.addEventListener('click', () => {
		const c = board ? board.center : P(150, 150);
		if (b.dataset.center === 'grid') { settings.gridOX = c.x; settings.gridOY = c.y; settingChanged('gridOX'); }
		else { settings.symX = c.x; settings.symY = c.y; settingChanged('symX'); }
	}));
	document.querySelectorAll('[data-apply]').forEach((b) => b.addEventListener('click', () => {
		if (!sel.size) return toast('Select some art first (S)');
		pushUndo();
		for (const id of sel) {
			const it = itemById(id); if (!it) continue;
			if (b.dataset.apply === 'width' && it.a) it.w = settings.width;
			if (b.dataset.apply === 'ring' && it.c) { it.od = settings.ringOD; it.hole = settings.ringHole; }
		}
		docChanged();
	}));
	document.querySelectorAll('#tools [data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
	const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
	on('bFit', fitView);
	on('bUndo', undo); on('bRedo', redo);
	on('bSvg', exportSVG); on('bMod', exportKicadMod);
	on('bSave', saveProject);
	on('bOpen', () => document.getElementById('fileProject').click());
	on('bLoadBoard', () => document.getElementById('fileBoard').click());
	on('bLoadBoard2', () => document.getElementById('fileBoard').click());
	on('bBake', bakeSymmetry);
	on('bNew', () => {
		if (!doc.segs.length && !doc.rings.length) return;
		pushUndo(); doc.segs = []; doc.rings = []; sel.clear(); route = null; docChanged();
		toast('Cleared — ⌘Z to bring it back');
	});
	for (const id of ['fileBoard', 'fileProject']) {
		const inp = document.getElementById(id);
		inp.addEventListener('change', () => { if (inp.files[0]) readFile(inp.files[0]); inp.value = ''; });
	}
	const stage = document.getElementById('stage');
	stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('drag'); });
	stage.addEventListener('dragleave', () => stage.classList.remove('drag'));
	stage.addEventListener('drop', (e) => { e.preventDefault(); stage.classList.remove('drag'); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); });

	cv.tabIndex = 0;
	cv.addEventListener('mousemove', onMove);
	cv.addEventListener('mousedown', onDown);
	window.addEventListener('mouseup', onUp);
	window.addEventListener('mousemove', (e) => { if (pan || drag || box) onMove(e); });
	cv.addEventListener('mouseleave', () => { mouse.in = false; hover = null; redraw(); });
	cv.addEventListener('dblclick', () => { if (route) finishRoute(); });
	cv.addEventListener('contextmenu', (e) => e.preventDefault());
	cv.addEventListener('wheel', onWheel, { passive: false });
	window.addEventListener('keydown', onKey);
	window.addEventListener('keyup', onKeyUp);
	new ResizeObserver(resize).observe(cv.parentElement);
}
const HINTS = {
	select: 'Click to select · drag to move · drag empty space to box-select · R rotate · M mirror · U connected · Del delete',
	route: 'Click to start a trace',
	routing: 'Click to fix · / flip posture · V end in ring · ⌫ undo segment · double-click / Enter / Esc to finish',
	ring: 'Click to place a ring — snaps to trace ends',
};
function updateStatus() {
	const p = snap && tool !== 'select' ? snap.p : mouse.w;
	let s = `X ${p.x.toFixed(3)}  Y ${p.y.toFixed(3)}`;
	if (route && route.preview && route.preview.pts.length > 1) {
		const pts = route.preview.pts;
		let L = 0; for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
		s += `   Δ ${L.toFixed(2)} mm`;
		if (settings.mode === 'walk' && !route.preview.reached) s += '  (blocked)';
	}
	document.getElementById('stXY').textContent = s;
	document.getElementById('stZoom').textContent = `${(view.s).toFixed(1)} px/mm`;
	document.getElementById('stHint').textContent = route ? HINTS.routing : HINTS[tool];
}
function updateUI() {
	document.getElementById('bUndo').disabled = !hist.undo.length && !route;
	document.getElementById('bRedo').disabled = !hist.redo.length;
	document.getElementById('stCount').textContent = `${doc.segs.length} seg · ${doc.rings.length} ring` + (sel.size ? ` · ${sel.size} sel` : '');
	const v = document.getElementById('stViol');
	v.textContent = violations.size ? `${violations.size} clearance issue${violations.size > 1 ? 's' : ''}` : 'clearances OK';
	v.classList.toggle('bad', violations.size > 0);
	updateStatus();
}

// ---------------------------------------------------------------- boot
wireUI();
syncInputs();
setTool('route');
resize();
docChanged();
autoLoadBoard();
// Scripting API (browser console / automation): generate art procedurally with
// the same obstacle model the interactive router uses.
window.silkRouter = {
	get doc() { return doc; }, get settings() { return settings; }, get board() { return board; }, get route() { return route; },
	get violations() { return [...violations]; }, get clipped() { return clipped; },
	view, astar, computeHead, blocked, exportSVG, exportKicadMod, buildSVG, buildKicadMod, toWorld, toScreen, symMats, applyM,
	// Replace (or append to) the art; undoable. items: { segs: [{a, b, w}], rings: [{c, od, hole}] }
	setArt(items, { append = false } = {}) {
		if (route) route = null;
		pushUndo();
		if (!append) { doc.segs = []; doc.rings = []; }
		for (const s of items.segs || []) doc.segs.push({ id: newId(), a: P(s.a.x, s.a.y), b: P(s.b.x, s.b.y), w: s.w || settings.width });
		for (const r of items.rings || []) doc.rings.push({ id: newId(), c: P(r.c.x, r.c.y), od: r.od || settings.ringOD, hole: r.hole ?? settings.ringHole });
		sel.clear(); docChanged();
		return { segs: doc.segs.length, rings: doc.rings.length, violations: violations.size };
	},
	set(obj) { Object.assign(settings, obj); for (const k of Object.keys(obj)) settingChanged(k); },
	// Is a stroke of half-width h from a to b clear of board obstacles (edge, holes, pads,
	// silk, courtyards)? Pass { art: true } to also count existing art as an obstacle,
	// or { kinds: ['edge', 'hole', 'pad', 'silk', 'courtyard'] } to check only some kinds.
	clear(a, b, h, { art = false, kinds = null } = {}) {
		if (art) return !blocked(a, b, h, null);
		const want = kinds && new Set(kinds.map((n) => ({ edge: K_EDGE, hole: K_HOLE, pad: K_PAD, silk: K_SILK, courtyard: K_CRT })[n]));
		const clr = CLR(), m = h + maxClr();
		return !staticIdx.query(Math.min(a.x, b.x) - m, Math.min(a.y, b.y) - m, Math.max(a.x, b.x) + m, Math.max(a.y, b.y) + m,
			(o) => (!want || want.has(o.k)) && obsDist(o, a, b) < h + clr[o.k] - 1e-7);
	},
};
})();
