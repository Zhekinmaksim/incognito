import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import portraitModule from '../../site/game/portraits.js';
import {ACTS, C, cast, FPS} from './theme';

const portraits = portraitModule as unknown as Record<string, string>;

const mono: React.CSSProperties = {
  fontFamily: '"Courier New", monospace',
  letterSpacing: 5,
  textTransform: 'uppercase',
};

const display: React.CSSProperties = {
  fontFamily: 'Impact, "Arial Narrow", sans-serif',
  letterSpacing: 2,
  textTransform: 'uppercase',
};

function Grain() {
  return <div style={{position: 'absolute', inset: 0, opacity: 0.09, mixBlendMode: 'screen', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'180\' height=\'180\'%3E%3Cfilter id=\'n\'><feTurbulence baseFrequency=\'.85\' numOctaves=\'4\'/></filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/></svg>")'}} />;
}

function Frame({children, accent = false}: {children: React.ReactNode; accent?: boolean}) {
  return <AbsoluteFill style={{background: C.ink, color: C.paper, overflow: 'hidden'}}>
    <div style={{position: 'absolute', inset: 54, border: `1px solid ${C.line}`}} />
    <div style={{position: 'absolute', top: 82, left: 96, ...mono, color: C.dim, fontSize: 16}}>INCOGNITO / BASE SEPOLIA</div>
    <div style={{position: 'absolute', top: 82, right: 96, ...mono, color: accent ? C.gold : C.dim, fontSize: 16}}>CONFIDENTIAL TABLE 01</div>
    {children}
    <Grain />
  </AbsoluteFill>;
}

function Portrait({name, index, active = false}: {name: string; index: number; active?: boolean}) {
  const frame = useCurrentFrame();
  const scale = spring({frame, fps: FPS, config: {damping: 18, stiffness: 90}, durationInFrames: 22, delay: index * 4});
  return <div style={{width: 220, textAlign: 'center', transform: `translateY(${interpolate(scale, [0, 1], [35, 0])}px)`, opacity: interpolate(scale, [0, 1], [0, 1])}}>
    <div style={{height: 220, border: `2px solid ${active ? C.gold : C.line}`, background: '#171310', padding: 10, boxShadow: active ? `0 0 40px ${C.gold}55` : 'none'}}>
      <Img src={portraits[name]} style={{width: '100%', height: '100%', objectFit: 'cover', filter: active ? 'sepia(.35) contrast(1.15)' : 'grayscale(.75) contrast(1.1)'}} />
    </div>
    <div style={{...mono, color: active ? C.gold : C.body, fontSize: 15, marginTop: 16}}>{name}</div>
  </div>;
}

