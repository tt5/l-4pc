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


void AddPawnMoves2(
    MoveBuffer& moves,
    const BoardLocation& from,
    const BoardLocation& to,
    const PlayerColor color,
    const Piece capture = Piece::kNoPiece,
    const BoardLocation en_passant_location = BoardLocation::kNoLocation,
    const Piece en_passant_capture = Piece::kNoPiece) {
  bool is_promotion = false;

  constexpr int kRedPromotionRow = 3;
  constexpr int kYellowPromotionRow = 10;
  constexpr int kBluePromotionCol = 10;
  constexpr int kGreenPromotionCol = 3;

  switch (color) {
  case RED:
    is_promotion = to.GetRow() == kRedPromotionRow;
    break;
  case BLUE:
    is_promotion = to.GetCol() == kBluePromotionCol;
    break;
  case YELLOW:
    is_promotion = to.GetRow() == kYellowPromotionRow;
    break;
  case GREEN:
    is_promotion = to.GetCol() == kGreenPromotionCol;
    break;
  default:
    assert(false);
    break;
  }

  if (is_promotion) {
    moves.AddPawnMove(from, to, capture, en_passant_location, en_passant_capture, KNIGHT);
    moves.AddPawnMove(from, to, capture, en_passant_location, en_passant_capture, BISHOP);
    moves.AddPawnMove(from, to, capture, en_passant_location, en_passant_capture, ROOK);
    moves.AddPawnMove(from, to, capture, en_passant_location, en_passant_capture, QUEEN);
  } else {
    moves.AddPawnMove(from, to, capture, en_passant_location, en_passant_capture);
  }
}

}  // namespace

