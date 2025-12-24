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
          if (scoreType === 'cp') {
            this.currentScore = parseInt(scoreValue, 10) / 100;
          } else if (scoreType === 'mate') {
            this.currentScore = parseInt(scoreValue, 10) * 1000; // Arbitrary large value for mate
          }
        }
        
        const pvIndex = parts.indexOf('pv');
        if (pvIndex !== -1) {
          this.currentPv = parts.slice(pvIndex + 1);
        }
        
        // Emit analysis update
        this.onAnalysisUpdate?.({
          depth: this.currentDepth,
          score: this.currentScore,
          pv: this.currentPv,
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
      this.sendCommand('setoption name UCI_ShowCurrLine value true');
      this.sendCommand('isready');
      resolve();
    });
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