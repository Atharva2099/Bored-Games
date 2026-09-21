import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Coins,
  Crown,
  Flame,
  Radio,
  Rocket,
  Shield,
  Zap,
} from 'lucide-react';
import {
  CIVILIZATIONS,
  RESOURCES_PER_SEAT,
  confirmBid,
  dismissEventAndNextRound,
  executeAction,
  executeEventChoice,
  finalizeContributions,
  initDoomedState,
  resolveDoomsday,
  submitContribution,
  type DoomedState,
  type StandardAction,
} from '../game/doomed/logic';
import type { Player } from '../net/presence';
import type { DoomedActMsg, DoomedPublic, RoomHandle } from '../net/transport';
import { PreDeal } from './PreDeal';
import { Modal, PickCard, ModalConfirm } from './Modal';
import { Collapse } from './Collapse';
import { InvitePanel } from './Invite';

function getClient(): string {
  try {
    return localStorage.getItem('bg-client') ?? '';
  } catch {
    return '';
  }
}

interface Props {
  handle: RoomHandle;
  roomCode: string;
  name: string;
  isHost: boolean;
  initialRoster: Player[];
  onExit: () => void;
  onAddBot: () => void;
  onRemoveBot: (peerId: string) => void;
  resetToken: number;
}

export default function Doomed({
  handle,
  roomCode,
  isHost,
  initialRoster,
  onExit,
  onAddBot,
  onRemoveBot,
  resetToken,
}: Props) {
  const selfId = handle.selfId;
  const clientId = getClient();
  const [pub, setPub] = useState<DoomedPublic | null>(() => {
    try {
      const s = JSON.parse(localStorage.getItem(`bg-doomed-${roomCode}`) ?? 'null');
      if (s && s.phase) return s as DoomedPublic;
    } catch {
      /* ignore */
    }
    return null;
  });

  const stateRef = useRef<DoomedState | null>(null);
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;
  const liveRoster = useRef<Player[]>(initialRoster);
  liveRoster.current = initialRoster;

  // Modals
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<StandardAction | null>(null);
  const [targetLeaderId, setTargetLeaderId] = useState<string | null>(null);

  const [contributeModalOpen, setContributeModalOpen] = useState(false);
  const [pledgeAmt, setPledgeAmt] = useState<number>(0);
  const [eventModalDismissed, setEventModalDismissed] = useState(false);

  // Reset event dismiss state on new event
  useEffect(() => {
    if (pub?.phase === 'event') {
      setEventModalDismissed(false);
    }
  }, [pub?.roundNumber, pub?.phase]);

  useEffect(() => {
    stateRef.current = null;
    setPub(null);
    try {
      localStorage.removeItem(`bg-doomed-${roomCode}`);
    } catch {
      /* ignore */
    }
  }, [resetToken, roomCode]);

  const sendersRef = useRef<{
    pub: (d: Record<string, unknown>, target?: string) => void;
    act: (d: Record<string, unknown>, target?: string) => void;
  } | null>(null);

  const syncState = (st: DoomedState) => {
    const pubData: DoomedPublic = {
      phase: st.phase,
      players: st.players,
      order: st.order,
      turnIndex: st.turnIndex,
      firstPlayerId: st.firstPlayerId,
      rocketResources: st.rocketResources,
      seatsBuilt: st.seatsBuilt,
      contributions: st.contributions,
      confirmedBids: st.confirmedBids,
      highestBid: st.highestBid,
      topContributorId: st.topContributorId,
      activeEvent: st.activeEvent,
      roundNumber: st.roundNumber,
      timeRemainingSec: st.timeRemainingSec,
      timerStartedAt: st.timerStartedAt,
      totalDurationSec: st.totalDurationSec,
      log: st.log,
      survivors: st.survivors,
      casualties: st.casualties,
    };
    setPub(pubData);
    try {
      localStorage.setItem(`bg-doomed-${roomCode}`, JSON.stringify(pubData));
    } catch {
      /* ignore */
    }
    if (isHostRef.current) {
      sendersRef.current?.pub(pubData as unknown as Record<string, unknown>);
    }
  };

  const doHostAct = (msg: DoomedActMsg, senderId: string) => {
    if (!stateRef.current) return;
    const st = stateRef.current;

    if (msg.kind === 'sync') {
      syncState(st);
    } else if (msg.kind === 'action' && msg.action) {
      executeAction(st, senderId, msg.action, msg.targetId);
      syncState(st);
    } else if (msg.kind === 'contribute' && typeof msg.amount === 'number') {
      submitContribution(st, senderId, msg.amount);
      syncState(st);
    } else if (msg.kind === 'confirm_bid') {
      confirmBid(st, senderId);
      syncState(st);
    } else if (msg.kind === 'finalize_bids') {
      finalizeContributions(st);
      syncState(st);
    } else if (msg.kind === 'dismiss_event') {
      dismissEventAndNextRound(st);
      syncState(st);
    } else if (msg.kind === 'event_choice' && typeof msg.accepted === 'boolean') {
      executeEventChoice(st, senderId, msg.accepted);
      syncState(st);
    } else if (msg.kind === 'time_up') {
      resolveDoomsday(st);
      syncState(st);
    }
  };

  const act = (msg: Omit<DoomedActMsg, 'client'>) => {
    const full: DoomedActMsg = { ...msg, client: clientId } as DoomedActMsg;
    if (isHost) {
      doHostAct(full, selfId);
    } else {
      sendersRef.current?.act(full as unknown as Record<string, unknown>);
    }
  };

  useEffect(() => {
    const { room } = handle;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const pubAction = room.makeAction('doomed-pub', {
      onMessage: (data: any) => {
        setPub(data as unknown as DoomedPublic);
      },
    });

    const actAction = room.makeAction('doomed-act', {
      onMessage: (data: any, ctx: { peerId: string }) => {
        if (isHostRef.current) {
          doHostAct(data as unknown as DoomedActMsg, ctx.peerId);
        }
      },
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    sendersRef.current = {
      pub: (d, t) => void pubAction.send(d as never, t ? { target: t } : undefined),
      act: (d, t) => void actAction.send(d as never, t ? { target: t } : undefined),
    };

    if (!isHost) {
      const t = setTimeout(() => {
        sendersRef.current?.act({ kind: 'sync', client: getClient() });
      }, 500);
      return () => clearTimeout(t);
    }
  }, [handle, isHost]);

  useEffect(() => {
    if (!isHost || !pub || pub.phase === 'ended') return;

    const interval = setInterval(() => {
      if (!stateRef.current) return;
      const st = stateRef.current;
      if (!st.timerStartedAt) return;

      const elapsed = Math.floor((Date.now() - st.timerStartedAt) / 1000);
      const remaining = Math.max(0, st.totalDurationSec - elapsed);
      st.timeRemainingSec = remaining;

      if (remaining <= 0 && st.phase !== 'ended') {
        resolveDoomsday(st);
        syncState(st);
      } else {
        setPub((prev) => (prev ? { ...prev, timeRemainingSec: remaining } : null));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isHost, pub?.phase]);

  useEffect(() => {
    if (!isHost || !stateRef.current || pub?.phase === 'ended') return;
    const st = stateRef.current;

    const timer = setTimeout(() => {
      if (st.phase === 'action') {
        const activePeer = st.order[st.turnIndex];
        const activePlayer = st.players[activePeer];
        if (activePlayer && activePlayer.isBot && !activePlayer.eliminated) {
          const civ = CIVILIZATIONS[activePlayer.civ];
          let chosenAction: StandardAction = 'produce';
          let target: string | undefined = undefined;

          const nonSelf = st.order.filter((id) => id !== activePeer && !st.players[id].eliminated);
          const randomTarget = nonSelf[Math.floor(Math.random() * nonSelf.length)];

          if (civ.improvedAction === 'nuke' && activePlayer.resources >= 6 && randomTarget) {
            chosenAction = 'nuke';
            target = randomTarget;
          } else if (civ.improvedAction === 'invade' && (activePlayer.influence >= 1 || activePlayer.civ === 'corporatocracy') && randomTarget) {
            chosenAction = 'invade';
            target = randomTarget;
          } else if (civ.improvedAction === 'propagandize' && activePlayer.resources >= 1 && randomTarget) {
            chosenAction = 'propagandize';
            target = randomTarget;
          } else if (civ.improvedAction === 'indoctrinate') {
            chosenAction = 'indoctrinate';
            target = randomTarget;
          } else {
            chosenAction = 'produce';
          }

          executeAction(st, activePeer, chosenAction, target);
          syncState(st);
        }
      } else if (st.phase === 'contribute') {
        let changed = false;
        Object.values(st.players).forEach((p) => {
          if (p.isBot && !p.eliminated && !st.confirmedBids[p.peerId]) {
            // Bots bid organically: either match, beat by 1, or confirm/pass
            const cur = st.contributions[p.peerId] ?? 0;
            if (cur < st.highestBid && p.resources > st.highestBid && Math.random() > 0.4) {
              submitContribution(st, p.peerId, st.highestBid + 1);
            } else {
              confirmBid(st, p.peerId);
            }
            changed = true;
          }
        });
        if (changed) {
          syncState(st);
        }
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [isHost, pub?.phase, pub?.turnIndex, pub?.contributions]);

  const seatTable = (roster: Player[]) => {
    if (roster.length < 4 || roster.length > 10) return;
    const st = initDoomedState(
      roster.map((p) => ({ peerId: p.peerId, name: p.name, isBot: p.bot })),
      900,
    );
    stateRef.current = st;
    syncState(st);
  };

  if (!pub) {
    return (
      <PreDeal
        game="doomed"
        title="We're Doomed!"
        roomCode={roomCode}
        roster={liveRoster.current}
        min={4}
        max={10}
        isHost={isHost}
        onSeat={() => seatTable(liveRoster.current)}
        onExit={onExit}
        onAddBot={onAddBot}
        onRemoveBot={onRemoveBot}
      />
    );
  }

  const activeLeaderId = pub.order[pub.turnIndex];
  const isMyTurn = activeLeaderId === selfId && pub.phase === 'action';
  const myPlayer = pub.players[selfId];
  const myCiv = myPlayer ? CIVILIZATIONS[myPlayer.civ] : null;

  const minutes = Math.floor(pub.timeRemainingSec / 60);
  const seconds = pub.timeRemainingSec % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  const currentRoundLeader = pub.players[activeLeaderId];
  const aliveLeaders = pub.order.map((id) => pub.players[id]).filter((p) => !p.eliminated);
  const sortedByInfluence = [...aliveLeaders].sort((a, b) => b.influence - a.influence || b.resources - a.resources);

  const currentSeatProgress = pub.rocketResources % RESOURCES_PER_SEAT;

  return (
    <div data-game="doomed" className="space-y-8 max-w-6xl mx-auto pb-20 select-none text-white/90">
      <InvitePanel roomCode={roomCode} game="doomed" />

      {/* TOP STATUS STRIP: Round, Clock, Phase */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-4">
          <span className="font-mono text-3xl sm:text-4xl font-black tracking-tight text-[#FFCA06]">
            {timeFormatted}
          </span>
          <span className="h-5 w-px bg-white/20" />
          <span className="text-sm font-semibold tracking-wider uppercase text-white/70">
            Round {pub.roundNumber}
          </span>
          <span className="h-5 w-px bg-white/20" />
          <span className="text-xs font-bold uppercase tracking-widest text-[#FFCA06] bg-[#FFCA06]/10 px-2.5 py-1 rounded-full border border-[#FFCA06]/30">
            {pub.phase}
          </span>
        </div>

        {myPlayer && (
          <div className="flex items-center gap-5 text-sm">
            <span className="text-white/70 font-display italic text-base hidden sm:inline">
              {myCiv?.name}
            </span>
            <span className="font-mono font-bold text-base text-[#FFCA06]">
              {myPlayer.resources} <span className="text-xs uppercase font-normal text-white/50">Res</span>
            </span>
            <span className="font-mono font-bold text-base text-[#C91C7A]">
              {myPlayer.influence} <span className="text-xs uppercase font-normal text-white/50">Inf</span>
            </span>
          </div>
        )}
      </div>

      {/* CENTER-STAGE BOARD: Physical Rocket Launch Gantry */}
      <section aria-label="Rocket Board" className="space-y-4">
        <div className="flex items-baseline justify-between text-sm text-white/70">
          <div className="flex items-center gap-2.5">
            <Rocket className="w-5 h-5 text-[#FFCA06]" />
            <span className="font-display text-lg font-bold tracking-wide uppercase text-white">
              Escape Rocket Capacity
            </span>
          </div>
          <div className="font-mono text-xs sm:text-sm">
            <span className="text-[#FFCA06] font-bold text-base">{pub.seatsBuilt}</span> seats unlocked · <span className="text-white/90 font-bold">{pub.rocketResources}</span> total res contributed
          </div>
        </div>

        {/* Modular Physical Seat Bay (Center Stage Board) */}
        <div
          className="rounded-2xl p-5 sm:p-7"
          style={{
            background: 'linear-gradient(170deg, rgba(63, 25, 77, 0.65) 0%, rgba(34, 8, 43, 0.98) 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255, 202, 6, 0.25), 0 24px 48px rgba(0, 0, 0, 0.6)',
            border: '1px solid rgba(201, 28, 122, 0.3)',
          }}
        >
          {/* Visual Seats Grid */}
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-3 sm:gap-4">
            {Array.from({ length: 10 }).map((_, i) => {
              const isBuilt = i < pub.seatsBuilt;
              const isNext = i === pub.seatsBuilt;
              const claimant = isBuilt && sortedByInfluence[i] ? sortedByInfluence[i] : null;

              return (
                <div
                  key={i}
                  className="flex flex-col items-center justify-between min-h-[110px] sm:min-h-[125px] p-2.5 rounded-xl border transition-all"
                  style={
                    isBuilt
                      ? {
                          borderColor: '#FFCA06',
                          background: 'linear-gradient(160deg, rgba(255, 202, 6, 0.22) 0%, rgba(201, 28, 122, 0.3) 100%)',
                          boxShadow: '0 0 20px rgba(255, 202, 6, 0.2)',
                        }
                      : isNext
                        ? {
                            borderColor: 'rgba(255, 202, 6, 0.65)',
                            borderStyle: 'dashed',
                            background: 'rgba(255, 255, 255, 0.05)',
                          }
                        : {
                            borderColor: 'rgba(255, 255, 255, 0.1)',
                            borderStyle: 'dashed',
                            background: 'rgba(255, 255, 255, 0.02)',
                          }
                  }
                >
                  <span className="font-mono text-xs font-bold text-white/50">
                    S{i + 1}
                  </span>

                  {isBuilt ? (
                    <Rocket className="w-7 h-7 text-[#FFCA06] drop-shadow-[0_0_8px_rgba(255,202,6,0.6)]" />
                  ) : isNext ? (
                    <div className="w-full text-center px-1">
                      <div className="font-mono text-xs font-bold text-[#FFCA06]">
                        {currentSeatProgress}/10
                      </div>
                      <div className="w-full h-1.5 bg-white/10 rounded-full mt-1.5 overflow-hidden">
                        <div
                          className="h-full bg-[#FFCA06]"
                          style={{ width: `${(currentSeatProgress / 10) * 100}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="w-2.5 h-2.5 rounded-full border border-dashed border-white/20" />
                  )}

                  <span className="text-[11px] font-semibold truncate max-w-full text-center text-white/80">
                    {claimant ? claimant.name : isBuilt ? 'Vacant' : isNext ? 'Underway' : 'Empty'}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-white/60 pt-3 border-t border-white/10 font-mono">
            <span>Threshold: 10 resources per escape seat</span>
            <span>Boarding priority: Highest influence survivors escape</span>
          </div>
        </div>
      </section>

      {/* TWO-COLUMN PLAYING TABLE: Active Stage & Diplomatic Roster */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT / MAIN COLUMN: Action & Decisions */}
        <div className="lg:col-span-7 space-y-6">
          {/* Phase 1: Action */}
          {pub.phase === 'action' && currentRoundLeader && (
            <div className="panel space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-xs uppercase tracking-widest font-bold text-[#E8675C]">
                  Initiative Turn
                </span>
                <span className="text-xs text-white/50 font-mono">
                  Order {pub.turnIndex + 1} of {pub.order.length}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
                <div className="min-w-0">
                  <div className="font-display text-3xl sm:text-4xl text-white truncate">
                    {currentRoundLeader.name}
                  </div>
                  <div className="text-sm text-white/70 flex items-center gap-2 mt-1">
                    <span className="font-semibold text-white/90">{CIVILIZATIONS[currentRoundLeader.civ]?.name}</span>
                    <span>•</span>
                    <span className="truncate italic">{CIVILIZATIONS[currentRoundLeader.civ]?.motto}</span>
                  </div>
                </div>

                {isMyTurn && !myPlayer?.eliminated ? (
                  <button
                    onClick={() => setActionModalOpen(true)}
                    className="btn-accent px-6 py-3 rounded-xl text-sm font-bold tracking-wide shrink-0 self-start sm:self-auto"
                  >
                    Take Action →
                  </button>
                ) : (
                  <div className="text-sm italic text-white/50 shrink-0">
                    Awaiting choice…
                  </div>
                )}
              </div>

              {myPlayer && isMyTurn && (
                <div className="text-xs sm:text-sm text-[#FFCA06] font-medium bg-[#FFCA06]/10 p-3.5 rounded-xl border border-[#FFCA06]/20">
                  <span className="font-bold">Civ Specialty: </span>
                  {myCiv?.description}
                </div>
              )}
            </div>
          )}

          {/* Phase 2: Live Bidding & Contribution */}
          {pub.phase === 'contribute' && (
            <div className="panel space-y-4">
              <div className="flex items-baseline justify-between border-b border-white/10 pb-2">
                <span className="text-xs uppercase tracking-widest font-bold text-[#FFCA06]">
                  Live Resource Bidding
                </span>
                <span className="text-xs text-white/50 font-mono">
                  Current High: {pub.highestBid} Res
                </span>
              </div>

              <p className="text-sm text-white/80 leading-relaxed">
                Contribute resources to build the escape rocket. All bids are live—raise your bid anytime to outbid rivals! When all players lock their bids, the round concludes and the Top Contributor wins 1 Influence and First Player coin.
              </p>

              {/* Live Bids Board */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 py-1">
                {pub.order.map((id) => {
                  const p = pub.players[id];
                  if (p.eliminated) return null;
                  const pledged = pub.contributions[id] ?? 0;
                  const isConfirmed = !!pub.confirmedBids[id];
                  const isWinning = pledged === pub.highestBid && pledged > 0;
                  return (
                    <div
                      key={id}
                      className={`p-3 rounded-xl border transition-all ${
                        isWinning
                          ? 'bg-[#FFCA06]/15 border-[#FFCA06] shadow-[0_0_15px_rgba(255,202,6,0.2)]'
                          : 'bg-white/5 border-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white/90 font-medium truncate block">{p.name}</span>
                        {isConfirmed && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/10 text-emerald-300">
                            Locked
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline justify-between mt-1">
                        <span className="text-[10px] text-white/50">{p.resources} in reserve</span>
                        <span className="font-mono text-sm font-bold text-[#FFCA06]">
                          {pledged} Res
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Interactive Player Live Controls */}
              {myPlayer && !myPlayer.eliminated && (
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={() => {
                      const cur = pub.contributions[selfId] ?? 0;
                      setPledgeAmt(Math.min(myPlayer.resources, cur < pub.highestBid ? pub.highestBid + 1 : cur + 1));
                      setContributeModalOpen(true);
                    }}
                    className="flex-1 btn-accent py-3.5 rounded-xl text-sm font-bold tracking-wide"
                  >
                    {(pub.contributions[selfId] ?? 0) === 0 ? 'Place Initial Bid →' : 'Change / Raise Bid →'}
                  </button>

                  <button
                    onClick={() => act({ kind: 'confirm_bid' })}
                    disabled={pub.confirmedBids[selfId]}
                    className={`px-6 py-3.5 rounded-xl border text-xs uppercase font-bold tracking-wider transition-all ${
                      pub.confirmedBids[selfId]
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300 opacity-80 cursor-default'
                        : 'border-white/20 text-white/90 hover:bg-white/10'
                    }`}
                  >
                    {pub.confirmedBids[selfId] ? 'Bid Locked ✓' : 'Lock My Bid'}
                  </button>

                  {isHost && (
                    <button
                      onClick={() => act({ kind: 'finalize_bids' })}
                      className="px-6 py-3.5 rounded-xl border border-[#FFCA06]/40 text-[#FFCA06] hover:bg-[#FFCA06]/10 text-xs uppercase font-bold tracking-wider"
                    >
                      Finalize Bids (Host) →
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Phase 3: Crisis Event Panel */}
          {pub.phase === 'event' && pub.activeEvent && (
            <div className="panel space-y-4">
              <div className="flex items-center gap-2.5 border-b border-white/10 pb-2">
                <AlertTriangle className="w-5 h-5 text-[#FFCA06]" />
                <span className="text-xs font-bold uppercase tracking-widest text-[#FFCA06]">
                  Active Event · {pub.activeEvent.type}
                </span>
                <button
                  type="button"
                  onClick={() => setEventModalDismissed(false)}
                  className="ml-auto text-xs text-[#FFCA06] hover:underline"
                >
                  View Event Card ↗
                </button>
              </div>

              <div className="space-y-2 py-1">
                <div className="font-display text-3xl text-white">
                  {pub.activeEvent.title}
                </div>
                <p className="text-sm italic text-white/60">
                  "{pub.activeEvent.flavor}"
                </p>
                <p className="text-base font-medium text-white/95 leading-relaxed pt-1">
                  {pub.activeEvent.description}
                </p>
              </div>

              {isHost && !pub.activeEvent.interactiveChoice && (
                <button
                  onClick={() => act({ kind: 'dismiss_event' })}
                  className="w-full btn-accent py-3 rounded-xl text-sm font-bold tracking-wide"
                >
                  Confirm & Begin Round {pub.roundNumber + 1} →
                </button>
              )}
            </div>
          )}

          {/* Phase 4: Ended */}
          {pub.phase === 'ended' && (
            <div className="panel space-y-4 text-center py-4">
              <Rocket className="w-10 h-10 text-[#FFCA06] mx-auto" />
              <h2 className="font-display text-4xl uppercase tracking-tight text-white">
                {pub.survivors.length > 0 ? 'Escape Shuttle Departed' : 'Planet Destroyed'}
              </h2>
              <p className="text-sm text-white/70 max-w-md mx-auto">
                Rocket launched with {pub.seatsBuilt} seat(s). Top leaders by Influence claimed the seats.
              </p>

              <div className="text-left space-y-4 pt-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-[#FFCA06] mb-2">
                    Survivors ({pub.survivors.length})
                  </div>
                  <div className="divide-y divide-white/10">
                    {pub.survivors.map((id) => (
                      <div key={id} className="py-2.5 flex items-center justify-between text-sm">
                        <span className="font-semibold text-white">🚀 {pub.players[id]?.name}</span>
                        <span className="font-mono text-[#FFCA06] font-bold">{pub.players[id]?.influence} Inf</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-[#E8675C] mb-2">
                    Perished ({pub.casualties.length})
                  </div>
                  <div className="divide-y divide-white/10 opacity-50">
                    {pub.casualties.map((id) => (
                      <div key={id} className="py-2 flex items-center justify-between text-sm">
                        <span className="line-through">{pub.players[id]?.name}</span>
                        <span className="font-mono">{pub.players[id]?.influence} Inf</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Collapsible Emergency Broadcast Logs */}
          <Collapse title="Emergency Communications" defaultOpen={false}>
            <div className="font-mono text-xs divide-y divide-white/5 max-h-52 overflow-y-auto px-1">
              {pub.log
                .slice()
                .reverse()
                .map((entry, idx) => (
                  <div key={idx} className="py-2 text-white/75">
                    {entry}
                  </div>
                ))}
            </div>
          </Collapse>
        </div>

        {/* RIGHT COLUMN: Diplomatic Leaders Table */}
        <div className="lg:col-span-5 space-y-4">
          <div className="panel space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <span className="text-xs font-bold uppercase tracking-widest text-white/70">
                Diplomatic Table
              </span>
              <span className="text-xs font-mono text-white/60">
                Top {pub.seatsBuilt} Board
              </span>
            </div>

            <div className="divide-y divide-white/5">
              {sortedByInfluence.map((p, idx) => {
                const isFirst = p.peerId === pub.firstPlayerId;
                const isMe = p.peerId === selfId;
                const hasSeat = idx < pub.seatsBuilt;

                return (
                  <div
                    key={p.peerId}
                    className={`py-3 px-2 flex items-center justify-between transition-colors ${
                      p.eliminated ? 'opacity-30 line-through' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="font-mono text-sm text-white/40 w-4 text-right">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold truncate ${isMe ? 'text-[#FFCA06]' : 'text-white'}`}>
                            {p.name} {isMe ? '(You)' : ''}
                          </span>
                          {isFirst && <Crown className="w-3.5 h-3.5 text-[#FFCA06]" />}
                          {hasSeat && (
                            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#C91C7A]/30 text-[#FFCA06] font-bold">
                              Seat
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-white/50 truncate">
                          {CIVILIZATIONS[p.civ]?.name}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm font-mono shrink-0">
                      <div className="text-right">
                        <span className="font-bold text-[#FFCA06]">{p.resources}</span>
                        <span className="text-[10px] uppercase text-white/40 ml-1">Res</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-[#C91C7A]">{p.influence}</span>
                        <span className="text-[10px] uppercase text-white/40 ml-1">Inf</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ACTION PICKER MODAL (Select-then-Confirm Pattern) */}
      {actionModalOpen && myPlayer && (
        <Modal title="Choose Leader Action" onClose={() => setActionModalOpen(false)} wide>
          <div className="space-y-4">
            <p className="text-xs text-white/70">
              Select one action for this round. Your civilization grants a distinct bonus to its specialty.
            </p>

            <div className="space-y-2">
              {/* 1. Produce */}
              <button
                type="button"
                onClick={() => setSelectedAction('produce')}
                className={`w-full p-3 rounded-xl text-left transition-all ${
                  selectedAction === 'produce'
                    ? 'bg-[#FFCA06] text-[#22082b]'
                    : 'bg-white/5 text-white hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-sm">
                  <span className="flex items-center gap-2">
                    <Coins className="w-4 h-4" /> Produce
                  </span>
                  {myCiv?.improvedAction === 'produce' && (
                    <span className="text-[10px] uppercase tracking-wider font-bold opacity-80">
                      Civ Specialty
                    </span>
                  )}
                </div>
                <div className="text-xs opacity-85 mt-1">
                  {myCiv?.improvedAction === 'produce' ? myCiv.description : 'Gain 2 Resources.'}
                </div>
              </button>

              {/* 2. Indoctrinate */}
              <button
                type="button"
                onClick={() => setSelectedAction('indoctrinate')}
                className={`w-full p-3 rounded-xl text-left transition-all ${
                  selectedAction === 'indoctrinate'
                    ? 'bg-[#FFCA06] text-[#22082b]'
                    : 'bg-white/5 text-white hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-sm">
                  <span className="flex items-center gap-2">
                    <Shield className="w-4 h-4" /> Indoctrinate
                  </span>
                  {myCiv?.improvedAction === 'indoctrinate' && (
                    <span className="text-[10px] uppercase tracking-wider font-bold opacity-80">
                      Civ Specialty
                    </span>
                  )}
                </div>
                <div className="text-xs opacity-85 mt-1">
                  {myCiv?.improvedAction === 'indoctrinate' ? myCiv.description : 'Gain 1 Influence.'}
                </div>
              </button>

              {/* 3. Propagandize */}
              <button
                type="button"
                onClick={() => setSelectedAction('propagandize')}
                disabled={myPlayer.resources < 1}
                className={`w-full p-3 rounded-xl text-left transition-all disabled:opacity-30 ${
                  selectedAction === 'propagandize'
                    ? 'bg-[#FFCA06] text-[#22082b]'
                    : 'bg-white/5 text-white hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-sm">
                  <span className="flex items-center gap-2">
                    <Radio className="w-4 h-4" /> Propagandize (1 Res)
                  </span>
                  {myCiv?.improvedAction === 'propagandize' && (
                    <span className="text-[10px] uppercase tracking-wider font-bold opacity-80">
                      Civ Specialty
                    </span>
                  )}
                </div>
                <div className="text-xs opacity-85 mt-1">
                  {myCiv?.improvedAction === 'propagandize'
                    ? myCiv.description
                    : 'Spend 1 Resource to steal 1 Influence from a rival leader.'}
                </div>
              </button>

              {/* 4. Invade */}
              <button
                type="button"
                onClick={() => setSelectedAction('invade')}
                disabled={
                  myCiv?.id === 'corporatocracy'
                    ? myPlayer.resources < 1
                    : myPlayer.influence < 1
                }
                className={`w-full p-3 rounded-xl text-left transition-all disabled:opacity-30 ${
                  selectedAction === 'invade'
                    ? 'bg-[#FFCA06] text-[#22082b]'
                    : 'bg-white/5 text-white hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-sm">
                  <span className="flex items-center gap-2">
                    <Zap className="w-4 h-4" /> Invade ({myCiv?.id === 'corporatocracy' ? '1 Res' : '1 Inf'})
                  </span>
                  {myCiv?.improvedAction === 'invade' && (
                    <span className="text-[10px] uppercase tracking-wider font-bold opacity-80">
                      Civ Specialty
                    </span>
                  )}
                </div>
                <div className="text-xs opacity-85 mt-1">
                  {myCiv?.improvedAction === 'invade'
                    ? myCiv.description
                    : 'Spend 1 Influence to steal 2 Resources from a rival leader.'}
                </div>
              </button>

              {/* 5. Nuke */}
              <button
                type="button"
                onClick={() => setSelectedAction('nuke')}
                disabled={myPlayer.resources < (myCiv?.id === 'cyberocracy' ? 6 : 8)}
                className={`w-full p-3 rounded-xl text-left transition-all disabled:opacity-30 ${
                  selectedAction === 'nuke'
                    ? 'bg-[#E8675C] text-white'
                    : 'bg-white/5 text-[#E8675C] hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-sm">
                  <span className="flex items-center gap-2">
                    <Flame className="w-4 h-4" /> Atomic Strike ({myCiv?.id === 'cyberocracy' ? '6' : '8'} Res)
                  </span>
                  <span className="text-[10px] uppercase tracking-wider font-bold opacity-80">
                    Lethal
                  </span>
                </div>
                <div className="text-xs opacity-85 mt-1">
                  Permanently eradicate a rival leader from the table.
                </div>
              </button>
            </div>

            {/* Target selection if required */}
            {(selectedAction === 'propagandize' ||
              selectedAction === 'invade' ||
              selectedAction === 'nuke' ||
              (selectedAction === 'indoctrinate' && myCiv?.id === 'aristocracy')) && (
              <div className="pt-2 border-t border-white/10">
                <div className="text-xs uppercase font-bold tracking-wider text-white/70 mb-2">
                  Select Target Leader:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {pub.order
                    .filter((id) => id !== selfId && !pub.players[id]?.eliminated)
                    .map((id) => (
                      <PickCard
                        key={id}
                        name={pub.players[id]?.name ?? ''}
                        sub={`${pub.players[id]?.resources} Res · ${pub.players[id]?.influence} Inf`}
                        selected={targetLeaderId === id}
                        onPick={() => setTargetLeaderId(id)}
                      />
                    ))}
                </div>
              </div>
            )}

            <ModalConfirm
              disabled={
                !selectedAction ||
                (['propagandize', 'invade', 'nuke'].includes(selectedAction) && !targetLeaderId)
              }
              onConfirm={() => {
                if (!selectedAction) return;
                act({
                  kind: 'action',
                  action: selectedAction,
                  targetId: targetLeaderId ?? undefined,
                });
                setActionModalOpen(false);
                setSelectedAction(null);
                setTargetLeaderId(null);
              }}
            >
              Confirm Action
            </ModalConfirm>
          </div>
        </Modal>
      )}

      {/* CONTRIBUTION MODAL (Select-then-Confirm Pattern) */}
      {contributeModalOpen && myPlayer && (
        <Modal title="Pledge Escape Resources" onClose={() => setContributeModalOpen(false)}>
          <div className="space-y-6 text-center py-2">
            <div>
              <p className="text-xs text-white/70 uppercase tracking-wider font-semibold">
                Available Resources
              </p>
              <div className="font-mono text-5xl font-black text-[#FFCA06] mt-1">
                {myPlayer.resources}
              </div>
            </div>

            <div className="flex items-center justify-center gap-6">
              <button
                type="button"
                onClick={() => setPledgeAmt((p) => Math.max(0, p - 1))}
                className="w-12 h-12 rounded-full border border-white/20 hover:bg-white/10 text-2xl font-bold flex items-center justify-center transition-all active:scale-95"
              >
                -
              </button>
              <div className="font-mono text-6xl font-extrabold text-white w-20 text-center">
                {pledgeAmt}
              </div>
              <button
                type="button"
                onClick={() => setPledgeAmt((p) => Math.min(myPlayer.resources, p + 1))}
                className="w-12 h-12 rounded-full border border-white/20 hover:bg-white/10 text-2xl font-bold flex items-center justify-center transition-all active:scale-95"
              >
                +
              </button>
            </div>

            <div className="flex justify-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setPledgeAmt(0)}
                className="px-3 py-1.5 rounded-full border border-white/10 hover:border-white/30 text-white/70 transition-all"
              >
                Zero (0)
              </button>
              <button
                type="button"
                onClick={() => setPledgeAmt(Math.floor(myPlayer.resources / 2))}
                className="px-3 py-1.5 rounded-full border border-white/10 hover:border-white/30 text-white/70 transition-all"
              >
                Half ({Math.floor(myPlayer.resources / 2)})
              </button>
              <button
                type="button"
                onClick={() => setPledgeAmt(myPlayer.resources)}
                className="px-3 py-1.5 rounded-full border border-[#FFCA06]/40 text-[#FFCA06] hover:bg-[#FFCA06]/10 transition-all font-bold"
              >
                All-In ({myPlayer.resources})
              </button>
            </div>

            <ModalConfirm
              onConfirm={() => {
                act({ kind: 'contribute', amount: pledgeAmt });
                setContributeModalOpen(false);
              }}
            >
              Lock In Pledge ({pledgeAmt} Res)
            </ModalConfirm>
          </div>
        </Modal>
      )}

      {/* PROMINENT EVENT CARD POPUP (2-Step Verification) */}
      {pub.phase === 'event' && pub.activeEvent && !eventModalDismissed && (
        <Modal
          title={`Crisis Event · ${pub.activeEvent.type}`}
          onClose={() => setEventModalDismissed(true)}
          wide
        >
          <div className="space-y-5 py-2">
            <div
              className="p-5 rounded-2xl border"
              style={{
                background: 'linear-gradient(160deg, rgba(104, 9, 126, 0.4) 0%, rgba(63, 25, 77, 0.9) 100%)',
                borderColor: '#FFCA06',
                boxShadow: '0 0 30px rgba(255, 202, 6, 0.2)',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-6 h-6 text-[#FFCA06] animate-pulse" />
                <h3 className="font-display text-3xl text-white">
                  {pub.activeEvent.title}
                </h3>
                <span className="ml-auto text-[10px] uppercase font-bold tracking-widest px-2.5 py-1 rounded bg-[#FFCA06] text-[#22082b]">
                  {pub.activeEvent.type}
                </span>
              </div>

              <p className="text-sm italic text-white/70 mb-4">
                "{pub.activeEvent.flavor}"
              </p>

              <div className="p-4 rounded-xl bg-black/40 border border-white/10">
                <div className="text-xs uppercase font-bold text-[#FFCA06] tracking-wider mb-1">
                  Planetary Directive:
                </div>
                <div className="text-base font-semibold text-white leading-relaxed">
                  {pub.activeEvent.description}
                </div>
              </div>
            </div>

            {/* Interactive Decision if this card has one */}
            {pub.activeEvent.interactiveChoice ? (
              <div className="space-y-3">
                <p className="text-sm text-white/80 font-medium">
                  {pub.activeEvent.interactiveChoice.prompt}
                </p>
                {pub.topContributorId === selfId ? (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        act({ kind: 'event_choice', accepted: false });
                        setEventModalDismissed(true);
                      }}
                      className="py-3 px-4 rounded-xl border border-white/20 text-white/80 hover:bg-white/10 font-bold text-xs uppercase tracking-wider"
                    >
                      {pub.activeEvent.interactiveChoice.cancelLabel ?? 'Decline'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        act({ kind: 'event_choice', accepted: true });
                        setEventModalDismissed(true);
                      }}
                      className="btn-accent py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider"
                    >
                      {pub.activeEvent.interactiveChoice.actionLabel}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs italic text-white/50">
                    Awaiting top contributor ({pub.players[pub.topContributorId ?? '']?.name}) to decide…
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {isHost ? (
                  <ModalConfirm
                    onConfirm={() => {
                      act({ kind: 'dismiss_event' });
                      setEventModalDismissed(true);
                    }}
                  >
                    Confirm & Start Next Round →
                  </ModalConfirm>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEventModalDismissed(true)}
                    className="w-full btn-accent py-3 rounded-xl font-bold text-xs uppercase tracking-wider"
                  >
                    Understood (Awaiting Host)
                  </button>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