Move* Board::GetPawnMovesDirect(
    Move* current,
    const BoardLocation& from,
    PlayerColor color
  ) const {
  int row = from.GetRow();
  int col = from.GetCol();

  const PlayerColor teammate_color = static_cast<PlayerColor>((static_cast<int>(color) + 2) & 0x3);

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

  // Lookup table for en passant conditions: [color] -> {check1, check2, check_row, check_col}
  // check1, check2: values to check against (3 or 10)
  // check_row: whether to check row (1) or not (0)
  // check_col: whether to check column (1) or not (0)
  static constexpr int kEnPassantConditions[4][4] = {
    {3, 10, 1, 0},  // RED: check row == 3 or 10
    {3, 10, 0, 1},  // BLUE: check col == 3 or 10
    {3, 10, 1, 0},  // YELLOW: check row == 3 or 10
    {3, 10, 0, 1}   // GREEN: check col == 3 or 10
  };
  */

  // Precompute promotion check using lookup table
  //const int* promo_cond = kPromotionConditions[static_cast<int>(color)];
  // Simplified promotion check - the -1 values in promo_cond make the other comparison always false
  //const bool is_promotion = (promo_cond[0] == row) || (promo_cond[1] == col);

  // Cache the move count and initialize en passant variables
  //const size_t move_count = moves_.size();
  //bool has_ep = false;
  //BoardLocation ep_loc = BoardLocation::kNoLocation;  // Use sentinel value instead of optional

  /*
  // Check if pawn is on a relevant rank/file for en passant
  const int* ep_cond = kEnPassantConditions[static_cast<int>(color)];
  const bool can_en_passant = 
      (ep_cond[2] && (row == ep_cond[0] || row == ep_cond[1])) ||
      (ep_cond[3] && (col == ep_cond[0] || col == ep_cond[1]));

  if (can_en_passant && move_count > 0) [[unlikely]] {
      // Check last move for en passant
      const Move& last_move = moves_.back();
      const BoardLocation& last_ep_loc = last_move.GetEnpassantLocation();
      if (last_ep_loc.Present()) {
          has_ep = true;
          ep_loc = last_ep_loc;
      } else if (move_count >= 3) {
          // Check third-to-last move for en passant
          const Move& third_last_move = moves_[move_count - 3];
          const BoardLocation& third_last_ep_loc = third_last_move.GetEnpassantLocation();
          if (third_last_ep_loc.Present()) {
              has_ep = true;
              ep_loc = third_last_ep_loc;
          }
      }
  }
  */


  /*
  // Helper function to add promotion moves
  auto AddPromotionMoves = [&](const BoardLocation& to, const Piece& captured = Piece::kNoPiece) -> Move* {
    *current++ = Move(from, to, captured, BoardLocation::kNoLocation, Piece::kNoPiece, QUEEN);
    return current;
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
    // RED: moves up, captures up-left and up-right
    {-1, 0, -1, -1, -1, 1},
    // BLUE: moves right, captures up-right and down-right
    {0, 1, -1, 1, 1, 1},
    // YELLOW: moves down, captures down-left and down-right
    {1, 0, 1, -1, 1, 1},
    // GREEN: moves left, captures up-left and down-left
    {0, -1, -1, -1, 1, -1}
  };
  
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
   // }
    
    // Double step from starting position
    if (not_moved) {
      const int forward2_row = row + delta_row * 2;
      const int forward2_col = col + delta_col * 2;
      const BoardLocation forward2(forward2_row, forward2_col);
      
      // Only check the double move if the single move square was empty
      const Piece forward2_piece = GetPiece(forward2_row, forward2_col);
      if (!forward2_piece.Present()) {
        const BoardLocation ep_target(forward_row, forward_col);
        *current++ = Move(from, forward2, Piece::kNoPiece, ep_target, Piece::kNoPiece, NO_PIECE);
      }
    }
  }
  
  // First capture direction
  if (is_capture1_legal) {
    const BoardLocation& to1 = capture1_loc;
    
    // Check for en passant first (cheaper than GetPiece)
    //if (has_ep && to1 == ep_loc) {
        //*current++ = Move(from, to1, Piece::kNoPiece, ep_loc, <captured-pawn, can create new pawn?>, NO_PIECE);
        // for now just normal move
        //*current++ = Move(from, to1);
    //} else {
      // Regular capture - use cached piece
      const Piece& captured1 = capture1_piece;
      const PlayerColor captured1_color = captured1.GetColor();
      if (captured1.Present() && captured1_color != color && captured1_color != teammate_color) {
        // Handle promotion on capture or regular capture
        //if (is_promotion) [[unlikely]] {
          //current = AddPromotionMoves(to1, captured1);
        //} else {
          *current++ = Move(from, to1, captured1);
        //}
      }
    //}
  }

  if (is_capture2_legal) {
    // Second capture direction
    const BoardLocation& to2 = capture2_loc;
    
    // Check for en passant first (cheaper than GetPiece)
    //if (has_ep && to2 == ep_loc) [[unlikely]] {
      //*current++ = Move(from, to1, Piece::kNoPiece, ep_loc, <captured-pawn, can create new pawn?>, NO_PIECE);
      // for now just normal move
      //*current++ = Move(from, to2);
    //} else {
      // Regular capture - use cached piece
      const Piece& captured2 = capture2_piece;
      const PlayerColor captured2_color = captured2.GetColor();
      if (captured2.Present() && captured2_color != color && captured2_color != teammate_color) {
        // Handle promotion on capture or regular capture
        //if (is_promotion) [[unlikely]] {
          //current = AddPromotionMoves(to2, captured2);
        //} else {
          *current++ = Move(from, to2, captured2);
        //}
      }
    //}
  }
  
  return current;
}

void Board::GetPawnMoves2(
    MoveBuffer& moves,
    const BoardLocation& from,
    const Piece& piece) const {
  PlayerColor color = piece.GetColor();
  Team team = piece.GetTeam();

  // Move forward
  int delta_rows = 0;
  int delta_cols = 0;
  bool not_moved = false;
  switch (color) {
  case RED:
    delta_rows = -1;
    not_moved = from.GetRow() == 12;
    break;
  case BLUE:
    delta_cols = 1;
    not_moved = from.GetCol() == 1;
    break;
  case YELLOW:
    delta_rows = 1;
    not_moved = from.GetRow() == 1;
    break;
  case GREEN:
    delta_cols = -1;
    not_moved = from.GetCol() == 12;
    break;
  default:
    assert(false);
    break;
  }

  BoardLocation to = from.Relative(delta_rows, delta_cols);
  if (IsLegalLocation(to)) {
    Piece other_piece = GetPiece(to);
    if (other_piece.Missing()) {
      // Advance once square
      AddPawnMoves2(moves, from, to, piece.GetColor());
      // Initial move (advance 2 squares)
      if (not_moved) {
        to = from.Relative(delta_rows * 2, delta_cols * 2);
        other_piece = GetPiece(to);
        if (other_piece.Missing()) {
          AddPawnMoves2(moves, from, to, piece.GetColor());
        }
      }
    } else {

      // En-passant
      if (other_piece.GetPieceType() == PAWN
          && piece.GetTeam() != other_piece.GetTeam()) {

        int n_turns = (4 + piece.GetColor() - other_piece.GetColor()) % 4;
        const Move* other_player_move = nullptr;
        if (n_turns > 0 && n_turns <= (int)moves_.size()) {
          other_player_move = &moves_[moves_.size() - n_turns];
        } else if (n_turns < 4) {
          const auto& enp_move = enp_.enp_moves[other_piece.GetColor()];
          if (enp_move.has_value()) {
            other_player_move = &*enp_move;
          }
        }

        if (other_player_move != nullptr
            && other_player_move->To() == to
            // TODO: Refactor this with 'enp' locations
            && other_player_move->ManhattanDistance() == 2
            && (other_player_move->From().GetRow() == other_player_move->To().GetRow()
               || other_player_move->From().GetCol() == other_player_move->To().GetCol())
            ) {
          const BoardLocation& moved_from = other_player_move->From();
          int delta_row = to.GetRow() - moved_from.GetRow();
          int delta_col = to.GetCol() - moved_from.GetCol();
          BoardLocation enpassant_to = moved_from.Relative(
              delta_row / 2, delta_col / 2);
          // there may be both en-passant and piece capture in the same move
          auto existing = GetPiece(enpassant_to);
          if (existing.Missing()
              || existing.GetTeam() != piece.GetTeam()) {
            AddPawnMoves2(moves, from, enpassant_to, piece.GetColor(),
                         existing, to, other_piece);
          }
        }

      }

    }
  }

  // Non-enpassant capture
  bool check_cols = team == RED_YELLOW;
  int capture_row, capture_col;
  for (int incr = 0; incr < 2; ++incr) {
    capture_row = from.GetRow() + delta_rows;
    capture_col = from.GetCol() + delta_cols;
    if (check_cols) {
      capture_col += incr == 0 ? -1 : 1;
    } else {
      capture_row += incr == 0 ? -1 : 1;
    }
    if (IsLegalLocation(capture_row, capture_col)) {
      auto other_piece = GetPiece(capture_row, capture_col);
      if (other_piece.Present()
          && other_piece.GetTeam() != team) {
        AddPawnMoves2(moves, from, BoardLocation(capture_row, capture_col),
            piece.GetColor(), other_piece);
      }
    }
  }
}

Move* Board::GetKnightMovesDirect(
    Move* moves,
    size_t limit,
    const BoardLocation& from,
    PlayerColor color,
    int& threats) const {
  //if (limit == 0) return moves;
  
  Move* current = moves;
  //const Move* const end = moves + limit;
  const PlayerColor teammate_color = static_cast<PlayerColor>((static_cast<int>(color) + 2) & 0x3);

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
      if (captured.GetColor() != color && captured.GetColor() != teammate_color) {
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

void Board::GetKnightMoves2(
    MoveBuffer& moves,
    const BoardLocation& from,
    const Piece& piece) const {

  int delta_row, delta_col;
  for (int pos_row_sign = 0; pos_row_sign < 2; ++pos_row_sign) {
    for (int abs_delta_row = 1; abs_delta_row < 3; ++abs_delta_row) {
      delta_row = pos_row_sign > 0 ? abs_delta_row : -abs_delta_row;
      for (int pos_col_sign = 0; pos_col_sign < 2; ++pos_col_sign) {
        int abs_delta_col = abs_delta_row == 1 ? 2 : 1;
        delta_col = pos_col_sign > 0 ? abs_delta_col : -abs_delta_col;
        BoardLocation to = from.Relative(delta_row, delta_col);
        if (IsLegalLocation(to)) {
          const auto capture = GetPiece(to);
          if (capture.Missing()
              || capture.GetTeam() != piece.GetTeam()) {
            moves.AddMove(from, to, capture);
          }
        }
      }
    }
  }

}

void Board::AddMovesFromIncrMovement(
    std::vector<Move>& moves,
    const Piece& piece,
    const BoardLocation& from,
    int incr_row,
    int incr_col,
    CastlingRights initial_castling_rights,
    CastlingRights castling_rights) const {
  BoardLocation to = from.Relative(incr_row, incr_col);
  while (IsLegalLocation(to)) {
    const auto capture = GetPiece(to);
    if (capture.Missing()) {
      moves.emplace_back(from, to, Piece::kNoPiece, initial_castling_rights,
          castling_rights);
    } else {
      if (capture.GetTeam() != piece.GetTeam()) {
        moves.emplace_back(from, to, capture, initial_castling_rights,
            castling_rights);
      }
      break;
    }
    to = to.Relative(incr_row, incr_col);
  }
}

void Board::AddMovesFromIncrMovement2(
    MoveBuffer& moves,
    const Piece& piece,
    const BoardLocation& from,
    int incr_row,
    int incr_col,
    CastlingRights initial_castling_rights,
    CastlingRights castling_rights) const {
  BoardLocation to = from.Relative(incr_row, incr_col);
  while (IsLegalLocation(to)) {
    const auto capture = GetPiece(to);
    if (capture.Missing()) {
      moves.AddMove(from, to, Piece::kNoPiece, initial_castling_rights,
          castling_rights);
    } else {
      if (capture.GetTeam() != piece.GetTeam()) {
        moves.AddMove(from, to, capture, initial_castling_rights,
            castling_rights);
      }
      break;
    }
    to = to.Relative(incr_row, incr_col);
  }
}

void Board::GetBishopMoves2(
    MoveBuffer& moves,
    const BoardLocation& from,
    const Piece& piece) const {

  for (int pos_row = 0; pos_row < 2; ++pos_row) {
    for (int pos_col = 0; pos_col < 2; ++pos_col) {
      AddMovesFromIncrMovement2(
          moves, piece, from, pos_row ? 1 : -1, pos_col ? 1 : -1);
    }
  }
}

void Board::GetRookMoves2(
    MoveBuffer& moves,
    const BoardLocation& from,
    const Piece& piece) const {

  // Update castling rights
  CastlingRights initial_castling_rights;
  CastlingRights castling_rights;
  std::optional<CastlingType> castling_type = GetRookLocationType(
      piece.GetPlayer(), from);
  if (castling_type.has_value()) {
    const auto& curr_rights = castling_rights_[piece.GetColor()];
    if (curr_rights.Kingside() || curr_rights.Queenside()) {
      if (castling_type == KINGSIDE) {
        if (curr_rights.Kingside()) {
          initial_castling_rights = curr_rights;
          castling_rights = CastlingRights(false, curr_rights.Queenside());
        }
      } else {
        if (curr_rights.Queenside()) {
          initial_castling_rights = curr_rights;
          castling_rights = CastlingRights(curr_rights.Kingside(), false);
        }
      }
    }
  }

  for (int do_pos_incr = 0; do_pos_incr < 2; ++do_pos_incr) {
    int incr = do_pos_incr > 0 ? 1 : -1;
    for (int do_incr_row = 0; do_incr_row < 2; ++do_incr_row) {
      int incr_row = do_incr_row > 0 ? incr : 0;
      int incr_col = do_incr_row > 0 ? 0 : incr;
      AddMovesFromIncrMovement2(moves, piece, from, incr_row, incr_col,
          initial_castling_rights, castling_rights);
    }
  }
}

void Board::GetQueenMoves2(
    MoveBuffer& moves,
    const BoardLocation& from,
    const Piece& piece) const {
  GetBishopMoves2(moves, from, piece);
  GetRookMoves2(moves, from, piece);
}

void Board::GetKingMoves2(
    MoveBuffer& moves,
    const BoardLocation& from,
    const Piece& piece) const {

  const CastlingRights& initial_castling_rights = castling_rights_[piece.GetColor()];
  CastlingRights castling_rights(false, false);

  for (int delta_row = -1; delta_row < 2; ++delta_row) {
    for (int delta_col = -1; delta_col < 2; ++delta_col) {
      if (delta_row == 0 && delta_col == 0) {
        continue;
      }
      BoardLocation to = from.Relative(delta_row, delta_col);
      if (IsLegalLocation(to)) {
        const auto capture = GetPiece(to);
        if (capture.Missing()
            || capture.GetTeam() != piece.GetTeam()) {
          moves.AddMove(from, to, capture, initial_castling_rights,
              castling_rights);
        }
      }
    }
  }

  Team other_team = OtherTeam(piece.GetTeam());
  for (int is_kingside = 0; is_kingside < 2; ++is_kingside) {
    bool allowed = is_kingside ? initial_castling_rights.Kingside() :
      initial_castling_rights.Queenside();
    if (allowed) {
      std::vector<BoardLocation> squares_between;
      BoardLocation rook_location;

      switch (piece.GetColor()) {
      case RED:
        if (is_kingside) {
          squares_between = {
            from.Relative(0, 1),
            from.Relative(0, 2),
          };
          rook_location = from.Relative(0, 3);
        } else {
          squares_between = {
            from.Relative(0, -1),
            from.Relative(0, -2),
            from.Relative(0, -3),
          };
          rook_location = from.Relative(0, -4);
        }
        break;
      case BLUE:
        if (is_kingside) {
          squares_between = {
            from.Relative(1, 0),
            from.Relative(2, 0),
          };
          rook_location = from.Relative(3, 0);
        } else {
          squares_between = {
            from.Relative(-1, 0),
            from.Relative(-2, 0),
            from.Relative(-3, 0),
          };
          rook_location = from.Relative(-4, 0);
        }
        break;
      case YELLOW:
        if (is_kingside) {
          squares_between = {
            from.Relative(0, -1),
            from.Relative(0, -2),
          };
          rook_location = from.Relative(0, -3);
        } else {
          squares_between = {
            from.Relative(0, 1),
            from.Relative(0, 2),
            from.Relative(0, 3),
          };
          rook_location = from.Relative(0, 4);
        }
        break;
      case GREEN:
        if (is_kingside) {
          squares_between = {
            from.Relative(-1, 0),
            from.Relative(-2, 0),
          };
          rook_location = from.Relative(-3, 0);
        } else {
          squares_between = {
            from.Relative(1, 0),
            from.Relative(2, 0),
            from.Relative(3, 0),
          };
          rook_location = from.Relative(4, 0);
        }
        break;
      default:
        assert(false);
        break;
      }

      // Make sure the rook is present
      const auto rook = GetPiece(rook_location);
      if (rook.Missing()
          || rook.GetPieceType() != ROOK
          || rook.GetTeam() != piece.GetTeam()) {
        continue;
      }

      // Make sure that there are no pieces between the king and rook
      bool piece_between = false;
      for (const auto& loc : squares_between) {
        if (GetPiece(loc).Present()) {
          piece_between = true;
          break;
        }
      }

      if (!piece_between) {
        // Make sure the king is not currently in or would pass through check
        if (!IsAttackedByTeam(other_team, squares_between[0])
            && !IsAttackedByTeam(other_team, from)) {
          // Additionally move the castle
          SimpleMove rook_move(rook_location, squares_between[0]);
          moves.AddCastle(from, squares_between[1], rook_move,
              initial_castling_rights, castling_rights);
        }
      }
    }
  }
}

bool Board::RookAttacks(
    const BoardLocation& rook_loc,
    const BoardLocation& other_loc) const {
  if (rook_loc.GetRow() == other_loc.GetRow()) {
    bool piece_between = false;
    for (int col = std::min(rook_loc.GetCol(), other_loc.GetCol()) + 1;
         col < std::max(rook_loc.GetCol(), other_loc.GetCol());
         ++col) {
      if (GetPiece(rook_loc.GetRow(), col).Present()) {
        piece_between = true;
        break;
      }
    }
    if (!piece_between) {
      return true;
    }
  }
  if (rook_loc.GetCol() == other_loc.GetCol()) {
    bool piece_between = false;
    for (int row = std::min(rook_loc.GetRow(), other_loc.GetRow()) + 1;
         row < std::max(rook_loc.GetRow(), other_loc.GetRow());
         ++row) {
      if (GetPiece(row, rook_loc.GetCol()).Present()) {
        piece_between = true;
        break;
      }
    }
    if (!piece_between) {
      return true;
    }
  }
  return false;
}

bool Board::BishopAttacks(
    const BoardLocation& bishop_loc,
    const BoardLocation& other_loc) const {
  int delta_row = bishop_loc.GetRow() - other_loc.GetRow();
  int delta_col = bishop_loc.GetCol() - other_loc.GetCol();
  if (std::abs(delta_row) == std::abs(delta_col)) {
    int row;
    int col;
    int col_incr;
    int row_max;
    if (bishop_loc.GetRow() < other_loc.GetRow()) {
      row = bishop_loc.GetRow();
      col = bishop_loc.GetCol();
      row_max = other_loc.GetRow();
      col_incr = bishop_loc.GetCol() < other_loc.GetCol() ? 1 : -1;
    } else {
      row = other_loc.GetRow();
      col = other_loc.GetCol();
      row_max = bishop_loc.GetRow();
      col_incr = other_loc.GetCol() < bishop_loc.GetCol() ? 1 : -1;
    }
    row++;
    col += col_incr;
    bool piece_between = false;
    while (row < row_max) {
      if (GetPiece(row, col).Present()) {
        piece_between = true;
        break;
      }

      ++row;
      col += col_incr;
    }
    return !piece_between;
  }
  return false;
}

bool Board::QueenAttacks(
    const BoardLocation& queen_loc,
    const BoardLocation& other_loc) const {
  return RookAttacks(queen_loc, other_loc)
         || BishopAttacks(queen_loc, other_loc);
}

bool Board::KingAttacks(
    const BoardLocation& king_loc,
    const BoardLocation& other_loc) const {
  if ((std::abs(king_loc.GetRow() - other_loc.GetRow())
        + std::abs(king_loc.GetCol() - other_loc.GetCol())) < 2) {
    return true;
  }
  return false;
}

bool Board::KnightAttacks(
    const BoardLocation& knight_loc,
    const BoardLocation& other_loc) const {
  int abs_row_diff = std::abs(knight_loc.GetRow() - other_loc.GetRow());
  int abs_col_diff = std::abs(knight_loc.GetCol() - other_loc.GetCol());
  return (abs_row_diff == 1 && abs_col_diff == 2)
    || (abs_row_diff == 2 && abs_col_diff == 1);
}

bool Board::PawnAttacks(
    const BoardLocation& pawn_loc,
    PlayerColor pawn_color,
    const BoardLocation& other_loc) const {
  int row_diff = other_loc.GetRow() - pawn_loc.GetRow();
  int col_diff = other_loc.GetCol() - pawn_loc.GetCol();
  switch (pawn_color) {
  case RED:
    return row_diff == -1 && (std::abs(col_diff) == 1);
  case BLUE:
    return col_diff == 1 && (std::abs(row_diff) == 1);
  case YELLOW:
    return row_diff == 1 && (std::abs(col_diff) == 1);
  case GREEN:
    return col_diff == -1 && (std::abs(row_diff) == 1);
  default:
    assert(false);
    return false;
  }
}

size_t Board::GetAttackers2(
    PlacedPiece* buffer, size_t limit,
    Team team, const BoardLocation& location) const {
  assert(limit > 0);
  size_t pos = 0;

#define ADD_ATTACKER(row, col, piece) \
  if (pos < limit) { \
    buffer[pos++] = PlacedPiece(BoardLocation(row, col), piece); \
  } else { \
    return pos; \
  }

  int loc_row = location.GetRow();
  int loc_col = location.GetCol();
  bool no_team = team == NO_TEAM;

  // Rooks & queens
  constexpr std::array<std::pair<int, int>, 4> rook_directions = {{
    {0, 1},   // Right
    {1, 0},   // Down
    {0, -1},  // Left
    {-1, 0}   // Up
  }};

  for (const auto& [dr, dc] : rook_directions) {
    int row = loc_row + dr;
    int col = loc_col + dc;
    while (IsLegalLocation(row, col)) {
      const auto piece = GetPiece(row, col);
      if (piece.Present()) {
        if ((piece.GetTeam() == team || no_team) && 
            (piece.GetPieceType() == ROOK || piece.GetPieceType() == QUEEN)) {
          ADD_ATTACKER(row, col, piece);
        }
        break;
      }
      row += dr;
      col += dc;
    }
  }

  // Bishops & queens
  constexpr std::array<std::pair<int, int>, 4> bishop_directions = {{
    {1, 1},    // Down-Right
    {1, -1},   // Down-Left
    {-1, -1},  // Up-Left
    {-1, 1}    // Up-Right
  }};

  for (const auto& [dr, dc] : bishop_directions) {
    int row = loc_row + dr;
    int col = loc_col + dc;
    while (IsLegalLocation(row, col)) {
      const auto piece = GetPiece(row, col);
      if (piece.Present()) {
        if ((piece.GetTeam() == team || no_team) && 
            (piece.GetPieceType() == BISHOP || piece.GetPieceType() == QUEEN)) {
          ADD_ATTACKER(row, col, piece);
        }
        break;
      }
      row += dr;
      col += dc;
    }
  }

  // Knights - optimized attack detection
  // Knight moves in all 8 possible L-shapes
  constexpr std::array<std::pair<int, int>, 8> knight_offsets = {{
    {1, 2}, {1, -2}, {-1, 2}, {-1, -2},  // Vertical L-shapes
    {2, 1}, {2, -1}, {-2, 1}, {-2, -1}    // Horizontal L-shapes
  }};

  for (const auto& [dr, dc] : knight_offsets) {
    int row = loc_row + dr;
    int col = loc_col + dc;
    
    // Check if the target square is on the board
    if (row >= 0 && row < 14 && col >= 0 && col < 14) {
      const auto piece = GetPiece(row, col);
      if (piece.Present() && 
          piece.GetTeam() == team && 
          piece.GetPieceType() == KNIGHT) {
        ADD_ATTACKER(row, col, piece);
      }
    }
  }

  // Pawns - optimized attack detection
  // Check for red pawns (attack down)
  if (loc_row < 13) {
    // Check bottom-left diagonal
    if (loc_col > 0) {
      const auto piece = GetPiece(loc_row + 1, loc_col - 1);
      if (piece.Present() && piece.GetTeam() == team && 
          piece.GetPieceType() == PAWN && piece.GetColor() == RED) {
        ADD_ATTACKER(loc_row + 1, loc_col - 1, piece);
      }
    }
    // Check bottom-right diagonal
    if (loc_col < 13) {
      const auto piece = GetPiece(loc_row + 1, loc_col + 1);
      if (piece.Present() && piece.GetTeam() == team && 
          piece.GetPieceType() == PAWN && piece.GetColor() == RED) {
        ADD_ATTACKER(loc_row + 1, loc_col + 1, piece);
      }
    }
  }
  
  // Check for yellow pawns (attack up)
  if (loc_row > 0) {
    // Check top-left diagonal
    if (loc_col > 0) {
      const auto piece = GetPiece(loc_row - 1, loc_col - 1);
      if (piece.Present() && piece.GetTeam() == team && 
          piece.GetPieceType() == PAWN && piece.GetColor() == YELLOW) {
        ADD_ATTACKER(loc_row - 1, loc_col - 1, piece);
      }
    }
    // Check top-right diagonal
    if (loc_col < 13) {
      const auto piece = GetPiece(loc_row - 1, loc_col + 1);
      if (piece.Present() && piece.GetTeam() == team && 
          piece.GetPieceType() == PAWN && piece.GetColor() == YELLOW) {
        ADD_ATTACKER(loc_row - 1, loc_col + 1, piece);
      }
    }
  }
  
  // Check for blue pawns (attack left/right)
  if (loc_col > 0) {
    // Check left side
    if (loc_row > 0) {
      const auto piece = GetPiece(loc_row - 1, loc_col - 1);
      if (piece.Present() && piece.GetTeam() == team && 
          piece.GetPieceType() == PAWN && piece.GetColor() == BLUE) {
        ADD_ATTACKER(loc_row - 1, loc_col - 1, piece);
      }
    }
    if (loc_row < 13) {
      const auto piece = GetPiece(loc_row + 1, loc_col - 1);
      if (piece.Present() && piece.GetTeam() == team && 
          piece.GetPieceType() == PAWN && piece.GetColor() == BLUE) {
        ADD_ATTACKER(loc_row + 1, loc_col - 1, piece);
      }
    }
  }
  
  // Check for green pawns (attack left/right)
  if (loc_col < 13) {
    // Check right side
    if (loc_row > 0) {
      const auto piece = GetPiece(loc_row - 1, loc_col + 1);
      if (piece.Present() && piece.GetTeam() == team && 
          piece.GetPieceType() == PAWN && piece.GetColor() == GREEN) {
        ADD_ATTACKER(loc_row - 1, loc_col + 1, piece);
      }
    }
    if (loc_row < 13) {
      const auto piece = GetPiece(loc_row + 1, loc_col + 1);
      if (piece.Present() && piece.GetTeam() == team && 
          piece.GetPieceType() == PAWN && piece.GetColor() == GREEN) {
        ADD_ATTACKER(loc_row + 1, loc_col + 1, piece);
      }
    }
  }

  // Kings
  for (int delta_row = -1; delta_row < 2; ++delta_row) {
    int row = loc_row + delta_row;
    for (int delta_col = -1; delta_col < 2; ++delta_col) {
      if (delta_row == 0 && delta_col == 0) {
        continue;
      }
      int col = loc_col + delta_col;
      if (IsLegalLocation(row, col)) {
        const auto piece = GetPiece(row, col);
        if (piece.Present()
            && (piece.GetTeam() == team || no_team)
            && piece.GetPieceType() == KING) {
          ADD_ATTACKER(row, col, piece);
        }
      }
    }
  }

  return pos;
}

// Optimized version of GetAttackers2 for limit=1 that returns as soon as it finds an attacker
bool Board::IsAttackedByTeam(Team team, const BoardLocation& location) const {
  int loc_row = location.GetRow();
  int loc_col = location.GetCol();

  // Combined sliding piece attacks (rook, bishop, queen)
  struct Direction {
    int dr, dc;
    bool is_rook_move;  // true for rook moves (orthogonal), false for bishop moves (diagonal)
  };
  
  constexpr std::array<Direction, 8> sliding_directions = {{
    // Orthogonal (rook/queen) moves
    {0, 1, true},   // right
    {1, 0, true},   // down
    {0, -1, true},  // left
    {-1, 0, true},  // up
    // Diagonal (bishop/queen) moves
    {1, 1, false},   // down-right
    {1, -1, false},  // down-left
    {-1, -1, false}, // up-left
    {-1, 1, false}   // up-right
  }};

  for (const auto& dir : sliding_directions) {
    int row = loc_row + dir.dr;
    int col = loc_col + dir.dc;
    
    while (IsLegalLocation(row, col)) {
      const auto piece = GetPiece(row, col);
      if (piece.Present()) {
        if (piece.GetTeam() == team) {
          PieceType type = piece.GetPieceType();
          if (type == QUEEN || 
              (dir.is_rook_move && type == ROOK) || 
              (!dir.is_rook_move && type == BISHOP)) {
            return true;
          }
        }
        break;
      }
      row += dir.dr;
      col += dir.dc;
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

  // Combined pawn attack check
  constexpr std::array<std::pair<int, int>, 8> pawn_attacks = {{
    // Red pawn attacks (up-left, up-right)
    {-1, -1}, {-1, 1},
    // Yellow pawn attacks (down-left, down-right)
    {1, -1}, {1, 1},
    // Blue pawn attacks (up-right, down-right)
    {-1, 1}, {1, 1},
    // Green pawn attacks (up-left, down-left)
    {-1, -1}, {1, -1}
  }};

  // Color check masks (one bit per color in order: RED, BLUE, YELLOW, GREEN)
  constexpr uint8_t color_masks[8] = {
    0b0001, 0b0001,  // Red
    0b0100, 0b0100,  // Yellow
    0b0010, 0b0010,  // Blue
    0b1000, 0b1000   // Green
  };

  for (size_t i = 0; i < pawn_attacks.size(); ++i) {
    const auto& [dr, dc] = pawn_attacks[i];
    int row = loc_row + dr;
    int col = loc_col + dc;
    
    if (IsLegalLocation(row, col)) {
      const auto piece = GetPiece(row, col);
      if (piece.Present() && 
          piece.GetTeam() == team && 
          piece.GetPieceType() == PAWN &&
          (color_masks[i] & (1 << piece.GetColor()))) {
        return true;
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
    const PlayerColor current_color = GetTurn().GetColor();

    if (buffer == nullptr && limit == 0) {
      for (int i = 0; i < 4; ++i) {
          result.mobility_counts[i] = 20;  // Each player has 20 legal moves initially
          result.threat_counts[i] = 0;     // No immediate threats in starting position
      }
      return result; 
    }

    if (buffer == nullptr || limit == 0) return result;
    
    int pv_index = -1;  // -1 means PV move not found
    const auto& pieces = piece_list_[current_color];
    const size_t num_pieces = pieces.size();

    
    auto sorted_pieces = pieces;

    /*
    if (!sorted_pieces.empty()) {
        // Single pass with insertion sort is faster for small N
        for (size_t i = 1; i < num_pieces; ++i) {
            const PlacedPiece& key = sorted_pieces[i];
            int key_val = kPieceValues[key.GetPiece().GetPieceType()];
            int j = i - 1;
            
            while (j >= 0 && kPieceValues[sorted_pieces[j].GetPiece().GetPieceType()] < key_val) {
                sorted_pieces[j + 1] = sorted_pieces[j];
                --j;
            }
            sorted_pieces[j + 1] = key;
        }
    }
    */
    
    Move* current = buffer;
    const Move* const end = buffer + limit;

    int threats = 0;
    
    for (size_t i = 0; i < num_pieces && current < end; ++i) {
        //const auto& placed_piece = *sorted_pieces[i];
        const auto& placed_piece = sorted_pieces[i];
        const auto& location = placed_piece.GetLocation();
        const auto& piece = placed_piece.GetPiece();

        const PieceType type = piece.GetPieceType();
        
        // Remember the current position in the buffer before generating moves for this piece
        Move* before = current;
        
        size_t before_count = current - buffer;

        // Generate moves for this piece
        Move* before_moves = current;
        switch (type) {
            case QUEEN:   {
                current = GetBishopMovesDirect(current, end - current, location, current_color, threats);
                current = GetRookMovesDirect(current, end - current, location, current_color, threats);
              } break;
            case ROOK:    current = GetRookMovesDirect(current, end - current, location, current_color, threats);
              break;
            case BISHOP:  current = GetBishopMovesDirect(current, end - current, location, current_color, threats);
              break;
            case PAWN:    current = GetPawnMovesDirect(current, location, current_color); break;
            case KNIGHT:  current = GetKnightMovesDirect(current, end - current, location, current_color, threats);
              break;
            case KING:    current = GetKingMovesDirect(current, end - current, location, current_color);
              break;
            default: assert(false && "Movegen: Invalid piece type");
        }

        for (Move* m = buffer + before_count; m < current; ++m) {
              if (!IsLegalLocation(m->From()) || !IsLegalLocation(m->To())) {
        std::cerr << "Invalid move generated: " << m->DebugString() << "\n";
        std::abort();
    }
}
        
        // Count all moves for mobility
        size_t after_count = current - buffer;
        int moves_added = (after_count - before_count);
        result.mobility_counts[current_color] += moves_added;
    }


    result.threat_counts[current_color] = threats;
        
    result.count = current - buffer;

    // Check if the PV move was generated
    if (pv_move.has_value() && pv_index == -1) {
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

      //std::cout << "[MoveGen]"
      //<< "Average: " << avg_ns << " ns, "
      //<< "Call count: " << call_count << std::endl;
    }
    return result;
}

