import { useEffect, useRef, useState } from 'react';
import { Crown, Spade } from 'lucide-react';
import {
  SUIT_NAME,
  SUIT_SYMBOL,
  TRUMP_SCHEDULE,
  bidOrderForRound,
  cardId,
  dealHands,
  forbiddenLastBid,
  handSizeForRound,
  isBidLegal,
  isPlayLegal,
  sortHand,
  scoreRound,
  trickWinner,
  trumpForRound,
  type Card,
  type Suit,
} from '../game/judgement/logic';
import type { Player } from '../net/presence';
import type { JUDActMsg, JUDHandMsg, JUDPublic, RoomHandle } from '../net/transport';
import { CardFace } from './PlayingCards';
import { PreDeal } from './PreDeal';
import { Collapse } from './Collapse';

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
  /** bumped by App on exit-to-lobby; clears all internal game state */
  resetToken: number;
}

function botBid(handSize: number, existing: number, isLast: boolean): number {
  for (let tries = 0; tries < 20; tries++) {
    const b = Math.floor(Math.random() * (handSize + 1));
    if (isBidLegal(b, existing, handSize, isLast)) return b;
  }
  for (let b = 0; b <= handSize; b++) {
    if (isBidLegal(b, existing, handSize, isLast)) return b;
  }
  return 0;
}

/** Bots play fully at random (from legal cards) so tables stay testable. */
function botCard(hand: Card[], leadSuit: Suit | null): Card {
  const follow = leadSuit ? hand.filter((c) => c.suit === leadSuit) : [];
  const pool = follow.length > 0 ? follow : [...hand];
  return pool[Math.floor(Math.random() * pool.length)];
}

const SUIT_TEXT: Record<Suit, string> = {
  S: 'text-slate-100',
  H: 'text-rose-300',
  C: 'text-slate-100',
  D: 'text-rose-300',
};

