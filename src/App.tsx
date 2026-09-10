import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Check,
  Copy,
  Eye,
  Gavel,
  Info,
  Moon,
  Radio,
  Skull,
  Sun,
  Syringe,
  Trophy,
  User,
  Volume2,
  VolumeX,
  Vote,
  Wheat,
  X,
} from 'lucide-react';
import { HowToOverlay } from './ui/HowTo';
import { DiagnosticsOverlay } from './ui/Diagnostics';
import { logDiag, resetDiag } from './net/diagnostics';
import { fetchTurnServers, getCachedTurn, primeTurn } from './net/turn';
import { cancelSpeech, narrateNight, speakCue } from './ui/narrate';
import { RoomFinePrint, SHFinePrint, WerewolfFinePrint } from './ui/About';
import { HomeLogo, Landing, type GamePick } from './ui/Landing';
import SecretHitler from './ui/SecretHitler';
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
import {
  addPlayer,
  disconnectedAlive,
  normalize,
  rejoin,
  setPresence,
  type Player,
} from './net/presence';

const ROLE_META: Record<Role, { label: string; Icon: typeof Moon; blurb: string }> = {
  werewolf: {
    label: 'Werewolf',
    Icon: Moon,
    blurb: 'Each night, agree with the pack on one victim. By day, blend in and push the vote elsewhere.',
  },
  seer: {
    label: 'Seer',
    Icon: Eye,
    blurb: 'Each night, inspect one player to learn their true role. Share carefully — exposure gets you eaten.',
  },
  doctor: {
    label: 'Doctor',
    Icon: Syringe,
    blurb: 'Each night, save one player. Saving the wolves\u2019 victim stops the kill.',
  },
  villager: {
    label: 'Villager',
    Icon: Wheat,
    blurb: 'No night power. Watch, deduce, and vote by day — your voice is your weapon.',
  },
};

const initialPublic = (
  players: { peerId: string; name: string }[],
  game: 'werewolf' | 'secret-hitler' = 'werewolf',
): PublicState => ({
  phase: 'lobby',
  players: players.map((p) => ({ ...p, alive: true, online: true })),
  dayCount: 1,
  log: ['Room created. Waiting for players…'],
  votes: {},
  winner: null,
  game,
});

