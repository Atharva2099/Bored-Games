// Pure "We're Doomed!" rules engine.
// Game design by Breaking Games / Mike Hinson.
// 4-10 players. 15 minute countdown timer.
// Action Phase -> Live Bidding (with individual player confirmations) -> Random Event Draw (Public or Clandestine) -> repeat.

export type Civilization =
  | 'technocracy'
  | 'theocracy'
  | 'military_junta'
  | 'plutocracy'
  | 'bureaucracy'
  | 'cyberocracy'
  | 'kleptocracy'
  | 'aristocracy'
  | 'corporatocracy'
  | 'commune';

export interface CivDef {
  id: Civilization;
  name: string;
  motto: string;
  improvedAction: StandardAction;
  description: string;
}

export const CIVILIZATIONS: Record<Civilization, CivDef> = {
  technocracy: {
    id: 'technocracy',
    name: 'Technocracy',
    motto: 'Logic Over Emotion',
    improvedAction: 'produce',
    description: 'Produce: Gain 3 Resources (instead of 2)',
  },
  theocracy: {
    id: 'theocracy',
    name: 'Theocracy',
    motto: 'Faith in the Heavens',
    improvedAction: 'indoctrinate',
    description: 'Indoctrinate: Gain 2 Influence (instead of 1)',
  },
  plutocracy: {
    id: 'plutocracy',
    name: 'Plutocracy',
    motto: 'Everything Has a Price',
    improvedAction: 'propagandize',
    description: 'Propagandize: Spend 1 Resource to steal 2 Influence from another player',
  },
  military_junta: {
    id: 'military_junta',
    name: 'Military Junta',
    motto: 'Order Through Force',
    improvedAction: 'invade',
    description: 'Invade: Spend 1 Influence to steal 3 Resources from another player',
  },
  cyberocracy: {
    id: 'cyberocracy',
    name: 'Cyberocracy',
    motto: 'Automated Destiny',
    improvedAction: 'nuke',
    description: 'Nuke: Spend 6 Resources (instead of 8) to eliminate a rival leader',
  },
  bureaucracy: {
    id: 'bureaucracy',
    name: 'Bureaucracy',
    motto: 'Forms and Requisitions',
    improvedAction: 'produce',
    description: 'Produce: Gain 2 Resources and 1 Influence',
  },
  kleptocracy: {
    id: 'kleptocracy',
    name: 'Kleptocracy',
    motto: 'What Is Yours Is Mine',
    improvedAction: 'propagandize',
    description: 'Propagandize: Steal 1 Influence from 2 different players for 1 Resource',
  },
  aristocracy: {
    id: 'aristocracy',
    name: 'Aristocracy',
    motto: 'Born to Rule',
    improvedAction: 'indoctrinate',
    description: 'Indoctrinate: Gain 1 Influence and steal 1 Resource from any player',
  },
  corporatocracy: {
    id: 'corporatocracy',
    name: 'Corporatocracy',
    motto: 'Quarterly Growth Above All',
    improvedAction: 'invade',
    description: 'Invade: Spend 1 Resource (instead of Influence) to steal 2 Resources from a player',
  },
  commune: {
    id: 'commune',
    name: 'Commune',
    motto: 'Shared Survival',
    improvedAction: 'produce',
    description: 'Produce: Gain 2 Resources and give 1 Resource to an ally',
  },
};

export type StandardAction = 'produce' | 'indoctrinate' | 'propagandize' | 'invade' | 'nuke';

export interface EventCard {
  id: string;
  title: string;
  type: 'public' | 'clandestine';
  flavor: string;
  description: string;
  interactiveChoice?: {
    prompt: string;
    actionLabel: string;
    cancelLabel?: string;
  };
}

