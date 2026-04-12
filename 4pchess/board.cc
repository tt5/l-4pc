#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <cstddef>  // for ptrdiff_t
#include <optional>
#include <ostream>
#include <sstream>
#include <unordered_map>
#include <utility>
#include <vector>
#include <chrono>
#include <unordered_set>

#include "board.h"

namespace chess {

  static constexpr int kPieceValues[] = {
    0,  // NO_PIECE
    0,  // PAWN
    4,  // KING
    5,  // QUEEN
    3,  // ROOK
    2,  // BISHOP
    1   // KNIGHT
  };

std::chrono::nanoseconds Board::total_time{0};
size_t Board::call_count = 0;
int Piece::invalid_piece_count = 0;

constexpr int kMobilityMultiplier = 5;
Piece Piece::kNoPiece = Piece();
BoardLocation BoardLocation::kNoLocation = BoardLocation();
CastlingRights CastlingRights::kMissingRights = CastlingRights();

const BoardLocation kRedInitialRookLocationKingside(13, 10);
const BoardLocation kRedInitialRookLocationQueenside(13, 3);
const BoardLocation kBlueInitialRookLocationKingside(10, 0);
const BoardLocation kBlueInitialRookLocationQueenside(3, 0);
const BoardLocation kYellowInitialRookLocationKingside(0, 3);
const BoardLocation kYellowInitialRookLocationQueenside(0, 10);
const BoardLocation kGreenInitialRookLocationKingside(3, 13);
const BoardLocation kGreenInitialRookLocationQueenside(10, 13);

const Player kRedPlayer = Player(RED);
const Player kBluePlayer = Player(BLUE);
const Player kYellowPlayer = Player(YELLOW);
const Player kGreenPlayer = Player(GREEN);

const Piece kRedPawn(kRedPlayer, PAWN);
const Piece kRedKnight(kRedPlayer, KNIGHT);
const Piece kRedBishop(kRedPlayer, BISHOP);
const Piece kRedRook(kRedPlayer, ROOK);
const Piece kRedQueen(kRedPlayer, QUEEN);
const Piece kRedKing(kRedPlayer, KING);

const Piece kBluePawn(kBluePlayer, PAWN);
const Piece kBlueKnight(kBluePlayer, KNIGHT);
const Piece kBlueBishop(kBluePlayer, BISHOP);
const Piece kBlueRook(kBluePlayer, ROOK);
const Piece kBlueQueen(kBluePlayer, QUEEN);
const Piece kBlueKing(kBluePlayer, KING);

const Piece kYellowPawn(kYellowPlayer, PAWN);
const Piece kYellowKnight(kYellowPlayer, KNIGHT);
const Piece kYellowBishop(kYellowPlayer, BISHOP);
const Piece kYellowRook(kYellowPlayer, ROOK);
const Piece kYellowQueen(kYellowPlayer, QUEEN);
const Piece kYellowKing(kYellowPlayer, KING);

const Piece kGreenPawn(kGreenPlayer, PAWN);
const Piece kGreenKnight(kGreenPlayer, KNIGHT);
const Piece kGreenBishop(kGreenPlayer, BISHOP);
const Piece kGreenRook(kGreenPlayer, ROOK);
const Piece kGreenQueen(kGreenPlayer, QUEEN);
const Piece kGreenKing(kGreenPlayer, KING);

namespace {

int64_t rand64() {
  int32_t t0 = rand();
  int32_t t1 = rand();
  return (((int64_t)t0) << 32) + (int64_t)t1;
}

}  // namespace

Move* Board::GetPawnMovesDirect(
    Move* current,
    const BoardLocation& from,
    PlayerColor color,
    Team my_team
  ) const {
  int row = from.GetRow();
  int col = from.GetCol();

  /*
  // Lookup table for promotion conditions: [color] -> {target_row, target_col, row_check, col_check}
  // target_row/target_col: The target row/column for promotion
  // row_check/col_check: Whether to check row (1), column (2), or both (3)
  static constexpr int kPromotionConditions[4][4] = {
    {3, -1, 1, 0},  // RED: check row == 3
    {-1, 10, 0, 1}, // BLUE: check col == 10
    {10, -1, 1, 0}, // YELLOW: check row == 10
    {-1, 3, 0, 1}   // GREEN: check col == 3
  };
  */

  // Consolidated direction data for pawn movement and captures
  // Indexed by PlayerColor (RED=0, BLUE=1, YELLOW=2, GREEN=3)
  struct PawnDirectionData {
    int delta_row;         // Row delta for forward movement
    int delta_col;         // Column delta for forward movement
    int capture1_row;      // Row delta for first capture direction
    int capture1_col;      // Column delta for first capture direction
    int capture2_row;      // Row delta for second capture direction
    int capture2_col;      // Column delta for second capture direction
  };
  
  static constexpr PawnDirectionData kPawnDirections[4] = {
    // y direction 0 top, 13 bottom
    // all colors capture to the left (first capture)
    // RED: moves up, captures up-left and up-right
    {-1, 0, -1, -1, -1, 1},
    // BLUE: moves right, captures up-right and down-right
    {0, 1, -1, 1, 1, 1},
    // YELLOW: moves down, captures down-left and down-right
    {1, 0, 1, 1, 1, -1},
    // GREEN: moves left, captures down-left and up-left
    {0, -1, 1, -1, -1, -1}
  };


  // Precompute promotion check using lookup table
  //const int* promo_cond = kPromotionConditions[static_cast<int>(color)];
  // Simplified promotion check - the -1 values in promo_cond make the other comparison always false
  //const bool is_promotion = (promo_cond[0] == row) || (promo_cond[1] == col);

  /*
  // Helper function to add promotion moves
  auto AddPromotionMoves = [&](const BoardLocation& to, const Piece& captured = Piece::kNoPiece) -> Move* {
    *current++ = Move(from, to, captured, BoardLocation::kNoLocation, Piece::kNoPiece, QUEEN);
    return current;
  };
  */

  // Get direction data for current color
  const PawnDirectionData& dir = kPawnDirections[static_cast<int>(color)];
  const int delta_row = dir.delta_row;
  const int delta_col = dir.delta_col;
  
  
  // Precompute all possible target squares
  const int forward_row = row + delta_row;
  const int forward_col = col + delta_col;
  const bool is_forward_legal = IsLegalLocation(forward_row, forward_col);
  const BoardLocation forward1 = is_forward_legal ? 
      BoardLocation(forward_row, forward_col) : BoardLocation::kNoLocation;

  // Cache piece lookup only if the location is legal
  const Piece forward_piece = is_forward_legal ? 
      GetPiece(forward_row, forward_col) : Piece::kNoPiece;

  // Precompute capture squares and cache their pieces
  const int capture1_row = row + dir.capture1_row;
  const int capture1_col = col + dir.capture1_col;
  const bool is_capture1_legal = IsLegalLocation(capture1_row, capture1_col);
  const BoardLocation capture1_loc = is_capture1_legal ? 
      BoardLocation(capture1_row, capture1_col) : BoardLocation::kNoLocation;
  const Piece capture1_piece = is_capture1_legal ? 
      GetPiece(capture1_row, capture1_col) : Piece::kNoPiece;

  const int capture2_row = row + dir.capture2_row;
  const int capture2_col = col + dir.capture2_col;
  const bool is_capture2_legal = IsLegalLocation(capture2_row, capture2_col);
  const BoardLocation capture2_loc = is_capture2_legal ? 
      BoardLocation(capture2_row, capture2_col) : BoardLocation::kNoLocation;
  const Piece capture2_piece = is_capture2_legal ? 
      GetPiece(capture2_row, capture2_col) : Piece::kNoPiece; 

    // Precompute starting rows/cols for each color
  static constexpr int kStartingRow[4] = {12, -1, 1, -1};  // RED, BLUE, YELLOW, GREEN
  static constexpr int kStartingCol[4] = {-1, 1, -1, 12};  // -1 means not used

  // Later in the code:
  bool not_moved = (color == RED || color == YELLOW) 
      ? (row == kStartingRow[static_cast<int>(color)])
      : (col == kStartingCol[static_cast<int>(color)]);
    
  if (!forward_piece.Present()) [[likely]] {
    // Handle promotion or regular move
    //if (is_promotion) [[unlikely]] {
      //current = AddPromotionMoves(forward1);
    //} else {
      *current++ = Move(from, forward1);
    //}
    
    // Double step from starting position
    if (not_moved) {
      const int forward2_row = row + delta_row * 2;
      const int forward2_col = col + delta_col * 2;
      const BoardLocation forward2(forward2_row, forward2_col);
      
      // Only check the double move if the single move square was empty
      const Piece forward2_piece = GetPiece(forward2_row, forward2_col);
      if (!forward2_piece.Present()) {
        *current++ = Move(from, forward2);
      }
    }
  }
  
  // First capture direction
  if (is_capture1_legal) {
    const BoardLocation& to1 = capture1_loc;
    
    if (color == RED && col == 3 && en_passant_targets_[BLUE].GetRow() == to1.GetRow()) {
      *current++ = Move(from, to1, Piece::kNoPiece, forward1, forward_piece);
    } else if (color == BLUE && row == 3 && en_passant_targets_[YELLOW].GetCol() == to1.GetCol()) {
      *current++ = Move(from, to1, Piece::kNoPiece, forward1, forward_piece);
    } else if (color == YELLOW && col == 10 && en_passant_targets_[GREEN].GetRow() == to1.GetRow()) {
      *current++ = Move(from, to1, Piece::kNoPiece, forward1, forward_piece);
    } else if (color == GREEN && row == 10 && en_passant_targets_[RED].GetCol() == to1.GetCol()) {
      *current++ = Move(from, to1, Piece::kNoPiece, forward1, forward_piece);
    } else {
      // Regular capture - use cached piece
      const Piece& captured1 = capture1_piece;
      if (captured1.Present() && captured1.GetTeam() != my_team) {
        // Handle promotion on capture or regular capture
        //if (is_promotion) [[unlikely]] {
          //current = AddPromotionMoves(to1, captured1);
        //} else {
          *current++ = Move(from, to1, captured1);
        //}
      }
    }
  }

  // Second capture direction
  if (is_capture2_legal) {
    const BoardLocation& to2 = capture2_loc;
    
    if (color == RED && col == 10 && en_passant_targets_[GREEN].GetRow() == to2.GetRow()) {
      *current++ = Move(from, to2, Piece::kNoPiece, forward1, forward_piece);
    } else if (color == BLUE && row == 10 && en_passant_targets_[RED].GetCol() == to2.GetCol()) {
      *current++ = Move(from, to2, Piece::kNoPiece, forward1, forward_piece);
    } else if (color == YELLOW && col == 3 && en_passant_targets_[BLUE].GetRow() == to2.GetRow()) {
      *current++ = Move(from, to2, Piece::kNoPiece, forward1, forward_piece);
    } else if (color == GREEN && row == 3 && en_passant_targets_[YELLOW].GetCol() == to2.GetCol()) {
      *current++ = Move(from, to2, Piece::kNoPiece, forward1, forward_piece);
    } else {
      // Regular capture - use cached piece
      const Piece& captured2 = capture2_piece;
      if (captured2.Present() && captured2.GetTeam() != my_team) {
        // Handle promotion on capture or regular capture
        //if (is_promotion) [[unlikely]] {
          //current = AddPromotionMoves(to2, captured2);
        //} else {
          *current++ = Move(from, to2, captured2);
        //}
      }
    }
  }
  
  return current;
}

Move* Board::GetKnightMovesDirect(
    Move* moves,
    size_t limit,
    const BoardLocation& from,
    PlayerColor color,
    int& threats,
    Team my_team) const {
  //if (limit == 0) return moves;
  
  Move* current = moves;
  //const Move* const end = moves + limit;

  const int from_row = from.GetRow();
  const int from_col = from.GetCol();

  
  // All 8 possible knight moves
  constexpr std::array<std::pair<int, int>, 8> deltas = {{
      {2, 1}, {2, -1}, {-2, 1}, {-2, -1},
      {1, 2}, {1, -2}, {-1, 2}, {-1, -2}
  }};
  
  for (const auto& [dr, dc] : deltas) {
    const int to_row = from_row + dr;
    const int to_col = from_col + dc;
    
    if (!IsLegalLocation(to_row, to_col)) continue;
    
    const Piece captured = GetPiece(to_row, to_col);
    if (captured.Present()) {
      if (captured.GetTeam() != my_team) {
        *current++ = Move(from, {to_row, to_col}, captured);
        threats += 16; // Attacking opponent's piece
      }
      threats += 1; // Defending friendly piece
    } else {
      *current++ = Move(from, {to_row, to_col});
    }
  }
  
  return current;
}

// Optimized version of GetAttackers2 for limit=1 that returns as soon as it finds an attacker
bool Board::IsAttackedByTeam(Team team, const BoardLocation& location) const {
  int loc_row = location.GetRow();
  int loc_col = location.GetCol();

// Orthogonal (rook/queen) - 4 directions
constexpr std::array<std::pair<int, int>, 4> orthogonal = {{
    {0, 1}, {1, 0}, {0, -1}, {-1, 0}
}};
for (const auto& [dr, dc] : orthogonal) {
    int row = loc_row + dr;
    int col = loc_col + dc;
    while (IsLegalLocation(row, col)) {
        const auto piece = GetPiece(row, col);
        if (piece.Present()) {
            if (piece.GetTeam() == team) {
                PieceType type = piece.GetPieceType();
                if (type == QUEEN || type == ROOK) return true;
            }
            break;
        }
        row += dr;
        col += dc;
    }
}

// Diagonal (bishop/queen) - 4 directions  
constexpr std::array<std::pair<int, int>, 4> diagonal = {{
    {1, 1}, {1, -1}, {-1, -1}, {-1, 1}
}};
for (const auto& [dr, dc] : diagonal) {
    int row = loc_row + dr;
    int col = loc_col + dc;
    while (IsLegalLocation(row, col)) {
        const auto piece = GetPiece(row, col);
        if (piece.Present()) {
            if (piece.GetTeam() == team) {
                PieceType type = piece.GetPieceType();
                if (type == QUEEN || type == BISHOP) return true;
            }
            break;
        }
        row += dr;
        col += dc;
    }
}

  // Check for knight attacks
  constexpr std::array<std::pair<int, int>, 8> knight_moves = {{
    {1, 2}, {1, -2}, {-1, 2}, {-1, -2}, {2, 1}, {2, -1}, {-2, 1}, {-2, -1}
  }};

  for (const auto& [dr, dc] : knight_moves) {
    int row = loc_row + dr;
    int col = loc_col + dc;
    if (IsLegalLocation(row, col)) {
      const auto piece = GetPiece(row, col);
      if (piece.Present() && 
          piece.GetTeam() == team && 
          piece.GetPieceType() == KNIGHT) {
        return true;
      }
    }
  }

  // Combined pawn attack check - simplified
  constexpr std::pair<int, int> pawn_attacks[4][2] = {
      {{-1, -1}, {-1, 1}},   // Red attacks up-left, up-right
      {{1, -1}, {1, 1}},     // Yellow attacks down-left, down-right  
      {{-1, 1}, {1, 1}},     // Blue attacks up-right, down-right
      {{-1, -1}, {1, -1}}    // Green attacks up-left, down-left
  };

  if (team == RED_YELLOW) {
      // Check Red (color 0) and Yellow (color 2) pawns only
      for (int color : {0, 2}) {
          for (int j = 0; j < 2; ++j) {
              const auto& [dr, dc] = pawn_attacks[color][j];
              int row = loc_row + dr, col = loc_col + dc;
              if (IsLegalLocation(row, col)) {
                  const auto piece = GetPiece(row, col);
                  if (piece.Present() && piece.GetPieceType() == PAWN && piece.GetColor() == color)
                      return true;
              }
          }
      }
  } else {
      // Check Blue (color 1) and Green (color 3) pawns only
      for (int color : {1, 3}) {
          for (int j = 0; j < 2; ++j) {
              const auto& [dr, dc] = pawn_attacks[color][j];
              int row = loc_row + dr, col = loc_col + dc;
              if (IsLegalLocation(row, col)) {
                  const auto piece = GetPiece(row, col);
                  if (piece.Present() && piece.GetPieceType() == PAWN && piece.GetColor() == color)
                      return true;
              }
          }
      }
  }

  return false;
}

bool Board::IsOnPathBetween(
    const BoardLocation& from,
    const BoardLocation& to,
    const BoardLocation& between) const {
  int delta_row = from.GetRow() - to.GetRow();
  int delta_col = from.GetCol() - to.GetCol();
  int delta_row_between = from.GetRow() - between.GetRow();
  int delta_col_between = from.GetCol() - between.GetCol();
  return delta_row * delta_col_between == delta_col * delta_row_between;
}

bool Board::DiscoversCheck(
    const BoardLocation& king_location,
    const BoardLocation& move_from,
    const BoardLocation& move_to,
    Team attacking_team) const {
  int delta_row = move_from.GetRow() - king_location.GetRow();
  int delta_col = move_from.GetCol() - king_location.GetCol();
  if (std::abs(delta_row) != std::abs(delta_col)
      && delta_row != 0
      && delta_col != 0) {
    return false;
  }

  int incr_col = delta_col == 0 ? 0 : delta_col > 0 ? 1 : -1;
  int incr_row = delta_row == 0 ? 0 : delta_row > 0 ? 1 : -1;
  int row = king_location.GetRow() + incr_row;
  int col = king_location.GetCol() + incr_col;
  while (IsLegalLocation(row, col)) {
    if (row != move_from.GetRow() || col != move_from.GetCol()) {
      if (row == move_to.GetRow() && col == move_to.GetCol()) {
        return false;
      }
      const auto piece = GetPiece(row, col);
      if (piece.Present()) {
        if (piece.GetTeam() == attacking_team) {
          if (delta_row == 0 || delta_col == 0) {
            if (piece.GetPieceType() == QUEEN
                || piece.GetPieceType() == ROOK) {
              return true;
            }
          } else {
            if (piece.GetPieceType() == QUEEN
                || piece.GetPieceType() == BISHOP) {
              return true;
            }
          }
        }
        break;
      }
    }

    row += incr_row;
    col += incr_col;
  }
  return false;
}

Board::MoveGenResult Board::GetPseudoLegalMoves2(
    Move* buffer, 
    size_t limit, 
    const std::optional<Move>& pv_move) {
    auto pstart = std::chrono::high_resolution_clock::now();
    
    MoveGenResult result{0, -1};

    if (buffer == nullptr && limit == 0) {
      for (int i = 0; i < 4; ++i) {
          result.mobility_counts[i] = 20;  // Each player has 20 legal moves initially
          result.threat_counts[i] = 0;     // No immediate threats in starting position
      }
      return result; 
    }

    if (buffer == nullptr || limit == 0) return result;
    
    const PlayerColor current_color = GetTurn().GetColor();
    const Team my_team = GetTeam(current_color);
    bool has_pv_move = pv_move.has_value();
    int pv_index = -1;  // -1 means PV move not found

    const auto& pieces = piece_list_[current_color];
    const size_t num_pieces = pieces.size();

    Move* current = buffer;
    const Move* const end = buffer + limit;

    int threats = 0;
    
    for (size_t i = 0; i < num_pieces && current < end; ++i) {
        const auto& placed_piece = pieces[i];

        const auto& location = placed_piece.GetLocation();
        const auto& piece = placed_piece.GetPiece();
        const PieceType type = piece.GetPieceType();
        
        size_t before_count = current - buffer;

        // Generate moves for this piece
        switch (type) {
            case QUEEN:   {
                current = GetBishopMovesDirect(current, end - current, location, current_color, threats, my_team);
                current = GetRookMovesDirect(current, end - current, location, current_color, threats, my_team);
              } break;
            case ROOK:    current = GetRookMovesDirect(current, end - current, location, current_color, threats, my_team);
              break;
            case BISHOP:  current = GetBishopMovesDirect(current, end - current, location, current_color, threats, my_team);
              break;
            case PAWN:    current = GetPawnMovesDirect(current, location, current_color, my_team); break;
            case KNIGHT:  current = GetKnightMovesDirect(current, end - current, location, current_color, threats, my_team);
              break;
            case KING:    current = GetKingMovesDirect(current, end - current, location, current_color, my_team);
              break;
            default: assert(false && "Movegen: Invalid piece type");
        }

        
        // Count all moves for mobility
        size_t after_count = current - buffer;
        int moves_added = (after_count - before_count);
        result.mobility_counts[current_color] += moves_added;
    }

    result.threat_counts[current_color] = threats;
        
    result.count = current - buffer;

    // Check if the PV move was generated
    if (has_pv_move && pv_index == -1) {
        for (Move* m = buffer; m < current; ++m) {
            if (*m == *pv_move) {
                pv_index = m - buffer;
                break;
            }
        }
    }

    // Final updates to the result
    result.pv_index = pv_index;

    auto pgen_end = std::chrono::high_resolution_clock::now();
    auto pgen_duration = std::chrono::duration_cast<std::chrono::nanoseconds>(pgen_end - pstart);
    total_time += pgen_duration;
    call_count++;
    if (call_count % 100000 == 0) {
      auto avg_ns = total_time.count() / call_count;
      auto current_avg = pgen_duration.count() / 1;  // Current call's time in ns

      //std::cout << "--- -- [MoveGen]"
      //<< "Average: " << avg_ns << " ns, "
      //<< "Call count: " << call_count << std::endl;
    }
    return result;
}

GameResult Board::GetGameResult() {
  if (!GetKingLocation(GetTurn().GetColor()).Present()) {
    // other team won
    return GetTurn().GetTeam() == RED_YELLOW ? WIN_BG : WIN_RY;
  }
  Player player = GetTurn();

  auto result = GetPseudoLegalMoves2(move_buffer_2_, move_buffer_size_);
  size_t num_moves = result.count;
  for (size_t i = 0; i < num_moves; i++) {
    const auto& move = move_buffer_2_[i];
    MakeMove(move);
    GameResult king_capture_result = CheckWasLastMoveKingCapture();
    if (king_capture_result != IN_PROGRESS) {
      UndoMove();
      return king_capture_result;
    }
    bool legal = !IsKingInCheck(player);
    UndoMove();
    if (legal) {
      return IN_PROGRESS;
    }
  }
  if (!IsKingInCheck(player)) {
    return STALEMATE;
  }
  // No legal moves
  PlayerColor color = player.GetColor();
  if (color == RED || color == YELLOW) {
    return WIN_BG;
  }
  return WIN_RY;
}

bool Board::IsKingInCheck(const Player& player) const {
  const auto king_location = GetKingLocation(player.GetColor());

  if (!king_location.Present()) {
    return false;
  }

  return IsAttackedByTeam(OtherTeam(player.GetTeam()), king_location);
}

bool Board::IsKingInCheck(Team team) const {
  if (team == RED_YELLOW) {
    return IsKingInCheck(Player(RED)) || IsKingInCheck(Player(YELLOW));
  }
  return IsKingInCheck(Player(BLUE)) || IsKingInCheck(Player(GREEN));
}

GameResult Board::CheckWasLastMoveKingCapture() const {
  // King captured last move
  if (!moves_.empty()) {
    const auto& last_move = moves_.back();
    const auto capture = last_move.GetCapturePiece();
    if (capture.Present() && capture.GetPieceType() == KING) {
      return capture.GetTeam() == RED_YELLOW ? WIN_BG : WIN_RY;
    }
  }
  return IN_PROGRESS;
}

void Board::InitializeHash() {
  for (int color = 0; color < 4; color++) {
    for (const auto& placed_piece : piece_list_[color]) {
      UpdatePieceHash(placed_piece.GetPiece(), placed_piece.GetLocation());
    }
  }
  UpdateTurnHash(static_cast<int>(GetTurn().GetColor()));
}

void Board::MakeMove(const Move& move) {
  // Cases:
  // 1. Move
  // 2. Capture
  // 3. En passant
  // 4. Castle
  // 5. Promotion
  // 6. Capture with promotion

  const auto from = move.From();
  const auto to = move.To();
  const Piece piece = GetPiece(from);
  const PlayerColor color = piece.GetColor();  // Cache color
  const PieceType piece_type = piece.GetPieceType();  // Cache piece type
  const Team team = piece.GetTeam();  // Cache team
  /*
  if (!piece.Present()) {
    std::cerr << "Remove FATAL: Attempted to remove non-present piece" << std::endl;
    std::abort();
  }
  */
  const auto to_row = to.GetRow();
  const auto to_col = to.GetCol();
  const auto from_row = from.GetRow();
  const auto from_col = from.GetCol();
  
  // Handle en passant target for the current player
  en_passant_targets_[color] = BoardLocation::kNoLocation;
  if (piece_type == PAWN) {
    const auto row_diff = abs(from_row - to_row);
    const auto col_diff = abs(from_col - to_col);
    
    if (row_diff == 2 || col_diff == 2) {
      // Set en passant target to the square the pawn passed over
      const auto target_row = (from_row + to_row) / 2;
      const auto target_col = (from_col + to_col) / 2;
      en_passant_targets_[color] = BoardLocation(target_row, target_col);
    }
  }

  const auto ep_capture = move.GetEnpassantCapture();
  if (ep_capture.Present()) {

    const auto ep_target = move.GetEnpassantLocation();
    const auto ep_capture_color = ep_capture.GetColor();
    const auto ep_capture_team = ep_capture.GetTeam();
    const auto ep_capture_type = ep_capture.GetPieceType();

    //RemovePiece(move.To());
    auto& placed_pieces = piece_list_[ep_capture_color];
    auto it = std::find_if(placed_pieces.begin(), placed_pieces.end(),
        [&ep_target](const auto& placed_piece) {
            return placed_piece.GetLocation() == ep_target;
        });
    if (it != placed_pieces.end()) {
        placed_pieces.erase(it);
    } else {
        std::cout << "MakeMove en passant: Failed to find captured piece in piece_list_: " << std::endl
        << "color: " << static_cast<int>(color) << std::endl
        << "move: " << move << "piece: " << piece << std::endl
        << "ep_capture: " << ep_capture << std::endl;
        std::cout << "  en_passant_targets_: " << en_passant_targets_[BLUE] << std::endl;
        for (const auto& placed_piece : piece_list_[BLUE]) {
          const auto& loc = placed_piece.GetLocation();
          const auto& piece = placed_piece.GetPiece();
          std::cout << "  - " << piece << " at " << loc << std::endl;
        }
    }

    UpdatePieceHash(ep_capture, ep_target);
    location_to_piece_[ep_target.GetRow()][ep_target.GetCol()] = Piece();

    // Update piece eval
    int piece_eval = kPieceEvaluations[PAWN];
    if (ep_capture_team == RED_YELLOW) {
      piece_evaluation_ -= piece_eval;
    } else {
      piece_evaluation_ += piece_eval;
    }
    player_piece_evaluations_[ep_capture_color] -= piece_eval;
  }
  
  // Capture
  const auto standard_capture = move.GetStandardCapture();
  if (standard_capture.Present()) {
    
    const auto capture_color = standard_capture.GetColor();
    const auto capture_team = standard_capture.GetTeam();
    const auto capture_type = standard_capture.GetPieceType();

    //RemovePiece(move.To());
    auto& placed_pieces = piece_list_[capture_color];
    auto it = std::find_if(placed_pieces.begin(), placed_pieces.end(),
        [&to](const auto& placed_piece) {
            return placed_piece.GetLocation() == to;
        });
    if (it != placed_pieces.end()) {
        placed_pieces.erase(it);
    } else {
      
      this->PrintBoard();

        std::cout << "MakeMove Failed to find captured piece in piece_list_: " << std::endl
        << "color: " << static_cast<int>(color) << std::endl
        << "move: " << move << std::endl
        << "captured piece: " << standard_capture << std::endl;
        std::cout << "  en_passant_targets_: " << en_passant_targets_[RED] << std::endl;
        std::cout << "  en_passant_targets_: " << en_passant_targets_[BLUE] << std::endl;
        std::cout << "  en_passant_targets_: " << en_passant_targets_[YELLOW] << std::endl;
        std::cout << "  en_passant_targets_: " << en_passant_targets_[GREEN] << std::endl;
        for (const auto& placed_piece : piece_list_[RED]) {
          const auto& loc = placed_piece.GetLocation();
          const auto& piece = placed_piece.GetPiece();
          std::cout << "  - " << piece << " at " << loc << std::endl;
        }
        for (const auto& placed_piece : piece_list_[BLUE]) {
          const auto& loc = placed_piece.GetLocation();
          const auto& piece = placed_piece.GetPiece();
          std::cout << "  - " << piece << " at " << loc << std::endl;
        }
        for (const auto& placed_piece : piece_list_[YELLOW]) {
          const auto& loc = placed_piece.GetLocation();
          const auto& piece = placed_piece.GetPiece();
          std::cout << "  - " << piece << " at " << loc << std::endl;
        }
        for (const auto& placed_piece : piece_list_[GREEN]) {
          const auto& loc = placed_piece.GetLocation();
          const auto& piece = placed_piece.GetPiece();
          std::cout << "  - " << piece << " at " << loc << std::endl;
        }
        abort();
    }

    UpdatePieceHash(standard_capture, to);
    location_to_piece_[to_row][to_col] = Piece();

    // Update king location
    if (capture_type == KING) {
      king_locations_[capture_color] = BoardLocation::kNoLocation;
    }
    // Update piece eval
    int piece_eval = kPieceEvaluations[capture_type];
    if (capture_team == RED_YELLOW) {
      piece_evaluation_ -= piece_eval;
    } else {
      piece_evaluation_ += piece_eval;
    }
    player_piece_evaluations_[capture_color] -= piece_eval;
  }

  // Find the piece in the piece list
  auto& pieces = piece_list_[color];
  auto it = std::find_if(pieces.begin(), pieces.end(),
    [&from](const auto& placed_piece) {
        return placed_piece.GetLocation() == from;
  });
  if (it != pieces.end()) {
    // Update the piece's location by creating a new PlacedPiece with the same piece but new location
    *it = PlacedPiece(to, it->GetPiece());
  } else {
    std::cout << "MakeMove Failed to find moving piece in piece_list_: "
    << move << std::endl;
    for (const auto& placed_piece : piece_list_[BLUE]) {
      const auto& loc = placed_piece.GetLocation();
      const auto& piece = placed_piece.GetPiece();
      std::cout << "  - " << piece << " at " << loc << std::endl;
    }
    abort();
  }
  /*
  auto& placed_pieces = piece_list_[color];
  auto it = std::find_if(placed_pieces.begin(), placed_pieces.end(),
      [&from](const auto& placed_piece) {
          return placed_piece.GetLocation() == from;
      });
  if (it != placed_pieces.end()) {
      placed_pieces.erase(it);
  } else {
      std::cerr << "Failed to find captured piece in piece_list_:\n";
      std::abort();
  }
  */

  UpdatePieceHash(piece, from);
  location_to_piece_[from_row][from_col] = Piece();

  // Update king location
  if (piece_type == KING) {
    castling_rights_[color] = CastlingRights(false, false);
    king_locations_[color] = BoardLocation::kNoLocation;
  }

  //SetPiece(to, piece);
  // Update the board
  location_to_piece_[to_row][to_col] = piece;

  /*
  auto& pieces = piece_list_[color];
  pieces.emplace_back(to, piece);
  */

  UpdatePieceHash(piece, to);
  // Update king location
  if (piece_type == KING) {
    king_locations_[color] = to;
  }
  // end set piece

  const auto rook_move = move.GetRookMove();
  if (rook_move.Present()) {
    castling_rights_[color] = CastlingRights(false, false);

    // Handle the rook move for castling
    const auto rook_from = rook_move.From();
    const auto rook_to = rook_move.To();
    
    // Get the rook piece from its original position
    const auto rook_piece = GetPiece(rook_from);
    
    // Move the rook to its new position
    location_to_piece_[rook_from.GetRow()][rook_from.GetCol()] = Piece();
    location_to_piece_[rook_to.GetRow()][rook_to.GetCol()] = rook_piece;
    
    // Update the rook's position in the piece list
    auto& pieces = piece_list_[rook_piece.GetColor()];
    auto it = std::find_if(pieces.begin(), pieces.end(),
        [&rook_from](const auto& placed_piece) {
            return placed_piece.GetLocation() == rook_from;
        });
    if (it != pieces.end()) {
        *it = PlacedPiece(rook_to, it->GetPiece());
    }
    
    // Update piece hash for the rook move
    UpdatePieceHash(rook_piece, rook_from);
    UpdatePieceHash(rook_piece, rook_to);
  }

  int t = static_cast<int>(color);
  UpdateTurnHash(t);
  UpdateTurnHash((t+1)%4);

  turn_ = GetNextPlayer(GetTurn());
  moves_.push_back(move);
}


void Board::UndoMove() {
  // Cases:
  // 1. Move
  // 2. Capture
  // 3. En-passant
  // 4. Promotion
  // 5. Castling (rights, rook move)

  //assert(!moves_.empty());
  const Move& move = moves_.back();

  const BoardLocation& to = move.To();
  const BoardLocation& from = move.From();

  const auto piece = GetPiece(to);
  
  /*
  if (piece.Missing()) {
    std::cout << "piece missing in UndoMove" << std::endl;
    abort();
  }
  */
  
  const PlayerColor color = piece.GetColor();
  Player turn_before = (color == RED)    ? kRedPlayer :
                       (color == BLUE)   ? kBluePlayer :
                       (color == YELLOW) ? kYellowPlayer :
                       kGreenPlayer;
                       
  /*
  Player turn_before2 = GetPreviousPlayer(GetTurn());
  if (turn_before != turn_before2) {
    std::cout << "[UndoMove] Error: Turn mismatch: color=" << static_cast<int>(color) 
          << " current_turn=" << static_cast<int>(GetTurn().GetColor())
          << " turn_before=" << static_cast<int>(turn_before.GetColor())
          << " turn_before2=" << static_cast<int>(turn_before2.GetColor()) 
          << std::endl;
    abort();
  }
    */

  // Find and update the moved piece's location in one pass
  auto& pieces = piece_list_[color];
  auto it = std::find_if(pieces.begin(), pieces.end(),
      [&to](const auto& placed_piece) {
          return placed_piece.GetLocation() == to;
      });
  if (it != pieces.end()) {
      // Update the piece's location by creating a new PlacedPiece
      *it = PlacedPiece(from, it->GetPiece());
  } else {
      std::cerr << "Failed to find moved piece in piece_list_ during UndoMove\n";
      std::abort();
  }

  /*
  if (auto it = std::find_if(piece_list_[color].begin(), piece_list_[color].end(),
    [&to](const auto& p) { return p.GetLocation() == to; });
    it != piece_list_[color].end()) {
    piece_list_[color].erase(it);
  }
  */

  UpdatePieceHash(piece, to);
  location_to_piece_[to.GetRow()][to.GetCol()] = Piece();

  // end remove

  //SetPiece(from, piece);
  // Update the board
  location_to_piece_[from.GetRow()][from.GetCol()] = piece;

  /*
  auto& pieces = piece_list_[color];
  pieces.emplace_back(from, piece);
  */

  UpdatePieceHash(piece, from);

  // Update king location
  if (piece.GetPieceType() == KING) {
    castling_rights_[color] = CastlingRights(false, false);
    king_locations_[color] = from;
  }
  //end set piece

  const auto ep_capture = move.GetEnpassantCapture();
  if (ep_capture.Present()) {
    const auto ep_loc = move.GetEnpassantLocation();
    location_to_piece_[ep_loc.GetRow()][ep_loc.GetCol()] = ep_capture;
    piece_list_[ep_capture.GetColor()].emplace_back(ep_loc, ep_capture);
    UpdatePieceHash(ep_capture, ep_loc);
    
    const int piece_eval = kPieceEvaluations[PAWN];
    const int sign = (ep_capture.GetTeam() == RED_YELLOW) ? 1 : -1;
    piece_evaluation_ += sign * piece_eval;
    player_piece_evaluations_[ep_capture.GetColor()] += piece_eval;
  }

  // Place back captured pieces
  const auto standard_capture = move.GetStandardCapture();
  if (standard_capture.Present()) {
      location_to_piece_[to.GetRow()][to.GetCol()] = standard_capture;
      piece_list_[standard_capture.GetColor()].emplace_back(to, standard_capture);
      UpdatePieceHash(standard_capture, to);
      // Update king location if needed
      if (standard_capture.GetPieceType() == KING) {
          king_locations_[standard_capture.GetColor()] = to;
      }
      
      // Update piece evaluation
      const int piece_eval = kPieceEvaluations[standard_capture.GetPieceType()];
      const int sign = (standard_capture.GetTeam() == RED_YELLOW) ? 1 : -1;
      piece_evaluation_ += sign * piece_eval;
      player_piece_evaluations_[standard_capture.GetColor()] += piece_eval;
  }

  // Clear en passant target for the current player when undoing a move
  en_passant_targets_[color] = BoardLocation::kNoLocation;

  const auto rook_move = move.GetRookMove();
  if (rook_move.Present()) {

    castling_rights_[color] = move.GetInitialCastlingRights();

    // Undo the rook move for castling
    const auto rook_from = rook_move.From();
    const auto rook_to = rook_move.To();
    
    // Get the rook piece from its current position
    const auto rook_piece = GetPiece(rook_to);
    
    // Move the rook back to its original position
    location_to_piece_[rook_to.GetRow()][rook_to.GetCol()] = Piece();
    location_to_piece_[rook_from.GetRow()][rook_from.GetCol()] = rook_piece;
    
    // Update the rook's position in the piece list
    auto& pieces = piece_list_[rook_piece.GetColor()];
    auto it = std::find_if(pieces.begin(), pieces.end(),
        [&rook_to](const auto& placed_piece) {
            return placed_piece.GetLocation() == rook_to;
        });
    if (it != pieces.end()) {
        *it = PlacedPiece(rook_from, it->GetPiece());
    }
    
    // Update piece hash for the rook move
    UpdatePieceHash(rook_piece, rook_to);
    UpdatePieceHash(rook_piece, rook_from);
  }
  
  turn_ = turn_before;
  moves_.pop_back();
  int t = static_cast<int>(GetTurn().GetColor());
  UpdateTurnHash(t);
  UpdateTurnHash((t+1)%4);
}

BoardLocation Board::GetKingLocation(PlayerColor color) const {
  return king_locations_[color];
}

Team Board::TeamToPlay() const {
  return GetTeam(GetTurn().GetColor());
}

int Board::PieceEvaluation() const {
  /*
  assert(player_piece_evaluations_[RED]
       + player_piece_evaluations_[YELLOW]
       - player_piece_evaluations_[BLUE]
       - player_piece_evaluations_[GREEN]
       == piece_evaluation_);
  */
  return piece_evaluation_;
}

int Board::PieceEvaluation(PlayerColor color) const {
  return player_piece_evaluations_[color];
}

Board::Board(
    Player turn,
    std::unordered_map<BoardLocation, Piece> location_to_piece,
    std::optional<std::unordered_map<Player, CastlingRights>> castling_rights,
    std::optional<EnpassantInitialization> enp)
  : turn_(std::move(turn)) {
  // Initialize en passant targets for all players
  for (int i = 0; i < 4; ++i) {
    en_passant_targets_[i] = BoardLocation::kNoLocation;
  }

  for (int color = 0; color < 4; color++) {
    castling_rights_[color] = CastlingRights(false, false);
    if (castling_rights.has_value()) {
      auto& cr = *castling_rights;
      Player pl(static_cast<PlayerColor>(color));
      auto it = cr.find(pl);
      if (it != cr.end()) {
        castling_rights_[color] = it->second;
      }
    }
  }
  if (enp.has_value()) {
    enp_ = std::move(*enp);
  }
  move_buffer_.reserve(1000);

  for (int i = 0; i < 14; ++i) {
    for (int j = 0; j < 14; ++j) {
      locations_[i][j] = BoardLocation(i, j);
      location_to_piece_[i][j] = Piece();
    }
  }

  for (int i = 0; i < 4; i++) {
    piece_list_.push_back(std::vector<PlacedPiece>());
    piece_list_[i].reserve(16);
    king_locations_[i] = BoardLocation::kNoLocation;
  }

  for (const auto& it : location_to_piece) {
    const auto& location = it.first;
    const auto& piece = it.second;
    PlayerColor color = piece.GetColor();
    location_to_piece_[location.GetRow()][location.GetCol()] = piece;
    piece_list_[piece.GetColor()].push_back(PlacedPiece(
          locations_[location.GetRow()][location.GetCol()],
          piece));
    PieceType piece_type = piece.GetPieceType();
    if (piece.GetTeam() == RED_YELLOW) {
      piece_evaluation_ += kPieceEvaluations[static_cast<int>(piece_type)];
    } else {
      piece_evaluation_ -= kPieceEvaluations[static_cast<int>(piece_type)];
    }
    player_piece_evaluations_[piece.GetColor()] += kPieceEvaluations[static_cast<int>(piece_type)];
    if (piece.GetPieceType() == KING) {
      king_locations_[color] = location;
    }
  }

  struct {
    bool operator()(const PlacedPiece& a, const PlacedPiece& b) {
      // this doesn't need to be fast.
      int piece_move_order_scores[6];
      piece_move_order_scores[PAWN] = 1;
      piece_move_order_scores[KNIGHT] = 2;
      piece_move_order_scores[BISHOP] = 3;
      piece_move_order_scores[ROOK] = 4;
      piece_move_order_scores[QUEEN] = 5;
      piece_move_order_scores[KING] = 0;

      int order_a = piece_move_order_scores[a.GetPiece().GetPieceType()];
      int order_b = piece_move_order_scores[b.GetPiece().GetPieceType()];
      return order_a < order_b;
    }
  } customLess;

  for (auto& placed_pieces : piece_list_) {
    std::sort(placed_pieces.begin(), placed_pieces.end(), customLess);
  }

  // Initialize hashes for each piece at each location, and each turn
  std::srand(958829);
  for (int color = 0; color < 4; color++) {
    turn_hashes_[color] = rand64();
  }
  for (int color = 0; color < 4; color++) {
    for (int piece_type = 0; piece_type < 6; piece_type++) {
      for (int row = 0; row < 14; row++) {
        for (int col = 0; col < 14; col++) {
          piece_hashes_[color][piece_type][row][col] = rand64();
        }
      }
    }
  }

  InitializeHash();
}

inline Team GetTeam(PlayerColor color) {
  return (color == RED || color == YELLOW) ? RED_YELLOW : BLUE_GREEN;
}

Player GetNextPlayer(const Player& player) {
  switch (player.GetColor()) {
  case RED:
    return kBluePlayer;
  case BLUE:
    return kYellowPlayer;
  case YELLOW:
    return kGreenPlayer;
  case GREEN:
  default:
    return kRedPlayer;
  }
}

Player GetPartner(const Player& player) {
  switch (player.GetColor()) {
  case RED:
    return kYellowPlayer;
  case BLUE:
    return kGreenPlayer;
  case YELLOW:
    return kRedPlayer;
  case GREEN:
  default:
    return kBluePlayer;
  }
}

Player GetPreviousPlayer(const Player& player) {
  switch (player.GetColor()) {
  case RED:
    return kGreenPlayer;
  case BLUE:
    return kRedPlayer;
  case YELLOW:
    return kBluePlayer;
  case GREEN:
  default:
    return kYellowPlayer;
  }
}

std::shared_ptr<Board> Board::CreateStandardSetup() {
  std::unordered_map<BoardLocation, Piece> location_to_piece;
  std::unordered_map<Player, CastlingRights> castling_rights;

  std::vector<PieceType> piece_types = {
    ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK,
  };
  std::vector<PlayerColor> player_colors = {RED, BLUE, YELLOW, GREEN};

  for (const PlayerColor& color : player_colors) {
    Player player(color);
    castling_rights[player] = CastlingRights(true, true);

    BoardLocation piece_location;
    int delta_row = 0;
    int delta_col = 0;
    int pawn_offset_row = 0;
    int pawn_offset_col = 0;

    switch (color) {
    case RED:
      piece_location = BoardLocation(13, 3);
      delta_col = 1;
      pawn_offset_row = -1;
      break;
    case BLUE:
      piece_location = BoardLocation(3, 0);
      delta_row = 1;
      pawn_offset_col = 1;
      break;
    case YELLOW:
      piece_location = BoardLocation(0, 10);
      delta_col = -1;
      pawn_offset_row = 1;
      break;
    case GREEN:
      piece_location = BoardLocation(10, 13);
      delta_row = -1;
      pawn_offset_col = -1;
      break;
    default:
      assert(false);
      break;
    }

    for (const PieceType piece_type : piece_types) {
      BoardLocation pawn_location = piece_location.Relative(
          pawn_offset_row, pawn_offset_col);
      location_to_piece[piece_location] = Piece(player.GetColor(), piece_type);
      location_to_piece[pawn_location] = Piece(player.GetColor(), PAWN);
      piece_location = piece_location.Relative(delta_row, delta_col);
    }
  }

  return std::make_shared<Board>(
      Player(RED), std::move(location_to_piece), std::move(castling_rights));
}

int Move::ManhattanDistance() const {
  return std::abs(from_.GetRow() - to_.GetRow())
       + std::abs(from_.GetCol() - to_.GetCol());
}

namespace {

std::string ToStr(PlayerColor color) {
  switch (color) {
  case RED:
    return "RED";
  case BLUE:
    return "BLUE";
  case YELLOW:
    return "YELLOW";
  case GREEN:
    return "GREEN";
  default:
    return "UNINITIALIZED_PLAYER";
  }
}

std::string ToStr(PieceType piece_type) {
  switch (piece_type) {
  case PAWN:
    return "P";
  case ROOK:
    return "R";
  case KNIGHT:
    return "N";
  case BISHOP:
    return "B";
  case KING:
    return "K";
  case QUEEN:
    return "Q";
  default:
    return "U";
  }
}

}  // namespace

std::ostream& operator<<(
    std::ostream& os, const Piece& piece) {
  os << ToStr(piece.GetColor()) << "(" << ToStr(piece.GetPieceType()) << ")";
  return os;
}

std::ostream& operator<<(
    std::ostream& os, const PlacedPiece& placed_piece) {
  os << placed_piece.GetPiece() << "@" << placed_piece.GetLocation();
  return os;
}

std::ostream& operator<<(
    std::ostream& os, const Player& player) {
  os << "Player(" << ToStr(player.GetColor()) << ")";
  return os;
}

std::ostream& operator<<(
    std::ostream& os, const BoardLocation& location) {
  os << "Loc(" << (int)location.GetRow() << ", " << (int)location.GetCol() << ")";
  return os;
}

std::ostream& operator<<(std::ostream& os, const Move& move) {
  os << "Move(" << move.From() << " -> " << move.To() << ")";
  return os;
}

std::ostream& operator<<(
    std::ostream& os, const Board& board) {
  for (int i = 0; i < 14; i++) {
    for (int j = 0; j < 14; j++) {
      if (board.IsLegalLocation(BoardLocation(i, j))) {
        const auto piece = board.location_to_piece_[i][j];
        if (piece.Missing()) {
          os << ".";
        } else {
          os << ToStr(piece.GetPieceType());
        }
      } else {
        os << "-";
      }
    }
    os << std::endl;
  }

  os << "Turn: " << board.GetTurn() << std::endl;

  os << "All moves: " << std::endl;
  for (const auto& move : board.moves_) {
    os << move << std::endl;
  }
  return os;
}

const CastlingRights& Board::GetCastlingRights(const Player& player) {
  return castling_rights_[player.GetColor()];
}

std::optional<CastlingType> Board::GetRookLocationType(
    const Player& player, const BoardLocation& location) const {
  switch (player.GetColor()) {
  case RED:
    if (location == kRedInitialRookLocationKingside) {
      return KINGSIDE;
    } else if (location == kRedInitialRookLocationQueenside) {
      return QUEENSIDE;
    }
    break;
  case BLUE:
    if (location == kBlueInitialRookLocationKingside) {
      return KINGSIDE;
    } else if (location == kBlueInitialRookLocationQueenside) {
      return QUEENSIDE;
    }
    break;
  case YELLOW:
    if (location == kYellowInitialRookLocationKingside) {
      return KINGSIDE;
    } else if (location == kYellowInitialRookLocationQueenside) {
      return QUEENSIDE;
    }
    break;
  case GREEN:
    if (location == kGreenInitialRookLocationKingside) {
      return KINGSIDE;
    } else if (location == kGreenInitialRookLocationQueenside) {
      return QUEENSIDE;
    }
    break;
  default:
    assert(false);
    break;
  }
  return std::nullopt;
}

Team OtherTeam(Team team) {
  return team == RED_YELLOW ? BLUE_GREEN : RED_YELLOW;
}

std::string BoardLocation::PrettyStr() const {
  std::string s;
  s += ('a' + GetCol());
  s += std::to_string(14 - GetRow());
  return s;
}

std::string Move::PrettyStr() const {
  std::string s = from_.PrettyStr() + "-" + to_.PrettyStr();
  if (promotion_piece_type_ != NO_PIECE) {
    s += "=" + ToStr(promotion_piece_type_);
  }
  return s;
}

Move* Board::GetRookMovesDirect(
    Move* moves,
    size_t limit,
    const BoardLocation& from,
    PlayerColor color,
    int& threats,
    Team my_team
  ) const {
    Move* current = moves;
    const int from_row = from.GetRow();
    const int from_col = from.GetCol();
    
    // Direction 1: Right (0, 1)
    {
        int8_t r = from_row;
        int8_t c = from_col + 1;
        while (true) {
            if (!IsLegalLocation(r, c)) break;
            const Piece captured = GetPiece(r, c);
            if (captured.Present()) {
                if (captured.GetTeam() != my_team) {
                    *current++ = Move(from, {r, c}, captured);
                    threats += 16;
                }
                threats += 4;
                break;
            }
            *current++ = Move(from, {r, c});
            threats++;
            c++;
        }
    }
    
    // Direction 2: Left (0, -1)
    {
        int8_t r = from_row;
        int8_t c = from_col - 1;
        while (true) {
            if (!IsLegalLocation(r, c)) break;
            const Piece captured = GetPiece(r, c);
            if (captured.Present()) {
                if (captured.GetTeam() != my_team) {
                    *current++ = Move(from, {r, c}, captured);
                    threats += 16;
                }
                threats += 4;
                break;
            }
            *current++ = Move(from, {r, c});
            threats++;
            c--;
        }
    }
    
    // Direction 3: Down (1, 0)
    {
        int8_t r = from_row + 1;
        int8_t c = from_col;
        while (true) {
            if (!IsLegalLocation(r, c)) break;
            const Piece captured = GetPiece(r, c);
            if (captured.Present()) {
                if (captured.GetTeam() != my_team) {
                    *current++ = Move(from, {r, c}, captured);
                    threats += 16;
                }
                threats += 4;
                break;
            }
            *current++ = Move(from, {r, c});
            threats++;
            r++;
        }
    }
    
    // Direction 4: Up (-1, 0)
    {
        int8_t r = from_row - 1;
        int8_t c = from_col;
        while (true) {
            if (!IsLegalLocation(r, c)) break;
            const Piece captured = GetPiece(r, c);
            if (captured.Present()) {
                if (captured.GetTeam() != my_team) {
                    *current++ = Move(from, {r, c}, captured);
                    threats += 16;
                }
                threats += 4;
                break;
            }
            *current++ = Move(from, {r, c});
            threats++;
            r--;
        }
    }
    
    return current;
}

Move* Board::GetBishopMovesDirect(
    Move* moves,
    size_t limit,
    const BoardLocation& from,
    PlayerColor color,
    int& threats,
    Team my_team
) const {
  Move* current = moves;
  const int8_t row = from.GetRow();
  const int8_t col = from.GetCol();
  
  // Direction 1: Down-Right (1, 1)
  {
    int8_t r = row + 1;
    int8_t c = col + 1;
    while (true) {
      if (!IsLegalLocation(r, c)) break;
      const Piece captured = GetPiece(r, c);
      if (captured.Present()) {
        if (captured.GetTeam() != my_team) {
          *current++ = Move(from, {r, c}, captured);
          threats += 16;
        }
        threats += 4;
        break;
      }
      *current++ = Move(from, {r, c});
      threats++;
      r++;
      c++;
    }
  }
  
  // Direction 2: Down-Left (1, -1)
  {
    int8_t r = row + 1;
    int8_t c = col - 1;
    while (true) {
      if (!IsLegalLocation(r, c)) break;
      const Piece captured = GetPiece(r, c);
      if (captured.Present()) {
        if (captured.GetTeam() != my_team) {
          *current++ = Move(from, {r, c}, captured);
          threats += 16;
        }
        threats += 4;
        break;
      }
      *current++ = Move(from, {r, c});
      threats++;
      r++;
      c--;
    }
  }
  
  // Direction 3: Up-Right (-1, 1)
  {
    int8_t r = row - 1;
    int8_t c = col + 1;
    while (true) {
      if (!IsLegalLocation(r, c)) break;
      const Piece captured = GetPiece(r, c);
      if (captured.Present()) {
        if (captured.GetTeam() != my_team) {
          *current++ = Move(from, {r, c}, captured);
          threats += 16;
        }
        threats += 4;
        break;
      }
      *current++ = Move(from, {r, c});
      threats++;
      r--;
      c++;
    }
  }
  
  // Direction 4: Up-Left (-1, -1)
  {
    int8_t r = row - 1;
    int8_t c = col - 1;
    while (true) {
      if (!IsLegalLocation(r, c)) break;
      const Piece captured = GetPiece(r, c);
      if (captured.Present()) {
        if (captured.GetTeam() != my_team) {
          *current++ = Move(from, {r, c}, captured);
          threats += 16;
        }
        threats += 4;
        break;
      }
      *current++ = Move(from, {r, c});
      threats++;
      r--;
      c--;
    }
  }
  
  return current;
}

Move* Board::GetKingMovesDirect(
    Move* moves,
    size_t limit,
    const BoardLocation& from,
    PlayerColor color,
    Team my_team) const {
  //if (limit == 0) return moves;
  
  Move* current = moves;
  const Move* const end = moves + limit;
  
  const Team enemy_team = OtherTeam(my_team);
  // (row, col)
  // First parameter = row (y-coordinate)
  // Second parameter = column (x-coordinate)
  const int row = from.GetRow();
  const int col = from.GetCol();
  
  const CastlingRights& castling_rights = castling_rights_[color];

    // up-left
    if (IsLegalLocation(row - 1, col - 1)) {
      //if (!IsAttackedByTeam(enemy_team, {row - 1, col - 1})) {
        const Piece captured = GetPiece(row - 1, col - 1);
        if (captured.Missing() || captured.GetTeam() != my_team) {
            *current++ = Move(from, {row - 1, col - 1}, captured, castling_rights, CastlingRights(false, false));
        }
      //}
    }

    // up-right
    if (IsLegalLocation(row - 1, col + 1)) {
        const Piece captured = GetPiece(row - 1, col + 1);
        if (captured.Missing() || captured.GetTeam() != my_team) {
            *current++ = Move(from, {row - 1, col + 1}, captured, castling_rights, CastlingRights(false, false));
        }
    }

    // down-left
    if (IsLegalLocation(row + 1, col - 1)) {
        const Piece captured = GetPiece(row + 1, col - 1);
        if (captured.Missing() || captured.GetTeam() != my_team) {
            *current++ = Move(from, {row + 1, col - 1}, captured, castling_rights, CastlingRights(false, false));
        }
    }

    // down-right
    if (IsLegalLocation(row + 1, col + 1)) {
        const Piece captured = GetPiece(row + 1, col + 1);
        if (captured.Missing() || captured.GetTeam() != my_team) {
            *current++ = Move(from, {row + 1, col + 1}, captured, castling_rights, CastlingRights(false, false));
        }
    }

    // up
    if (IsLegalLocation(row - 1, col)) {
      const Piece captured = GetPiece(row - 1, col);
      if (captured.Missing()) {
        *current++ = Move(from, {row - 1, col});

        // Blue queenside castling
        if (color == BLUE &&
            castling_rights.Queenside() && 
            !GetPiece({4, 0}).Present() && // Knight square
            !GetPiece({5, 0}).Present() && // Bishop square
            //!GetPiece({6, 0}).Present() && // Queen, empty!
            (GetPiece({3, 0}) == Piece(BLUE, ROOK)) &&
            !IsAttackedByTeam(enemy_team, {5, 0}) && // Bishop square
            !IsAttackedByTeam(enemy_team, {6, 0}) && // Queen square
            !IsAttackedByTeam(enemy_team, {7, 0}) // King
            ) {
            *current++ = Move(
                {7, 0},  // king_from
                {5, 0},  // king_to
                SimpleMove({3, 0}, {6, 0}),  // rook_from, rook_to
                castling_rights,
                CastlingRights(false, false)
            );
        }

        // Green kingside castling
        if (color == GREEN &&
            castling_rights.Kingside() &&
            !GetPiece({4, 13}).Present() && // knight
            //!GetPiece({4, 13}).Present() && // bishop, empty!
            (GetPiece({3, 13}) == Piece(GREEN, ROOK)) &&
            !IsAttackedByTeam(enemy_team, {6, 13}) &&  // king
            !IsAttackedByTeam(enemy_team, {5, 13}) &&  // bishop square
            !IsAttackedByTeam(enemy_team, {4, 13})) {  // knight square
            
            *current++ = Move(
                {6, 13},  // king_from
                {4, 13},  // king_to
                SimpleMove({3, 13}, {5, 13}),  // rook_from, rook_to
                castling_rights,
                CastlingRights(false, false)
            );
        }
      } else if (captured.GetTeam() != my_team) {
        *current++ = Move(from, {row - 1, col}, captured, castling_rights, CastlingRights(false, false));
      }
    }

    // left
    if (IsLegalLocation(row, col - 1)) {
      const Piece captured = GetPiece(row, col - 1);
      if (captured.Missing()) {
        *current++ = Move(from, {row, col - 1});

        // Red queenside castling - optimized
        if (color == RED &&
            castling_rights.Queenside() &&
            !GetPiece({13, 4}).Present() && // knight
            !GetPiece({13, 5}).Present() && // bishop
            // queen square is empty
            (GetPiece({13, 3}) == Piece(RED, ROOK)) &&
            !IsAttackedByTeam(enemy_team, {13, 7}) &&  // king
            !IsAttackedByTeam(enemy_team, {13, 6}) &&  // queen
            !IsAttackedByTeam(enemy_team, {13, 5}))  // bishop
          {
            
            *current++ = Move(
              {13, 7},  // king_from
              {13, 5},  // king_to
              SimpleMove({13, 3}, {13, 6}),  // rook_from, rook_to
              castling_rights,
              CastlingRights(false, false)
            );
        }
        // YELLOW kingside castling - optimized
        if (color == YELLOW &&
            castling_rights.Kingside() &&
            !GetPiece({0, 4}).Present() && // knight
            // bishop is empty
            (GetPiece({0, 3}) == Piece(YELLOW, ROOK)) &&
            !IsAttackedByTeam(enemy_team, {0, 6}) &&  // king
            !IsAttackedByTeam(enemy_team, {0, 5}) &&  // bishop
            !IsAttackedByTeam(enemy_team, {0, 4})) {  // knight
      
            *current++ = Move(
                {0, 6},  // king_from
                {0, 4},  // king_to
                SimpleMove({0, 3}, {0, 5}),  // rook_from, rook_to
                castling_rights,
                CastlingRights(false, false)
            );
        }   
      } else if (captured.GetTeam() != my_team) {
        *current++ = Move(from, {row, col - 1}, captured, castling_rights, CastlingRights(false, false));
      }
    }

    // right
    if (IsLegalLocation(row, col + 1)) {
      const Piece captured = GetPiece(row, col + 1);
      if (captured.Missing()) {
        *current++ = Move(from, {row, col + 1});
        // RED kingside castling - optimized
        if (color == RED &&
            castling_rights.Kingside() &&
            !GetPiece({13, 9}).Present() &&  // knight
            // bishop empty
            (GetPiece({13, 10}) == Piece(RED, ROOK)) &&
            !IsAttackedByTeam(enemy_team, {13, 7}) &&  // king
            !IsAttackedByTeam(enemy_team, {13, 8}) &&  // bishop
            !IsAttackedByTeam(enemy_team, {13, 9})) {  // knight
            
            *current++ = Move(
                {13, 7},  // king_from
                {13, 9},  // king_to
                SimpleMove({13, 10}, {13, 8}),  // rook_from, rook_to
                castling_rights,
                CastlingRights(false, false)
            );
        }
        // YELLOW queenside castling - optimized
        if (color == YELLOW &&
            castling_rights.Queenside() &&
            !GetPiece({0, 9}).Present() &&  // knight
            !GetPiece({0, 8}).Present() &&  // bishop
            // queen empty
            (GetPiece({0, 10}) == Piece(YELLOW, ROOK)) &&
            !IsAttackedByTeam(enemy_team, {0, 6}) &&  // king
            !IsAttackedByTeam(enemy_team, {0, 7}) &&  // queen
            !IsAttackedByTeam(enemy_team, {0, 8}))  // bishop
            {
            
            *current++ = Move(
                {0, 6},  // king_from
                {0, 8},  // king_to
                SimpleMove({0, 10}, {0, 7}),  // rook_from, rook_to
                castling_rights,
                CastlingRights(false, false)
            );
        }
      } else if (captured.GetTeam() != my_team) {
        *current++ = Move(from, {row, col + 1}, captured, castling_rights, CastlingRights(false, false));
      }
    }
  // down
    if (IsLegalLocation(row + 1, col)) {

      const Piece captured = GetPiece(row + 1, col);
      if (captured.Missing()) {
        *current++ = Move(from, {row + 1, col});
        // BLUE kingside castling
          if (color == BLUE &&
              castling_rights.Kingside() &&
              !GetPiece({9, 0}).Present() &&  // knight
              // bishop empty
              (GetPiece({10, 0}) == Piece(BLUE, ROOK)) &&
              !IsAttackedByTeam(enemy_team, {7, 0}) &&  // king
              !IsAttackedByTeam(enemy_team, {8, 0}) &&  // bishop
              !IsAttackedByTeam(enemy_team, {9, 0})) {  // knight
        
          *current++ = Move(
              {7, 0},  // king_from
              {9, 0},  // king_to
              SimpleMove({10, 0}, {8, 0}),  // rook_from, rook_to
              castling_rights,
              CastlingRights(false, false)
          );
        }
        // GREEN queenside castling
        if (color == GREEN &&
          castling_rights.Queenside() &&
          // queen empty
          !GetPiece({8, 13}).Present() && // bishop
          !GetPiece({9, 13}).Present() && // knight
          (GetPiece({10, 13}) == Piece(GREEN, ROOK)) &&
          !IsAttackedByTeam(enemy_team, {6, 13}) &&  // king
          !IsAttackedByTeam(enemy_team, {7, 13}) &&  // queen
          !IsAttackedByTeam(enemy_team, {8, 13})) // bishop
          {  // King's path
    
          *current++ = Move(
              {6, 13},  // king_from
              {8, 13},  // king_to
              SimpleMove({10, 13}, {7, 13}),  // rook_from, rook_to
              castling_rights,
              CastlingRights(false, false)
          );
        }
      } else if (captured.GetTeam() != my_team) {
        *current++ = Move(from, {row + 1, col}, captured, castling_rights, CastlingRights(false, false));
      }
    }
  
  return current;
}

void Board::PrintBoard() const {
  // Print top border
  std::cout << "   ";
  std::cout << "  +" << std::string(14 * 2 + 1, '-') << "+\n";

  // Print board
  for (int row = 0; row < 14; ++row) {
    std::cout << "   | ";

    for (int col = 0; col < 14; ++col) {
      const Piece& piece = GetPiece(row, col);
      
      if (piece.Missing()) {
        std::cout << ". ";
      } else {
        // Use different colors for different players
        switch (piece.GetColor()) {
          case RED:    std::cout << "\033[1;31m"; break;    // Red
          case BLUE:   std::cout << "\033[1;34m"; break;    // Blue
          case YELLOW: std::cout << "\033[1;33m"; break;    // Yellow
          case GREEN:  std::cout << "\033[1;32m"; break;    // Green
          default:     std::cout << "\033[0m";
        }

        // Print piece symbol
        switch (piece.GetPieceType()) {
          case KING:   std::cout << "K"; break;
          case QUEEN:  std::cout << "Q"; break;
          case ROOK:   std::cout << "R"; break;
          case BISHOP: std::cout << "B"; break;
          case KNIGHT: std::cout << "N"; break;
          case PAWN:   std::cout << "P"; break;
          default:     std::cout << "?";
        }
        
        std::cout << "\033[0m ";  // Reset color
      }
    }
    std::cout << "|\n";
  }

  // Print bottom border
  std::cout << "   ";
  std::cout << "  +" << std::string(14 * 2 + 1, '-') << "+\n";

  // Print current turn
  std::cout << "\nCurrent turn: " << ToStr(GetTurn().GetColor()) << "\n";
}

}  // namespace chess

