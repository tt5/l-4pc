// src/engine/uciWrapper.ts
import { spawn, ChildProcess } from 'child_process';

export class UCIEngine {
  private engine: ChildProcess;
  private onBestMove: (move: string) => void = () => {};

  constructor(enginePath: string = './cli') {
    this.engine = spawn(enginePath);
    
    this.engine.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      console.log(`Engine: ${output}`);
      
      if (output.startsWith('bestmove')) {
        const move = output.split(' ')[1];
        this.onBestMove(move);
      }
    });

    this.engine.stderr?.on('data', (data) => {
      console.error(`Engine Error: ${data}`);
    });
  }

  public async init(): Promise<void> {
    return new Promise((resolve) => {
      this.sendCommand('uci');
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