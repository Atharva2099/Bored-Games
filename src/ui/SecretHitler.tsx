import { useEffect, useRef, useState } from 'react';
import { Crown, Eye, Flame, Gavel, Repeat, ScrollText, Search, Skull, Users, Vote } from 'lucide-react';
import {
  assignSHRoles,
  buildPolicyDeck,
  checkSHWinner,
  drawThree,
  eligibleChancellors,
  hitlerChancellorWins,
  powerForSlot,
  resolveSHElection,
  shKnowledge,
  vetoUnlocked,
  type Policy,
  type Power,
  type SHRole,
} from '../game/secret-hitler/logic';
import type { Player } from '../net/presence';
import {
  type RoomHandle,
  type SHActMsg,
  type SHPublic,
} from '../net/transport';
import { speakCue } from './narrate';
import { InvitePanel } from './Invite';

const ROLE_BLURB: Record<SHRole, string> = {
  liberal: 'Pass liberal policies. Find your allies — talk is your weapon.',
  fascist: 'You know Hitler. Sabotage elections and policy, don\u2019t get caught.',
  hitler:
    'The fascists know you. Lie low, get elected Chancellor after 3 fascist policies to win.',
};

const ROLE_LABEL: Record<SHRole, string> = {
  liberal: 'Liberal',
  fascist: 'Fascist',
  hitler: 'HITLER',
};

function getClient(): string {
  let c = null;
  try {
    c = localStorage.getItem('bg-client');
  } catch {
    /* ignore */
  }
  return c ?? '';
}

interface Senders {
  shpub: (d: unknown, target?: string | string[]) => void;
  shrole: (d: unknown, target?: string | string[]) => void;
  shcards: (d: unknown, target?: string | string[]) => void;
  shinfo: (d: unknown, target?: string | string[]) => void;
  shact: (d: unknown, target?: string | string[]) => void;
}

interface Props {
  handle: RoomHandle;
  roomCode: string;
  name: string;
  isHost: boolean;
  initialRoster: Player[];
  onExit: () => void;
}

