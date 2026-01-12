#!/usr/bin/env python3

import subprocess
import time
import sys
import signal
from typing import List, Dict, Any

class ChessBenchmark:
    def __init__(self, engine_path: str, num_runs: int = 3, depth: int = 10, clear_cache: bool = False):
        self.engine_path = engine_path
        self.num_runs = num_runs
        self.depth = depth
        self.clear_cache = clear_cache
        self.engine = None
        self.results = []
        
    def clear_page_cache(self) -> None:
        """Clear the system page cache to ensure consistent benchmarking."""
        try:
            print("Clearing system page cache...")
            # This requires root privileges
            subprocess.run(['sudo', 'sync'], check=True)
            subprocess.run(['sudo', 'sh', '-c', 'echo 3 > /proc/sys/vm/drop_caches'], 
                         check=True)
            print("Page cache cleared")
        except subprocess.CalledProcessError as e:
            print(f"Warning: Could not clear page cache (run as root): {e}")
        except FileNotFoundError:
            print("Warning: Could not clear page cache (not on Linux)")

    def start_engine(self):
        """Start the chess engine process."""
        try:
            self.engine = subprocess.Popen(
                [self.engine_path],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                universal_newlines=True
            )
            # Wait for engine to be ready
            time.sleep(0.1)
        except Exception as e:
            print(f"Failed to start engine: {e}")
            raise

    def send_command(self, command: str):
        """Send a command to the chess engine."""
        if not self.engine:
            return
        try:
            self.engine.stdin.write(f"{command}\n")
            self.engine.stdin.flush()
        except Exception as e:
            print(f"Error sending command: {e}")
            raise

    def read_until(self, terminator: str) -> List[str]:
        """Read engine output until a specific line is found without timeout."""
        if not self.engine:
            return []
            
        lines = []
        while True:
            line = self.engine.stdout.readline().strip()
            if line:
                print(f"Engine: {line}")
                lines.append(line)
                if terminator in line:
                    return lines

    def run_benchmark(self) -> None:
        """Run the benchmark."""
        print(f"=== Starting Benchmark ===")
        print(f"Engine: {self.engine_path}")
        print(f"Runs: {self.num_runs}")
        print(f"Depth: {self.depth}")
        if self.clear_cache:
            print("Cache clearing: ENABLED (requires root)")
        print("=" * 30)

        try:
            self.start_engine()
            self.send_command("uci")
            self.read_until("uciok")  # Wait for UCI handshake

            for run in range(1, self.num_runs + 1):
                if self.clear_cache:
                    self.clear_page_cache()
                    time.sleep(1)  # Give the system a moment to settle
                
                print(f"\n--- Run {run}/{self.num_runs} ---")
                start_time = time.time()
                
                # Set up position and start search
                self.send_command("ucinewgame")
                self.send_command("position startpos")
                self.send_command(f"go depth {self.depth}")
                
                # Read until bestmove is found
                output = self.read_until("bestmove")
                if not output:
                    print("Error: No bestmove received")
                    continue
                
                elapsed = time.time() - start_time
                
                # Parse nodes and nps from engine output
                nodes = 0
                nps = 0
                for line in output:
                    if "nodes" in line:
                        nodes = int(line.split("nodes")[1].split()[0])
                    if "nps" in line:
                        nps = int(line.split("nps")[1].split()[0])
                
                if nps == 0 and elapsed > 0:
                    nps = int(nodes / elapsed)
                
                print(f"Depth {self.depth}: {nps:,} nps, {nodes:,} nodes")
                self.results.append({
                    'run': run,
                    'nodes': nodes,
                    'time': elapsed,
                    'nps': nps
                })

            self.print_summary()

        except Exception as e:
            print(f"\nError during benchmark: {e}")
        finally:
            self.close()

    def print_summary(self) -> None:
        """Print benchmark summary."""
        if not self.results:
            print("No results to display")
            return

        print("\n=== Benchmark Summary ===")
        total_nodes = sum(r['nodes'] for r in self.results)
        total_time = sum(r['time'] for r in self.results)
        avg_nps = int(total_nodes / total_time) if total_time > 0 else 0
        
        print(f"Runs completed: {len(self.results)}")
        print(f"Total nodes: {total_nodes:,}")
        print(f"Total time: {total_time:.2f}s")
        print(f"Average NPS: {avg_nps:,}")

        if len(self.results) > 1:
            nps_values = [r['nps'] for r in self.results]
            median_nps = sorted(nps_values)[len(nps_values) // 2]
            min_nps = min(nps_values)
            max_nps = max(nps_values)
            
            print(f"Median NPS: {median_nps:,}")
            print(f"Min NPS: {min_nps:,}")
            print(f"Max NPS: {max_nps:,}")
            
            # Calculate standard deviation
            if len(nps_values) > 1:
                mean = sum(nps_values) / len(nps_values)
                variance = sum((x - mean) ** 2 for x in nps_values) / len(nps_values)
                std_dev = (variance ** 0.5)
                print(f"Standard deviation: {int(std_dev):,}")

    def close(self) -> None:
        """Clean up resources."""
        if hasattr(self, 'engine') and self.engine:
            try:
                self.send_command("quit")
                self.engine.terminate()
                self.engine.wait(timeout=2.0)
            except:
                self.engine.kill()
            finally:
                self.engine = None

def signal_handler(sig, frame):
    """Handle interrupt signals for graceful shutdown."""
    print("\nReceived interrupt signal, shutting down...")
    if 'benchmark' in globals():
        benchmark.close()
    sys.exit(0)

def main():
    import argparse
    
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Run chess engine benchmark')
    parser.add_argument('--engine', type=str, default='./cli',
                      help='Path to the chess engine executable (default: ./cli)')
    parser.add_argument('--runs', type=int, default=3,
                      help='Number of benchmark runs to perform (default: 3)')
    parser.add_argument('--depth', type=int, default=10,
                      help='Search depth for each run (default: 10)')
    parser.add_argument('--clear-cache', action='store_true',
                      help='Clear system page cache before each run (requires root)')
    
    args = parser.parse_args()

    # Register signal handler
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    global benchmark
    benchmark = ChessBenchmark(
        engine_path=args.engine,
        num_runs=args.runs,
        depth=args.depth,
        clear_cache=args.clear_cache
    )
    
    try:
        benchmark.run_benchmark()
    finally:
        benchmark.close()

if __name__ == "__main__":
    main()