function ColdOpen() {
  const frame = useCurrentFrame();
  const wordOpacity = interpolate(frame, [30, 78], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const lamp = interpolate(frame, [0, 30, 55], [0, 0.12, 0.9], {extrapolateRight: 'clamp'});
  return <Frame accent>
    <div style={{position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 35%, rgba(201,154,46,${lamp}), transparent 48%)`}} />
    <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: wordOpacity}}>
      <div style={{...display, fontSize: 190, lineHeight: .8}}><span style={{color: C.gold}}>INCO</span><span>GNITO</span></div>
      <div style={{fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 30, marginTop: 36, color: C.body}}>everyone knows who you are. Except you.</div>
      <div style={{...mono, color: C.dim, fontSize: 16, marginTop: 86}}>A PRIVATE GAME FOR PUBLIC EYES</div>
    </div>
  </Frame>;
}

function Deal() {
  const frame = useCurrentFrame();
  const title = interpolate(frame, [0, 24], [0, 1], {extrapolateRight: 'clamp'});
  return <Frame>
    <div style={{position: 'absolute', left: 130, top: 220, opacity: title}}>
      <div style={{...mono, color: C.gold, fontSize: 17}}>ACT I / THE ROOM</div>
      <div style={{...display, fontSize: 94, lineHeight: .9, marginTop: 20}}>Five seats.<br/><span style={{color: C.gold}}>Zero certainty.</span></div>
    </div>
    <div style={{position: 'absolute', left: 130, right: 130, bottom: 150, display: 'flex', justifyContent: 'space-between'}}>
      {cast.map((name, i) => <Portrait key={name} name={name} index={i} active={i === 0} />)}
    </div>
  </Frame>;
}

function Question() {
  const frame = useCurrentFrame();
  const sweep = interpolate(frame, [0, 130], [0, 4], {extrapolateRight: 'clamp'});
  const names = ['Kestrel', 'Magpie', 'Shrike', 'Cormorant', 'Jackdaw'];
  return <Frame accent>
    <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
      <div style={{...mono, color: C.gold, fontSize: 17}}>Kestrel asks</div>
      <div style={{...display, fontSize: 108, lineHeight: .9, textAlign: 'center', maxWidth: 1300, marginTop: 24}}>Who is<br/><span style={{color: C.gold}}>lying?</span></div>
      <div style={{display: 'flex', gap: 34, marginTop: 72}}>{names.map((name, i) => <div key={name} style={{width: 165, opacity: i === Math.round(sweep) ? 1 : .35, transform: i === Math.round(sweep) ? 'scale(1.08)' : 'scale(1)', transition: 'transform .1s linear'}}><div style={{height: 165, border: `2px solid ${i === Math.round(sweep) ? C.gold : C.line}`, padding: 8}}><Img src={portraits[name]} style={{width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(.9)'}} /></div><div style={{...mono, fontSize: 13, marginTop: 12, color: i === Math.round(sweep) ? C.gold : C.dim}}>{name}</div></div>)}</div>
    </div>
  </Frame>;
}

function Freeze() {
  const frame = useCurrentFrame();
  const count = interpolate(frame, [0, 70], [12, 2.9], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <Frame>
    <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
      <div style={{...mono, color: C.dim, fontSize: 18}}>THE ROOM HOLDS ITS BREATH</div>
      <div style={{display: 'flex', gap: 28, marginTop: 48}}>{cast.slice(1).map((name, i) => <Portrait key={name} name={name} index={i} active={i === 1} />)}</div>
      <div style={{...display, fontSize: 138, color: C.gold, marginTop: 58, lineHeight: .8}}>{count.toFixed(1)}<span style={{fontFamily: 'Georgia, serif', fontSize: 34, color: C.body}}> seconds</span></div>
    </div>
  </Frame>;
}

function NoCard() {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [0, 10, 24], [-20, 0, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <Frame accent><div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}><div style={{...display, fontSize: 360, color: C.paper, transform: `translateX(${x}px)`, lineHeight: .8}}>NO<span style={{color: C.blood}}>.</span></div><div style={{position: 'absolute', width: 1480, height: 24, background: C.blood, transform: 'rotate(-7deg)'}} /></div></Frame>;
}

function Verdict() {
  const frame = useCurrentFrame();
  const reveal = interpolate(frame, [0, 34], [0, 1], {extrapolateRight: 'clamp'});
  return <Frame>
    <div style={{position: 'absolute', left: 150, top: 210, ...mono, color: C.gold, fontSize: 18}}>ACCESS LEDGER / SETTLED</div>
    <div style={{position: 'absolute', left: 150, top: 280, ...display, fontSize: 94, lineHeight: .9}}>The truth is<br/><span style={{color: C.gold}}>selective.</span></div>
    <div style={{position: 'absolute', left: 150, right: 150, bottom: 170, opacity: reveal}}>
      {['Kestrel  —  card read  —  GRANTED', 'Magpie   —  card read  —  GRANTED', 'Shrike   —  accusation  —  DENIED', 'Jackdaw  —  card read  —  GRANTED'].map((line, i) => <div key={line} style={{borderTop: `1px solid ${C.line}`, padding: '18px 0', ...mono, fontSize: 22, color: i === 2 ? C.blood : C.body}}>{line}</div>)}
    </div>
  </Frame>;
}

function End() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 24], [0, 1], {extrapolateRight: 'clamp'});
  return <Frame accent><div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity}}><div style={{...display, fontSize: 172, lineHeight: .8}}><span style={{color: C.gold}}>INCO</span>GNITO</div><div style={{...mono, color: C.paper, fontSize: 24, marginTop: 60}}>incognito-sage-seven.vercel.app</div><div style={{height: 1, width: 500, background: C.gold, marginTop: 34}} /><div style={{...mono, color: C.dim, fontSize: 16, marginTop: 24}}>BUILT FOR THE INCO SUMMER GAME JAM</div></div></Frame>;
}

export const Film: React.FC = () => {
  return <AbsoluteFill style={{background: C.ink}}>
    <Audio src={staticFile('incognito-theme.mp3')} startFrom={41 * FPS} volume={0.34} />
    <Sequence from={ACTS.coldOpen[0]} durationInFrames={ACTS.coldOpen[1] - ACTS.coldOpen[0]}><ColdOpen /></Sequence>
    <Sequence from={ACTS.deal[0]} durationInFrames={ACTS.deal[1] - ACTS.deal[0]}><Deal /></Sequence>
    <Sequence from={ACTS.question[0]} durationInFrames={ACTS.question[1] - ACTS.question[0]}><Question /></Sequence>
    <Sequence from={ACTS.freeze[0]} durationInFrames={ACTS.freeze[1] - ACTS.freeze[0]}><Freeze /></Sequence>
    <Sequence from={ACTS.no[0]} durationInFrames={ACTS.no[1] - ACTS.no[0]}><NoCard /></Sequence>
    <Sequence from={ACTS.verdict[0]} durationInFrames={ACTS.verdict[1] - ACTS.verdict[0]}><Verdict /></Sequence>
    <Sequence from={ACTS.end[0]} durationInFrames={ACTS.end[1] - ACTS.end[0]}><End /></Sequence>
  </AbsoluteFill>;
};
