import * as vscode from 'vscode';

export type GrassStage = 'dead' | 'sprout' | 'short' | 'normal' | 'tall' | 'jungle';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export function getCurrentSeason(overrideMonth?: number): Season {
  const m = overrideMonth ?? new Date().getMonth(); // 0-11
  if (m >= 2 && m <= 4)  return 'spring';
  if (m >= 5 && m <= 7)  return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

interface StateData {
  lastWatered:   number;
  lastMowed:     number;
  lastTouched:   number;
  touchCount:    number;
  installDate:   number;
  lastNotified:  number;
  mowCount:      number;
  waterCount:    number;
  seasonOverride: number | null; // month 0-11 or null = real date
  lastAliveStage: GrassStage;
  visitorCounts: Record<string, number>;
}

const WATER_BOOST_MS: Record<GrassStage, number> = {
  dead:   0,
  sprout: 5 * 60 * 1000,
  short:  20 * 60 * 1000,
  normal: 30 * 60 * 1000,
  tall:   45 * 60 * 1000,
  jungle: 0,
};

export class GrassState {
  private data: StateData;

  constructor(private context: vscode.ExtensionContext) {
    const now = Date.now();
    const isFreshInstall = !context.globalState.get('installDate') || context.globalState.get('schemaVersion') !== 1;
    if (isFreshInstall) {
      this.data = {
        lastWatered:    now,
        lastMowed:      now,
        lastTouched:    0,
        touchCount:     0,
        installDate:    now,
        lastNotified:   0,
        mowCount:       0,
        waterCount:     0,
        seasonOverride:  null,
        lastAliveStage:  'normal' as GrassStage,
        visitorCounts:   {},
      };
      this.save();
    } else {
      this.data = {
        lastWatered:    context.globalState.get('lastWatered',    now),
        lastMowed:      context.globalState.get('lastMowed',      now),
        lastTouched:    context.globalState.get('lastTouched',    0),
        touchCount:     context.globalState.get('touchCount',     0),
        installDate:    context.globalState.get('installDate',    now),
        lastNotified:   context.globalState.get('lastNotified',   0),
        mowCount:       context.globalState.get('mowCount',       0),
        waterCount:     context.globalState.get('waterCount',     0),
        seasonOverride:  context.globalState.get('seasonOverride', null),
        lastAliveStage:  context.globalState.get('lastAliveStage', 'normal') as GrassStage,
        visitorCounts:   context.globalState.get('visitorCounts', {}),
      };
    }
  }

  private cfg() {
    const c = vscode.workspace.getConfiguration('vscodeGrass');
    const speed = c.get<string>('growthSpeed', 'normal');
    const dev   = c.get<boolean>('devMode', false);
    const speedMult = speed === 'slow' ? 2 : speed === 'fast' ? 0.5 : 1;
    const baseUnit  = (dev ? 10_000 : 24 * 60 * 60 * 1000) * speedMult;

    const season = getCurrentSeason(this.data.seasonOverride ?? undefined);
    // Season multipliers on growth unit (higher = slower growth)
    // Summer: grows faster but dries faster; Winter: grows slower; Spring: fastest; Autumn: normal
    const seasonGrowthMult = dev
      ? { spring: 0.8, summer: 0.7, autumn: 1.0, winter: 1.5 }[season]
      : { spring: 0.8, summer: 0.7, autumn: 1.0, winter: 1.5 }[season];
    // Summer: dries 2x faster (shorter dead threshold)
    const unit = baseUnit * seasonGrowthMult;
    const waterCooldown = dev ? 10_000 : (season === 'summer' ? 4 : 2) * 60 * 60 * 1000;
    return { dev, unit, baseUnit, waterCooldown, season };
  }

  getStage(): GrassStage {
    const now = Date.now();
    const { unit, baseUnit, dev } = this.cfg();
    const sinceWatered = now - this.data.lastWatered;
    const sinceMowed   = (now - this.data.lastMowed) / unit;

    const deadThresholdMs = baseUnit * (dev ? 4 : 12 / 24);
    if (sinceWatered > deadThresholdMs) return 'dead';
    let stage: GrassStage;
    if (sinceMowed < 4 / 24)  stage = 'sprout';
    else if (sinceMowed < 12 / 24) stage = 'short';
    else if (sinceMowed < 1.5)     stage = 'normal';
    else if (sinceMowed < 2.5)     stage = 'tall';
    else stage = 'jungle';
    if (stage !== this.data.lastAliveStage) {
      this.data.lastAliveStage = stage;
      this.save();
    }
    return stage;
  }

  waterCooldownRemaining(): number {
    const { waterCooldown } = this.cfg();
    const elapsed = Date.now() - this.data.lastWatered;
    return Math.max(0, waterCooldown - elapsed);
  }

  canWater(): boolean {
    return this.waterCooldownRemaining() === 0;
  }

  touch(): void {
    this.data.lastTouched = Date.now();
    this.data.touchCount++;
    this.save();
  }

  water(): boolean {
    if (!this.canWater()) return false;
    const now = Date.now();
    const stage = this.getStage();
    const { baseUnit, dev } = this.cfg();

    if (stage === 'dead') {
      const deadThreshold = baseUnit * (dev ? 4 : 12 / 24);
      const diedAt = this.data.lastWatered + deadThreshold;
      const elapsedBeforeDeath = diedAt - this.data.lastMowed;
      this.data.lastMowed = elapsedBeforeDeath > 0 ? now - elapsedBeforeDeath : now;
    } else {
      const boost = WATER_BOOST_MS[stage];
      if (boost > 0) {
        this.data.lastMowed = this.data.lastMowed - boost;
      }
    }

    this.data.lastWatered = now;
    this.data.waterCount++;
    this.save();
    return true;
  }

  mow(): void {
    this.data.lastMowed = Date.now();
    this.data.lastAliveStage = 'sprout';
    this.data.mowCount++;
    this.save();
  }

  setSeasonOverride(month: number | null): void {
    this.data.seasonOverride = month;
    this.save();
  }

  markNotified(): void {
    this.data.lastNotified = Date.now();
    this.save();
  }

  kill(): void {
    const { baseUnit, dev } = this.cfg();
    const currentStage = this.getStage();
    if (currentStage !== 'dead') this.data.lastAliveStage = currentStage;
    const deadThresholdMs = baseUnit * (dev ? 4 : 12 / 24);
    this.data.lastWatered = Date.now() - deadThresholdMs - 1000;
    this.save();
  }

  resetTouchCount(): void {
    this.data.touchCount = 0;
    this.data.lastTouched = 0;
    this.save();
  }

  reset(): void {
    const now = Date.now();
    this.data = {
      lastWatered:    now,
      lastMowed:      now,
      lastTouched:    0,
      touchCount:     0,
      installDate:    now,
      lastNotified:   0,
      mowCount:       0,
      waterCount:     0,
      seasonOverride:  null,
      lastAliveStage:  'sprout',
      visitorCounts:   {},
    };
    this.save();
  }

  get lastWatered():    number         { return this.data.lastWatered;    }
  get lastMowed():      number         { return this.data.lastMowed;      }
  get lastTouched():    number         { return this.data.lastTouched;    }
  get touchCount():     number         { return this.data.touchCount;     }
  get installDate():    number         { return this.data.installDate;    }
  get lastNotified():   number         { return this.data.lastNotified;   }
  get mowCount():       number         { return this.data.mowCount;       }
  get waterCount():     number         { return this.data.waterCount;     }
  get seasonOverride(): number | null  { return this.data.seasonOverride; }

  serialize(): StateData & { stage: GrassStage; devMode: boolean; waterCooldownMs: number; season: Season; thresholds: Record<string, number>; deadThresholdMs: number } {
    const { dev, unit, baseUnit, season } = this.cfg();
    return {
      ...this.data,
      stage: this.getStage(),
      devMode: dev,
      waterCooldownMs: this.waterCooldownRemaining(),
      season,
      thresholds: {
        sprout: 0,
        short:  unit * 4 / 24,
        normal: unit * 12 / 24,
        tall:   unit * 1.5,
        jungle: unit * 2.5,
      },
      deadThresholdMs: baseUnit * (dev ? 4 : 12 / 24),
    };
  }

  recordVisitor(animal: string): void {
    this.data.visitorCounts[animal] = (this.data.visitorCounts[animal] ?? 0) + 1;
    this.save();
  }

  private save(): void {
    const d = this.data;
    this.context.globalState.update('lastWatered',    d.lastWatered);
    this.context.globalState.update('lastMowed',      d.lastMowed);
    this.context.globalState.update('lastTouched',    d.lastTouched);
    this.context.globalState.update('touchCount',     d.touchCount);
    this.context.globalState.update('installDate',    d.installDate);
    this.context.globalState.update('lastNotified',   d.lastNotified);
    this.context.globalState.update('mowCount',       d.mowCount);
    this.context.globalState.update('waterCount',     d.waterCount);
    this.context.globalState.update('seasonOverride',  d.seasonOverride);
    this.context.globalState.update('lastAliveStage',  d.lastAliveStage);
    this.context.globalState.update('visitorCounts',   d.visitorCounts);
    this.context.globalState.update('schemaVersion',   1);
  }
}
