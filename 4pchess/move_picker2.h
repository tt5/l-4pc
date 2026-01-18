// move_picker2.h
#ifndef MOVE_PICKER2_H
#define MOVE_PICKER2_H

// Fast tanh approximation (about 5x faster than std::tanh)
// Accurate to within ~0.2% in the range [-3, 3]
constexpr float fast_tanh(float x) {
    // Clamp x to prevent overflow in x^3
    x = x > 3.0f ? 3.0f : (x < -3.0f ? -3.0f : x);
    const float x2 = x * x;
    return x * (27.0f + x2) / (27.0f + 9.0f * x2);
}

#include "board.h"
#include "player.h"  // For PieceToHistory and ContinuationHistory types
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
    const Move* killer1;   // First killer move
    const Move* killer2;   // Second killer move
    int phase;             // Current phase (0=PV, 1=Killer1, 2=Killer2, 3=Remaining)
    const PieceToHistory* const* cont_hist; // Array of pointers to continuation history from previous plies
    int (*history_heuristic)[14][14][14][14]; // Pointer to current ply's history heuristic
    std::vector<size_t> move_indices;   // To store sorted indices of remaining moves
    bool remaining_sorted; // Whether remaining moves are already sorted
    float history_weight;  // Weight for history score (0.0 to 1.0)
};

