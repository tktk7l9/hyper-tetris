/**
 * Owns every reason the game can be paused: the player's own toggle, the
 * help overlay, and the page going into the background. Help restores the
 * previous pause state when it closes so reading it never costs a piece.
 */
export interface Pausable {
  paused: boolean;
  gameOver: boolean;
}

export type EscapeResult = "help-closed" | "paused" | "resumed" | "none";

export class PauseController {
  private open = false;
  private resumeTo = false;

  constructor(private readonly state: Pausable) {}

  get helpOpen(): boolean {
    return this.open;
  }

  openHelp(): void {
    if (this.open) return;
    this.open = true;
    this.resumeTo = this.state.paused;
    this.state.paused = true;
  }

  closeHelp(): void {
    if (!this.open) return;
    this.open = false;
    this.state.paused = this.resumeTo;
  }

  /** Returns whether help is open after the call. */
  toggleHelp(): boolean {
    if (this.open) this.closeHelp();
    else this.openHelp();
    return this.open;
  }

  /** Player pause toggle. Returns the resulting paused flag. */
  togglePause(): boolean {
    if (this.open || this.state.gameOver) return this.state.paused;
    this.state.paused = !this.state.paused;
    return this.state.paused;
  }

  /** Pause because the page lost focus. Returns true when it changed anything. */
  suspend(): boolean {
    if (this.state.gameOver) return false;
    if (this.open) {
      const changed = !this.resumeTo;
      this.resumeTo = true;
      return changed;
    }
    if (this.state.paused) return false;
    this.state.paused = true;
    return true;
  }

  escape(): EscapeResult {
    if (this.open) {
      this.closeHelp();
      return "help-closed";
    }
    if (this.state.gameOver) return "none";
    return this.togglePause() ? "paused" : "resumed";
  }

  /** Call after the game was reset so an open help overlay keeps it paused. */
  afterReset(): void {
    if (!this.open) return;
    this.resumeTo = false;
    this.state.paused = true;
  }
}
