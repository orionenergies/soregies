/**
 * Timer d'exécution pour le monitoring du bot.
 *
 * Usage :
 *   const timer = new ExecutionTimer();
 *   timer.start();
 *   // ... exécution ...
 *   const ms = timer.getElapsedMs();
 */

export class ExecutionTimer {
  private startTime: number = 0;

  /** Démarre le timer d'exécution. Appeler au tout début du run(). */
  start(): void {
    this.startTime = Date.now();
  }

  /** Retourne le temps écoulé depuis le start() en millisecondes. */
  getElapsedMs(): number {
    if (this.startTime === 0) {
      throw new Error('ExecutionTimer.getElapsedMs() called before start()');
    }
    return Date.now() - this.startTime;
  }
}
