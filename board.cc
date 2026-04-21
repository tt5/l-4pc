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


BoardLocation Board::GetAttacker(Team team, const BoardLocation& location) const {
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
                  if (type == QUEEN || type == ROOK) return BoardLocation(row, col);
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
                  if (type == QUEEN || type == BISHOP) return BoardLocation(row, col);
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
        return BoardLocation(row, col);
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
                      return BoardLocation(row, col);
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
                      return BoardLocation(row, col);
              }
          }
      }
  }

  return BoardLocation::kNoLocation;
}

BoardLocation Board::GetRevAttacker(Team team, const BoardLocation& location) const {
  int loc_row = location.GetRow();
  int loc_col = location.GetCol();

  // Pawn attacks (now first)
  constexpr std::pair<int, int> pawn_attacks[4][2] = {
      {{-1, -1}, {-1, 1}},   // Red
      {{-1, 1}, {1, 1}},     // Blue
      {{1, -1}, {1, 1}},     // Yellow
      {{-1, -1}, {1, -1}}    // Green
  };

  if (team == RED_YELLOW) {
      for (int color : {2, 0}) {  // Yellow first, then Red
          for (int j = 1; j >= 0; --j) {  // reversed within each color
              const auto& [dr, dc] = pawn_attacks[color][j];
              int row = loc_row + dr, col = loc_col + dc;
              if (IsLegalLocation(row, col)) {
                  const auto piece = GetPiece(row, col);
                  if (piece.Present() && piece.GetPieceType() == PAWN && piece.GetColor() == color)
                      return BoardLocation(row, col);
              }
          }
      }
  } else {
      for (int color : {3, 1}) {  // Green first, then Blue
          for (int j = 1; j >= 0; --j) {  // reversed within each color
              const auto& [dr, dc] = pawn_attacks[color][j];
              int row = loc_row + dr, col = loc_col + dc;
              if (IsLegalLocation(row, col)) {
                  const auto piece = GetPiece(row, col);
                  if (piece.Present() && piece.GetPieceType() == PAWN && piece.GetColor() == color)
                      return BoardLocation(row, col);
              }
          }
      }
  }

  // Knight moves (reversed)
  constexpr std::array<std::pair<int, int>, 8> knight_moves = {{
    {-2, -1}, {-2, 1}, {2, -1}, {2, 1}, 
    {-1, -2}, {-1, 2}, {1, -2}, {1, 2}
  }};

  for (const auto& [dr, dc] : knight_moves) {
    int row = loc_row + dr;
    int col = loc_col + dc;
    if (IsLegalLocation(row, col)) {
      const auto piece = GetPiece(row, col);
      if (piece.Present() && 
          piece.GetTeam() == team && 
          piece.GetPieceType() == KNIGHT) {
        return BoardLocation(row, col);
      }
    }
  }

  // Diagonal (reversed)
  constexpr std::array<std::pair<int, int>, 4> diagonal = {{
      {-1, 1}, {-1, -1}, {1, -1}, {1, 1}
  }};
  for (const auto& [dr, dc] : diagonal) {
      int row = loc_row + dr;
      int col = loc_col + dc;
      while (IsLegalLocation(row, col)) {
          const auto piece = GetPiece(row, col);
          if (piece.Present()) {
              if (piece.GetTeam() == team) {
                  PieceType type = piece.GetPieceType();
                  if (type == QUEEN || type == BISHOP) return BoardLocation(row, col);
              }
              break;
          }
          row += dr;
          col += dc;
      }
  }

  // Orthogonal (reversed, now last)
  constexpr std::array<std::pair<int, int>, 4> orthogonal = {{
      {-1, 0}, {0, -1}, {1, 0}, {0, 1}
  }};
  for (const auto& [dr, dc] : orthogonal) {
      int row = loc_row + dr;
      int col = loc_col + dc;
      while (IsLegalLocation(row, col)) {
          const auto piece = GetPiece(row, col);
          if (piece.Present()) {
              if (piece.GetTeam() == team) {
                  PieceType type = piece.GetPieceType();
                  if (type == QUEEN || type == ROOK) return BoardLocation(row, col);
              }
              break;
          }
          row += dr;
          col += dc;
      }
  }

  return BoardLocation::kNoLocation;
}

bool Board::IsAttackedByTeamAligned(Team team, int8_t loc_row, int8_t loc_col, int8_t rd, int8_t cd) const {
  // Search only in the specified direction for aligned attackers
  
  // Determine attacker type based on direction
  const bool is_orthogonal = (rd == 0) || (cd == 0);
  const bool is_diagonal = (rd != 0) && (cd != 0) && (rd * rd == cd * cd);
  
  //if (!is_orthogonal && !is_diagonal) {std::cout << "invalid direction" << std::endl; abort();};
  
  // Scan in the given direction until we hit a piece or board edge
  int8_t row = loc_row + rd;
  int8_t col = loc_col + cd;
  while (IsLegalLocation(row, col)) {
      const auto piece = GetPiece(row, col);
      if (piece.Present()) {
          if (piece.GetTeam() == team) {
              PieceType type = piece.GetPieceType();
              if (is_orthogonal) {
                  if (type == QUEEN || type == ROOK) return true;
              } else { // diagonal
                  if (type == QUEEN || type == BISHOP) return true;
              }
          }
          break;  // Blocked by any piece
      }
      row += rd;
      col += cd;
  }
  return false;
}