// Initialize with board, moves, optional PV move, and optional killer moves
inline void InitMovePicker2(
    MovePicker2* picker,
    const Board* board,
    const Move* moves, 
    size_t count,
    const Move* pv_move = nullptr,
    const Move* killer1 = nullptr,
    const Move* killer2 = nullptr,
    const PieceToHistory* const* cont_hist = nullptr,
    int (*history_heuristic)[14][14][14][14] = nullptr,
    float history_weight = 0.5f) 
{
    picker->board = board;
    picker->moves = moves;
    picker->count = count;
    picker->current = 0;
    picker->pv_move = pv_move;
    picker->killer1 = killer1;
    picker->killer2 = killer2;
    picker->cont_hist = cont_hist;
    picker->phase = 0;
    picker->remaining_sorted = false;
    picker->history_weight = std::clamp(history_weight, 0.0f, 1.0f);
    picker->history_heuristic = history_heuristic;
    
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
                    // Skip the PV move in the main move list if it exists there
                    if (picker->current < picker->count && 
                        picker->moves[picker->current] == *picker->pv_move) {
                        picker->current++;
                    }
                    return picker->pv_move;
                }
                // Fall through to next phase if no PV move
                
            // Phase 1: Return first killer move if available and not already played
            case 1:
                picker->phase++;
                if (picker->killer1 && 
                    !(picker->pv_move && *picker->killer1 == *picker->pv_move) &&
                    MoveExists(picker->moves, picker->current, picker->count, *picker->killer1)) {
                    return picker->killer1;
                }
                // Fall through to next phase
                
            // Phase 2: Return second killer move if available and not already played
            case 2:
                picker->phase++;
                if (picker->killer2 && 
                    !(picker->pv_move && *picker->killer2 == *picker->pv_move) &&
                    !(picker->killer1 && *picker->killer2 == *picker->killer1) &&
                    MoveExists(picker->moves, picker->current, picker->count, *picker->killer2)) {
                    return picker->killer2;
                }
                // Fall through to next phase
                
            // Phase 3: Return remaining moves with history-aware ordering
            case 3: {
                // Sort remaining moves by combined score if not already sorted
                // Calculate once and reuse
                const size_t remaining_moves = picker->count - picker->current;

                // Use remaining_moves in the conditions and calculations
                if (!picker->remaining_sorted && picker->cont_hist && 
                    remaining_moves > 1) {  // Changed condition to use remaining_moves
                    
                    static std::chrono::duration<double, std::micro> total_ordering_time{0};
                    static int orderings_count = 0;
                    const auto start = std::chrono::high_resolution_clock::now();
                    
                    struct ScoredMove {
                        size_t idx;
                        float score;
                        bool operator<(const ScoredMove& other) const {
                            return score > other.score; // Sort descending
                        }
                    };
                    
                    std::vector<ScoredMove> scored_moves;
                    scored_moves.reserve(remaining_moves);  // Use remaining_moves here
                    
                    // Precompute 1.0f / remaining_moves to avoid division in the loop
                    const float inv_remaining_moves = 1.0f / remaining_moves;
                    
                    // Calculate scores for remaining moves
                    for (size_t i = 0; i < remaining_moves; i++) {
                        const Move& move = picker->moves[picker->current + i];
                        const float order_score = 1.0f - i * inv_remaining_moves;
                        
                        // Get move information
                        const auto from = move.From();
                        const auto to = move.To();
                        const Piece piece = picker->board->GetPiece(from);
                        const PieceType pt = piece.GetPieceType();
                        const int from_row = from.GetRow();
                        const int from_col = from.GetCol();
                        const int to_row = to.GetRow();
                        const int to_col = to.GetCol();
                        const bool is_capture = move.IsCapture();
                        
                        // Fast path for captures - give them a significant bonus
                        if (is_capture) {
                            // High base score for captures
                            float score = 1000.0f + order_score * 10.0f;
                            
                            // Add history heuristic if available
                            if (picker->history_heuristic) {
                                int32_t hist_value = picker->history_heuristic[from_row][from_col][to_row][to_col][pt];
                                score += fast_tanh(hist_value * 0.001f) * 100.0f;
                            }
                            
                            /*
                            // Only check first continuation history
                            if (picker->cont_hist[0] != nullptr) {
                                const auto& entry = (*picker->cont_hist[0])[true][pt];
                                int32_t cont_value = entry[to_row * 14 + to_col];
                                score += std::tanh(cont_value / 1000.0f) * 50.0f;
                            }
                            */
                            
                            scored_moves.push_back({i, score});
                        } 
                        // Slower path for non-captures
                        else {
                            float score = order_score;
                            
                            // Only use history heuristic if it's significant
                            if (picker->history_heuristic) {
                                int32_t hist_value = picker->history_heuristic[from_row][from_col][to_row][to_col][pt];
                                if (hist_value > 100) {  // Only consider significant history
                                    score += fast_tanh(hist_value * 0.001f);
                                }
                            }

                            /*
                            if (picker->cont_hist[0] != nullptr) {
                                const auto& entry = (*picker->cont_hist[0])[false][pt];  // false for non-captures
                                int32_t cont_value = entry[to_row * 14 + to_col];
                                score += std::tanh(cont_value / 1000.0f) * 20.0f;
                            }                           
                            */
                            
                            scored_moves.push_back({i, score});
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
                        std::sort(scored_moves.begin(), scored_moves.end(),
                            [](const auto& a, const auto& b) { return a.score > b.score; });
                    }
                    
                    // Update move_indices with new order
                    for (size_t i = 0; i < scored_moves.size(); i++) {
                        picker->move_indices[picker->current + i] = scored_moves[i].idx;
                    }
                    
                    picker->remaining_sorted = true;
                    
                    const auto end = std::chrono::high_resolution_clock::now();
                    const auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
                    total_ordering_time += duration;
                    orderings_count++;
                    
                    static size_t max_moves_ordered = 0;
                    size_t moves_this_time = picker->count - picker->current;
                    if (moves_this_time > max_moves_ordered) {
                        max_moves_ordered = moves_this_time;
                    }
                    
                    if (orderings_count % 100000 == 0) {
                        //std::cout << "Move ordering stats - "
                        //          << "Total time: " << total_ordering_time.count() / 1000.0 << "ms "
                        //          << "Count: " << orderings_count << " "
                        //          << "Avg: " << total_ordering_time.count() / orderings_count << "µs "
                        //          << "Cur/Max moves: " << moves_this_time << "/" << max_moves_ordered << "\n";
                    }
                }
                
                // Return next move in the sorted order
                if (picker->current < picker->count) {
                    size_t idx = picker->move_indices[picker->current++];
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