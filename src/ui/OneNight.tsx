import { useEffect, useRef, useState } from 'react';
import { Check, Eye, Moon, Skull, Sun, Trophy, User, Vote } from 'lucide-react';
import {
  applyHunterShot,
  CENTER,
  checkONUWinner,
  deal,
  emptyInputs,
  masons,
  recommendedPool,
  resolveNight,
  resolveVote,
  wolfPack,
  type Cards,
  type NightInputs,
  type ONURole,
} from '../game/one-night/logic';
import type { Player } from '../net/presence';
import {
  type ONUActMsg,
  type ONUPublic,
  type RoomHandle,
} from '../net/transport';
import { narrateONUNight, speakCue } from './narrate';
import { InvitePanel } from './Invite';
import { PreDeal } from './PreDeal';
import { RosterList } from './Roster';

const BLURB: Record<ONURole, string> = {
  werewolf: 'Wake with the pack. Lone wolf? Peek at a center card. Survive the vote.',
  minion: 'Learn who the wolves are. You win if no wolf dies — even if you do.',
  mason: 'Wake and find your fellow mason. Two villagers who trust each other.',
  seer: 'Peek at one player\u2019s card — or two from the center.',
  robber: 'Swap your card with another player\u2019s, then look at what you took.',
  troublemaker: 'Swap two other players\u2019 cards, blind. Chaos is the point.',
  drunk: 'Swap your card with a center card, blind. You\u2019ll never know who you are.',
  insomniac: 'Sleep all night. At dawn, look at your own final card.',
  villager: 'Sleep. Find the wolves by day.',
  hunter: 'Sleep. If the vote kills you, you shoot someone with you.',
  tanner: 'Sleep. You win only if the vote kills you. Act suspicious.',
};

const LABEL: Record<ONURole, string> = {
  werewolf: 'Werewolf',
  minion: 'Minion',
  mason: 'Mason',
  seer: 'Seer',
  robber: 'Robber',
  troublemaker: 'Troublemaker',
  drunk: 'Drunk',
  insomniac: 'Insomniac',
  villager: 'Villager',
  hunter: 'Hunter',
  tanner: 'Tanner',
};

function getClient(): string {
  try {
    return localStorage.getItem('bg-client') ?? '';
  } catch {
    return '';
  }
}

function buzz() {
  try {
    navigator.vibrate?.(15);
  } catch {
    /* no haptics */
  }
}

