import assert from 'node:assert/strict';
import { parseTime, formatTime, validateRows, makeSrt } from '../web/subtitles.mjs';

assert.equal(parseTime('01:25.300'), 85.3);
assert.equal(parseTime('01:49.020'), 109.02);
assert.equal(parseTime('01:02:03,045'), 3723.045);
assert.equal(parseTime('25.3'), 25.3);
assert.equal(parseTime(''), null);
for (const bad of ['NaN', '-1', '00:61', '1:90:00', 'x', '2.3456'])
  assert.ok(Number.isNaN(parseTime(bad)), bad);
assert.equal(formatTime(59.9996, true), '00:01:00,000');
const rows = [
  { text: '清晨的微風', start: 1, end: 3 },
  { text: '窗邊的樹影', start: 3, end: 5 },
];
assert.equal(validateRows(rows, 10).size, 0);
assert.ok(makeSrt(rows, 10).includes('00:00:03,000 --> 00:00:05,000\n窗邊的樹影'));
assert.throws(() => makeSrt([{ text: '重疊', start: 0, end: 4 }, ...rows], 10), /重疊/);
assert.throws(() => makeSrt([{ text: '超出歌曲', start: 9, end: 12 }], 10), /不可超過/);
assert.throws(() => makeSrt([{ text: '缺少結束', start: 1, end: null }], 10), /完整/);
assert.throws(() => makeSrt([{ text: '無效', start: NaN, end: 3 }], 10), /完整/);
assert.equal(
  makeSrt([...rows, { text: '尚未定位', start: null, end: null }], 10).includes('尚未定位'),
  false,
);
rows[0].start = 1.234;
assert.ok(makeSrt(rows, 10).includes('00:00:01,234'));
console.log('PASS: time parsing, edited export, overlap, missing and invalid timestamps.');
