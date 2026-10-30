export type ResourceKey = 'oxygen' | 'water' | 'food' | 'power' | 'materials'
export type ModuleId = 'solar' | 'battery' | 'recycler' | 'greenhouse' | 'shielding'
export type ActionId = ModuleId | 'conserve' | 'repair'

export type EventChoice = { id: string; label: string; detail: string; effects: Partial<Record<ResourceKey, number>>; safety: number }
export type MissionEvent = { id: string; title: string; description: string; severity: 'warning' | 'critical'; choices: EventChoice[] }
export type LogEntry = { cycle: number; kind: 'system' | 'action' | 'event'; title: string; detail: string; tone?: 'good' | 'warning' | 'critical' }
export type MissionState = {
  cycle: number; oxygen: number; water: number; food: number; power: number; materials: number
  safety: number; integrity: number; research: number; efficiency: number; status: 'active' | 'success' | 'failed'
  modules: ModuleId[]; queued: { id: ModuleId; readyCycle: number }[]; pendingEvent: MissionEvent | null; log: LogEntry[]
}

export const moduleCatalog: Record<ModuleId, { name: string; description: string; cost: Partial<Record<ResourceKey, number>>; effect: string; delay: number }> = {
  solar: { name: 'Solar array', description: 'Adds dependable daytime generation.', cost: { materials: 22, power: 4 }, effect: '+9 power generated per cycle', delay: 1 },
  battery: { name: 'Battery bank', description: 'Stores surplus power for dark cycles.', cost: { materials: 18, power: 2 }, effect: '+18 power reserve capacity', delay: 1 },
  recycler: { name: 'Water recycler', description: 'Recovers water from crew systems.', cost: { materials: 20, power: 5 }, effect: '+14 water recovered per cycle', delay: 1 },
  greenhouse: { name: 'Greenhouse', description: 'Grows fresh food and supports morale.', cost: { materials: 25, water: 8, power: 6 }, effect: '+8 food per cycle', delay: 2 },
  shielding: { name: 'Habitat shielding', description: 'Improves protection from dust and weather.', cost: { materials: 28 }, effect: '+12 habitat integrity', delay: 2 },
}

const eventDeck: MissionEvent[] = [
  { id: 'leak', title: 'Water loop leak', description: 'A pressure reading is falling in the secondary water loop. The crew can hear a faint hiss behind the service panel.', severity: 'critical', choices: [
    { id: 'repair', label: 'Repair immediately', detail: 'Spend materials to isolate the leak.', effects: { materials: -12, water: 8 }, safety: 5 },
    { id: 'ration', label: 'Ration water', detail: 'Buy time while preserving construction stock.', effects: { water: -8, safety: -2 }, safety: 0 },
  ]},
  { id: 'weather', title: 'Space-weather alert', description: 'A fast solar particle event is expected during the next cycle. Exposed systems need attention.', severity: 'warning', choices: [
    { id: 'shelter', label: 'Shelter the crew', detail: 'Conserve power and protect the habitat.', effects: { power: -5 }, safety: 4 },
    { id: 'continue', label: 'Continue operations', detail: 'Keep the greenhouse running, accept added exposure.', effects: { food: 5 }, safety: -5 },
  ]},
  { id: 'fault', title: 'Battery controller fault', description: 'The charge controller is reporting intermittent faults. Stored energy may be unavailable.', severity: 'warning', choices: [
    { id: 'bypass', label: 'Run a safe bypass', detail: 'Lose some materials and power to stabilize it.', effects: { materials: -8, power: -6 }, safety: 3 },
    { id: 'defer', label: 'Defer maintenance', detail: 'Keep the system online for now.', effects: { power: -10 }, safety: -3 },
  ]},
]

export function createInitialState(): MissionState { return { cycle: 1, oxygen: 86, water: 72, food: 64, power: 48, materials: 76, safety: 92, integrity: 88, research: 0, efficiency: 82, status: 'active', modules: [], queued: [], pendingEvent: null, log: [{ cycle: 1, kind: 'system', title: 'Mission initialized', detail: 'Four crew members are awake and the outpost is nominal.' }] } }

function clamp(n: number, min = 0, max = 100) { return Math.max(min, Math.min(max, Math.round(n))) }
function applyEffects(state: MissionState, effects: Partial<Record<ResourceKey, number>>) { for (const key of Object.keys(effects) as ResourceKey[]) state[key] = clamp(state[key] + (effects[key] ?? 0)) }