export default function SecretHitler({
  handle,
  roomCode,
  name,
  isHost,
  initialRoster,
  onExit,
}: Props) {
  const selfId = handle.selfId;
  const clientId = getClient();

  const [sh, setSh] = useState<SHPublic | null>(null);
  const [myRole, setMyRole] = useState<SHRole | null>(() => {
    try {
      const s = JSON.parse(localStorage.getItem('bg-shrole') ?? 'null');
      if (s && s.room === roomCode && typeof s.role === 'string') {
        return s.role as SHRole;
      }
    } catch {
      /* none */
    }
    return null;
  });
  const [knownNames, setKnownNames] = useState<string[]>(() => {
    try {
      const s = JSON.parse(localStorage.getItem('bg-shrole') ?? 'null');
      if (s && s.room === roomCode && Array.isArray(s.knownNames))
        return s.knownNames as string[];
    } catch {
      /* none */
    }
    return [];
  });
  const [myCards, setMyCards] = useState<{
    cards: Policy[];
    context: 'pres-draw' | 'chanc-hand' | 'peek';
  } | null>(null);
  const [myInfo, setMyInfo] = useState<string | null>(null);
  const [shError, setShError] = useState<string | null>(null);

  // ---- host truth ----
  const rolesRef = useRef<Record<string, SHRole>>({});
  const deckRef = useRef<Policy[]>([]);
  const discardsRef = useRef<Policy[]>([]);
  const drawnRef = useRef<Policy[]>([]);
  const holderRef = useRef<{
    peerId: string;
    context: 'pres-draw' | 'chanc-hand';
  } | null>(null);
  const votesRef = useRef<Record<string, boolean>>({});
  const investigatedRef = useRef<Set<string>>(new Set());
  const specialCallerRef = useRef<string | null>(null);
  const specialActiveRef = useRef(false);
  const peerToClient = useRef<Record<string, string>>({});
  const seatByClient = useRef<Record<string, string>>({});
  const sendersRef = useRef<Senders | null>(null);
  const shRef = useRef<SHPublic | null>(null);
  const isHostRef = useRef(isHost);
  const initedRef = useRef(false);
  isHostRef.current = isHost;

  const push = (patch: Partial<SHPublic>, target?: string | string[]) => {
    const cur = shRef.current;
    if (!cur) return;
    const next: SHPublic = {
      ...cur,
      ...patch,
      drawCount: deckRef.current.length,
      discCount: discardsRef.current.length,
    };
    shRef.current = next;
    setSh(next);
    const s = sendersRef.current;
    if (!s) return;
    if (target) void s.shpub(next as unknown as Record<string, unknown>, target);
    else void s.shpub(next as unknown as Record<string, unknown>);
  };

  /** private delivery that also works when the host IS the recipient */
  const tell = (
    peerId: string,
    kind: 'shrole' | 'shcards' | 'shinfo',
    payload: Record<string, unknown>,
  ) => {
    if (peerId === selfId) {
      if (kind === 'shrole') {
        const r = payload as { role: SHRole; knownNames: string[] };
        setMyRole(r.role);
        setKnownNames(r.knownNames);
        try {
          localStorage.setItem(
            'bg-shrole',
            JSON.stringify({ room: roomCode, ...r }),
          );
        } catch {
          /* ignore */
        }
      } else if (kind === 'shcards') {
        setMyCards(
          payload as { cards: Policy[]; context: 'pres-draw' | 'chanc-hand' | 'peek' },
        );
      } else {
        setMyInfo((payload as { text: string }).text);
      }
      return;
    }
    const s = sendersRef.current;
    if (!s) return;
    void s[kind](payload, peerId);
  };

  const nameOf = (peerId: string | null): string =>
    shRef.current?.players.find((p) => p.peerId === peerId)?.name ?? '?';

  const aliveAfter = (fromId: string | null): string | null => {
    const order = shRef.current?.players ?? [];
    const alive = order.filter((p) => p.alive);
    if (alive.length === 0) return null;
    if (!fromId) return alive[0].peerId;
    const idx = order.findIndex((p) => p.peerId === fromId);
    for (let i = 1; i <= order.length; i++) {
      const cand = order[(idx + i) % order.length];
      if (cand && cand.alive) return cand.peerId;
    }
    return null;
  };

  const advance = (base: SHPublic): SHPublic => {
    const next = specialActiveRef.current
      ? aliveAfter(specialCallerRef.current)
      : aliveAfter(base.presidentId);
    specialActiveRef.current = false;
    specialCallerRef.current = null;
    return {
      ...base,
      presidentId: next,
      chancellorId: null,
      votes: {},
      vetoOffered: false,
      pendingPower: null,
      log: next
        ? [...base.log, `${nameOf(next)} is the next presidential candidate.`]
        : base.log,
    };
  };

  /** enact a policy tile; forced (chaos) grants no power but wins count */
  const enact = (base: SHPublic, policy: Policy, forced: boolean): SHPublic => {
    const libTrack = base.libTrack + (policy === 'liberal' ? 1 : 0);
    const fasTrack = base.fasTrack + (policy === 'fascist' ? 1 : 0);
    const winner = checkSHWinner({
      libTrack,
      fasTrack,
      hitlerIsChancellor: false,
      hitlerExecuted: false,
    });
    const label =
      policy === 'liberal' ? 'LIBERAL policy enacted' : 'FASCIST policy enacted';
    let next: SHPublic = {
      ...base,
      libTrack,
      fasTrack,
      log: [...base.log, forced ? `${label} by chaos.` : `${label}.`],
    };
    if (winner) {
      return {
        ...next,
        phase: 'ended',
        winner,
        log: [...next.log, `${winner} win!`],
      };
    }
    if (!forced && policy === 'fascist') {
      const power = powerForSlot(base.players.length, fasTrack);
      if (power) {
        next = { ...next, phase: 'power', pendingPower: power };
        if (power === 'peek') {
          const view = deckRef.current.slice(0, 3);
          const pres = next.presidentId;
          if (pres)
            tell(pres, 'shcards', { cards: view, context: 'peek' });
        }
        return next;
      }
    }
    return { ...advance(next), phase: 'nominate' };
  };

  /** failed election tracker; 3 in a row force-enacts the top tile */
  const failTracker = (base: SHPublic): SHPublic => {
    const tracker = base.tracker + 1;
    if (tracker < 3) {
      return {
        ...advance({ ...base, tracker }),
        phase: 'nominate',
        log: [...base.log, `Election failed (${tracker}/3).`],
      };
    }
    if (deckRef.current.length < 1) {
      deckRef.current = [...deckRef.current, ...discardsRef.current].sort(
        () => Math.random() - 0.5,
      );
      discardsRef.current = [];
    }
    const top = deckRef.current[0] ?? 'fascist';
    deckRef.current = deckRef.current.slice(1);
    const cleared: SHPublic = {
      ...base,
      tracker: 0,
      lastPresidentId: null,
      lastChancellorId: null,
      log: [...base.log, 'Three failed elections — chaos! Top policy enacted, term limits cleared.'],
    };
    return enact(cleared, top, true);
  };

  const finishPower = (base: SHPublic): SHPublic => ({
    ...advance({ ...base, pendingPower: null }),
    phase: 'nominate',
  });

  // ---------- host message handling ----------
  const rekeySeat = (oldPeer: string, newPeer: string) => {
    if (rolesRef.current[oldPeer] !== undefined) {
      rolesRef.current[newPeer] = rolesRef.current[oldPeer];
      delete rolesRef.current[oldPeer];
    }
    const cur = shRef.current;
    if (cur) {
      cur.players = cur.players.map((p) =>
        p.peerId === oldPeer ? { ...p, peerId: newPeer, online: true } : p,
      );
    }
    if (holderRef.current?.peerId === oldPeer) {
      const holder = { ...holderRef.current, peerId: newPeer };
      holderRef.current = holder;
      // re-deal the tiles already in transit
      const s = sendersRef.current;
      if (s && drawnRef.current.length > 0)
        void s.shcards(
          { cards: [...drawnRef.current], context: holder.context },
          newPeer,
        );
    }
    const role = rolesRef.current[newPeer];
    if (role) {
      const k = shKnowledge(rolesRef.current);
      const names = k
        .knownFascistsFor(newPeer)
        .map((id) => rolesRef.current[id] ? nameOf(id) : id);
      void tell(newPeer, 'shrole', { role, knownNames: names });
    }
  };

  const doAct = (m: SHActMsg, fromPeer: string) => {
    const cur = shRef.current;
    if (!cur) return;
    if (m.client) {
      const known = seatByClient.current[m.client];
      if (known && known !== fromPeer) {
        rekeySeat(known, fromPeer);
      }
      seatByClient.current[m.client] = fromPeer;
      peerToClient.current[fromPeer] = m.client;
    }
    const seated =
      m.kind === 'sync' ||
      cur.players.some((p) => p.peerId === fromPeer);
    if (m.kind === 'sync') {
      const s = sendersRef.current;
      if (s)
        void s.shpub(cur as unknown as Record<string, unknown>, fromPeer);
      return;
    }
    if (!seated) return;

    if (m.kind === 'nominate' && cur.phase === 'nominate') {
      const t = m.targetId ?? null;
      if (
        !t ||
        t === cur.presidentId ||
        !cur.players.some((p) => p.peerId === t && p.alive)
      )
        return;
      const aliveIds = cur.players.filter((p) => p.alive).map((p) => p.peerId);
      if (!eligibleChancellors(aliveIds, cur.lastPresidentId, cur.lastChancellorId).includes(t))
        return;
      votesRef.current = {};
      push({
        chancellorId: t,
        phase: 'vote',
        votes: {},
        log: [...cur.log, `${nameOf(cur.presidentId)} nominates ${nameOf(t)}.`],
      });
      return;
    }

    if (m.kind === 'vote' && cur.phase === 'vote' && typeof m.ja === 'boolean') {
      const voter = m.client || fromPeer;
      const me = cur.players.find((p) => p.peerId === fromPeer);
      if (me && !me.alive) return;
      votesRef.current[voter] = m.ja;
      const aliveCount = cur.players.filter((p) => p.alive).length;
      const patch: Partial<SHPublic> = { votes: { ...votesRef.current } };
      if (Object.keys(votesRef.current).length >= aliveCount) {
        resolveElection({ ...cur, ...patch });
        return;
      }
      push(patch);
      return;
    }

    if (m.kind === 'pres-discard' && cur.phase === 'legis-pres') {
      if (fromPeer !== cur.presidentId || drawnRef.current.length !== 3) return;
      const i = m.index ?? -1;
      if (i < 0 || i > 2) return;
      const [a, b, c] = drawnRef.current;
      const kept = [a, b, c].filter((_, k) => k !== i);
      discardsRef.current.push(drawnRef.current[i]);
      drawnRef.current = kept;
      holderRef.current = cur.chancellorId
        ? { peerId: cur.chancellorId, context: 'chanc-hand' }
        : null;
      if (cur.chancellorId)
        tell(cur.chancellorId, 'shcards', { cards: kept, context: 'chanc-hand' });
      setMyCards(null);
      push({ phase: 'legis-chanc', log: [...cur.log, 'President discarded. Chancellor to enact.'] });
      return;
    }

    if (m.kind === 'chanc-enact' && cur.phase === 'legis-chanc') {
      if (fromPeer !== cur.chancellorId || drawnRef.current.length !== 2) return;
      const i = m.index ?? -1;
      if (i < 0 || i > 1) return;
      const enacted = drawnRef.current[i];
      discardsRef.current.push(drawnRef.current[1 - i]);
      drawnRef.current = [];
      holderRef.current = null;
      setMyCards(null);
      push(enact(cur, enacted, false));
      return;
    }

    if (m.kind === 'veto-propose' && cur.phase === 'legis-chanc') {
      if (fromPeer !== cur.chancellorId || !vetoUnlocked(cur.fasTrack)) return;
      push({ vetoOffered: true, log: [...cur.log, 'Chancellor proposes VETO.'] });
      return;
    }

    if (m.kind === 'veto-consent' && cur.phase === 'legis-chanc' && cur.vetoOffered) {
      if (fromPeer !== cur.presidentId) return;
      if (m.agree) {
        discardsRef.current.push(...drawnRef.current);
        drawnRef.current = [];
        holderRef.current = null;
        setMyCards(null);
        const next = failTracker({ ...cur, vetoOffered: false });
        push(next);
      } else {
        push({ vetoOffered: false, log: [...cur.log, 'President refuses the veto — Chancellor must enact.'] });
      }
      return;
    }

    if (m.kind === 'power-target' && cur.phase === 'power' && cur.pendingPower) {
      if (fromPeer !== cur.presidentId) return;
      const t = m.targetId ?? null;
      const power = cur.pendingPower;
      if (power === 'peek') return;
      if (!t || !cur.players.some((p) => p.peerId === t && p.alive)) return;
      if (power === 'investigate') {
        if (investigatedRef.current.has(t)) return;
        investigatedRef.current.add(t);
        const party =
          rolesRef.current[t] === 'liberal' ? 'LIBERAL' : 'FASCIST';
        tell(cur.presidentId ?? '', 'shinfo', {
          text: `${nameOf(t)} is ${party}.`,
        });
        push(finishPower(cur));
        return;
      }
      if (power === 'special') {
        if (t === cur.presidentId) return;
        specialCallerRef.current = cur.presidentId;
        specialActiveRef.current = true;
        push({
          ...finishPower({ ...cur, presidentId: t }),
          presidentId: t,
          log: [...cur.log, `Special election: ${nameOf(t)} is next President.`],
        });
        return;
      }
      // execution
      if (t === cur.presidentId) return;
      const players = cur.players.map((p) =>
        p.peerId === t ? { ...p, alive: false } : p,
      );
      const hitlerDead = rolesRef.current[t] === 'hitler';
      if (hitlerDead) {
        push({
          players,
          phase: 'ended',
          winner: 'liberals',
          pendingPower: null,
          log: [...cur.log, `${nameOf(t)} was executed — HITLER is dead. Liberals win!`],
        });
        return;
      }
      push({
        ...finishPower({ ...cur, players }),
        log: [...cur.log, `${nameOf(t)} was executed.`],
      });
      return;
    }

    if (m.kind === 'power-done' && cur.phase === 'power') {
      if (fromPeer !== cur.presidentId) return;
      push(finishPower(cur));
    }
  };

  const resolveElection = (cur: SHPublic) => {
    const aliveIds = cur.players.filter((p) => p.alive).map((p) => p.peerId);
    const jaVoters = Object.entries(votesRef.current)
      .filter(([, v]) => v)
      .map(([client]) => seatByClient.current[client] ?? client);
    const pass = resolveSHElection(jaVoters, aliveIds);
    votesRef.current = {};
    if (!pass) {
      push(failTracker({ ...cur, votes: {} }));
      return;
    }
    // Hitler elected Chancellor after 3+ fascist policies ends it
    if (
      cur.chancellorId &&
      rolesRef.current[cur.chancellorId] === 'hitler' &&
      hitlerChancellorWins(cur.fasTrack)
    ) {
      push({
        votes: {},
        phase: 'ended',
        winner: 'fascists',
        log: [...cur.log, 'Hitler was elected Chancellor. Fascists win!'],
      });
      return;
    }
    const { drawn, deck, discards } = drawThree(deckRef.current, discardsRef.current);
    deckRef.current = deck;
    discardsRef.current = discards;
    drawnRef.current = drawn;
    holderRef.current = cur.presidentId
      ? { peerId: cur.presidentId, context: 'pres-draw' }
      : null;
    if (cur.presidentId)
      tell(cur.presidentId, 'shcards', { cards: drawn, context: 'pres-draw' });
    push({
      votes: {},
      tracker: 0,
      lastPresidentId: cur.presidentId,
      lastChancellorId: cur.chancellorId,
      phase: 'legis-pres',
      log: [...cur.log, 'Election passed. President draws 3 policies.'],
    });
  };

  const closeVote = () => {
    const cur = shRef.current;
    if (cur && cur.phase === 'vote') resolveElection(cur);
  };

  // ---------- wiring ----------
  useEffect(() => {
    const { room } = handle;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shpub = room.makeAction('shpub', { onMessage: (data: any) => setSh(data as unknown as SHPublic) });
    const shrole = room.makeAction('shrole', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onMessage: (data: any) => {
        const r = data as unknown as { role: SHRole; knownNames: string[] };
        setMyRole(r.role);
        setKnownNames(r.knownNames ?? []);
        try {
          localStorage.setItem(
            'bg-shrole',
            JSON.stringify({ room: roomCode, ...r }),
          );
        } catch {
          /* ignore */
        }
      },
    });
    const shcards = room.makeAction('shcards', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onMessage: (data: any) =>
        setMyCards(
          data as unknown as { cards: Policy[]; context: 'pres-draw' | 'chanc-hand' | 'peek' },
        ),
    });
    const shinfo = room.makeAction('shinfo', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onMessage: (data: any) =>
        setMyInfo((data as unknown as { text: string }).text ?? null),
    });
    const shact = room.makeAction('shact', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onMessage: (data: any, ctx: { peerId: string }) => {
        if (isHostRef.current) doAct(data as unknown as SHActMsg, ctx.peerId);
      },
    });

    sendersRef.current = {
      shpub: (d, t) =>
        void shpub.send(d as never, t ? { target: t } : undefined),
      shrole: (d, t) =>
        void shrole.send(d as never, t ? { target: t } : undefined),
      shcards: (d, t) =>
        void shcards.send(d as never, t ? { target: t } : undefined),
      shinfo: (d, t) =>
        void shinfo.send(d as never, t ? { target: t } : undefined),
      shact: (d, t) =>
        void shact.send(d as never, t ? { target: t } : undefined),
    };

    if (isHost && !initedRef.current) {
      initedRef.current = true;
      initSH();
    } else if (!isHost) {
      const t = setTimeout(
        () =>
          sendersRef.current?.shact({ kind: 'sync', client: getClient() }),
        600,
      );
      const retry = setInterval(() => {
        if (!shRef.current)
          sendersRef.current?.shact({ kind: 'sync', client: getClient() });
        else clearInterval(retry);
      }, 3000);
      return () => {
        clearTimeout(t);
        clearInterval(retry);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  // host persistence across refreshes
  useEffect(() => {
    if (isHost && sh) {
      try {
        localStorage.setItem(
          `bg-shhost-${roomCode}`,
          JSON.stringify({
            sh,
            roles: rolesRef.current,
            deck: deckRef.current,
            discards: discardsRef.current,
            drawn: drawnRef.current,
            investigated: [...investigatedRef.current],
            hostPeer: selfId,
          }),
        );
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sh]);

  // spoken phase cues
  const cuedPhase = sh?.phase;
  useEffect(() => {
    if (!sh || cuedPhase === 'nominate') return;
    try {
      if (localStorage.getItem('bg-sound') === '0') return;
    } catch {
      /* ignore */
    }
    if (cuedPhase === 'vote') speakCue('Vote. Ja or Nein.');
    else if (cuedPhase === 'legis-pres') speakCue('Legislative session. President discards one.');
    else if (cuedPhase === 'legis-chanc') speakCue('Chancellor enacts one policy.');
    else if (cuedPhase === 'power') speakCue('Presidential power.');
    else if (cuedPhase === 'ended' && sh.winner) speakCue(`${sh.winner} win.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuedPhase]);

  function initSH() {
    // restore after host refresh, else deal fresh
    try {
      const saved = JSON.parse(
        localStorage.getItem(`bg-shhost-${roomCode}`) ?? 'null',
      );
      if (saved && saved.sh && saved.roles && saved.hostPeer) {
        const oldPeer = saved.hostPeer as string;
        rolesRef.current = saved.roles as Record<string, SHRole>;
        if (oldPeer !== selfId && rolesRef.current[oldPeer] !== undefined) {
          rolesRef.current[selfId] = rolesRef.current[oldPeer];
          delete rolesRef.current[oldPeer];
        }
        deckRef.current = (saved.deck as Policy[]) ?? [];
        discardsRef.current = (saved.discards as Policy[]) ?? [];
        drawnRef.current = (saved.drawn as Policy[]) ?? [];
        investigatedRef.current = new Set<string>(saved.investigated ?? []);
        const players = (saved.sh.players as Player[]).map((p) =>
          p.peerId === oldPeer ? { ...p, peerId: selfId, online: true } : p,
        );
        const next: SHPublic = {
          ...(saved.sh as SHPublic),
          players,
          drawCount: deckRef.current.length,
          discCount: discardsRef.current.length,
          log: [...(saved.sh.log as string[]), 'Host rebooted.'].slice(-50),
        };
        shRef.current = next;
        setSh(next);
        const me = players.find((p) => p.peerId === selfId);
        if (me && rolesRef.current[selfId]) {
          setMyRole(rolesRef.current[selfId]);
          const k = shKnowledge(rolesRef.current);
          setKnownNames(
            k.knownFascistsFor(selfId).map((id) => nameOf(id)),
          );
        }
        const t = setTimeout(
          () =>
            sendersRef.current?.shpub(
              next as unknown as Record<string, unknown>,
            ),
          800,
        );
        void t;
        return;
      }
    } catch {
      /* fresh deal below */
    }

    const ids = initialRoster.map((p) => p.peerId);
    if (ids.length < 5 || ids.length > 10) {
      setShError(
        `Secret Hitler needs 5–10 players at the table — this room has ${ids.length}. Head back and invite more.`,
      );
      return;
    }
    const roles = assignSHRoles(ids);
    rolesRef.current = roles;
    deckRef.current = buildPolicyDeck();
    discardsRef.current = [];
    drawnRef.current = [];
    holderRef.current = null;
    votesRef.current = {};
    investigatedRef.current = new Set();
    specialCallerRef.current = null;
    specialActiveRef.current = false;
    const k = shKnowledge(roles);
    const names = (id: string) =>
      initialRoster.find((p) => p.peerId === id)?.name ?? '?';
    ids.forEach((id) => {
      const known = k.knownFascistsFor(id).map(names);
      if (id === selfId) {
        setMyRole(roles[id]);
        setKnownNames(known);
        try {
          localStorage.setItem(
            'bg-shrole',
            JSON.stringify({
              room: roomCode,
              role: roles[id],
              knownNames: known,
            }),
          );
        } catch {
          /* ignore */
        }
      } else {
        sendersRef.current?.shrole(
          { role: roles[id], knownNames: known },
          id,
        );
      }
    });
    const first: SHPublic = {
      phase: 'nominate',
      players: initialRoster.map((p) => ({ ...p, alive: true, online: true })),
      libTrack: 0,
      fasTrack: 0,
      tracker: 0,
      drawCount: deckRef.current.length,
      discCount: 0,
      presidentId: ids[0] ?? null,
      chancellorId: null,
      lastPresidentId: null,
      lastChancellorId: null,
      pendingPower: null,
      winner: null,
      votes: {},
      vetoOffered: false,
      log: [
        `Secret Hitler table seated with ${ids.length} players. President ${names(ids[0] ?? '')} nominates a Chancellor.`,
      ],
    };
    shRef.current = first;
    setSh(first);
    setTimeout(
      () =>
        sendersRef.current?.shpub(
          first as unknown as Record<string, unknown>,
        ),
      800,
    );
  }

  const act = (msg: Omit<SHActMsg, 'client'>) => {
    const full = { ...msg, client: clientId } as SHActMsg;
    if (isHost) {
      doAct(full, selfId);
      return;
    }
    sendersRef.current?.shact(full as unknown as Record<string, unknown>);
  };

  // ---------- render ----------
  if (!sh) {
    return (
      <div data-game="secret-hitler" className="space-y-3">
        <InvitePanel roomCode={roomCode} />
        <div className="panel cut space-y-2">
          <div className="font-display text-3xl uppercase">Secret Hitler</div>
          {shError ? (
            <>
              <p className="text-sm text-red-300">{shError}</p>
              {isHost && (
                <button onClick={onExit} className="btn-accent">
                  Back to lobby
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-white/60">
              {isHost ? 'Seating the table…' : 'Joining the table…'}
            </p>
          )}
        </div>
      </div>
    );
  }

  const me = sh.players.find((p) => p.peerId === selfId) ?? null;
  const alive = me?.alive ?? true;
  const iAmPres = sh.presidentId === selfId;
  const iAmChanc = sh.chancellorId === selfId;
  const aliveIds = sh.players.filter((p) => p.alive).map((p) => p.peerId);
  const eligible = iAmPres
    ? eligibleChancellors(aliveIds, sh.lastPresidentId, sh.lastChancellorId).filter(
        (id) => id !== selfId,
      )
    : [];
  const myVote = clientId ? sh.votes[clientId] : undefined;
  const votedCount = Object.keys(sh.votes).length;

  return (
    <div data-game="secret-hitler" className="space-y-3 lg:space-y-4">
      <InvitePanel roomCode={roomCode} />
      {/* tracks */}
      <div className="panel cut space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg tracking-widest" style={{ color: '#7aa5ff' }}>LIBERAL {sh.libTrack}/5</span>
          <span className="font-display text-lg tracking-widest" style={{ color: '#ff6b7a' }}>{sh.fasTrack}/6 FASCIST</span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className="h-5 flex-1 rounded-sm border"
              style={i < sh.libTrack
                ? { background: 'linear-gradient(180deg,#3d7bff,#1e40af)', borderColor: '#7aa5ff' }
                : { background: 'rgba(122,165,255,0.08)', borderColor: 'rgba(122,165,255,0.35)' }}
            />
          ))}
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 6 }).map((_, i) => {
            const filled = i < sh.fasTrack;
            const power = powerForSlot(sh.players.length, i + 1);
            return (
              <span
                key={i}
                className="h-8 flex-1 rounded-sm border flex flex-col items-center justify-center"
                style={filled
                  ? { background: 'linear-gradient(180deg,#f02a44,#a31226)', borderColor: '#ff6b7a' }
                  : { background: 'rgba(255,107,122,0.07)', borderColor: 'rgba(255,107,122,0.35)' }}
              >
                <PowerGlyph power={power} />
                {i === 4 && (
                  <span className="sh-gold" style={{ fontSize: 8, fontWeight: 800 }}>VETO</span>
                )}
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase text-white/50">Election tracker</span>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-3 w-3 rounded-full border"
                style={i < sh.tracker
                  ? { background: '#fe8254', borderColor: '#fe8254' }
                  : { borderColor: 'rgba(201,162,39,0.4)' }}
              />
            ))}
          </div>
          <span className="text-xs text-white/50 ml-auto">
            Deck {sh.drawCount} · Discard {sh.discCount}
            {vetoUnlocked(sh.fasTrack) ? ' · VETO LIVE' : ''}
          </span>
        </div>
        {sh.pendingPower && (
          <div className="text-xs sh-gold font-bold uppercase">Power: {sh.pendingPower}</div>
        )}
      </div>

      {/* role card */}
      <div
        className="panel cut"
        style={myRole ? {
          borderLeft: `4px solid ${myRole === 'liberal' ? '#2f6fed' : '#d92038'}`,
          background: myRole === 'liberal'
            ? 'linear-gradient(150deg, rgba(47,111,237,0.22), rgba(11,14,26,0.6))'
            : myRole === 'hitler'
              ? 'linear-gradient(150deg, rgba(217,32,56,0.28), rgba(20,4,8,0.7))'
              : 'linear-gradient(150deg, rgba(217,32,56,0.20), rgba(11,14,26,0.6))',
        } : undefined}
      >
        <div className="text-xs uppercase text-white/50">Your secret role</div>
        <div className="font-display text-3xl flex items-center gap-2">
          {myRole ? (
            <>
              {myRole === 'hitler' && <Crown size={26} className="sh-gold" />}
              <span style={{ color: myRole === 'liberal' ? '#7aa5ff' : '#ff6b7a' }}>
                {ROLE_LABEL[myRole]}
              </span>
            </>
          ) : (
            '…waiting…'
          )}
        </div>
        {myRole && (
          <p className="text-xs text-white/60 mt-1">{ROLE_BLURB[myRole]}</p>
        )}
        {knownNames.length > 0 && (
          <p className="text-xs text-red-300 mt-1">
            <Eye size={12} className="inline" /> You know: {knownNames.join(', ')}
          </p>
        )}
        {myInfo && <p className="text-xs text-amber-200 mt-1">{myInfo}</p>}
        {!alive && (
          <p className="text-sm text-white/60 mt-1">Executed — watch only.</p>
        )}
      </div>

      <div key={sh.phase} className="phase-enter">
        {sh.phase === 'nominate' && (
          <div className="panel cut space-y-2">
            <div className="font-semibold">
              President {nameOf(sh.presidentId)} nominates a Chancellor
            </div>
            {iAmPres ? (
              <div className="grid grid-cols-2 gap-2">
                {aliveIds
                  .filter((id) => id !== selfId)
                  .map((id) => {
                    const ok = eligible.includes(id);
                    return (
                      <button
                        key={id}
                        disabled={!ok}
                        onClick={() => act({ kind: 'nominate', targetId: id })}
                        className={`rounded px-2 py-1.5 text-sm border disabled:opacity-40 ${
                          ok ? 'bg-black/30 border-white/10' : 'bg-black/30 border-white/10 line-through'
                        }`}
                      >
                        {nameOf(id)}
                      </button>
                    );
                  })}
              </div>
            ) : (
              <p className="text-sm text-white/60">Waiting on the President…</p>
            )}
          </div>
        )}

        {sh.phase === 'vote' && (
          <div className="panel cut space-y-2">
            <div className="font-semibold flex items-center gap-2">
              <Vote size={16} /> Elect {nameOf(sh.presidentId)} + {nameOf(sh.chancellorId)}?
            </div>
            <div className="text-xs text-white/50">
              {votedCount}/{aliveIds.length} voted · strict majority of the living passes
            </div>
            {alive ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => act({ kind: 'vote', ja: true })}
                  className="rounded py-4 font-display text-2xl tracking-widest border-2"
                  style={myVote === true
                    ? { background: 'linear-gradient(180deg,#3d7bff,#1e40af)', borderColor: '#7aa5ff', color: '#fff' }
                    : { background: 'rgba(47,111,237,0.10)', borderColor: 'rgba(122,165,255,0.5)', color: '#7aa5ff' }}
                >
                  JA!
                </button>
                <button
                  onClick={() => act({ kind: 'vote', ja: false })}
                  className="rounded py-4 font-display text-2xl tracking-widest border-2"
                  style={myVote === false
                    ? { background: 'linear-gradient(180deg,#f02a44,#a31226)', borderColor: '#ff6b7a', color: '#fff' }
                    : { background: 'rgba(217,32,56,0.10)', borderColor: 'rgba(255,107,122,0.5)', color: '#ff6b7a' }}
                >
                  NEIN!
                </button>
              </div>
            ) : (
              <p className="text-sm text-white/60">Executed players don&apos;t vote.</p>
            )}
            {isHost && (
              <button
                onClick={closeVote}
                className="rounded border border-white/20 px-3 py-1.5 text-sm"
              >
                Close vote now
              </button>
            )}
          </div>
        )}

        {sh.phase === 'legis-pres' && (
          <div className="panel cut space-y-2">
            <div className="font-semibold">President discards one, passes two</div>
            {iAmPres && myCards?.context === 'pres-draw' ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {myCards.cards.map((c, i) => (
                    <button key={i} onClick={() => { act({ kind: 'pres-discard', index: i }); setMyCards(null); }} className="rounded">
                      <PolicyCard policy={c} />
                    </button>
                  ))}
                </div>
                <p className="text-xs text-white/50">Tap the policy to DISCARD.</p>
              </>
            ) : (
              <p className="text-sm text-white/60">
                President {nameOf(sh.presidentId)} is choosing…
              </p>
            )}
          </div>
        )}

        {sh.phase === 'legis-chanc' && (
          <div className="panel cut space-y-2">
            <div className="font-semibold">Chancellor enacts one</div>
            {iAmChanc && myCards?.context === 'chanc-hand' ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {myCards.cards.map((c, i) => (
                    <button key={i} onClick={() => { act({ kind: 'chanc-enact', index: i }); setMyCards(null); }} className="rounded">
                      <PolicyCard policy={c} />
                    </button>
                  ))}
                </div>
                <p className="text-xs text-white/50">Tap the policy to ENACT.</p>
                {vetoUnlocked(sh.fasTrack) && !sh.vetoOffered && (
                  <button
                    onClick={() => act({ kind: 'veto-propose' })}
                    className="rounded border border-white/20 px-3 py-1.5 text-sm"
                  >
                    Propose veto
                  </button>
                )}
              </>
            ) : (
              <p className="text-sm text-white/60">
                Chancellor {nameOf(sh.chancellorId)} is choosing…
              </p>
            )}
            {sh.vetoOffered &&
              (iAmPres ? (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => act({ kind: 'veto-consent', agree: true })} className="rounded bg-white text-black font-bold py-1.5 text-sm">
                    Agree veto
                  </button>
                  <button onClick={() => act({ kind: 'veto-consent', agree: false })} className="rounded border border-white/20 py-1.5 text-sm">
                    Refuse
                  </button>
                </div>
              ) : (
                <p className="text-sm text-amber-200">Veto proposed — President decides…</p>
              ))}
          </div>
        )}

        {sh.phase === 'power' && sh.pendingPower && (
          <PowerPanel
            power={sh.pendingPower}
            players={sh.players}
            isPresident={iAmPres}
            investigated={null}
            peekCards={iAmPres && myCards?.context === 'peek' ? myCards.cards : null}
            onTarget={(id) => act({ kind: 'power-target', targetId: id })}
            onDone={() => { act({ kind: 'power-done' }); setMyCards(null); }}
          />
        )}

        {sh.phase === 'ended' && (
          <div
            className="panel cut text-center space-y-2"
            style={sh.winner === 'liberals'
              ? { borderTop: '4px solid #2f6fed', background: 'linear-gradient(180deg, rgba(47,111,237,0.20), transparent)' }
              : { borderTop: '4px solid #d92038', background: 'linear-gradient(180deg, rgba(217,32,56,0.22), transparent)' }}
          >
            <div
              className="font-display text-4xl uppercase"
              style={{ color: sh.winner === 'liberals' ? '#7aa5ff' : '#ff6b7a' }}
            >
              {sh.winner} win!
            </div>
            {isHost && (
              <button onClick={onExit} className="btn-accent">
                Back to lobby
              </button>
            )}
          </div>
        )}
      </div>

      {/* table */}
      <div className="panel cut">
        <div className="text-xs uppercase text-white/50 mb-1 flex items-center gap-1">
          <Users size={12} /> Table · {name}
          {sh.presidentId && <span className="ml-2">P: {nameOf(sh.presidentId)}</span>}
        </div>
        <ul className="text-sm space-y-1">
          {sh.players.map((p) => (
            <li
              key={p.peerId}
              className={!p.alive ? 'line-through text-white/40' : ''}
            >
              {p.name}
              {p.peerId === sh.presidentId ? ' (P)' : ''}
              {p.peerId === sh.chancellorId ? ' (C)' : ''}
            </li>
          ))}
        </ul>
      </div>

      <div className="panel cut">
        <div className="text-xs uppercase text-white/50 mb-1">Game log</div>
        <ul className="text-xs space-y-1 text-white/75 max-h-40 overflow-auto">
          {[...sh.log].reverse().map((l, i) => (
            <li key={i}>• {l}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PolicyCard({ policy, dim }: { policy: Policy; dim?: boolean }) {
  const lib = policy === 'liberal';
  const Icon = lib ? Vote : Flame;
  return (
    <div className={`sh-card ${lib ? 'sh-card-lib' : 'sh-card-fas'}${dim ? ' opacity-60' : ''}`}>
      <Icon size={30} className="mx-auto" strokeWidth={2.2} />
      <div className="sh-card-label">{lib ? 'Liberal' : 'Fascist'}</div>
    </div>
  );
}

function PowerGlyph({ power }: { power: Power | null }) {
  if (!power) return null;
  const Icon = power === 'investigate' ? Search : power === 'special' ? Repeat : power === 'peek' ? Eye : Skull;
  return <Icon size={11} className="sh-gold" />;
}

function PowerPanel(props: {
  power: Power;
  players: Player[];
  isPresident: boolean;
  investigated: null;
  peekCards: Policy[] | null;
  onTarget: (id: string) => void;
  onDone: () => void;
}) {
  const { power, players } = props;
  const alive = players.filter((p) => p.alive);
  if (power === 'peek') {
    return (
      <div className="panel cut space-y-2">
        <div className="font-semibold flex items-center gap-2">
          <Eye size={16} /> Policy Peek — top 3, order kept
        </div>
        {props.isPresident && props.peekCards ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {props.peekCards.map((c, i) => (
                <PolicyCard key={i} policy={c} />
              ))}
            </div>
            <button onClick={props.onDone} className="btn-accent">
              Done
            </button>
          </>
        ) : (
          <p className="text-sm text-white/60">The President is peeking…</p>
        )}
      </div>
    );
  }
  const copy =
    power === 'investigate'
      ? 'Investigate Loyalty — learn one player\u2019s party'
      : power === 'special'
        ? 'Special Election — choose the next President'
        : 'Execution — eliminate one player';
  return (
    <div className="panel cut space-y-2">
      <div className="font-semibold flex items-center gap-2">
        {power === 'execution' ? <Gavel size={16} /> : <ScrollText size={16} />} {copy}
      </div>
      {props.isPresident ? (
        <div className="grid grid-cols-2 gap-2">
          {alive.map((p) => (
            <button
              key={p.peerId}
              onClick={() => props.onTarget(p.peerId)}
              className="rounded px-2 py-1.5 text-sm border bg-black/30 border-white/10"
            >
              {p.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-white/60">The President is deciding…</p>
      )}
    </div>
  );
}
