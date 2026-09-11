import { useEffect, useRef, useState } from 'react';
import { Crown, Spade } from 'lucide-react';
import {
  RANK_VALUE,
  SUIT_NAME,
  SUIT_SYMBOL,
  TRUMP_SCHEDULE,
  bidOrderForRound,
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
import { CardBack, CardFace } from './PlayingCards';

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

function botCard(hand: Card[], leadSuit: Suit | null, trick: { peerId: string; card: Card }[], trump: Suit | null): Card {
  const legal = hand.filter((c) =>
    // replicate follow-suit without importing internals twice
    leadSuit && hand.some((h) => h.suit === leadSuit) ? c.suit === leadSuit : true,
  );
  const pool = legal.length > 0 ? legal : [...hand];
  if (trick.length === 0) {
    return pool.reduce((a, b) => (RANK_VALUE[a.rank] <= RANK_VALUE[b.rank] ? a : b));
  }
  const led = trick[0].card.suit;
  const bestPeer = (() => {
    try {
      return trickWinner(trick, trump);
    } catch {
      return null;
    }
  })();
  const best = trick.find((t) => t.peerId === bestPeer)?.card;
  const suitPool = pool.filter((c) => c.suit === led);
  const candidates = suitPool.length > 0 ? suitPool : pool.filter((c) => trump && c.suit === trump);
  if (best && candidates.length > 0) {
    const beat = candidates
      .filter((c) =>
        best.suit === (trump ?? '\0') && c.suit !== trump
          ? false
          : c.suit === best.suit
            ? RANK_VALUE[c.rank] > RANK_VALUE[best.rank]
            : c.suit === trump && best.suit !== trump,
      )
      .sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
    if (beat.length > 0) return beat[0];
  }
  return pool.reduce((a, b) => (RANK_VALUE[a.rank] <= RANK_VALUE[b.rank] ? a : b));
}

export default function Judgement({
  handle,
  roomCode,
  name,
  isHost,
  initialRoster,
  onExit,
  onAddBot,
  onRemoveBot,
}: Props) {
  const selfId = handle.selfId;
  const [jud, setJud] = useState<JUDPublic | null>(null);
  const [hand, setHand] = useState<Card[]>(() => {
    try {
      const s = JSON.parse(localStorage.getItem(`bg-judhand-${roomCode}`) ?? 'null');
      if (s && s.round === 0 && Array.isArray(s.cards)) return s.cards as Card[];
      if (s && Array.isArray(s.cards)) return s.cards as Card[];
    } catch {
      /* none */
    }
    return [];
  });

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

  const startRound = (roundIndex: number, keepScores: Record<string, number>, history: JUDPublic['history'], players: Player[]) => {
    const seats = players.map((p) => p.peerId);
    const handSize = handSizeForRound(roundIndex);
    const trump = trumpForRound(roundIndex);
    const order = bidOrderForRound(seats, roundIndex);
    handsRef.current = dealHands(seats, handSize);
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
        `Round ${roundIndex + 1}/10 — ${handSize} card${handSize === 1 ? '' : 's'}, trump: ${trump ? SUIT_NAME[trump] : 'No Trump'}. ${nameOf(order[0])} bids first.`,
      ].slice(-60),
    };
    judRef.current = next;
    setJud(next);
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
    setTimeout(() => botTakeTurn(t), 700);
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
      const card = botCard(handCards, leadSuit, cur.currentTrick, cur.trump);
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

  const initGame = () => {
    // host refresh recovery
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
        return;
      }
    } catch {
      /* fresh game */
    }
    const players = initialRoster.map((p) => ({ ...p, alive: true, online: true }));
    const scores: Record<string, number> = {};
    players.forEach((p) => {
      scores[p.peerId] = 0;
    });
    judRef.current = {
      phase: 'bid',
      players,
      roundIndex: 0,
      handSize: 0,
      trump: null,
      order: [],
      bids: {},
      tricksWon: {},
      scores,
      history: [],
      turnPeer: null,
      leaderPeer: null,
      trickIndex: 0,
      currentTrick: [],
      winners: [],
      log: ['Judgement table opening…'],
    };
    startRound(0, scores, [], players);
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
        const timer = setTimeout(() => botTakeTurn(t), 700);
        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jud?.turnPeer, jud?.phase, jud?.trickIndex]);

  if (!jud) {
    return (
      <div className="panel cut space-y-2" data-game="judgement">
        <p className="text-sm text-white/70">Connecting to the Judgement table… ({name})</p>
        {!isHost && (
          <button
            onClick={() => sendersRef.current?.act({ kind: 'sync', client: getClient() })}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-sm"
          >
            Retry join
          </button>
        )}
      </div>
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

  const sendBid = (bid: number) =>
    sendersRef.current?.act({ kind: 'bid', bid, client: getClient() });
  const sendPlay = (card: Card) =>
    sendersRef.current?.act({ kind: 'play', card, client: getClient() });

  const sortedScores = [...seats].sort((a, b) => (jud.scores[b.peerId] ?? 0) - (jud.scores[a.peerId] ?? 0));

  return (
    <div className="space-y-3" data-game="judgement">
      {/* table header */}
      <div className="panel cut">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-2xl flex items-center gap-2">
            <Spade size={22} /> Judgement
          </span>
          <span className="ml-auto text-xs font-mono text-white/60">{roomCode}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-white/10 px-2 py-1">Round {jud.roundIndex + 1}/10</span>
          <span className="rounded bg-white/10 px-2 py-1">{jud.handSize} card{jud.handSize === 1 ? '' : 's'}</span>
          <span className="rounded bg-emerald-300/20 px-2 py-1 font-bold text-emerald-200">
            Trump: {jud.trump ? `${SUIT_SYMBOL[jud.trump]} ${SUIT_NAME[jud.trump]}` : 'No Trump'}
          </span>
          <span className="rounded bg-white/10 px-2 py-1">
            {jud.phase === 'bid' ? `Bidding — ${nameOf(jud.turnPeer)} to bid` : jud.phase === 'play' ? `Trick ${jud.trickIndex}/${jud.handSize} — ${nameOf(jud.turnPeer)} to play` : 'Game over'}
          </span>
        </div>
        {/* trump schedule */}
        <details className="mt-2 text-xs text-white/70" open={jud.roundIndex === 0 && jud.phase === 'bid'}>
          <summary className="cursor-pointer underline">Trump schedule (all 10 rounds)</summary>
          <div className="mt-1 grid grid-cols-5 gap-1">
            {TRUMP_SCHEDULE.map((t, i) => (
              <span
                key={i}
                className={`rounded px-1 py-1 text-center ${i === jud.roundIndex ? 'bg-amber-300 font-bold text-black' : 'bg-black/40'}`}
              >
                R{i + 1}: {10 - i}c · {t ? SUIT_SYMBOL[t] : 'NT'}
              </span>
            ))}
          </div>
        </details>
      </div>

      {/* scoreboard */}
      <div className="panel cut overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-white/50">
              <th className="py-1 pr-2">Player</th>
              <th className="py-1 pr-2 text-center">Bid</th>
              <th className="py-1 pr-2 text-center">Won</th>
              <th className="py-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {sortedScores.map((p) => {
              const turn = jud.turnPeer === p.peerId;
              return (
                <tr key={p.peerId} className={`border-t border-white/10 ${p.peerId === selfId ? 'text-emerald-200' : ''}`}>
                  <td className="py-1.5 pr-2 font-semibold">
                    {turn && <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-300 align-middle" />}
                    {p.name}
                    {p.peerId === selfId ? ' (you)' : ''}
                    {p.bot ? ' · bot' : ''}
                    {jud.winners.includes(p.peerId) && jud.phase === 'ended' && <Crown size={14} className="ml-1 inline text-amber-300" />}
                  </td>
                  <td className="py-1.5 pr-2 text-center font-mono">{jud.bids[p.peerId] ?? '–'}</td>
                  <td className="py-1.5 pr-2 text-center font-mono">{jud.tricksWon[p.peerId] ?? 0}</td>
                  <td className="py-1.5 text-right font-mono font-bold">{jud.scores[p.peerId] ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-white/50">
          Bid order this round: {jud.order.map(nameOf).join(' → ')}. Score = 10 + bid on exact, else 0.
        </p>
      </div>

      {/* bidding controls */}
      {jud.phase === 'bid' && (
        <div className="panel cut space-y-2">
          <div className="text-sm font-bold">Your bid {myTurnBid ? '— your turn' : `— waiting on ${nameOf(jud.turnPeer)}`}</div>
          {myTurnBid ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: jud.handSize + 1 }, (_, b) => {
                  const illegal = !isBidLegal(b, existingTotal, jud.handSize, isLastBidder);
                  return (
                    <button
                      key={b}
                      disabled={illegal}
                      onClick={() => sendBid(b)}
                      className={`h-10 w-10 rounded-lg font-mono font-bold ${illegal ? 'cursor-not-allowed bg-white/5 text-white/25 line-through' : 'bg-emerald-300 text-black hover:bg-emerald-200'}`}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>
              {forbidden !== null && (
                <p className="text-xs text-amber-200">
                  Last-bid rule: bids so far total {existingTotal} of {jud.handSize} — you cannot bid {forbidden} (sum must not equal tricks).
                </p>
              )}
            </>
          ) : (
            <div className="flex gap-1.5">
              {hand.slice(0, 3).map((_, i) => (
                <CardBack key={i} small />
              ))}
              <span className="self-center text-xs text-white/50">Your {hand.length} cards are dealt below.</span>
            </div>
          )}
        </div>
      )}

      {/* current trick */}
      {jud.phase === 'play' && (
        <div className="panel cut space-y-2">
          <div className="text-sm font-bold">
            Trick {jud.trickIndex}/{jud.handSize} — led {leadSuit ? SUIT_NAME[leadSuit] : '—'} · {myTurnPlay ? 'your turn' : `${nameOf(jud.turnPeer)} to play`}
          </div>
          {jud.currentTrick.length === 0 ? (
            <p className="text-xs text-white/50">{nameOf(jud.leaderPeer)} leads any card.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {jud.currentTrick.map((t) => (
                <div key={t.peerId} className="flex flex-col items-center gap-1">
                  <CardFace card={t.card} small />
                  <span className="max-w-[64px] truncate text-[11px] text-white/70">{nameOf(t.peerId)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* hand */}
      {jud.phase !== 'ended' && (
        <div className="panel cut space-y-2">
          <div className="text-sm font-bold">Your hand ({hand.length})</div>
          {hand.length === 0 ? (
            <p className="text-xs text-white/50">Waiting for the deal…</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {hand.map((c) => {
                const key = `${c.rank}${c.suit}`;
                const legal = !myTurnPlay || isPlayLegal(hand, c, leadSuit);
                return (
                  <CardFace
                    key={key}
                    card={c}
                    dimmed={myTurnPlay && !legal}
                    playable={myTurnPlay && legal}
                    onClick={myTurnPlay && legal ? () => sendPlay(c) : undefined}
                  />
                );
              })}
            </div>
          )}
          {myTurnPlay && leadSuit && (
            <p className="text-[11px] text-white/50">You must follow {SUIT_NAME[leadSuit]} if you have it — other cards are dimmed.</p>
          )}
        </div>
      )}

      {/* ended */}
      {jud.phase === 'ended' && (
        <div className="panel cut space-y-2">
          <div className="font-display text-3xl flex items-center gap-2">
            <Crown className="text-amber-300" /> {jud.winners.map(nameOf).join(', ')} wins!
          </div>
          <div className="space-y-1 text-xs text-white/70">
            {jud.history.map((h) => (
              <div key={h.roundIndex}>
                R{h.roundIndex + 1} ({10 - h.roundIndex}c):{' '}
                {Object.entries(h.points).map(([pid, pts]) => `${nameOf(pid)} +${pts}`).join(' · ')}
              </div>
            ))}
          </div>
          {isHost && (
            <button onClick={() => initGame()} className="btn-accent">
              Play again
            </button>
          )}
        </div>
      )}

      {/* log */}
      <div className="panel cut space-y-1">
        <div className="text-xs uppercase text-white/40">Table log</div>
        <div className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-white/65">
          {[...jud.log].reverse().map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        {isHost && jud.phase === 'bid' && jud.roundIndex === 0 && Object.keys(jud.bids).length === 0 && (
          <>
            <button onClick={onAddBot} className="rounded border border-dashed border-white/30 px-3 py-1.5 text-xs">
              + Add bot
            </button>
            {seats.filter((p) => p.bot).map((p) => (
              <button key={p.peerId} onClick={() => onRemoveBot(p.peerId)} className="rounded border border-white/20 px-2 py-1.5 text-xs">
                Remove {p.name}
              </button>
            ))}
          </>
        )}
        <button onClick={onExit} className="ml-auto rounded border border-white/20 px-3 py-1.5 text-xs text-white/70">
          Back to lobby
        </button>
      </div>
    </div>
  );
}