export function validateAction(state: MissionState, action: ActionId) {
  if (action in moduleCatalog && (state.modules.includes(action as ModuleId) || state.queued.some(q => q.id === action))) return 'That module is already active or under construction.'
  if (action in moduleCatalog) { const cost = moduleCatalog[action as ModuleId].cost; for (const key of Object.keys(cost) as ResourceKey[]) if (state[key] < (cost[key] ?? 0)) return `Not enough ${key} for this build.` }
  return null
}

export function chooseEvent(state: MissionState, choiceId: string): MissionState {
  if (!state.pendingEvent) return state
  const choice = state.pendingEvent.choices.find(c => c.id === choiceId); if (!choice) return state
  const next = structuredClone(state); applyEffects(next, choice.effects); next.safety = clamp(next.safety + choice.safety); next.research += 6; next.log.push({ cycle: next.cycle, kind: 'event', title: `${next.pendingEvent.title}: ${choice.label}`, detail: choice.detail, tone: choice.safety >= 0 ? 'good' : 'warning' }); next.pendingEvent = null; return next
}

export function advanceCycle(input: MissionState, action: ActionId | null): MissionState {
  const next = structuredClone(input); if (next.status !== 'active' || next.pendingEvent) return next
  if (action) { const error = validateAction(next, action); if (error) { next.log.push({ cycle: next.cycle, kind: 'system', title: 'Action unavailable', detail: error, tone: 'warning' }); return next }
    if (action in moduleCatalog) { const mod = moduleCatalog[action as ModuleId]; for (const key of Object.keys(mod.cost) as ResourceKey[]) next[key] = clamp(next[key] - (mod.cost[key] ?? 0)); next.queued.push({ id: action as ModuleId, readyCycle: next.cycle + mod.delay }); next.log.push({ cycle: next.cycle, kind: 'action', title: `${mod.name} scheduled`, detail: `Construction completes in ${mod.delay} cycle${mod.delay > 1 ? 's' : ''}.` }) }
    if (action === 'conserve') { next.efficiency = clamp(next.efficiency + 5); next.power = clamp(next.power + 8); next.log.push({ cycle: next.cycle, kind: 'action', title: 'Power conservation enabled', detail: 'Non-critical systems are throttled for this cycle.' }) }
    if (action === 'repair') { next.materials = clamp(next.materials - 8); next.integrity = clamp(next.integrity + 8); next.log.push({ cycle: next.cycle, kind: 'action', title: 'Preventive repair complete', detail: 'Habitat integrity improved before the next cycle.' }) }
  }
  next.cycle += 1
  next.queued = next.queued.filter(q => { if (q.readyCycle <= next.cycle) { next.modules.push(q.id); next.log.push({ cycle: next.cycle, kind: 'system', title: `${moduleCatalog[q.id].name} commissioned`, detail: moduleCatalog[q.id].effect, tone: 'good' }); return false } return true })
  const generation = 12 + (next.modules.includes('solar') ? 9 : 0); const demand = 18 + (next.modules.includes('recycler') ? 4 : 0) + (next.modules.includes('greenhouse') ? 5 : 0); const battery = next.modules.includes('battery') ? 18 : 0; const delta = generation - demand; next.power = clamp(next.power + delta, 0, 100 + battery)
  next.oxygen = clamp(next.oxygen - 7); next.water = clamp(next.water - 9 + (next.modules.includes('recycler') ? 14 : 0)); next.food = clamp(next.food - 8 + (next.modules.includes('greenhouse') ? 8 : 0)); next.integrity = clamp(next.integrity + (next.modules.includes('shielding') ? 1 : -1)); next.safety = clamp(next.safety + (next.power < 12 ? -8 : 1) + (next.water < 25 ? -8 : 0)); next.research += 3
  if (next.cycle % 3 === 0) next.pendingEvent = eventDeck[(Math.floor(next.cycle / 3) - 1) % eventDeck.length]
  if (next.water <= 0 || next.oxygen <= 0 || next.food <= 0 || next.safety <= 0 || next.integrity <= 0) { next.status = 'failed'; next.log.push({ cycle: next.cycle, kind: 'system', title: 'Mission ended', detail: 'A critical resource or safety threshold was crossed.', tone: 'critical' }) }
  else if (next.cycle >= 10) { next.status = 'success'; next.log.push({ cycle: next.cycle, kind: 'system', title: 'Mission objective complete', detail: 'The outpost survived the training window.', tone: 'good' }) }
  else next.log.push({ cycle: next.cycle, kind: 'system', title: 'Cycle complete', detail: `Generation ${generation} · demand ${demand} · net power ${delta >= 0 ? '+' : ''}${delta}.` })
  return next
}