export const EVENT_DECK: EventCard[] = [
  // Public Events (read aloud to everyone)
  {
    id: 'solar_flare',
    title: 'Solar Flare',
    type: 'public',
    flavor: 'Electronics sizzle as cosmic radiation hits the orbital station.',
    description: 'All players lose 1 Resource. The Escape Rocket loses 2 Resources.',
  },
  {
    id: 'rally_cry',
    title: 'Planetary Rally',
    type: 'public',
    flavor: 'Millions donate their scraps in a desperate bid to live.',
    description: 'Every player gains 1 Resource. Rocket gains 3 Resources.',
  },
  {
    id: 'resource_crisis',
    title: 'Supply Chain Collapse',
    type: 'public',
    flavor: 'Refineries across three continents simultaneously implode.',
    description: 'The wealthiest leader must immediately sacrifice half their stockpile to the rocket.',
  },
  {
    id: 'media_frenzy',
    title: 'Broadcast Leak',
    type: 'public',
    flavor: 'Secret blueprints for the rocket have leaked to the general public.',
    description: 'The First Player loses 2 Influence. Lowest Influence leader gains 2 Influence.',
  },
  {
    id: 'emergency_aid',
    title: 'International Relief Pact',
    type: 'public',
    flavor: 'Emergency stockpiles are unlocked by planetary decree.',
    description: 'All players with 0 or 1 Resource gain 2 Resources.',
  },
  {
    id: 'worker_strike',
    title: 'Launchpad Strike',
    type: 'public',
    flavor: 'The engineers realize only elites are boarding.',
    description: 'Rocket construction is delayed. 4 Resources are deducted from the Rocket.',
  },
  {
    id: 'sabotage',
    title: 'Fuel Tank Sabotage',
    type: 'public',
    flavor: 'Contaminated fuel floods the primary booster array.',
    description: 'Rocket loses 3 Resources immediately!',
  },
  {
    id: 'martyrs_courage',
    title: "Martyr's Sacrifice",
    type: 'public',
    flavor: 'A selfless planetary appeal asks leaders to surrender pride for power.',
    description: 'Top Contributor may choose to donate all their personal resources to the rocket to gain +4 Influence!',
    interactiveChoice: {
      prompt: 'Donate all your personal Resources to the Rocket in exchange for +4 Influence?',
      actionLabel: 'Accept Martyr Sacrifice (+4 Inf)',
      cancelLabel: 'Keep Resources',
    },
  },

  // Clandestine Events (drawn randomly from the deck like cards in the box)
  {
    id: 'bribe_fund',
    title: 'Black Budget Vault',
    type: 'clandestine',
    flavor: 'A Swiss vault opened under emergency protocol.',
    description: 'Clandestine discovery: Top Contributor unlocks +3 Resources directly to their private stash.',
  },
  {
    id: 'assassination',
    title: 'Targeted Drone Strike',
    type: 'clandestine',
    flavor: 'An untraceable munition neutralizes a political adversary.',
    description: 'Classified strike: Top Contributor orders drone hit on highest rival, stripping them of 2 Influence.',
  },
  {
    id: 'insider_schematics',
    title: 'Rocket Blueprints',
    type: 'clandestine',
    flavor: 'You smuggled confidential schematics for an extra escape module.',
    description: 'Classified asset: Top Contributor gains +2 Influence directly to secure their seat.',
  },
  {
    id: 'conspiracy',
    title: 'Shadow Council Compact',
    type: 'clandestine',
    flavor: 'A private summit guarantees launch codes to your personal transport shuttle.',
    description: 'Covert operation: Top Contributor siphons 2 Resources from the second-highest contributor.',
  },
];

export interface PlayerState {
  peerId: string;
  name: string;
  civ: Civilization;
  resources: number;
  influence: number;
  eliminated: boolean;
  isBot?: boolean;
}

export type DoomedPhase =
  | 'action'
  | 'contribute'
  | 'event'
  | 'ended';

export interface DoomedState {
  phase: DoomedPhase;
  players: Record<string, PlayerState>;
  order: string[]; // seating order
  turnIndex: number; // active player index in action phase
  firstPlayerId: string; // leader with first-player token
  rocketResources: number; // resources invested in rocket
  seatsBuilt: number; // calculated: floor(rocketResources / 10)
  contributions: Record<string, number>; // live round contributions / bids
  confirmedBids: Record<string, boolean>; // player confirmation of final bid
  highestBid: number;
  topContributorId: string | null;
  activeEvent: EventCard | null;
  roundNumber: number;
  timeRemainingSec: number;
  timerStartedAt: number | null; // epoch ms
  totalDurationSec: number; // default 900 (15 min)
  log: string[];
  survivors: string[]; // peer IDs who made it to the rocket
  casualties: string[]; // peer IDs left behind
}

