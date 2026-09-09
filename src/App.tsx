import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { AboutFull, AboutLine } from './ui/About';
import {
  assignRoles,
  checkWinner,
  makeRoomCode,
  resolveNight,
  resolveVote,
  type Role,
} from './game/werewolf/logic';
import {
  createRoom,
  type ActionMsg,
  type PublicState,
  type RoomHandle,
} from './net/transport';

const initialPublic = (
  players: { peerId: string; name: string }[],
): PublicState => ({
  phase: 'lobby',
  players: players.map((p) => ({ ...p, alive: true })),
  dayCount: 1,
  log: ['Room created. Waiting for players…'],
  votes: {},
  winner: null,
});

function joinUrl(roomCode: string) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?room=${encodeURIComponent(roomCode)}`;
}

interface Senders {
  sendJoin: (d: unknown, target?: string | string[]) => void;
  sendPub: (d: unknown, target?: string | string[]) => void;
  sendRole: (d: unknown, target?: string | string[]) => void;
  sendAct: (d: unknown, target?: string | string[]) => void;
  sendSeer: (d: unknown, target?: string | string[]) => void;
}

export default function App() {
  const params = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  const [name, setName] = useState(
    () => localStorage.getItem('bg-name') ?? '',
  );
  const [roomCode, setRoomCode] = useState(
    () => params.get('room') ?? localStorage.getItem('bg-room') ?? '',
  );
  const [inRoom, setInRoom] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [handle, setHandle] = useState<RoomHandle | null>(null);

  const [pub, setPub] = useState<PublicState | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [seerSeen, setSeerSeen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const rolesRef = useRef<Record<string, Role>>({});
  const nightRef = useRef<{
    wolfTarget: string | null;
    doctorSave: string | null;
    seerCheck: string | null;
    seerBy: string | null;
  }>({ wolfTarget: null, doctorSave: null, seerCheck: null, seerBy: null });
  const votesRef = useRef<Record<string, string>>({});
  const pubRef = useRef<PublicState | null>(null);
  const rosterRef = useRef<{ peerId: string; name: string }[]>([]);
  const sendersRef = useRef<Senders | null>(null);
  const isHostRef = useRef(false);

  pubRef.current = pub;
  isHostRef.current = isHost;
  rosterRef.current =
    pub?.players.map((p) => ({ peerId: p.peerId, name: p.name })) ??
    rosterRef.current;

  const myId = handle?.selfId ?? '';
  const me = pub?.players.find((p) => p.peerId === myId) ?? null;
  const alive = me?.alive ?? true;

  const join = (host: boolean, code: string, playerName: string) => {
    const cleanName = playerName.trim().slice(0, 20) || 'Player';
    const cleanCode = code.trim().toUpperCase() || makeRoomCode();
    localStorage.setItem('bg-name', cleanName);
    localStorage.setItem('bg-room', cleanCode);
    const h = createRoom(cleanCode);
    setHandle(h);
    setRoomCode(cleanCode);
    setIsHost(host);
    setInRoom(true);
    setMyRole(null);
    setSeerSeen(null);
  };

  useEffect(() => {
    if (!inRoom || !handle) return;
    const { room, selfId } = handle;
    const myName = localStorage.getItem('bg-name') ?? 'Player';

    const broadcast = (p: PublicState) => {
      setPub(p);
      sendersRef.current?.sendPub(p as unknown as Record<string, unknown>);
    };

    const joinAct = room.makeAction('join', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onMessage: (data: any, ctx: { peerId: string }) => {
        if (!isHostRef.current) return;
        const peerId = ctx.peerId;
        const msgName = (data?.name as string) ?? 'Player';
        setPub((prev) => {
          const base =
            prev ??
            initialPublic([
              { peerId: selfId, name: myName },
            ]);
          if (base.players.some((p) => p.peerId === peerId)) return prev ?? base;
          const nextPub: PublicState = {
            ...base,
            phase: 'lobby',
            players: [
              ...base.players,
              { peerId, name: msgName, alive: true },
            ],
            log: [...base.log, `${msgName} joined.`].slice(-50),
          };
          // send to everyone + direct to newcomer
          sendersRef.current?.sendPub(nextPub as unknown as Record<string, unknown>);
          sendersRef.current?.sendPub(
            nextPub as unknown as Record<string, unknown>,
            peerId,
          );
          return nextPub;
        });
      },
    });
    const pubAct = room.makeAction('pub', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onMessage: (data: any) => setPub(data as unknown as PublicState),
    });
    const roleAct = room.makeAction('role', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onMessage: (data: any) => setMyRole((data?.role as Role) ?? null),
    });
    const seerAct = room.makeAction('seer', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onMessage: (data: any) => setSeerSeen((data?.text as string) ?? null),
    });
    const actAct = room.makeAction('act', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onMessage: (data: any, ctx: { peerId: string }) => {
        if (!isHostRef.current) return;
        const m = data as unknown as ActionMsg;
        const peerId = ctx.peerId;
        if (m.kind === 'night') {
          const role = rolesRef.current[peerId];
          if (m.nightKind === 'wolf' && role === 'werewolf')
            nightRef.current.wolfTarget = m.targetId;
          if (m.nightKind === 'save' && role === 'doctor')
            nightRef.current.doctorSave = m.targetId;
          if (m.nightKind === 'see' && role === 'seer') {
            nightRef.current.seerCheck = m.targetId;
            nightRef.current.seerBy = peerId;
          }
        }
        if (m.kind === 'vote' && m.targetId) {
          votesRef.current[peerId] = m.targetId;
          const cur = pubRef.current;
          if (cur)
            broadcast({ ...cur, votes: { ...votesRef.current } });
        }
      },
    });

    sendersRef.current = {
      sendJoin: (d, t) =>
        void joinAct.send(
          d as never,
          t ? { target: t } : undefined,
        ),
      sendPub: (d, t) =>
        void pubAct.send(d as never, t ? { target: t } : undefined),
      sendRole: (d, t) =>
        void roleAct.send(d as never, t ? { target: t } : undefined),
      sendAct: (d, t) =>
        void actAct.send(d as never, t ? { target: t } : undefined),
      sendSeer: (d, t) =>
        void seerAct.send(d as never, t ? { target: t } : undefined),
    };

    room.onPeerJoin = (peerId: string) => {
      // tell newcomer who we are; host will add us to roster
      sendersRef.current?.sendJoin({ name: myName }, peerId);
    };
    room.onPeerLeave = (peerId: string) => {
      if (!isHostRef.current) return;
      setPub((prev) => {
        if (!prev) return prev;
        const left = prev.players.find((p) => p.peerId === peerId);
        const next: PublicState = {
          ...prev,
          players: prev.players.map((p) =>
            p.peerId === peerId ? { ...p, alive: false } : p,
          ),
          log: [...prev.log, `${left?.name ?? 'A player'} disconnected.`].slice(-50),
        };
        sendersRef.current?.sendPub(next as unknown as Record<string, unknown>);
        return next;
      });
    };

    if (isHost) {
      const seed: PublicState = initialPublic([
        { peerId: selfId, name: myName },
      ]);
      setPub(seed);
      const t = setTimeout(
        () =>
          sendersRef.current?.sendPub(seed as unknown as Record<string, unknown>),
        800,
      );
      return () => {
        clearTimeout(t);
        room.onPeerJoin = null;
        room.onPeerLeave = null;
      };
    }

    const t = setTimeout(
      () => sendersRef.current?.sendJoin({ name: myName }),
      600,
    );
    return () => {
      clearTimeout(t);
      room.onPeerJoin = null;
      room.onPeerLeave = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inRoom, handle]);

  // ---------- host actions ----------
  const sendPubState = (p: PublicState) => {
    setPub(p);
    sendersRef.current?.sendPub(p as unknown as Record<string, unknown>);
  };

  const hostStart = () => {
    if (!handle || !pub) return;
    const ids = pub.players.map((p) => p.peerId);
    if (ids.length < 5) {
      alert('Need at least 5 players.');
      return;
    }
    const roles = assignRoles(ids);
    rolesRef.current = roles;
    nightRef.current = { wolfTarget: null, doctorSave: null, seerCheck: null, seerBy: null };
    votesRef.current = {};
    ids.forEach((id) => {
      if (id === handle.selfId) setMyRole(roles[id]);
      else sendersRef.current?.sendRole({ role: roles[id] }, id);
    });
    sendPubState({
      phase: 'role',
      players: pub.players.map((p) => ({ ...p, alive: true })),
      dayCount: 1,
      log: [`Game started with ${ids.length} players. Check your secret role.`],
      votes: {},
      winner: null,
    });
  };

  const hostToNight = () =>
    pub &&
    sendPubState({
      ...pub,
      phase: 'night',
      votes: {},
      log: [...pub.log, `Night ${pub.dayCount} falls…`].slice(-50),
    });

  const hostResolveNight = () => {
    if (!pub || !handle) return;
    const { diedId, seerResult } = resolveNight(
      {
        wolfTarget: nightRef.current.wolfTarget,
        doctorSave: nightRef.current.doctorSave,
        seerCheck: nightRef.current.seerCheck,
      },
      rolesRef.current,
    );
    if (nightRef.current.seerBy && seerResult && nightRef.current.seerCheck) {
      const target = nightRef.current.seerCheck;
      const tName = pub.players.find((p) => p.peerId === target)?.name ?? '?';
      const text = `${tName} is ${seerResult.toUpperCase()}`;
      if (nightRef.current.seerBy === handle.selfId) setSeerSeen(text);
      else sendersRef.current?.sendSeer({ text }, nightRef.current.seerBy);
    }
    const players = pub.players.map((p) =>
      p.peerId === diedId ? { ...p, alive: false } : p,
    );
    const diedName = pub.players.find((p) => p.peerId === diedId)?.name;
    const winner = checkWinner(
      rolesRef.current,
      players.filter((p) => p.alive).map((p) => p.peerId),
    );
    nightRef.current = { wolfTarget: null, doctorSave: null, seerCheck: null, seerBy: null };
    votesRef.current = {};
    setPicked(null);
    sendPubState({
      ...pub,
      phase: winner ? 'ended' : 'day',
      players,
      winner,
      lastDead: diedId,
      votes: {},
      log: [
        ...pub.log,
        diedId
          ? `☀️ Day ${pub.dayCount}: ${diedName} was killed.`
          : `☀️ Day ${pub.dayCount}: nobody died.`,
        ...(winner ? [`🏆 ${winner} win!`] : []),
      ].slice(-50),
    });
  };

  const hostToVote = () =>
    pub &&
    sendPubState({
      ...pub,
      phase: 'vote',
      log: [...pub.log, 'Vote: pick who to exile.'].slice(-50),
    });

  const hostResolveVote = () => {
    if (!pub) return;
    const aliveIds = pub.players.filter((p) => p.alive).map((p) => p.peerId);
    const exiled = resolveVote(votesRef.current, aliveIds);
    const players = pub.players.map((p) =>
      p.peerId === exiled ? { ...p, alive: false } : p,
    );
    const exName = pub.players.find((p) => p.peerId === exiled)?.name;
    const winner = checkWinner(
      rolesRef.current,
      players.filter((p) => p.alive).map((p) => p.peerId),
    );
    votesRef.current = {};
    setPicked(null);
    sendPubState({
      ...pub,
      phase: winner ? 'ended' : 'night',
      players,
      dayCount: pub.dayCount + 1,
      winner,
      lastExiled: exiled,
      votes: {},
      log: [
        ...pub.log,
        exiled ? `🗳️ ${exName} was exiled.` : '🗳️ Tie — nobody exiled.',
        ...(winner ? [`🏆 ${winner} win!`] : [`🌙 Night ${pub.dayCount + 1} falls…`]),
      ].slice(-50),
    });
  };

  const hostRestart = () => {
    if (!pub) return;
    votesRef.current = {};
    nightRef.current = { wolfTarget: null, doctorSave: null, seerCheck: null, seerBy: null };
    setMyRole(null);
    setSeerSeen(null);
    sendPubState({
      ...pub,
      phase: 'lobby',
      players: pub.players.map((p) => ({ ...p, alive: true })),
      dayCount: 1,
      winner: null,
      votes: {},
      lastDead: null,
      lastExiled: null,
      log: [...pub.log, 'Back to lobby. Host can start again.'].slice(-50),
    });
  };

  // ---------- guest actions ----------
  const sendGuestAction = (msg: ActionMsg) => {
    if (!handle) return;
    if (isHost) {
      if (msg.kind === 'night') {
        if (msg.nightKind === 'wolf') nightRef.current.wolfTarget = msg.targetId;
        if (msg.nightKind === 'save') nightRef.current.doctorSave = msg.targetId;
        if (msg.nightKind === 'see') {
          nightRef.current.seerCheck = msg.targetId;
          nightRef.current.seerBy = handle.selfId;
        }
      }
      if (msg.kind === 'vote' && msg.targetId) {
        votesRef.current[handle.selfId] = msg.targetId;
        if (pub) sendPubState({ ...pub, votes: { ...votesRef.current } });
      }
      return;
    }
    sendersRef.current?.sendAct(msg as unknown as Record<string, unknown>);
  };

  // ================= render =================
  if (!inRoom) {
    return (
      <div data-game="werewolf" className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white/5 rounded-2xl p-6 space-y-4 border border-white/10">
          <h1 className="text-3xl font-bold">🐺 Bored Games</h1>
          <p className="text-sm text-white/70">
            Werewolf over the internet with a room code. No server, no
            sign-up. One Host, everyone joins.
          </p>
          <label className="block text-xs uppercase text-white/60">Your name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Atharva"
            className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 outline-none"
          />
          <label className="block text-xs uppercase text-white/60">Room code</label>
          <input
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="WOLF-XXXX"
            className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 outline-none font-mono"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => join(true, roomCode || makeRoomCode(), name)}
              className="btn-accent"
            >
              Create
            </button>
            <button
              onClick={() => roomCode.trim() && join(false, roomCode, name)}
              className="rounded-xl bg-white text-black font-semibold py-2"
            >
              Join
            </button>
          </div>
          <p className="text-xs text-white/50">
            Tip: Host taps Create, shares the QR/code. Works on Android + iOS
            browsers together.
          </p>
          <AboutFull />
        </div>
      </div>
    );
  }

  const phase = pub?.phase ?? 'lobby';

  return (
    <div data-game="werewolf" className="min-h-screen p-3 max-w-xl mx-auto space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <div className="font-mono text-lg font-bold">{roomCode}</div>
          <div className="text-xs text-white/60">
            {isHost ? 'You are HOST' : `You are ${name}`} · {pub?.players.length ?? 0} players
          </div>
        </div>
        <button
          onClick={() => {
            handle?.leave();
            window.location.search = '';
            window.location.reload();
          }}
          className="text-xs border border-white/15 rounded-lg px-2 py-1 text-white/70"
        >
          Leave
        </button>
      </header>

      {phase === 'lobby' && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="flex gap-3 items-center">
            <div className="bg-white p-2 rounded-xl">
              <QRCodeSVG value={joinUrl(roomCode)} size={110} />
            </div>
            <div className="text-sm text-white/75">
              <div className="font-semibold text-white">Scan to join</div>
              <div className="font-mono break-all">{joinUrl(roomCode)}</div>
              <div className="mt-1">Need 5+ to start. 7+ adds Seer + Doctor, 11+ adds 3rd wolf.</div>
            </div>
          </div>
          <ul className="divide-y divide-white/10">
            {(pub?.players ?? []).map((p) => (
              <li key={p.peerId} className="py-1.5 text-sm">🙂 {p.name}</li>
            ))}
          </ul>
          {isHost ? (
            <button onClick={hostStart} className="btn-accent">
              Start game ({pub?.players.length ?? 0})
            </button>
          ) : (
            <p className="text-sm text-white/60">Waiting for host to start…</p>
          )}
        </div>
      )}

      {phase !== 'lobby' && pub && (
        <>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="text-xs uppercase text-white/50">Your role</div>
            <div className="text-2xl font-bold">
              {myRole
                ? ({ werewolf: '🐺 Werewolf', seer: '🔮 Seer', doctor: '💉 Doctor', villager: '🌾 Villager' } as Record<Role, string>)[myRole]
                : '…waiting for host…'}
            </div>
            {seerSeen && <div className="text-xs text-violet-300 mt-1">🔮 {seerSeen}</div>}
            {!alive && <div className="text-sm text-white/60 mt-1">You are dead — watch only.</div>}
          </div>

          {phase === 'role' && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
              <p className="text-sm text-white/70">Memorize your role. Host starts the first night when all are ready.</p>
              {isHost && (
                <button onClick={hostToNight} className="w-full rounded-xl bg-white text-black font-bold py-2">Start Night 1</button>
              )}
            </div>
          )}

          {phase === 'night' && (
            <NightPanel
              myRole={myRole}
              players={pub.players}
              alive={alive}
              picked={picked}
              setPicked={setPicked}
              onAct={(nightKind, targetId) =>
                sendGuestAction({ kind: 'night', nightKind, targetId, fromName: name })
              }
            />
          )}

          {(phase === 'day' || phase === 'vote') && (
            <VotePanel
              phase={phase}
              players={pub.players}
              votes={pub.votes ?? {}}
              alive={alive}
              picked={picked}
              onVote={(targetId) => {
                setPicked(targetId);
                sendGuestAction({ kind: 'vote', targetId, fromName: name });
              }}
            />
          )}

          {phase === 'ended' && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center space-y-2">
              <div className="text-3xl">🏆 {pub.winner} win!</div>
              {isHost && (
                <button onClick={hostRestart} className="btn-accent">Back to lobby</button>
              )}
            </div>
          )}

          {isHost && phase === 'night' && (
            <button onClick={hostResolveNight} className="w-full rounded-xl bg-amber-300 text-black font-bold py-2.5">Resolve night → Day</button>
          )}
          {isHost && phase === 'day' && (
            <button onClick={hostToVote} className="w-full rounded-xl bg-white text-black font-bold py-2.5">Go to vote</button>
          )}
          {isHost && phase === 'vote' && (
            <button onClick={hostResolveVote} className="w-full rounded-xl bg-amber-300 text-black font-bold py-2.5">Resolve vote → Night</button>
          )}

          <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
            <div className="text-xs uppercase text-white/50 mb-1">Players</div>
            <ul className="text-sm space-y-1">
              {pub.players.map((p) => (
                <li key={p.peerId} className={p.alive ? '' : 'line-through text-white/40'}>
                  {p.alive ? '🙂' : '💀'} {p.name}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-black/30 border border-white/10 rounded-2xl p-3">
            <div className="text-xs uppercase text-white/50 mb-1">Game log · Day {pub.dayCount}</div>
            <ul className="text-xs space-y-1 text-white/75 max-h-40 overflow-auto">
              {[...pub.log].reverse().map((l, i) => <li key={i}>• {l}</li>)}
            </ul>
          </div>
          <AboutLine />
        </>
      )}
    </div>
  );
}

function NightPanel(props: {
  myRole: Role | null;
  players: { peerId: string; name: string; alive: boolean }[];
  alive: boolean;
  picked: string | null;
  setPicked: (s: string | null) => void;
  onAct: (kind: 'wolf' | 'save' | 'see', targetId: string | null) => void;
}) {
  const { myRole, players, alive } = props;
  const targets = players.filter((p) => p.alive);
  if (!alive) return <div className="text-sm text-white/60">You are dead. Waiting for dawn…</div>;
  if (!myRole) return <div className="text-sm text-white/60">Waiting for role…</div>;
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
      <div className="font-semibold">
        🌙 Night — {myRole === 'werewolf' ? 'pick a kill' : myRole === 'seer' ? 'pick to inspect' : myRole === 'doctor' ? 'pick to save' : 'sleep… villagers wait'}
      </div>
      {myRole !== 'villager' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {targets.map((p) => (
              <button
                key={p.peerId}
                onClick={() => {
                  props.setPicked(p.peerId);
                  props.onAct(myRole === 'werewolf' ? 'wolf' : myRole === 'seer' ? 'see' : 'save', p.peerId);
                }}
                className={`rounded-lg px-2 py-1.5 text-sm border ${props.picked === p.peerId ? 'bg-emerald-400 text-black' : 'bg-black/30 border-white/10'}`}
              >
                {p.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-white/50">Tap to lock. You can change until host resolves.</p>
        </>
      )}
      {myRole === 'villager' && <p className="text-sm text-white/60">Close your eyes… waiting for host to resolve.</p>}
    </div>
  );
}

function VotePanel(props: {
  phase: string;
  players: { peerId: string; name: string; alive: boolean }[];
  votes: Record<string, string>;
  alive: boolean;
  picked: string | null;
  onVote: (targetId: string) => void;
}) {
  const counts = new Map<string, number>();
  Object.values(props.votes).forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
      <div className="font-semibold">{props.phase === 'day' ? '☀️ Day — discuss, then host opens vote' : '🗳️ Vote — tap to exile'}</div>
      <div className="grid grid-cols-2 gap-2">
        {props.players.filter((p) => p.alive).map((p) => (
          <button
            key={p.peerId}
            disabled={!props.alive || props.phase !== 'vote'}
            onClick={() => props.onVote(p.peerId)}
            className={`rounded-lg px-2 py-1.5 text-sm border disabled:opacity-50 ${props.picked === p.peerId ? 'bg-red-400 text-black' : 'bg-black/30 border-white/10'}`}
          >
            {p.name} {counts.get(p.peerId) ? `(${counts.get(p.peerId)})` : ''}
          </button>
        ))}
      </div>
    </div>
  );
}
