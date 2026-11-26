// Gera ilustrações PNG simples (silhuetas de roupas sobre um degradê) para os dados de
// demonstração, sem dependências nem imagens externas.
const zlib = require('zlib');

const WIDTH = 640;
const HEIGHT = 480;

// Contornos em coordenadas de 0 a 1, desenhados em um quadrado centralizado.
const SHAPES = {
  Camisetas: [[0.30, 0.20], [0.42, 0.15], [0.58, 0.15], [0.70, 0.20], [0.85, 0.35], [0.76, 0.44], [0.68, 0.38], [0.68, 0.85], [0.32, 0.85], [0.32, 0.38], [0.24, 0.44], [0.15, 0.35]],
  Casacos: [[0.30, 0.15], [0.42, 0.10], [0.58, 0.10], [0.70, 0.15], [0.82, 0.30], [0.86, 0.80], [0.76, 0.80], [0.70, 0.40], [0.70, 0.90], [0.30, 0.90], [0.30, 0.40], [0.24, 0.80], [0.14, 0.80], [0.18, 0.30]],
  Calças: [[0.32, 0.12], [0.68, 0.12], [0.72, 0.90], [0.56, 0.90], [0.50, 0.40], [0.44, 0.90], [0.28, 0.90]],
  Vestidos: [[0.40, 0.10], [0.60, 0.10], [0.62, 0.35], [0.78, 0.90], [0.22, 0.90], [0.38, 0.35]],
  Calçados: [[0.18, 0.50], [0.40, 0.50], [0.48, 0.60], [0.80, 0.66], [0.84, 0.78], [0.18, 0.78]],
  Outros: [[0.22, 0.30], [0.78, 0.30], [0.78, 0.42], [0.62, 0.42], [0.62, 0.82], [0.50, 0.82], [0.50, 0.42], [0.22, 0.42]]
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8; // bits por canal
  header[9] = 2; // RGB
  const rows = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    pixels.copy(rows, y * (WIDTH * 3 + 1) + 1, y * WIDTH * 3, (y + 1) * WIDTH * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function hex(color) {
  return [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
}

function mix(from, to, amount) {
  return from.map((value, index) => Math.round(value + (to[index] - value) * amount));
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function render(top, bottom, paint) {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);
  const start = hex(top);
  const end = hex(bottom);
  for (let y = 0; y < HEIGHT; y += 1) {
    const background = mix(start, end, y / (HEIGHT - 1));
    for (let x = 0; x < WIDTH; x += 1) {
      const color = paint(x, y) || background;
      pixels.set(color, (y * WIDTH + x) * 3);
    }
  }
  return `data:image/png;base64,${encodePng(pixels).toString('base64')}`;
}

// Peça de roupa: silhueta clara com uma sombra suave, no formato da categoria.
function garment(category, { top, bottom, fill }) {
  const size = HEIGHT * 0.9;
  const left = (WIDTH - size) / 2;
  const offset = (HEIGHT - size) / 2;
  const points = (SHAPES[category] || SHAPES.Outros).map(([x, y]) => [left + x * size, offset + y * size]);
  const shadow = points.map(([x, y]) => [x + 10, y + 12]);
  const fillColor = hex(fill);
  const shadowColor = mix(hex(bottom), [0, 0, 0], 0.25);
  return render(top, bottom, (x, y) => {
    if (insidePolygon(x, y, points)) return fillColor;
    if (insidePolygon(x, y, shadow)) return shadowColor;
    return null;
  });
}

// Banner de atividade: degradê com círculos coloridos.
function banner({ top, bottom, dots }) {
  const circles = dots.map(([x, y, radius, color]) => [x * WIDTH, y * HEIGHT, radius, hex(color)]);
  return render(top, bottom, (x, y) => {
    for (const [cx, cy, radius, color] of circles) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) return color;
    }
    return null;
  });
}

module.exports = { banner, garment };
