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
#include <ctime>

#include "board.h"
#include "player.h"
#include "transposition_table.h"
#include "move_picker2.h"

// Macro to avoid function call overhead for leaf nodes (90% of calls)
// Computes new_depth, checks if <= 0, and either returns eval or calls Search
#define SEARCH_OR_EVAL(result, new_depth_var, ...) \
    do { \
        if ((new_depth_var) <= 0) { \
            result = std::make_tuple(-(ss->static_eval), std::nullopt); \
        } else { \
            result = Search(__VA_ARGS__); \
        } \
    } while(0)

#define SEARCH_OR_EVAL_M(result, new_depth_var, ...) \
    do { \
        if ((new_depth_var) <= 0) { \
            result = std::make_tuple(-(ss->static_eval), std::nullopt); \
        } else { \
            result = SearchM(__VA_ARGS__); \
        } \
    } while(0)

namespace chess {

namespace {
std::string GetPVStrFromPVInfo(const PVInfo& pv_info) {
  std::string pv;
  const PVInfo* current = &pv_info;
  while (current != nullptr) {
    auto best_move = current->GetBestMove();
    if (best_move.has_value()) {
      if (!pv.empty()) {
        pv += " ";
      }
      pv += best_move->PrettyStr();
    }
    current = current->GetChild().get();
  }
  return pv;
}
}  // namespace

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

  /*
  // Initialize checkmate discovery mode
  if (options_.checkmate_discovery_mode) {
    checkmate_file_ = std::make_unique<std::ofstream>(options_.checkmate_output_file);
    if (!checkmate_file_->is_open()) {
      std::cerr << "Warning: Could not open checkmate output file: "
                << options_.checkmate_output_file << std::endl;
      checkmate_file_.reset();
    }
  }
  */
}

AlphaBetaPlayer::~AlphaBetaPlayer() {
}

ThreadState::ThreadState(
    PlayerOptions options, const Board& board, const PVInfo& pv_info)
  : options_(options), root_board_(&board), pv_info_(pv_info) {
  move_buffer_ = new Move[kBufferPartitionSize * kBufferNumPartitions];
  if (options_.transposition_table_size > 0) {
    transposition_table_ = std::make_unique<TranspositionTable>(options_.transposition_table_size);
  }
}

ThreadState::~ThreadState() {
  delete[] move_buffer_;
}

ThreadState::ThreadState(ThreadState&& other) noexcept
  : options_(other.options_),
    root_board_(other.root_board_),
    pv_info_(std::move(other.pv_info_)),
    transposition_table_(std::move(other.transposition_table_)),
    move_buffer_(other.move_buffer_),
    buffer_id_(other.buffer_id_) {
  other.move_buffer_ = nullptr;
  other.buffer_id_ = 0;
  std::memcpy(total_moves_, other.total_moves_, sizeof(total_moves_));
  std::memcpy(n_threats, other.n_threats, sizeof(n_threats));
  std::memcpy(move_gen_buffer_, other.move_gen_buffer_, sizeof(move_gen_buffer_));
  std::memcpy(history_heuristic_, other.history_heuristic_, sizeof(history_heuristic_));
}

