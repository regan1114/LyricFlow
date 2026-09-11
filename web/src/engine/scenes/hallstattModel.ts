import * as Astronomy from 'astronomy-engine';

// Photograph calibration from immersive-landscapes. World axes are east, north, up.
type Direction = [number, number, number];
export type HallstattMode = 'day' | 'night';
export interface TimeRange {
  start: number;
  end: number;
}
export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}
const radians = Math.PI / 180;
export const observer = new Astronomy.Observer(47.56462, 13.65002, 530.7);
const heading = 210 * radians;
const pitch = 5 * radians;
export const cameraForward: Direction = [
  Math.sin(heading) * Math.cos(pitch),
  Math.cos(heading) * Math.cos(pitch),
  Math.sin(pitch),
];
export const cameraRight: Direction = [Math.cos(heading), -Math.sin(heading), 0];
export const cameraUp: Direction = [
  -Math.sin(heading) * Math.sin(pitch),
  -Math.cos(heading) * Math.sin(pitch),
  Math.cos(pitch),
];
const skyline = [
  [0, 0.201],
  [0.03, 0.217],
  [0.06, 0.224],
  [0.08, 0.237],
  [0.1, 0.23],
  [0.12, 0.225],
  [0.14, 0.201],
  [0.16, 0.186],
  [0.18, 0.173],
  [0.21, 0.17],
  [0.23, 0.163],
  [0.243, 0.141],
  [0.251, 0.138],
  [0.265, 0.145],
  [0.28, 0.164],
  [0.3, 0.191],
  [0.315, 0.198],
  [0.337, 0.177],
  [0.36, 0.151],
  [0.385, 0.126],
  [0.407, 0.117],
  [0.418, 0.125],
  [0.439, 0.118],
  [0.468, 0.126],
  [0.479, 0.139],
  [0.493, 0.161],
  [0.51, 0.18],
  [0.533, 0.198],
  [0.547, 0.195],
  [0.568, 0.213],
  [0.592, 0.238],
  [0.62, 0.258],
  [0.637, 0.27],
  [0.65, 0.248],
  [0.663, 0.229],
  [0.68, 0.212],
  [0.695, 0.187],
  [0.705, 0.153],
  [0.717, 0.121],
  [0.733, 0.098],
  [0.749, 0.074],
  [0.765, 0.046],
  [0.788, 0.023],
  [0.815, 0],
  [1, 0],
];