// Optimized version of GetAttackers2 for limit=1 that returns as soon as it finds an attacker
bool Board::IsAttackedByTeam(Team team, int8_t loc_row, int8_t loc_col) const {

// Orthogonal (rook/queen) - 4 directions
constexpr std::array<std::pair<int8_t, int8_t>, 4> orthogonal = {{
    {0, 1}, {1, 0}, {0, -1}, {-1, 0}
}};
for (const auto& [dr, dc] : orthogonal) {
    int8_t row = loc_row + dr;
    int8_t col = loc_col + dc;
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
constexpr std::array<std::pair<int8_t, int8_t>, 4> diagonal = {{
    {1, 1}, {1, -1}, {-1, -1}, {-1, 1}
}};
for (const auto& [dr, dc] : diagonal) {
    int8_t row = loc_row + dr;
    int8_t col = loc_col + dc;
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
  constexpr std::array<std::pair<int8_t, int8_t>, 8> knight_moves = {{
    {1, 2}, {1, -2}, {-1, 2}, {-1, -2}, {2, 1}, {2, -1}, {-2, 1}, {-2, -1}
  }};

  for (const auto& [dr, dc] : knight_moves) {
    int8_t row = loc_row + dr;
    int8_t col = loc_col + dc;
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
  constexpr std::pair<int8_t, int8_t> pawn_attacks[4][2] = {
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
              int8_t row = loc_row + dr, col = loc_col + dc;
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
              int8_t row = loc_row + dr, col = loc_col + dc;
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

Board::MoveGenResult Board::GetPseudoLegalMoves2(
    Move* buffer, 
    size_t limit, 
    const std::optional<Move>& pv_move) {
    
    MoveGenResult result{0, -1};

    if (buffer == nullptr && limit == 0) {
      for (int i = 0; i < 4; ++i) {
          result.mobility_counts[i] = 20;  // Each player has 20 legal moves initially
          result.threat_counts[i] = 0;     // No immediate threats in starting position
      }
      return result; 
    }

    if (buffer == nullptr || limit == 0) return result;
    
    //auto pstart = std::chrono::high_resolution_clock::now();

    const PlayerColor current_color = GetTurn().GetColor();
    const Team my_team = GetTeam(current_color);
    bool has_pv_move = pv_move.has_value();
    int pv_index = -1;  // -1 means PV move not found

    const auto kinglocation = GetKingLocation(current_color);
    BoardLocation attacker = GetAttacker(OtherTeam(my_team), kinglocation);
    const auto attacking_piece = GetPiece(attacker);
    const bool in_check = attacker.Present();
    const PieceType att_type = attacking_piece.GetPieceType();

    // Check for double check using reversed search
    bool double_check = false;
    if (in_check) {
        BoardLocation second_attacker = GetRevAttacker(OtherTeam(my_team), kinglocation);
        double_check = second_attacker.Present() && second_attacker != attacker;
    }

    const auto& pieces = piece_list_[current_color];
    const size_t num_pieces = pieces.size();

    Move* current = buffer;

    int threats = 0;

    for (size_t i = 0; i < num_pieces; ++i) {
        const auto& placed_piece = pieces[i];
        const auto& location = placed_piece.GetLocation();
        const auto& piece = placed_piece.GetPiece();
        const PieceType type = piece.GetPieceType();
        const int8_t from_row = location.GetRow();
        const int8_t from_col = location.GetCol();

        if (double_check && type != KING) [[unlikely]] continue;
        
        size_t before_count = current - buffer;

        if (!in_check) [[likely]] {
        // Generate moves for this piece
        switch (type) {
            case QUEEN:   {
              {
                int8_t r = from_row + 1;
                int8_t c = from_col + 1;
                while (true) {
                  if (!IsLegalLocation(r, c)) break;
                  const Piece captured = GetPiece(r, c);
                  if (captured.Present()) {
                    if (captured.GetTeam() != my_team) {
                      new (current++) Move(from_row, from_col, r, c, captured.GetRaw(), true);
                      threats += 16;
                    }
                    threats += 4;
                    break;
                  }
                  new (current++) Move(from_row, from_col, r, c, 0, true);
                  threats++;
                  r++;
                  c++;
                }
              }
              
              // Direction 2: Down-Left (1, -1)
              {
                int8_t r = from_row + 1;
                int8_t c = from_col - 1;
                while (true) {
                  if (!IsLegalLocation(r, c)) break;
                  const Piece captured = GetPiece(r, c);
                  if (captured.Present()) {
                    if (captured.GetTeam() != my_team) {
                      new (current++) Move(from_row, from_col, r, c, captured.GetRaw(), true);
                      threats += 16;
                    }
                    threats += 4;
                    break;
                  }
                  new (current++) Move(from_row, from_col, r, c, 0, true);
                  threats++;
                  r++;
                  c--;
                }
              }
              
              // Direction 3: Up-Right (-1, 1)
              {
                int8_t r = from_row - 1;
                int8_t c = from_col + 1;
                while (true) {
                  if (!IsLegalLocation(r, c)) break;
                  const Piece captured = GetPiece(r, c);
                  if (captured.Present()) {
                    if (captured.GetTeam() != my_team) {
                      new (current++) Move(from_row, from_col, r, c, captured.GetRaw(), true);
                      threats += 16;
                    }
                    threats += 4;
                    break;
                  }
                  new (current++) Move(from_row, from_col, r, c, 0, true);
                  threats++;
                  r--;
                  c++;
                }
              }
              
              // Direction 4: Up-Left (-1, -1)
              {
                int8_t r = from_row - 1;
                int8_t c = from_col - 1;
                while (true) {
                  if (!IsLegalLocation(r, c)) break;
                  const Piece captured = GetPiece(r, c);
                  if (captured.Present()) {
                    if (captured.GetTeam() != my_team) {
                      new (current++) Move(from_row, from_col, r, c, captured.GetRaw(), true);
                      threats += 16;
                    }
                    threats += 4;
                    break;
                  }
                  new (current++) Move(from_row, from_col, r, c, 0, true);
                  threats++;
                  r--;
                  c--;
                }
              }

              // Direction 1: Right (0, 1)
              {
                  int8_t c = from_col + 1;
                  while (true) {
                      if (!IsLegalLocation(from_row, c)) break;
                      const Piece captured = GetPiece(from_row, c);
                      if (captured.Present()) {
                          if (captured.GetTeam() != my_team) {
                              new (current++) Move(from_row, from_col, from_row, c, captured.GetRaw(), true);
                              threats += 16;
                          }
                          threats += 4;
                          break;
                      }
                      new (current++) Move(from_row, from_col, from_row, c, 0, true);
                      threats++;
                      c++;
                  }
              }

              // Direction 2: Left (0, -1)
              {
                  int8_t c = from_col - 1;
                  while (true) {
                      if (!IsLegalLocation(from_row, c)) break;
                      const Piece captured = GetPiece(from_row, c);
                      if (captured.Present()) {
                          if (captured.GetTeam() != my_team) {
                              new (current++) Move(from_row, from_col, from_row, c, captured.GetRaw(), true);
                              threats += 16;
                          }
                          threats += 4;
                          break;
                      }
                      new (current++) Move(from_row, from_col, from_row, c, 0, true);
                      threats++;
                      c--;
                  }
              }

              // Direction 3: Down (1, 0)
              {
                  int8_t r = from_row + 1;
                  while (true) {
                      if (!IsLegalLocation(r, from_col)) break;
                      const Piece captured = GetPiece(r, from_col);
                      if (captured.Present()) {
                          if (captured.GetTeam() != my_team) {
                              new (current++) Move(from_row, from_col, r, from_col, captured.GetRaw(), true);
                              threats += 16;
                          }
                          threats += 4;
                          break;
                      }
                      new (current++) Move(from_row, from_col, r, from_col, 0, true);
                      threats++;
                      r++;
                  }
              }

              // Direction 4: Up (-1, 0)
              {
                  int8_t r = from_row - 1;
                  while (true) {
                      if (!IsLegalLocation(r, from_col)) break;
                      const Piece captured = GetPiece(r, from_col);
                      if (captured.Present()) {
                          if (captured.GetTeam() != my_team) {
                              new (current++) Move(from_row, from_col, r, from_col, captured.GetRaw(), true);
                              threats += 16;
                          }
                          threats += 4;
                          break;
                      }
                      new (current++) Move(from_row, from_col, r, from_col, 0, true);
                      threats++;
                      r--;
                  }
              }
            } break;
            case ROOK: {
              // Direction 1: Right (0, 1)
              {
                  int8_t c = from_col + 1;
                  while (true) {
                      if (!IsLegalLocation(from_row, c)) break;
                      const Piece captured = GetPiece(from_row, c);
                      if (captured.Present()) {
                          if (captured.GetTeam() != my_team) {
                              new (current++) Move(from_row, from_col, from_row, c, captured.GetRaw(), true);
                              threats += 16;
                          }
                          threats += 4;
                          break;
                      }
                      new (current++) Move(from_row, from_col, from_row, c, 0, true);
                      threats++;
                      c++;
                  }
              }

              // Direction 2: Left (0, -1)
              {
                  int8_t c = from_col - 1;
                  while (true) {
                      if (!IsLegalLocation(from_row, c)) break;
                      const Piece captured = GetPiece(from_row, c);
                      if (captured.Present()) {
                          if (captured.GetTeam() != my_team) {
                              new (current++) Move(from_row, from_col, from_row, c, captured.GetRaw(), true);
                              threats += 16;
                          }
                          threats += 4;
                          break;
                      }
                      new (current++) Move(from_row, from_col, from_row, c, 0, true);
                      threats++;
                      c--;
                  }
              }

              // Direction 3: Down (1, 0)
              {
                  int8_t r = from_row + 1;
                  while (true) {
                      if (!IsLegalLocation(r, from_col)) break;
                      const Piece captured = GetPiece(r, from_col);
                      if (captured.Present()) {
                          if (captured.GetTeam() != my_team) {
                              new (current++) Move(from_row, from_col, r, from_col, captured.GetRaw(), true);
                              threats += 16;
                          }
                          threats += 4;
                          break;
                      }
                      new (current++) Move(from_row, from_col, r, from_col, 0, true);
                      threats++;
                      r++;
                  }
              }

              // Direction 4: Up (-1, 0)
              {
                  int8_t r = from_row - 1;
                  while (true) {
                      if (!IsLegalLocation(r, from_col)) break;
                      const Piece captured = GetPiece(r, from_col);
                      if (captured.Present()) {
                          if (captured.GetTeam() != my_team) {
                              new (current++) Move(from_row, from_col, r, from_col, captured.GetRaw(), true);
                              threats += 16;
                          }
                          threats += 4;
                          break;
                      }
                      new (current++) Move(from_row, from_col, r, from_col, 0, true);
                      threats++;
                      r--;
                  }
              }
            } break;
            case BISHOP: { 
              // Direction 1: Down-Right (1, 1)
              {
                int8_t r = from_row + 1;
                int8_t c = from_col + 1;
                while (true) {
                  if (!IsLegalLocation(r, c)) break;
                  const Piece captured = GetPiece(r, c);
                  if (captured.Present()) {
                    if (captured.GetTeam() != my_team) {
                      new (current++) Move(from_row, from_col, r, c, captured.GetRaw(), true);
                      threats += 16;
                    }
                    threats += 4;
                    break;
                  }
                  new (current++) Move(from_row, from_col, r, c, 0, true);
                  threats++;
                  r++;
                  c++;
                }
              }
              
              // Direction 2: Down-Left (1, -1)
              {
                int8_t r = from_row + 1;
                int8_t c = from_col - 1;
                while (true) {
                  if (!IsLegalLocation(r, c)) break;
                  const Piece captured = GetPiece(r, c);
                  if (captured.Present()) {
                    if (captured.GetTeam() != my_team) {
                      new (current++) Move(from_row, from_col, r, c, captured.GetRaw(), true);
                      threats += 16;
                    }
                    threats += 4;
                    break;
                  }
                  new (current++) Move(from_row, from_col, r, c, 0, true);
                  threats++;
                  r++;
                  c--;
                }
              }
              
              // Direction 3: Up-Right (-1, 1)
              {
                int8_t r = from_row - 1;
                int8_t c = from_col + 1;
                while (true) {
                  if (!IsLegalLocation(r, c)) break;
                  const Piece captured = GetPiece(r, c);
                  if (captured.Present()) {
                    if (captured.GetTeam() != my_team) {
                      new (current++) Move(from_row, from_col, r, c, captured.GetRaw(), true);
                      threats += 16;
                    }
                    threats += 4;
                    break;
                  }
                  new (current++) Move(from_row, from_col, r, c, 0, true);
                  threats++;
                  r--;
                  c++;
                }
              }
              
              // Direction 4: Up-Left (-1, -1)
              {
                int8_t r = from_row - 1;
                int8_t c = from_col - 1;
                while (true) {
                  if (!IsLegalLocation(r, c)) break;
                  const Piece captured = GetPiece(r, c);
                  if (captured.Present()) {
                    if (captured.GetTeam() != my_team) {
                      new (current++) Move(from_row, from_col, r, c, captured.GetRaw(), true);
                      threats += 16;
                    }
                    threats += 4;
                    break;
                  }
                  new (current++) Move(from_row, from_col, r, c, 0, true);
                  threats++;
                  r--;
                  c--;
                }
              }
            } break;
            case PAWN: {
               //current = GetPawnMovesDirect(current, location, current_color, my_team);

  // Consolidated direction data for pawn movement and captures
  // Indexed by PlayerColor (RED=0, BLUE=1, YELLOW=2, GREEN=3)
  struct PawnDirectionData {
    int8_t delta_row;         // Row delta for forward movement
    int8_t delta_col;         // Column delta for forward movement
    int8_t capture1_row;      // Row delta for first capture direction
    int8_t capture1_col;      // Column delta for first capture direction
    int8_t capture2_row;      // Row delta for second capture direction
    int8_t capture2_col;      // Column delta for second capture direction
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

  // Get direction data for current color
  const PawnDirectionData& dir = kPawnDirections[static_cast<int>(current_color)];
  const int8_t delta_row = dir.delta_row;
  const int8_t delta_col = dir.delta_col;
  
  
  // Precompute all possible target squares
  const int8_t forward_row = from_row + delta_row;
  const int8_t forward_col = from_col + delta_col;
  const bool is_forward_legal = IsLegalLocation(forward_row, forward_col);
  const BoardLocation forward1 = is_forward_legal ? 
      BoardLocation(forward_row, forward_col) : BoardLocation::kNoLocation;

  // Cache piece lookup only if the location is legal
  const Piece forward_piece = is_forward_legal ? 
      GetPiece(forward_row, forward_col) : Piece::kNoPiece;

  // Precompute capture squares and cache their pieces
  const int8_t capture1_row = from_row + dir.capture1_row;
  const int8_t capture1_col = from_col + dir.capture1_col;
  const bool is_capture1_legal = IsLegalLocation(capture1_row, capture1_col);
  const BoardLocation capture1_loc = is_capture1_legal ? 
      BoardLocation(capture1_row, capture1_col) : BoardLocation::kNoLocation;
  const Piece capture1_piece = is_capture1_legal ? 
      GetPiece(capture1_row, capture1_col) : Piece::kNoPiece;

  const int8_t capture2_row = from_row + dir.capture2_row;
  const int8_t capture2_col = from_col + dir.capture2_col;
  const bool is_capture2_legal = IsLegalLocation(capture2_row, capture2_col);
  const BoardLocation capture2_loc = is_capture2_legal ? 
      BoardLocation(capture2_row, capture2_col) : BoardLocation::kNoLocation;
  const Piece capture2_piece = is_capture2_legal ? 
      GetPiece(capture2_row, capture2_col) : Piece::kNoPiece; 

    // Precompute starting rows/cols for each color
  static constexpr int8_t kStartingRow[4] = {12, -1, 1, -1};  // RED, BLUE, YELLOW, GREEN
  static constexpr int8_t kStartingCol[4] = {-1, 1, -1, 12};  // -1 means not used

  // Later in the code:
  bool not_moved = (current_color == RED || current_color == YELLOW) 
      ? (from_row == kStartingRow[static_cast<int>(current_color)])
      : (from_col == kStartingCol[static_cast<int>(current_color)]);
  
  // Promotion detection: each color promotes on different edges
  static constexpr int8_t kPromotionRow[4] = {0, -1, 13, -1};   // RED, BLUE, YELLOW, GREEN
  static constexpr int8_t kPromotionCol[4] = {-1, 13, -1, 0};   // -1 means not used

  const bool is_promotion = (current_color == RED || current_color == YELLOW) 
      ? (forward_row == kPromotionRow[static_cast<int>(current_color)])
      : (forward_col == kPromotionCol[static_cast<int>(current_color)]);
    
  if (!forward_piece.Present()) [[likely]] {
    // Handle promotion or regular move
    if (is_promotion) [[unlikely]] {
      *current++ = Move(location, forward1, Piece::kNoPiece, BoardLocation::kNoLocation, Piece::kNoPiece, QUEEN);
    } else {
      //*current++ = Move(from, forward1);
      new (current++) Move(from_row, from_col, forward_row, forward_col, 0, true);
    }
    
    // Double step from starting position
    if (not_moved) {
      const int8_t forward2_row = from_row + delta_row * 2;
      const int8_t forward2_col = from_col + delta_col * 2;
      const BoardLocation forward2(forward2_row, forward2_col);
      
      // Only check the double move if the single move square was empty
      const Piece forward2_piece = GetPiece(forward2_row, forward2_col);
      if (!forward2_piece.Present()) {
        //*current++ = Move(from, forward2);
        new (current++) Move(from_row, from_col, forward2_row, forward2_col, 0, true);
      }
    }
  }
  
  // First capture direction
  if (is_capture1_legal) {
    
    // en passant double capture not implemented!
    if (current_color == RED && from_col == 3 && en_passant_targets_[BLUE].GetRow() == capture1_row && !capture1_piece.Present()) {
      *current++ = Move(location, capture1_loc, Piece::kNoPiece, forward1, forward_piece);
    } else if (current_color == BLUE && from_row == 3 && en_passant_targets_[YELLOW].GetCol() == capture1_col && !capture1_piece.Present()) {
      *current++ = Move(location, capture1_loc, Piece::kNoPiece, forward1, forward_piece);
    } else if (current_color == YELLOW && from_col == 10 && en_passant_targets_[GREEN].GetRow() == capture1_row && !capture1_piece.Present()) {
      *current++ = Move(location, capture1_loc, Piece::kNoPiece, forward1, forward_piece);
    } else if (current_color == GREEN && from_row == 10 && en_passant_targets_[RED].GetCol() == capture1_col && !capture1_piece.Present()) {
      *current++ = Move(location, capture1_loc, Piece::kNoPiece, forward1, forward_piece);
    } else {
      // Regular capture - use cached piece
      if (capture1_piece.Present() && capture1_piece.GetTeam() != my_team) {
        //Handle promotion on capture or regular capture
        if (is_promotion) [[unlikely]] {
          *current++ = Move(location, {capture1_row, capture1_col}, capture1_piece, BoardLocation::kNoLocation, Piece::kNoPiece, QUEEN);
        } else {
          //*current++ = Move(from, capture1_loc, captured1);
          new (current++) Move(from_row, from_col, capture1_row, capture1_col, capture1_piece.GetRaw(), true);
        }
      }
    }
  }

  // Second capture direction
  if (is_capture2_legal) {
    
    // en passant double capture not implemented!
    if (current_color == RED && from_col == 10 && en_passant_targets_[GREEN].GetRow() == capture2_row && !capture2_piece.Present()) {
      *current++ = Move(location, capture2_loc, Piece::kNoPiece, forward1, forward_piece);
    } else if (current_color == BLUE && from_row == 10 && en_passant_targets_[RED].GetCol() == capture2_col && !capture2_piece.Present()) {
      *current++ = Move(location, capture2_loc, Piece::kNoPiece, forward1, forward_piece);
    } else if (current_color == YELLOW && from_col == 3 && en_passant_targets_[BLUE].GetRow() == capture2_row && !capture2_piece.Present()) {
      *current++ = Move(location, capture2_loc, Piece::kNoPiece, forward1, forward_piece);
    } else if (current_color == GREEN && from_row == 3 && en_passant_targets_[YELLOW].GetCol() == capture2_col && !capture2_piece.Present()) {
      *current++ = Move(location, capture2_loc, Piece::kNoPiece, forward1, forward_piece);
    } else {
      // Regular capture - use cached piece
      if (capture2_piece.Present() && capture2_piece.GetTeam() != my_team) {
        // Handle promotion on capture or regular capture
        if (is_promotion) [[unlikely]] {
          *current++ = Move(location, {capture2_row, capture2_col}, capture2_piece, BoardLocation::kNoLocation, Piece::kNoPiece, QUEEN);
        } else {
          //*current++ = Move(from, to2, captured2);
          new (current++) Move(from_row, from_col, capture2_row, capture2_col, capture2_piece.GetRaw(), true);
        }
      }
    }
  }
            } break;
            case KNIGHT: { 
              // (+2, +1)
              if (IsLegalLocation(from_row + 2, from_col + 1)) {
                  const Piece p = GetPiece(from_row + 2, from_col + 1);
                  if (p.Present()) {
                      if (p.GetTeam() != my_team) {
                          new (current++) Move(from_row, from_col, from_row + 2, from_col + 1, p.GetRaw(), true);
                          threats += 16;
                      }
                      threats += 1;
                  } else {
                      new (current++) Move(from_row, from_col, from_row + 2, from_col + 1, 0, true);
                  }
              }
              // (+2, -1)
              if (IsLegalLocation(from_row + 2, from_col - 1)) {
                  const Piece p = GetPiece(from_row + 2, from_col - 1);
                  if (p.Present()) {
                      if (p.GetTeam() != my_team) {
                          new (current++) Move(from_row, from_col, from_row + 2, from_col - 1, p.GetRaw(), true);
                          threats += 16;
                      }
                      threats += 1;
                  } else {
                      new (current++) Move(from_row, from_col, from_row + 2, from_col - 1, 0, true);
                  }
              }
              // (-2, +1)
              if (IsLegalLocation(from_row - 2, from_col + 1)) {
                  const Piece p = GetPiece(from_row - 2, from_col + 1);
                  if (p.Present()) {
                      if (p.GetTeam() != my_team) {
                          new (current++) Move(from_row, from_col, from_row - 2, from_col + 1, p.GetRaw(), true);
                          threats += 16;
                      }
                      threats += 1;
                  } else {
                      new (current++) Move(from_row, from_col, from_row - 2, from_col + 1, 0, true);
                  }
              }
              // (-2, -1)
              if (IsLegalLocation(from_row - 2, from_col - 1)) {
                  const Piece p = GetPiece(from_row - 2, from_col - 1);
                  if (p.Present()) {
                      if (p.GetTeam() != my_team) {
                          new (current++) Move(from_row, from_col, from_row - 2, from_col - 1, p.GetRaw(), true);
                          threats += 16;
                      }
                      threats += 1;
                  } else {
                      new (current++) Move(from_row, from_col, from_row - 2, from_col - 1, 0, true);
                  }
              }
              // (+1, +2)
              if (IsLegalLocation(from_row + 1, from_col + 2)) {
                  const Piece p = GetPiece(from_row + 1, from_col + 2);
                  if (p.Present()) {
                      if (p.GetTeam() != my_team) {
                          new (current++) Move(from_row, from_col, from_row + 1, from_col + 2, p.GetRaw(), true);
                          threats += 16;
                      }
                      threats += 1;
                  } else {
                      new (current++) Move(from_row, from_col, from_row + 1, from_col + 2, 0, true);
                  }
              }
              // (+1, -2)
              if (IsLegalLocation(from_row + 1, from_col - 2)) {
                  const Piece p = GetPiece(from_row + 1, from_col - 2);
                  if (p.Present()) {
                      if (p.GetTeam() != my_team) {
                          new (current++) Move(from_row, from_col, from_row + 1, from_col - 2, p.GetRaw(), true);
                          threats += 16;
                      }
                      threats += 1;
                  } else {
                      new (current++) Move(from_row, from_col, from_row + 1, from_col - 2, 0, true);
                  }
              }
              // (-1, +2)
              if (IsLegalLocation(from_row - 1, from_col + 2)) {
                  const Piece p = GetPiece(from_row - 1, from_col + 2);
                  if (p.Present()) {
                      if (p.GetTeam() != my_team) {
                          new (current++) Move(from_row, from_col, from_row - 1, from_col + 2, p.GetRaw(), true);
                          threats += 16;
                      }
                      threats += 1;
                  } else {
                      new (current++) Move(from_row, from_col, from_row - 1, from_col + 2, 0, true);
                  }
              }
              // (-1, -2)
              if (IsLegalLocation(from_row - 1, from_col - 2)) {
                  const Piece p = GetPiece(from_row - 1, from_col - 2);
                  if (p.Present()) {
                      if (p.GetTeam() != my_team) {
                          new (current++) Move(from_row, from_col, from_row - 1, from_col - 2, p.GetRaw(), true);
                          threats += 16;
                      }
                      threats += 1;
                  } else {
                      new (current++) Move(from_row, from_col, from_row - 1, from_col - 2, 0, true);
                  }
              }
  
            } break;
            case KING: {
               //current = GetKingMovesNoCheck(current, location, current_color, my_team);
  const Team enemy_team = OtherTeam(my_team);
  
  const CastlingRights& castling_rights = castling_rights_[current_color];

    // up-left
    if (IsLegalLocation(from_row - 1, from_col - 1)) {
      //if (!IsAttackedByTeam(enemy_team, {row - 1, col - 1})) {
        const Piece captured = GetPiece(from_row - 1, from_col - 1);
        if (captured.Missing() || captured.GetTeam() != my_team) {
            //*current++ = Move(from, {row - 1, col - 1}, captured, castling_rights);
            new (current++) Move(from_row, from_col, from_row -1, from_col - 1, captured.GetRaw(), castling_rights, true);
        }
      //}
    }

    // up-right
    if (IsLegalLocation(from_row - 1, from_col + 1)) {
        const Piece captured = GetPiece(from_row - 1, from_col + 1);
        if (captured.Missing() || captured.GetTeam() != my_team) {
            //*current++ = Move(from, {row - 1, col + 1}, captured, castling_rights);
            new (current++) Move(from_row, from_col, from_row -1, from_col + 1, captured.GetRaw(), castling_rights, true);
        }
    }

    // down-left
    if (IsLegalLocation(from_row + 1, from_col - 1)) {
        const Piece captured = GetPiece(from_row + 1, from_col - 1);
        if (captured.Missing() || captured.GetTeam() != my_team) {
            //*current++ = Move(from, {row + 1, col - 1}, captured, castling_rights);
            new (current++) Move(from_row, from_col, from_row + 1, from_col - 1, captured.GetRaw(), castling_rights, true);
        }
    }

    // down-right
    if (IsLegalLocation(from_row + 1, from_col + 1)) {
        const Piece captured = GetPiece(from_row + 1, from_col + 1);
        if (captured.Missing() || captured.GetTeam() != my_team) {
            //*current++ = Move(from, {row + 1, col + 1}, captured, castling_rights);
            new (current++) Move(from_row, from_col, from_row + 1, from_col + 1, captured.GetRaw(), castling_rights, true);
        }
    }

    // up
    if (IsLegalLocation(from_row - 1, from_col)) {
      const Piece captured = GetPiece(from_row - 1, from_col);
      if (captured.Missing()) {
        //*current++ = Move(from, {row - 1, col});
        new (current++) Move(from_row, from_col, from_row - 1, from_col, 0, true);

        // Blue queenside castling
        if (current_color == BLUE &&
            castling_rights.Queenside() && 
            !GetPiece({4, 0}).Present() && // knight
            !GetPiece({5, 0}).Present() && // bishop
            //!GetPiece({6, 0}).Present() && // queen, empty!
            (GetPiece({3, 0}) == Piece(BLUE, ROOK)) &&
            !IsAttackedByTeam(enemy_team, 6, 0) // queen
            ) {
            *current++ = Move(
                {7, 0},  // king_from
                {5, 0},  // king_to
                SimpleMove({3, 0}, {6, 0}),  // rook_from, rook_to
                castling_rights
            );
        }

        // Green kingside castling
        if (current_color == GREEN &&
            castling_rights.Kingside() &&
            !GetPiece({4, 13}).Present() && // knight
            //!GetPiece({4, 13}).Present() && // bishop, empty!
            (GetPiece({3, 13}) == Piece(GREEN, ROOK)) &&
            !IsAttackedByTeam(enemy_team, 5, 13)) {  // bishop
            
            *current++ = Move(
                {6, 13},  // king_from
                {4, 13},  // king_to
                SimpleMove({3, 13}, {5, 13}),  // rook_from, rook_to
                castling_rights
            );
        }
      } else if (captured.GetTeam() != my_team) {
        //*current++ = Move(from, {row - 1, col}, captured, castling_rights);
        new (current++) Move(from_row, from_col, from_row - 1, from_col, captured.GetRaw(), castling_rights, true);
      }
    }

    // left
    if (IsLegalLocation(from_row, from_col - 1)) {
      const Piece captured = GetPiece(from_row, from_col - 1);
      if (captured.Missing()) {
        //*current++ = Move(from, {row, col - 1});
        new (current++) Move(from_row, from_col, from_row, from_col - 1, 0, true);

        // Red queenside castling - optimized
        if (current_color == RED &&
            castling_rights.Queenside() &&
            !GetPiece({13, 4}).Present() && // knight
            !GetPiece({13, 5}).Present() && // bishop
            // queen square is empty
            (GetPiece({13, 3}) == Piece(RED, ROOK)) &&
            !IsAttackedByTeam(enemy_team, 13, 6))  // queen
          {
            
            *current++ = Move(
              {13, 7},  // king_from
              {13, 5},  // king_to
              SimpleMove({13, 3}, {13, 6}),  // rook_from, rook_to
              castling_rights
            );
        }
        // YELLOW kingside castling - optimized
        if (current_color == YELLOW &&
            castling_rights.Kingside() &&
            !GetPiece({0, 4}).Present() && // knight
            // bishop is empty
            (GetPiece({0, 3}) == Piece(YELLOW, ROOK)) &&
            !IsAttackedByTeam(enemy_team, 0, 5)) {  // bishop
      
            *current++ = Move(
                {0, 6},  // king_from
                {0, 4},  // king_to
                SimpleMove({0, 3}, {0, 5}),  // rook_from, rook_to
                castling_rights
            );
        }   
      } else if (captured.GetTeam() != my_team) {
        //*current++ = Move(from, {row, col - 1}, captured, castling_rights);
        new (current++) Move(from_row, from_col, from_row, from_col - 1, captured.GetRaw(), castling_rights, true);
      }
    }

    // right
    if (IsLegalLocation(from_row, from_col + 1)) {
      const Piece captured = GetPiece(from_row, from_col + 1);
      if (captured.Missing()) {
        //*current++ = Move(from, {row, col + 1});
        new (current++) Move(from_row, from_col, from_row, from_col + 1, 0, true);

        // RED kingside castling - optimized
        if (current_color == RED &&
            castling_rights.Kingside() &&
            !GetPiece({13, 9}).Present() &&  // knight
            // bishop empty
            (GetPiece({13, 10}) == Piece(RED, ROOK)) &&
            !IsAttackedByTeam(enemy_team, 13, 8)) {  // bishop
            
            *current++ = Move(
                {13, 7},  // king_from
                {13, 9},  // king_to
                SimpleMove({13, 10}, {13, 8}),  // rook_from, rook_to
                castling_rights
            );
        }
        // YELLOW queenside castling - optimized
        if (current_color == YELLOW &&
            castling_rights.Queenside() &&
            !GetPiece({0, 9}).Present() &&  // knight
            !GetPiece({0, 8}).Present() &&  // bishop
            // queen empty
            (GetPiece({0, 10}) == Piece(YELLOW, ROOK)) &&
            !IsAttackedByTeam(enemy_team, 0, 7))  // queen
            {
            
            *current++ = Move(
                {0, 6},  // king_from
                {0, 8},  // king_to
                SimpleMove({0, 10}, {0, 7}),  // rook_from, rook_to
                castling_rights
            );
        }
      } else if (captured.GetTeam() != my_team) {
        //*current++ = Move(from, {row, col + 1}, captured, castling_rights);
        new (current++) Move(from_row, from_col, from_row, from_col + 1, captured.GetRaw(), castling_rights, true);
      }
    }
  // down
    if (IsLegalLocation(from_row + 1, from_col)) {

      const Piece captured = GetPiece(from_row + 1, from_col);
      if (captured.Missing()) {
        //*current++ = Move(from, {row + 1, col});
        new (current++) Move(from_row, from_col, from_row + 1, from_col, 0, true);

        // BLUE kingside castling
          if (current_color == BLUE &&
              castling_rights.Kingside() &&
              !GetPiece({9, 0}).Present() &&  // knight
              // bishop empty
              (GetPiece({10, 0}) == Piece(BLUE, ROOK)) &&
              !IsAttackedByTeam(enemy_team, 8, 0)) {  // bishop
        
          *current++ = Move(
              {7, 0},  // king_from
              {9, 0},  // king_to
              SimpleMove({10, 0}, {8, 0}),  // rook_from, rook_to
              castling_rights
            );
        }
        // GREEN queenside castling
        if (current_color == GREEN &&
          castling_rights.Queenside() &&
          // queen empty
          !GetPiece({8, 13}).Present() && // bishop
          !GetPiece({9, 13}).Present() && // knight
          (GetPiece({10, 13}) == Piece(GREEN, ROOK)) &&
          !IsAttackedByTeam(enemy_team, 7, 13))  // queen
          {  // King's path
    
          *current++ = Move(
              {6, 13},  // king_from
              {8, 13},  // king_to
              SimpleMove({10, 13}, {7, 13}),  // rook_from, rook_to
              castling_rights
            );
        }
      } else if (captured.GetTeam() != my_team) {
        //*current++ = Move(from, {row + 1, col}, captured, castling_rights);
        new (current++) Move(from_row, from_col, from_row + 1, from_col, captured.GetRaw(), castling_rights, true);
      }
    }
            } break;
            default: assert(false && "Movegen: Invalid piece type");
        }

      } else if ( // in_check [[unlikely]]
          att_type == QUEEN ||
          att_type == ROOK ||
          att_type == BISHOP
        ) {

        // List all squares between king and attacker (for blocking moves)
        int8_t king_row = kinglocation.GetRow();
        int8_t king_col = kinglocation.GetCol();
        int8_t att_row = attacker.GetRow();
        int8_t att_col = attacker.GetCol();
        
        int8_t drow = (att_row > king_row) ? 1 : (att_row < king_row) ? -1 : 0;
        int8_t dcol = (att_col > king_col) ? 1 : (att_col < king_col) ? -1 : 0;
        
        // Iterate through all squares between king and attacker
        int8_t r = king_row + drow;
        int8_t c = king_col + dcol;
        while (r != att_row || c != att_col) {

            int8_t row_diff = r - from_row;
            int8_t col_diff = c - from_col;

            switch (type) {
              case QUEEN: {
                
                if ((row_diff == 0 || col_diff == 0) && (row_diff != 0 || col_diff != 0)) {
                    int8_t row_step = (row_diff > 0) ? 1 : (row_diff < 0) ? -1 : 0;
                    int8_t col_step = (col_diff > 0) ? 1 : (col_diff < 0) ? -1 : 0;
                    
                    bool blocked = false;
                    int8_t tr = from_row + row_step;
                    int8_t tc = from_col + col_step;
                    while (tr != r || tc != c) {
                        if (!IsLegalLocation(tr, tc) || GetPiece(tr, tc).Present()) {
                            blocked = true;
                            break;
                        }
                        tr += row_step;
                      tc += col_step;
                  }
                  
                  if (!blocked) {
                      new (current++) Move(from_row, from_col, r, c, 0, true);
                      threats += 16;
                  }
                }

                if (row_diff && (row_diff == col_diff || row_diff == -col_diff)) {
                    int8_t row_step = (row_diff > 0) ? 1 : -1;
                    int8_t col_step = (col_diff > 0) ? 1 : -1;
                    
                    bool blocked = false;
                    int8_t tr = from_row + row_step;
                    int8_t tc = from_col + col_step;
                    while (tr != r || tc != c) {
                        if (!IsLegalLocation(tr,tc) || GetPiece(tr, tc).Present()) {
                            blocked = true;
                            break;
                        }
                        tr += row_step;
                        tc += col_step;
                    }
                    
                    if (!blocked) {
                        new (current++) Move(from_row, from_col, r, c, 0, true);
                        threats += 16;
                    }
                }
              } break;
              case BISHOP: {
                
                if (row_diff && (row_diff == col_diff || row_diff == -col_diff)) {
                    int8_t row_step = (row_diff > 0) ? 1 : -1;
                    int8_t col_step = (col_diff > 0) ? 1 : -1;
                    
                    bool blocked = false;
                    int8_t tr = from_row + row_step;
                    int8_t tc = from_col + col_step;
                    while (tr != r || tc != c) {
                        if (!IsLegalLocation(tr,tc) || GetPiece(tr, tc).Present()) {
                            blocked = true;
                            break;
                        }
                        tr += row_step;
                        tc += col_step;
                      }
                      
                      if (!blocked) {
                          new (current++) Move(from_row, from_col, r, c, 0, true);
                          threats += 16;
                      }
                  }
                } break;
                case ROOK: {
                
                  if ((row_diff == 0 || col_diff == 0) && (row_diff != 0 || col_diff != 0)) {
                    int8_t row_step = (row_diff > 0) ? 1 : (row_diff < 0) ? -1 : 0;
                    int8_t col_step = (col_diff > 0) ? 1 : (col_diff < 0) ? -1 : 0;
                    
                    bool blocked = false;
                    int8_t tr = from_row + row_step;
                    int8_t tc = from_col + col_step;
                    while (tr != r || tc != c) {
                        if (!IsLegalLocation(tr, tc) || GetPiece(tr, tc).Present()) {
                            blocked = true;
                            break;
                        }
                        tr += row_step;
                      tc += col_step;
                  }
                  
                  if (!blocked) {
                      new (current++) Move(from_row, from_col, r, c, 0, true);
                      threats += 16;
                  }
              }
            } break;
            case KNIGHT: {
              uint8_t dr = r > from_row ? r - from_row : from_row - r;
              uint8_t dc = c > from_col ? c - from_col : from_col - c;
              
              if (dr * dc == 2) {
                  new (current++) Move(from_row, from_col, r, c, 0, true);
                  threats += 16;
              }
            } break;
            case PAWN: {
              
              switch (current_color) {
                case RED:
                  // RED moves up (-1, 0), starts at row 12
                  if (row_diff == -1 && col_diff == 0) {
                      new (current++) Move(from_row, from_col, r, c, 0, true);
                      threats += 16;
                  } else if (row_diff == -2 && col_diff == 0 && from_row == 12) {
                      if (GetPiece(from_row - 1, c).Missing()) {
                          new (current++) Move(from_row, from_col, r, c, 0, true);
                          threats += 16;
                      }
                  }
                  break;
                case BLUE:
                  // BLUE moves right (0, +1), starts at col 1
                  if (row_diff == 0 && col_diff == 1) {
                      new (current++) Move(from_row, from_col, r, c, 0, true);
                      threats += 16;
                  } else if (row_diff == 0 && col_diff == 2 && from_col == 1) {
                      if (GetPiece(r, from_col + 1).Missing()) {
                          new (current++) Move(from_row, from_col, r, c, 0, true);
                          threats += 16;
                      }
                  }
                  break;
                case YELLOW:
                  // YELLOW moves down (+1, 0), starts at row 1
                  if (row_diff == 1 && col_diff == 0) {
                      new (current++) Move(from_row, from_col, r, c, 0, true);
                      threats += 16;
                  } else if (row_diff == 2 && col_diff == 0 && from_row == 1) {
                      if (GetPiece(from_row + 1, c).Missing()) {
                          new (current++) Move(from_row, from_col, r, c, 0, true);
                          threats += 16;
                      }
                  }
                  break;
                case GREEN:
                  // GREEN moves left (0, -1), starts at col 12
                  if (row_diff == 0 && col_diff == -1) {
                      new (current++) Move(from_row, from_col, r, c, 0, true);
                      threats += 16;
                  } else if (row_diff == 0 && col_diff == -2 && from_col == 12) {
                      if (GetPiece(r, from_col - 1).Missing()) {
                          new (current++) Move(from_row, from_col, r, c, 0, true);
                          threats += 16;
                      }
                  }
                  break;
                default: break;
              }
            } break;
            default: ;
            }

            r += drow;
            c += dcol;
        }


        // capture attacker
        int8_t row_diff = att_row - from_row;
        int8_t col_diff = att_col - from_col;
        switch (type) {

            case QUEEN:   {
                  bool occupied = false;
                  if (row_diff != 0 && (row_diff == col_diff || row_diff == -col_diff)) {
                      int8_t row_step = row_diff > 0 ? 1 : -1;
                      int8_t col_step = col_diff > 0 ? 1 : -1;
                      int8_t tr = from_row + row_step;
                      int8_t tc = from_col + col_step;
                      while (tr != att_row && tc != att_col) {
                          if (GetPiece(tr, tc).Present()) {
                            occupied = true;
                            break;
                          }
                          tr += row_step;
                          tc += col_step;
                      }
                      if (!occupied) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                        threats += 16;
                      }
                  }

                  occupied = false;
                  if (from_row == att_row) {
                      int8_t step = (att_col > from_col) ? 1 : -1;
                      for (int8_t tc = from_col + step; tc != att_col; tc += step) {
                          if (GetPiece(from_row, tc).Present()) {
                            occupied = true;
                            break;
                          }
                      }
                      if (occupied == true) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                        threats += 16;
                      }
                  } else if (from_col == att_col) {
                      int8_t step = (att_row > from_row) ? 1 : -1;
                      for (int8_t tr = from_row + step; tr != att_row; tr += step) {
                          if (GetPiece(tr, from_col).Present()) {
                            occupied = true;
                            break;
                          }
                      }
                      if (occupied == true) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                        threats += 16;
                      }
                  }
              } break;
            case ROOK: {
                  bool occupied = false;
                  if (from_row == att_row) {
                      int8_t step = (att_col > from_col) ? 1 : -1;
                      for (int8_t tc = from_col + step; tc != att_col; tc += step) {
                          if (GetPiece(from_row, tc).Present()) {
                            occupied = true;
                            break;
                          }
                      }
                      if (occupied == true) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                        threats += 16;
                      }
                  } else if (from_col == att_col) {
                      int8_t step = (att_row > from_row) ? 1 : -1;
                      for (int8_t tr = from_row + step; tr != att_row; tr += step) {
                          if (GetPiece(tr, from_col).Present()) {
                            occupied = true;
                            break;
                          }
                      }
                      if (occupied == true) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                        threats += 16;
                      }
                  }
              }  break;
            case BISHOP:  {
                  bool occupied = false;
                  if (row_diff != 0 && (row_diff == col_diff || row_diff == -col_diff)) {
                      int8_t row_step = row_diff > 0 ? 1 : -1;
                      int8_t col_step = col_diff > 0 ? 1 : -1;
                      int8_t tr = from_row + row_step;
                      int8_t tc = from_col + col_step;
                      while (tr != att_row && tc != att_col) {
                          if (GetPiece(tr, tc).Present()) {
                            occupied = true;
                            break;
                          }
                          tr += row_step;
                          tc += col_step;
                      }
                      if (!occupied) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                        threats += 16;
                      }
                  }
            } break;
            case PAWN: {
                
                switch (current_color) {
                    case RED:
                        // RED captures up-left (-1,-1) and up-right (-1,+1)
                        if (row_diff == -1 && (col_diff == -1 || col_diff == 1)) {
                            new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                            threats += 16;
                        }
                        break;
                    case BLUE:
                        // BLUE captures up-right (-1,+1) and down-right (+1,+1)
                        if (col_diff == 1 && (row_diff == -1 || row_diff == 1)) {
                            new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                            threats += 16;
                        }
                        break;
                    case YELLOW:
                        // YELLOW captures down-right (+1,+1) and down-left (+1,-1)
                        if (row_diff == 1 && (col_diff == 1 || col_diff == -1)) {
                            new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                            threats += 16;
                        }
                        break;
                    case GREEN:
                        // GREEN captures down-left (+1,-1) and up-left (-1,-1)
                        if (col_diff == -1 && (row_diff == 1 || row_diff == -1)) {
                            new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                            threats += 16;
                        }
                        break;
                    default: break;
                }
            } break;
            case KNIGHT:  {
              uint8_t dr = r > from_row ? r - from_row : from_row - r;
              uint8_t dc = c > from_col ? c - from_col : from_col - c;
              
              if (dr * dc == 2) {
                    new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                    threats += 16;
                }
            } break;
            case KING: {
              // just move/capture in all 8 directions
                //current = GetKingMovesCheck(current, location, current_color, my_team);
  const Team enemy_team = OtherTeam(my_team);
  
  const CastlingRights& castling_rights = castling_rights_[current_color];

    // up-left
    if (IsLegalLocation(from_row - 1, from_col - 1)) {
      //if (!IsAttackedByTeam(enemy_team, {row - 1, col - 1})) {
        const Piece captured = GetPiece(from_row - 1, from_col - 1);
        if (captured.Missing() || captured.GetTeam() != my_team) {
            //*current++ = Move(from, {row - 1, col - 1}, captured, castling_rights);
            new (current++) Move(from_row, from_col, from_row -1, from_col - 1, captured.GetRaw(), castling_rights, true);
        }
      //}
    }

    // up-right
    if (IsLegalLocation(from_row - 1, from_col + 1)) {
        const Piece captured = GetPiece(from_row - 1, from_col + 1);
        if (captured.Missing() || captured.GetTeam() != my_team) {
            //*current++ = Move(from, {row - 1, col + 1}, captured, castling_rights);
            new (current++) Move(from_row, from_col, from_row -1, from_col + 1, captured.GetRaw(), castling_rights, true);
        }
    }

    // down-left
    if (IsLegalLocation(from_row + 1, from_col - 1)) {
        const Piece captured = GetPiece(from_row + 1, from_col - 1);
        if (captured.Missing() || captured.GetTeam() != my_team) {
            //*current++ = Move(from, {row + 1, col - 1}, captured, castling_rights);
            new (current++) Move(from_row, from_col, from_row + 1, from_col - 1, captured.GetRaw(), castling_rights, true);
        }
    }

    // down-right
    if (IsLegalLocation(from_row + 1, from_col + 1)) {
        const Piece captured = GetPiece(from_row + 1, from_col + 1);
        if (captured.Missing() || captured.GetTeam() != my_team) {
            //*current++ = Move(from, {row + 1, col + 1}, captured, castling_rights);
            new (current++) Move(from_row, from_col, from_row + 1, from_col + 1, captured.GetRaw(), castling_rights, true);
        }
    }

    // up
    if (IsLegalLocation(from_row - 1, from_col)) {
      const Piece captured = GetPiece(from_row - 1, from_col);
      if (captured.Missing()) {
        //*current++ = Move(from, {row - 1, col});
        new (current++) Move(from_row, from_col, from_row - 1, from_col, 0, true);
      } else if (captured.GetTeam() != my_team) {
        //*current++ = Move(from, {row - 1, col}, captured, castling_rights);
        new (current++) Move(from_row, from_col, from_row - 1, from_col, captured.GetRaw(), castling_rights, true);
      }
    }

    // left
    if (IsLegalLocation(from_row, from_col - 1)) {
      const Piece captured = GetPiece(from_row, from_col - 1);
      if (captured.Missing()) {
        //*current++ = Move(from, {row, col - 1});
        new (current++) Move(from_row, from_col, from_row, from_col - 1, 0, true);
      } else if (captured.GetTeam() != my_team) {
        //*current++ = Move(from, {row, col - 1}, captured, castling_rights);
        new (current++) Move(from_row, from_col, from_row, from_col - 1, captured.GetRaw(), castling_rights, true);
      }
    }

    // right
    if (IsLegalLocation(from_row, from_col + 1)) {
      const Piece captured = GetPiece(from_row, from_col + 1);
      if (captured.Missing()) {
        //*current++ = Move(from, {row, col + 1});
        new (current++) Move(from_row, from_col, from_row, from_col + 1, 0, true);
      } else if (captured.GetTeam() != my_team) {
        //*current++ = Move(from, {row, col + 1}, captured, castling_rights);
        new (current++) Move(from_row, from_col, from_row, from_col + 1, captured.GetRaw(), castling_rights, true);
      }
    }
  // down
    if (IsLegalLocation(from_row + 1, from_col)) {

      const Piece captured = GetPiece(from_row + 1, from_col);
      if (captured.Missing()) {
        //*current++ = Move(from, {row + 1, col});
        new (current++) Move(from_row, from_col, from_row + 1, from_col, 0, true);
      } else if (captured.GetTeam() != my_team) {
        //*current++ = Move(from, {row + 1, col}, captured, castling_rights);
        new (current++) Move(from_row, from_col, from_row + 1, from_col, captured.GetRaw(), castling_rights, true);
      }
    }
            } break;
            default: assert(false && "Movegen: Invalid piece type");
        }

      } else if ( // can only capture the attacker
        att_type == KNIGHT ||
        att_type == PAWN
      ) {
        const int8_t att_row = attacker.GetRow();
        const int8_t att_col = attacker.GetCol();
        const int8_t king_row = kinglocation.GetRow();
        const int8_t king_col = kinglocation.GetCol();

        // Direction from king to attacker
        int8_t drow = (att_row > king_row) ? 1 : (att_row < king_row) ? -1 : 0;
        int8_t dcol = (att_col > king_col) ? 1 : (att_col < king_col) ? -1 : 0;

        int8_t row_diff = att_row - from_row;
        int8_t col_diff = att_col - from_col;

        switch (type) {
            case QUEEN:   {
                  bool occupied = false;
                  if (row_diff != 0 && (row_diff == col_diff || row_diff == -col_diff)) {
                      int8_t row_step = row_diff > 0 ? 1 : -1;
                      int8_t col_step = col_diff > 0 ? 1 : -1;
                      int8_t tr = from_row + row_step;
                      int8_t tc = from_col + col_step;
                      while (tr != att_row && tc != att_col) {
                          if (GetPiece(tr, tc).Present()) {
                            occupied = true;
                            break;
                          }
                          tr += row_step;
                          tc += col_step;
                      }
                      if (!occupied) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                        threats += 16;
                      }
                  }

                  occupied = false;
                  if (from_row == att_row) {
                      int8_t step = (att_col > from_col) ? 1 : -1;
                      for (int8_t tc = from_col + step; tc != att_col; tc += step) {
                          if (GetPiece(from_row, tc).Present()) {
                            occupied = true;
                            break;
                          }
                      }
                      if (occupied == true) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                        threats += 16;
                      }
                  } else if (from_col == att_col) {
                      int8_t step = (att_row > from_row) ? 1 : -1;
                      for (int8_t tr = from_row + step; tr != att_row; tr += step) {
                          if (GetPiece(tr, from_col).Present()) {
                            occupied = true;
                            break;
                          }
                      }
                      if (occupied == true) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                        threats += 16;
                      }
                  }
              } break;
            case ROOK:    {
                  bool occupied = false;
                  if (from_row == att_row) {
                      int8_t step = (att_col > from_col) ? 1 : -1;
                      for (int8_t tc = from_col + step; tc != att_col; tc += step) {
                          if (GetPiece(from_row, tc).Present()) {
                            occupied = true;
                            break;
                          }
                      }
                      if (occupied == true) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                        threats += 16;
                      }
                  } else if (from_col == att_col) {
                      int8_t step = (att_row > from_row) ? 1 : -1;
                      for (int8_t tr = from_row + step; tr != att_row; tr += step) {
                          if (GetPiece(tr, from_col).Present()) {
                            occupied = true;
                            break;
                          }
                      }
                      if (occupied == true) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                        threats += 16;
                      }
                  }
              }
              break;
            case BISHOP:  {
                  bool occupied = false;
                  if (row_diff != 0 && (row_diff == col_diff || row_diff == -col_diff)) {
                      int8_t row_step = row_diff > 0 ? 1 : -1;
                      int8_t col_step = col_diff > 0 ? 1 : -1;
                      int8_t tr = from_row + row_step;
                      int8_t tc = from_col + col_step;
                      while (tr != att_row && tc != att_col) {
                          if (GetPiece(tr, tc).Present()) {
                            occupied = true;
                            break;
                          }
                          tr += row_step;
                          tc += col_step;
                      }
                      if (!occupied) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                        threats += 16;
                      }
                  }
              } break;
            case PAWN:    {
                // DOES NOT HANDLE EN PASSANT!
                
                switch (current_color) {
                    case RED:
                        // RED captures up-left (-1,-1) and up-right (-1,+1)
                        if (row_diff == -1 && (col_diff == -1 || col_diff == 1)) {
                            new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                            threats += 16;
                        }
                        break;
                    case BLUE:
                        // BLUE captures up-right (-1,+1) and down-right (+1,+1)
                        if (col_diff == 1 && (row_diff == -1 || row_diff == 1)) {
                            new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                            threats += 16;
                        }
                        break;
                    case YELLOW:
                        // YELLOW captures down-right (+1,+1) and down-left (+1,-1)
                        if (row_diff == 1 && (col_diff == 1 || col_diff == -1)) {
                            new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                            threats += 16;
                        }
                        break;
                    case GREEN:
                        // GREEN captures down-left (+1,-1) and up-left (-1,-1)
                        if (col_diff == -1 && (row_diff == 1 || row_diff == -1)) {
                            new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                            threats += 16;
                        }
                        break;
                    default: break;
                }
            } break;
            case KNIGHT:  {
                uint8_t dr = row_diff > 0 ? row_diff : -row_diff;
                uint8_t dc = col_diff > 0 ? col_diff : -col_diff;
                
                if (dr * dc == 2) {
                    new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw(), true);
                    threats += 16;
                }
            } break;
            case KING:    {
              // just move/capture in all 8 directions
              //current = GetKingMovesCheck(current, location, current_color, my_team);
  const Team enemy_team = OtherTeam(my_team);
  
  const CastlingRights& castling_rights = castling_rights_[current_color];

    // up-left
    if (IsLegalLocation(from_row - 1, from_col - 1)) {
      //if (!IsAttackedByTeam(enemy_team, {row - 1, col - 1})) {
        const Piece captured = GetPiece(from_row - 1, from_col - 1);
        if (captured.Missing() || captured.GetTeam() != my_team) {
            //*current++ = Move(from, {row - 1, col - 1}, captured, castling_rights);
            new (current++) Move(from_row, from_col, from_row -1, from_col - 1, captured.GetRaw(), castling_rights, true);
        }
      //}
    }

    // up-right
    if (IsLegalLocation(from_row - 1, from_col + 1)) {
        const Piece captured = GetPiece(from_row - 1, from_col + 1);
        if (captured.Missing() || captured.GetTeam() != my_team) {
            //*current++ = Move(from, {row - 1, col + 1}, captured, castling_rights);
            new (current++) Move(from_row, from_col, from_row -1, from_col + 1, captured.GetRaw(), castling_rights, true);
        }
    }

    // down-left
    if (IsLegalLocation(from_row + 1, from_col - 1)) {
        const Piece captured = GetPiece(from_row + 1, from_col - 1);
        if (captured.Missing() || captured.GetTeam() != my_team) {
            //*current++ = Move(from, {row + 1, col - 1}, captured, castling_rights);
            new (current++) Move(from_row, from_col, from_row + 1, from_col - 1, captured.GetRaw(), castling_rights, true);
        }
    }

    // down-right
    if (IsLegalLocation(from_row + 1, from_col + 1)) {
        const Piece captured = GetPiece(from_row + 1, from_col + 1);
        if (captured.Missing() || captured.GetTeam() != my_team) {
            //*current++ = Move(from, {row + 1, col + 1}, captured, castling_rights);
            new (current++) Move(from_row, from_col, from_row + 1, from_col + 1, captured.GetRaw(), castling_rights, true);
        }
    }

    // up
    if (IsLegalLocation(from_row - 1, from_col)) {
      const Piece captured = GetPiece(from_row - 1, from_col);
      if (captured.Missing()) {
        //*current++ = Move(from, {row - 1, col});
        new (current++) Move(from_row, from_col, from_row - 1, from_col, 0, true);
      } else if (captured.GetTeam() != my_team) {
        //*current++ = Move(from, {row - 1, col}, captured, castling_rights);
        new (current++) Move(from_row, from_col, from_row - 1, from_col, captured.GetRaw(), castling_rights, true);
      }
    }

    // left
    if (IsLegalLocation(from_row, from_col - 1)) {
      const Piece captured = GetPiece(from_row, from_col - 1);
      if (captured.Missing()) {
        //*current++ = Move(from, {row, col - 1});
        new (current++) Move(from_row, from_col, from_row, from_col - 1, 0, true);
      } else if (captured.GetTeam() != my_team) {
        //*current++ = Move(from, {row, col - 1}, captured, castling_rights);
        new (current++) Move(from_row, from_col, from_row, from_col - 1, captured.GetRaw(), castling_rights, true);
      }
    }

    // right
    if (IsLegalLocation(from_row, from_col + 1)) {
      const Piece captured = GetPiece(from_row, from_col + 1);
      if (captured.Missing()) {
        //*current++ = Move(from, {row, col + 1});
        new (current++) Move(from_row, from_col, from_row, from_col + 1, 0, true);
      } else if (captured.GetTeam() != my_team) {
        //*current++ = Move(from, {row, col + 1}, captured, castling_rights);
        new (current++) Move(from_row, from_col, from_row, from_col + 1, captured.GetRaw(), castling_rights, true);
      }
    }
  // down
    if (IsLegalLocation(from_row + 1, from_col)) {

      const Piece captured = GetPiece(from_row + 1, from_col);
      if (captured.Missing()) {
        //*current++ = Move(from, {row + 1, col});
        new (current++) Move(from_row, from_col, from_row + 1, from_col, 0, true);
      } else if (captured.GetTeam() != my_team) {
        //*current++ = Move(from, {row + 1, col}, captured, castling_rights);
        new (current++) Move(from_row, from_col, from_row + 1, from_col, captured.GetRaw(), castling_rights, true);
      }
    }
             }
            break;
            default: assert(false && "Movegen: Invalid piece type");
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
    if (has_pv_move && pv_index == -1) {
        for (Move* m = buffer; m < current; ++m) {
            if (*m == *pv_move) {
                pv_index = m - buffer;
                break;
            }
        }
    }

    //if (has_pv_move == -1) {std::cout << "no matching pv move" << std::endl; abort();}

    // Final updates to the result
    result.pv_index = pv_index;
    //result.in_check = in_check;


    //static std::chrono::nanoseconds total_time{0};
    //static size_t call_count = 0;
    //auto pgen_end = std::chrono::high_resolution_clock::now();
    //total_time += std::chrono::duration_cast<std::chrono::nanoseconds>(pgen_end - pstart);
    //if (++call_count % 100000 == 0) {
    //    std::cout << "---[MoveGen] Avg: " << (total_time.count() / call_count) << " ns, Calls: " << call_count << std::endl;
    //}
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

  return IsAttackedByTeam(OtherTeam(player.GetTeam()), king_location.GetRow(), king_location.GetCol());
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
  const auto to_row = move.ToRow();
  const auto to_col = move.ToCol();
  const auto from_row = move.FromRow();
  const auto from_col = move.FromCol();
  const Piece piece = GetPiece(from_row, from_col);
  const PlayerColor color = piece.GetColor();  // Cache color
  const PieceType piece_type = piece.GetPieceType();  // Cache piece type
  const Team team = piece.GetTeam();  // Cache team

  const auto to = move.To();
  
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

  UpdatePieceHash(piece, to);
  // Update king location
  if (piece_type == KING) {
    king_locations_[color] = to;
  }
  // end set piece

  // Handle promotion: replace pawn with promoted piece
  const PieceType promotion_type = move.GetPromotionPieceType();
  if (promotion_type != NO_PIECE) {
    // Create promoted piece with same player/color
    const Piece promoted_piece(piece.GetPlayer(), promotion_type);
    
    // Replace in piece_list_
    auto& pieces = piece_list_[color];
    auto it = std::find_if(pieces.begin(), pieces.end(),
      [&to](const auto& placed_piece) {
        return placed_piece.GetLocation() == to;
      });
    if (it != pieces.end()) {
      *it = PlacedPiece(to, promoted_piece);
    }
    
    // Replace on board
    location_to_piece_[to_row][to_col] = promoted_piece;
    
    // Update piece hash: remove pawn, add promoted piece
    UpdatePieceHash(piece, to);  // Remove pawn hash
    UpdatePieceHash(promoted_piece, to);  // Add promoted piece hash
    
    // Update evaluation: subtract pawn, add promoted piece
    const int promotion_eval = kPieceEvaluations[promotion_type] - kPieceEvaluations[PAWN];
    if (team == RED_YELLOW) {
      piece_evaluation_ += promotion_eval;
    } else {
      piece_evaluation_ -= promotion_eval;
    }
    player_piece_evaluations_[color] += promotion_eval;
  }

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

  const Move& move = moves_.back();

  const BoardLocation& to = move.To();
  const BoardLocation& from = move.From();

  const auto piece = GetPiece(to);
  
  const PlayerColor color = piece.GetColor();
  Player turn_before = (color == RED)    ? kRedPlayer :
                       (color == BLUE)   ? kBluePlayer :
                       (color == YELLOW) ? kYellowPlayer :
                       kGreenPlayer;
                       
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

  UpdatePieceHash(piece, to);
  location_to_piece_[move.ToRow()][move.ToCol()] = Piece();

  // end remove

  //SetPiece(from, piece);
  // Update the board
  // Handle promotion undo: restore original pawn instead of promoted piece
  const PieceType promotion_type = move.GetPromotionPieceType();
  if (promotion_type != NO_PIECE) {
    // Create original pawn piece
    const Piece pawn_piece(piece.GetPlayer(), PAWN);
    location_to_piece_[move.FromRow()][move.FromCol()] = pawn_piece;
    
    // Replace promoted piece with pawn in piece_list_
    auto& pieces = piece_list_[color];
    auto it = std::find_if(pieces.begin(), pieces.end(),
      [&from](const auto& placed_piece) {
        return placed_piece.GetLocation() == from;
      });
    if (it != pieces.end()) {
      *it = PlacedPiece(from, pawn_piece);
    }
    
    // Update hash: remove promoted piece, add pawn
    UpdatePieceHash(piece, from);  // Remove promoted piece
    UpdatePieceHash(pawn_piece, from);  // Add pawn hash
    
    // Update evaluation: subtract promoted piece, add pawn
    const int undo_promotion_eval = kPieceEvaluations[PAWN] - kPieceEvaluations[promotion_type];
    const Team team = piece.GetTeam();
    if (team == RED_YELLOW) {
      piece_evaluation_ += undo_promotion_eval;
    } else {
      piece_evaluation_ -= undo_promotion_eval;
    }
    player_piece_evaluations_[color] += undo_promotion_eval;
  } else {
    location_to_piece_[move.FromRow()][move.FromCol()] = piece;
    UpdatePieceHash(piece, from);
  }

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

