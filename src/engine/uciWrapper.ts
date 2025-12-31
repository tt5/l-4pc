// src/engine/uciWrapper.ts
import { spawn, ChildProcess } from 'child_process';

export interface AnalysisInfo {
  depth: number;
  score: number;
  pv: string[];
  bestMove: string | null;
}

export class UCIEngine {
  private engine: ChildProcess;
  private currentBestMove: string | null = null;
  private currentDepth: number = 0;
  private currentScore: number = 0;
  private currentPv: string[] = [];
  private onBestMove: (move: string) => void = () => {};
  private threadCount: number = 1; // Default to 1 thread
  public onAnalysisUpdate?: (info: AnalysisInfo) => void;

  constructor(enginePath: string = './cli') {
    this.engine = spawn(enginePath);
    this.setupEngineHandlers();
  }

  private setupEngineHandlers(): void {
    this.engine.stdout?.on('data', (data: Buffer) => {
      const output = data.toString().trim();
      console.log(`Engine: ${output}`);
      
      // Parse best move
      if (output.startsWith('bestmove')) {
        const move = output.split(' ')[1];
        this.currentBestMove = move;
        this.onBestMove(move);
      }
      // Parse analysis info
      else if (output.startsWith('info')) {
        const parts = output.split(' ');
        const info: Record<string, string> = {};
        let scoreType: string | null = null;
        let scoreValue: string | null = null;
        let pv: string[] = [];
        
        // Extract PV if it exists
        const pvIndex = parts.indexOf('pv');
        if (pvIndex !== -1) {
          pv = [];
          let scoreFound = false;
          
          // Extract PV moves until we hit 'score' or end of array
          for (let i = pvIndex + 1; i < parts.length; i++) {
            if (parts[i] === 'score') {
              // Look for score value after 'score'
              if (i + 1 < parts.length) {
                const rawScore = parseFloat(parts[i + 1]);
                if (!isNaN(rawScore)) {
                  this.currentScore = rawScore;  // Use the raw score directly
                  scoreFound = true;
                }
              }
              break;
            }
            pv.push(parts[i]);
          }
          
          // Update bestMove to be the first move in PV
          if (pv.length > 0) {
            this.currentBestMove = pv[0];
          }
        }
        
        // Process other info fields
        for (let i = 1; i < parts.length; i++) {
          if (i + 1 < parts.length && !parts[i].startsWith('pv')) {
            info[parts[i]] = parts[i + 1];
            // Track score type (cp or mate) and its value
            if (parts[i] === 'cp' || parts[i] === 'mate') {
              scoreType = parts[i];
              scoreValue = parts[i + 1];
            }
          }
        }
        
        if (info.depth) this.currentDepth = parseInt(info.depth, 10);
        
        // Handle score
        if (scoreType && scoreValue) {
          const score = parseInt(scoreValue, 10);
          if (scoreType === 'cp') {
            // For centipawns, divide by 100 and negate if it's from the opponent's perspective
            this.currentScore = score / 100;
          } else if (scoreType === 'mate') {
            // For mate scores, use a large value with the correct sign
            this.currentScore = (score > 0 ? 10000 : -10000) + (score > 0 ? -score : score);
          }
        }
        
        // Emit analysis update with the current PV and best move
        this.onAnalysisUpdate?.({
          depth: this.currentDepth,
          score: this.currentScore,
          pv: pv,
          bestMove: this.currentBestMove
        });
      }
    });

    this.engine.stderr?.on('data', (data: Buffer) => {
      console.error(`Engine Error: ${data}`);
    });
  }

  public async init(): Promise<void> {
    return new Promise((resolve) => {
      this.sendCommand('uci');
      this.sendCommand(`setoption name Threads value ${this.threadCount}`);
      this.sendCommand('setoption name UCI_ShowCurrLine value true');
      this.sendCommand('isready');
      resolve();
    });
  }

  /**
   * Set the number of threads for the engine
   * @param count Number of threads to use (default: 1)
   */
  public setThreads(count: number = 1): void {
    console.log(`[UCIEngine] Current thread count: ${this.threadCount}, requested: ${count}`);
    if (count !== this.threadCount) {
      console.log(`[UCIEngine] Updating thread count from ${this.threadCount} to ${count}`);
      const oldThreadCount = this.threadCount;
      this.threadCount = count;
      try {
        this.sendCommand(`setoption name Threads value ${count}`);
        console.log(`[UCIEngine] Successfully sent thread count update to engine`);
      } catch (error) {
        // Revert thread count if sending the command fails
        this.threadCount = oldThreadCount;
        console.error(`[UCIEngine] Failed to set thread count:`, error);
        throw error;
      }
    } else {
      console.log(`[UCIEngine] Thread count already set to ${count}, no change needed`);
    }
  }

  public setPosition(fenOrMoves: string | { fen?: string; moves?: string[] }): void {
    if (typeof fenOrMoves === 'string') {
      this.sendCommand(`position ${fenOrMoves}`);
    } else {
      const { fen = 'startpos', moves = [] } = fenOrMoves;
      const movesStr = moves.length > 0 ? ` moves ${moves.join(' ')}` : '';
      this.sendCommand(`position ${fen}${movesStr}`);
    }
  }

  public startInfiniteAnalysis(): void {
    this.sendCommand('go infinite');
  }

  public stopInfiniteAnalysis(): void {
    this.sendCommand('stop');
  }

  public go(time: number = 1000): Promise<string> {
    return new Promise((resolve) => {
      this.onBestMove = (move: string) => {
        resolve(move);
      };
      this.sendCommand(`go movetime ${time}`);
    });
  }

  public stop(): void {
    this.sendCommand('stop');
  }

  public quit(): void {
    this.sendCommand('quit');
  }

  private sendCommand(command: string): void {
    console.log(`Sending: ${command}`);
    this.engine.stdin?.write(`${command}\n`);
  }
}