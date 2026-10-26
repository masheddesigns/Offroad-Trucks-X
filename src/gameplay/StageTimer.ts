export class StageTimer {
  public isRunning: boolean = false;
  public elapsedTime: number = 0;
  public bestTime: number | null = null;
  public stageCompleted: boolean = false;

  private timerEl = document.getElementById('stage-timer');
  private bestEl = document.getElementById('stage-best');

  constructor() {
    this.loadBest();
  }

  private loadBest() {
    const saved = localStorage.getItem('dakar_stage1_best');
    if (saved) {
      this.bestTime = parseFloat(saved);
      this.updateUI();
    }
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.elapsedTime = 0;
    this.stageCompleted = false;
  }

  public finish() {
    if (!this.isRunning || this.stageCompleted) return;
    this.isRunning = false;
    this.stageCompleted = true;

    if (this.bestTime === null || this.elapsedTime < this.bestTime) {
      this.bestTime = this.elapsedTime;
      localStorage.setItem('dakar_stage1_best', this.bestTime.toString());
    }
    this.updateUI();
  }

  public update(dt: number) {
    if (this.isRunning) {
      this.elapsedTime += dt;
      this.updateUI();
    }
  }

  public updateUI() {
    if (this.timerEl) {
      const mins = Math.floor(this.elapsedTime / 60);
      const secs = (this.elapsedTime % 60).toFixed(1);
      this.timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.padStart(4, '0')}`;
    }
    if (this.bestEl && this.bestTime !== null) {
      const mins = Math.floor(this.bestTime / 60);
      const secs = (this.bestTime % 60).toFixed(1);
      this.bestEl.textContent = `BEST: ${mins.toString().padStart(2, '0')}:${secs.padStart(4, '0')}`;
    }
  }
}
