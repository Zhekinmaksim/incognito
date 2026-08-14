export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION = 900;

export const ACTS = {
  coldOpen: [0, 120],
  deal: [120, 260],
  question: [260, 420],
  freeze: [420, 600],
  no: [600, 680],
  verdict: [680, 820],
  end: [820, 900],
} as const;

export const C = {
  ink: '#080706',
  paper: '#e2d8c4',
  body: '#a89f8b',
  dim: '#6e675a',
  gold: '#c99a2e',
  blood: '#9a1e16',
  line: 'rgba(226,216,196,.16)',
};

export const cast = ['Kestrel', 'Magpie', 'Shrike', 'Cormorant', 'Jackdaw'];
