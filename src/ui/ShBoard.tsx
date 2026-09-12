import { Eye, Repeat, Search, Skull } from 'lucide-react';
import {
  powerForSlot,
  shRoleCounts,
  vetoUnlocked,
  type Power,
} from '../game/secret-hitler/logic';
import type { SHPublic } from '../net/transport';
import policyFascist from '../assets/policy-fascist.png';
import policyLiberal from '../assets/policy-liberal.png';

export function PowerGlyph({ power }: { power: Power | null }) {
  if (!power) return null;
  const Icon = power === 'investigate' ? Search : power === 'special' ? Repeat : power === 'peek' ? Eye : Skull;
  return <Icon size={32} className="sh-gold" strokeWidth={1.8} />;
}

/**
 * Center-stage board: original art direction (teal liberal / orange
 * fascist bands, Cinzel headers, dotted empty slots, power glyphs), all
 * live state — enacted slots fill with policy art, powers follow the
 * player count. Replaces the old tile rows.
 */
export function SHBoard({ sh }: { sh: SHPublic }) {
  let dist: { liberals: number; fascists: number } | null = null;
  try {
    dist = shRoleCounts(sh.players.length);
  } catch {
    /* lobby NUC */
  }
  return (
    <section aria-label="Game board" className="space-y-2">
      {/* piles + distribution strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/60">
        <span className="font-bold uppercase tracking-widest">
          Draw <span className="font-mono text-sm text-white">{sh.drawCount}</span>
        </span>
        <span className="font-bold uppercase tracking-widest">
          Discard <span className="font-mono text-sm text-white">{sh.discCount}</span>
        </span>
        {dist && (
          <span>
            <span style={{ color: '#0E7E96' }}>{dist.liberals} Liberal</span>
            {' · '}
            <span style={{ color: '#C74E1D' }}>{dist.fascists - 1} Fascist · 1 Hitler</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <span className="font-bold uppercase tracking-widest">Tracker</span>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2.5 w-2.5 rounded-full border"
              style={i < sh.tracker
                ? { background: '#F26838', borderColor: '#F26838' }
                : { borderColor: 'rgba(43,33,24,0.35)' }}
            />
          ))}
          {vetoUnlocked(sh.fasTrack) && (
            <span className="sh-gold text-[11px] font-extrabold tracking-widest">· VETO LIVE</span>
          )}
        </span>
      </div>

      {/* liberal band */}
      <div
        className="rounded-xl border-2 p-3 sm:p-4"
        style={{
          borderColor: '#0E7E96',
          background: 'linear-gradient(165deg, #0d5a6e 0%, #0F95B0 55%, #0d5a6e 100%)',
          boxShadow: 'inset 0 0 0 1px rgba(246,244,231,0.25), 0 10px 30px rgba(11,110,131,0.35)',
        }}
      >
        <div className="font-display mb-2 text-center text-xl tracking-[0.2em] text-[#f6f4e7]">
          LIBERAL {sh.libTrack}/5
        </div>
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex aspect-[2/3] items-center justify-center overflow-hidden rounded-md border-2 border-dashed"
              style={i < sh.libTrack
                ? { borderStyle: 'solid', borderColor: '#f6f4e7', background: '#E7F4F7' }
                : { borderColor: 'rgba(246,244,231,0.5)', background: 'rgba(246,244,231,0.08)' }}
            >
              {i < sh.libTrack ? (
                <img src={policyLiberal} alt="Liberal policy enacted" className="h-full w-full object-contain" draggable={false} />
              ) : (
                <span className="h-3 w-3 rounded-full border-2 border-dashed" style={{ borderColor: 'rgba(246,244,231,0.5)' }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* fascist band */}
      <div
        className="rounded-xl border-2 p-3 sm:p-4"
        style={{
          borderColor: '#C74E1D',
          background: 'linear-gradient(165deg, #8f3413 0%, #F26838 55%, #8f3413 100%)',
          boxShadow: 'inset 0 0 0 1px rgba(246,244,231,0.25), 0 10px 30px rgba(184,69,26,0.35)',
        }}
      >
        <div className="font-display mb-2 text-center text-xl tracking-[0.2em] text-[#f6f4e7]">
          FASCIST {sh.fasTrack}/6
        </div>
        <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
          {Array.from({ length: 6 }).map((_, i) => {
            const filled = i < sh.fasTrack;
            const power = powerForSlot(sh.players.length, i + 1);
            return (
              <div
                key={i}
                className="flex aspect-[2/3] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md border-2 border-dashed"
                style={filled
                  ? { borderStyle: 'solid', borderColor: '#f6f4e7', background: '#FDEEE4' }
                  : { borderColor: 'rgba(246,244,231,0.5)', background: 'rgba(246,244,231,0.08)' }}
              >
                {filled ? (
                  <img src={policyFascist} alt="Fascist policy enacted" className="h-full w-full object-contain" draggable={false} />
                ) : (
                  <>
                    <span className="text-[11px] font-extrabold text-[#f6f4e7]/80">{i + 1}</span>
                    <span className="[&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-[#f6f4e7]/90 sm:[&_svg]:h-7 sm:[&_svg]:w-7">
                      <PowerGlyph power={power} />
                    </span>
                    {i === 4 && (
                      <span className="text-[10px] font-extrabold tracking-widest text-[#f6f4e7]">VETO</span>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {sh.pendingPower && (
        <div className="sh-gold text-xs font-bold uppercase">Power: {sh.pendingPower}</div>
      )}
    </section>
  );
}