const CastlingRights& Board::GetCastlingRights(const Player& player) const {
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

uint32_t Move::Pack() const {
  uint32_t packed = 0;
  packed |= (static_cast<uint32_t>(from_.GetSquare()) & 0xFF);
  packed |= (static_cast<uint32_t>(to_.GetSquare()) & 0xFF) << 8;
  packed |= (static_cast<uint32_t>(promotion_piece_type_) & 0x7) << 16;
  if (rook_move_.Present()) {
    packed |= (1u << 19);  // Is castling
  }
  if (en_passant_capture_.Present()) {
    packed |= (1u << 20);  // Is en passant
  }
  return packed;
}

Move Move::Unpack(uint32_t packed, const Board& board) {
  uint8_t from_sq = packed & 0xFF;
  uint8_t to_sq = (packed >> 8) & 0xFF;
  PieceType promotion = static_cast<PieceType>((packed >> 16) & 0x7);
  bool is_castling = (packed >> 19) & 1;
  bool is_en_passant = (packed >> 20) & 1;

  int8_t from_r = from_sq / 14;
  int8_t from_c = from_sq % 14;
  int8_t to_r = to_sq / 14;
  int8_t to_c = to_sq % 14;

  BoardLocation from(from_r, from_c, true);
  BoardLocation to(to_r, to_c, true);

  if (is_castling) {
    // For castling, we need to determine the rook move based on king's movement
    CastlingRights rights = board.GetCastlingRights(board.GetTurn());
    // Rook move is derived from king's from/to
    SimpleMove rook_move;
    if (to_c > from_c) {  // Kingside
      rook_move = SimpleMove(
          BoardLocation(from_r, 13, true),
          BoardLocation(from_r, to_c - 1, true));
    } else {  // Queenside
      rook_move = SimpleMove(
          BoardLocation(from_r, 0, true),
          BoardLocation(from_r, to_c + 1, true));
    }
    return Move(from, to, rook_move, rights);
  }

  if (is_en_passant) {
    // En passant: capture piece is on a different square than destination
    const Piece& moving_piece = board.GetPiece(from);
    // The captured pawn is one square behind the destination
    int8_t captured_row = moving_piece.GetColor() == RED ? to_r - 1 :
                          moving_piece.GetColor() == YELLOW ? to_r + 1 :
                          moving_piece.GetColor() == BLUE ? to_r : to_r;
    int8_t captured_col = moving_piece.GetColor() == BLUE ? to_c - 1 :
                          moving_piece.GetColor() == GREEN ? to_c + 1 : to_c;
    if (moving_piece.GetColor() == RED || moving_piece.GetColor() == YELLOW) {
      captured_row = (moving_piece.GetColor() == RED) ? to_r - 1 : to_r + 1;
      captured_col = to_c;
    } else {
      captured_row = to_r;
      captured_col = (moving_piece.GetColor() == BLUE) ? to_c - 1 : to_c + 1;
    }
    BoardLocation captured_loc(captured_row, captured_col, true);
    const Piece& captured = board.GetPiece(captured_loc);
    return Move(from, to, Piece(), captured_loc, captured, promotion);
  }

  // Standard move or promotion
  const Piece& captured = board.GetPiece(to);
  if (promotion != NO_PIECE) {
    return Move(from, to, captured,
                BoardLocation(), Piece(), promotion);
  }

  // Regular move with possible capture
  int8_t capture_raw = captured.Missing() ? Piece().GetRaw() : captured.GetRaw();
  return Move(from_r, from_c, to_r, to_c, capture_raw, true);
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

