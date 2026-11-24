export const WEAPON_IDS = ["crowbar", "pistol", "hatchet", "revolver", "shotgun", "crossbow"] as const;
export type WeaponId = typeof WEAPON_IDS[number];
export type AmmoKind = "rounds" | "shells" | "bolts";
export type Slots = [WeaponId | null, WeaponId | null, WeaponId | null];

export interface WeaponSpec {
  name: string;
  category: string;
  description: string;
  location: string;
  ammo: AmmoKind | null;
  capacity: number;
  damage: number;
  cooldown: number;
  reach: number;
  reload: number;
  pellets: number;
  noise: number;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  crowbar: { name: "Łom", category: "Broń biała", description: "Stary, niezawodny łom. Cichy w walce, przydatny przy zabarykadowanych drzwiach.", location: "Wyposażenie startowe", ammo: null, capacity: 0, damage: 34, cooldown: 0.46, reach: 22, reload: 0, pellets: 1, noise: 3 },
  pistol: { name: "Pistolet", category: "Broń krótka", description: "Poręczna broń na ciasne korytarze. Osiem strzałów, zanim trzeba będzie przeładować.", location: "Wyposażenie startowe", ammo: "rounds", capacity: 8, damage: 26, cooldown: 0.28, reach: 144, reload: 0.78, pellets: 1, noise: 14 },
  hatchet: { name: "Toporek", category: "Broń biała", description: "Cięższy od łomu. Wolniejszy zamach wynagradza mocniejszym uderzeniem, bez zużywania amunicji.", location: "Piwnica / szafka warsztatowa", ammo: null, capacity: 0, damage: 52, cooldown: 0.7, reach: 24, reload: 0, pellets: 1, noise: 3.5 },
  revolver: { name: "Rewolwer", category: "Broń krótka", description: "Sześć mocnych strzałów. Korzysta z tego samego zapasu nabojów co pistolet.", location: "Parter / biurko dozorcy", ammo: "rounds", capacity: 6, damage: 49, cooldown: 0.49, reach: 170, reload: 1.3, pellets: 1, noise: 16 },
  shotgun: { name: "Strzelba", category: "Broń długa", description: "Dwa ładunki śrutu na bliskie spotkania. Huk niesie się po całym piętrze.", location: "Piętro III / szafa myśliwego", ammo: "shells", capacity: 2, damage: 14, cooldown: 0.64, reach: 76, reload: 1.15, pellets: 6, noise: 19 },
  crossbow: { name: "Kusza", category: "Broń miotająca", description: "Jeden cichy bełt zamiast głośnego strzału. Po każdym trafieniu potrzebuje chwili na przeładowanie.", location: "Piętro V / szafa sportowca", ammo: "bolts", capacity: 1, damage: 72, cooldown: 0.72, reach: 165, reload: 1.4, pellets: 1, noise: 2.5 },
};

export interface InventoryState {
  owned: WeaponId[];
  slots: Slots;
  active: number;
  magazines: Record<WeaponId, number>;
  stock: Record<AmmoKind, number>;
}

export function isWeapon(id: unknown): id is WeaponId {
  return WEAPON_IDS.includes(id as WeaponId);
}

export function starterInventory(preferred?: Slots): InventoryState {
  const slots: Slots = ["crowbar", "pistol", null];
  if (preferred?.length === 3 && preferred.some(Boolean) && preferred.every((v, i) =>
    v === null || ((v === "crowbar" || v === "pistol") && preferred.indexOf(v) === i))) {
    slots.splice(0, 3, ...preferred);
  }
  return { owned: ["crowbar", "pistol"], slots, active: slots.findIndex(Boolean),
    magazines: { crowbar: 0, pistol: 8, hatchet: 0, revolver: 0, shotgun: 0, crossbow: 0 },
    stock: { rounds: 18, shells: 0, bolts: 0 } };
}

export function copyInventory(inv: InventoryState): InventoryState {
  return { ...inv, owned: [...inv.owned], slots: [...inv.slots], stock: { ...inv.stock }, magazines: { ...inv.magazines } };
}

// Slot assignment never removes an item from the backpack. Moving an equipped item swaps slots.
export function assignSlot(inv: InventoryState, slot: number, id: WeaponId | null): InventoryState {
  if (!Number.isInteger(slot) || slot < 0 || slot > 2 || (id && !inv.owned.includes(id))) return inv;
  if (!id && inv.slots.filter(Boolean).length < 2) return inv;
  const next = copyInventory(inv);
  const held = inv.slots[inv.active];
  const old = id ? inv.slots.indexOf(id) : -1;
  if (old >= 0) next.slots[old] = next.slots[slot];
  next.slots[slot] = id;
  const found = next.slots.indexOf(held);
  next.active = held && found >= 0 ? found : next.slots[slot] ? slot : next.slots.findIndex(Boolean);
  return next;
}

export function discover(inv: InventoryState, id: WeaponId) {
  if (inv.owned.includes(id)) return false;
  inv.owned.push(id);
  const w = WEAPONS[id];
  inv.magazines[id] = w.capacity;
  if (w.ammo) inv.stock[w.ammo] += w.ammo === "bolts" ? 6 : w.capacity * 2;
  return true;
}

export const DISCOVERIES: Partial<Record<number, WeaponId>> = { 0: "hatchet", 1: "revolver", 4: "shotgun", 6: "crossbow" };