export const RESOURCES_PER_SEAT = 10;
export const DEFAULT_DURATION_SEC = 900; // 15 mins

export function assignCivs(playerIds: string[]): Record<string, Civilization> {
  const pool = Object.keys(CIVILIZATIONS) as Civilization[];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const out: Record<string, Civilization> = {};
  playerIds.forEach((id, idx) => {
    out[id] = shuffled[idx % shuffled.length];
  });
  return out;
}

export function initDoomedState(
  players: { peerId: string; name: string; isBot?: boolean }[],
  durationSec = DEFAULT_DURATION_SEC,
): DoomedState {
  if (players.length < 4 || players.length > 10) {
    throw new Error("We're Doomed requires 4 to 10 players");
  }

  const civs = assignCivs(players.map((p) => p.peerId));
  const playerStateMap: Record<string, PlayerState> = {};
  const order = players.map((p) => p.peerId);

  players.forEach((p) => {
    playerStateMap[p.peerId] = {
      peerId: p.peerId,
      name: p.name,
      civ: civs[p.peerId],
      resources: 0,
      influence: 0,
      eliminated: false,
      isBot: p.isBot,
    };
  });

  return {
    phase: 'action',
    players: playerStateMap,
    order,
    turnIndex: 0,
    firstPlayerId: order[0],
    rocketResources: 0,
    seatsBuilt: 0,
    contributions: {},
    confirmedBids: {},
    highestBid: 0,
    topContributorId: null,
    activeEvent: null,
    roundNumber: 1,
    timeRemainingSec: durationSec,
    timerStartedAt: Date.now(),
    totalDurationSec: durationSec,
    log: [
      `The world is ending! 15 minutes remain to build the escape rocket.`,
      `${playerStateMap[order[0]].name} holds the First Player coin.`,
    ],
    survivors: [],
    casualties: [],
  };
}

export interface ActionResult {
  success: boolean;
  message: string;
}

