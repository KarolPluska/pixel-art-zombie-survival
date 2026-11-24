export const TACTICAL = {
  noise: {
    carefulPerSecond: 3,
    walkPerSecond: 9,
    runPerSecond: 26,
    decayPerSecond: 19,
    stepPulseInterval: 0.38,
    melee: 18,
    reload: 6,
    doorBash: 48,
    furniturePerPulse: 24,
    barrel: 100,
    collapse: 90,
    gun: { crowbar: 18, pistol: 72, hatchet: 22, revolver: 84, shotgun: 96, crossbow: 16, machete: 24 },
  },
  arousal: { decayPerSecond: 1.15, max: 100, devicePerSecond: 1.8 },
  waves: {
    rollInterval: 4,
    minInterval: 14,
    firstDeviceRollMin: 8,
    firstDeviceRollMax: 15,
    nextDeviceRollMin: 15,
    nextDeviceRollMax: 25,
    budgetMax: 6,
    budgetRegenPerSecond: 0.045,
    budgetPerZombie: 1.35,
    maxPerWave: 3,
    basePopulation: 9,
    populationPerFiveRooms: 1,
    populationMax: 24,
    spawnMinDistance: 8 * 16,
    spawnMaxDistance: 28 * 16,
    npcSafeDistance: 5 * 16,
  },
  devices: {
    radioRadius: 12 * 16,
    tvRadius: 15 * 16,
    radioStrength: 46,
    tvStrength: 58,
    pulseInterval: 1.8,
    interestSeconds: 3.2,
    closePlayerOverride: 3 * 16,
  },
  barrels: { bulletFuse: 0.35, meleeFuse: 0.9, chainFuse: 0.24, radius: 4.5 * 16, chainRadius: 4 * 16, playerDamage: 58, zombieDamage: 96 },
  ai: { searchSeconds: 6, hideForgetSeconds: 7, grabWindup: 0.46, grabRange: 17, grabDamageInterval: 1.05, grabDamage: 5, grabReleaseProtection: 3.4, pushedDownSeconds: 2.1 },
  npc: { firstDelay: 16, retryDelay: 7, pityDelay: 8, repeatDelayMin: 48, repeatDelayMax: 78, maxPerFloor: 2 },
} as const;

export type NoiseLabel = "CISZA" | "SŁYSZALNIE" | "GŁOŚNO" | "BARDZO GŁOŚNO";
export function noiseLabel(value: number): NoiseLabel {
  if (value < 12) return "CISZA";
  if (value < 42) return "SŁYSZALNIE";
  if (value < 75) return "GŁOŚNO";
  return "BARDZO GŁOŚNO";
}
