#include <tuple>
#include <algorithm>
#include <cmath>
#include <utility>
#include <cassert>
#include "utils.h"
#include <functional>
#include <optional>
#include <iostream>
#include <tuple>
#include <stdexcept>
#include <cstring>
#include <thread>
#include <mutex>
#include <atomic>
#include <chrono>

#include "board.h"
#include "player.h"
#include "move_picker.h"
#include "transposition_table.h"
#include "move_picker2.h"


namespace chess {

std::chrono::nanoseconds AlphaBetaPlayer::total_time{0};
std::chrono::nanoseconds AlphaBetaPlayer::total_timeA{0};
std::chrono::nanoseconds AlphaBetaPlayer::total_timeA2{0};
std::chrono::nanoseconds AlphaBetaPlayer::total_timeB{0};
std::chrono::nanoseconds AlphaBetaPlayer::total_timeC{0};
size_t AlphaBetaPlayer::call_count = 0;
size_t AlphaBetaPlayer::call_countA = 0;
size_t AlphaBetaPlayer::call_countA2 = 0;
size_t AlphaBetaPlayer::call_countB = 0;
size_t AlphaBetaPlayer::call_countC = 0;

AlphaBetaPlayer::AlphaBetaPlayer(std::optional<PlayerOptions> options) {
  if (options.has_value()) {
    options_ = *options;
  }

  piece_move_order_scores_[PAWN] = 1;
  piece_move_order_scores_[KNIGHT] = 2;
  piece_move_order_scores_[BISHOP] = 3;
  piece_move_order_scores_[ROOK] = 4;
  piece_move_order_scores_[QUEEN] = 5;
  piece_move_order_scores_[KING] = 0;

  king_attacker_values_[PAWN] = 20;
  king_attacker_values_[KNIGHT] = 30;
  king_attacker_values_[BISHOP] = 30;
  king_attacker_values_[ROOK] = 50;
  king_attacker_values_[QUEEN] = 200;
  king_attacker_values_[KING] = 0;

  if (options_.enable_transposition_table) {
    transposition_table_ = std::make_unique<TranspositionTable>(
        options_.transposition_table_size);
  }

  heuristic_mutexes_ = std::make_unique<std::mutex[]>(kHeuristicMutexes);
  continuation_history = new ContinuationHistory*[2];
  for (int i = 0; i < 2; i++) {
    continuation_history[i] = new ContinuationHistory[2];
  }
  ResetHistoryHeuristics();

  for (int row = 0; row < 14; row++) {
    for (int col = 0; col < 14; col++) {
      if (row <= 2 || row >= 11 || col <= 2 || col >= 11) {
        location_evaluations_[row][col] = 5;
      } else if (row <= 4 || row >= 9 || col <= 4 || col >= 9) {
        location_evaluations_[row][col] = 10;
      } else {
        location_evaluations_[row][col] = 15;
      }
    }
  }

  king_attack_weight_[0] = 0;
  king_attack_weight_[1] = 50;
  king_attack_weight_[2] = 100;
  king_attack_weight_[3] = 120;

  if (options_.enable_piece_square_table) {
    for (int cl = 0; cl < 4; cl++) {
      PlayerColor color = static_cast<PlayerColor>(cl);
      for (int pt = 0; pt < 6; pt++) {
        PieceType piece_type = static_cast<PieceType>(pt);
        bool is_piece = (piece_type == QUEEN || piece_type == ROOK
                         || piece_type == BISHOP || piece_type == KNIGHT);

        for (int row = 0; row < 14; row++) {
          for (int col = 0; col < 14; col++) {
            int table_value = 0;

            if (is_piece) {
              // preference for centrality
              float center_dist = std::sqrt((row - 6.5) * (row - 6.5)
                                          + (col - 6.5) * (col - 6.5));
              table_value -= (int)(10 * center_dist);

              // preference for pieces on opponent team's back-3 rank
              if (color == RED || color == YELLOW) {
                if (col < 3 || col >= 11) {
                  table_value += 10;
                }
              } else {
                if (row < 3 || row >= 11) {
                  table_value += 10;
                }
              }
            }

            piece_square_table_[color][piece_type][row][col] = table_value;
          }
        }
      }
    }
  }

  if (options_.enable_piece_activation) {
    piece_activation_threshold_[KING] = 999;
    piece_activation_threshold_[PAWN] = 999;
    piece_activation_threshold_[NO_PIECE] = 999;
    piece_activation_threshold_[QUEEN] = 5;
    piece_activation_threshold_[BISHOP] = 5;
    piece_activation_threshold_[KNIGHT] = 3;
    piece_activation_threshold_[ROOK] = 5;
  }

  if (options_.enable_knight_bonus) {
    std::memset(knight_to_king_, 0, 14*14*14*14 * sizeof(bool) / sizeof(char));
    for (int row = 0; row < 14; ++row) {
      for (int col = 0; col < 14; ++col) {
        // first move
        for (int dr : {-2, -1, 1, 2}) {
          int r1 = row + dr;
          if (r1 < 0 || r1 > 13) {
            continue;
          }
          int abs_dc = std::abs(dr) == 1 ? 2 : 1;
          for (int dc : {-abs_dc, abs_dc}) {
            int c1 = col + dc;
            if (c1 < 0 || c1 > 13) {
              continue;
            }

            // second move
            for (int dr2 : {-2, -1, 1, 2}) {
              int r2 = r1 + dr2;
              if (r2 < 0 || r2 > 13) {
                continue;
              }
              int abs_dc2 = std::abs(dr2) == 1 ? 2 : 1;
              for (int dc2 : {-abs_dc2, abs_dc2}) {
                int c2 = c1 + dc2;
                if (c2 < 0 || c2 > 13) {
                  continue;
                }
                knight_to_king_[row][col][r2][c2] = true;
              }
            }
          }
        }
      }
    }
  }
}

AlphaBetaPlayer::~AlphaBetaPlayer() {
    for (int i = 0; i < 2; i++) {
        delete[] continuation_history[i];
    }
    delete[] continuation_history;
}

ThreadState::ThreadState(
    PlayerOptions options, const Board& board, const PVInfo& pv_info)
  : options_(options), root_board_(board), pv_info_(pv_info) {
  move_buffer_ = new Move[kBufferPartitionSize * kBufferNumPartitions];
}

ThreadState::~ThreadState() {
  delete[] move_buffer_;
}

Move* ThreadState::GetNextMoveBufferPartition() {
  if (buffer_id_ >= kBufferNumPartitions) {
    std::cout << "ThreadState move buffer overflow" << std::endl;
    abort();
  }
  return &move_buffer_[buffer_id_++ * kBufferPartitionSize];
}

void ThreadState::ReleaseMoveBufferPartition() {
  assert(buffer_id_ > 0);
  buffer_id_--;
}

int AlphaBetaPlayer::GetNumLegalMoves(Board& board) {
  constexpr int kLimit = 300;
  Move moves[kLimit];
  Player player = board.GetTurn();
  auto result = board.GetPseudoLegalMoves2(moves, kLimit);
  size_t num_moves = result.count;
  int n_legal = 0;
  for (size_t i = 0; i < num_moves; i++) {
    const auto& move = moves[i];
    board.MakeMove(move);
    if (!board.IsKingInCheck(player)) { // invalid move
      n_legal++;
    }
    board.UndoMove();
  }

  return n_legal;
}

// Alpha-beta search with nega-max framework.
// https://www.chessprogramming.org/Alpha-Beta
// Returns (nega-max value, best move) pair.
// The best move is nullopt if the game is over.
// If the function returns std::nullopt, then it hit the deadline
// before finishing search and the results should not be used.
std::optional<std::tuple<int, std::optional<Move>>> AlphaBetaPlayer::Search(
    Stack* ss,
    NodeType node_type,
    ThreadState& thread_state,
    Board& board,
    int ply,
    int depth,
    int alpha,
    int beta,
    bool maximizing_player,
    int expanded,
    const std::optional<
        std::chrono::time_point<std::chrono::system_clock>>& deadline,
    PVInfo& pvinfo,
    int null_moves,
    bool is_cut_node) {
  auto startA = std::chrono::high_resolution_clock::now();

  if (canceled_
      || (deadline.has_value()
        && std::chrono::system_clock::now() >= *deadline)) {
    return std::nullopt;
  }
  num_nodes_++;
  if (
    depth <= 0
    && ply > 1
  ) {
    int eval = Evaluate(thread_state, board, maximizing_player, alpha, beta);
    return std::make_tuple(eval, std::nullopt);
  }

  bool is_root_node = ply == 1;
  bool is_pv_node = node_type != NonPV;
  bool is_tt_pv = false;

  std::optional<Move> tt_move;
  const HashTableEntry* tte = nullptr;
  bool tt_hit = false;

  int64_t key = board.HashKey();

  tte = transposition_table_->Get(key);
  if (tte != nullptr) {
    if (tte->key == key) { // valid entry
      tt_hit = true;
      if (tte->depth >= depth) {
        num_cache_hits_++;
        // at non-PV nodes check for an early TT cutoff
        if (!is_root_node
            && !is_pv_node
            && (tte->bound == EXACT
              || (tte->bound == LOWER_BOUND && tte->score >= beta)
              || (tte->bound == UPPER_BOUND && tte->score <= alpha))
            ) {

          if (tte->move.Present()) {
              return std::make_tuple(
                  std::min(beta, std::max(alpha, tte->score)), tte->move);
          }
          return std::make_tuple(
              std::min(beta, std::max(alpha, tte->score)), std::nullopt);
        }
      }
      if (tte->move.Present()) {
        tt_move = tte->move;
      }
      is_tt_pv = tte->is_pv;
    }
  }

  if (IsKnownCheckmate(key)) {
    return std::make_tuple(kMateValue, std::nullopt);
  }


  Player player = board.GetTurn();

  (ss+2)->killers[0] = (ss+2)->killers[1] = Move();
  ss->move_count = 0;
  if (ply == 1) {
    ss->root_depth = depth;
  }
  bool in_check = board.IsKingInCheck(player);
  ss->in_check = in_check;

  std::optional<Move> best_move;

  std::optional<Move> pv_move = pvinfo.GetBestMove();
  Move* moves = thread_state.GetNextMoveBufferPartition();
  
  Board::MoveGenResult result;
  bool is_next_king_capture = false;
  bool is_prev_king_capture = false;
  
  bool has_legal_moves = false;
  result.count = 0;
  result = board.GetNextKingCaptureMoves(
    moves,
    kBufferPartitionSize,
    pv_move.has_value() ? pv_move : tt_move);
  thread_state.TotalMoves()[player.GetColor()] = 100;
  thread_state.n_threats[player.GetColor()] = 10;

  if (result.count > 0) {
    is_next_king_capture = true;
  } else {
    result = board.GetPrevKingCaptureMoves(
      moves,
      kBufferPartitionSize,
      pv_move.has_value() ? pv_move : tt_move);
    thread_state.TotalMoves()[player.GetColor()] = 100;
    thread_state.n_threats[player.GetColor()] = 10;
    if (result.count > 0) {
      is_prev_king_capture = true;
    }
  }

  if (is_next_king_capture || is_prev_king_capture) {
    // TODO: What if the teammate's king is captured by the next player?
    alpha = beta; // fail hard
    //value = kMateValue;
    best_move = moves[0];
    pvinfo.SetBestMove(*best_move);
    return std::make_tuple(kMateValue, best_move);
  }

  if (!is_next_king_capture && !is_prev_king_capture) {
    // illigal moves:
    // move pinned piece
    result = board.GetPseudoLegalMoves2(
      moves,
      kBufferPartitionSize,
      pv_move.has_value() ? pv_move : tt_move);
    thread_state.TotalMoves()[player.GetColor()] = result.mobility_counts[player.GetColor()];
    thread_state.n_threats[player.GetColor()] = result.threat_counts[player.GetColor()];
  }

  int eval = 0;
  if (tt_hit && tte->eval != value_none_tt) {
    eval = tte->eval;
  } else {
    eval = Evaluate(thread_state, board, maximizing_player, alpha, beta);
  } 
  (ss+1)->root_depth = ss->root_depth;
  ss->static_eval = eval;
  
  // Then initialize the move picker with the generated moves
  MovePicker2 picker;
  const Move* pv_ptr = (result.pv_index >= 0) ? &moves[result.pv_index] : nullptr;
  
  // Initialize move picker parameters
  size_t move_count2 = result.count;
  const Move* killer1 = &ss->killers[0];
  const Move* killer2 = &ss->killers[1];
  const PieceToHistory* cont_hist[] = {
    (ss - 1)->continuation_history,
    (ss - 2)->continuation_history,
    (ss - 3)->continuation_history,
    (ss - 4)->continuation_history,
    (ss - 5)->continuation_history,
  };
  
  InitMovePicker2(&picker, 
               &board,
               moves, 
               move_count2,
               pv_ptr,
               killer1,
               killer2,
               cont_hist,
               history_heuristic);
  

  int move_count = 0;
  int invalid_moves = 0;
  bool fail_low = true;
  bool fail_high = false;
  std::vector<Move> searched_moves;

  auto endA = std::chrono::high_resolution_clock::now();
  auto durationA = std::chrono::duration_cast<std::chrono::nanoseconds>(endA - startA);
  total_timeA += durationA;
  call_countA++;
  if (call_countA % 400000 == 0) {
    auto avg_ns = total_timeA.count() / call_countA;
    auto current_avg = durationA.count() / 1;  // Current call's time in ns

    //std::cout << "[Search - before move]"
    //          << "Average: " << avg_ns << " ns, "
    //          << "Call count: " << call_countA << std::endl;
  }
  while (true) {
    const Move* move_ptr = GetNextMove2(&picker);
    auto startA2 = std::chrono::high_resolution_clock::now();

    if (move_ptr == nullptr) break;

    const Move& move = *move_ptr;

    if (UNLIKELY(ss->excludedMove.Present() && move == ss->excludedMove)) {
      continue;
    }

    //const auto& from = move.From();
    const auto& to = move.To();
    //Piece piece = board.GetPiece(from);
    //PieceType piece_type = piece.GetPieceType();
    //bool is_capture = move.IsCapture();
    
    std::optional<std::tuple<int, std::optional<Move>>> value_and_move_or;

    board.MakeMove(move);

    /*
    if (board.CheckWasLastMoveKingCapture() != IN_PROGRESS) {
      board.UndoMove();

      alpha = beta; // fail hard
      //value = kMateValue;
      best_move = move;
      pvinfo.SetBestMove(move);
      break;
    }
    */

    if (board.IsKingInCheck(player)) { // invalid move
      board.UndoMove();

      continue;
    }

    has_legal_moves = true;

    ss->current_move = move;
    //ss->continuation_history = &continuation_history[in_check][is_capture][piece_type][to.GetRow()][to.GetCol()];
    static PieceToHistory dummy_history = {};
    ss->continuation_history = &dummy_history;
    ss->move_count = move_count++;

    bool is_pv_move = pv_move.has_value() && *pv_move == move;

    std::shared_ptr<PVInfo> child_pvinfo;
    if (is_pv_move && pvinfo.GetChild() != nullptr) {
      child_pvinfo = pvinfo.GetChild();
    } else {
      child_pvinfo = std::make_shared<PVInfo>();
    }

    int r = 1; 
    
    if (move_count >= 4) { r++; }
    if (move_count >= 8) { r++; }

    r += is_cut_node;

    auto endA2 = std::chrono::high_resolution_clock::now();
    auto durationA2 = std::chrono::duration_cast<std::chrono::nanoseconds>(endA2 - startA2);
    total_timeA2 += durationA2;
    call_countA2++;
    if (call_countA2 % 400000 == 0) {
      auto avg_ns = total_timeA2.count() / call_countA2;
      auto current_avg = durationA2.count() / 1;  // Current call's time in ns

      //std::cout << "[Move - before recursion]"
      //          << "Average: " << avg_ns << " ns, "
      //          << "Call count: " << call_countA2 << std::endl
      //          << "Singular searches: " << GetNumSingularExtensionSearches() << std::endl
      //          << "Singular hits: " << GetNumSingularExtensions()
      //          << std::endl;
    }

    // Singular extension search
    if (!is_root_node
        && move_count >= 1
        && tt_move.has_value() && move == *tt_move
        && !ss->excludedMove.Present()
        && depth >= 8 // Only for reasonably deep searches
        && tte != nullptr && tte->score != value_none_tt && std::abs(tte->score) < kMateValue
        && tte->bound == LOWER_BOUND // The TT move was a fail-high
        && tte->depth >= depth - 3
        )
    {
      num_singular_extension_searches_.fetch_add(1, std::memory_order_relaxed);
      
      // Search again, but excluding the strong TT move.
      // The beta for this search is based on the TT score, with a margin.
      //int singular_beta = tte->score - (58 + 76 * (ss->tt_pv && node_type == NonPV)) * depth / 57;
      //int singular_beta = tte->score - (150 * (ss->tt_pv && node_type == NonPV)) - 200;
      int singular_beta = tte->score - 50;
      int singular_depth = depth - 1 - (depth/2) - (depth/4);

      ss->excludedMove = move; // Exclude the current move for the sub-search

      PVInfo singular_pvinfo;
      auto singular_res = Search(ss, NonPV, thread_state, board, ply, singular_depth,
                                 singular_beta - 1, singular_beta,
                                 maximizing_player, expanded, deadline, singular_pvinfo, null_moves, !is_cut_node);
      
      ss->excludedMove = Move(); // Reset for the main search

      if (singular_res.has_value()) {
        int singular_score = std::get<0>(*singular_res);
        // If the search without the TT move fails low, the move is singular.
        // we didn't find a better move
        if (singular_score < singular_beta) {
          num_singular_extensions_.fetch_add(1, std::memory_order_relaxed);
          r = 0; // no reduction
        }
      }
    }

    if (depth <= 1
        && ply >= 4
        //&& is_capture
        && (
         //(ss-1)->current_move.IsCapture() && (ss-1)->current_move.To() == to
         //|| (ss-3)->current_move.IsCapture() && (ss-3)->current_move.To() == to
         (ss-1)->current_move.To() == to
         || (ss-3)->current_move.To() == to
        )
    ) { r = -1; }

    // lmr
    if ((depth >= 5)
      && is_root_node
      && (move_count >= 2 + 2 * (depth > 5))) {
      // First search with reduced depth and null window
      value_and_move_or = Search(
          ss+1, NonPV, thread_state, board, ply + 1, depth - 1
          - (depth/2)
          - (depth/4)*(r > 0)
          - (depth/8)*(r > 1)
          - (depth/16)*(r > 2)
          + (r < 0),
          -alpha-1, -alpha, !maximizing_player, expanded,
          deadline, *child_pvinfo, 0, !is_cut_node);
          
      if (value_and_move_or.has_value()) {
        int score = -std::get<0>(*value_and_move_or);
        
        // If the reduced search fails high, we need to research
        if (score > alpha) {
          
          // If the score is not failing high by much, try a reduced-window search first
          if (score < alpha + 150) {
            value_and_move_or = Search(
                ss+1, NonPV, thread_state, board, ply + 1, depth - 1
                - (depth/2)*(r > 0)
                - (depth/4)*(r > 1)
                - (depth/8)*(r > 2)
                + (r < 0) ,
                -alpha-50, -alpha, !maximizing_player, expanded,
                deadline, *child_pvinfo, 0, true);
                
            if (value_and_move_or && -std::get<0>(*value_and_move_or) > alpha) {
              // If the reduced window search still fails high, do a full search
              value_and_move_or = Search(
                ss+1, NonPV, thread_state, board, ply + 1, depth - 1
                - (depth/2)*(r > 0)
                - (depth/4)*(r > 1)
                - (depth/8)*(r > 2)
                + (r < 0),
                -beta, -alpha, !maximizing_player, expanded,
                deadline, *child_pvinfo, 0, !is_cut_node);
            }
          } else {
            // Failing high by a lot, do a full search immediately
            value_and_move_or = Search(
              ss+1, NonPV, thread_state, board, ply + 1, depth - 1
              - (depth/2)*(r > 0)
              - (depth/4)*(r > 1)
              - (depth/8)*(r > 2)
              + (r < 0),
              -beta, -alpha, !maximizing_player, expanded,
              deadline, *child_pvinfo, 0, !is_cut_node);
          }
        }
      }

    } else if (!is_pv_node || move_count > 1) {

      value_and_move_or = Search(
          ss+1, NonPV, thread_state, board, ply + 1, depth - 1
          - (depth/2)*(r > 0)*(depth>=2)
          - (depth/4)*(r > 1)*(depth>=3)
          - (depth/8)*(r > 2)*(depth>=4)
          + (r < 0),
          -alpha-1, -alpha, !maximizing_player, expanded,
          deadline, *child_pvinfo, 0, !is_cut_node);
    }

    // For PV nodes only, do a full PV search on the first move or after a fail
    // high (in the latter case search only if value < beta), otherwise let the
    // parent node fail low with value <= alpha and try another move.
    bool full_search =
      is_pv_node
      && (move_count == 1
          || (value_and_move_or.has_value()
              && -std::get<0>(*value_and_move_or) > alpha
              && (is_root_node
                  || -std::get<0>(*value_and_move_or) < beta)
              ));

    if (full_search) {
      
      value_and_move_or = Search(
          ss+1, PV, thread_state, board, ply + 1, depth - 1
          + (r < 0),
          -beta, -alpha, !maximizing_player, expanded,
          deadline, *child_pvinfo, 0, !is_cut_node);
    }
    auto startB = std::chrono::high_resolution_clock::now();

    board.UndoMove();

    if (!value_and_move_or.has_value()) {
      thread_state.ReleaseMoveBufferPartition();
      return std::nullopt; // timeout
    }
    int score = -std::get<0>(*value_and_move_or);
    searched_moves.push_back(move);

    if (score >= beta) {
      alpha = beta;
      best_move = move;
      pvinfo.SetChild(child_pvinfo);
      pvinfo.SetBestMove(move);
      fail_low = false;
      fail_high = true;
      is_cut_node = true;

      break; // cutoff
    }
    if (score > alpha) {
      fail_low = false;
      alpha = score;
      best_move = move;
      pvinfo.SetChild(child_pvinfo);
      pvinfo.SetBestMove(move);
    }

    if (!best_move.has_value()) {
      best_move = move;
      pvinfo.SetChild(child_pvinfo);
      pvinfo.SetBestMove(move);
    }
    auto endB = std::chrono::high_resolution_clock::now();
    auto durationB = std::chrono::duration_cast<std::chrono::nanoseconds>(endB - startB);
    total_timeB += durationB;
    call_countB++;
    // Track full searches and checkmate searches
    thread_local int64_t total_full_searches = 0;
    
    if (full_search) total_full_searches++;
    
    if (call_countB % 400000 == 0) {
      auto avg_ns = total_timeB.count() / call_countB;
      auto current_avg = durationB.count() / 1;  // Current call's time in ns

      //std::cout << "[Move - after recursion]"
      //          << " Average: " << avg_ns << " ns,"
      //          << " Calls: " << call_countB
      //          << ", Full searches: " << total_full_searches
      //          << std::endl;
    }
  }
  static std::atomic<int64_t> total_checkmates_found = 0;
  thread_local int checkmates_in_this_search = 0;
  auto startC = std::chrono::high_resolution_clock::now();

  if (!fail_low) {
    UpdateStats(ss, thread_state, board, *best_move, depth, fail_high,
                searched_moves);
  }

  int score = alpha;
  if (!has_legal_moves) {
    /*
    if (!in_check) {
      // stalemate
      score = std::min(beta, std::max(alpha, 0));
    } else {
      // checkmate
    */
      score = std::min(beta, std::max(alpha, -kMateValue));
      
      // Track unique checkmate positions
      Board checkmateboard = board;
      //Move last_move = board.GetLastMove();
      checkmateboard.UndoMove();
      int64_t hash_key = checkmateboard.HashKey();

      bool is_new_checkmate = false;
      
      // First try a read-only check with shared lock
      {
        std::shared_lock<std::shared_mutex> lock(checkmate_mutex_);
        is_new_checkmate = (checkmate_positions_.find(hash_key) == checkmate_positions_.end());
      }
      
      // If it's a new checkmate, take exclusive lock to update
      if (is_new_checkmate) {
        std::unique_lock<std::shared_mutex> lock(checkmate_mutex_);
        // Double-check in case another thread added it between our check and now
        checkmate_positions_.insert(hash_key).second;
      }
      checkmates_in_this_search++;  // Increment checkmate counter for this search
      total_checkmates_found++;     // Increment total checkmate counter
    /*
    }
    */
  }

  ScoreBound bound = beta <= alpha ? LOWER_BOUND : is_pv_node &&
    best_move.has_value() ? EXACT : UPPER_BOUND;
  transposition_table_->Save(board.HashKey(), depth, best_move, score, ss->static_eval, bound, is_pv_node);

  //if (best_move.has_value() && !best_move->IsCapture()) {
  if (best_move.has_value()) {
    if (ss->killers[0] != *best_move) {
      ss->killers[1] = ss->killers[0];
      ss->killers[0] = *best_move;
    }
  }

  // If no good move is found and the previous position was tt_pv, then the
  // previous opponent move is probably good and the new position is added to
  // the search tree.
  if (score <= alpha) {
    ss->tt_pv = ss->tt_pv || ((ss-1)->tt_pv && depth > 3);
  }

  ss->static_eval = score;

  thread_state.ReleaseMoveBufferPartition();
  auto endC = std::chrono::high_resolution_clock::now();
  auto durationC = std::chrono::duration_cast<std::chrono::nanoseconds>(endC - startC);
  total_timeC += durationC;
  call_countC++;
  if (call_countC % 400000 == 0) {
    auto avg_ns = total_timeB.count() / call_countC;
    auto current_avg = durationC.count() / 1;  // Current call's time in ns

    //std::cout << "[Search - after move]"
    //          << " Average: " << avg_ns << " ns,"
    //          << " Call count: " << call_countC
    //          << ", Checkmates (this search/total): " 
    //          << checkmates_in_this_search << "/" << total_checkmates_found << std::endl;
  }
  return std::make_tuple(score, best_move);
}


void AlphaBetaPlayer::UpdateStats(
    Stack* ss, ThreadState& thread_state, const Board& board,
    const Move& move, int depth, bool fail_high,
    const std::vector<Move>& searched_moves) {
  auto from = move.From();
  auto to = move.To();
  Piece piece = board.GetPiece(move.From());

  int bonus = 1 << (fail_high ? depth + 1: depth);

  size_t lock_key = (from.GetRow()*14 + from.GetCol())*196 + (to.GetRow()*14+to.GetCol());
  std::lock_guard<std::mutex> lock(heuristic_mutexes_[lock_key % kHeuristicMutexes]);
  history_heuristic[piece.GetPieceType()][from.GetRow()][from.GetCol()]
    [to.GetRow()][to.GetCol()] += bonus;
  UpdateContinuationHistories(ss, move, piece.GetPieceType(), bonus);
}

void AlphaBetaPlayer::UpdateContinuationHistories(Stack* ss, const Move& move, PieceType piece_type, int bonus) {
  const auto to = move.To();
  for (int i : {1, 2, 3, 4, 5, 6}) {
    // Only update the first 2 continuation histories if we are in check
    if (ss->in_check && i > 2) {
      break;
    }
    if ((ss-i)->current_move.Present()) {
      auto& entry = (*(ss-i)->continuation_history)[move.IsCapture()][piece_type];
      entry[to.GetRow() * 14 + to.GetCol()] << bonus;
    }
  }
}

namespace {

constexpr int kPieceImbalanceTable[16] = {
  0, -25, -50, -150, -300, -350, -400, -400,
  -400, -400, -400, -400, -400, -400, -400, -400,
};

int GetNumMajorPieces(const std::vector<PlacedPiece>& pieces) {
  int num_major = 0;
  for (const auto& placed_piece : pieces) {
    PieceType pt = placed_piece.GetPiece().GetPieceType();
    if (pt != PAWN && pt != KING) {
      num_major++;
    }
  }
  return num_major;
}

}  // namespace


int AlphaBetaPlayer::Evaluate(
    ThreadState& thread_state, Board& board, bool maximizing_player, int alpha, int beta) {

  int eval; // w.r.t. RY team
  GameResult game_result = board.CheckWasLastMoveKingCapture();
  if (game_result != IN_PROGRESS) { // game is over
    if (game_result == WIN_RY) {
      eval = kMateValue;
    } else if (game_result == WIN_BG) {
      eval = -kMateValue;
    } else {
      eval = 0; // stalemate
    }
  } else {
  auto start = std::chrono::high_resolution_clock::now();
    int pbase=0;
    int pevalM=0;
    int pevalT=0;
    int peval3=0;

    // Piece evaluation
    eval = board.PieceEvaluation();
    auto lazy_skip = [&](int margin) {
      int re = maximizing_player ? eval : -eval; // returned eval
      return re + margin <= alpha || re >= beta + margin;
    };
    constexpr int kMargin = 600;
    if (lazy_skip(kMargin)) {
      return maximizing_player ? eval : -eval;
    }
    const PlayerColor current_color = board.GetTurn().GetColor();

    pbase = eval;

    int total_threats[4];
    int total_moves[4];
    std::memcpy(total_threats, thread_state.n_threats, sizeof(total_threats));
    std::memcpy(total_moves, thread_state.TotalMoves(), sizeof(total_moves));

    if (board.NumMoves() == 0) {
      std::memset(total_threats, 0, sizeof(total_threats));
      std::memset(total_moves, 0, sizeof(total_moves));
      return eval = 0;
    }

    if (current_color == 0 || current_color == 2) {
      int64_t num = 
        (static_cast<int64_t>(total_moves[RED]-1) * (total_moves[RED]-1) * (total_moves[RED]-1) * (total_moves[RED]-1) *
        static_cast<int64_t>(total_moves[YELLOW]-1) * (total_moves[YELLOW]-1) * (total_moves[YELLOW]-1) * (total_moves[YELLOW]-1))
        - (static_cast<int64_t>(total_moves[BLUE]-1) * (total_moves[BLUE]-1) * (total_moves[BLUE]-1) * (total_moves[BLUE]-1) *
        static_cast<int64_t>(total_moves[GREEN]-1) * (total_moves[GREEN]-1) * (total_moves[GREEN]-1) * (total_moves[GREEN]-1)); 
      int sign = (num >= 0) ? 1 : -1;
      num = num < 0 ? -num : num;  // handle negative numbers
      int length = 0;
      // Handle 32-bit chunks first
      if (num > 0xFFFFFFFF) {
          length = 32;
          num >>= 32;
      }
      // Then handle remaining bits
      int shift = (num > 0xFFFF) << 4; num >>= shift; length |= shift;
      shift = (num > 0xFF) << 3; num >>= shift; length |= shift;
      shift = (num > 0xF) << 2; num >>= shift; length |= shift;
      shift = (num > 0x3) << 1; num >>= shift; length |= shift;
      length |= (num >> 1);
      const int moves_eval = sign * std::clamp(5*(length-25), 10, 1000);

      num = (static_cast<int64_t>(total_threats[RED]+1) * (total_threats[YELLOW]+1) * (total_threats[RED]+1) * (total_threats[YELLOW]+1))
        - (static_cast<int64_t>(total_threats[BLUE]+1) * (total_threats[GREEN]+1) * (total_threats[BLUE]+1) * (total_threats[GREEN]+1));
      sign = (num >= 0) ? 1 : -1;
      num = num < 0 ? -num : num;  // handle negative numbers
      length = 0;
      // Handle 32-bit chunks first
      if (num > 0xFFFFFFFF) {
          length = 32;
          num >>= 32;
      }
      // Then handle remaining bits
      shift = (num > 0xFFFF) << 4; num >>= shift; length |= shift;
      shift = (num > 0xFF) << 3; num >>= shift; length |= shift;
      shift = (num > 0xF) << 2; num >>= shift; length |= shift;
      shift = (num > 0x3) << 1; num >>= shift; length |= shift;
      length |= (num >> 1);
      const int threat_eval = 8 * sign * std::clamp((length-17), 1, 1000);

      pevalM=moves_eval;
      pevalT=std::clamp(threat_eval, -50, 500);
      
      eval += (moves_eval + std::clamp(threat_eval, -50, 500));

    } else {
      int64_t num = 
        (static_cast<int64_t>(total_moves[BLUE]-1) * (total_moves[BLUE]-1) * (total_moves[BLUE]-1) * (total_moves[BLUE]-1) *
        static_cast<int64_t>(total_moves[GREEN]-1) * (total_moves[GREEN]-1) * (total_moves[GREEN]-1) * (total_moves[GREEN]-1))
        - (static_cast<int64_t>(total_moves[RED]-1) * (total_moves[RED]-1) * (total_moves[RED]-1) * (total_moves[RED]-1) *
        static_cast<int64_t>(total_moves[YELLOW]-1) * (total_moves[YELLOW]-1) * (total_moves[YELLOW]-1) * (total_moves[YELLOW]-1));
      int sign = (num >= 0) ? 1 : -1;
      num = num < 0 ? -num : num;  // handle negative numbers
      int length = 0;
      // Handle 32-bit chunks first
      if (num > 0xFFFFFFFF) {
          length = 32;
          num >>= 32;
      }
      // Then handle remaining bits
      int shift = (num > 0xFFFF) << 4; num >>= shift; length |= shift;
      shift = (num > 0xFF) << 3; num >>= shift; length |= shift;
      shift = (num > 0xF) << 2; num >>= shift; length |= shift;
      shift = (num > 0x3) << 1; num >>= shift; length |= shift;
      length |= (num >> 1);
      const int moves_eval = sign * std::clamp((5*(length-25)), 10, 1000);

      num = (static_cast<int64_t>(total_threats[BLUE]+1) * (total_threats[GREEN]+1) * (total_threats[BLUE]+1) * (total_threats[GREEN]+1))
        - (static_cast<int64_t>(total_threats[RED]+1) * (total_threats[YELLOW]+1) * (total_threats[RED]+1) * (total_threats[YELLOW]+1));
      sign = (num >= 0) ? 1 : -1;
      num = num < 0 ? -num : num;  // handle negative numbers
      length = 0;
      // Handle 32-bit chunks first
      if (num > 0xFFFFFFFF) {
          length = 32;
          num >>= 32;
      }
      // Then handle remaining bits
      shift = (num > 0xFFFF) << 4; num >>= shift; length |= shift;
      shift = (num > 0xFF) << 3; num >>= shift; length |= shift;
      shift = (num > 0xF) << 2; num >>= shift; length |= shift;
      shift = (num > 0x3) << 1; num >>= shift; length |= shift;
      length |= (num >> 1);
      const int threat_eval = 8 * sign * std::clamp((length-17), 1, 1000);
      
      pevalM=moves_eval;
      pevalT=std::clamp(threat_eval, -50, 500);

      eval += (moves_eval + std::clamp(threat_eval, -50, 500));

    }

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::nanoseconds>(end - start);
    total_time += duration;
    call_count++;
    if (call_count % 400000 == 0) {
      auto avg_ns = total_time.count() / call_count;
      auto current_avg = duration.count() / 1;  // Current call's time in ns

      //std::cout << "[Evaluation]" << " color: " << current_color << std::endl
      //<< "M: " << total_moves[RED] << " "
      //<< total_moves[BLUE] << " " 
      //<< total_moves[YELLOW] << " " 
      //<< total_moves[GREEN] << std::endl
      //<< pevalM << std::endl
      //<< "T: "
      //<< total_threats[RED] << " "
      //<< total_threats[BLUE] << " "
      //<< total_threats[YELLOW] << " "
      //<< total_threats[GREEN] << std::endl
      //<< pevalT << std::endl
      //<< "material: " << pbase << std::endl
      //<< "final: " << eval << std::endl
      //<< "Average: " << avg_ns << " ns, " << "Call count: " << call_count << std::endl;
    }

  }
  // w.r.t. maximizing team
  return maximizing_player ? eval : -eval;
}

