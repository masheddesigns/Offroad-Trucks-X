export class FuelSystem {
  public maxFuel: number = 100.0; // 100 Liters tank
  public currentFuel: number = 75.0; // Start at 75%
  public isRefueling: boolean = false;
  public isLowFuel: boolean = false;
  public isOutOfFuel: boolean = false;

  private fuelBarEl = document.getElementById('fuel-bar');
  private fuelValEl = document.getElementById('fuel-val');
  private fuelBadgeEl = document.getElementById('fuel-badge');

  constructor() {
    this.updateUI();
  }

  public update(dt: number, throttle: number, speedKmh: number, isNearPump: boolean): number {
    const absThrottle = Math.abs(throttle);

    if (isNearPump) {
      // Refuel truck at petrol pump
      this.isRefueling = true;
      this.currentFuel = Math.min(this.maxFuel, this.currentFuel + 22.0 * dt);
    } else {
      this.isRefueling = false;
      // Normal fuel burn
      const idleBurn = 0.04;
      const throttleBurn = absThrottle * 0.32;
      const speedBurn = (Math.abs(speedKmh) / 120.0) * 0.15;
      const totalBurnRate = idleBurn + throttleBurn + speedBurn;

      this.currentFuel = Math.max(0.0, this.currentFuel - totalBurnRate * dt);
    }

    this.isLowFuel = this.currentFuel > 0 && this.currentFuel < 20.0;
    this.isOutOfFuel = this.currentFuel <= 0.001;

    this.updateUI();

    // Power multiplier: 1.0 when full, 0.0 when out of fuel (engine cut)
    if (this.isOutOfFuel) {
      return 0.0;
    } else if (this.isLowFuel) {
      return 0.85; // Slight stutter
    }
    return 1.0;
  }

  public refuelFull() {
    this.currentFuel = this.maxFuel;
    this.updateUI();
  }

  private updateUI() {
    const percent = (this.currentFuel / this.maxFuel) * 100;

    if (this.fuelBarEl) {
      this.fuelBarEl.style.width = `${percent.toFixed(1)}%`;
      if (this.isOutOfFuel) {
        this.fuelBarEl.style.background = '#ef4444';
      } else if (this.isLowFuel) {
        this.fuelBarEl.style.background = '#f59e0b';
      } else if (this.isRefueling) {
        this.fuelBarEl.style.background = '#22c55e';
      } else {
        this.fuelBarEl.style.background = '#3b82f6';
      }
    }

    if (this.fuelValEl) {
      this.fuelValEl.textContent = `${Math.round(this.currentFuel)}L`;
    }

    if (this.fuelBadgeEl) {
      if (this.isRefueling) {
        this.fuelBadgeEl.textContent = '⛽ REFUELING...';
        this.fuelBadgeEl.className = 'fuel-badge refueling';
      } else if (this.isOutOfFuel) {
        this.fuelBadgeEl.textContent = '⚠️ TANK EMPTY';
        this.fuelBadgeEl.className = 'fuel-badge empty';
      } else if (this.isLowFuel) {
        this.fuelBadgeEl.textContent = '⚠️ LOW FUEL';
        this.fuelBadgeEl.className = 'fuel-badge low';
      } else {
        this.fuelBadgeEl.className = 'fuel-badge hidden';
      }
    }
  }
}