export function executeAction(
  state: DoomedState,
  actorId: string,
  action: StandardAction,
  targetId?: string,
): ActionResult {
  if (state.phase !== 'action') {
    return { success: false, message: 'Not currently in action phase.' };
  }
  const currentActorId = state.order[state.turnIndex];
  if (currentActorId !== actorId) {
    return { success: false, message: 'Not your turn to act.' };
  }
  const actor = state.players[actorId];
  if (!actor || actor.eliminated) {
    return { success: false, message: 'Actor is eliminated or invalid.' };
  }

  const civ = CIVILIZATIONS[actor.civ];

  if (action === 'produce') {
    if (actor.civ === 'technocracy') {
      actor.resources += 3;
      state.log.push(`${actor.name} (${civ.name}) produces 3 Resources!`);
    } else if (actor.civ === 'bureaucracy') {
      actor.resources += 2;
      actor.influence += 1;
      state.log.push(`${actor.name} (${civ.name}) produces 2 Resources and 1 Influence!`);
    } else if (actor.civ === 'commune') {
      actor.resources += 2;
      const allyId = state.order.find((id) => id !== actorId && !state.players[id].eliminated);
      if (allyId) {
        state.players[allyId].resources += 1;
        state.log.push(`${actor.name} produces 2 Resources and shares 1 with ${state.players[allyId].name}!`);
      } else {
        actor.resources += 1;
        state.log.push(`${actor.name} produces 3 Resources.`);
      }
    } else {
      actor.resources += 2;
      state.log.push(`${actor.name} produces 2 Resources.`);
    }
  } else if (action === 'indoctrinate') {
    if (actor.civ === 'theocracy') {
      actor.influence += 2;
      state.log.push(`${actor.name} (${civ.name}) indoctrinates and gains 2 Influence!`);
    } else if (actor.civ === 'aristocracy') {
      actor.influence += 1;
      if (targetId && state.players[targetId] && state.players[targetId].resources > 0) {
        state.players[targetId].resources -= 1;
        actor.resources += 1;
        state.log.push(`${actor.name} indoctrinates for 1 Influence and seizes 1 Resource from ${state.players[targetId].name}!`);
      } else {
        state.log.push(`${actor.name} indoctrinates for 1 Influence.`);
      }
    } else {
      actor.influence += 1;
      state.log.push(`${actor.name} indoctrinates the masses and gains 1 Influence.`);
    }
  } else if (action === 'propagandize') {
    if (actor.resources < 1) {
      return { success: false, message: 'Need at least 1 Resource to propagandize.' };
    }
    if (!targetId || !state.players[targetId] || targetId === actorId || state.players[targetId].eliminated) {
      return { success: false, message: 'Invalid target player.' };
    }
    const target = state.players[targetId];
    actor.resources -= 1;
    const stolen = Math.min(actor.civ === 'plutocracy' ? 2 : 1, target.influence);
    target.influence -= stolen;
    actor.influence += stolen;
    state.log.push(`${actor.name} propagandizes against ${target.name}, stealing ${stolen} Influence!`);
  } else if (action === 'invade') {
    if (actor.civ === 'corporatocracy') {
      if (actor.resources < 1) {
        return { success: false, message: 'Need 1 Resource to invade as Corporatocracy.' };
      }
      if (!targetId || !state.players[targetId] || targetId === actorId || state.players[targetId].eliminated) {
        return { success: false, message: 'Invalid target player.' };
      }
      actor.resources -= 1;
      const target = state.players[targetId];
      const stolen = Math.min(2, target.resources);
      target.resources -= stolen;
      actor.resources += stolen;
      state.log.push(`${actor.name} launches a hostile corporate raid on ${target.name}, seizing ${stolen} Resources!`);
    } else {
      if (actor.influence < 1) {
        return { success: false, message: 'Need at least 1 Influence to invade.' };
      }
      if (!targetId || !state.players[targetId] || targetId === actorId || state.players[targetId].eliminated) {
        return { success: false, message: 'Invalid target player.' };
      }
      const target = state.players[targetId];
      actor.influence -= 1;
      const maxSteal = actor.civ === 'military_junta' ? 3 : 2;
      const stolen = Math.min(maxSteal, target.resources);
      target.resources -= stolen;
      actor.resources += stolen;
      state.log.push(`${actor.name} invades ${target.name}'s stockpiles, looting ${stolen} Resources!`);
    }
  } else if (action === 'nuke') {
    const cost = actor.civ === 'cyberocracy' ? 6 : 8;
    if (actor.resources < cost) {
      return { success: false, message: `Need ${cost} Resources to launch a nuclear strike!` };
    }
    if (!targetId || !state.players[targetId] || targetId === actorId || state.players[targetId].eliminated) {
      return { success: false, message: 'Invalid target player to nuke.' };
    }
    actor.resources -= cost;
    const target = state.players[targetId];
    target.eliminated = true;
    state.log.push(`⚠️ ATOMIC LAUNCH! ${actor.name} nukes ${target.name}! ${target.name} has been eliminated!`);
  }

  advanceTurn(state);
  return { success: true, message: 'Action completed.' };
}

export function advanceTurn(state: DoomedState): void {
  let nextIdx = state.turnIndex + 1;

  while (nextIdx < state.order.length && state.players[state.order[nextIdx]].eliminated) {
    nextIdx++;
  }

  if (nextIdx >= state.order.length) {
    state.phase = 'contribute';
    state.contributions = {};
    state.confirmedBids = {};
    state.highestBid = 0;
    state.log.push(`All leaders have acted. Live Bidding begins! Raise bids to claim Top Contributor.`);
  } else {
    state.turnIndex = nextIdx;
  }
}

export function submitContribution(
  state: DoomedState,
  actorId: string,
  amount: number,
  confirmed = false,
): ActionResult {
  if (state.phase !== 'contribute') {
    return { success: false, message: 'Not currently in contribution phase.' };
  }
  const actor = state.players[actorId];
  if (!actor || actor.eliminated) {
    return { success: false, message: 'Actor is eliminated or invalid.' };
  }
  if (amount < 0 || amount > actor.resources) {
    return { success: false, message: `Invalid contribution amount (max ${actor.resources}).` };
  }

  const prev = state.contributions[actorId] ?? 0;
  state.contributions[actorId] = amount;
  state.confirmedBids[actorId] = confirmed;
  
  if (amount > state.highestBid) {
    state.highestBid = amount;
    // When someone raises the high bid, un-confirm others so they have a chance to respond!
    Object.keys(state.confirmedBids).forEach((k) => {
      if (k !== actorId) state.confirmedBids[k] = false;
    });
    state.log.push(`${actor.name} raises high bid to ${amount} Resources!`);
  } else if (amount > prev) {
    state.log.push(`${actor.name} raised bid to ${amount} Resources.`);
  }

  return { success: true, message: `Pledged ${amount} resources.` };
}