ThreadState& ThreadState::operator=(ThreadState&& other) noexcept {
  if (this != &other) {
    delete[] move_buffer_;
    options_ = other.options_;
    root_board_ = other.root_board_;
    pv_info_ = std::move(other.pv_info_);
    transposition_table_ = std::move(other.transposition_table_);
    move_buffer_ = other.move_buffer_;
    buffer_id_ = other.buffer_id_;
    other.move_buffer_ = nullptr;
    other.buffer_id_ = 0;
    std::memcpy(total_moves_, other.total_moves_, sizeof(total_moves_));
    std::memcpy(n_threats, other.n_threats, sizeof(n_threats));
    std::memcpy(move_gen_buffer_, other.move_gen_buffer_, sizeof(move_gen_buffer_));
    std::memcpy(history_heuristic_, other.history_heuristic_, sizeof(history_heuristic_));
  }
  return *this;
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

void ThreadState::SetTranspositionTable(std::unique_ptr<TranspositionTable> tt) {
  transposition_table_ = std::move(tt);
}

std::unique_ptr<TranspositionTable> ThreadState::ReleaseTranspositionTable() {
  return std::move(transposition_table_);
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
    PVInfo& pvinfo,
    bool is_cut_node) {


  num_nodes_++;
  if (canceled_.load(std::memory_order_acquire)) {
    return std::nullopt;
  }

  //auto startA = std::chrono::high_resolution_clock::now();

  Player player = board.GetTurn();
  PlayerColor player_color = player.GetColor();
  Team other_team = OtherTeam(player.GetTeam());

  bool is_root_node = ply == 1;
  bool is_pv_node = node_type != NonPV;

  //~60ns
  std::optional<Move> tt_move;
  const HashTableEntry* tte = nullptr;
  bool tt_hit = false;
  int64_t key = board.HashKey();
  auto* tt = thread_state.GetTranspositionTable();
  if (tt != nullptr) {
    tte = tt->Get(key);
  }
  if (tte != nullptr) {
    if (tte->key == key) { // valid entry
      tt_hit = true;
      if (tte->depth >= depth) {
        //num_cache_hits_++;
        // at non-PV nodes check for an early TT cutoff
        if (!is_root_node
            && !is_pv_node
            && (tte->bound == EXACT
              || (tte->bound == LOWER_BOUND && tte->score >= beta)
              || (tte->bound == UPPER_BOUND && tte->score <= alpha))
            ) {

          if (tte->packed_move != 0) {
              return std::make_tuple(
                  std::min(beta, std::max(alpha, tte->score)),
                  Move::Unpack(tte->packed_move, board));
          }
          return std::make_tuple(
            std::min(beta, std::max(alpha, tte->score)), std::nullopt);
        }
      }
      if (tte->packed_move != 0) {
        tt_move = Move::Unpack(tte->packed_move, board);
      }
    }
  }


  //// Check for king capture first
  auto capture_info = board.CanCaptureKing();
  if (capture_info.from_row != -1) {
    // king capture possible
    // capturing the king not always wins but it always ends the game

    auto eval = kMateValue;
    //std::cout << "king capture" << std::endl;
    eval = maximizing_player ? eval : -eval;

    const auto& target_piece = board.GetPiece(capture_info.to_row, capture_info.to_col);
    int8_t capture_raw = target_piece.GetRaw();
    Move move(capture_info.from_row, capture_info.from_col,
              capture_info.to_row, capture_info.to_col, capture_raw);

    if (tt != nullptr) {
      tt->Save(key, depth, move, eval, eval, EXACT, false /*is_pv_node*/);
    }
    //thread_state.ReleaseMoveBufferPartition();
    return std::make_tuple(eval, move);
  }

  //~20ns
  int eval = 0;
  if (tt_hit) {
    if (tte->bound == UPPER_BOUND) {
      eval = board.PieceEvaluation();
      eval = maximizing_player ? eval : -eval;
    } else {
      eval = tte->eval;
    }
  } else {
    eval = board.PieceEvaluation();
    
    static const uint8_t LOG2_MOVES[256] = {
        0, 0, 0, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3,
        4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
        5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
        5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
        6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
        6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
        6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
        6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
        7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
        7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
        7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
        7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
        7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
        7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
        7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
        7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7
    };

    static const uint8_t LOG2_THREATS[64] = {
        0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 4,
        4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5,
        5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
        5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5
    };

    static const int8_t THREAT_SCORE[64] = {
        -8, -8, -8, -8, -8, -8, -8, -8,
        -8, -8, -8, -8, -8, -8, -8, -8,
        -8, -8,
        8, 16, 24, 32, 40, 48, 56,
        -56, -48, -40, -32, -24, -16,
        -50, -50, -50, -50, -50, -50, -50, -50,
        -50, -50, -50, -50, -50, -50, -50, -50,
        -50, -50, -50, -50, -50, -50, -50, -50,
        -50, -50, -50, -50, -50, -50, -50, -50
    };

    int moves_eval;
    int threat_eval;

    int logR = LOG2_MOVES[thread_state.TotalMoves()[RED]];
    int logY = LOG2_MOVES[thread_state.TotalMoves()[YELLOW]];
    int logB = LOG2_MOVES[thread_state.TotalMoves()[BLUE]];
    int logG = LOG2_MOVES[thread_state.TotalMoves()[GREEN]];

    int logRY = (logR + logY) << 2;  // 4 * sum
    int logBG = (logB + logG) << 2;

    int lb, sign;
    if (logRY > logBG) {
      lb = logRY + 1;
      sign = (other_team != RED_YELLOW) ? 1 : -1;
    } else if (logBG > logRY) {
      lb = logBG + 1;
      sign = (other_team != RED_YELLOW) ? -1 : 1;
    } else {
      lb = logRY + 1;
      sign = 0;
    }
    moves_eval = sign * (lb < 27 ? 10 : 5 * (lb - 25));

    int logtR = LOG2_THREATS[thread_state.NThreats()[RED] & 63];
    int logtY = LOG2_THREATS[thread_state.NThreats()[YELLOW] & 63];
    int logtB = LOG2_THREATS[thread_state.NThreats()[BLUE] & 63];
    int logtG = LOG2_THREATS[thread_state.NThreats()[GREEN] & 63];

    int logtRY = (logtR + logtY) << 2;
    int logtBG = (logtB + logtG) << 2;

    int len_idx;
    int threat_sign;
    if (logtRY > logtBG) {
      len_idx = logtRY;
      threat_sign = (other_team != RED_YELLOW) ? 1 : -1;
    } else if (logtBG > logtRY) {
      len_idx = logtBG;
      threat_sign = (other_team != RED_YELLOW) ? -1 : 1;
    } else {
      len_idx = 0;
      threat_sign = 0;
    }

    len_idx = (len_idx < 0) ? 0 : (len_idx > 63 ? 63 : len_idx);
    threat_eval = threat_sign * THREAT_SCORE[len_idx];

    eval += moves_eval + threat_eval;

    eval = maximizing_player ? eval : -eval;
  } 
  ss->static_eval = eval;
  ss->move_count = 0;

  std::optional<Move> best_move;
  std::optional<Move> pv_move = pvinfo.GetBestMove();
  Move* moves = thread_state.GetNextMoveBufferPartition();

  // Generate moves with pieces
  const auto& pieces = board.GetPieceList()[board.GetTurn().GetColor()];
  auto result = board.GetPseudoLegalMoves2(
    moves,
    kBufferPartitionSize,
    pieces,
    pv_move);
  thread_state.TotalMoves()[player_color] = result.mobility_counts[player_color];
  thread_state.NThreats()[player_color] = result.threat_counts[player_color];
  //bool in_check = result.in_check;

  //~10ns
  // Then initialize the move picker with the generated moves
  MovePicker2 picker;
  const Move* pv_ptr = (result.pv_index >= 0) ? &moves[result.pv_index] : nullptr;
  size_t move_count2 = result.count;
  const Move* tt_ptr = nullptr;
  if (move_count2 > 0 && tt_move.has_value()) {
    tt_ptr = &(*tt_move);
  }

  //~10ns
  InitMovePicker2(
    &picker,
    &board,
    moves,
    move_count2,
    pv_ptr,
    tt_ptr,
    reinterpret_cast<int16_t(*)[224][224]>(thread_state.GetHistoryHeuristic()));

  //auto endA = std::chrono::high_resolution_clock::now();
  //auto durationA = std::chrono::duration_cast<std::chrono::nanoseconds>(endA - startA);
  //total_timeA += durationA;
  //call_countA++;
  //if (call_countA % 200000 == 0) {
  //  auto avg_ns = total_timeA.count() / call_countA;

  //  //std::cout << "--- [Search - before move]"
  //  //          << "Average: " << avg_ns << " ns, "
  //  //          << "Call count: " << call_countA << ", " 
  //  //          << "cache hits: " << num_cache_hits_
  //  //          << std::endl;
  //}
  
  bool has_legal_moves = false;
  int move_count = 0;
  int invalid_moves = 0;
  bool fail_low = true;
  bool fail_high = false;

  while (true) {
    const Move* move_ptr = GetNextMove2(&picker);
    if (move_ptr == nullptr) break;
    const Move& move = *move_ptr;
    auto startA2 = std::chrono::high_resolution_clock::now();

    std::optional<std::tuple<int, std::optional<Move>>> value_and_move_or;

    const int8_t old_king_row = board.GetKingRow(player_color);
    const int8_t old_king_col = board.GetKingCol(player_color);
    //~20ns
    board.MakeMove(move);

    const int8_t king_row = board.GetKingRow(player_color);
    const int8_t king_col = board.GetKingCol(player_color);
    if (king_row == old_king_row && king_col == old_king_col) {
      const int8_t from_row = move.FromRow();
      const int8_t from_col = move.FromCol();
      const int8_t row_diff = king_row - from_row;
      const int8_t col_diff = king_col - from_col;
      const bool aligned_with_king = 
        row_diff == 0 ||                     // same row
        col_diff == 0 ||                     // same column
        row_diff * row_diff == col_diff * col_diff;  // diagonal

      if (aligned_with_king) { // possible pinned or king move
        int8_t rd = (row_diff > 0) - (row_diff < 0);  // sign of row_diff: -1, 0, or 1
        int8_t cd = (col_diff > 0) - (col_diff < 0);   // sign of col_diff
        bool is_king_in_check = board.IsAttackedByTeamAligned(
          other_team, from_row, from_col,  // scan from piece location
          rd, cd
        );
        if (is_king_in_check) { // invalid move
          board.UndoMove();
          continue;
        }
      }
    } else { // king moved
        bool is_king_in_check = board.IsAttackedByTeam(
          other_team, king_row, king_col
        );
        if (is_king_in_check) { // invalid move
          board.UndoMove();
          continue;
        }
    }

    static std::atomic<int64_t> cm_skip_count{0};
    int64_t current_hash = board.HashKey();
    bool checkmate = IsKnownCheckmate(current_hash);
    if (checkmate) {
        /*
        // Checkmate discovery mode: export FEN to file
        if (options_.checkmate_discovery_mode
          && checkmate_file_
          && checkmate_file_->is_open()
        ) {
          std::string fen = board.ToFEN();
          bool is_new = false;
          
          // Check if this FEN has already been written
          {
            std::lock_guard<std::mutex> lock(discovered_fens_mutex_);
            is_new = discovered_fens_.insert(fen).second;
          }
          
          if (is_new) {
            std::lock_guard<std::mutex> file_lock(checkmate_file_mutex_);
            *checkmate_file_ << fen << std::endl;
            checkmate_file_->flush();

            int discovered = checkmates_discovered_.fetch_add(1) + 1;
            if (discovered >= options_.max_checkmates_to_discover) {
              canceled_ = true;
              std::cout << "Checkmate discovery complete: found " << discovered << " checkmates" << std::endl;
            }
          }
        }
        */
      board.UndoMove();
      cm_skip_count++;
      //std::cout << "checkmate position "  << cm_skip_count << std::endl;
      //abort();
      continue;
    }

    has_legal_moves = true;

    ss->current_move = move;

    std::shared_ptr<PVInfo> child_pvinfo;
    if (move_count == 0 && pvinfo.GetChild() != nullptr) {
      child_pvinfo = pvinfo.GetChild();
    } else {
      child_pvinfo = std::make_shared<PVInfo>();
    }

    ss->move_count = move_count++;

    int r = 1;

    auto endA2 = std::chrono::high_resolution_clock::now();
    auto durationA2 = std::chrono::duration_cast<std::chrono::nanoseconds>(endA2 - startA2);
    total_timeA2 += durationA2;
    call_countA2++;
    if (call_countA2 % 4000000 == 0) {
      auto avg_ns = total_timeA2.count() / call_countA2;

      std::cout //<< "---[Move - before recursion]"
                //<< "Average: " << avg_ns << " ns, "
                //<< "Call count: " << call_countA2 << std::endl
                //<< "Singular searches: " << GetNumSingularExtensionSearches() << std::endl
                //<< "Singular hits: " << GetNumSingularExtensions() << std::endl
                << "CM skips: " << cm_skip_count << std::endl;
    }

    if (depth >= 5
        && tt_hit
        && (tte->bound == LOWER_BOUND)
        && tte->depth >= depth >> 1
        ) {
      num_singular_extension_searches_.fetch_add(1, std::memory_order_relaxed);
      
      int beta = tte->score;

      PVInfo pvinfo;
      auto res = Search(ss, NonPV, thread_state, board, ply+1,
        depth - 1 - (depth/2),
        beta - 100, beta,
        maximizing_player, pvinfo, is_cut_node);

      if (res.has_value()) {
        int score = std::get<0>(*res);
        // If the search fails low, we didn't find a better move
        if (score < beta) {
          num_singular_extensions_.fetch_add(1, std::memory_order_relaxed);
          r = -1;
        }
      }
    }

    //static std::atomic<int64_t> capture_extension_count{0};
    //static std::atomic<int64_t> check_extension_count{0};

    constexpr int kMaxExtensionsPerPath = 1;
    if (depth < 2 && move.IsCapture() && ss->extension_count < kMaxExtensionsPerPath) {
        //capture_extension_count++;
        r = -1;
    }

    // lmr
    if (move_count >= 1) {
      // First search with reduced depth and null window
      (ss+1)->extension_count = ss->extension_count + (r < 0 ? 1 : 0);
      int new_depth = depth - 1
          - (depth/2)*(r > 0)*(depth>3)
          - (depth/4)*(r > 0)*(depth>7)
          - (depth/8)*(r > 0)*(depth>15)
          - (depth/16)*(r > 0)*(depth>31)
          + (r < 0);
      SEARCH_OR_EVAL(value_and_move_or, new_depth,
          ss+1, NonPV, thread_state, board, ply + 1, new_depth,
          -alpha-1, -alpha, !maximizing_player,
          *child_pvinfo, is_cut_node);
          
      if (value_and_move_or.has_value()) {
        int score = -std::get<0>(*value_and_move_or);
        
        // If the reduced search fails high, we need to research
        if (score > alpha) {
          
          // If the score is not failing high by much, try a reduced-window search first
          if (score < alpha + 100) {
            (ss+1)->extension_count = ss->extension_count;
            int new_depth = depth - 1
                - (depth/2)*(r > 0)*(depth>3)
                - (depth/4)*(r > 0)*(depth>7)
                - (depth/8)*(r > 0)*(depth>15)
                - (depth/16)*(r > 0)*(depth>31)
                + (r < 0);
            SEARCH_OR_EVAL(value_and_move_or, new_depth,
                ss+1, NonPV, thread_state, board, ply + 1, new_depth,
                -alpha-50, -alpha, !maximizing_player,
                *child_pvinfo, is_cut_node);
                
            if (value_and_move_or && -std::get<0>(*value_and_move_or) > alpha) {
              // If the reduced window search still fails high, do a full search
              (ss+1)->extension_count = ss->extension_count;
              int new_depth = depth - 1
                - (depth/3)*(r > 0)*(depth>2)
                - (depth/6)*(r > 0)*(depth>6)
                + (r < 0);
              SEARCH_OR_EVAL(value_and_move_or, new_depth,
                ss+1, NonPV, thread_state, board, ply + 1, new_depth,
                -beta, -alpha, !maximizing_player,
                *child_pvinfo, is_cut_node);
            }
          } else {
            // Failing high by a lot, do a full search immediately
            (ss+1)->extension_count = ss->extension_count;
            int new_depth = depth - 1
              - (depth/3)*(r > 0)*(depth>2)
              - (depth/6)*(r > 0)*(depth>6)
              + (r < 0);
            SEARCH_OR_EVAL(value_and_move_or, new_depth,
              ss+1, NonPV, thread_state, board, ply + 1, new_depth,
              -beta, -alpha, !maximizing_player,
              *child_pvinfo, is_cut_node);
          }
        }
      }
    }

    // For PV nodes only, do a full PV search on the first move or after a fail
    // high (in the latter case search only if value < beta), otherwise let the
    // parent node fail low with value <= alpha and try another move.
    bool full_search =
      move_count == 0
          || (value_and_move_or.has_value()
              && -std::get<0>(*value_and_move_or) > alpha
              && (is_root_node
                  || -std::get<0>(*value_and_move_or) < beta)
              );

    if (full_search) {
      (ss+1)->extension_count = ss->extension_count + (r < 0 ? 1 : 0);
      int new_depth = depth - 1 + (r < 0);
      SEARCH_OR_EVAL(value_and_move_or, new_depth,
          ss+1, PV, thread_state, board, ply + 1, new_depth,
          -beta, -alpha, !maximizing_player,
          *child_pvinfo, is_cut_node);
    }
    //auto startB = std::chrono::high_resolution_clock::now();

    board.UndoMove();

    if (!value_and_move_or.has_value()) {
      thread_state.ReleaseMoveBufferPartition();
      return std::nullopt; // stop canceled search
    }
    int score = -std::get<0>(*value_and_move_or);

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
    //auto endB = std::chrono::high_resolution_clock::now();
    //auto durationB = std::chrono::duration_cast<std::chrono::nanoseconds>(endB - startB);
    //total_timeB += durationB;
    //call_countB++;
    //// Track full searches and checkmate searches
    //thread_local int64_t total_full_searches = 0;
    
    //if (full_search) total_full_searches++;
    
    //if (call_countB % 1000000 == 0) {
    //  auto avg_ns = total_timeB.count() / call_countB;
    //  auto current_avg = durationB.count() / 1;  // Current call's time in ns

    //  std::cout << "[Move - after recursion]"
    //            << " Average: " << avg_ns << " ns,"
    //            << " Calls: " << call_countB << std::endl
    //            << "Full searches: " << total_full_searches
    //            << " capture extension: " << capture_extension_count
    //            << " check extension: " << check_extension_count << std::endl;
    //}
  }
  //static std::atomic<int64_t> total_checkmates_found = 0;
  //auto startC = std::chrono::high_resolution_clock::now();

  if (!fail_low && best_move) {  // Add null check for best_move
    int8_t from_row = best_move->FromRow();
    int8_t from_col = best_move->FromCol();
    int8_t to_row = best_move->ToRow();
    int8_t to_col = best_move->ToCol();
    Piece piece = board.GetPiece(from_row, from_col);

    int bonus = 1 + (fail_high ? (depth << 2) : depth);
    if (bonus > 16383) bonus = 16383;  // Cap for int16_t

    // [224][224] some values unused
    int from_sq = (from_row << 4) + from_col;
    int to_sq = (to_row << 4) + to_col;
    int queen_idx = (piece.GetPieceType() == QUEEN) ? 1 : 0;
    auto* hh = thread_state.GetHistoryHeuristic();
    hh[queen_idx * 224 * 224 + from_sq * 224 + to_sq] += bonus;
    hh[queen_idx * 224 * 224 + from_sq * 224 + to_sq] =
    (hh[queen_idx * 224 * 224 + from_sq * 224 + to_sq] >> 1) | (rand() & 0x7);
  }

  int score = alpha;
  if (!has_legal_moves) {
      score = -kMateValue;
      score = maximizing_player ? score : -score;
  }
  //ScoreBound bound = beta <= alpha ? LOWER_BOUND : is_pv_node &&
  //  best_move.has_value() ? EXACT : UPPER_BOUND;
  ScoreBound bound;
  if (!has_legal_moves) {
    bound = EXACT;
  } else if (beta <= alpha) {
    bound = LOWER_BOUND;
  } else if (is_pv_node && best_move.has_value()) {
    bound = EXACT;
  } else {
    bound = UPPER_BOUND;
  }
  if (tt != nullptr) {
    tt->Save(board.HashKey(), depth, best_move, score, ss->static_eval, bound, is_pv_node);
  }

  thread_state.ReleaseMoveBufferPartition();
  //auto endC = std::chrono::high_resolution_clock::now();
  //auto durationC = std::chrono::duration_cast<std::chrono::nanoseconds>(endC - startC);
  //total_timeC += durationC;
  //call_countC++;
  //if (call_countC % 1000000 == 0) {
  //  auto avg_ns = total_timeC.count() / call_countC;
  //  auto current_avg = durationC.count() / 1;  // Current call's time in ns

  //  std::cout << "[Search - after move]"
  //            << " Average: " << avg_ns << " ns,"
  //            << " Call count: " << call_countC
  //            << ", Checkmates: " 
  //            << total_checkmates_found << std::endl;
  //}

  return std::make_tuple(score, best_move);
}

void AlphaBetaPlayer::ResetHistoryHeuristics() {
  // History heuristic is now thread-local in ThreadState
  // Each thread's heuristic is zero-initialized in ThreadState constructor
}

void AlphaBetaPlayer::AgeHistoryHeuristics() {
  // History heuristic is now thread-local in ThreadState
  // Aging would need to be done per-thread if needed
}

void AlphaBetaPlayer::ResetMobilityScores(ThreadState& thread_state, Board& board) {
  // reset pseudo-mobility scores
  for (int i = 0; i < 4; i++) {
    Player player(static_cast<PlayerColor>(i));
    UpdateMobilityEvaluation(thread_state, board, player);
  }
}

std::optional<std::tuple<int, std::optional<Move>, int>>
AlphaBetaPlayer::MakeMove(
    Board& board,
    int max_depth) {

  int num_threads = 1;
  if (options_.enable_multithreading) {
    num_threads = options_.num_threads;
  }
  assert(num_threads >= 1);

  // Get PV moves for helper threads
  std::vector<Move> pv_moves;
  PVInfo* current = &pv_info_;
  while (current) {
    auto move = current->GetBestMove();
    if (move.has_value()) {
      pv_moves.push_back(*move);
      current = current->GetChild().get();
    } else {
      break;
    }
  }

  // Generate root moves for remaining helper threads
  const auto& pieces = board.GetPieceList()[board.GetTurn().GetColor()];
  Move root_moves_buffer[256];
  auto root_result = board.GetPseudoLegalMoves2(
    root_moves_buffer,
    256,
    pieces,
    std::nullopt);
  int num_root_moves = root_result.count;

  std::vector<ThreadState> thread_states;
  thread_states.reserve(num_threads);
  for (int i = 0; i < num_threads; i++) {
    PlayerOptions thread_options = options_;

    Board* board_for_thread = &board;
    int moves_to_apply = 0;
    
    // Helper threads get a board with their assigned moves made
    if (i > 0) {
      static std::vector<std::unique_ptr<Board>> helper_boards;
      if (helper_boards.size() < static_cast<size_t>(num_threads - 1)) {
        helper_boards.push_back(std::make_unique<Board>(board));
      } else {
        helper_boards[i - 1] = std::make_unique<Board>(board);
      }
      
      int pv_depth = max_depth - i;
      if (pv_depth > 0 && !pv_moves.empty()) {
        moves_to_apply = std::clamp((max_depth - pv_depth) + 1, 1, static_cast<int>(pv_moves.size()));
        for (int j = 0; j < moves_to_apply; j++) {
          helper_boards[i - 1]->MakeMove(pv_moves[j]);
        }
      } else if ((i - 1) < num_root_moves) {
        moves_to_apply = 1;
        helper_boards[i - 1]->MakeMove(root_moves_buffer[i - 1]);
      }
      board_for_thread = helper_boards[i - 1].get();

      auto pv_copy = std::make_shared<PVInfo>();

      thread_states.emplace_back(thread_options, *board_for_thread, *pv_copy);
      auto& thread_state = thread_states.back();
      ResetMobilityScores(thread_state, *board_for_thread);
    } else {

      thread_states.emplace_back(thread_options, board, pv_info_);
      auto& thread_state = thread_states.back();
      ResetMobilityScores(thread_state, board);
    }

  }

  root_team_ = board.GetTurn().GetTeam();

  // (we search the same position anyway)
  int64_t hash_key = board.HashKey();
  if (hash_key != last_board_key_) {
    average_root_eval_ = 0;
    asp_nobs_ = 0;
    asp_sum_ = 0;
    asp_sum_sq_ = 0;

    // Increment generation counter for new search
    if (hash_key != last_board_key_) {
      thread_states[0].GetTranspositionTable()->NewSearch();
    }
  }
  last_board_key_ = hash_key;

  SetCanceled(false);
  std::atomic_thread_fence(std::memory_order_seq_cst);
  // Use Alpha-Beta search with iterative deepening
  auto start = std::chrono::system_clock::now();

  if (options_.max_search_depth.has_value()) {
    max_depth = std::min(max_depth, *options_.max_search_depth);
  }

  std::vector<std::unique_ptr<std::thread>> threads;
  for (int i = 1; i < num_threads; i++) {
    // Only create helper thread if it has a move assigned
    int pv_depth = max_depth - i;
    bool has_move = (pv_depth > 0 && !pv_moves.empty()) || ((i - 1) < num_root_moves);
    if (!has_move) {
      break;
    }
    threads.push_back(std::make_unique<std::thread>([
      this, i, &thread_states, max_depth, &pv_moves, &root_moves_buffer] {
          //int helper_depth = std::max(1, max_depth - 0);

          int helper_depth;
          if (max_depth > 11) {
            helper_depth = 1000;
          } else {
            helper_depth = 0;
          }
          int pv_depth = max_depth - i;
          if (pv_depth > 0 && !pv_moves.empty()) {
            int moves_to_apply = std::min(pv_depth, static_cast<int>(pv_moves.size()));
            std::cout << "starting " << i << " pv_depth: " << moves_to_apply << " depth: " << max_depth << std::endl;
          } else {
            Move move = root_moves_buffer[i - 1];
            std::cout << "starting " << i << " move: " << move.PrettyStr() << " depth: " << max_depth << std::endl;
          }
          
          struct timespec cpu_start, cpu_end;
          
          auto result = MakeMoveSingleThread(i, thread_states[i], helper_depth);
          
          if (result.has_value()) {
            auto [score, move, depth] = *result;
            std::string pv = GetPVStrFromPVInfo(thread_states[i].GetPVInfo());
            std::cout << "Thread " << i << " result: score=" << score
                      << " depth=" << depth
                      << " move=" << (move.has_value() ? move->PrettyStr() : "none")
                      << " pv=" << pv
                      << std::endl;
          } else {
            std::string pv = GetPVStrFromPVInfo(thread_states[i].GetPVInfo());
            std::cout << "Thread " << i << " result: canceled pv=" << pv << std::endl;
          }
    }));
  }

  auto res = MakeMoveSingleThread(0, thread_states[0], max_depth);

  SetCanceled(true);
  
  for (auto& thread : threads) {
    thread->join();
  }

  // Swap main thread's TT with helper thread 1's TT
  if (thread_states.size() > 1) {
    auto tt0 = thread_states[0].ReleaseTranspositionTable();
    auto tt1 = thread_states[1].ReleaseTranspositionTable();
    thread_states[0].SetTranspositionTable(std::move(tt1));
    thread_states[1].SetTranspositionTable(std::move(tt0));
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

  //PVInfo warmup_pvinfo;
  //auto warmup_res = Search(
  //  ss, Root, thread_state, board, 2, 10, -200, 200, 
  //  maximizing_player, warmup_pvinfo, false);

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
            //move_and_value = SearchM(
            //  ss, Root, thread_state, thread_id, board, 1, next_depth, alpha, beta, maximizing_player,
            //  pv_info, false);
            move_and_value = Search(
                ss, Root, thread_state, board, 1, next_depth, alpha, beta, maximizing_player,
                pv_info, false);
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
              break; // alpha < evaluation < beta
            }

            if (fail_cnt >= 5) {
              alpha = -kMateValue;
              beta = kMateValue;
            }

            delta += delta / 3;
          }
      } else {
          // Helper threads use a full window
          move_and_value = SearchM(
            ss, Root, thread_state, thread_id, board, 1, next_depth, -kMateValue, kMateValue, maximizing_player,
            pv_info, false);

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
    const auto& pieces = board.GetPieceList()[board.GetTurn().GetColor()];
    auto result = board.GetPseudoLegalMoves2(nullptr, 0, pieces);
    
    // Update thread state for all players
    for (int i = 0; i < 4; i++) {
        thread_state.TotalMoves()[i] = result.mobility_counts[i];
        thread_state.NThreats()[i] = result.threat_counts[i];
    }
    */
    thread_state.TotalMoves()[player.GetColor()] = 1;
    thread_state.NThreats()[player.GetColor()] = 1;
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

std::shared_ptr<PVInfo> PVInfo::SkipMoves(int n) const {
  if (n <= 0) {
    return Copy();
  }
  std::shared_ptr<PVInfo> current = child_;
  for (int i = 1; i < n && current != nullptr; i++) {
    current = current->GetChild();
  }
  if (current == nullptr) {
    return std::make_shared<PVInfo>();
  }
  return current->Copy();
}

std::optional<std::tuple<int, std::optional<Move>>> AlphaBetaPlayer::SearchM(
    Stack* ss,
    NodeType node_type,
    ThreadState& thread_state,
    size_t thread_id,
    Board& board,
    int ply,
    int depth,
    int alpha,
    int beta,
    bool maximizing_player,
    PVInfo& pvinfo,
    bool is_cut_node) {


  //num_nodes_++;
  if (canceled_.load(std::memory_order_acquire)) {
    return std::nullopt;
  }


  int64_t key = board.HashKey();

  auto startA = std::chrono::high_resolution_clock::now();

  Player player = board.GetTurn();
  PlayerColor player_color = player.GetColor();
  Team other_team = OtherTeam(player.GetTeam());

  bool is_root_node = ply == 1;
  bool is_pv_node = node_type != NonPV;

  //~20ns
  std::optional<Move> tt_move;
  const HashTableEntry* tte = nullptr;
  bool tt_hit = false;
  auto* tt = thread_state.GetTranspositionTable();
  if (tt != nullptr) {
    tte = tt->Get(key);
  }
  if (tte != nullptr) {
    if (tte->key == key) { // valid entry
      tt_hit = true;
      //if (tte->depth >= depth) {
      //  // at non-PV nodes check for an early TT cutoff
      //  if (!is_root_node
      //      && !is_pv_node
      //      && (tte->bound == EXACT
      //        || (tte->bound == LOWER_BOUND && tte->score >= beta)
      //        || (tte->bound == UPPER_BOUND && tte->score <= alpha))
      //      ) {

      //    if (tte->packed_move != 0) {
      //        return std::make_tuple(
      //            std::min(beta, std::max(alpha, tte->score)),
      //            Move::Unpack(tte->packed_move, board));
      //    }
      //    return std::make_tuple(
      //      std::min(beta, std::max(alpha, tte->score)), std::nullopt);
      //  }
      //}
      if (tte->packed_move != 0) {
        tt_move = Move::Unpack(tte->packed_move, board);
      }
    }
  }
  auto capture_info = board.CanCaptureKing();
  if (capture_info.from_row != -1) {
    bool is_new_checkmate = false;

    //// First try a read-only check with shared lock
    //{
    //  std::shared_lock<std::shared_mutex> lock(checkmate_mutex_);
    //  is_new_checkmate = (checkmate_positions_.find(key) == checkmate_positions_.end());
    //}

    //// If it's a new checkmate, take exclusive lock to update
    //if (is_new_checkmate) {
    //  std::unique_lock<std::shared_mutex> lock(checkmate_mutex_);
    //  // Double-check in case another thread added it between our check and now
    //  auto [it, inserted] = checkmate_positions_.insert(key);
    //  is_new_checkmate = inserted;
    //}

    int eval = kMateValue;
    eval = maximizing_player ? eval : -eval;

    // Construct the king capture move
    const auto& target_piece = board.GetPiece(capture_info.to_row, capture_info.to_col);
    int8_t capture_raw = target_piece.GetRaw();
    Move move(capture_info.from_row, capture_info.from_col,
              capture_info.to_row, capture_info.to_col, capture_raw);

    if (tt != nullptr) {
      tt->Save(key, depth+100, move, eval, eval, EXACT, false /*is_pv_node*/);
    }
    
    //return std::make_tuple(eval, move);
  }

  //~20ns
    
  int eval = 0;
  if (tt_hit) {
    if (tte->bound == UPPER_BOUND) {
      eval = board.PieceEvaluation();
      eval = maximizing_player ? eval : -eval;
    } else {
      eval = tte->eval;
    }
  } else {
      eval = board.PieceEvaluation();
    static const uint8_t LOG2_MOVES[256] = {
        0, 0, 0, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3,
        4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
        5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
        5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
        6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
        6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
        6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
        6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
        7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
        7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
        7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
        7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
        7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
        7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
        7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
        7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7
    };

    static const uint8_t LOG2_THREATS[64] = {
        0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 4,
        4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5,
        5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
        5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5
    };

    static const int8_t THREAT_SCORE[64] = {
        -8, -8, -8, -8, -8, -8, -8, -8,
        -8, -8, -8, -8, -8, -8, -8, -8,
        -8, -8,
        8, 16, 24, 32, 40, 48, 56,
        -56, -48, -40, -32, -24, -16,
        -50, -50, -50, -50, -50, -50, -50, -50,
        -50, -50, -50, -50, -50, -50, -50, -50,
        -50, -50, -50, -50, -50, -50, -50, -50,
        -50, -50, -50, -50, -50, -50, -50, -50
    };

    int moves_eval;
    int threat_eval;

    int logR = LOG2_MOVES[thread_state.TotalMoves()[RED]];
    int logY = LOG2_MOVES[thread_state.TotalMoves()[YELLOW]];
    int logB = LOG2_MOVES[thread_state.TotalMoves()[BLUE]];
    int logG = LOG2_MOVES[thread_state.TotalMoves()[GREEN]];

    int logRY = (logR + logY) << 2;  // 4 * sum
    int logBG = (logB + logG) << 2;

    int lb, sign;
    if (logRY > logBG) {
      lb = logRY + 1;
      sign = (other_team != RED_YELLOW) ? 1 : -1;
    } else if (logBG > logRY) {
      lb = logBG + 1;
      sign = (other_team != RED_YELLOW) ? -1 : 1;
    } else {
      lb = logRY + 1;
      sign = 0;
    }
    moves_eval = sign * (lb < 27 ? 10 : 5 * (lb - 25));

    int logtR = LOG2_THREATS[thread_state.NThreats()[RED] & 63];
    int logtY = LOG2_THREATS[thread_state.NThreats()[YELLOW] & 63];
    int logtB = LOG2_THREATS[thread_state.NThreats()[BLUE] & 63];
    int logtG = LOG2_THREATS[thread_state.NThreats()[GREEN] & 63];

    int logtRY = (logtR + logtY) << 2;
    int logtBG = (logtB + logtG) << 2;

    int len_idx;
    int threat_sign;
    if (logtRY > logtBG) {
      len_idx = logtRY;
      threat_sign = (other_team != RED_YELLOW) ? 1 : -1;
    } else if (logtBG > logtRY) {
      len_idx = logtBG;
      threat_sign = (other_team != RED_YELLOW) ? -1 : 1;
    } else {
      len_idx = 0;
      threat_sign = 0;
    }

    len_idx = (len_idx < 0) ? 0 : (len_idx > 63 ? 63 : len_idx);
    threat_eval = threat_sign * THREAT_SCORE[len_idx];

    eval += moves_eval + threat_eval;

    eval = maximizing_player ? eval : -eval;
  }
  ss->static_eval = eval;
  ss->move_count = 0;

  std::optional<Move> best_move;
  std::optional<Move> pv_move = pvinfo.GetBestMove();
  Move* moves = thread_state.GetNextMoveBufferPartition();

  // Generate moves with pieces
  const auto& pieces = board.GetPieceList()[board.GetTurn().GetColor()];
  auto result = board.GetPseudoLegalMoves2(
    moves,
    kBufferPartitionSize,
    pieces,
    pv_move);
  thread_state.TotalMoves()[player_color] = result.mobility_counts[player_color];
  thread_state.NThreats()[player_color] = result.threat_counts[player_color];
  //bool in_check = result.in_check;



  //~10ns
  // Then initialize the move picker with the generated moves
  MovePicker2 picker;
  const Move* pv_ptr = (result.pv_index >= 0) ? &moves[result.pv_index] : nullptr;
  size_t move_count2 = result.count;
  const Move* tt_ptr = nullptr;
  if (move_count2 > 0 && tt_move.has_value()) {
    tt_ptr = &(*tt_move);
  }

  //~10ns
  InitMovePicker2(
    &picker,
    &board,
    moves,
    move_count2,
    pv_ptr,
    tt_ptr,
    reinterpret_cast<int16_t(*)[224][224]>(thread_state.GetHistoryHeuristic()));

  auto endA = std::chrono::high_resolution_clock::now();
  auto durationA = std::chrono::duration_cast<std::chrono::nanoseconds>(endA - startA);
  total_timeA += durationA;
  call_countA++;
  if (call_countA % 200000 == 0) {
    auto avg_ns = total_timeA.count() / call_countA;

    //std::cout << "--- [Search - before move]"
    //          << "Average: " << avg_ns << " ns, "
    //          << "Call count: " << call_countA << ", " 
    //          << "cache hits: " << num_cache_hits_
    //          << std::endl;
  }
  
  bool has_legal_moves = false;
  int move_count = 0;
  int invalid_moves = 0;
  bool fail_low = true;
  bool fail_high = false;

  while (true) {
    const Move* move_ptr = GetNextMove2(&picker);
    if (move_ptr == nullptr) {
      break;
    }
    const Move& move = *move_ptr;
    //auto startA2 = std::chrono::high_resolution_clock::now();

    std::optional<std::tuple<int, std::optional<Move>>> value_and_move_or;

    const int8_t old_king_row = board.GetKingRow(player_color);
    const int8_t old_king_col = board.GetKingCol(player_color);
    //~20ns
    board.MakeMove(move);

    const int8_t king_row = board.GetKingRow(player_color);
    const int8_t king_col = board.GetKingCol(player_color);
    if (king_row == old_king_row && king_col == old_king_col) {
      const int8_t from_row = move.FromRow();
      const int8_t from_col = move.FromCol();
      const int8_t row_diff = king_row - from_row;
      const int8_t col_diff = king_col - from_col;
      const bool aligned_with_king = 
        row_diff == 0 ||                     // same row
        col_diff == 0 ||                     // same column
        row_diff * row_diff == col_diff * col_diff;  // diagonal

      if (aligned_with_king) { // possible pinned or king move
        int8_t rd = (row_diff > 0) - (row_diff < 0);  // sign of row_diff: -1, 0, or 1
        int8_t cd = (col_diff > 0) - (col_diff < 0);   // sign of col_diff
        bool is_king_in_check = board.IsAttackedByTeamAligned(
          other_team, from_row, from_col,  // scan from piece location
          rd, cd
        );
        if (is_king_in_check) { // invalid move
          board.UndoMove();
          continue;
        }
      }
    } else { // king moved
        bool is_king_in_check = board.IsAttackedByTeam(
          other_team, king_row, king_col
        );
        if (is_king_in_check) { // invalid move
          board.UndoMove();
          continue;
        }
    }

    has_legal_moves = true;

    ss->current_move = move;

    std::shared_ptr<PVInfo> child_pvinfo;
    if (move_count == 0 && pvinfo.GetChild() != nullptr) {
      child_pvinfo = pvinfo.GetChild();
    } else {
      child_pvinfo = std::make_shared<PVInfo>();
    }

    ss->move_count = move_count++;

    int r = 1;
    //if (depth >= 5
    //    && tt_hit
    //    && (tte->bound == LOWER_BOUND)
    //    && tte->depth >= depth >> 1
    //    ) {
    //  num_singular_extension_searches_.fetch_add(1, std::memory_order_relaxed);
    //  
    //  int beta = tte->score;

    //  PVInfo pvinfo;
    //  auto res = SearchM(ss, NonPV, thread_state, thread_id, board, ply+1,
    //    depth - 1 - (depth/2),
    //    beta - 100, beta,
    //    maximizing_player, pvinfo, is_cut_node);

    //  if (res.has_value()) {
    //    int score = std::get<0>(*res);
    //    // If the search fails low, we didn't find a better move
    //    if (score < beta) {
    //      num_singular_extensions_.fetch_add(1, std::memory_order_relaxed);
    //      r = -1;
    //    }
    //  }
    //}

    //auto endA2 = std::chrono::high_resolution_clock::now();
    //auto durationA2 = std::chrono::duration_cast<std::chrono::nanoseconds>(endA2 - startA2);
    //total_timeA2 += durationA2;
    //call_countA2++;
    //if (call_countA2 % 1000 == 0) {
    //  auto avg_ns = total_timeA2.count() / call_countA2;

    //  //std::cout << "---[Move - before recursion]"
    //  //          << "Average: " << avg_ns << " ns, "
    //  //          << "Call count: " << call_countA2 << std::endl
    //  //          << "Singular searches: " << GetNumSingularExtensionSearches() << std::endl
    //  //          << "Singular hits: " << GetNumSingularExtensions() << std::endl;
    //  //          //<< "CM skips: " << cm_skip_count << std::endl;
    //}

    constexpr int kMaxExtensionsPerPath = 1;
    if (depth < 2 && move.IsCapture() && ss->extension_count < kMaxExtensionsPerPath) {
        //capture_extension_count++;
        r = -1;
    }

    //static std::atomic<int64_t> capture_extension_count{0};
    ////static std::atomic<int64_t> check_extension_count{0};
    //const int is_capture = move.IsCapture();
    //  int new_depth = depth - 1 + is_capture;


    //// lmr
    //if (move_count >= 1) {
    //  if (is_capture) {
    //    new_depth = depth;
    //  } else {
    //    if (depth < 2) {
    //      new_depth = 0;
    //    } else if (depth > 2) {
    //      new_depth = 2;
    //    } else {
    //      new_depth = depth - 1;
    //    }
    //  }
    //  //new_depth = depth - 1 - (depth/2)*(depth>3)*(!is_capture) + (is_capture);
    //      SEARCH_OR_EVAL_M(value_and_move_or, new_depth,
    //        ss+1, NonPV, thread_state, thread_id, board, ply + 1, new_depth,
    //        -beta, -alpha, !maximizing_player,
    //        *child_pvinfo, is_cut_node);
    //}

    //// For PV nodes only, do a full PV search on the first move or after a fail
    //// high (in the latter case search only if value < beta), otherwise let the
    //// parent node fail low with value <= alpha and try another move.
    //bool full_search =
    //  move_count < 1
    //      || (value_and_move_or.has_value()
    //      && -std::get<0>(*value_and_move_or) > alpha
    //      && (is_root_node
    //          || -std::get<0>(*value_and_move_or) < beta)
    //      );

    //if (full_search) {

    //  SEARCH_OR_EVAL_M(value_and_move_or, new_depth,
    //      ss+1, PV, thread_state, thread_id, board, ply + 1, new_depth,
    //      -beta, -alpha, !maximizing_player,
    //      *child_pvinfo, is_cut_node);
    //}
    ////auto startB = std::chrono::high_resolution_clock::now();

    // lmr
    if (move_count >= 1) {
      // First search with reduced depth and null window
      (ss+1)->extension_count = ss->extension_count + (r < 0 ? 1 : 0);
      int new_depth = depth - 1
          - (depth/2)*(r > 0)*(depth>3)
          //- (depth/4)*(r > 0)*(depth>7)
          //- (depth/8)*(r > 0)*(depth>15)
          //- (depth/16)*(r > 0)*(depth>31)
          + (r < 0);
      SEARCH_OR_EVAL_M(value_and_move_or, new_depth,
          ss+1, NonPV, thread_state, thread_id, board, ply + 1, new_depth,
          -alpha-1, -alpha, !maximizing_player,
          *child_pvinfo, is_cut_node);
          
      if (value_and_move_or.has_value()) {
        int score = -std::get<0>(*value_and_move_or);
        
        // If the reduced search fails high, we need to research
        if (score > alpha) {
          
          //// If the score is not failing high by much, try a reduced-window search first
          //if (score < alpha + 100) {
          //  (ss+1)->extension_count = ss->extension_count;
          //  int new_depth = depth - 1
          //      - (depth/2)*(r > 0)*(depth>3)
          //      //- (depth/4)*(r > 0)*(depth>7)
          //      //- (depth/8)*(r > 0)*(depth>15)
          //      //- (depth/16)*(r > 0)*(depth>31)
          //      + (r < 0);
          //  SEARCH_OR_EVAL(value_and_move_or, new_depth,
          //      ss+1, NonPV, thread_state, board, ply + 1, new_depth,
          //      -alpha-50, -alpha, !maximizing_player,
          //      *child_pvinfo, is_cut_node);
          //      
          //  if (value_and_move_or && -std::get<0>(*value_and_move_or) > alpha) {
          //    // If the reduced window search still fails high, do a full search
          //    (ss+1)->extension_count = ss->extension_count;
          //    int new_depth = depth - 1
          //      //- (depth/3)*(r > 0)*(depth>2)
          //      //- (depth/6)*(r > 0)*(depth>6)
          //      + (r < 0);
          //    SEARCH_OR_EVAL(value_and_move_or, new_depth,
          //      ss+1, NonPV, thread_state, board, ply + 1, new_depth,
          //      -beta, -alpha, !maximizing_player,
          //      *child_pvinfo, is_cut_node);
          //  }
          //} else {
            // Failing high by a lot, do a full search immediately
            (ss+1)->extension_count = ss->extension_count;
            int new_depth = depth - 1
              //- (depth/3)*(r > 0)*(depth>2)
              //- (depth/6)*(r > 0)*(depth>6)
              + (r < 0);
            SEARCH_OR_EVAL_M(value_and_move_or, new_depth,
              ss+1, NonPV, thread_state, thread_id, board, ply + 1, new_depth,
              -beta, -alpha, !maximizing_player,
              *child_pvinfo, is_cut_node);
          //}
        }
      }
    }

    // For PV nodes only, do a full PV search on the first move or after a fail
    // high (in the latter case search only if value < beta), otherwise let the
    // parent node fail low with value <= alpha and try another move.
    bool full_search =
      move_count == 0
          || (value_and_move_or.has_value()
              && -std::get<0>(*value_and_move_or) > alpha
              && (is_root_node
                  || -std::get<0>(*value_and_move_or) < beta)
              );

    if (full_search) {
      (ss+1)->extension_count = ss->extension_count + (r < 0 ? 1 : 0);
      int new_depth = depth - 1 + (r < 0);
      SEARCH_OR_EVAL_M(value_and_move_or, new_depth,
          ss+1, PV, thread_state, thread_id, board, ply + 1, new_depth,
          -beta, -alpha, !maximizing_player,
          *child_pvinfo, is_cut_node);
    }

    board.UndoMove();

    if (!value_and_move_or.has_value()) {
      thread_state.ReleaseMoveBufferPartition();
      return std::nullopt; // stop canceled search
    }

    int score = -std::get<0>(*value_and_move_or);

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
    //auto endB = std::chrono::high_resolution_clock::now();
    //auto durationB = std::chrono::duration_cast<std::chrono::nanoseconds>(endB - startB);
    //total_timeB += durationB;
    //call_countB++;
    
    //if (call_countB % 2000 == 0) {
    //  auto avg_ns = total_timeB.count() / call_countB;
    //  auto current_avg = durationB.count() / 1;  // Current call's time in ns

    //  std::cout << "--- [Move - after recursion]"
    //            << " Average: " << avg_ns << " ns,"
    //            << " Calls: " << call_countB << std::endl
    //            << " capture extension: " << capture_extension_count << std::endl;
    //}
  }


  static std::atomic<int64_t> total_checkmates_found = 0;
  auto startC = std::chrono::high_resolution_clock::now();

  //if (!fail_low && best_move) {  // Add null check for best_move
  //  int8_t from_row = best_move->FromRow();
  //  int8_t from_col = best_move->FromCol();
  //  int8_t to_row = best_move->ToRow();
  //  int8_t to_col = best_move->ToCol();
  //  Piece piece = board.GetPiece(from_row, from_col);

  //  int bonus = 1 + (fail_high ? (depth << 3) : depth << 2);
  //  if (bonus > 16383) bonus = 16383;  // Cap for int16_t

  //  // [224][224] some values unused
  //  int from_sq = (from_row << 4) + from_col;
  //  int to_sq = (to_row << 4) + to_col;
  //  int queen_idx = (piece.GetPieceType() == QUEEN) ? 1 : 0;
  //  auto* hh = thread_state.GetHistoryHeuristic();
  //  hh[queen_idx * 224 * 224 + from_sq * 224 + to_sq] += bonus;
  //  hh[queen_idx * 224 * 224 + from_sq * 224 + to_sq] =
  //  (hh[queen_idx * 224 * 224 + from_sq * 224 + to_sq] >> 1) | (rand() & 0x7);
  //}

  int score = alpha;
  if (!has_legal_moves) {
      score = -kMateValue;
      score = maximizing_player ? score : -score;

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
        auto [it, inserted] = checkmate_positions_.insert(hash_key);
        is_new_checkmate = inserted;
        total_checkmates_found++;     // Increment total checkmate counter
      }
  }

  ScoreBound bound;
  if (!has_legal_moves) {
    bound = EXACT;
  } else if (beta <= alpha) {
    bound = LOWER_BOUND;
  } else if (is_pv_node && best_move.has_value()) {
    bound = EXACT;
  } else {
    bound = UPPER_BOUND;
  }
  if (tt != nullptr) {
    tt->Save(board.HashKey(), depth+100, best_move, score, ss->static_eval, bound, is_pv_node);
  }

  thread_state.ReleaseMoveBufferPartition();
  auto endC = std::chrono::high_resolution_clock::now();
  auto durationC = std::chrono::duration_cast<std::chrono::nanoseconds>(endC - startC);
  total_timeC += durationC;
  call_countC++;
  if (call_countC % 1000000 == 0) {
    auto avg_ns = total_timeC.count() / call_countC;
    auto current_avg = durationC.count() / 1;  // Current call's time in ns

    std::cout << "[Search - after move]"
              << " Average: " << avg_ns << " ns,"
              << " Call count: " << call_countC << std::endl
              << "> > > Checkmates: "
              << total_checkmates_found << std::endl;
  }

  return std::make_tuple(score, best_move);
}

}  // namespace chess
