import { describe, expect, it } from 'vitest';
import {
  executeAction,
  executeEventChoice,
  finalizeContributions,
  initDoomedState,
  resolveDoomsday,
  submitContribution,
} from './logic';

describe("We're Doomed logic engine", () => {
  const players = [
    { peerId: 'p1', name: 'Alice' },
    { peerId: 'p2', name: 'Bob' },
    { peerId: 'p3', name: 'Charlie' },
    { peerId: 'p4', name: 'Diana' },
  ];

  it('initializes state correctly for 4 players', () => {
    const s = initDoomedState(players);
    expect(s.order.length).toBe(4);
    expect(s.phase).toBe('action');
    expect(s.rocketResources).toBe(0);
    expect(s.seatsBuilt).toBe(0);
    expect(s.firstPlayerId).toBe('p1');
    expect(s.players['p1'].name).toBe('Alice');
  });

  it('rejects games under 4 players', () => {
    expect(() =>
      initDoomedState([
        { peerId: 'p1', name: 'Alice' },
        { peerId: 'p2', name: 'Bob' },
      ]),
    ).toThrow();
  });

  it('executes produce action and advances turn', () => {
    const s = initDoomedState(players);
    const res = executeAction(s, 'p1', 'produce');
    expect(res.success).toBe(true);
    expect(s.players['p1'].resources).toBeGreaterThanOrEqual(2);
    expect(s.turnIndex).toBe(1);
  });

  it('progresses from actions to contribution to event phase', () => {
    const s = initDoomedState(players);
    // Everyone produces
    executeAction(s, 'p1', 'produce');
    executeAction(s, 'p2', 'produce');
    executeAction(s, 'p3', 'produce');
    executeAction(s, 'p4', 'produce');

    expect(s.phase).toBe('contribute');

    // Pledges
    submitContribution(s, 'p1', 2);
    submitContribution(s, 'p2', 1);

    finalizeContributions(s);
    expect(s.phase).toBe('event');
    expect(s.activeEvent).not.toBeNull();
    expect(s.topContributorId).toBe('p1');
    expect(s.players['p1'].influence).toBeGreaterThanOrEqual(1);
    expect(s.rocketResources).toBeGreaterThanOrEqual(0);
  });

  it('calculates seats built and survivor boarding by influence', () => {
    const s = initDoomedState(players);
    s.players['p1'].influence = 5;
    s.players['p2'].influence = 2;
    s.players['p3'].influence = 1;
    s.players['p4'].influence = 0;

    // Build 2 seats (20 resources)
    s.rocketResources = 25;
    resolveDoomsday(s);

    expect(s.phase).toBe('ended');
    expect(s.seatsBuilt).toBe(2);
    expect(s.survivors).toEqual(['p1', 'p2']);
    expect(s.casualties).toContain('p3');
    expect(s.casualties).toContain('p4');
  });

  it('handles interactive martyr sacrifice choice correctly', () => {
    const s = initDoomedState(players);
    s.phase = 'event';
    s.activeEvent = {
      id: 'martyrs_courage',
      title: "Martyr's Sacrifice",
      type: 'public',
      flavor: 'Sacrifice',
      description: 'Donate all resources for +4 influence',
    };
    s.players['p1'].resources = 6;
    s.players['p1'].influence = 2;

    executeEventChoice(s, 'p1', true);

    expect(s.players['p1'].resources).toBe(0);
    expect(s.players['p1'].influence).toBe(6);
    expect(s.rocketResources).toBe(6);
    expect(s.phase).toBe('action');
  });
});
