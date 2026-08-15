import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const errors = [];
const ok = condition => condition || errors.push(ok.message);
const text = path => readFileSync(resolve(root, path), 'utf8');

const required = [
  'README.md', 'LICENSE', 'package.json', 'package-lock.json',
  'contracts/Incognito.sol', 'site/index.html', 'site/play.html',
  'site/favicon.svg', 'site/og-card.png', 'site/site.webmanifest',
  'vercel.json', 'fly.toml', 'Dockerfile',
  'remotion/src/Film.tsx',
];
for (const path of required) {
  ok.message = `missing required file: ${path}`;
  ok(existsSync(resolve(root, path)));
}

const contractAddress = '0x9Abd9714FdF0f10967C4e028EdB40af4de827456';
for (const path of ['README.md', 'DEPLOY.md', 'site/play.html']) {
  ok.message = `${path} does not reference the current contract`;
  ok(text(path).includes(contractAddress));
}

const pkg = JSON.parse(text('package.json'));
ok.message = 'package.json license must be MIT';
ok(pkg.license === 'MIT');
ok.message = 'LICENSE must contain the standard MIT grant';
ok(text('LICENSE').includes('Permission is hereby granted, free of charge'));
for (const name of ['@inco/lightning', '@inco/lightning-js']) {
  ok.message = `${name} must be pinned to 1.0.0`;
  ok(pkg.dependencies?.[name] === '1.0.0');
}

ok.message = 'contract must import the Base Sepolia hackathon Lib.sol path';
ok(text('contracts/Incognito.sol').includes('@inco/lightning/src/Lib.sol'));
for (const path of ['site/play.html', 'keeper/keeper.js']) {
  ok.message = `${path} must use Lightning.baseSepoliaTestnet()`;
  ok(text(path).includes('baseSepoliaTestnet('));
}

for (const path of ['site/index.html', 'site/play.html']) {
  const page = text(path);
  for (const token of ['rel="icon"', 'property="og:image"', 'name="twitter:card"', 'rel="canonical"']) {
    ok.message = `${path} is missing ${token}`;
    ok(page.includes(token));
  }
  ok.message = `${path} must use the production domain in social metadata`;
  ok(page.includes('https://playincognito.xyz/'));
}

const landing = text('site/index.html');
ok.message = 'site/index.html must not embed base64 images';
ok(!/data:image\/[^;]+;base64,/i.test(landing));
for (const [, asset] of landing.matchAll(/src="(assets\/[^\"]+)"/g)) {
  ok.message = `site/index.html references a missing asset: site/${asset}`;
  ok(existsSync(resolve(root, 'site', asset)));
}

const png = readFileSync(resolve(root, 'site/og-card.png'));
ok.message = 'site/og-card.png is not a PNG';
ok(png.subarray(1, 4).toString() === 'PNG');
ok.message = 'site/og-card.png must be exactly 1200x630';
ok(png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630);

for (const path of ['bots.js', 'chain.js', 'iface.js', 'portraits.js', 'rules.js', 'session.js', 'simulate.js', 'table.js']) {
  ok.message = `game/${path} and site/game/${path} have drifted apart`;
  ok(readFileSync(resolve(root, 'game', path)).equals(readFileSync(resolve(root, 'site/game', path))));
}

const tracked = execFileSync('git', ['ls-files'], {cwd: root, encoding: 'utf8'}).trim().split('\n');
ok.message = '.env must never be tracked';
ok(!tracked.includes('.env'));

const executableText = tracked
  .filter(path => path !== 'scripts/hackathon-check.mjs' && /\.(?:html|js|mjs|ts|tsx|sol)$/.test(path))
  .map(path => text(path))
  .join('\n');
for (const stale of ['Lib.testnet.sol', "Lightning.latest('testnet', 84532)", 'incognito-sage-seven.vercel.app']) {
  ok.message = `stale submission value remains in executable files: ${stale}`;
  ok(!executableText.includes(stale));
}

if (errors.length) {
  console.error(`Hackathon check failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Hackathon check passed: ${required.length} required files, social metadata, Inco setup, contract address, asset dimensions, module parity, and secret tracking.`);