function joinUrl(roomCode: string) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?room=${encodeURIComponent(roomCode)}`;
}

// Robust clipboard copy: tries the async Clipboard API, falls back to a
// hidden textarea + execCommand, and finally reveals the raw text so the
// user can select-and-copy by hand (iOS Safari frequently rejects
// programmatic clipboard writes outside a direct user gesture).
async function copyToClipboard(
  text: string,
  onManual: (text: string) => void,
): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    throw new Error('no clipboard API');
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) return true;
      throw new Error('execCommand failed');
    } catch {
      onManual(text);
      return false;
    }
  }
}

function getClientId(): string {
  let c = localStorage.getItem('bg-client');
  if (!c) {
    c = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('bg-client', c);
  }
  return c;
}

interface Session {
  room: string;
  name: string;
  isHost: boolean;
}

function loadSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem('bg-session') ?? 'null');
    if (s && typeof s.room === 'string' && typeof s.name === 'string')
      return s as Session;
  } catch {
    /* no session */
  }
  return null;
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
  const [name, setName] = useState(() =>
    // QR arrivals (?room=) get a blank name field; everyone else keeps theirs
    params.get('room') ? '' : (localStorage.getItem('bg-name') ?? ''),
  );
  const [roomCode, setRoomCode] = useState(
    () => params.get('room') ?? localStorage.getItem('bg-room') ?? '',
  );
  const [inRoom, setInRoom] = useState(false);
  const [selected, setSelected] = useState<GamePick | null>(() =>
    // QR arrivals skip the picker and land on the Werewolf join form
    params.get('room') ? 'werewolf' : null,
  );
  const [isHost, setIsHost] = useState(false);
  const [handle, setHandle] = useState<RoomHandle | null>(null);

  const [pub, setPub] = useState<PublicState | null>(null);
  const [peerCount, setPeerCount] = useState(0);
  const [myRole, setMyRole] = useState<Role | null>(() => {
    // instant restore after refresh; host re-sends the role to confirm
    try {
      const saved = JSON.parse(localStorage.getItem('bg-myrole') ?? 'null');
      if (saved && saved.room === (params.get('room') ?? localStorage.getItem('bg-room')) && typeof saved.role === 'string')
        return saved.role as Role;
    } catch {
      /* no saved role */
    }
    return null;
  });
  const [seerSeen, setSeerSeen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [sound, setSound] = useState(
    () => localStorage.getItem('bg-sound') !== '0',
  );
  const [showHelp, setShowHelp] = useState(false);
  const [showDiag, setShowDiag] = useState(false);
  const [hostLost, setHostLost] = useState(false);
  const [copiedField, setCopiedField] = useState<'link' | 'code' | null>(null);
  const [manualCopyText, setManualCopyText] = useState<string | null>(null);
  const clientId = useMemo(() => getClientId(), []);

  const copyField = (field: 'link' | 'code', text: string) => {
    void copyToClipboard(text, setManualCopyText).then((ok) => {
      if (ok) {
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
      }
    });
  };

  // Warm TURN credentials while the user is still typing their name, so
  // they're ready by the time Create/Join is tapped.
  useEffect(() => {
    primeTurn();
  }, []);

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
  const clientToPeer = useRef<Record<string, string>>({});
  const peerToClient = useRef<Record<string, string>>({});
  const isHostRef = useRef(false);
  const lastPubAtRef = useRef<number | null>(null);
  const iceStateRef = useRef<Record<string, string>>({});
  const icePairReportedRef = useRef<Set<string>>(new Set());

  pubRef.current = pub;
  isHostRef.current = isHost;
  rosterRef.current =
    pub?.players.map((p) => ({ peerId: p.peerId, name: p.name })) ??
    rosterRef.current;

  const myId = handle?.selfId ?? '';
  const me = pub?.players.find((p) => p.peerId === myId) ?? null;
  const alive = me?.alive ?? true;

  const join = async (host: boolean, code: string, playerName: string) => {
    const cleanName = playerName.trim().slice(0, 20) || 'Player';
    const cleanCode = code.trim().toUpperCase() || makeRoomCode();
    resetDiag();
    logDiag('join', `${host ? 'as host' : 'as guest'} ${cleanCode}`);
    localStorage.setItem('bg-name', cleanName);
    localStorage.setItem('bg-room', cleanCode);
    const sess = { room: cleanCode, name: cleanName, isHost: host };
    localStorage.setItem('bg-session', JSON.stringify(sess));
    setSession(sess);
    const iceServers =
      getCachedTurn().length > 0 ? getCachedTurn() : await fetchTurnServers();
    logDiag(
      'turn',
      iceServers.length
        ? `${iceServers.length} server(s), urls: ${iceServers
            .flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]))
            .join(', ')}`
        : 'NONE — no TURN',
    );
    const h = createRoom(
      cleanCode,
      host,
      (e) => logDiag('join-error', e.error),
      iceServers,
    );
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
    logDiag('room-created');
    const myName = localStorage.getItem('bg-name') ?? 'Player';

    const broadcast = (p: PublicState) => {
      setPub(p);
      sendersRef.current?.sendPub(p as unknown as Record<string, unknown>);
    };

    // Move every peer-keyed record from an old peerId to a new one when a
    // known client reconnects after a refresh.
    const rekeyPeer = (oldPeer: string, newPeer: string) => {
      if (rolesRef.current[oldPeer] !== undefined) {
        rolesRef.current[newPeer] = rolesRef.current[oldPeer];
        delete rolesRef.current[oldPeer];
      }
      for (const [voter, target] of Object.entries(votesRef.current)) {
        if (voter === oldPeer) {
          votesRef.current[newPeer] = target;
          delete votesRef.current[oldPeer];
        }
        if (target === oldPeer) votesRef.current[voter] = newPeer;
      }
      const n = nightRef.current;
      if (n.wolfTarget === oldPeer) n.wolfTarget = newPeer;
      if (n.doctorSave === oldPeer) n.doctorSave = newPeer;
      if (n.seerCheck === oldPeer) n.seerCheck = newPeer;
      if (n.seerBy === oldPeer) n.seerBy = newPeer;
    };

    const handleJoin = (peerId: string, data: unknown) => {
      if (!isHostRef.current) return;
      const msg = data as { name?: string; client?: string };
      const msgName = (msg?.name as string) ?? 'Player';
      logDiag('join-msg', `${msgName} ${peerId}`);
      const client = (msg?.client as string) ?? peerId;
      peerToClient.current[peerId] = client;
      const prevPeer = clientToPeer.current[client];
      clientToPeer.current[client] = peerId;

      const sendNow = sendersRef.current;
      let base = pubRef.current;
      if (!base) {
        base = initialPublic([{ peerId: selfId, name: myName }]);
        clientToPeer.current[clientId] = selfId;
        peerToClient.current[selfId] = clientId;
      }

      // duplicate announce (retries) — just re-send state to converge
      if (base.players.some((p) => p.peerId === peerId)) {
        sendNow?.sendPub(base as unknown as Record<string, unknown>, peerId);
        return;
      }

      let logLine: string;
      let nextPlayers = base.players;
      if (prevPeer && prevPeer !== peerId) {
        // refresh rejoin: migrate records, keep the seat, keep alive as-is
        rekeyPeer(prevPeer, peerId);
        nextPlayers = rejoin(base.players, prevPeer, peerId, msgName);
        logLine = `${msgName} reconnected.`;
        const role = rolesRef.current[peerId];
        if (role && base.phase !== 'lobby')
          sendNow?.sendRole({ role }, peerId);
      } else if (!base.players.some((p) => p.peerId === peerId)) {
        const spectate = base.phase !== 'lobby';
        nextPlayers = addPlayer(base.players, peerId, msgName, spectate);
        logLine = spectate
          ? `${msgName} joined as spectator.`
          : `${msgName} joined.`;
      } else {
        return;
      }

      const nextPub: PublicState = {
        ...base,
        phase: base.phase === 'lobby' ? 'lobby' : base.phase,
        players: nextPlayers,
        log: [...base.log, logLine].slice(-50),
      };
      setPub(nextPub);
      sendNow?.sendPub(nextPub as unknown as Record<string, unknown>);
      sendNow?.sendPub(nextPub as unknown as Record<string, unknown>, peerId);
    };

    const joinAct = room.makeAction('join', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onMessage: (data: any, ctx: { peerId: string }) =>
        handleJoin(ctx.peerId, data),
    });
    const pubAct = room.makeAction('pub', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onMessage: (data: any) => {
        lastPubAtRef.current = Date.now();
        const incoming = data as unknown as PublicState;
        logDiag('pub-recv', 'players=' + (incoming.players?.length ?? 0));
        setPub({ ...incoming, players: normalize(incoming.players) });
      },
    });
    const roleAct = room.makeAction('role', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onMessage: (data: any) => {
        const role = (data?.role as Role) ?? null;
        setMyRole(role);
        if (role)
          localStorage.setItem(
            'bg-myrole',
            JSON.stringify({ room: roomCode, role }),
          );
      },
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
        // votes tally per stable client so a refresh can't double-vote
        const voter =
          peerToClient.current[peerId] ??
          (peerId === selfId ? clientId : peerId);
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
          // checklist for the host panel (flags only, targets stay secret)
          const n = nightRef.current;
          const cur = pubRef.current;
          if (cur)
            broadcast({
              ...cur,
              night: {
                wolf: n.wolfTarget != null,
                save: n.doctorSave != null,
                see: n.seerCheck != null,
              },
            });
        }
        if (m.kind === 'vote' && m.targetId) {
          votesRef.current[voter] = m.targetId;
          const cur = pubRef.current;
          if (cur)
            broadcast({ ...cur, votes: { ...votesRef.current } });
        }
        if (m.kind === 'ready') {
          const cur = pubRef.current;
          if (cur && cur.phase === 'role') {
            const ready = [...new Set([...(cur.ready ?? []), voter])];
            broadcast({ ...cur, ready });
          }
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
      logDiag('peer-join', peerId);
      // tell newcomer who we are; host will add us to roster
      sendersRef.current?.sendJoin({ name: myName, client: clientId }, peerId);
      // host also pushes current state directly to the newcomer
      if (isHostRef.current && pubRef.current)
        sendersRef.current?.sendPub(
          pubRef.current as unknown as Record<string, unknown>,
          peerId,
        );
    };
    room.onPeerLeave = (peerId: string) => {
      logDiag('peer-leave', peerId);
      if (!isHostRef.current) return;
      setPub((prev) => {
        if (!prev) return prev;
        const left = prev.players.find((p) => p.peerId === peerId);
        // A dropped socket is a NETWORK event, not a game outcome — `alive`
        // is game state (killed by wolves / exiled) and must never be
        // written here. Only `online` (presence) flips off; the player can
        // still be voted for / targeted and won't end the game by dropping.
        const next: PublicState = {
          ...prev,
          players: setPresence(prev.players as Player[], peerId, false),
          log: [
            ...prev.log,
            `${left?.name ?? 'A player'} lost connection — reconnecting…`,
          ].slice(-50),
        };
        sendersRef.current?.sendPub(next as unknown as Record<string, unknown>);
        return next;
      });
    };

    // connection diagnostics: live peer count for the lobby signal readout,
    // and (guests only) detect a host that's gone silent so we can surface
    // it instead of staring at a stale board.
    let lastPeerCount = -1;
    iceStateRef.current = {};
    icePairReportedRef.current = new Set();
    const logIcePair = (peerId: string, pc: RTCPeerConnection) => {
      if (icePairReportedRef.current.has(peerId)) return;
      icePairReportedRef.current.add(peerId);
      pc.getStats()
        .then((stats) => {
          let pair: RTCIceCandidatePairStats | null = null;
          stats.forEach((s) => {
            if (
              s.type === 'candidate-pair' &&
              s.state === 'succeeded' &&
              s.nominated
            ) {
              pair = s as RTCIceCandidatePairStats;
            }
          });
          if (!pair) return;
          let localType = '?';
          let remoteType = '?';
          stats.forEach((s) => {
            const candidate = s as RTCStats & { candidateType?: string };
            if (s.id === (pair as RTCIceCandidatePairStats).localCandidateId)
              localType = candidate.candidateType ?? '?';
            if (s.id === (pair as RTCIceCandidatePairStats).remoteCandidateId)
              remoteType = candidate.candidateType ?? '?';
          });
          logDiag('ice-pair', `${peerId.slice(0, 6)} ${localType}/${remoteType}`);
        })
        .catch(() => {
          /* stats unavailable — never break the timer */
        });
    };
    const peerTimer = setInterval(() => {
      try {
        const peers = room.getPeers();
        const ids = Object.keys(peers);
        const n = ids.length;
        if (n !== lastPeerCount) {
          lastPeerCount = n;
          logDiag('peers', String(n));
        }
        setPeerCount(n);

        // real peer connection ICE state changes + the decisive candidate
        // types once connected (was the game actually relayed via TURN?)
        // Only meaningful under the WebRTC (Trystero) transport — under the
        // WebSocket relay, `peers[id]` is an inert placeholder, not an
        // RTCPeerConnection, so skip anything that assumes it is one.
        for (const peerId of ids) {
          const pc = peers[peerId];
          if (typeof pc?.getStats !== 'function') continue;
          const state = pc.iceConnectionState;
          if (iceStateRef.current[peerId] !== state) {
            iceStateRef.current[peerId] = state;
            logDiag('ice', `${peerId.slice(0, 6)} ${state}`);
          }
          if (state === 'connected' || state === 'completed') {
            try {
              logIcePair(peerId, pc);
            } catch {
              /* never break the timer */
            }
          }
        }
        for (const peerId of Object.keys(iceStateRef.current)) {
          if (!ids.includes(peerId)) {
            delete iceStateRef.current[peerId];
            icePairReportedRef.current.delete(peerId);
          }
        }
      } catch {
        /* trackers unreachable */
      }
      if (!isHostRef.current) {
        const last = lastPubAtRef.current;
        setHostLost(last !== null && Date.now() - last > 15000);
      }
    }, 1000);

    // guest retry: announces are fire-and-forget, so re-announce until the
    // host's state arrives. Aggressive in the first seconds (when the relay
    // handshake is still warming up), relaxed backoff after.
    let retries = 0;
    let slowRetryTimer: ReturnType<typeof setInterval> | null = null;
    const announce = () => {
      logDiag('announce');
      sendersRef.current?.sendJoin({ name: myName, client: clientId });
    };
    const retryTimer = setInterval(() => {
      if (pubRef.current) {
        clearInterval(retryTimer);
        return;
      }
      announce();
      retries++;
      if (retries === 12) {
        clearInterval(retryTimer);
        slowRetryTimer = setInterval(() => {
          if (!pubRef.current) announce();
        }, 4000);
      }
    }, 1000);

    // phones sleeping in background drop sockets: re-announce the moment
    // the tab is visible again instead of waiting for the next retry
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!pubRef.current) announce();
      else if (isHostRef.current && pubRef.current)
        sendersRef.current?.sendPub(
          pubRef.current as unknown as Record<string, unknown>,
        );
    };
    document.addEventListener('visibilitychange', onVisible);

    // host heartbeat: rebroadcast state so late joiners converge
    const beatTimer = setInterval(() => {
      if (isHostRef.current && pubRef.current)
        sendersRef.current?.sendPub(
          pubRef.current as unknown as Record<string, unknown>,
        );
    }, 5000);

    const stopTimers = () => {
      clearInterval(peerTimer);
      clearInterval(retryTimer);
      if (slowRetryTimer) clearInterval(slowRetryTimer);
      clearInterval(beatTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };

    if (isHost) {
      // refresh recovery: restore truth saved before the reload
      let seed: PublicState;
      try {
        const saved = JSON.parse(
          localStorage.getItem(`bg-host-${roomCode}`) ?? 'null',
        );
        if (saved && saved.pub && saved.roles && saved.hostPeer) {
          const oldPeer = saved.hostPeer as string;
          rolesRef.current = saved.roles as Record<string, Role>;
          if (oldPeer !== selfId && rolesRef.current[oldPeer] !== undefined) {
            rolesRef.current[selfId] = rolesRef.current[oldPeer];
            delete rolesRef.current[oldPeer];
          }
          const players = normalize(
            saved.pub.players as PublicState['players'],
          ).map((p) => (p.peerId === oldPeer ? { ...p, peerId: selfId } : p));
          seed = {
            ...(saved.pub as PublicState),
            players,
            log: [
              ...(saved.pub.log as string[]),
              ...((saved.pub as PublicState).phase === 'lobby'
                ? []
                : ['Host rebooted — night inputs reset.']),
            ].slice(-50),
          };
          const me = players.find((p) => p.peerId === selfId);
          if (me && rolesRef.current[selfId]) {
            setMyRole(rolesRef.current[selfId]);
            localStorage.setItem(
              'bg-myrole',
              JSON.stringify({ room: roomCode, role: rolesRef.current[selfId] }),
            );
          }
        } else {
          throw new Error('no save');
        }
      } catch {
        seed = initialPublic(
          [{ peerId: selfId, name: myName }],
          selected === 'sh' ? 'secret-hitler' : 'werewolf',
        );
      }
      clientToPeer.current[clientId] = selfId;
      peerToClient.current[selfId] = clientId;
      nightRef.current = { wolfTarget: null, doctorSave: null, seerCheck: null, seerBy: null };
      votesRef.current = {};
      setPub(seed);
      // announce immediately (relay may still be warming up) + once more
      // after the handshake has had a moment — whichever lands first wins
      sendersRef.current?.sendPub(seed as unknown as Record<string, unknown>);
      const t = setTimeout(
        () =>
          sendersRef.current?.sendPub(seed as unknown as Record<string, unknown>),
        800,
      );
      return () => {
        clearTimeout(t);
        stopTimers();
        room.onPeerJoin = null;
        room.onPeerLeave = null;
        void room.leave();
      };
    }

    announce();
    const t = setTimeout(() => announce(), 800);
    return () => {
      clearTimeout(t);
      stopTimers();
      room.onPeerJoin = null;
      room.onPeerLeave = null;
      void room.leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inRoom, handle]);

  // host persistence: every state change is saved so a host refresh
  // restores the table instead of killing the game
  useEffect(() => {
    if (inRoom && isHost && pub && handle) {
      try {
        localStorage.setItem(
          `bg-host-${roomCode}`,
          JSON.stringify({
            pub,
            roles: rolesRef.current,
            hostPeer: handle.selfId,
          }),
        );
      } catch {
        /* storage full — game still works, just not refresh-proof */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pub]);

  // spoken phase cues on every device (each user already tapped around,
  // so autoplay policies are satisfied after the first interaction)
  const phaseForCue = pub?.phase;
  useEffect(() => {
    if (!inRoom || !sound || !pub || phaseForCue === 'lobby') return;
    if (phaseForCue === 'role') speakCue('Check your secret role.');
    else if (phaseForCue === 'night')
      speakCue(`Night ${pub.dayCount}. Close your eyes.`);
    else if (phaseForCue === 'day') {
      const dead = pub.players.find((p) => p.peerId === pub.lastDead);
      speakCue(
        dead
          ? `Day ${pub.dayCount}. ${dead.name} was killed.`
          : `Day ${pub.dayCount}. Nobody died.`,
      );
    } else if (phaseForCue === 'vote') speakCue('Vote now.');
    else if (phaseForCue === 'ended' && pub.winner)
      speakCue(`${pub.winner} win.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseForCue]);

  // ---------- host actions ----------
  const sendPubState = (p: PublicState) => {
    setPub(p);
    sendersRef.current?.sendPub(p as unknown as Record<string, unknown>);
  };

  const hostStart = () => {
    if (!handle || !pub) return;
    const ids = pub.players.map((p) => p.peerId);
    if (ids.length < 1) {
      alert('Nobody here yet.');
      return;
    }
    const demo = ids.length < 5;
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
      log: [`Game started with ${ids.length} players. Check your secret role.${demo ? ' Demo mode — fewer than 5.' : ''}`],
      votes: {},
      ready: [],
      night: { wolf: false, save: false, see: false },
      winner: null,
    });
  };

  const pickGame = (game: 'werewolf' | 'secret-hitler') => {
    if (!isHost || !pub) return;
    sendPubState({ ...pub, game });
  };

  const startSH = () => {
    if (!handle || !pub) return;
    const n = pub.players.length;
    if (n < 5 || n > 10) {
      alert('Secret Hitler needs 5-10 players.');
      return;
    }
    sendPubState({
      ...pub,
      game: 'secret-hitler',
      log: [...pub.log, 'Secret Hitler table opening…'].slice(-50),
    });
  };

  const exitSH = () => {
    if (!pub) return;
    sendPubState({
      ...pub,
      game: 'werewolf',
      phase: 'lobby',
      players: pub.players.map((p) => ({ ...p, alive: true })),
      dayCount: 1,
      votes: {},
      ready: [],
      winner: null,
      lastDead: null,
      lastExiled: null,
      log: [...pub.log, 'Back to lobby. Host can start again.'].slice(-50),
    });
  };

  const hostToNight = () =>
    pub &&
    sendPubState({
      ...pub,
      phase: 'night',
      votes: {},
      ready: [],
      night: { wolf: false, save: false, see: false },
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
          ? `Day ${pub.dayCount}: ${diedName} was killed.`
          : `Day ${pub.dayCount}: nobody died.`,
        ...(winner ? [`${winner} win!`] : []),
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
        exiled ? `${exName} was exiled.` : 'Tie — nobody exiled.',
        ...(winner ? [`${winner} win!`] : [`Night ${pub.dayCount + 1} falls…`]),
      ].slice(-50),
    });
  };

  const hostRestart = () => {
    if (!pub) return;
    votesRef.current = {};
    nightRef.current = { wolfTarget: null, doctorSave: null, seerCheck: null, seerBy: null };
    setMyRole(null);
    setSeerSeen(null);
    localStorage.removeItem('bg-myrole');
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
    const full = { ...msg, client: clientId };
    if (isHost) {
      if (full.kind === 'night') {
        if (full.nightKind === 'wolf') nightRef.current.wolfTarget = full.targetId;
        if (full.nightKind === 'save') nightRef.current.doctorSave = full.targetId;
        if (full.nightKind === 'see') {
          nightRef.current.seerCheck = full.targetId;
          nightRef.current.seerBy = handle.selfId;
        }
        const n = nightRef.current;
        if (pub)
          sendPubState({
            ...pub,
            night: {
              wolf: n.wolfTarget != null,
              save: n.doctorSave != null,
              see: n.seerCheck != null,
            },
          });
        return;
      }
      if (full.kind === 'vote' && full.targetId) {
        votesRef.current[clientId] = full.targetId;
        if (pub) sendPubState({ ...pub, votes: { ...votesRef.current } });
      }
      return;
    }
    sendersRef.current?.sendAct(full as unknown as Record<string, unknown>);
  };

  const leaveRoom = () => {
    cancelSpeech();
    handle?.leave();
    // intentional leave wipes everything: session, role, host table save.
    // A plain refresh keeps all of these, so refresh never throws you out.
    localStorage.removeItem('bg-session');
    localStorage.removeItem('bg-myrole');
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('bg-host-')) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    setSession(null);
    window.location.search = '';
    window.location.reload();
  };

  // ================= render =================
  if (!inRoom && selected === null) {
    return (
      <>
        {session && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-[#92a9e1] text-black">
            <div className="max-w-xl mx-auto px-4 py-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold truncate">
                Rejoin {session.room} as {session.name}
                {session.isHost ? ' (host)' : ''}?
              </span>
              <span className="flex gap-2 shrink-0">
                <button
                  onClick={() => void join(session.isHost, session.room, session.name)}
                  className="text-sm font-bold underline"
                >
                  Rejoin
                </button>
                <button
                  onClick={() => {
                    localStorage.removeItem('bg-session');
                    setSession(null);
                  }}
                  className="text-sm flex items-center"
                  aria-label="Dismiss"
                >
                  <X size={16} />
                </button>
              </span>
            </div>
          </div>
        )}
        <Landing onPick={setSelected} />
      </>
    );
  }

  if (!inRoom) {
    const isSH = selected === 'sh';
    return (
      <>
        <div data-game={isSH ? 'secret-hitler' : 'werewolf'} className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white/5 cut p-6 space-y-4 border border-white/10">
          <div className="flex items-center justify-between">
            <HomeLogo onHome={() => setSelected(null)} />
            <button onClick={() => setSelected(null)} className="text-xs text-white/60 underline">
              All games
            </button>
          </div>
          {isSH ? (
            <h1 className="font-display text-4xl flex items-center gap-2"><Gavel size={30} /> Secret Hitler</h1>
          ) : (
            <h1 className="font-display text-4xl flex items-center gap-2"><Moon size={30} /> Werewolf</h1>
          )}
          {isSH ? (
            <p className="text-sm text-white/70">
              Secret Hitler over the internet with a room code. No server, no
              sign-up. One Host, everyone joins.
            </p>
          ) : (
            <p className="text-sm text-white/70">
              Werewolf over the internet with a room code. No server, no
              sign-up. One Host, everyone joins.
            </p>
          )}
          <label className="block text-xs uppercase text-white/60">Your name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Atharva"
            className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 outline-none"
          />
          <button
            onClick={() => void join(true, makeRoomCode(), name)}
            className="btn-accent w-full"
          >
            Create a room
          </button>
          <p className="text-xs text-white/50 text-center -mt-2">
            A room code is generated for you.
          </p>
          <div className="border-t border-white/10 pt-2">
            <p className="text-xs text-white/40 text-center">or</p>
          </div>
          <label className="block text-xs uppercase text-white/60">Room code</label>
          <input
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="WOLF-XXXX"
            className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 outline-none font-mono"
          />
          <button
            onClick={() => roomCode.trim() && void join(false, roomCode, name)}
            disabled={!roomCode.trim()}
            className="w-full rounded bg-white text-black font-semibold py-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Join
          </button>
          <p className="text-xs text-white/50">
            Tip: Host taps Create, shares the QR/code. Works on Android + iOS
            browsers together.{' '}
            <button onClick={() => setShowHelp(true)} className="underline">
              How to play
            </button>
            {' · '}
            <button onClick={() => setShowDiag(true)} className="underline">
              Diagnostics
            </button>
          </p>
          {isSH ? <SHFinePrint /> : <WerewolfFinePrint />}
        </div>
      </div>
      {showHelp && <HowToOverlay onClose={() => setShowHelp(false)} />}
      {showDiag && <DiagnosticsOverlay onClose={() => setShowDiag(false)} />}
      </>
    );
  }

  const phase = pub?.phase ?? 'lobby';
  const shActive = pub?.game === 'secret-hitler';

  return (
    <div data-game="werewolf" className="min-h-screen p-3 lg:p-6 max-w-6xl mx-auto space-y-3">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HomeLogo
            size={26}
            onHome={() => {
              if (window.confirm('Leave game and go home?')) leaveRoom();
            }}
          />
          <div>
            <div className="font-mono text-lg font-bold">{roomCode}</div>
            <div className="text-xs text-white/60">
              {isHost ? 'You are HOST' : `You are ${name}`} · {pub?.players.length ?? 0} players
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              const next = !sound;
              setSound(next);
              localStorage.setItem('bg-sound', next ? '1' : '0');
              if (!next) cancelSpeech();
            }}
            aria-label="Toggle narration"
            className="text-white/70 border border-white/15 rounded px-2 py-1"
          >
            {sound ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button
            onClick={() => setShowHelp(true)}
            aria-label="How to play"
            className="text-white/70 border border-white/15 rounded px-2 py-1"
          >
            <Info size={14} />
          </button>
          <button
            onClick={() => setShowDiag(true)}
            aria-label="Diagnostics"
            className="text-white/70 border border-white/15 rounded px-2 py-1"
          >
            <Radio size={14} />
          </button>
          <button
            onClick={leaveRoom}
            className="text-xs border border-white/15 rounded px-2 py-1 text-white/70"
          >
            Leave
          </button>
        </div>
      </header>

      {shActive && pub && handle ? (
        <SecretHitler
          handle={handle}
          roomCode={roomCode}
          name={name}
          isHost={isHost}
          initialRoster={pub.players}
          onExit={exitSH}
        />
      ) : (
        <>
          {phase === 'lobby' && (
        <div className="panel cut space-y-3 lg:grid lg:grid-cols-2 lg:gap-6 max-w-4xl">
          <div className="flex gap-3 items-center">
            <div className="bg-white p-2 rounded">
              <QRCodeSVG value={joinUrl(roomCode)} size={110} />
            </div>
            <div className="text-sm text-white/75">
              <div className="font-semibold text-white">Scan to join</div>
              <div className="font-mono break-all">{joinUrl(roomCode)}</div>
              {window.location.hostname === 'localhost' && (
                <div className="mt-1 text-amber-200/90">
                  Dev mode: this QR points at localhost, so phones can't use
                  it — open this site via the laptop's network address and
                  type the code {roomCode} manually.
                </div>
              )}
              <div className="mt-1">
                {(pub?.game ?? 'werewolf') === 'secret-hitler'
                  ? 'Secret Hitler needs 5-10 players.'
                  : '5+ for a full hunt · fewer starts a demo.'}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => copyField('link', joinUrl(roomCode))}
                  className="rounded border border-white/20 px-2 py-1 text-xs flex items-center gap-1"
                >
                  {copiedField === 'link' ? (
                    <Check size={12} className="text-emerald-300" />
                  ) : (
                    <Copy size={12} />
                  )}
                  {copiedField === 'link' ? 'Copied' : 'Copy link'}
                </button>
                <button
                  onClick={() => copyField('code', roomCode)}
                  className="rounded border border-white/20 px-2 py-1 text-xs flex items-center gap-1"
                >
                  {copiedField === 'code' ? (
                    <Check size={12} className="text-emerald-300" />
                  ) : (
                    <Copy size={12} />
                  )}
                  {copiedField === 'code' ? 'Copied' : 'Copy code'}
                </button>
              </div>
              {manualCopyText !== null && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-amber-200/90">
                    Clipboard blocked — copy manually below.
                  </p>
                  <input
                    readOnly
                    value={manualCopyText}
                    ref={(el) => el?.select()}
                    className="w-full text-xs font-mono bg-black/40 border border-white/10 rounded p-1.5"
                  />
                </div>
              )}
            </div>
          </div>
          <ul className="divide-y divide-white/10">
            {(pub?.players ?? []).map((p) => (
              <li key={p.peerId} className="py-1.5 text-sm flex items-center gap-2"><User size={14} /> {p.name}</li>
            ))}
          </ul>
          <div className="text-xs text-white/50">
            Signal:{' '}
            {peerCount > 0
              ? `${peerCount} peer${peerCount === 1 ? '' : 's'} connected`
              : isHost
                ? // peerCount only counts OTHER peers, so a host alone in a
                  // fresh lobby is legitimately at 0 — that is not a hang.
                  'ready — waiting for players to join'
                : 'connecting to host…'}{' '}
            · {roomCode}
          </div>
          {!isHost && hostLost && (
            <div className="text-sm text-amber-300/90 space-y-1">
              <p>Connection to the host was lost — retrying…</p>
            </div>
          )}
          {!isHost && (pub?.players.length ?? 0) === 0 && (
            <div className="text-sm text-amber-200/90 space-y-2">
              <p>Looking for the host… if this sticks: check the code matches, both devices need internet, then retry.</p>
              <button
                onClick={() =>
                  sendersRef.current?.sendJoin({
                    name: localStorage.getItem('bg-name') ?? 'Player',
                    client: clientId,
                  })
                }
                className="rounded-lg border border-white/20 px-3 py-1.5 text-sm"
              >
                Retry join
              </button>
            </div>
          )}
          {isHost ? (
            <div className="lg:col-span-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => pickGame('werewolf')}
                  className={`rounded px-2 py-2 text-sm font-bold border ${
                    (pub?.game ?? 'werewolf') === 'werewolf'
                      ? 'bg-[#92a9e1] text-black border-transparent'
                      : 'bg-black/30 border-white/15 text-white/70'
                  }`}
                >
                  Werewolf
                </button>
                <button
                  onClick={() => pickGame('secret-hitler')}
                  className={`rounded px-2 py-2 text-sm font-bold border ${
                    pub?.game === 'secret-hitler'
                      ? 'bg-[#fe8254] text-black border-transparent'
                      : 'bg-black/30 border-white/15 text-white/70'
                  }`}
                >
                  Secret Hitler
                </button>
              </div>
              {pub?.game === 'secret-hitler' ? (
                <button onClick={startSH} className="btn-accent">
                  Start Secret Hitler ({pub?.players.length ?? 0})
                </button>
              ) : (
                <button onClick={hostStart} className="btn-accent">
                  Start game ({pub?.players.length ?? 0})
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-white/60 lg:col-span-2">
              Waiting for host to start…
              {pub?.game === 'secret-hitler'
                ? ' Secret Hitler table opening.'
                : ''}
            </p>
          )}
        </div>
      )}

      {phase !== 'lobby' && pub && (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5 lg:items-start">
          <div key={phase} className="phase-enter space-y-3 lg:space-y-4">
          <div className="bg-white/5 border border-white/10 cut p-4">
            <div className="text-xs uppercase text-white/50">Your role</div>
            <div className="font-display text-3xl flex items-center gap-2">
              {myRole ? (
                <>
                  {(() => {
                    const { label, Icon } = ROLE_META[myRole];
                    return (
                      <>
                        <Icon size={26} /> {label}
                      </>
                    );
                  })()}
                </>
              ) : (
                '…waiting for host…'
              )}
            </div>
            {seerSeen && <div className="text-xs text-violet-300 mt-1 flex items-center gap-1"><Eye size={12} /> {seerSeen}</div>}
            {myRole && (
              <p className="text-xs text-white/60 mt-1">{ROLE_META[myRole].blurb}</p>
            )}
            {!alive && <div className="text-sm text-white/60 mt-1">You are dead — watch only.</div>}
          </div>

          {phase === 'role' && (
            <div className="bg-white/5 border border-white/10 cut p-4 space-y-2">
              <p className="text-sm text-white/70">Memorize your role, then mark ready. The host starts the first night.</p>
              {(() => {
                const aliveIds = pub.players.filter((p) => p.alive);
                const readyCount =
                  (pub.ready?.length ?? 0) + (isHost ? 1 : 0);
                const amIReady =
                  isHost || (pub.ready ?? []).includes(clientId);
                return (
                  <>
                    <div className="text-xs text-white/60">
                      {readyCount}/{aliveIds.length} ready
                    </div>
                    {!isHost && alive && !amIReady && (
                      <button
                        onClick={() =>
                          sendGuestAction({
                            kind: 'ready',
                            targetId: null,
                            fromName: name,
                          })
                        }
                        className="btn-accent"
                      >
                        I'm ready
                      </button>
                    )}
                    {!isHost && alive && amIReady && (
                      <div className="text-sm text-white/60 flex items-center gap-1">
                        <Check size={14} /> Ready — waiting for the host…
                      </div>
                    )}
                    {isHost && (
                      <button onClick={hostToNight} className="w-full rounded bg-white text-black font-bold py-2">Start Night 1</button>
                    )}
                  </>
                );
              })()}
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
            <div className="bg-white/5 border border-white/10 cut p-4 text-center space-y-2">
              <div className="font-display text-3xl flex items-center justify-center gap-2"><Trophy size={28} /> {pub.winner} win!</div>
              {isHost && (
                <button onClick={hostRestart} className="btn-accent">Back to lobby</button>
              )}
            </div>
          )}

          {isHost && phase === 'night' && (
            <div className="panel cut space-y-2">
              <div className="text-xs uppercase text-white/50">Night desk — picks landed</div>
              {disconnectedAlive(pub.players).length > 0 && (
                <p className="text-xs text-amber-300/90">
                  Offline: {disconnectedAlive(pub.players).map((p) => p.name).join(', ')} — their input may not arrive.
                </p>
              )}
              {(() => {
                const vals = Object.values(rolesRef.current);
                const rows: { key: 'wolf' | 'save' | 'see'; label: string }[] = [];
                if (vals.includes('werewolf')) rows.push({ key: 'wolf', label: 'Wolves decided' });
                if (vals.includes('doctor')) rows.push({ key: 'save', label: 'Doctor saved' });
                if (vals.includes('seer')) rows.push({ key: 'see', label: 'Seer peeked' });
                const flags = pub.night ?? { wolf: false, save: false, see: false };
                return (
                  <ul className="text-sm space-y-1">
                    {rows.map((r) => (
                      <li key={r.key} className="flex items-center gap-2 text-white/80">
                        {flags[r.key] ? (
                          <Check size={14} className="text-[#92a9e1]" />
                        ) : (
                          <span className="inline-block h-3.5 w-3.5 border border-white/30" />
                        )}
                        {r.label}
                      </li>
                    ))}
                  </ul>
                );
              })()}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    const vals = Object.values(rolesRef.current);
                    void narrateNight(pub.dayCount, {
                      wolves: vals.includes('werewolf'),
                      seer: vals.includes('seer'),
                      doctor: vals.includes('doctor'),
                    });
                  }}
                  className="rounded border border-white/20 py-2 text-sm font-semibold"
                >
                  Narrate night
                </button>
                <button onClick={hostResolveNight} className="rounded bg-amber-300 text-black font-bold py-2 text-sm">Resolve → Day</button>
              </div>
            </div>
          )}
          {isHost && phase === 'day' && (
            <button onClick={hostToVote} className="w-full rounded bg-white text-black font-bold py-2.5">Go to vote</button>
          )}
          {isHost && phase === 'vote' && (
            <div className="space-y-2">
              {disconnectedAlive(pub.players).length > 0 && (
                <p className="text-xs text-amber-300/90">
                  Offline: {disconnectedAlive(pub.players).map((p) => p.name).join(', ')} — their input may not arrive.
                </p>
              )}
              <button onClick={hostResolveVote} className="w-full rounded bg-amber-300 text-black font-bold py-2.5">Resolve vote → Night</button>
            </div>
          )}
          </div>
          <div className="space-y-3 lg:space-y-4 lg:sticky lg:top-4 mt-3 lg:mt-0">

          <div className="bg-white/5 border border-white/10 cut p-3">
            <div className="text-xs uppercase text-white/50 mb-1">Players</div>
            <ul className="text-sm space-y-1">
              {pub.players.map((p) => {
                const offline = p.alive && !p.online;
                return (
                  <li
                    key={p.peerId}
                    className={
                      !p.alive
                        ? 'line-through text-white/40 flex items-center gap-2'
                        : offline
                          ? 'text-amber-300/80 flex items-center gap-2'
                          : 'flex items-center gap-2'
                    }
                  >
                    {!p.alive ? <Skull size={14} /> : <User size={14} />} {p.name}
                    {offline && <span className="text-xs">reconnecting…</span>}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="bg-black/30 border border-white/10 cut p-3">
            <div className="text-xs uppercase text-white/50 mb-1">Game log · Day {pub.dayCount}</div>
            <ul className="text-xs space-y-1 text-white/75 max-h-40 overflow-auto">
              {[...pub.log].reverse().map((l, i) => <li key={i}>• {l}</li>)}
            </ul>
          </div>
          <RoomFinePrint game="werewolf" />
          </div>
        </div>
      )}
        </>
      )}
      {showHelp && <HowToOverlay onClose={() => setShowHelp(false)} />}
      {showDiag && <DiagnosticsOverlay onClose={() => setShowDiag(false)} />}
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
    <div className="bg-white/5 border border-white/10 cut p-4 space-y-2">
      <div className="font-semibold flex items-center gap-2">
        <Moon size={16} className="moon-pulse" /> Night — {myRole === 'werewolf' ? 'pick a kill' : myRole === 'seer' ? 'pick to inspect' : myRole === 'doctor' ? 'pick to save' : 'sleep… villagers wait'}
      </div>
      {myRole !== 'villager' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {targets.map((p) => (
              <button
                key={p.peerId}
                onClick={() => {
                  try {
                    navigator.vibrate?.(15);
                  } catch {
                    /* no haptics */
                  }
                  props.setPicked(p.peerId);
                  props.onAct(myRole === 'werewolf' ? 'wolf' : myRole === 'seer' ? 'see' : 'save', p.peerId);
                }}
                className={`rounded px-2 py-1.5 text-sm border ${props.picked === p.peerId ? 'bg-[#92a9e1] text-black' : 'bg-black/30 border-white/10'}`}
              >
                {p.name}
              </button>
            ))}
          </div>
          {props.picked ? (
            <p className="text-xs text-[#92a9e1] flex items-center gap-1">
              <Check size={12} /> Locked on{' '}
              {targets.find((t) => t.peerId === props.picked)?.name} — tap
              another to change before the host resolves.
            </p>
          ) : (
            <p className="text-xs text-white/50">Tap to lock your pick.</p>
          )}
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
    <div className="bg-white/5 border border-white/10 cut p-4 space-y-2">
      <div className="font-semibold flex items-center gap-2">{props.phase === 'day' ? <><Sun size={16} /> Day — discuss, then host opens vote</> : <><Vote size={16} /> Vote — tap to exile</>}</div>
      {props.phase === 'day' && <div className="daybreak" />}
      <div className="grid grid-cols-2 gap-2">
        {props.players.filter((p) => p.alive).map((p) => (
          <button
            key={p.peerId}
            disabled={!props.alive || props.phase !== 'vote'}
            onClick={() => {
              try {
                navigator.vibrate?.(15);
              } catch {
                /* no haptics */
              }
              props.onVote(p.peerId);
            }}
            className={`rounded px-2 py-1.5 text-sm border disabled:opacity-50 ${props.picked === p.peerId ? 'bg-red-400 text-black' : 'bg-black/30 border-white/10'}`}
          >
            {p.name} {counts.get(p.peerId) ? `(${counts.get(p.peerId)})` : ''}
          </button>
        ))}
      </div>
      {props.phase === 'vote' && props.picked && (
        <p className="text-xs text-red-300 flex items-center gap-1">
          <Check size={12} /> Voting{' '}
          {props.players.find((p) => p.peerId === props.picked)?.name} — tap
          another to switch before the host resolves.
        </p>
      )}
    </div>
  );
}