function dot(first: number[], second: number[]) {
  return first.reduce((sum, value, index) => sum + value * second[index], 0);
}
function normalize(values: number[]) {
  const length = Math.hypot(...values);
  return values.map((value) => value / length);
}
function cross(first: number[], second: number[]): Direction {
  return [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0],
  ];
}
function direction(azimuth: number, altitude: number): Direction {
  const bearing = azimuth * radians;
  const elevation = altitude * radians;
  return [
    Math.sin(bearing) * Math.cos(elevation),
    Math.cos(bearing) * Math.cos(elevation),
    Math.sin(elevation),
  ];
}
export function ridge(x: number) {
  for (let index = 1; index < skyline.length; index++) {
    if (x <= skyline[index][0]) {
      const [startX, startY] = skyline[index - 1];
      const [endX, endY] = skyline[index];
      return startY + ((endY - startY) * (x - startX)) / (endX - startX);
    }
  }
  return 0;
}
function position(body: Astronomy.Body, date: Date) {
  const equator = Astronomy.Equator(body, date, observer, true, true);
  const horizon = Astronomy.Horizon(date, observer, equator.ra, equator.dec, 'normal');
  const vector = direction(horizon.azimuth, horizon.altitude);
  const depth = dot(vector, cameraForward);
  const projected = {
    x: 0.5 + dot(vector, cameraRight) / (1.5 * depth),
    y: 0.5 - dot(vector, cameraUp) / depth,
    depth,
  };
  const status =
    horizon.altitude <= 0
      ? 'horizon'
      : depth <= 0 || projected.x < 0 || projected.x > 1
        ? 'outside'
        : projected.y >= ridge(projected.x)
          ? 'mountain'
          : projected.y < 0
            ? 'outside'
            : 'visible';
  return { ...horizon, vector, projected, status };
}

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Vienna',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const clockFormatter = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Europe/Vienna',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
function dateKey(date: Date) {
  const parts = Object.fromEntries(
    dateFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '2100-12-31')
    return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function localMidnight(key: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Vienna',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const target = Date.parse(`${key}T00:00:00Z`);
  let result = target;
  for (let index = 0; index < 3; index++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(result)).map((part) => [part.type, part.value]),
    );
    result +=
      target -
      Date.UTC(
        +parts.year,
        +parts.month - 1,
        +parts.day,
        +parts.hour,
        +parts.minute,
        +parts.second,
      );
  }
  return new Date(result);
}
export function makeRange(mode: HallstattMode, date: string): TimeRange {
  const midnight = localMidnight(date);
  const altitude = mode === 'day' ? 0 : -0.833;
  const rising = mode === 'day' ? 1 : -1;
  const start = Astronomy.SearchAltitude(
    Astronomy.Body.Sun,
    observer,
    rising,
    midnight,
    1,
    altitude,
  );
  if (!start) throw new Error('找不到此日期的日夜時段。');
  const end = Astronomy.SearchAltitude(
    Astronomy.Body.Sun,
    observer,
    -rising,
    start.date,
    1,
    altitude,
  );
  if (!end) throw new Error('找不到此日期的日夜時段。');
  return { start: start.date.getTime(), end: end.date.getTime() };
}
export function phaseNight(angle: number, anchor: string) {
  const start = new Date(localMidnight(anchor).getTime() - 16 * 86400000);
  const event = Astronomy.SearchMoonPhase(angle, start, 35);
  if (!event) throw new Error('找不到指定月相的日期。');
  return dateKey(new Date(event.date.getTime() - 12 * 3600000));
}
export function viewport(width: number, height: number): Viewport {
  const scale = Math.max(width / 1.5, height);
  const visibleWidth = width / (scale * 1.5);
  const visibleHeight = height / scale;
  return {
    x: (1 - visibleWidth) * 0.42,
    y: (1 - visibleHeight) * 0.35,
    width: visibleWidth,
    height: visibleHeight,
  };
}
export function ephemeris(mode: HallstattMode, range: TimeRange, progress: number) {
  const date = new Date(
    range.start + (range.end - range.start) * Math.max(0, Math.min(1, progress)),
  );
  const sun = position(Astronomy.Body.Sun, date);
  const moon = position(Astronomy.Body.Moon, date);
  const tangentRight = normalize(
    cameraRight.map((value, index) => value - dot(cameraRight, moon.vector) * moon.vector[index]),
  );
  const tangentUp = normalize(cross(tangentRight, moon.vector));
  const moonLight = [
    dot(sun.vector, tangentRight),
    dot(sun.vector, tangentUp),
    -dot(sun.vector, moon.vector),
  ];
  const pole = Astronomy.RotationAxis(Astronomy.Body.Moon, date).north;
  const equatorPole = Astronomy.EquatorFromVector(
    Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(date), pole),
  );
  const poleHorizon = Astronomy.Horizon(date, observer, equatorPole.ra, equatorPole.dec);
  const poleDirection = direction(poleHorizon.azimuth, poleHorizon.altitude);
  const libration = Astronomy.Libration(date);
  return {
    sun,
    moon,
    moonLight,
    tangentRight,
    tangentUp,
    body: mode === 'day' ? sun : moon,
    illumination: Astronomy.Illumination(Astronomy.Body.Moon, date).phase_fraction,
    moonSurface: {
      north: normalize([dot(poleDirection, tangentRight), dot(poleDirection, tangentUp)]),
      libration: [libration.elon * radians, libration.elat * radians],
      radius: (libration.diam_deg * radians) / 2,
    },
    clock: clockFormatter.format(date),
    dateLabel: dateKey(date),
  };
}
export function viewportStatus(body: ReturnType<typeof position>, view: Viewport) {
  if (body.status !== 'visible') return body.status;
  const projected = body.projected;
  return projected.x < view.x ||
    projected.x > view.x + view.width ||
    projected.y < view.y ||
    projected.y > view.y + view.height
    ? 'outside'
    : 'visible';
}
export function bestProgress(mode: HallstattMode, range: TimeRange, view: Viewport) {
  let longest: number[] = [];
  let current: number[] = [];
  for (let index = 0; index <= 120; index++) {
    const progress = index / 120;
    const date = new Date(range.start + (range.end - range.start) * progress);
    const body = position(mode === 'day' ? Astronomy.Body.Sun : Astronomy.Body.Moon, date);
    if (viewportStatus(body, view) === 'visible') {
      current.push(progress);
      if (current.length > longest.length) longest = [...current];
    } else current = [];
  }
  return longest.length ? longest[Math.floor(longest.length / 2)] : null;
}