export default function Judgement({
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
  const [jud, setJud] = useState<JUDPublic | null>(null);
  const [hand, setHand] = useState<Card[]>(() => {
    try {
      const s = JSON.parse(localStorage.getItem(`bg-judhand-${roomCode}`) ?? 'null');
      if (s && Array.isArray(s.cards)) return s.cards as Card[];
    } catch {
      /* none */
    }
    return [];
  });
  const [pendingBid, setPendingBid] = useState<number | null>(null);
  const [pendingPlay, setPendingPlay] = useState<string | null>(null);
  const [pileOpen, setPileOpen] = useState(false);

  const judRef = useRef<JUDPublic | null>(null);
  const handsRef = useRef<Record<string, Card[]>>({});
  const sendersRef = useRef<{
    pub: (d: unknown, t?: string | string[]) => void;
    hand: (d: unknown, t?: string | string[]) => void;
    act: (d: unknown, t?: string | string[]) => void;
  } | null>(null);
  const isHostRef = useRef(isHost);
  const initedRef = useRef(false);
  isHostRef.current = isHost;
  judRef.current = jud;

  // exit-to-lobby: wipe internal state + host saves so the next seat is clean
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    if (resetToken === 0) return;
    judRef.current = null;
    setJud(null);
    setHand([]);
    setPendingBid(null);
    setPendingPlay(null);
    handsRef.current = {};
    try {
      localStorage.removeItem(`bg-judhost-${roomCode}`);
      localStorage.removeItem(`bg-judhand-${roomCode}`);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  const nameOf = (peerId: string | null): string =>
    judRef.current?.players.find((p) => p.peerId === peerId)?.name ?? '?';

  // ---------- host ----------
  const push = (patch: Partial<JUDPublic>, target?: string | string[]) => {
    const cur = judRef.current;
    if (!cur) return;
    const next: JUDPublic = { ...cur, ...patch };
    judRef.current = next;
    setJud(next);
    const s = sendersRef.current;
    if (!s) return;
    if (target) void s.pub(next as unknown as Record<string, unknown>, target);
    else void s.pub(next as unknown as Record<string, unknown>);
    try {
      localStorage.setItem(
        `bg-judhost-${roomCode}`,
        JSON.stringify({ jud: next, hands: handsRef.current, hostPeer: selfId }),
      );
    } catch {
      /* ignore */
    }
  };

  const dealTo = (peerId: string, roundIndex: number) => {
    const cards = handsRef.current[peerId];
    if (!cards) return;
    const msg: JUDHandMsg = { cards: sortHand(cards), roundIndex };
    if (peerId === selfId) {
      setHand(sortHand(cards));
      try {
        localStorage.setItem(`bg-judhand-${roomCode}`, JSON.stringify({ cards: sortHand(cards), round: roundIndex }));
      } catch {
        /* ignore */
      }
      return;
    }
    sendersRef.current?.hand(msg as unknown as Record<string, unknown>, peerId);
  };

  const seatsOf = (): string[] => (judRef.current?.players ?? []).map((p) => p.peerId);

  const playOrderFrom = (leader: string, seats: string[]): string[] => {
    const i = seats.indexOf(leader);
    if (i < 0) return [...seats];
    return [...seats.slice(i), ...seats.slice(0, i)];
  };

  const startRound = (roundIndex: number, keepScores: Record<string, number>, history: JUDPublic['history'], players: Player[]): boolean => {
    const seats = players.map((p) => p.peerId);
    const handSize = handSizeForRound(roundIndex);
    if (seats.length < 3 || seats.length > 8 || seats.length * handSize > 52)
      return false;
    const trump = trumpForRound(roundIndex);
    const order = bidOrderForRound(seats, roundIndex);
    let deck: Record<string, Card[]>;
    try {
      deck = dealHands(seats, handSize);
    } catch {
      return false;
    }
    handsRef.current = deck;
    const tricksWon: Record<string, number> = {};
    seats.forEach((s) => {
      tricksWon[s] = 0;
    });
    const next: JUDPublic = {
      phase: 'bid',
      players,
      roundIndex,
      handSize,
      trump,
      order,
      bids: {},
      tricksWon,
      scores: { ...keepScores },
      history,
      turnPeer: order[0] ?? null,
      leaderPeer: order[0] ?? null,
      trickIndex: 0,
      currentTrick: [],
      winners: [],
      log: [
        ...(judRef.current?.log ?? []),
        `Round ${roundIndex + 1}/10 — ${handSize} card${handSize === 1 ? '' : 's'}, trump: ${trump ? SUIT_NAME[trump] : 'No Trump'}. ${players.find((p) => p.peerId === order[0])?.name ?? '?'} bids first.`,
      ].slice(-60),
    };
    judRef.current = next;
    setJud(next);
    setPileOpen(false);
    sendersRef.current?.pub(next as unknown as Record<string, unknown>);
    seats.forEach((s) => dealTo(s, roundIndex));
    try {
      localStorage.setItem(
        `bg-judhost-${roomCode}`,
        JSON.stringify({ jud: next, hands: handsRef.current, hostPeer: selfId }),
      );
    } catch {
      /* ignore */
    }
    maybeBot(next);
    return true;
  };

  /** Seat a fresh table from the given (live) roster. Host only. */
  const dealTable = (roster: Player[]): boolean => {
    if (roster.length < 3 || roster.length > 8) return false;
    if (roster.length * handSizeForRound(0) > 52) return false;
    const players = roster.map((p) => ({ ...p, alive: true, online: true }));
    const scores: Record<string, number> = {};
    players.forEach((p) => {
      scores[p.peerId] = 0;
    });
    try {
      localStorage.removeItem(`bg-judhand-${roomCode}`);
    } catch {
      /* ignore */
    }
    setHand([]);
    setPendingBid(null);
    setPendingPlay(null);
    return startRound(0, scores, [], players);
  };

  const seatLiveTable = (): void => {
    const roster = liveRoster.current;
    if (roster.length * handSizeForRound(0) > 52) {
      alert(
        `Not enough cards: ${roster.length} players × 10 cards needs ${roster.length * 10} cards — a deck has 52. Seat ${Math.floor(52 / 10)} or fewer for the full 10-round schedule.`,
      );
      return;
    }
    if (!dealTable(roster)) {
      alert('Judgement needs 3-8 players to seat the table.');
    }
  };

  const isBot = (peerId: string | null): boolean => {
    if (!peerId) return false;
    if (peerId.startsWith('bot-')) return true;
    return !!judRef.current?.players.find((p) => p.peerId === peerId)?.bot;
  };

  const maybeBot = (cur: JUDPublic) => {
    if (!isHostRef.current) return;
    const t = cur.turnPeer;
    if (!t || !isBot(t)) return;
    setTimeout(() => botTakeTurn(t), 300);
  };

  const botTakeTurn = (peerId: string) => {
    const cur = judRef.current;
    if (!cur || cur.turnPeer !== peerId) return;
    if (cur.phase === 'bid') {
      const idx = cur.order.indexOf(peerId);
      const existing = cur.order.slice(0, idx).reduce((a, id) => a + (cur.bids[id] ?? 0), 0);
      const bid = botBid(cur.handSize, existing, idx === cur.order.length - 1);
      doAct({ kind: 'bid', bid, client: `bot-${peerId}` } as JUDActMsg, peerId);
    } else if (cur.phase === 'play') {
      const handCards = handsRef.current[peerId] ?? [];
      if (handCards.length === 0) return;
      const leadSuit = cur.currentTrick.length > 0 ? cur.currentTrick[0].card.suit : null;
      const card = botCard(handCards, leadSuit);
      doAct({ kind: 'play', card, client: `bot-${peerId}` } as JUDActMsg, peerId);
    }
  };

  const doAct = (m: JUDActMsg, fromPeer: string) => {
    const cur = judRef.current;
    if (!cur) return;
    if (m.kind === 'sync') {
      sendersRef.current?.pub(cur as unknown as Record<string, unknown>, fromPeer);
      const cards = handsRef.current[fromPeer];
      if (cards) {
        sendersRef.current?.hand(
          { cards: sortHand(cards), roundIndex: cur.roundIndex } as unknown as Record<string, unknown>,
          fromPeer,
        );
      }
      return;
    }
    if (!cur.players.some((p) => p.peerId === fromPeer)) return;

    if (m.kind === 'bid' && cur.phase === 'bid') {
      if (fromPeer !== cur.turnPeer) return;
      const idx = cur.order.indexOf(fromPeer);
      if (idx < 0) return;
      const existing = cur.order.slice(0, idx).reduce((a, id) => a + (cur.bids[id] ?? 0), 0);
      const bid = m.bid ?? -1;
      if (!isBidLegal(bid, existing, cur.handSize, idx === cur.order.length - 1)) return;
      const bids = { ...cur.bids, [fromPeer]: bid };
      const log = [...cur.log, `${nameOf(fromPeer)} bids ${bid}.`].slice(-60);
      if (Object.keys(bids).length >= cur.order.length) {
        const next = { ...cur, bids, log: [...log, `Bidding closed. ${nameOf(cur.leaderPeer)} leads.`].slice(-60) as string[], phase: 'play' as const, trickIndex: 1, currentTrick: [] as JUDPublic['currentTrick'], turnPeer: cur.leaderPeer };
        push(next);
        maybeBot(next);
        return;
      }
      const nextTurn = cur.order[idx + 1] ?? null;
      const next = { ...cur, bids, log, turnPeer: nextTurn };
      push(next);
      maybeBot(next);
      return;
    }

    if (m.kind === 'play' && cur.phase === 'play') {
      const seats = seatsOf();
      const order = playOrderFrom(cur.leaderPeer ?? seats[0], seats);
      const expected = order[cur.currentTrick.length] ?? null;
      if (fromPeer !== expected) return;
      const card = m.card;
      if (!card) return;
      const handCards = handsRef.current[fromPeer] ?? [];
      const leadSuit = cur.currentTrick.length > 0 ? cur.currentTrick[0].card.suit : null;
      if (!isPlayLegal(handCards, card, leadSuit)) return;
      handsRef.current[fromPeer] = handCards.filter(
        (c) => !(c.suit === card.suit && c.rank === card.rank),
      );
      dealTo(fromPeer, cur.roundIndex);
      const trick = [...cur.currentTrick, { peerId: fromPeer, card }];
      if (trick.length < seats.length) {
        const nextTurn = order[trick.length] ?? null;
        const next = { ...cur, currentTrick: trick, turnPeer: nextTurn };
        push(next);
        maybeBot(next);
        return;
      }
      // trick complete
      const winner = trickWinner(trick, cur.trump);
      const tricksWon = { ...cur.tricksWon, [winner]: (cur.tricksWon[winner] ?? 0) + 1 };
      let log = [...cur.log, `${nameOf(winner)} wins trick ${cur.trickIndex} (${trick.map((t) => `${t.card.rank}${SUIT_SYMBOL[t.card.suit]}`).join(' ')}).`].slice(-60);
      const done = cur.trickIndex >= cur.handSize;
      if (!done) {
        const next = {
          ...cur,
          tricksWon,
          currentTrick: [] as JUDPublic['currentTrick'],
          leaderPeer: winner,
          turnPeer: winner,
          trickIndex: cur.trickIndex + 1,
          log,
        };
        push(next);
        maybeBot(next);
        return;
      }
      // round complete -> score
      const points: Record<string, number> = {};
      for (const s of seats) points[s] = scoreRound(cur.bids[s] ?? 0, tricksWon[s] ?? 0);
      const scores: Record<string, number> = { ...cur.scores };
      for (const s of seats) scores[s] = (scores[s] ?? 0) + points[s];
      const history = [...cur.history, { roundIndex: cur.roundIndex, points }];
      log = [
        ...log,
        `Round ${cur.roundIndex + 1} scored: ${seats.map((s) => `${nameOf(s)} ${tricksWon[s] ?? 0}/${cur.bids[s] ?? 0} → +${points[s]}`).join(' · ')}.`,
      ].slice(-60);
      if (cur.roundIndex >= 9) {
        const top = Math.max(...seats.map((s) => scores[s] ?? 0));
        const winners = seats.filter((s) => (scores[s] ?? 0) === top);
        push({
          tricksWon,
          scores,
          history,
          currentTrick: [],
          turnPeer: null,
          phase: 'ended',
          winners,
          log: [...log, `${winners.map(nameOf).join(', ')} win${winners.length > 1 ? '' : 's'} with ${top} pts.`].slice(-60),
        });
        return;
      }
      // next round — set jud first so startRound appends to the fresh log
      const interim: JUDPublic = { ...cur, tricksWon, scores, history, log, currentTrick: [] };
      judRef.current = interim;
      startRound(cur.roundIndex + 1, scores, history, cur.players);
    }
  };

  /** Live lobby roster (prop updates on every App render). Read at seat
   * time — never a mount-time snapshot — so late joiners get seated. */
  const liveRoster = useRef(initialRoster);
  liveRoster.current = initialRoster;

  const initGame = () => {
    if (restoreSaved()) return;
    // No save: only auto-deal if the live room already seats a full table.
    // Otherwise idle on the pre-deal screen until the host seats manually.
    dealTable(liveRoster.current);
  };

  /** Host refresh recovery. Returns true when a save was restored. */
  const restoreSaved = (): boolean => {
    try {
      const saved = JSON.parse(localStorage.getItem(`bg-judhost-${roomCode}`) ?? 'null');
      if (saved?.jud && saved?.hands) {
        const oldPeer = saved.hostPeer as string;
        const hands = saved.hands as Record<string, Card[]>;
        if (oldPeer && oldPeer !== selfId) {
          if (hands[oldPeer]) {
            hands[selfId] = hands[oldPeer];
            delete hands[oldPeer];
          }
          const j = saved.jud as JUDPublic;
          const remap = (id: string) => (id === oldPeer ? selfId : id);
          j.players = j.players.map((p) => (p.peerId === oldPeer ? { ...p, peerId: selfId } : p));
          j.order = j.order.map(remap);
          if (j.turnPeer) j.turnPeer = remap(j.turnPeer);
          if (j.leaderPeer) j.leaderPeer = remap(j.leaderPeer);
          j.currentTrick = j.currentTrick.map((t) => ({ ...t, peerId: remap(t.peerId) }));
          const remapRec = (r: Record<string, number>) =>
            Object.fromEntries(Object.entries(r).map(([k, v]) => [remap(k), v]));
          j.bids = remapRec(j.bids);
          j.tricksWon = remapRec(j.tricksWon);
          j.scores = remapRec(j.scores);
          saved.jud = j;
        }
        handsRef.current = hands;
        judRef.current = saved.jud as JUDPublic;
        setJud(saved.jud as JUDPublic);
        dealTo(selfId, (saved.jud as JUDPublic).roundIndex);
        sendersRef.current?.pub(saved.jud as unknown as Record<string, unknown>);
        maybeBot(saved.jud as JUDPublic);
        return true;
      }
      return false;
    } catch {
      /* fresh game */
      return false;
    }
  };

  // ---------- wiring ----------
  useEffect(() => {
    const { room } = handle;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pub = room.makeAction('jud-pub', { onMessage: (data: any) => setJud(data as unknown as JUDPublic) });
    const handAct = room.makeAction('jud-hand', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onMessage: (data: any) => {
        const msg = data as unknown as JUDHandMsg;
        setHand(sortHand(msg.cards ?? []));
        try {
          localStorage.setItem(`bg-judhand-${roomCode}`, JSON.stringify({ cards: msg.cards ?? [], round: msg.roundIndex }));
        } catch {
          /* ignore */
        }
      },
    });
    const act = room.makeAction('jud-act', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onMessage: (data: any, ctx: { peerId: string }) => {
        if (isHostRef.current) doAct(data as unknown as JUDActMsg, ctx.peerId);
      },
    });
    sendersRef.current = {
      pub: (d, t) => void pub.send(d as never, t ? { target: t } : undefined),
      hand: (d, t) => void handAct.send(d as never, t ? { target: t } : undefined),
      act: (d, t) => void act.send(d as never, t ? { target: t } : undefined),
    };
    const beat = setInterval(() => {
      const cur = judRef.current;
      if (isHostRef.current && cur) sendersRef.current?.pub(cur as unknown as Record<string, unknown>);
    }, 5000);
    if (isHost && !initedRef.current) {
      initedRef.current = true;
      // wait a beat so senders exist
      setTimeout(() => initGame(), 50);
    } else if (!isHost) {
      const t = setTimeout(
        () => sendersRef.current?.act({ kind: 'sync', client: getClient() }),
        600,
      );
      const retry = setInterval(() => {
        if (!judRef.current) sendersRef.current?.act({ kind: 'sync', client: getClient() });
        else clearInterval(retry);
      }, 3000);
      return () => {
        clearTimeout(t);
        clearInterval(retry);
        clearInterval(beat);
      };
    }
    return () => {
      clearInterval(beat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  // host: persist + drive bots when state changes from elsewhere
  useEffect(() => {
    if (isHost && jud) {
      const t = jud.turnPeer;
      if (t && isBot(t)) {
        const timer = setTimeout(() => botTakeTurn(t), 300);
        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jud?.turnPeer, jud?.phase, jud?.trickIndex]);

  // tap feedback: clear the pending bid once the table confirms it
  useEffect(() => {
    if (pendingBid !== null && jud && jud.bids[selfId] === pendingBid) {
      setPendingBid(null);
    }
  }, [jud, pendingBid, selfId]);

  // tap feedback: clear the pending play once the card leaves our hand
  useEffect(() => {
    if (pendingPlay && !hand.some((c) => cardId(c) === pendingPlay)) {
      setPendingPlay(null);
    }
  }, [hand, pendingPlay]);

  /**
   * Local action sender. The relay only delivers to OTHER peers, so the
   * host applies its own bids/plays directly instead of waiting for an
   * echo that never comes (guests go over the wire as normal).
   */
  const act = (msg: Omit<JUDActMsg, 'client'>) => {
    const full = { ...msg, client: clientId } as JUDActMsg;
    if (isHost) {
      doAct(full, selfId);
      return;
    }
    sendersRef.current?.act(full as unknown as Record<string, unknown>);
  };

  // ---------- render ----------
  if (!jud) {
    return (
      <PreDeal
        game="judgement"
        title="Judgement"
        roomCode={roomCode}
        roster={liveRoster.current}
        min={3}
        max={8}
        isHost={isHost}
        onSeat={seatLiveTable}
        onExit={onExit}
        onAddBot={onAddBot}
        onRemoveBot={onRemoveBot}
      />
    );
  }

  const myTurnBid = jud.phase === 'bid' && jud.turnPeer === selfId;
  const seats = jud.players;
  const myBidIdx = jud.order.indexOf(selfId);
  const existingTotal = myBidIdx >= 0 ? jud.order.slice(0, myBidIdx).reduce((a, id) => a + (jud.bids[id] ?? 0), 0) : 0;
  const isLastBidder = myBidIdx === jud.order.length - 1 && myBidIdx >= 0;
  const forbidden = forbiddenLastBid(existingTotal, jud.handSize, isLastBidder && myTurnBid);

  const order = playOrderFrom(jud.leaderPeer ?? seats[0]?.peerId ?? '', seats.map((p) => p.peerId));
  const myExpected = jud.phase === 'play' ? (order[jud.currentTrick.length] ?? null) : null;
  const myTurnPlay = myExpected === selfId;
  const leadSuit = jud.currentTrick.length > 0 ? jud.currentTrick[0].card.suit : null;
  const myTurn = myTurnBid || myTurnPlay;

  const sendBid = (bid: number) => {
    setPendingBid(bid);
    act({ kind: 'bid', bid });
  };
  const sendPlay = (card: Card) => {
    setPendingPlay(cardId(card));
    act({ kind: 'play', card });
  };

  const sortedScores = [...seats].sort((a, b) => (jud.scores[b.peerId] ?? 0) - (jud.scores[a.peerId] ?? 0));
  const bidsTotal = Object.values(jud.bids).reduce((a, b) => a + b, 0);

  // current trick leader (works mid-trick too — best card so far)
  const trickLeader = jud.currentTrick.length > 0 ? trickWinner(jud.currentTrick, jud.trump) : null;
  const leadPlay = jud.currentTrick.find((t) => t.peerId === trickLeader) ?? null;

  const turnLabel =
    jud.phase === 'bid'
      ? myTurnBid ? 'Your bid' : `${nameOf(jud.turnPeer)} to bid`
      : jud.phase === 'play'
        ? myTurnPlay ? 'Your play' : `${nameOf(jud.turnPeer)} to play`
        : 'Game over';

  return (
    <div className="space-y-3" data-game="judgement">
      {/* table header */}
      <div className="panel cut">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-3xl flex items-center gap-2">
            <Spade size={24} /> Judgement
          </span>
          <span className="ml-auto text-xs font-mono text-white/60">{roomCode}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-white/10 px-3 py-1 font-semibold">Round {jud.roundIndex + 1}/10</span>
          <span className="rounded-full bg-white/10 px-3 py-1 font-semibold">{jud.handSize} card{jud.handSize === 1 ? '' : 's'}</span>
          <span className="rounded-full bg-emerald-300/15 px-3 py-1 font-bold text-emerald-200 ring-1 ring-emerald-300/40">
            {jud.trump ? (
              <>Trump <span className={SUIT_TEXT[jud.trump]}>{SUIT_SYMBOL[jud.trump]} {SUIT_NAME[jud.trump]}</span></>
            ) : (
              'No Trump'
            )}
          </span>
          <span className={`rounded-full px-3 py-1 font-bold ${myTurn && jud.phase !== 'ended' ? 'bg-amber-300 text-black' : 'bg-white/10 text-white/80'}`}>
            {myTurn && jud.phase !== 'ended' && <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-black align-middle" />}
            {turnLabel}
          </span>
        </div>
      </div>

      <Collapse
        title="Trump schedule"
        badge={<span className="text-white/50">all 10 rounds</span>}
        defaultOpen={jud.roundIndex === 0 && jud.phase === 'bid'}
      >
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          {TRUMP_SCHEDULE.map((t, i) => {
            const active = i === jud.roundIndex;
            return (
              <div
                key={i}
                className={`rounded-lg px-2 py-1.5 text-center text-[13px] font-semibold ${
                  active
                    ? 'bg-amber-300 text-black shadow-[0_0_16px_rgba(252,211,77,0.35)]'
                    : 'bg-black/40 text-white/65'
                }`}
              >
                <span className="opacity-70">R{i + 1}</span> · {10 - i}c ·{' '}
                <span className={t ? (active ? '' : SUIT_TEXT[t]) : ''}>{t ? `${SUIT_SYMBOL[t]}` : 'NT'}</span>
              </div>
            );
          })}
        </div>
      </Collapse>

      {/* bidding */}
      {jud.phase === 'bid' && (
        <div className="panel cut space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {jud.order.map((id) => {
              const bid = jud.bids[id];
              const turn = jud.turnPeer === id;
              const pending = id === selfId && pendingBid !== null && bid === undefined;
              return (
                <span
                  key={id}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
                    turn
                      ? 'bg-amber-300 text-black ring-2 ring-amber-100'
                      : bid !== undefined
                        ? 'bg-emerald-300/15 text-emerald-100 ring-1 ring-emerald-300/40'
                        : 'bg-white/5 text-white/50'
                  } ${pending ? 'animate-pulse' : ''}`}
                >
                  {nameOf(id)}
                  {id === selfId ? ' (you)' : ''}
                  <span className="font-mono font-bold">{pending ? `${pendingBid}…` : bid !== undefined ? bid : '·'}</span>
                </span>
              );
            })}
            <span className="ml-auto text-xs text-white/50">
              bids total {bidsTotal}/{jud.handSize}
            </span>
          </div>
          {myTurnBid ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: jud.handSize + 1 }, (_, b) => {
                  const illegal = !isBidLegal(b, existingTotal, jud.handSize, isLastBidder);
                  const pending = pendingBid === b;
                  return (
                    <button
                      key={b}
                      disabled={illegal}
                      onClick={() => sendBid(b)}
                      aria-label={`Bid ${b}`}
                      className={`h-12 min-w-12 rounded-xl px-3 font-mono text-lg font-bold transition-all active:scale-95 ${
                        pending
                          ? 'animate-pulse bg-amber-300 text-black ring-2 ring-amber-100'
                          : illegal
                            ? 'cursor-not-allowed bg-white/5 text-white/25 line-through'
                            : 'bg-emerald-300 text-black shadow-[0_0_16px_rgba(52,211,153,0.35)] hover:bg-emerald-200'
                      }`}
                    >
                      {pending ? `${b}…` : b}
                    </button>
                  );
                })}
              </div>
              {forbidden !== null ? (
                <p className="text-[13px] font-semibold text-amber-200">
                  Last-bid rule: {existingTotal} bid so far of {jud.handSize} tricks — {forbidden} is off the table (bids must not sum to tricks).
                </p>
              ) : (
                <p className="text-[13px] text-white/50">
                  {isLastBidder
                    ? 'You bid last — any number that keeps bids off the trick total.'
                    : 'Bid how many tricks you will win exactly. Exact = 10 + bid, else 0.'}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-white/60">
              {jud.turnPeer ? `Waiting on ${nameOf(jud.turnPeer)}${isBot(jud.turnPeer) ? ' (bot)' : ''}…` : 'Bidding…'}
            </p>
          )}
        </div>
      )}

      {/* trick table */}
      {jud.phase === 'play' && (
        <div className="panel cut space-y-3">
          <div className="text-sm font-bold">
            Trick {jud.trickIndex}/{jud.handSize}
            {leadSuit ? <> · led <span className={SUIT_TEXT[leadSuit]}>{SUIT_NAME[leadSuit]} {SUIT_SYMBOL[leadSuit]}</span></> : null}
            <span className="font-normal text-white/55"> · {myTurnPlay ? 'your play' : `${nameOf(jud.turnPeer)} to play`}</span>
          </div>
          {jud.currentTrick.length === 0 ? (
            <p className="text-sm text-white/55">{nameOf(jud.leaderPeer)} leads any card.</p>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              {/* pile — tap to expand */}
              <button
                type="button"
                onClick={() => setPileOpen((o) => !o)}
                aria-label={pileOpen ? 'Collapse played cards' : 'Expand played cards'}
                className="rounded-xl bg-black/30 p-2 text-left ring-1 ring-white/10 transition-colors hover:bg-black/40"
              >
                {!pileOpen ? (
                  <span className="relative block h-[104px]">
                    {jud.currentTrick.map((t, i) => {
                      const winning = t.peerId === trickLeader;
                      return (
                        <span
                          key={t.peerId}
                          className="absolute top-0"
                          style={{ left: `${i * 30}px`, zIndex: i }}
                        >
                          <span
                            className={`block ${winning ? '-translate-y-1.5 rounded-[9px] ring-2 ring-emerald-300 shadow-[0_0_14px_rgba(52,211,153,0.5)]' : ''}`}
                            style={{ transform: `rotate(${(i % 5 - 2) * 5}deg)` }}
                            title={`${nameOf(t.peerId)}: ${t.card.rank}${SUIT_SYMBOL[t.card.suit]}`}
                          >
                            <CardFace card={t.card} small />
                          </span>
                        </span>
                      );
                    })}
                  </span>
                ) : (
                  <span className="flex flex-wrap gap-3">
                    {jud.currentTrick.map((t) => (
                      <span key={t.peerId} className="flex flex-col items-center gap-1">
                        <span className={t.peerId === trickLeader ? 'rounded-[9px] ring-2 ring-emerald-300' : ''}>
                          <CardFace card={t.card} small />
                        </span>
                        <span className="max-w-[72px] truncate text-[11px] text-white/70">
                          {nameOf(t.peerId)}{t.peerId === trickLeader ? ' ★' : ''}
                        </span>
                      </span>
                    ))}
                  </span>
                )}
                <span className="mt-1 block text-[11px] text-white/45">
                  {pileOpen ? '▾ tap to stack' : '▸ tap to see every card'}
                </span>
              </button>
              {/* current winner, side */}
              <div className="flex flex-col items-center gap-1 rounded-xl bg-emerald-300/10 px-2.5 py-2 ring-1 ring-emerald-300/40">
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-200/80">Winning</span>
                {leadPlay ? (
                  <>
                    <CardFace card={leadPlay.card} small />
                    <span className="max-w-[76px] truncate text-center text-[11px] font-semibold text-emerald-100">
                      {nameOf(trickLeader)}
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] text-white/40">—</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* hand */}
      {jud.phase !== 'ended' && (
        <div className="panel cut space-y-2">
          <div className="text-sm font-bold">
            Your hand <span className="font-normal text-white/50">({hand.length})</span>
            {myTurnPlay && leadSuit && (
              <span className="ml-2 text-[12px] font-semibold text-amber-200">
                follow {SUIT_NAME[leadSuit]} if you can
              </span>
            )}
          </div>
          {hand.length === 0 ? (
            <p className="text-[13px] text-white/50">Waiting for the deal…</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {hand.map((c) => {
                const key = cardId(c);
                const legal = !myTurnPlay || isPlayLegal(hand, c, leadSuit);
                const pending = pendingPlay === key;
                return (
                  <span key={key} className={pending ? '-translate-y-2' : ''}>
                    <CardFace
                      card={c}
                      dimmed={(myTurnPlay && !legal) || pending}
                      selected={pending}
                      playable={!!(myTurnPlay && legal && !pending)}
                      onClick={myTurnPlay && legal && !pending ? () => sendPlay(c) : undefined}
                    />
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ended */}
      {jud.phase === 'ended' && (
        <div className="panel cut space-y-2">
          <div className="font-display text-4xl flex items-center gap-2">
            <Crown className="text-amber-300" /> {jud.winners.map(nameOf).join(', ')} wins!
          </div>
          <div className="space-y-1 text-[13px] text-white/70">
            {jud.history.map((h) => (
              <div key={h.roundIndex}>
                R{h.roundIndex + 1} ({10 - h.roundIndex}c):{' '}
                {Object.entries(h.points).map(([pid, pts]) => `${nameOf(pid)} +${pts}`).join(' · ')}
              </div>
            ))}
          </div>
          {isHost && (
            <button
              onClick={() => {
                try {
                  localStorage.removeItem(`bg-judhost-${roomCode}`);
                } catch {
                  /* ignore */
                }
                handsRef.current = {};
                seatLiveTable();
              }}
              className="btn-accent"
            >
              Play again
            </button>
          )}
        </div>
      )}

      <Collapse
        title="Scoreboard"
        badge={<span className="text-white/50">leader: {sortedScores.length > 0 ? nameOf(sortedScores[0].peerId) : '—'} {sortedScores.length > 0 ? (jud.scores[sortedScores[0].peerId] ?? 0) : ''}</span>}
        defaultOpen
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[380px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-white/45">
                <th className="py-1 pr-2 font-semibold">Player</th>
                <th className="py-1 pr-2 text-center font-semibold">Bid</th>
                <th className="py-1 pr-2 text-center font-semibold">Won</th>
                <th className="py-1 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {sortedScores.map((p, i) => {
                const turn = jud.turnPeer === p.peerId;
                const bid = jud.bids[p.peerId];
                const won = jud.tricksWon[p.peerId] ?? 0;
                const exact = bid !== undefined && bid === won;
                return (
                  <tr key={p.peerId} className={`border-t border-white/10 ${p.peerId === selfId ? 'text-emerald-200' : ''}`}>
                    <td className="py-1.5 pr-2 font-semibold">
                      {turn && jud.phase !== 'ended' && <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-amber-300 align-middle" />}
                      <span className="mr-1 text-white/35">{i + 1}.</span>
                      {p.name}
                      {p.peerId === selfId ? ' (you)' : ''}
                      {p.bot ? ' · bot' : ''}
                      {jud.winners.includes(p.peerId) && jud.phase === 'ended' && <Crown size={14} className="ml-1 inline text-amber-300" />}
                    </td>
                    <td className="py-1.5 pr-2 text-center font-mono">{bid ?? '–'}</td>
                    <td className={`py-1.5 pr-2 text-center font-mono ${exact ? 'font-bold text-emerald-300' : ''}`}>{won}</td>
                    <td className="py-1.5 text-right font-mono font-bold">{jud.scores[p.peerId] ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[12px] text-white/45">
          Bid order: {jud.order.map(nameOf).join(' → ')} · exact bid = 10 + bid, else 0.
        </p>
      </Collapse>

      <Collapse title="Table log" defaultOpen={false}>
        <div className="max-h-36 space-y-0.5 overflow-y-auto text-[13px] text-white/65">
          {[...jud.log].reverse().map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </Collapse>

      <div className="flex gap-2">
        <button onClick={onExit} className="ml-auto rounded border border-white/20 px-3 py-1.5 text-xs text-white/70">
          Back to lobby
        </button>
      </div>
    </div>
  );
}
