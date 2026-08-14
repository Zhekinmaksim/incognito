// Drive the interactive session as if a competent human were clicking.
import { createSession, PHASE } from '../game/session.js';
import { AGENTS, bestQuery, candidates } from '../game/rules.js';

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

let wins=0, losses=0, turns=0, accusations=0, caught=0, crashed=0;
for (let seed=1; seed<=300; seed++){
  try{
    const rng = mulberry32(seed);
    const s = createSession({ rng });
    let guard=0;
    while (s.state.phase !== PHASE.OVER && guard++ < 40){
      if (s.state.phase === PHASE.ASK && s.state.turn === 0){
        const cands = s.yourCandidates(0).length ? s.yourCandidates(0) : s.yourCandidates(1);
        if (cands.length === 1){ s.declare(cands[0]); continue; }
        // call a liar if an answer to me looks slow and I have a glass
        const suspect = s.yourAnswers().find(a=>!a.audited && a.elapsed>=4);
        if (suspect && s.state.glasses>0 && rng()<0.5){ accusations++; const r=s.accuse(suspect.id); if(r.wasLie) caught++; }
        if (s.state.phase === PHASE.OVER) break;
        const q = bestQuery(cands, s.yourAnswers());
        const r = s.ask(q.queryMask, q.modeAll);
        if (!r.ok) break;
        s.settleAnswer();
        s.runBots();
      } else if (s.state.phase === PHASE.RESPOND){
        const p = s.pendingForYou();
        // a plausible human: mostly honest, lies when the truth would finish them
        const lie = rng() < 0.25;
        s.respond(lie ? !p.honest : p.honest, 1 + Math.floor(rng()*4));
      } else { s.runBots(); }
    }
    turns += guard;
    if (s.state.winner === 0) wins++; else losses++;
  } catch(e){ crashed++; if(crashed<3) console.log('crash seed',seed,e.message); }
}
console.log(`games 300  crashed ${crashed}`);
console.log(`you won ${wins}  lost ${losses}  (${(wins/300*100).toFixed(0)}%)`);
console.log(`avg your turns ${(turns/300).toFixed(1)}`);
console.log(`your accusations ${accusations}, right ${caught} (${accusations?(caught/accusations*100).toFixed(0):0}%)`);