GameResult Board::GetGameResult() {
  if (!GetKingLocation(turn_.GetColor()).Present()) {
    // other team won
    return turn_.GetTeam() == RED_YELLOW ? WIN_BG : WIN_RY;
  }
  Player player = turn_;

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

void Board::SetPiece(
    const BoardLocation& location,
    const Piece& piece) {
    
  // Update the board
  location_to_piece_[location.GetRow()][location.GetCol()] = piece;
  // Check if this piece is already in the piece list
  auto& pieces = piece_list_[piece.GetColor()];
  bool found = false;
  
  for (auto& p : pieces) {
    if (p.GetLocation() == location) {  // Compare pieces, not positions
      //p.GetLocation() = location;  // Update position
      found = true;
      if (found) {
        std::cerr << "SetPiece FATAL: Attempt to set existing piece" 
                  << std::endl; 
        std::abort();
      }

      break;
    }
  }
  if (!found) {
    // Add new entry if piece wasn't found
    pieces.emplace_back(location, piece);
  }
  // or: 
  //piece_list_[piece.GetColor()].emplace_back(location, piece);

  UpdatePieceHash(piece, location);
  // Update king location
  if (piece.GetPieceType() == KING) {
    king_locations_[piece.GetColor()] = location;
  }
  // Update piece eval
  int piece_eval = kPieceEvaluations[piece.GetPieceType()];
  if (piece.GetTeam() == RED_YELLOW) {
    piece_evaluation_ += piece_eval;
  } else {
    piece_evaluation_ -= piece_eval;
  }
  player_piece_evaluations_[piece.GetColor()] += piece_eval;
}

void Board::RemovePiece(const BoardLocation& location) {
  const auto piece = GetPiece(location);
  if (!piece.Present()) {
    std::cerr << "Remove FATAL: Attempted to remove non-present piece at " 
              << location.PrettyStr() 
              << "\n  Current turn: " << turn_
              << "\n  Board state at " << location.PrettyStr() << ": "
              << (GetPiece(location).Present() ? "Present" : "Missing")
              << "\n  Piece type at location: " << static_cast<int>(GetPiece(location).GetPieceType())
              << "\n  Piece color at location: " << static_cast<int>(GetPiece(location).GetColor())
              << std::endl;
    std::abort();
  }
  
  auto& placed_pieces = piece_list_[piece.GetColor()];
  bool found = false;
  for (auto it = placed_pieces.begin(); it != placed_pieces.end();) {
      const auto& placed_piece = *it;
      if (placed_piece.GetLocation() == location) {
          if (!placed_piece.GetPiece().Present()) {
              std::cerr << "RemovePiece WARNING: Found non-present piece in piece_list_ at " 
                      << location.PrettyStr() 
                      << " with piece: " << placed_piece.GetPiece().DebugString()
                      << std::endl;
          }
          it = placed_pieces.erase(it);
          found = true;
          break;  // We can break after erasing since locations should be unique
      } else {
          ++it;
      }
  }

  if (!found) {
      // This is bad - we tried to remove a piece that wasn't in the list
      std::cerr << "RemovePiece FATAL: Tried to remove piece at " << location.PrettyStr()
              << " but it wasn't found in piece_list_ for color " 
              << static_cast<int>(piece.GetColor()) << "\n";
      std::abort();
  }
  UpdatePieceHash(piece, location);
  location_to_piece_[location.GetRow()][location.GetCol()] = Piece();

  // Update king location
  if (piece.GetPieceType() == KING) {
    castling_rights_[turn_.GetColor()] = CastlingRights(false, false);
    king_locations_[piece.GetColor()] = BoardLocation::kNoLocation;
  }
  // Update piece eval
  int piece_eval = kPieceEvaluations[piece.GetPieceType()];
  if (piece.GetTeam() == RED_YELLOW) {
    piece_evaluation_ -= piece_eval;
  } else {
    piece_evaluation_ += piece_eval;
  }
  player_piece_evaluations_[piece.GetColor()] -= piece_eval;
}

void Board::InitializeHash() {
  for (int color = 0; color < 4; color++) {
    for (const auto& placed_piece : piece_list_[color]) {
      UpdatePieceHash(placed_piece.GetPiece(), placed_piece.GetLocation());
    }
  }
  UpdateTurnHash(static_cast<int>(turn_.GetColor()));
}

void Board::MakeMove(const Move& move) {
  // Cases:
  // 1. Move
  // 2. Capture
  //// 3. En passant
  //// 4. Castle
  //// 5. Promotion
  //// 6. Capture with promotion

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
  
  // Capture
  const auto standard_capture = GetPiece(to);
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
        std::cerr << "Failed to find captured piece in piece_list_:\n";
        std::abort();
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

  //RemovePiece(from);
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
  // Check if this piece is already in the piece list
  auto& pieces = piece_list_[color];
  bool found = false;
  
  /*
  // Check if this piece is already in the piece list (shouldn't happen for valid moves)
  auto piece_it = std::find_if(pieces.begin(), pieces.end(),
      [&to](const auto& p) { return p.GetLocation() == to; });
  if (piece_it != pieces.end()) {
      std::cerr << "SetPiece FATAL: Attempt to set existing piece at " 
                << to.PrettyStr() << "\n";
      std::abort();
  }
  */
  // Add new entry
  pieces.emplace_back(to, piece);

  UpdatePieceHash(piece, to);
  // Update king location
  if (piece_type == KING) {
    king_locations_[color] = to;
  }
  // end set piece

  int t = static_cast<int>(color);
  UpdateTurnHash(t);
  UpdateTurnHash((t+1)%4);

  turn_ = GetNextPlayer(turn_);
  moves_.push_back(move);
}


void Board::UndoMove() {
  // Cases:
  // 1. Move
  // 2. Capture
  // 3. En-passant
  // 4. Promotion
  // 5. Castling (rights, rook move)

  assert(!moves_.empty());
  const Move& move = moves_.back();
  Player turn_before = GetPreviousPlayer(turn_);

  const BoardLocation& to = move.To();
  const BoardLocation& from = move.From();

  // Move the piece back.
  const auto piece = GetPiece(to);
  /*
  if (piece.Missing()) {
    std::cout << "piece missing in UndoMove" << std::endl;
    abort();
  }
  */
  const PlayerColor color = piece.GetColor();

  if (auto it = std::find_if(piece_list_[color].begin(), piece_list_[color].end(),
    [&to](const auto& p) { return p.GetLocation() == to; });
    it != piece_list_[color].end()) {
    piece_list_[color].erase(it);
  }

  UpdatePieceHash(piece, to);
  location_to_piece_[to.GetRow()][to.GetCol()] = Piece();

  // Update king location
  if (piece.GetPieceType() == KING) {
    castling_rights_[color] = CastlingRights(false, false);
    king_locations_[color] = BoardLocation::kNoLocation;
  }
  // end remove

  //SetPiece(from, piece);
  // Update the board
  location_to_piece_[from.GetRow()][from.GetCol()] = piece;
  // Check if this piece is already in the piece list
  auto& pieces = piece_list_[color];
  /*
  auto piece_it = std::find_if(pieces.begin(), pieces.end(),
      [&from](const auto& p) { return p.GetLocation() == from; });

  if (piece_it != pieces.end()) {
      std::cerr << "SetPiece FATAL: Attempt to set existing piece at " 
                << from.PrettyStr() << "\n";
      std::abort();
  }
  */
  // Add new entry
  pieces.emplace_back(from, piece);

  UpdatePieceHash(piece, from);
  // Update king location
  if (piece.GetPieceType() == KING) {
    king_locations_[color] = from;
  }
  //end set piece
  // Place back captured pieces
  if (const auto standard_capture = move.GetStandardCapture();
    standard_capture.Present()) {
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

  turn_ = turn_before;
  moves_.pop_back();
  int t = static_cast<int>(turn_.GetColor());
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
  assert(player_piece_evaluations_[RED]
       + player_piece_evaluations_[YELLOW]
       - player_piece_evaluations_[BLUE]
       - player_piece_evaluations_[GREEN]
       == piece_evaluation_);
  return piece_evaluation_;
}

int Board::PieceEvaluation(PlayerColor color) const {
  return player_piece_evaluations_[color];
}

int Board::MobilityEvaluation(const Player& player) {
  Player turn = turn_;
  turn_ = player;
  int mobility = 0;
  auto result = GetPseudoLegalMoves2(move_buffer_2_, move_buffer_size_);
  int player_mobility = static_cast<int>(result.count);

  if (player.GetTeam() == RED_YELLOW) {
    mobility += player_mobility;
  } else {
    mobility -= player_mobility;
  }

  mobility *= kMobilityMultiplier;

  turn_ = turn;
  return mobility;
}

int Board::MobilityEvaluation() {
  Player turn = turn_;

  int mobility = 0;
  for (int player_color = 0; player_color < 4; ++player_color) {
    turn_ = Player(static_cast<PlayerColor>(player_color));
    auto result = GetPseudoLegalMoves2(move_buffer_2_, move_buffer_size_);
    int player_mobility = static_cast<int>(result.count);

    if (turn_.GetTeam() == RED_YELLOW) {
      mobility += player_mobility;
    } else {
      mobility -= player_mobility;
    }
  }

  mobility *= kMobilityMultiplier;

  turn_ = turn;
  return mobility;
}

Board::Board(
    Player turn,
    std::unordered_map<BoardLocation, Piece> location_to_piece,
    std::optional<std::unordered_map<Player, CastlingRights>> castling_rights,
    std::optional<EnpassantInitialization> enp)
  : turn_(std::move(turn))
    {

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

  os << "Turn: " << board.turn_ << std::endl;

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

bool Board::DeliversCheck(const Move& move) {
  int color = GetTurn().GetColor();
  Piece piece = GetPiece(move.From());

  bool checks = false;

  for (int add = 1; add < 4; add += 2) {
    int other = (color + add) % 4;
    auto king_loc = GetKingLocation(static_cast<PlayerColor>(other));
    if (king_loc.Present()) {
      if (king_loc == move.To()) {
        checks = true;
        break;
      }
      switch (piece.GetPieceType()) {
      case PAWN:
        checks = PawnAttacks(move.To(), piece.GetColor(), king_loc);
        break;
      case KNIGHT:
        checks = KnightAttacks(move.To(), king_loc);
        break;
      case BISHOP:
        checks = BishopAttacks(move.To(), king_loc);
        break;
      case ROOK:
        checks = RookAttacks(move.To(), king_loc);
        break;
      case QUEEN:
        checks = QueenAttacks(move.To(), king_loc);
        break;
      default:
        break;
      }
      if (checks) {
        break;
      }
    }
  }

  return checks;
}

void Board::MakeNullMove() {
  int t = static_cast<int>(turn_.GetColor());
  UpdateTurnHash(t);
  UpdateTurnHash((t+1)%4);

  turn_ = GetNextPlayer(turn_);
}

void Board::UndoNullMove() {
  turn_ = GetPreviousPlayer(turn_);

  int t = static_cast<int>(turn_.GetColor());
  UpdateTurnHash(t);
  UpdateTurnHash((t+1)%4);
}

bool Move::DeliversCheck(Board& board) const {
  if (delivers_check_ < 0) {
    delivers_check_ = board.DeliversCheck(*this);
  }
  return delivers_check_;
}

int Move::ApproxSEE(Board& board, const int* piece_evaluations) const {
  const auto capture = GetCapturePiece();
  const auto piece = board.GetPiece(From());
  int captured_val = piece_evaluations[capture.GetPieceType()];
  int attacker_val = piece_evaluations[piece.GetPieceType()];
  return captured_val - attacker_val;
}

namespace {

int StaticExchangeEvaluationFromLists(
    int square_piece_eval,
    const std::vector<int>& sorted_piece_values,
    size_t index,
    const std::vector<int>& other_team_sorted_piece_values,
    size_t other_index) {
  if (index >= sorted_piece_values.size()) {
    return 0;
  }
  int value_capture = square_piece_eval - StaticExchangeEvaluationFromLists(
      sorted_piece_values[index],
      other_team_sorted_piece_values,
      other_index,
      sorted_piece_values,
      index + 1);
  return std::max(0, value_capture);
}

int StaticExchangeEvaluationFromLocation(
    const int piece_evaluations[6],
    const Board& board, const BoardLocation& loc) {
  constexpr size_t kLimit = 5;
  PlacedPiece attackers_this_side[kLimit];
  PlacedPiece attackers_that_side[kLimit];

  size_t num_attackers_this_side = board.GetAttackers2(
      attackers_this_side, kLimit, board.GetTurn().GetTeam(), loc);
  size_t num_attackers_that_side = board.GetAttackers2(
      attackers_that_side, kLimit, OtherTeam(board.GetTurn().GetTeam()), loc);

  std::vector<int> piece_values_this_side;
  piece_values_this_side.reserve(num_attackers_this_side);
  std::vector<int> piece_values_that_side;
  piece_values_that_side.reserve(num_attackers_that_side);

  for (size_t i = 0; i < num_attackers_this_side; ++i) {
    const auto& placed_piece = attackers_this_side[i];
    int piece_eval = piece_evaluations[placed_piece.GetPiece().GetPieceType()];
    piece_values_this_side.push_back(piece_eval);
  }

  for (size_t i = 0; i < num_attackers_that_side; ++i) {
    const auto& placed_piece = attackers_that_side[i];
    int piece_eval = piece_evaluations[placed_piece.GetPiece().GetPieceType()];
    piece_values_that_side.push_back(piece_eval);
  }

  std::sort(piece_values_this_side.begin(), piece_values_this_side.end());
  std::sort(piece_values_that_side.begin(), piece_values_that_side.end());

  const auto attacking = board.GetPiece(loc);
  assert(attacking.Present());
  int attacked_piece_eval = piece_evaluations[attacking.GetPieceType()];

  return StaticExchangeEvaluationFromLists(
      attacked_piece_eval,
      piece_values_this_side,
      0,
      piece_values_that_side,
      0);
}

} // namespace

Move* Board::GetQueenMovesDirect(
    Move* moves,
    size_t limit,
    const BoardLocation& from,
    PlayerColor color,
    int& threats) const
     {
  if (limit == 0) return moves;
  
  // Queen moves are a combination of rook and bishop moves
  Move* current = moves;
  const Move* const end = moves + limit;
  
  current = GetBishopMovesDirect(current, end - current, from, color, threats);
  return GetRookMovesDirect(current, end - current, from, color, threats);
}

// Pre-computed direction deltas for rook moves (row, col)
static constexpr std::array<std::pair<int, int>, 4> kRookDirections = {{
    {0, 1},   // Right
    {0, -1},  // Left
    {1, 0},   // Down
    {-1, 0}   // Up
}};

Move* Board::GetRookMovesDirect(
    Move* moves,
    size_t limit,
    const BoardLocation& from,
    PlayerColor color,
    int& threats
  ) const {
    
    Move* current = moves;
    const int from_row = from.GetRow();
    const int from_col = from.GetCol();
    const PlayerColor teammate_color = static_cast<PlayerColor>((static_cast<int>(color) + 2) & 0x3);
    
    for (const auto& [dr, dc] : kRookDirections) {
        
        int r = from_row + dr;
        int c = from_col + dc;
        
        while (true) {
            BoardLocation to(r, c);
            if (!IsLegalLocation(r, c)) break;
            
            const Piece captured = GetPiece(to);
            if (captured.Present()) {
                if (captured.GetColor() != color && captured.GetColor() != teammate_color) {
                    *current++ = Move(from, to, captured);
                    threats += 16; // attacking
                }
                threats += 4; // defending
                break;
            }
            *current++ = Move(from, to);
            threats++; // mobility
            
            r += dr;
            c += dc;
        }
    }
    
    return current;
}

Move* Board::GetBishopMovesDirect(
    Move* moves,
    size_t limit,
    const BoardLocation& from,
    PlayerColor color,
    int& threats) const {
  
  Move* current = moves;
  const PlayerColor teammate_color = static_cast<PlayerColor>((static_cast<int>(color) + 2) & 0x3);
  const int8_t row = from.GetRow();
  const int8_t col = from.GetCol();
  
  // Bishop moves in diagonal lines (4 directions)
  for (const auto& [dr, dc] : {std::make_pair(1, 1), {1, -1}, {-1, 1}, {-1, -1}}) {
    for (int8_t r = row + dr, c = col + dc; ; r += dr, c += dc) {
      const BoardLocation to(r, c);
      if (!IsLegalLocation(to)) break;
      
      const Piece captured = GetPiece(to);
      if (captured.Present()) {
        if (captured.GetColor() != color && captured.GetColor() != teammate_color) {
          *current++ = Move(from, to, captured);
          threats += 16; // attacking
        }
        threats += 4; // defending
        break;
      }
      *current++ = Move(from, to);
      threats++; // mobility
    }
  }
  
  return current;
}

Move* Board::GetKingMovesDirect(
    Move* moves,
    size_t limit,
    const BoardLocation& from,
    PlayerColor color) const {
  //if (limit == 0) return moves;
  
  Move* current = moves;
  const Move* const end = moves + limit;
  
  const PlayerColor teammate_color = static_cast<PlayerColor>((static_cast<int>(color) + 2) & 0x3);
  const Team enemy_team = GetTeam(static_cast<PlayerColor>((static_cast<int>(color) + 1) & 0x3));
  // (row, col)
  // First parameter = row (y-coordinate)
  // Second parameter = column (x-coordinate)
  const int row = from.GetRow();
  const int col = from.GetCol();
  
  const CastlingRights& castling_rights = castling_rights_[color];

    // up-left
    if (IsLegalLocation(row - 1, col - 1)) {
        const Piece captured = GetPiece(row - 1, col - 1);
        if (captured.Missing() || 
            (captured.GetColor() != color && captured.GetColor() != teammate_color)) {
            *current++ = Move(from, {row - 1, col - 1}, captured, castling_rights, CastlingRights(false, false));
        }
    }

    // up-right
    if (IsLegalLocation(row - 1, col + 1)) {
        const Piece captured = GetPiece(row - 1, col + 1);
        if (captured.Missing() || 
            (captured.GetColor() != color && captured.GetColor() != teammate_color)) {
            *current++ = Move(from, {row - 1, col + 1}, captured, castling_rights, CastlingRights(false, false));
        }
    }

    // down-left
    if (IsLegalLocation(row + 1, col - 1)) {
        const Piece captured = GetPiece(row + 1, col - 1);
        if (captured.Missing() || 
            (captured.GetColor() != color && captured.GetColor() != teammate_color)) {
            *current++ = Move(from, {row + 1, col - 1}, captured, castling_rights, CastlingRights(false, false));
        }
    }

    // down-right
    if (IsLegalLocation(row + 1, col + 1)) {
        const Piece captured = GetPiece(row + 1, col + 1);
        if (captured.Missing() || 
            (captured.GetColor() != color && captured.GetColor() != teammate_color)) {
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
            !GetPiece({4, 0}).Present() &&
            !GetPiece({5, 0}).Present() &&
            (GetPiece({3, 0}) == Piece(BLUE, ROOK)) &&
            !IsAttackedByTeam(enemy_team, {7, 0}) &&
            !IsAttackedByTeam(enemy_team, {6, 0}) &&
            !IsAttackedByTeam(enemy_team, {5, 0})
            ) {
            
            /*
            *current++ = Move(
                {7, 0},  // king_from
                {5, 0},  // king_to
                SimpleMove({3, 0}, {6, 0}),  // rook_from, rook_to
                CastlingRights(true, true),
                CastlingRights(false, false)
            );
            */
        }

        // Green kingside castling - optimized
        if (color == GREEN &&
            castling_rights.Kingside() &&
            !GetPiece({4, 13}).Present() &&  // Check empty square first (fast)
            (GetPiece({3, 13}) == Piece(GREEN, ROOK)) &&
            !IsAttackedByTeam(enemy_team, {6, 13}) &&  // King not in check
            !IsAttackedByTeam(enemy_team, {5, 13}) &&  // King's path
            !IsAttackedByTeam(enemy_team, {4, 13})) {  // King's path
            
            /*
            *current++ = Move(
                {6, 13},  // king_from
                {4, 13},  // king_to
                SimpleMove({3, 13}, {5, 13}),  // rook_from, rook_to
                CastlingRights(true, true),
                CastlingRights(false, false)
            );
            */
        }
      } else if (captured.GetColor() != color && captured.GetColor() != teammate_color) {
        *current++ = Move(from, {row - 1, col}, captured);
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
            !GetPiece({13, 4}).Present() &&  // Check empty squares first (fast)
            !GetPiece({13, 5}).Present() &&
            (GetPiece({13, 3}) == Piece(RED, ROOK)) &&
            !IsAttackedByTeam(enemy_team, {13, 7}) &&  // King not in check
            !IsAttackedByTeam(enemy_team, {13, 6}) &&  // King's path
            !IsAttackedByTeam(enemy_team, {13, 5}) &&  // King's path
            !IsAttackedByTeam(enemy_team, {13, 4})) {  // King's path
            
            /*
            *current++ = Move(
              {13, 7},  // king_from
              {13, 5},  // king_to
              SimpleMove({13, 3}, {13, 6}),  // rook_from, rook_to
              CastlingRights(true, true),
              CastlingRights(false, false)
            );
            */
        }
        // YELLOW kingside castling - optimized
        if (color == YELLOW &&
            castling_rights.Kingside() &&
            !GetPiece({0, 4}).Present() &&  // Check empty square first (fast)
            (GetPiece({0, 3}) == Piece(YELLOW, ROOK)) &&
            !IsAttackedByTeam(enemy_team, {0, 6}) &&  // King not in check
            !IsAttackedByTeam(enemy_team, {0, 5}) &&  // King's path
            !IsAttackedByTeam(enemy_team, {0, 4})) {  // King's path
      
            /*
            *current++ = Move(
                {0, 6},  // king_from
                {0, 4},  // king_to
                SimpleMove({0, 3}, {0, 5}),  // rook_from, rook_to
                CastlingRights(true, true),
                CastlingRights(false, false)
            );
            */
        }   
      } else if (captured.GetColor() != color && captured.GetColor() != teammate_color) {
        *current++ = Move(from, {row, col - 1}, captured);
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
              !GetPiece({13, 9}).Present() &&  // Check empty square first (fast)
              (GetPiece({13, 10}) == Piece(RED, ROOK)) &&
              !IsAttackedByTeam(enemy_team, {13, 7}) &&  // King not in check
              !IsAttackedByTeam(enemy_team, {13, 8}) &&  // King's path
              !IsAttackedByTeam(enemy_team, {13, 9})) {  // King's path
              
              /*
              *current++ = Move(
                  {13, 7},  // king_from
                  {13, 9},  // king_to
                  SimpleMove({13, 10}, {13, 8}),  // rook_from, rook_to
                  CastlingRights(true, true),
                  CastlingRights(false, false)
              );
              */
          }
          // YELLOW queenside castling - optimized
          if (color == YELLOW &&
              castling_rights.Queenside() &&
              !GetPiece({0, 8}).Present() &&  // Check empty squares first (fast)
              !GetPiece({0, 9}).Present() &&
              (GetPiece({0, 10}) == Piece(YELLOW, ROOK)) &&
              !IsAttackedByTeam(enemy_team, {0, 6}) &&  // King not in check
              !IsAttackedByTeam(enemy_team, {0, 7}) &&  // King's path
              !IsAttackedByTeam(enemy_team, {0, 8}) &&  // King's path
              !IsAttackedByTeam(enemy_team, {0, 9})) {  // King's path
              
              /*
              *current++ = Move(
                  {0, 6},  // king_from
                  {0, 8},  // king_to
                  SimpleMove({0, 10}, {0, 7}),  // rook_from, rook_to
                  CastlingRights(true, true),
                  CastlingRights(false, false)
              );
              */
          }
      } else if (captured.GetColor() != color && captured.GetColor() != teammate_color) {
        *current++ = Move(from, {row, col + 1}, captured);
      }
    }
  // down
    if (IsLegalLocation(row + 1, col)) {

      const Piece captured = GetPiece(row + 1, col);
      if (captured.Missing()) {
        *current++ = Move(from, {row + 1, col});
        // BLUE kingside castling - optimized
          if (color == BLUE &&
              castling_rights.Kingside() &&
              !GetPiece({9, 0}).Present() &&  // Check empty square first (fast)
              (GetPiece({10, 0}) == Piece(BLUE, ROOK)) &&
              !IsAttackedByTeam(enemy_team, {7, 0}) &&  // King not in check
              !IsAttackedByTeam(enemy_team, {8, 0}) &&  // King's path
              !IsAttackedByTeam(enemy_team, {9, 0})) {  // King's path
        
          /*
          *current++ = Move(
              {7, 0},  // king_from
              {9, 0},  // king_to
              SimpleMove({10, 0}, {8, 0}),  // rook_from, rook_to
              CastlingRights(true, true),
              CastlingRights(false, false)
          );
          */
        }
        // GREEN queenside castling - optimized
        if (color == GREEN &&
            castling_rights.Queenside() &&
            !GetPiece({8, 13}).Present() &&  // Check empty squares first (fast)
            !GetPiece({9, 13}).Present() &&
            (GetPiece({10, 13}) == Piece(GREEN, ROOK)) &&
            !IsAttackedByTeam(enemy_team, {6, 13}) &&  // King not in check
            !IsAttackedByTeam(RED_YELLOW, {7, 13}) &&  // King's path
            !IsAttackedByTeam(RED_YELLOW, {8, 13}) &&  // King's path
            !IsAttackedByTeam(RED_YELLOW, {9, 13})) {  // King's path
    
          /*
          *current++ = Move(
              {6, 13},  // king_from
              {8, 13},  // king_to
              SimpleMove({10, 13}, {7, 13}),  // rook_from, rook_to
              CastlingRights(true, true),
              CastlingRights(false, false)
          );
          */
        }
      } else if (captured.GetColor() != color && captured.GetColor() != teammate_color) {
        *current++ = Move(from, {row + 1, col}, captured);
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
  std::cout << "\nCurrent turn: " << ToStr(turn_.GetColor()) << "\n";
}

}  // namespace chess