  void AlphaBetaPlayer::ResetHistoryHeuristics() {
  std::memset(history_heuristic, 0, sizeof(history_heuristic));

  for (bool in_check : {false, true}) {
    for (StatsType c : {NoCaptures, Captures}) {
      for (auto& to_row : continuation_history[in_check][c]) {
        for (auto& to_col : to_row) {
          for (auto& h : to_col) {
            h->fill(0);
          }
        }
      }
    }
  }
}

void AlphaBetaPlayer::AgeHistoryHeuristics() {
  // Age quiet move history heuristic by dividing all scores by 2
  for (int pt = 0; pt < 6; ++pt) {
    for (int r1 = 0; r1 < 14; ++r1) {
      for (int c1 = 0; c1 < 14; ++c1) {
        for (int r2 = 0; r2 < 14; ++r2) {
          for (int c2 = 0; c2 < 14; ++c2) {
            history_heuristic[pt][r1][c1][r2][c2] >>= 1;
          }
        }
      }
    }
  }

  // Age continuation histories by iterating down to the final integer tables.
  for (int in_check = 0; in_check < 2; ++in_check) {
    for (int is_capture = 0; is_capture < 2; ++is_capture) {
      auto& cont_hist_table = continuation_history[in_check][is_capture];

      for (auto& piece_hist : cont_hist_table) { // Iterates over piece_type (7 elements)
        for (auto& to_row_hist : piece_hist) { // Iterates over to_row (14 elements)
          for (auto& to_col_hist : to_row_hist) { // Iterates over to_col (14 elements)
            // The to_col_hist here is a StatsEntry<PieceToHistory, NOT_USED>
            PieceToHistory* h = &to_col_hist; // Get the pointer to the underlying PieceToHistory object

            // Age the PieceToHistory table this pointer points to.
            if (h != nullptr) {
                using entry_t = StatsEntry<int32_t, 2147483647>;
                entry_t* p_start = reinterpret_cast<entry_t*>(h); // Reinterpret as a flat array of StatsEntry<int32_t, ...>
                constexpr size_t num_entries = sizeof(PieceToHistory) / sizeof(entry_t); // Calculate how many int32_t values are in PieceToHistory

                for (size_t i = 0; i < num_entries; ++i) {
                    p_start[i] = static_cast<int32_t>(p_start[i]) >> 1; // Divide by 2
                }
            }
          }
        }
      }
    }
  }
}

void AlphaBetaPlayer::ResetMobilityScores(ThreadState& thread_state, Board& board) {
  // reset pseudo-mobility scores
  for (int i = 0; i < 4; i++) {
    Player player(static_cast<PlayerColor>(i));
    UpdateMobilityEvaluation(thread_state, board, player);
  }
}

int AlphaBetaPlayer::StaticEvaluation(Board& board) {
  auto pv_copy = pv_info_.Copy();
  ThreadState thread_state(options_, board, *pv_copy);
  ResetMobilityScores(thread_state, board);
  return Evaluate(thread_state, board, true, -kMateValue, kMateValue);
}

std::optional<std::tuple<int, std::optional<Move>, int>>
AlphaBetaPlayer::MakeMove(
    Board& board,
    std::optional<std::chrono::milliseconds> time_limit,
    int max_depth) {
  root_team_ = board.GetTurn().GetTeam();
  int64_t hash_key = board.HashKey();
  if (hash_key != last_board_key_) {
    average_root_eval_ = 0;
    asp_nobs_ = 0;
    asp_sum_ = 0;
    asp_sum_sq_ = 0;
  }
  last_board_key_ = hash_key;

  SetCanceled(false);
  // Use Alpha-Beta search with iterative deepening
  std::optional<std::chrono::time_point<std::chrono::system_clock>> deadline;
  auto start = std::chrono::system_clock::now();
  if (time_limit.has_value()) {
    deadline = start + *time_limit;
  }

  if (options_.max_search_depth.has_value()) {
    max_depth = std::min(max_depth, *options_.max_search_depth);
  }

  // ResetHistoryHeuristics();
  AgeHistoryHeuristics();

  int num_threads = 1;
  if (options_.enable_multithreading) {
    num_threads = options_.num_threads;
  }
  assert(num_threads >= 1);
  std::vector<ThreadState> thread_states;
  thread_states.reserve(num_threads);
  for (int i = 0; i < num_threads; i++) {
    auto pv_copy = pv_info_.Copy();
    thread_states.emplace_back(options_, board, *pv_copy);
    auto& thread_state = thread_states.back();
    ResetMobilityScores(thread_state, board);
  }

  std::vector<std::unique_ptr<std::thread>> threads;
  for (size_t i = 1; i < num_threads; i++) {
    threads.push_back(std::make_unique<std::thread>([
      this, i, &thread_states, deadline, max_depth] {
      MakeMoveSingleThread(i, thread_states[i], deadline,
          max_depth);
    }));
  }

  auto res = MakeMoveSingleThread(0, thread_states[0], deadline, max_depth);

  SetCanceled(true);
  for (auto& thread : threads) {
    thread->join();
  }

  if (res.has_value()) {
      pv_info_ = thread_states[0].GetPVInfo();
  }

  SetCanceled(false);
  return res;
}

std::optional<std::tuple<int, std::optional<Move>, int>>
AlphaBetaPlayer::MakeMoveSingleThread(
    size_t thread_id,
    ThreadState& thread_state,
    std::optional<std::chrono::time_point<std::chrono::system_clock>> deadline,
    int max_depth) {
  Board board = thread_state.GetRootBoard();
  PVInfo& pv_info = thread_state.GetPVInfo();

  int next_depth = std::min(1 + pv_info.GetDepth(), max_depth);
  std::optional<std::tuple<int, std::optional<Move>>> res;
  int alpha = -kMateValue;
  int beta = kMateValue;
  bool maximizing_player = board.TeamToPlay() == RED_YELLOW;
  int searched_depth = 0;
  Stack stack[kMaxPly + 10];
  Stack* ss = stack + 7;
  for (int i = 7; i > 0; i--) {
    (ss-i)->continuation_history = &continuation_history[0][0][NO_PIECE][0][0];
  }

  if (options_.enable_aspiration_window) {

    while (next_depth <= max_depth) {
      std::optional<std::tuple<int, std::optional<Move>>> move_and_value;

      if (thread_id == 0) {
          int prev = average_root_eval_;
          int delta = 50;
          if (asp_nobs_ > 0) {
            delta = 50 + std::sqrt((asp_sum_sq_ - asp_sum_*asp_sum_/asp_nobs_)/asp_nobs_);
          }

          alpha = std::max(prev - delta, -kMateValue);
          beta = std::min(prev + delta, kMateValue);
          int fail_cnt = 0;

          while (true) {
            move_and_value = Search(
                ss, Root, thread_state, board, 1, next_depth, alpha, beta, maximizing_player,
                0, deadline, pv_info);
            if (!move_and_value.has_value()) { // Hit deadline
              break;
            }
            int evaluation = std::get<0>(*move_and_value);
            if (asp_nobs_ == 0) {
              average_root_eval_ = evaluation;
            } else {
              average_root_eval_ = (2 * evaluation + average_root_eval_) / 3;
            }
            asp_nobs_++;
            asp_sum_ += evaluation;
            asp_sum_sq_ += evaluation * evaluation;

            if (std::abs(evaluation) == kMateValue) {
              break;
            }

            if (evaluation <= alpha) {
              beta = (alpha + beta) / 2;
              alpha = std::max(evaluation - delta, -kMateValue);
              ++fail_cnt;
            } else if (evaluation >= beta) {
              beta = std::min(evaluation + delta, kMateValue);
              ++fail_cnt;
            } else {
              break;
            }

            if (fail_cnt >= 5) {
              alpha = -kMateValue;
              beta = kMateValue;
            }

            delta += delta / 3;
          }
      } else {
          // Helper threads use a full window
          move_and_value = Search(
            ss, Root, thread_state, board, 1, next_depth, -kMateValue, kMateValue, maximizing_player,
            0, deadline, pv_info);
      }

      if (!move_and_value.has_value()) { // Hit deadline
        break;
      }
      res = move_and_value;
      searched_depth = next_depth;
      next_depth++;
      int evaluation = std::get<0>(*move_and_value);
      if (std::abs(evaluation) == kMateValue) {
        break;  // Proven win/loss
      }
    }

  } else {

    while (next_depth <= max_depth) {
      std::optional<std::tuple<int, std::optional<Move>>> move_and_value;

      move_and_value = Search(
          ss, Root, thread_state, board, 1, next_depth, alpha, beta, maximizing_player,
          0, deadline, pv_info);

      if (!move_and_value.has_value()) { // Hit deadline
        break;
      }
      res = move_and_value;
      searched_depth = next_depth;
      next_depth++;
      int evaluation = std::get<0>(*move_and_value);
      if (std::abs(evaluation) == kMateValue) {
        break;  // Proven win/loss
      }
    }

  }

  if (res.has_value()) {
    int eval = std::get<0>(*res);
    if (!maximizing_player) {
      eval = -eval;
    }
    return std::make_tuple(eval, std::get<1>(*res), searched_depth);
  }

  return std::nullopt;
}

int PVInfo::GetDepth() const {
  if (best_move_.has_value()) {
    if (child_ == nullptr) {
      return 1;
    }
    return 1 + child_->GetDepth();
  }
  return 0;
}

void AlphaBetaPlayer::UpdateMobilityEvaluation(
    ThreadState& thread_state, Board& board, Player player) {
    
    /*
    // Get move and threat counts for all players in one go
    auto result = board.GetPseudoLegalMoves2(nullptr, 0);
    
    // Update thread state for all players
    for (int i = 0; i < 4; i++) {
        thread_state.TotalMoves()[i] = result.mobility_counts[i];
        thread_state.n_threats[i] = result.threat_counts[i];
    }
    */
    thread_state.TotalMoves()[player.GetColor()] = 1;
    thread_state.n_threats[player.GetColor()] = 1;
}

std::shared_ptr<PVInfo> PVInfo::Copy() const {
  std::shared_ptr<PVInfo> copy = std::make_shared<PVInfo>();
  if (best_move_.has_value()) {
    copy->SetBestMove(*best_move_);
  }
  std::shared_ptr<PVInfo> child = child_;
  if (child != nullptr) {
    child = child->Copy();
  }
  copy->SetChild(child);
  return copy;
}

}  // namespace chess