interface Senders {
  pub: (d: unknown, target?: string | string[]) => void;
  role: (d: unknown, target?: string | string[]) => void;
  seen: (d: unknown, target?: string | string[]) => void;
  act: (d: unknown, target?: string | string[]) => void;
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

export default function OneNight({
  handle,
  roomCode,
  name,
  isHost,
  initialRoster,
  onExit,
  onAddBot,
  onRemoveBot,
  resetToken,
}: Props) {
  const selfId = handle.selfId;
  const clientId = getClient();

  const [onu, setOnu] = useState<ONUPublic | null>(null);
  const [myRole, setMyRole] = useState<ONURole | null>(() => {
    try {
      const s = JSON.parse(localStorage.getItem('bg-onurole') ?? 'null');
      if (s && s.room === roomCode && typeof s.role === 'string')
        return s.role as ONURole;
    } catch {
      /* none */
    }
    return null;
  });
  const [kin, setKin] = useState<string[]>(() => {
    try {
      const s = JSON.parse(localStorage.getItem('bg-onurole') ?? 'null');
      if (s && s.room === roomCode && Array.isArray(s.kin))
        return s.kin as string[];
    } catch {
      /* none */
    }
    return [];
  });
  const [loneWolf, setLoneWolf] = useState(false);
  const [seen, setSeen] = useState<{ cards: ONURole[]; label: string } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  // ---- host truth ----
  const cardsRef = useRef<Cards>({});
  const inputsRef = useRef<NightInputs>(emptyInputs());
  const votesRef = useRef<Record<string, string>>({});
  const hunterPointRef = useRef<string | null>(null);
  const peerToClient = useRef<Record<string, string>>({});
  const seatByClient = useRef<Record<string, string>>({});
  const sendersRef = useRef<Senders | null>(null);
  const seenRef = useRef<Record<string, { cards: import('../game/one-night/logic').ONURole[]; label: string }>>({});
  const pendingRef = useRef<{
    msg: ONUActMsg;
    tries: number;
    phase: ONUPublic['phase'];
  } | null>(null);
  const onuRef = useRef<ONUPublic | null>(null);
  const isHostRef = useRef(isHost);
  const initedRef = useRef(false);
  isHostRef.current = isHost;

  // exit-to-lobby: clear every piece of internal game state so the next
  // seat starts clean (the component ignores pub.phase on purpose)
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    if (resetToken === 0) return;
    onuRef.current = null;
    setOnu(null);
    setMyRole(null);
    setKin([]);
    setLoneWolf(false);
    setSeen(null);
    setPicked(null);
    seenRef.current = {};
    votesRef.current = {};
    inputsRef.current = emptyInputs();
    finalRef.current = {};
    hunterPointRef.current = null;
    try {
      localStorage.removeItem('bg-onurole');
      localStorage.removeItem(`bg-onuhost-${roomCode}`);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  const push = (patch: Partial<ONUPublic>, target?: string | string[]) => {
    const cur = onuRef.current;
    if (!cur) return;
    const next: ONUPublic = { ...cur, ...patch };
    onuRef.current = next;
    setOnu(next);
    const s = sendersRef.current;
    if (!s) return;
    if (target) void s.pub(next as unknown as Record<string, unknown>, target);
    else void s.pub(next as unknown as Record<string, unknown>);
  };

  const tell = (
    peerId: string,
    kind: 'role' | 'seen',
    payload: Record<string, unknown>,
  ) => {
    if (peerId === selfId) {
      if (kind === 'role') {
        const r = payload as { role: ONURole; kin: string[]; loneWolf: boolean };
        setMyRole(r.role);
        setKin(r.kin ?? []);
        setLoneWolf(!!r.loneWolf);
        try {
          localStorage.setItem('bg-onurole', JSON.stringify({ room: roomCode, ...r }));
        } catch {
          /* ignore */
        }
      } else {
        setSeen(payload as { cards: ONURole[]; label: string });
      }
      return;
    }
    const s = sendersRef.current;
    if (!s) return;
    void s[kind](payload, peerId);
  };

  const nameOf = (peerId: string | null): string =>
    onuRef.current?.players.find((p) => p.peerId === peerId)?.name ?? '?';

  // ---------- host message handling ----------
  const rekeySeat = (oldPeer: string, newPeer: string) => {
    const cur = onuRef.current;
    if (!cur) return;
    if (cardsRef.current[oldPeer] !== undefined) {
      cardsRef.current[newPeer] = cardsRef.current[oldPeer];
      delete cardsRef.current[oldPeer];
    }
    cur.players = cur.players.map((p) =>
      p.peerId === oldPeer ? { ...p, peerId: newPeer, online: true } : p,
    );
    // fix pointers that referenced the old peer id
    const inp = inputsRef.current;
    if (inp.seerPlayer === oldPeer) inp.seerPlayer = newPeer;
    if (inp.robberTarget === oldPeer) inp.robberTarget = newPeer;
    if (inp.troublePair) {
      inp.troublePair = [
        inp.troublePair[0] === oldPeer ? newPeer : inp.troublePair[0],
        inp.troublePair[1] === oldPeer ? newPeer : inp.troublePair[1],
      ];
    }
    for (const [voter, target] of Object.entries(votesRef.current)) {
      if (voter === oldPeer) {
        votesRef.current[newPeer] = target;
        delete votesRef.current[oldPeer];
      }
      if (target === oldPeer) votesRef.current[voter] = newPeer;
    }
    if (hunterPointRef.current === oldPeer) hunterPointRef.current = newPeer;
    dealRole(newPeer);
  };

  const dealRole = (peerId: string) => {
    const role = cardsRef.current[peerId];
    if (!role) return;
    const ids = (onuRef.current?.players ?? []).map((p) => p.peerId);
    const pack = wolfPack(cardsRef.current, ids);
    const ms = masons(cardsRef.current, ids);
    let kin: string[] = [];
    if (role === 'werewolf') kin = pack.filter((id) => id !== peerId);
    else if (role === 'mason') kin = ms.filter((id) => id !== peerId);
    else if (role === 'minion') kin = [...pack];
    tell(peerId, 'role', {
      role,
      kin,
      loneWolf: role === 'werewolf' && pack.length === 1,
    });
  };

  const statusFlags = () => {
    const inp = inputsRef.current;
    return {
      lone: inp.loneWolfCenter != null,
      seer: inp.seerPlayer != null || inp.seerCenter != null,
      robber: inp.robberTarget != null,
      trouble: inp.troublePair != null,
      drunk: inp.drunkCenter != null,
    };
  };

  const doAct = (m: ONUActMsg, fromPeer: string) => {
    const cur = onuRef.current;
    if (!cur) return;
    if (m.client) {
      const known = seatByClient.current[m.client];
      if (known && known !== fromPeer) rekeySeat(known, fromPeer);
      seatByClient.current[m.client] = fromPeer;
      peerToClient.current[fromPeer] = m.client;
    }
    if (m.kind === 'sync') {
      sendersRef.current?.pub(cur as unknown as Record<string, unknown>, fromPeer);
      // re-deal anything private this peer should hold: role + night views.
      // Covers drops + refreshes.
      dealRole(fromPeer);
      const seen = seenRef.current[fromPeer];
      if (seen)
        sendersRef.current?.seen(seen as unknown as Record<string, unknown>, fromPeer);
      return;
    }
    if (!cur.players.some((p) => p.peerId === fromPeer)) return;
    const dealt = cardsRef.current[fromPeer];

    if (m.kind === 'ready' && cur.phase === 'role') {
      const voter = m.client || fromPeer;
      const ready = [...new Set([...cur.ready, voter])];
      push({ ready });
      return;
    }

    if (cur.phase === 'night' && dealt) {
      const inp = inputsRef.current;
      let changed = false;
      if (m.kind === 'lone' && dealt === 'werewolf' && typeof m.index === 'number' && m.index >= 0 && m.index < 3) {
        inp.loneWolfCenter = m.index;
        changed = true;
      } else if (m.kind === 'seer-player' && dealt === 'seer' && m.targetId && cur.players.some((p) => p.peerId === m.targetId)) {
        inp.seerPlayer = m.targetId;
        inp.seerCenter = null;
        changed = true;
      } else if (m.kind === 'seer-center' && dealt === 'seer' && m.pair && m.pair[0] !== m.pair[1]) {
        inp.seerPlayer = null;
        inp.seerCenter = m.pair;
        changed = true;
      } else if (m.kind === 'robber' && dealt === 'robber' && m.targetId && m.targetId !== fromPeer && cur.players.some((p) => p.peerId === m.targetId)) {
        inp.robberTarget = m.targetId;
        changed = true;
      } else if (m.kind === 'trouble' && dealt === 'troublemaker' && m.targetId && m.secondId && m.targetId !== m.secondId && m.targetId !== fromPeer && m.secondId !== fromPeer) {
        inp.troublePair = [m.targetId, m.secondId];
        changed = true;
      } else if (m.kind === 'drunk' && dealt === 'drunk' && typeof m.index === 'number' && m.index >= 0 && m.index < 3) {
        inp.drunkCenter = m.index;
        changed = true;
      }
      if (changed) push({ night: statusFlags() });
      return;
    }

    if (m.kind === 'hunter-point' && (cur.phase === 'day' || cur.phase === 'vote')) {
      if (dealt === 'hunter' && m.targetId && cur.players.some((p) => p.peerId === m.targetId && p.alive)) {
        hunterPointRef.current = m.targetId;
        push({ log: [...cur.log, `${nameOf(fromPeer)} (hunter) is pointing…`].slice(-50) });
      }
      return;
    }

    if (m.kind === 'vote' && cur.phase === 'vote' && m.targetId) {
      const voter = m.client || fromPeer;
      const me = cur.players.find((p) => p.peerId === fromPeer);
      if (me && !me.alive) return;
      if (!cur.players.some((p) => p.peerId === m.targetId && p.alive)) return;
      votesRef.current[voter] = m.targetId;
      const aliveCount = cur.players.filter((p) => p.alive).length;
      const patch = { votes: { ...votesRef.current } };
      if (Object.keys(votesRef.current).length >= aliveCount) {
        resolveElection({ ...cur, ...patch });
        return;
      }
      push(patch);
    }
  };

  const resolveElection = (cur: ONUPublic) => {
    const aliveIds = cur.players.filter((p) => p.alive).map((p) => p.peerId);
    const died = resolveVote(votesRef.current, aliveIds);
    if (!died) {
      // tie (or no votes): nobody dies — final cards decide
      finishVote(cur, []);
      return;
    }
    finishVote(cur, [died]);
  };

  const finishVote = (cur: ONUPublic, died: string[]) => {
    const withHunter = applyHunterShot(died, finalRef.current, hunterPoint());
    const outcome = checkONUWinner(
      finalRef.current,
      cur.players.map((p) => p.peerId),
      withHunter,
    );
    push({
      votes: {},
      died: withHunter,
      winners: outcome.winnerIds,
      reasons: outcome.reasons,
      finalCards: { ...finalRef.current },
      centerCards: [0, 1, 2].map((i) => finalRef.current[CENTER[i]]),
      phase: 'ended',
      log: [
        ...cur.log,
        withHunter.length > 0
          ? `${withHunter.map(nameOf).join(', ')} ${withHunter.length > 1 ? 'die' : 'dies'}.`
          : 'Tie — nobody dies.',
        ...outcome.reasons,
      ].slice(-60),
    });
  };

  const hunterPoint = (): string | null => {
    if (hunterPointRef.current) return hunterPointRef.current;
    // documented fallback: hunter never pointed — first other living player
    const cur = onuRef.current;
    if (!cur) return null;
    const hunter = cur.players.find((p) => cardsRef.current[p.peerId] === 'hunter' && p.alive);
    const other = cur.players.find((p) => p.alive && p.peerId !== hunter?.peerId);
    return other?.peerId ?? null;
  };

  const finalRef = useRef<Cards>({});

  const resolveNightHost = () => {
    const cur = onuRef.current;
    if (!cur || cur.phase !== 'night') return;
    const ids = cur.players.map((p) => p.peerId);
    const { final, seen } = resolveNight(cardsRef.current, ids, inputsRef.current);
    finalRef.current = final;
    // deliver private views
    for (const [viewer, cards] of Object.entries(seen)) {
      const label =
        cardsRef.current[viewer] === 'seer'
          ? 'Seer vision'
          : cardsRef.current[viewer] === 'werewolf'
            ? 'Lone wolf peek'
            : cardsRef.current[viewer] === 'robber'
              ? 'You stole this'
              : 'Your final card';
      // insomniac viewers hold insomniac in FINAL cards
      const tag = final[viewer] === 'insomniac' && cardsRef.current[viewer] !== 'insomniac' ? 'Your final card' : label;
      seenRef.current[viewer] = { cards, label: tag };
      tell(viewer, 'seen', { cards, label: tag });
    }
    setSeen(null);
    push({
      phase: 'day',
      log: [...cur.log, 'Dawn breaks. Discuss — then point at your hunter target and vote.'].slice(-50),
    });
  };

  const closeVote = () => {
    const cur = onuRef.current;
    if (cur && cur.phase === 'vote') resolveElection(cur);
  };

  // ---------- wiring ----------
  useEffect(() => {
    const { room } = handle;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pub = room.makeAction('onu-pub', { onMessage: (data: any) => setOnu(data as unknown as ONUPublic) });
    const role = room.makeAction('onu-role', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onMessage: (data: any) => {
        const r = data as unknown as { role: ONURole; kin: string[]; loneWolf: boolean };
        setMyRole(r.role);
        setKin(r.kin ?? []);
        setLoneWolf(!!r.loneWolf);
        try {
          localStorage.setItem('bg-onurole', JSON.stringify({ room: roomCode, ...r }));
        } catch {
          /* ignore */
        }
      },
    });
    const seenAct = room.makeAction('onu-seen', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onMessage: (data: any) =>
        setSeen(data as unknown as { cards: ONURole[]; label: string }),
    });
    const act = room.makeAction('onu-act', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onMessage: (data: any, ctx: { peerId: string }) => {
        if (isHostRef.current) doAct(data as unknown as ONUActMsg, ctx.peerId);
      },
    });

    sendersRef.current = {
      pub: (d, t) => void pub.send(d as never, t ? { target: t } : undefined),
      role: (d, t) => void role.send(d as never, t ? { target: t } : undefined),
      seen: (d, t) => void seenAct.send(d as never, t ? { target: t } : undefined),
      act: (d, t) => void act.send(d as never, t ? { target: t } : undefined),
    };

    // Host heartbeat: rebroadcast full state so late/dropped joiners
    // converge even if they missed the original broadcasts.
    const beat = setInterval(() => {
      const cur = onuRef.current;
      if (isHostRef.current && cur)
        sendersRef.current?.pub(cur as unknown as Record<string, unknown>);
    }, 5000);

    if (isHost && !initedRef.current) {
      initedRef.current = true;
      initGame();
    } else if (!isHost) {
      const t = setTimeout(
        () => sendersRef.current?.act({ kind: 'sync', client: getClient() }),
        600,
      );
      const retry = setInterval(() => {
        if (!onuRef.current)
          sendersRef.current?.act({ kind: 'sync', client: getClient() });
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

  useEffect(() => {
    if (isHost && onu) {
      try {
        localStorage.setItem(
          `bg-onuhost-${roomCode}`,
          JSON.stringify({
            onu,
            cards: cardsRef.current,
            final: finalRef.current,
            inputs: inputsRef.current,
            hunterPoint: hunterPointRef.current,
            hostPeer: selfId,
          }),
        );
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onu]);

  const cued = onu?.phase;
  useEffect(() => {
    if (!onu || !cued || cued === 'role') return;
    try {
      if (localStorage.getItem('bg-sound') === '0') return;
    } catch {
      /* ignore */
    }
    if (cued === 'night') speakCue('Night falls. Everyone close your eyes.');
    else if (cued === 'day') speakCue('Dawn. Find the wolves.');
    else if (cued === 'vote') speakCue('Point at your suspect.');
    else if (cued === 'ended') speakCue('Reveal your cards.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cued]);

  /** Live lobby roster (prop updates on every App render). Read at seat
   * time — never a mount-time snapshot — so late joiners get seated. */
  const liveRoster = useRef(initialRoster);
  liveRoster.current = initialRoster;

  function initGame() {
    if (restoreSaved()) return;
    // No save: only auto-deal if the live room already meets the minimum.
    // Otherwise idle on the pre-deal screen until the host seats manually.
    const n = liveRoster.current.length;
    if (n >= 3 && n <= 10) dealTable(liveRoster.current);
  }

  /** Host refresh recovery. Returns true when a save was restored. */
  function restoreSaved(): boolean {
    try {
      const saved = JSON.parse(localStorage.getItem(`bg-onuhost-${roomCode}`) ?? 'null');
      if (saved && saved.onu && saved.cards && saved.hostPeer) {
        const oldPeer = saved.hostPeer as string;
        cardsRef.current = saved.cards as Cards;
        finalRef.current = (saved.final as Cards) ?? {};
        inputsRef.current = { ...emptyInputs(), ...(saved.inputs ?? {}) };
        hunterPointRef.current = (saved.hunterPoint as string | null) ?? null;
        if (oldPeer !== selfId && cardsRef.current[oldPeer] !== undefined) {
          cardsRef.current[selfId] = cardsRef.current[oldPeer];
          delete cardsRef.current[oldPeer];
        }
        const players = (saved.onu.players as Player[]).map((p) =>
          p.peerId === oldPeer ? { ...p, peerId: selfId, online: true } : p,
        );
        const next = {
          ...(saved.onu as ONUPublic),
          players,
          log: [...(saved.onu.log as string[]), 'Host rebooted.'].slice(-50),
        } as ONUPublic;
        onuRef.current = next;
        setOnu(next);
        if (cardsRef.current[selfId]) {
          setMyRole(cardsRef.current[selfId]);
          dealRoleSilent(selfId);
        }
        setTimeout(
          () => sendersRef.current?.pub(next as unknown as Record<string, unknown>),
          800,
        );
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /** Deal a fresh table from the given (live) roster. Host only. */
  function dealTable(roster: Player[]) {
    const ids = roster.map((p) => p.peerId);
    if (ids.length < 3 || ids.length > 10) return;
    const pool = recommendedPool(ids.length);
    const cards = deal(pool, ids);
    cardsRef.current = cards;
    finalRef.current = {};
    inputsRef.current = emptyInputs();
    votesRef.current = {};
    hunterPointRef.current = null;
    ids.forEach((id) => dealRole(id));
    const first: ONUPublic = {
      phase: 'role',
      players: roster.map((p) => ({ ...p, alive: true, online: true })),
      pool,
      votes: {},
      ready: [],
      night: { lone: false, seer: false, robber: false, trouble: false, drunk: false },
      died: [],
      winners: [],
      reasons: [],
      log: [`One night. ${ids.length} players, 3 cards in the center. Look at your card.`],
    };
    onuRef.current = first;
    setOnu(first);
    setTimeout(
      () => sendersRef.current?.pub(first as unknown as Record<string, unknown>),
      800,
    );
  }

  const dealRoleSilent = (peerId: string) => {
    const role = cardsRef.current[peerId];
    if (!role) return;
    const ids = (onuRef.current?.players ?? []).map((p) => p.peerId);
    const pack = wolfPack(cardsRef.current, ids);
    const ms = masons(cardsRef.current, ids);
    let kin: string[] = [];
    if (role === 'werewolf') kin = pack.filter((id) => id !== peerId);
    else if (role === 'mason') kin = ms.filter((id) => id !== peerId);
    else if (role === 'minion') kin = [...pack];
    setKin(kin);
    setLoneWolf(role === 'werewolf' && pack.length === 1);
  };

  const act = (msg: Omit<ONUActMsg, 'client'>) => {
    const full = { ...msg, client: clientId } as ONUActMsg;
    if (isHost) {
      doAct(full, selfId);
      return;
    }
    sendersRef.current?.act(full as unknown as Record<string, unknown>);
    // Ack-retry: same protection as SecretHitler — re-send until the
    // broadcast reflects the action, the phase moves on, or 5 tries pass.
    pendingRef.current = {
      msg: full,
      tries: 0,
      phase: onuRef.current?.phase ?? 'role',
    };
  };

  useEffect(() => {
    const t = setInterval(() => {
      const p = pendingRef.current;
      const cur = onuRef.current;
      if (!p || !cur || isHostRef.current) return;
      const flagFor: Record<string, keyof NonNullable<ONUPublic['night']> | null> = {
        lone: 'lone',
        'seer-player': 'seer',
        'seer-center': 'seer',
        robber: 'robber',
        trouble: 'trouble',
        drunk: 'drunk',
      };
      const flag = flagFor[p.msg.kind];
      const done =
        cur.phase !== p.phase ||
        p.tries >= 5 ||
        (p.msg.kind === 'vote' && cur.votes[clientId] !== undefined) ||
        (p.msg.kind === 'ready' && (cur.ready ?? []).includes(clientId)) ||
        (flag && cur.night?.[flag] === true);
      if (done) {
        pendingRef.current = null;
        return;
      }
      p.tries++;
      sendersRef.current?.act(p.msg as unknown as Record<string, unknown>);
    }, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  const rnd = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  /**
   * Host-simulated dummies for testing. Same contract as SecretHitler:
   * roster entries with no socket, auto-played through the validated doAct
   * path with random VALID options only. One action per tick.
   */
  useEffect(() => {
    if (!isHost || !onu || onu.phase === 'ended') return;
    const t = setTimeout(() => {
      const cur = onuRef.current;
      if (!cur || !isHostRef.current) return;
      const bots = cur.players.filter((p) => p.bot && p.alive);
      if (bots.length === 0) return;
      const aliveIds = cur.players.filter((p) => p.alive).map((p) => p.peerId);
      const say = (fromPeer: string, msg: Omit<ONUActMsg, 'client'>) =>
        doAct({ ...msg, client: fromPeer } as ONUActMsg, fromPeer);
      const othersOf = (id: string) => aliveIds.filter((x) => x !== id);

      if (cur.phase === 'role') {
        const missing = bots.filter((b) => !(cur.ready ?? []).includes(b.peerId));
        if (missing.length > 0) {
          say(missing[0].peerId, { kind: 'ready' });
          return;
        }
      }
      if (cur.phase === 'night') {
        const inp = inputsRef.current;
        const ids = aliveIds;
        for (const b of bots) {
          const role = cardsRef.current[b.peerId];
          const others = othersOf(b.peerId);
          if (role === 'werewolf' && wolfPack(cardsRef.current, ids).length === 1 && inp.loneWolfCenter == null) {
            say(b.peerId, { kind: 'lone', index: Math.floor(Math.random() * 3) });
            return;
          }
          if (role === 'seer' && inp.seerPlayer == null && inp.seerCenter == null) {
            if (others.length > 0 && Math.random() < 0.5) {
              say(b.peerId, { kind: 'seer-player', targetId: rnd(others) });
            } else {
              const a = Math.floor(Math.random() * 3);
              const c = (a + 1 + Math.floor(Math.random() * 2)) % 3;
              say(b.peerId, { kind: 'seer-center', pair: [a, c] });
            }
            return;
          }
          if (role === 'robber' && inp.robberTarget == null && others.length > 0) {
            say(b.peerId, { kind: 'robber', targetId: rnd(others) });
            return;
          }
          if (role === 'troublemaker' && inp.troublePair == null && others.length >= 2) {
            const a = rnd(others);
            const rest = others.filter((x) => x !== a);
            say(b.peerId, { kind: 'trouble', targetId: a, secondId: rnd(rest) });
            return;
          }
          if (role === 'drunk' && inp.drunkCenter == null) {
            say(b.peerId, { kind: 'drunk', index: Math.floor(Math.random() * 3) });
            return;
          }
        }
      }
      if ((cur.phase === 'day' || cur.phase === 'vote') && hunterPointRef.current == null) {
        const hunter = bots.find((b) => cardsRef.current[b.peerId] === 'hunter');
        const others = hunter ? aliveIds.filter((x) => x !== hunter.peerId) : [];
        if (hunter && others.length > 0) {
          say(hunter.peerId, { kind: 'hunter-point', targetId: rnd(others) });
          return;
        }
      }
      if (cur.phase === 'vote') {
        const missing = bots.filter((b) => !(b.peerId in votesRef.current));
        if (missing.length > 0) {
          const b = rnd(missing);
          say(b.peerId, { kind: 'vote', targetId: rnd(aliveIds) });
          return;
        }
      }
    }, 1100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onu]);

  // ---------- render ----------
  if (!onu) {
    return (
      <PreDeal
        game="one-night"
        title="One Night"
        roomCode={roomCode}
        roster={liveRoster.current}
        min={3}
        max={10}
        isHost={isHost}
        onSeat={() => dealTable(liveRoster.current)}
        onExit={onExit}
        onAddBot={onAddBot}
        onRemoveBot={onRemoveBot}
      />
    );
  }

  const me = onu.players.find((p) => p.peerId === selfId) ?? null;
  const alive = me?.alive ?? true;
  const aliveIds = onu.players.filter((p) => p.alive).map((p) => p.peerId);
  const readyCount = (onu.ready?.length ?? 0) + (isHost ? 1 : 0);
  const amIReady = isHost || (onu.ready ?? []).includes(clientId);
  const myVote = clientId ? onu.votes[clientId] : undefined;
  const votedCount = Object.keys(onu.votes).length;

  return (
    <div data-game="one-night" className="space-y-3 lg:space-y-4">
      <InvitePanel roomCode={roomCode} game="one-night" />
      {/* role card */}
      <div className="panel cut">
        <div className="text-xs uppercase text-white/50">Your card</div>
        <div className="font-display text-3xl">
          {myRole ? (
            <span className={myRole === 'werewolf' || myRole === 'minion' ? 'text-red-400' : 'text-white'}>
              {LABEL[myRole]}
            </span>
          ) : (
            '…waiting…'
          )}
        </div>
        {myRole && <p className="text-xs text-white/60 mt-1">{BLURB[myRole]}</p>}
        {kin.length > 0 && (
          <p className="text-xs text-red-300 mt-1">
            <Eye size={12} className="inline" /> {myRole === 'minion' ? 'Wolves' : 'You wake with'}: {kin.map((id) => onu.players.find((p) => p.peerId === id)?.name ?? '?').join(', ')}
          </p>
        )}
        {seen && (
          <p className="text-xs text-amber-200 mt-1">
            {seen.label}: {seen.cards.map((c) => LABEL[c]).join(', ')}
          </p>
        )}
        {!alive && <p className="text-sm text-white/60 mt-1">Out of the game — watch only.</p>}
      </div>

      <div key={onu.phase} className="phase-enter">
        {onu.phase === 'role' && (
          <div className="panel cut space-y-2">
            <p className="text-sm text-white/70">
              Memorize your card, then mark ready. One night, one vote — no second chances.
            </p>
            <div className="text-xs text-white/60">{readyCount}/{aliveIds.length} ready</div>
            {!isHost && alive && !amIReady && (
              <button onClick={() => { buzz(); act({ kind: 'ready' }); }} className="btn-accent">
                I&apos;m ready
              </button>
            )}
            {!isHost && alive && amIReady && (
              <div className="text-sm text-white/60 flex items-center gap-1">
                <Check size={14} /> Ready — waiting for night…
              </div>
            )}
            {isHost && (
              <button
                onClick={() => {
                  const cur = onuRef.current;
                  if (cur) push({ phase: 'night', log: [...cur.log, 'Night falls. Everyone close your eyes.'].slice(-50) });
                }}
                className="btn-accent"
              >
                Start night
              </button>
            )}
          </div>
        )}

        {onu.phase === 'night' && (
          <NightActions
            role={myRole}
            selfId={selfId}
            players={onu.players}
            alive={alive}
            loneWolf={loneWolf}
            flags={onu.night}
            isHost={isHost}
            dayCount={1}
            pool={onu.pool}
            onAct={(m) => act(m)}
            onResolve={resolveNightHost}
            onNarrate={() => void narratePool()}
          />
        )}

        {onu.phase === 'day' && (
          <div className="panel cut space-y-2">
            <div className="font-semibold flex items-center gap-2">
              <Sun size={16} /> Day — discuss, then the hunter points
            </div>
            <div className="daybreak" />
            {myRole === 'hunter' && alive ? (
              <HunterPoint
                players={onu.players}
                selfId={selfId}
                onPoint={(id) => act({ kind: 'hunter-point', targetId: id })}
              />
            ) : (
              <p className="text-sm text-white/60">
                Talk it out. {isHost ? 'When ready, open the vote.' : 'Waiting for the host to open the vote…'}
              </p>
            )}
            {isHost && (
              <button
                onClick={() => {
                  const cur = onuRef.current;
                  if (cur) push({ phase: 'vote', log: [...cur.log, 'Vote! Point at your suspect.'].slice(-50) });
                }}
                className="w-full rounded bg-white text-black font-bold py-2"
              >
                Open vote
              </button>
            )}
          </div>
        )}

        {onu.phase === 'vote' && (
          <div className="panel cut space-y-2">
            <div className="font-semibold flex items-center gap-2">
              <Vote size={16} /> Vote — most votes dies, ties kill nobody
            </div>
            <div className="text-xs text-white/50">{votedCount}/{aliveIds.length} voted</div>
            <div className="grid grid-cols-2 gap-2">
              {aliveIds.map((id) => (
                <button
                  key={id}
                  disabled={!alive}
                  onClick={() => { buzz(); setPicked(id); act({ kind: 'vote', targetId: id }); }}
                  className={`rounded px-2 py-1.5 text-sm border disabled:opacity-50 ${picked === id || myVote === id ? 'bg-red-400 text-black' : 'bg-black/30 border-white/10'}`}
                >
                  {nameOf(id)}
                </button>
              ))}
            </div>
            {picked || myVote ? (
              <p className="text-xs text-red-300 flex items-center gap-1">
                <Check size={12} /> Voting {nameOf(picked ?? myVote ?? null)} — tap another to switch.
              </p>
            ) : null}
            {isHost && (
              <button onClick={closeVote} className="rounded border border-white/20 px-3 py-1.5 text-sm">
                Close vote
              </button>
            )}
          </div>
        )}

        {onu.phase === 'ended' && (
          <div className="panel cut space-y-3">
            <div className="font-display text-3xl flex items-center gap-2">
              <Trophy size={26} />
              {onu.winners.length > 0 ? (
                <span>{onu.winners.map(nameOf).join(', ')} win!</span>
              ) : (
                <span>Nobody wins!</span>
              )}
            </div>
            {onu.reasons.map((r, i) => (
              <p key={i} className="text-xs text-white/60">• {r}</p>
            ))}
            <div className="text-xs uppercase text-white/50">Final cards</div>
            <ul className="text-sm space-y-1">
              {onu.players.map((p) => (
                <li key={p.peerId} className="flex justify-between">
                  <span className={!p.alive ? 'line-through text-white/40' : ''}>
                    {!p.alive ? <Skull size={12} className="inline mr-1" /> : <User size={12} className="inline mr-1" />}
                    {p.name}
                  </span>
                  <span className="text-white/70">{onu.finalCards ? LABEL[onu.finalCards[p.peerId]] : '?'}</span>
                </li>
              ))}
            </ul>
            <div className="text-xs uppercase text-white/50">Center</div>
            <div className="flex gap-2 text-sm text-white/70">
              {(onu.centerCards ?? []).map((c, i) => (
                <span key={i} className="border border-white/15 rounded px-2 py-1">{LABEL[c]}</span>
              ))}
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
        <div className="text-xs uppercase text-white/50 mb-1">Table · {name} ({onu.players.length})</div>
        <RosterList players={onu.players} />
        <div className="mt-2 text-xs text-white/50">
          Pool: {onu.pool.map((r) => LABEL[r]).join(' · ')}
        </div>
      </div>

      <div className="panel cut">
        <div className="text-xs uppercase text-white/50 mb-1">Game log</div>
        <ul className="text-xs space-y-1 text-white/75 max-h-40 overflow-auto">
          {[...onu.log].reverse().map((l, i) => (
            <li key={i}>• {l}</li>
          ))}
        </ul>
      </div>
    </div>
  );

  function narratePool() {
    const pool = onuRef.current ? poolRoles() : [];
    void narrateONUNight(pool);
  }

  function poolRoles(): import('../game/one-night/logic').ONURole[] {
    const cur = onuRef.current;
    if (!cur) return [];
    const seen = new Set<import('../game/one-night/logic').ONURole>();
    Object.values(cardsRef.current).forEach((r) => seen.add(r));
    return [...seen];
  }
}

function NightActions(props: {
  role: import('../game/one-night/logic').ONURole | null;
  selfId: string;
  players: Player[];
  alive: boolean;
  loneWolf: boolean;
  flags: ONUPublic['night'];
  isHost: boolean;
  dayCount: number;
  pool: import('../game/one-night/logic').ONURole[];
  onAct: (m: Omit<ONUActMsg, 'client'>) => void;
  onResolve: () => void;
  onNarrate: () => void;
}) {
  const { role, players, alive } = props;
  const [sel, setSel] = useState<string | null>(null);
  const [sel2, setSel2] = useState<string | null>(null);
  const [seerMode, setSeerMode] = useState<'player' | 'center'>('player');
  const [wakeStep, setWakeStep] = useState(0);
  // fresh night → stepper back to the first call
  useEffect(() => {
    setWakeStep(0);
  }, [props.dayCount]);
  if (!alive) return <div className="text-sm text-white/60">Out — waiting for dawn…</div>;
  if (!role) return <div className="text-sm text-white/60">Waiting for card…</div>;

  const others = players.filter((p) => p.alive && p.peerId !== props.selfId);
  const tap = (fn: () => void) => () => {
    buzz();
    fn();
  };

  return (
    <div className="panel cut space-y-2">
      <div className="font-semibold flex items-center gap-2">
        <Moon size={16} className="moon-pulse" /> Night — {nightHint(role, props.loneWolf)}
      </div>

      {role === 'werewolf' && (
        <WakeInfo
          text={
            props.loneWolf
              ? 'No pack. Peek at one center card.'
              : 'Your pack knows each other. Stay silent, stay alive.'
          }
        />
      )}
      {role === 'minion' && <WakeInfo text="You know the wolves. They don\u2019t know you. Keep them alive." />}
      {role === 'mason' && <WakeInfo text="You know your fellow mason. Vouch carefully." />}
      {(role === 'villager' || role === 'hunter' || role === 'tanner') && (
        <p className="text-sm text-white/60">Sleep… your moment comes by day.</p>
      )}

      {role === 'werewolf' && props.loneWolf && (
        <CenterPick
          picked={sel}
          onPick={(i) => {
            setSel(String(i));
            props.onAct({ kind: 'lone', index: i });
          }}
        />
      )}

      {role === 'seer' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setSeerMode('player')} className={`rounded px-2 py-1.5 text-sm border ${seerMode === 'player' ? 'bg-[#e4234b] text-[#011735]' : 'bg-black/30 border-white/10'}`}>
              One player
            </button>
            <button onClick={() => setSeerMode('center')} className={`rounded px-2 py-1.5 text-sm border ${seerMode === 'center' ? 'bg-[#e4234b] text-[#011735]' : 'bg-black/30 border-white/10'}`}>
              Two center
            </button>
          </div>
          {seerMode === 'player' ? (
            <div className="grid grid-cols-2 gap-2">
              {players.filter((p) => p.alive).map((p) => (
                <button
                  key={p.peerId}
                  onClick={tap(() => {
                    setSel(p.peerId);
                    props.onAct({ kind: 'seer-player', targetId: p.peerId });
                  })}
                  className={`rounded px-2 py-1.5 text-sm border ${sel === p.peerId ? 'bg-[#e4234b] text-[#011735]' : 'bg-black/30 border-white/10'}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          ) : (
            <CenterPairPick
              picked={[sel, sel2]}
              onPick={(a, b) => {
                setSel(String(a));
                setSel2(String(b));
                props.onAct({ kind: 'seer-center', pair: [a, b] });
              }}
            />
          )}
        </>
      )}

      {role === 'robber' && (
        <div className="grid grid-cols-2 gap-2">
          {others.map((p) => (
            <button
              key={p.peerId}
              onClick={tap(() => {
                setSel(p.peerId);
                props.onAct({ kind: 'robber', targetId: p.peerId });
              })}
              className={`rounded px-2 py-1.5 text-sm border ${sel === p.peerId ? 'bg-[#e4234b] text-[#011735]' : 'bg-black/30 border-white/10'}`}
            >
              Rob {p.name}
            </button>
          ))}
        </div>
      )}

      {role === 'troublemaker' && (
        <>
          <p className="text-xs text-white/50">Tap two OTHER players to swap them, blind.</p>
          <div className="grid grid-cols-2 gap-2">
            {others.map((p) => (
              <button
                key={p.peerId}
                onClick={() => {
                  buzz();
                  if (sel === p.peerId) {
                    setSel(null);
                    return;
                  }
                  if (!sel) {
                    setSel(p.peerId);
                    return;
                  }
                  props.onAct({ kind: 'trouble', targetId: sel, secondId: p.peerId });
                  setSel2(p.peerId);
                }}
                className={`rounded px-2 py-1.5 text-sm border ${sel === p.peerId || sel2 === p.peerId ? 'bg-[#e4234b] text-[#011735]' : 'bg-black/30 border-white/10'}`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </>
      )}

      {role === 'drunk' && (
        <CenterPick
          picked={sel}
          onPick={(i) => {
            setSel(String(i));
            props.onAct({ kind: 'drunk', index: i });
          }}
        />
      )}

      {role === 'insomniac' && (
        <p className="text-sm text-white/60">Sleep. You\u2019ll see your final card at dawn.</p>
      )}

      <ActionConfirm flags={props.flags} role={role} />

      {props.isHost && (
        <div className="space-y-2 pt-1">
          <HostNightStepper pool={props.pool} step={wakeStep} onNext={() => setWakeStep((s) => s + 1)} onResolve={props.onResolve} onNarrate={props.onNarrate} />
        </div>
      )}
    </div>
  );
}

/** Official call order for the host's stepped night ceremony. */
const CALL_ORDER: { role: import('../game/one-night/logic').ONURole; cue: string }[] = [
  { role: 'werewolf', cue: 'Werewolves, open your eyes and look for the other werewolf.' },
  { role: 'minion', cue: 'Minion, open your eyes. Werewolves, stick out your thumb.' },
  { role: 'mason', cue: 'Masons, open your eyes and look for the other mason.' },
  { role: 'seer', cue: 'Seer, open your eyes — one player or two center cards.' },
  { role: 'robber', cue: 'Robber, open your eyes — take a card and look at it.' },
  { role: 'troublemaker', cue: 'Troublemaker, open your eyes — switch two others without looking.' },
  { role: 'drunk', cue: 'Drunk, open your eyes — trade your card with a center card.' },
  { role: 'insomniac', cue: 'Insomniac, open your eyes and look at your card.' },
];

function HostNightStepper({
  pool,
  step,
  onNext,
  onResolve,
  onNarrate,
}: {
  pool: import('../game/one-night/logic').ONURole[];
  step: number;
  onNext: () => void;
  onResolve: () => void;
  onNarrate: () => void;
}) {
  const calls = CALL_ORDER.filter((c) => pool.includes(c.role));
  const done = step >= calls.length;
  const dots = (i: number) => (
    <span
      key={i}
      aria-hidden
      className={`h-1.5 w-4 rounded-full ${i < step ? 'bg-[#e4234b]' : i === step && !done ? 'bg-white/70' : 'bg-white/15'}`}
    />
  );
  // constant frame: one full-width, same-height button every step + dots
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-center gap-1.5">{calls.map((_, i) => dots(i))}</div>
      <span className="block text-center text-[11px] text-white/45">
        {done ? `Night called — ${calls.length}/${calls.length} wakes done` : `Wake ${step + 1}/${calls.length} · ${LABEL[calls[step].role]}`}
      </span>
      <button
        onClick={() => {
          buzz();
          if (done) {
            onResolve();
            return;
          }
          speakCue(calls[step].cue);
          onNext();
        }}
        className={`w-full rounded py-2 text-sm font-bold ${done ? 'bg-[#e4234b] text-[#011735]' : 'border border-white/20 text-white'}`}
      >
        {done ? 'Resolve → Day' : `Next — wake ${LABEL[calls[step].role]}`}
      </button>
      <button
        onClick={onNarrate}
        className="block w-full text-center text-[11px] text-white/40 underline"
      >
        Or narrate the whole night automatically
      </button>
    </div>
  );
}

function nightHint(role: import('../game/one-night/logic').ONURole, lone: boolean): string {
  switch (role) {
    case 'werewolf':
      return lone ? 'peek at a center card' : 'know your pack';
    case 'minion':
      return 'learn the wolves';
    case 'mason':
      return 'find your mason';
    case 'seer':
      return 'peek at cards';
    case 'robber':
      return 'steal a card';
    case 'troublemaker':
      return 'swap two others';
    case 'drunk':
      return 'swap with center';
    case 'insomniac':
      return 'sleep…';
    default:
      return 'sleep…';
  }
}

function WakeInfo({ text }: { text: string }) {
  return <p className="text-xs text-red-300">{text}</p>;
}

function ActionConfirm({
  flags,
  role,
}: {
  flags: ONUPublic['night'];
  role: import('../game/one-night/logic').ONURole | null;
}) {
  const done =
    role === 'werewolf'
      ? flags.lone
      : role === 'seer'
        ? flags.seer
        : role === 'robber'
          ? flags.robber
          : role === 'troublemaker'
            ? flags.trouble
            : role === 'drunk'
              ? flags.drunk
              : null;
  if (done === null) return null;
  return done ? (
    <p className="text-xs text-[#e4234b] flex items-center gap-1">
      <Check size={12} /> Locked in — change it any time before resolve.
    </p>
  ) : (
    <p className="text-xs text-white/50">Tap to lock your night action.</p>
  );
}

function CenterPick({
  picked,
  onPick,
}: {
  picked: string | null;
  onPick: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map((i) => (
        <button
          key={i}
          onClick={() => {
            buzz();
            onPick(i);
          }}
          className={`rounded px-2 py-2 text-sm border ${picked === String(i) ? 'bg-[#e4234b] text-[#011735]' : 'bg-black/30 border-white/10'}`}
        >
          Center {i + 1}
        </button>
      ))}
    </div>
  );
}

function CenterPairPick({
  picked,
  onPick,
}: {
  picked: [string | null, string | null];
  onPick: (a: number, b: number) => void;
}) {
  const toggle = (i: number) => {
    buzz();
    const [a, b] = picked;
    const cur = [a, b].filter((x) => x !== null).map(Number);
    if (cur.includes(i)) return;
    const next = [...cur, i].slice(-2);
    if (next.length === 2) onPick(next[0], next[1]);
  };
  return (
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map((i) => (
        <button
          key={i}
          onClick={() => toggle(i)}
          className={`rounded px-2 py-2 text-sm border ${picked.includes(String(i)) ? 'bg-[#e4234b] text-[#011735]' : 'bg-black/30 border-white/10'}`}
        >
          Center {i + 1}
        </button>
      ))}
    </div>
  );
}

function HunterPoint({
  players,
  selfId,
  onPoint,
}: {
  players: Player[];
  selfId: string;
  onPoint: (id: string) => void;
}) {
  const [sel, setSel] = useState<string | null>(null);
  return (
    <>
      <p className="text-xs text-white/50">
        Hunter: point at who dies with you if the vote takes you.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {players
          .filter((p) => p.alive && p.peerId !== selfId)
          .map((p) => (
            <button
              key={p.peerId}
              onClick={() => {
                buzz();
                setSel(p.peerId);
                onPoint(p.peerId);
              }}
              className={`rounded px-2 py-1.5 text-sm border ${sel === p.peerId ? 'bg-red-400 text-black' : 'bg-black/30 border-white/10'}`}
            >
              {p.name}
            </button>
          ))}
      </div>
    </>
  );
}