export function confirmBid(state: DoomedState, actorId: string): void {
  if (state.phase !== 'contribute') return;
  state.confirmedBids[actorId] = true;
  state.log.push(`${state.players[actorId]?.name} locked their bid.`);

  // If all living leaders confirmed their bids, automatically finalize!
  const alive = Object.values(state.players).filter((p) => !p.eliminated);
  if (alive.every((p) => state.confirmedBids[p.peerId])) {
    finalizeContributions(state);
  }
}

export function finalizeContributions(state: DoomedState): void {
  if (state.phase !== 'contribute') return;

  let topAmount = -1;
  let topContributors: string[] = [];

  for (const [id, amt] of Object.entries(state.contributions)) {
    const actor = state.players[id];
    if (!actor || actor.eliminated) continue;
    const actualAmt = Math.min(amt, actor.resources);
    actor.resources -= actualAmt;
    state.rocketResources += actualAmt;

    if (actualAmt > topAmount) {
      topAmount = actualAmt;
      topContributors = [id];
    } else if (actualAmt === topAmount && actualAmt > 0) {
      topContributors.push(id);
    }
  }

  state.seatsBuilt = Math.floor(state.rocketResources / RESOURCES_PER_SEAT);

  let winnerId = topContributors[0] ?? state.firstPlayerId;
  if (topContributors.length > 1) {
    winnerId = topContributors.sort(
      (a, b) => (state.players[b]?.influence ?? 0) - (state.players[a]?.influence ?? 0),
    )[0];
  }

  if (topAmount > 0) {
    state.players[winnerId].influence += 1;
    state.firstPlayerId = winnerId;
    state.topContributorId = winnerId;
    state.log.push(
      `Top Contributor: ${state.players[winnerId].name} won bidding with ${topAmount} Resources, takes 1 Influence and First Player coin!`,
    );
  } else {
    state.topContributorId = null;
    state.log.push(`No resources contributed this round! The rocket remains stalled.`);
  }

  state.log.push(
    `Rocket Progress: ${state.rocketResources} total resources. ${state.seatsBuilt} escape seat(s) ready.`,
  );

  // Draw event randomly from the deck (contains both Public and Clandestine cards)
  drawRandomEventCard(state);
}

export function drawRandomEventCard(state: DoomedState): void {
  const event = EVENT_DECK[Math.floor(Math.random() * EVENT_DECK.length)];
  state.activeEvent = event;
  state.phase = 'event';
  state.log.push(`EVENT: ${event.title} (${event.type}) - ${event.description}`);

  // Apply automatic event effects
  if (event.id === 'solar_flare') {
    Object.values(state.players).forEach((p) => {
      if (!p.eliminated && p.resources > 0) p.resources -= 1;
    });
    state.rocketResources = Math.max(0, state.rocketResources - 2);
  } else if (event.id === 'rally_cry') {
    Object.values(state.players).forEach((p) => {
      if (!p.eliminated) p.resources += 1;
    });
    state.rocketResources += 3;
  } else if (event.id === 'resource_crisis') {
    const richest = Object.values(state.players)
      .filter((p) => !p.eliminated)
      .sort((a, b) => b.resources - a.resources)[0];
    if (richest && richest.resources > 0) {
      const half = Math.floor(richest.resources / 2);
      richest.resources -= half;
      state.rocketResources += half;
      state.log.push(`${richest.name} donated ${half} Resources due to the crisis.`);
    }
  } else if (event.id === 'emergency_aid') {
    Object.values(state.players).forEach((p) => {
      if (!p.eliminated && p.resources <= 1) p.resources += 2;
    });
  } else if (event.id === 'worker_strike') {
    state.rocketResources = Math.max(0, state.rocketResources - 4);
  } else if (event.id === 'bribe_fund' && state.topContributorId) {
    state.players[state.topContributorId].resources += 3;
    state.log.push(`${state.players[state.topContributorId].name} unlocked +3 Resources from the Black Budget Vault!`);
  } else if (event.id === 'assassination' && state.topContributorId) {
    const rival = Object.values(state.players)
      .filter((p) => !p.eliminated && p.peerId !== state.topContributorId)
      .sort((a, b) => b.influence - a.influence)[0];
    if (rival && rival.influence > 0) {
      const lost = Math.min(2, rival.influence);
      rival.influence -= lost;
      state.log.push(`Targeted Drone Strike: ${rival.name} lost ${lost} Influence!`);
    }
  } else if (event.id === 'insider_schematics' && state.topContributorId) {
    state.players[state.topContributorId].influence += 2;
    state.log.push(`${state.players[state.topContributorId].name} gained +2 Influence from confidential blueprints!`);
  } else if (event.id === 'conspiracy' && state.topContributorId) {
    const sorted = Object.values(state.players)
      .filter((p) => !p.eliminated && p.peerId !== state.topContributorId)
      .sort((a, b) => b.resources - a.resources)[0];
    if (sorted && sorted.resources > 0) {
      const siphoned = Math.min(2, sorted.resources);
      sorted.resources -= siphoned;
      state.players[state.topContributorId].resources += siphoned;
      state.log.push(`${state.players[state.topContributorId].name} siphoned ${siphoned} Resources from ${sorted.name}!`);
    }
  } else if (event.id === 'sabotage') {
    state.rocketResources = Math.max(0, state.rocketResources - 3);
  }

  state.seatsBuilt = Math.floor(state.rocketResources / RESOURCES_PER_SEAT);
}

