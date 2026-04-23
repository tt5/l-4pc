// move_picker2.h
#ifndef MOVE_PICKER2_H
#define MOVE_PICKER2_H

#include "board.h"
#include <vector>
#include <algorithm>
#include <cmath>
#include <optional>
#include <mutex>
#include <chrono>
#include <iostream>

namespace chess {

struct MovePicker2 {
    const Move* moves;     // Pointer to moves array (not owned)
    const Board* board;    // Pointer to the board (needed to get piece types)
    size_t count;          // Total number of moves
    size_t current;        // Current move index
    const Move* pv_move;   // PV move to prioritize
    const Move* tt_move;   // TT move to try after PV move
    int phase;             // Current phase (0=PV, 1=TT, 2=Remaining)
    int16_t (*history_heuristic)[224][224]; // Pointer to current ply's history heuristic [piece_type][from_sq][to_sq] where sq = row*16+col
    std::vector<size_t> move_indices;   // To store sorted indices of remaining moves
    bool remaining_sorted; // Whether remaining moves are already sorted
    size_t sorted_current; // Current position in sorted order
};
// Initialize with board, moves, and optional PV move
inline void InitMovePicker2(
    MovePicker2* picker,
    const Board* board,
    const Move* moves,
    size_t count,
    const Move* pv_move,
    const Move* tt_move = nullptr,
    int16_t (*history_heuristic)[224][224] = nullptr)
{
    picker->board = board;
    picker->moves = moves;
    picker->count = count;
    picker->current = 0;
    picker->pv_move = pv_move;
    picker->tt_move = tt_move;
    picker->phase = 0;
    picker->remaining_sorted = false;
    picker->history_heuristic = history_heuristic;
    picker->sorted_current = 0;
    
    // Initialize move indices
    picker->move_indices.resize(count);
    for (size_t i = 0; i < count; i++) {
        picker->move_indices[i] = i;
    }
}

// Check if a move exists in the move list (excluding already processed moves)
inline bool MoveExists(const Move* moves, size_t start, size_t end, const Move& move) {
    for (size_t i = start; i < end; ++i) {
        if (moves[i] == move) {
            return true;
        }
    }
    return false;
}

// Get next move, returns nullptr when done
inline const Move* GetNextMove2(MovePicker2* picker) {
    while (true) {
        switch (picker->phase) {
            // Phase 0: Return PV move if available
            case 0:
                picker->phase++;
                if (picker->pv_move) {
                    return picker->pv_move;
                }
                // Fall through to next phase if no PV move

            // Phase 1: Return TT move if available and different from PV
            case 1:
                picker->phase++;
                if (picker->tt_move && picker->tt_move != picker->pv_move) {
                    return picker->tt_move;
                }
                // Fall through to next phase if no TT move or same as PV

            // Phase 2: Return remaining moves with history-aware ordering
            case 2: {
                // Sort remaining moves by combined score if not already sorted
                // Calculate once and reuse
                const size_t remaining_moves = picker->count - picker->current;

                // Use remaining_moves in the conditions and calculations
                if (!picker->remaining_sorted && 
                    remaining_moves > 1) {  // Changed condition to use remaining_moves
                    
                    //static std::chrono::nanoseconds total_ordering_time{0};
                    //static int orderings_count = 0;
                    //const auto start = std::chrono::high_resolution_clock::now();
                    
                    struct ScoredMove {
                        size_t idx;
                        int16_t score;
                        bool operator<(const ScoredMove& other) const {
                            return score > other.score; // Sort descending
                        }
                    };
                    
                    std::vector<ScoredMove> scored_moves;
                    scored_moves.reserve(remaining_moves);  // Use remaining_moves here

                    // Calculate scores for remaining moves
                    for (size_t i = 0; i < remaining_moves; i++) {
                        const size_t move_idx = picker->current + i;
                        const Move& move = picker->moves[move_idx];

                        const bool is_capture = move.IsCapture();

                        const Piece piece = picker->board->GetPiece(move.FromRow(), move.FromCol());
                        const PieceType pt = piece.GetPieceType();

                        if (is_capture) {

                            // MVV-LVA: Most Valuable Victim - Least Valuable Aggressor
                            // Get captured piece type
                            const Piece captured_piece = move.GetCapturePiece();
                            const PieceType victim_pt = captured_piece.GetPieceType();

                            // Piece values scaled down: PAWN=1, KNIGHT=6, BISHOP=8, ROOK=10, QUEEN=20, KING=200
                            static constexpr int16_t piece_values[6] = {1, 6, 8, 10, 20, 200};

                            const int16_t victim_value = piece_values[victim_pt];
                            const int16_t aggressor_value = piece_values[pt];

                            const int16_t mvv_lva = (victim_value << 3) - aggressor_value;

                            // Base capture score scaled to fit int16_t (max ~30,000)
                            int16_t score = 30000 + mvv_lva;

                            scored_moves.push_back({move_idx, score});
                        }
                        else { // non-catpures
                            // Get move information
                            const int from_sq = (move.FromRow() << 4) + move.FromCol();
                            const int to_sq = (move.ToRow() << 4) + move.ToCol();
                            int queen_idx = (pt == QUEEN) ? 1 : 0;
                            int16_t hist_value = picker->history_heuristic[queen_idx][from_sq][to_sq];
                            scored_moves.push_back({move_idx, hist_value});
                        }
                    }
                    
                    // Use insertion sort for small arrays, std::sort for larger ones
                    if (scored_moves.size() <= 10) {
                        for (size_t i = 1; i < scored_moves.size(); ++i) {
                            auto key = scored_moves[i];
                            int j = i - 1;
                            while (j >= 0 && scored_moves[j].score < key.score) {
                                scored_moves[j + 1] = scored_moves[j];
                                j = j - 1;
                            }
                            scored_moves[j + 1] = key;
                        }
                    } else {
                        static constexpr auto move_comparator = [](const auto& a, const auto& b) {
                            return a.score > b.score;
                        };
                        std::sort(scored_moves.begin(), scored_moves.end(), move_comparator);
                    }
                    
                    // Update move_indices with new order (write to beginning)
                    for (size_t i = 0; i < scored_moves.size(); i++) {
                        picker->move_indices[i] = scored_moves[i].idx;
                    }
                    
                    picker->remaining_sorted = true;
                    
                    //const auto end = std::chrono::high_resolution_clock::now();
                    //const auto duration = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start);
                    //total_ordering_time += duration;
                    //orderings_count++;
                    
                    //static size_t max_moves_ordered = 0;
                    //size_t moves_this_time = picker->count - picker->current;
                    //if (moves_this_time > max_moves_ordered) {
                    //    max_moves_ordered = moves_this_time;
                    //}
                    
                    //if (orderings_count % 100000 == 0) {
                    //    std::cout << "--- -- [Move ordering] "
                    //              << "Count: " << orderings_count << " "
                    //              << "Avg: " << total_ordering_time.count() / orderings_count << "ns "
                    //              << "Cur/Max moves: " << moves_this_time << "/" << max_moves_ordered << "\n";
                    //}
                }
                
                // Return next move in the sorted order
                if (picker->sorted_current < picker->count) {
                    size_t idx = picker->move_indices[picker->sorted_current++];
                    /*
                    if (idx >= picker->count) {
                        std::cout << "Corrupted move index: " << idx << " >= " << picker->count << std::endl;
                        abort();
                    }
                    */
                    // Skip PV move if it appears in the move list
                    if (picker->pv_move && picker->moves[idx] == *picker->pv_move) {
                        continue; // Skip to next move
                    }
                    // Skip TT move if it appears in the move list (to avoid duplicates)
                    if (picker->tt_move && picker->moves[idx] == *picker->tt_move) {
                        continue; // Skip to next move
                    }
                    return &picker->moves[idx];
                }
                return nullptr;
            }
                
            default:
                return nullptr;
        }
    }
}

}  // namespace chess

#endif  // MOVE_PICKER2_H