export function executeEventChoice(state: DoomedState, actorId: string, accepted: boolean): void {
  if (state.phase !== 'event' || !state.activeEvent) return;

  if (state.activeEvent.id === 'martyrs_courage') {
    if (accepted && state.players[actorId] && !state.players[actorId].eliminated) {
      const donated = state.players[actorId].resources;
      state.players[actorId].resources = 0;
      state.rocketResources += donated;
      state.players[actorId].influence += 4;
      state.seatsBuilt = Math.floor(state.rocketResources / RESOURCES_PER_SEAT);
      state.log.push(`${state.players[actorId].name} made the Martyr's Sacrifice! Donated ${donated} Resources to Rocket, gained +4 Influence!`);
    }
  }

  dismissEventAndNextRound(state);
}

export function dismissEventAndNextRound(state: DoomedState): void {
  if (state.phase !== 'event') return;

  state.activeEvent = null;
  state.roundNumber += 1;

  const startIdx = state.order.indexOf(state.firstPlayerId);
  if (startIdx !== -1) {
    state.order = [
      ...state.order.slice(startIdx),
      ...state.order.slice(0, startIdx),
    ];
  }

  state.turnIndex = 0;
  while (state.turnIndex < state.order.length && state.players[state.order[state.turnIndex]].eliminated) {
    state.turnIndex++;
  }

  state.phase = 'action';
  state.log.push(`Round ${state.roundNumber} begins! First action: ${state.players[state.order[state.turnIndex]].name}`);
}

export function resolveDoomsday(state: DoomedState): void {
  state.phase = 'ended';
  state.seatsBuilt = Math.floor(state.rocketResources / RESOURCES_PER_SEAT);

  const activeLeaders = Object.values(state.players).filter((p) => !p.eliminated);
  activeLeaders.sort((a, b) => {
    if (b.influence !== a.influence) return b.influence - a.influence;
    return b.resources - a.resources;
  });

  const survivors = activeLeaders.slice(0, state.seatsBuilt).map((p) => p.peerId);
  const casualties = activeLeaders.slice(state.seatsBuilt).map((p) => p.peerId);
  const dead = Object.values(state.players).filter((p) => p.eliminated).map((p) => p.peerId);

  state.survivors = survivors;
  state.casualties = [...casualties, ...dead];

  if (survivors.length === 0) {
    state.log.push(`DOOMSDAY! No seats were built on the rocket. All leaders perished!`);
  } else {
    const survivorNames = survivors.map((id) => state.players[id].name).join(', ');
    state.log.push(
      `LIFTOFF! The rocket escapes Earth with ${survivors.length} survivor(s): ${survivorNames}! Everyone else is doomed!`,
    );
  }
}
