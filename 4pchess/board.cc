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
Piece Piece::kNoPiece = Piece(Piece::kRawNoPiece);
CastlingRights CastlingRights::kMissingRights = CastlingRights();

const Piece& PlacedPiece::GetPiece(const Board& board) const {
  return board.location_to_piece_[row_][col_];
}

struct Coords {
  int8_t row;
  int8_t col;
};

const Coords kRedInitialRookLocationKingside{13, 10};
const Coords kRedInitialRookLocationQueenside{13, 3};
const Coords kBlueInitialRookLocationKingside{10, 0};
const Coords kBlueInitialRookLocationQueenside{3, 0};
const Coords kYellowInitialRookLocationKingside{0, 3};
const Coords kYellowInitialRookLocationQueenside{0, 10};
const Coords kGreenInitialRookLocationKingside{3, 13};
const Coords kGreenInitialRookLocationQueenside{10, 13};

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


std::pair<int8_t, int8_t> Board::GetAttacker(Team team, int8_t row, int8_t col) const {
  int loc_row = row;
  int loc_col = col;

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
                  if (type == QUEEN || type == ROOK) return {row, col};
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
                  if (type == QUEEN || type == BISHOP) return {row, col};
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
        return {row, col};
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
                  if (piece.GetRaw() == Piece::kRawPawn[color])
                      return {row, col};
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
                  if (piece.GetRaw() == Piece::kRawPawn[color])
                      return {row, col};
              }
          }
      }
  }

  return {-1, -1};
}

std::pair<int8_t, int8_t> Board::GetRevAttacker(Team team, int8_t row, int8_t col) const {
  int loc_row = row;
  int loc_col = col;

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
                  if (piece.GetRaw() == Piece::kRawPawn[color])
                      return {row, col};
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
                  if (piece.GetRaw() == Piece::kRawPawn[color])
                      return {row, col};
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
        return {row, col};
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
                  if (type == QUEEN || type == BISHOP) return {row, col};
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
                  if (type == QUEEN || type == ROOK) return {row, col};
              }
              break;
          }
          row += dr;
          col += dc;
      }
  }

  return {-1, -1};
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
                  if (piece.GetRaw() == Piece::kRawPawn[color])
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
                  if (piece.GetRaw() == Piece::kRawPawn[color])
                      return true;
              }
          }
      }
  }

  return false;
}

bool Board::CanCaptureKing() const {
    const PlayerColor current_color = GetTurn().GetColor();
    const Team my_team = GetTeam(current_color);
    const Team enemy_team = OtherTeam(my_team);

    int8_t enemy_king_row1 = -1;
    int8_t enemy_king_col1 = -1;
    int8_t enemy_king_row2 = -1;
    int8_t enemy_king_col2 = -1;

    if (enemy_team == BLUE_GREEN) {
      if (KingPresent(BLUE)) {
          enemy_king_row1 = GetKingRow(BLUE);
          enemy_king_col1 = GetKingCol(BLUE);
      }
      if (KingPresent(GREEN)) {
          enemy_king_row2 = GetKingRow(GREEN);
          enemy_king_col2 = GetKingCol(GREEN);
      }
    } else {
      if (KingPresent(RED)) {
          enemy_king_row1 = GetKingRow(RED);
          enemy_king_col1 = GetKingCol(RED);
      }
      if (KingPresent(YELLOW)) {
          enemy_king_row2 = GetKingRow(YELLOW);
          enemy_king_col2 = GetKingCol(YELLOW);
      }
    }

    auto king1_attacker = GetAttacker(my_team, enemy_king_row1, enemy_king_col1);
    auto king2_attacker = GetAttacker(my_team, enemy_king_row2, enemy_king_col2);

    return king1_attacker.first != -1 || king2_attacker.first != -1;
}

Board::MoveGenResult Board::GetPseudoLegalMoves2(
    Move* buffer,
    size_t limit,
    const std::vector<PlacedPiece>& pieces,
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

    const int8_t king_row = GetKingRow(current_color);
    const int8_t king_col = GetKingCol(current_color);

    

    auto attacker = GetAttacker(OtherTeam(my_team), king_row, king_col);

    bool has_pv_move = pv_move.has_value();
    int pv_index = -1;  // -1 means PV move not found
    const bool in_check = KingPresent(current_color) && attacker.first != -1;
    const auto attacking_piece = in_check ? location_to_piece_[attacker.first][attacker.second] : Piece(Piece::kRawNoPiece);
    const PieceType att_type = attacking_piece.GetPieceType();

    // Check for double check using reversed search
    bool double_check = false;
    if (in_check) {
        auto second_attacker = GetRevAttacker(OtherTeam(my_team), king_row, king_col);
        double_check = second_attacker.first != -1 && (second_attacker.first != attacker.first || second_attacker.second != attacker.second);
    }

    Move* current = buffer;

    int threats = 0;

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

    static constexpr int8_t kStartingRow[4] = {12, -1, 1, -1};  // RED, BLUE, YELLOW, GREEN
    static constexpr int8_t kStartingCol[4] = {-1, 1, -1, 12};  // -1 means not used
    static constexpr int8_t kPromotionRow[4] = {0, -1, 13, -1};   // RED, BLUE, YELLOW, GREEN
    static constexpr int8_t kPromotionCol[4] = {-1, 13, -1, 0};   // -1 means not used

    for (const auto& placed_piece : piece_list_[current_color]) {
      const int8_t from_row = placed_piece.GetRow();
      const int8_t from_col = placed_piece.GetCol();
        const auto& piece = location_to_piece_[from_row][from_col];
        const PieceType type = piece.GetPieceType();

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
                  const Piece captured = location_to_piece_[r][c];
                  if (captured.Present()) {
                    if (captured.GetTeam() != my_team) {
                      new (current++) Move(from_row, from_col, r, c, captured.GetRaw());
                      threats += 16;
                    }
                    threats += 4;
                    break;
                  }
                  new (current++) Move(from_row, from_col, r, c, 0);
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
                  const Piece captured = location_to_piece_[r][c];
                  if (captured.Present()) {
                    if (captured.GetTeam() != my_team) {
                      new (current++) Move(from_row, from_col, r, c, captured.GetRaw());
                      threats += 16;
                    }
                    threats += 4;
                    break;
                  }
                  new (current++) Move(from_row, from_col, r, c, 0);
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
                  const Piece captured = location_to_piece_[r][c];
                  if (captured.Present()) {
                    if (captured.GetTeam() != my_team) {
                      new (current++) Move(from_row, from_col, r, c, captured.GetRaw());
                      threats += 16;
                    }
                    threats += 4;
                    break;
                  }
                  new (current++) Move(from_row, from_col, r, c, 0);
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
                  const Piece captured = location_to_piece_[r][c];
                  if (captured.Present()) {
                    if (captured.GetTeam() != my_team) {
                      new (current++) Move(from_row, from_col, r, c, captured.GetRaw());
                      threats += 16;
                    }
                    threats += 4;
                    break;
                  }
                  new (current++) Move(from_row, from_col, r, c, 0);
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
                      const Piece captured = location_to_piece_[from_row][c];
                      if (captured.Present()) {
                          if (captured.GetTeam() != my_team) {
                              new (current++) Move(from_row, from_col, from_row, c, captured.GetRaw());
                              threats += 16;
                          }
                          threats += 4;
                          break;
                      }
                      new (current++) Move(from_row, from_col, from_row, c, 0);
                      threats++;
                      c++;
                  }
              }

              // Direction 2: Left (0, -1)
              {
                  int8_t c = from_col - 1;
                  while (true) {
                      if (!IsLegalLocation(from_row, c)) break;
                      const Piece captured = location_to_piece_[from_row][c];
                      if (captured.Present()) {
                          if (captured.GetTeam() != my_team) {
                              new (current++) Move(from_row, from_col, from_row, c, captured.GetRaw());
                              threats += 16;
                          }
                          threats += 4;
                          break;
                      }
                      new (current++) Move(from_row, from_col, from_row, c, 0);
                      threats++;
                      c--;
                  }
              }

              // Direction 3: Down (1, 0)
              {
                  int8_t r = from_row + 1;
                  while (true) {
                      if (!IsLegalLocation(r, from_col)) break;
                      const Piece captured = location_to_piece_[r][from_col];
                      if (captured.Present()) {
                          if (captured.GetTeam() != my_team) {
                              new (current++) Move(from_row, from_col, r, from_col, captured.GetRaw());
                              threats += 16;
                          }
                          threats += 4;
                          break;
                      }
                      new (current++) Move(from_row, from_col, r, from_col, 0);
                      threats++;
                      r++;
                  }
              }

              // Direction 4: Up (-1, 0)
              {
                  int8_t r = from_row - 1;
                  while (true) {
                      if (!IsLegalLocation(r, from_col)) break;
                      const Piece captured = location_to_piece_[r][from_col];
                      if (captured.Present()) {
                          if (captured.GetTeam() != my_team) {
                              new (current++) Move(from_row, from_col, r, from_col, captured.GetRaw());
                              threats += 16;
                          }
                          threats += 4;
                          break;
                      }
                      new (current++) Move(from_row, from_col, r, from_col, 0);
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
                      const Piece captured = location_to_piece_[from_row][c];
                      if (captured.Present()) {
                          if (captured.GetTeam() != my_team) {
                              new (current++) Move(from_row, from_col, from_row, c, captured.GetRaw());
                              threats += 16;
                          }
                          threats += 4;
                          break;
                      }
                      new (current++) Move(from_row, from_col, from_row, c, 0);
                      threats++;
                      c++;
                  }
              }

              // Direction 2: Left (0, -1)
              {
                  int8_t c = from_col - 1;
                  while (true) {
                      if (!IsLegalLocation(from_row, c)) break;
                      const Piece captured = location_to_piece_[from_row][c];
                      if (captured.Present()) {
                          if (captured.GetTeam() != my_team) {
                              new (current++) Move(from_row, from_col, from_row, c, captured.GetRaw());
                              threats += 16;
                          }
                          threats += 4;
                          break;
                      }
                      new (current++) Move(from_row, from_col, from_row, c, 0);
                      threats++;
                      c--;
                  }
              }

              // Direction 3: Down (1, 0)
              {
                  int8_t r = from_row + 1;
                  while (true) {
                      if (!IsLegalLocation(r, from_col)) break;
                      const Piece captured = location_to_piece_[r][from_col];
                      if (captured.Present()) {
                          if (captured.GetTeam() != my_team) {
                              new (current++) Move(from_row, from_col, r, from_col, captured.GetRaw());
                              threats += 16;
                          }
                          threats += 4;
                          break;
                      }
                      new (current++) Move(from_row, from_col, r, from_col, 0);
                      threats++;
                      r++;
                  }
              }

              // Direction 4: Up (-1, 0)
              {
                  int8_t r = from_row - 1;
                  while (true) {
                      if (!IsLegalLocation(r, from_col)) break;
                      const Piece captured = location_to_piece_[r][from_col];
                      if (captured.Present()) {
                          if (captured.GetTeam() != my_team) {
                              new (current++) Move(from_row, from_col, r, from_col, captured.GetRaw());
                              threats += 16;
                          }
                          threats += 4;
                          break;
                      }
                      new (current++) Move(from_row, from_col, r, from_col, 0);
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
                  const Piece captured = location_to_piece_[r][c];
                  if (captured.Present()) {
                    if (captured.GetTeam() != my_team) {
                      new (current++) Move(from_row, from_col, r, c, captured.GetRaw());
                      threats += 16;
                    }
                    threats += 4;
                    break;
                  }
                  new (current++) Move(from_row, from_col, r, c, 0);
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
                  const Piece captured = location_to_piece_[r][c];
                  if (captured.Present()) {
                    if (captured.GetTeam() != my_team) {
                      new (current++) Move(from_row, from_col, r, c, captured.GetRaw());
                      threats += 16;
                    }
                    threats += 4;
                    break;
                  }
                  new (current++) Move(from_row, from_col, r, c, 0);
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
                  const Piece captured = location_to_piece_[r][c];
                  if (captured.Present()) {
                    if (captured.GetTeam() != my_team) {
                      new (current++) Move(from_row, from_col, r, c, captured.GetRaw());
                      threats += 16;
                    }
                    threats += 4;
                    break;
                  }
                  new (current++) Move(from_row, from_col, r, c, 0);
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
                  const Piece captured = location_to_piece_[r][c];
                  if (captured.Present()) {
                    if (captured.GetTeam() != my_team) {
                      new (current++) Move(from_row, from_col, r, c, captured.GetRaw());
                      threats += 16;
                    }
                    threats += 4;
                    break;
                  }
                  new (current++) Move(from_row, from_col, r, c, 0);
                  threats++;
                  r--;
                  c--;
                }
              }
            } break;
            case PAWN: {
              // Get direction data for current color
              const PawnDirectionData& dir = kPawnDirections[static_cast<int>(current_color)];
              const int8_t delta_row = dir.delta_row;
              const int8_t delta_col = dir.delta_col;
              
              
              // Precompute all possible target squares
              const int8_t forward_row = from_row + delta_row;
              const int8_t forward_col = from_col + delta_col;
              const bool is_forward_legal = IsLegalLocation(forward_row, forward_col);

              // Cache piece lookup only if the location is legal
              const Piece forward_piece = is_forward_legal ? 
                  location_to_piece_[forward_row][forward_col] : Piece::kNoPiece;

              // Precompute capture squares and cache their pieces
              const int8_t capture1_row = from_row + dir.capture1_row;
              const int8_t capture1_col = from_col + dir.capture1_col;
              const bool is_capture1_legal = IsLegalLocation(capture1_row, capture1_col);
              const Piece capture1_piece = is_capture1_legal ? 
                  location_to_piece_[capture1_row][capture1_col] : Piece::kNoPiece;

              const int8_t capture2_row = from_row + dir.capture2_row;
              const int8_t capture2_col = from_col + dir.capture2_col;
              const bool is_capture2_legal = IsLegalLocation(capture2_row, capture2_col);
              const Piece capture2_piece = is_capture2_legal ? 
                  location_to_piece_[capture2_row][capture2_col] : Piece::kNoPiece;

              // Later in the code:
              bool not_moved = (current_color == RED || current_color == YELLOW) 
                  ? (from_row == kStartingRow[static_cast<int>(current_color)])
                  : (from_col == kStartingCol[static_cast<int>(current_color)]);
              
              // Promotion detection: each color promotes on different edges
              const bool is_promotion = (current_color == RED || current_color == YELLOW) 
                  ? (forward_row == kPromotionRow[static_cast<int>(current_color)])
                  : (forward_col == kPromotionCol[static_cast<int>(current_color)]);
                
              if (!forward_piece.Present()) [[likely]] {
                // Handle promotion or regular move
                if (is_promotion) [[unlikely]] {
                  new (current++) Move(from_row, from_col, forward_row, forward_col, 0, QUEEN);
                } else {
                  //*current++ = Move(from, forward1);
                  new (current++) Move(from_row, from_col, forward_row, forward_col, 0);
                }
                
                // Double step from starting position
                if (not_moved) {
                  const int8_t forward2_row = from_row + delta_row * 2;
                  const int8_t forward2_col = from_col + delta_col * 2;
                  
                  // Only check the double move if the single move square was empty
                  const Piece forward2_piece = location_to_piece_[forward2_row][forward2_col];
                  if (!forward2_piece.Present()) {
                    //*current++ = Move(from, forward2);
                    new (current++) Move(from_row, from_col, forward2_row, forward2_col, 0);
                  }
                }
              }
              
              // First capture direction
              if (is_capture1_legal) {
                
                // En passant double capture check using lookup tables
                static constexpr int8_t kEpEdgeValue[4] = {3, 3, 10, 10};  // RED, BLUE, YELLOW, GREEN
                static constexpr PlayerColor kEpEnemyColor[4] = {BLUE, YELLOW, GREEN, RED};
                const bool is_ep_capture = !capture1_piece.Present() &&
                    ((current_color & 1) == 0 ? from_col : from_row) == kEpEdgeValue[current_color] &&
                    ((current_color & 1) == 0 ? en_passant_targets_[kEpEnemyColor[current_color]].row
                                              : en_passant_targets_[kEpEnemyColor[current_color]].col) ==
                        ((current_color & 1) == 0 ? capture1_row : capture1_col);
                if (is_ep_capture) {
                  new (current++) Move(from_row, from_col, capture1_row, capture1_col, forward_row, forward_col, forward_piece.GetRaw());
                } else {
                  // Regular capture - use cached piece
                  if (capture1_piece.Present() && capture1_piece.GetTeam() != my_team) {
                    //Handle promotion on capture or regular capture
                    if (is_promotion) [[unlikely]] {
                      new (current++) Move(from_row, from_col, capture1_row, capture1_col, capture1_piece.GetRaw(), QUEEN);
                    } else {
                      //*current++ = Move(from, capture1_loc, captured1);
                      new (current++) Move(from_row, from_col, capture1_row, capture1_col, capture1_piece.GetRaw());
                    }
                  }
                }
              }

              // Second capture direction
              if (is_capture2_legal) {

                // En passant double capture check using lookup tables (reversed edge values and enemy colors)
                static constexpr int8_t kEpEdgeValue2[4] = {10, 10, 3, 3};  // RED, BLUE, YELLOW, GREEN
                static constexpr PlayerColor kEpEnemyColor2[4] = {GREEN, RED, BLUE, YELLOW};
                const bool is_ep_capture2 = !capture2_piece.Present() &&
                    ((current_color & 1) == 0 ? from_col : from_row) == kEpEdgeValue2[current_color] &&
                    ((current_color & 1) == 0 ? en_passant_targets_[kEpEnemyColor2[current_color]].row
                                              : en_passant_targets_[kEpEnemyColor2[current_color]].col) ==
                        ((current_color & 1) == 0 ? capture2_row : capture2_col);
                if (is_ep_capture2) {
                  new (current++) Move(from_row, from_col, capture2_row, capture2_col, forward_row, forward_col, forward_piece.GetRaw());
                } else {
                  // Regular capture - use cached piece
                  if (capture2_piece.Present() && capture2_piece.GetTeam() != my_team) {
                    // Handle promotion on capture or regular capture
                    if (is_promotion) [[unlikely]] {
                      new (current++) Move(from_row, from_col, capture2_row, capture2_col, capture2_piece.GetRaw(), QUEEN);
                    } else {
                      //*current++ = Move(from, to2, captured2);
                      new (current++) Move(from_row, from_col, capture2_row, capture2_col, capture2_piece.GetRaw());
                    }
                  }
                }
              }
            } break;
            case KNIGHT: { 
              // (+2, +1)
              if (IsLegalLocation(from_row + 2, from_col + 1)) {
                  const Piece p = location_to_piece_[from_row + 2][from_col + 1];
                  if (p.Present()) {
                      if (p.GetTeam() != my_team) {
                          new (current++) Move(from_row, from_col, from_row + 2, from_col + 1, p.GetRaw());
                          threats += 16;
                      }
                      threats += 1;
                  } else {
                      new (current++) Move(from_row, from_col, from_row + 2, from_col + 1, 0);
                  }
              }
              // (+2, -1)
              if (IsLegalLocation(from_row + 2, from_col - 1)) {
                  const Piece p = location_to_piece_[from_row + 2][from_col - 1];
                  if (p.Present()) {
                      if (p.GetTeam() != my_team) {
                          new (current++) Move(from_row, from_col, from_row + 2, from_col - 1, p.GetRaw());
                          threats += 16;
                      }
                      threats += 1;
                  } else {
                      new (current++) Move(from_row, from_col, from_row + 2, from_col - 1, 0);
                  }
              }
              // (-2, +1)
              if (IsLegalLocation(from_row - 2, from_col + 1)) {
                  const Piece p = location_to_piece_[from_row - 2][from_col + 1];
                  if (p.Present()) {
                      if (p.GetTeam() != my_team) {
                          new (current++) Move(from_row, from_col, from_row - 2, from_col + 1, p.GetRaw());
                          threats += 16;
                      }
                      threats += 1;
                  } else {
                      new (current++) Move(from_row, from_col, from_row - 2, from_col + 1, 0);
                  }
              }
              // (-2, -1)
              if (IsLegalLocation(from_row - 2, from_col - 1)) {
                  const Piece p = location_to_piece_[from_row - 2][from_col - 1];
                  if (p.Present()) {
                      if (p.GetTeam() != my_team) {
                          new (current++) Move(from_row, from_col, from_row - 2, from_col - 1, p.GetRaw());
                          threats += 16;
                      }
                      threats += 1;
                  } else {
                      new (current++) Move(from_row, from_col, from_row - 2, from_col - 1, 0);
                  }
              }
              // (+1, +2)
              if (IsLegalLocation(from_row + 1, from_col + 2)) {
                  const Piece p = location_to_piece_[from_row + 1][from_col + 2];
                  if (p.Present()) {
                      if (p.GetTeam() != my_team) {
                          new (current++) Move(from_row, from_col, from_row + 1, from_col + 2, p.GetRaw());
                          threats += 16;
                      }
                      threats += 1;
                  } else {
                      new (current++) Move(from_row, from_col, from_row + 1, from_col + 2, 0);
                  }
              }
              // (+1, -2)
              if (IsLegalLocation(from_row + 1, from_col - 2)) {
                  const Piece p = location_to_piece_[from_row + 1][from_col - 2];
                  if (p.Present()) {
                      if (p.GetTeam() != my_team) {
                          new (current++) Move(from_row, from_col, from_row + 1, from_col - 2, p.GetRaw());
                          threats += 16;
                      }
                      threats += 1;
                  } else {
                      new (current++) Move(from_row, from_col, from_row + 1, from_col - 2, 0);
                  }
              }
              // (-1, +2)
              if (IsLegalLocation(from_row - 1, from_col + 2)) {
                  const Piece p = location_to_piece_[from_row - 1][from_col + 2];
                  if (p.Present()) {
                      if (p.GetTeam() != my_team) {
                          new (current++) Move(from_row, from_col, from_row - 1, from_col + 2, p.GetRaw());
                          threats += 16;
                      }
                      threats += 1;
                  } else {
                      new (current++) Move(from_row, from_col, from_row - 1, from_col + 2, 0);
                  }
              }
              // (-1, -2)
              if (IsLegalLocation(from_row - 1, from_col - 2)) {
                  const Piece p = location_to_piece_[from_row - 1][from_col - 2];
                  if (p.Present()) {
                      if (p.GetTeam() != my_team) {
                          new (current++) Move(from_row, from_col, from_row - 1, from_col - 2, p.GetRaw());
                          threats += 16;
                      }
                      threats += 1;
                  } else {
                      new (current++) Move(from_row, from_col, from_row - 1, from_col - 2, 0);
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
        const Piece captured = location_to_piece_[from_row - 1][from_col - 1];
        if (captured.Missing() || captured.GetTeam() != my_team) {
            //*current++ = Move(from, {row - 1, col - 1}, captured, castling_rights);
            new (current++) Move(from_row, from_col, from_row -1, from_col - 1, captured.GetRaw(), castling_rights);
        }
      //}
    }

    // up-right
    if (IsLegalLocation(from_row - 1, from_col + 1)) {
        const Piece captured = location_to_piece_[from_row - 1][from_col + 1];
        if (captured.Missing() || captured.GetTeam() != my_team) {
            //*current++ = Move(from, {row - 1, col + 1}, captured, castling_rights);
            new (current++) Move(from_row, from_col, from_row -1, from_col + 1, captured.GetRaw(), castling_rights);
        }
    }

    // down-left
    if (IsLegalLocation(from_row + 1, from_col - 1)) {
        const Piece captured = location_to_piece_[from_row + 1][from_col - 1];
        if (captured.Missing() || captured.GetTeam() != my_team) {
            //*current++ = Move(from, {row + 1, col - 1}, captured, castling_rights);
            new (current++) Move(from_row, from_col, from_row + 1, from_col - 1, captured.GetRaw(), castling_rights);
        }
    }

    // down-right
    if (IsLegalLocation(from_row + 1, from_col + 1)) {
        const Piece captured = location_to_piece_[from_row + 1][from_col + 1];
        if (captured.Missing() || captured.GetTeam() != my_team) {
            //*current++ = Move(from, {row + 1, col + 1}, captured, castling_rights);
            new (current++) Move(from_row, from_col, from_row + 1, from_col + 1, captured.GetRaw(), castling_rights);
        }
    }

    // up
    if (IsLegalLocation(from_row - 1, from_col)) {
      const Piece captured = location_to_piece_[from_row - 1][from_col];
      if (captured.Missing()) {
        //*current++ = Move(from, {row - 1, col});
        new (current++) Move(from_row, from_col, from_row - 1, from_col, 0);

        // Blue queenside castling
        if (current_color == BLUE &&
            castling_rights.Queenside() && 
            !location_to_piece_[4][0].Present() && // knight
            !location_to_piece_[5][0].Present() && // bishop
            //!location_to_piece_[6][0].Present() && // queen, empty!
            (location_to_piece_[3][0].GetRaw() == Piece::kRawBlueRook) &&
            !IsAttackedByTeam(enemy_team, 6, 0) // queen
            ) {
            new (current++) Move(
                7, 0,  // king_from
                5, 0,  // king_to
                3, 0, 6, 0,  // rook_from, rook_to
                castling_rights
            );
        }

        // Green kingside castling
        if (current_color == GREEN &&
            castling_rights.Kingside() &&
            !location_to_piece_[4][13].Present() && // knight
            //!location_to_piece_[4][13].Present() && // bishop, empty!
            (location_to_piece_[3][13].GetRaw() == Piece::kRawGreenRook) &&
            !IsAttackedByTeam(enemy_team, 5, 13)) {  // bishop
            
            new (current++) Move(
                6, 13,  // king_from
                4, 13,  // king_to
                3, 13, 5, 13,  // rook_from, rook_to
                castling_rights
            );
        }
      } else if (captured.GetTeam() != my_team) {
        //*current++ = Move(from, {row - 1, col}, captured, castling_rights);
        new (current++) Move(from_row, from_col, from_row - 1, from_col, captured.GetRaw(), castling_rights);
      }
    }

    // left
    if (IsLegalLocation(from_row, from_col - 1)) {
      const Piece captured = location_to_piece_[from_row][from_col - 1];
      if (captured.Missing()) {
        //*current++ = Move(from, {row, col - 1});
        new (current++) Move(from_row, from_col, from_row, from_col - 1, 0);

        // Red queenside castling - optimized
        if (current_color == RED &&
            castling_rights.Queenside() &&
            !location_to_piece_[13][4].Present() && // knight
            !location_to_piece_[13][5].Present() && // bishop
            // queen square is empty
            (location_to_piece_[13][3].GetRaw() == Piece::kRawRedRook) &&
            !IsAttackedByTeam(enemy_team, 13, 6))  // queen
          {
            
            new (current++) Move(
              13, 7,  // king_from
              13, 5,  // king_to
              13, 3, 13, 6,  // rook_from, rook_to
              castling_rights
            );
        }
        // YELLOW kingside castling - optimized
        if (current_color == YELLOW &&
            castling_rights.Kingside() &&
            !location_to_piece_[0][4].Present() && // knight
            // bishop is empty
            (location_to_piece_[0][3].GetRaw() == Piece::kRawYellowRook) &&
            !IsAttackedByTeam(enemy_team, 0, 5)) {  // bishop
      
            new (current++) Move(
                0, 6,  // king_from
                0, 4,  // king_to
                0, 3, 0, 5,  // rook_from, rook_to
                castling_rights
            );
        }   
      } else if (captured.GetTeam() != my_team) {
        //*current++ = Move(from, {row, col - 1}, captured, castling_rights);
        new (current++) Move(from_row, from_col, from_row, from_col - 1, captured.GetRaw(), castling_rights);
      }
    }

    // right
    if (IsLegalLocation(from_row, from_col + 1)) {
      const Piece captured = location_to_piece_[from_row][from_col + 1];
      if (captured.Missing()) {
        //*current++ = Move(from, {row, col + 1});
        new (current++) Move(from_row, from_col, from_row, from_col + 1, 0);

        // RED kingside castling - optimized
        if (current_color == RED &&
            castling_rights.Kingside() &&
            !location_to_piece_[13][9].Present() &&  // knight
            // bishop empty
            (location_to_piece_[13][10].GetRaw() == Piece::kRawRedRook) &&
            !IsAttackedByTeam(enemy_team, 13, 8)) {  // bishop
            
            new (current++) Move(
                13, 7,  // king_from
                13, 9,  // king_to
                13, 10, 13, 8,  // rook_from, rook_to
                castling_rights
            );
        }
        // YELLOW queenside castling - optimized
        if (current_color == YELLOW &&
            castling_rights.Queenside() &&
            !location_to_piece_[0][9].Present() &&  // knight
            !location_to_piece_[0][8].Present() &&  // bishop
            // queen empty
            (location_to_piece_[0][10].GetRaw() == Piece::kRawYellowRook) &&
            !IsAttackedByTeam(enemy_team, 0, 7))  // queen
            {
            
            new (current++) Move(
                0, 6,  // king_from
                0, 8,  // king_to
                0, 10, 0, 7,  // rook_from, rook_to
                castling_rights
            );
        }
      } else if (captured.GetTeam() != my_team) {
        //*current++ = Move(from, {row, col + 1}, captured, castling_rights);
        new (current++) Move(from_row, from_col, from_row, from_col + 1, captured.GetRaw(), castling_rights);
      }
    }
  // down
    if (IsLegalLocation(from_row + 1, from_col)) {

      const Piece captured = location_to_piece_[from_row + 1][from_col];
      if (captured.Missing()) {
        //*current++ = Move(from, {row + 1, col});
        new (current++) Move(from_row, from_col, from_row + 1, from_col, 0);

        // BLUE kingside castling
          if (current_color == BLUE &&
              castling_rights.Kingside() &&
              !location_to_piece_[9][0].Present() &&  // knight
              (location_to_piece_[10][0].GetRaw() == Piece::kRawBlueRook) &&
              !IsAttackedByTeam(enemy_team, 8, 0)) {  // bishop
        
          new (current++) Move(
              7, 0,  // king_from
              9, 0,  // king_to
              10, 0, 8, 0,  // rook_from, rook_to
              castling_rights
            );
        }
        // GREEN queenside castling
        if (current_color == GREEN &&
          castling_rights.Queenside() &&
          // queen empty
          !location_to_piece_[8][13].Present() && // bishop
          !location_to_piece_[9][13].Present() && // knight
          (location_to_piece_[10][13].GetRaw() == Piece::kRawGreenRook) &&
          !IsAttackedByTeam(enemy_team, 7, 13))  // queen
          {  // King's path
    
          new (current++) Move(
              6, 13,  // king_from
              8, 13,  // king_to
              10, 13, 7, 13,  // rook_from, rook_to
              castling_rights
            );
        }
      } else if (captured.GetTeam() != my_team) {
        //*current++ = Move(from, {row + 1, col}, captured, castling_rights);
        new (current++) Move(from_row, from_col, from_row + 1, from_col, captured.GetRaw(), castling_rights);
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
        int8_t king_row_local = king_row;
        int8_t king_col_local = king_col;
        int8_t att_row = attacker.first;
        int8_t att_col = attacker.second;
        
        int8_t drow = (att_row > king_row_local) ? 1 : (att_row < king_row_local) ? -1 : 0;
        int8_t dcol = (att_col > king_col_local) ? 1 : (att_col < king_col_local) ? -1 : 0;
        
        // Iterate through all squares between king and attacker
        int8_t r = king_row_local + drow;
        int8_t c = king_col_local + dcol;
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
                        if (!IsLegalLocation(tr, tc) || location_to_piece_[tr][tc].Present()) {
                            blocked = true;
                            break;
                        }
                        tr += row_step;
                      tc += col_step;
                  }
                  
                  if (!blocked) {
                      new (current++) Move(from_row, from_col, r, c, 0);
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
                        if (!IsLegalLocation(tr,tc) || location_to_piece_[tr][tc].Present()) {
                            blocked = true;
                            break;
                        }
                        tr += row_step;
                        tc += col_step;
                    }
                    
                    if (!blocked) {
                        new (current++) Move(from_row, from_col, r, c, 0);
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
                        if (!IsLegalLocation(tr,tc) || location_to_piece_[tr][tc].Present()) {
                            blocked = true;
                            break;
                        }
                        tr += row_step;
                        tc += col_step;
                      }
                      
                      if (!blocked) {
                          new (current++) Move(from_row, from_col, r, c, 0);
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
                        if (!IsLegalLocation(tr, tc) || location_to_piece_[tr][tc].Present()) {
                            blocked = true;
                            break;
                        }
                        tr += row_step;
                      tc += col_step;
                  }
                  
                  if (!blocked) {
                      new (current++) Move(from_row, from_col, r, c, 0);
                      threats += 16;
                  }
              }
            } break;
            case KNIGHT: {
              uint8_t dr = r > from_row ? r - from_row : from_row - r;
              uint8_t dc = c > from_col ? c - from_col : from_col - c;
              
              if (dr * dc == 2) {
                  new (current++) Move(from_row, from_col, r, c, 0);
                  threats += 16;
              }
            } break;
            case PAWN: {
              
              switch (current_color) {
                case RED:
                  // RED moves up (-1, 0), starts at row 12
                  if (row_diff == -1 && col_diff == 0) {
                      new (current++) Move(from_row, from_col, r, c, 0);
                      threats += 16;
                  } else if (row_diff == -2 && col_diff == 0 && from_row == 12) {
                      if (location_to_piece_[from_row - 1][c].Missing()) {
                          new (current++) Move(from_row, from_col, r, c, 0);
                          threats += 16;
                      }
                  }
                  break;
                case BLUE:
                  // BLUE moves right (0, +1), starts at col 1
                  if (row_diff == 0 && col_diff == 1) {
                      new (current++) Move(from_row, from_col, r, c, 0);
                      threats += 16;
                  } else if (row_diff == 0 && col_diff == 2 && from_col == 1) {
                      if (location_to_piece_[r][from_col + 1].Missing()) {
                          new (current++) Move(from_row, from_col, r, c, 0);
                          threats += 16;
                      }
                  }
                  break;
                case YELLOW:
                  // YELLOW moves down (+1, 0), starts at row 1
                  if (row_diff == 1 && col_diff == 0) {
                      new (current++) Move(from_row, from_col, r, c, 0);
                      threats += 16;
                  } else if (row_diff == 2 && col_diff == 0 && from_row == 1) {
                      if (location_to_piece_[from_row + 1][c].Missing()) {
                          new (current++) Move(from_row, from_col, r, c, 0);
                          threats += 16;
                      }
                  }
                  break;
                case GREEN:
                  // GREEN moves left (0, -1), starts at col 12
                  if (row_diff == 0 && col_diff == -1) {
                      new (current++) Move(from_row, from_col, r, c, 0);
                      threats += 16;
                  } else if (row_diff == 0 && col_diff == -2 && from_col == 12) {
                      if (location_to_piece_[r][from_col - 1].Missing()) {
                          new (current++) Move(from_row, from_col, r, c, 0);
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
                          if (location_to_piece_[tr][tc].Present()) {
                            occupied = true;
                            break;
                          }
                          tr += row_step;
                          tc += col_step;
                      }
                      if (!occupied) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
                        threats += 16;
                      }
                  }

                  occupied = false;
                  if (from_row == att_row) {
                      int8_t step = (att_col > from_col) ? 1 : -1;
                      for (int8_t tc = from_col + step; tc != att_col; tc += step) {
                          if (location_to_piece_[from_row][tc].Present()) {
                            occupied = true;
                            break;
                          }
                      }
                      if (occupied == true) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
                        threats += 16;
                      }
                  } else if (from_col == att_col) {
                      int8_t step = (att_row > from_row) ? 1 : -1;
                      for (int8_t tr = from_row + step; tr != att_row; tr += step) {
                          if (location_to_piece_[tr][from_col].Present()) {
                            occupied = true;
                            break;
                          }
                      }
                      if (occupied == true) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
                        threats += 16;
                      }
                  }
              } break;
            case ROOK: {
                  bool occupied = false;
                  if (from_row == att_row) {
                      int8_t step = (att_col > from_col) ? 1 : -1;
                      for (int8_t tc = from_col + step; tc != att_col; tc += step) {
                          if (location_to_piece_[from_row][tc].Present()) {
                            occupied = true;
                            break;
                          }
                      }
                      if (occupied == true) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
                        threats += 16;
                      }
                  } else if (from_col == att_col) {
                      int8_t step = (att_row > from_row) ? 1 : -1;
                      for (int8_t tr = from_row + step; tr != att_row; tr += step) {
                          if (location_to_piece_[tr][from_col].Present()) {
                            occupied = true;
                            break;
                          }
                      }
                      if (occupied == true) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
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
                          if (location_to_piece_[tr][tc].Present()) {
                            occupied = true;
                            break;
                          }
                          tr += row_step;
                          tc += col_step;
                      }
                      if (!occupied) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
                        threats += 16;
                      }
                  }
            } break;
            case PAWN: {
                
                switch (current_color) {
                    case RED:
                        // RED captures up-left (-1,-1) and up-right (-1,+1)
                        if (row_diff == -1 && (col_diff == -1 || col_diff == 1)) {
                            new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
                            threats += 16;
                        }
                        break;
                    case BLUE:
                        // BLUE captures up-right (-1,+1) and down-right (+1,+1)
                        if (col_diff == 1 && (row_diff == -1 || row_diff == 1)) {
                            new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
                            threats += 16;
                        }
                        break;
                    case YELLOW:
                        // YELLOW captures down-right (+1,+1) and down-left (+1,-1)
                        if (row_diff == 1 && (col_diff == 1 || col_diff == -1)) {
                            new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
                            threats += 16;
                        }
                        break;
                    case GREEN:
                        // GREEN captures down-left (+1,-1) and up-left (-1,-1)
                        if (col_diff == -1 && (row_diff == 1 || row_diff == -1)) {
                            new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
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
                    new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
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
        const Piece captured = location_to_piece_[from_row - 1][from_col - 1];
        if (captured.Missing() || captured.GetTeam() != my_team) {
            new (current++) Move(from_row, from_col, from_row -1, from_col - 1, captured.GetRaw(), castling_rights);
        }
      //}
    }

    // up-right
    if (IsLegalLocation(from_row - 1, from_col + 1)) {
        const Piece captured = location_to_piece_[from_row - 1][from_col + 1];
        if (captured.Missing() || captured.GetTeam() != my_team) {
            new (current++) Move(from_row, from_col, from_row -1, from_col + 1, captured.GetRaw(), castling_rights);
        }
    }

    // down-left
    if (IsLegalLocation(from_row + 1, from_col - 1)) {
        const Piece captured = location_to_piece_[from_row + 1][from_col - 1];
        if (captured.Missing() || captured.GetTeam() != my_team) {
            new (current++) Move(from_row, from_col, from_row + 1, from_col - 1, captured.GetRaw(), castling_rights);
        }
    }

    // down-right
    if (IsLegalLocation(from_row + 1, from_col + 1)) {
        const Piece captured = location_to_piece_[from_row + 1][from_col + 1];
        if (captured.Missing() || captured.GetTeam() != my_team) {
            new (current++) Move(from_row, from_col, from_row + 1, from_col + 1, captured.GetRaw(), castling_rights);
        }
    }

    // up
    if (IsLegalLocation(from_row - 1, from_col)) {
      const Piece captured = location_to_piece_[from_row - 1][from_col];
      if (captured.Missing()) {
        new (current++) Move(from_row, from_col, from_row - 1, from_col, 0);
      } else if (captured.GetTeam() != my_team) {
        new (current++) Move(from_row, from_col, from_row - 1, from_col, captured.GetRaw(), castling_rights);
      }
    }

    // left
    if (IsLegalLocation(from_row, from_col - 1)) {
      const Piece captured = location_to_piece_[from_row][from_col - 1];
      if (captured.Missing()) {
        new (current++) Move(from_row, from_col, from_row, from_col - 1, 0);
      } else if (captured.GetTeam() != my_team) {
        new (current++) Move(from_row, from_col, from_row, from_col - 1, captured.GetRaw(), castling_rights);
      }
    }

    // right
    if (IsLegalLocation(from_row, from_col + 1)) {
      const Piece captured = location_to_piece_[from_row][from_col + 1];
      if (captured.Missing()) {
        new (current++) Move(from_row, from_col, from_row, from_col + 1, 0);
      } else if (captured.GetTeam() != my_team) {
        new (current++) Move(from_row, from_col, from_row, from_col + 1, captured.GetRaw(), castling_rights);
      }
    }
  // down
    if (IsLegalLocation(from_row + 1, from_col)) {

      const Piece captured = location_to_piece_[from_row + 1][from_col];
      if (captured.Missing()) {
        new (current++) Move(from_row, from_col, from_row + 1, from_col, 0);
      } else if (captured.GetTeam() != my_team) {
        new (current++) Move(from_row, from_col, from_row + 1, from_col, captured.GetRaw(), castling_rights);
      }
    }
            } break;
            default: assert(false && "Movegen: Invalid piece type");
        }

      } else if ( // can only capture the attacker
        att_type == KNIGHT ||
        att_type == PAWN
      ) {
        const int8_t att_row = attacker.first;
        const int8_t att_col = attacker.second;
        const int8_t king_row_local = king_row;
        const int8_t king_col_local = king_col;

        // Direction from king to attacker
        int8_t drow = (att_row > king_row_local) ? 1 : (att_row < king_row_local) ? -1 : 0;
        int8_t dcol = (att_col > king_col_local) ? 1 : (att_col < king_col_local) ? -1 : 0;

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
                          if (location_to_piece_[tr][tc].Present()) {
                            occupied = true;
                            break;
                          }
                          tr += row_step;
                          tc += col_step;
                      }
                      if (!occupied) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
                        threats += 16;
                      }
                  }

                  occupied = false;
                  if (from_row == att_row) {
                      int8_t step = (att_col > from_col) ? 1 : -1;
                      for (int8_t tc = from_col + step; tc != att_col; tc += step) {
                          if (location_to_piece_[from_row][tc].Present()) {
                            occupied = true;
                            break;
                          }
                      }
                      if (occupied == true) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
                        threats += 16;
                      }
                  } else if (from_col == att_col) {
                      int8_t step = (att_row > from_row) ? 1 : -1;
                      for (int8_t tr = from_row + step; tr != att_row; tr += step) {
                          if (location_to_piece_[tr][from_col].Present()) {
                            occupied = true;
                            break;
                          }
                      }
                      if (occupied == true) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
                        threats += 16;
                      }
                  }
              } break;
            case ROOK:    {
                  bool occupied = false;
                  if (from_row == att_row) {
                      int8_t step = (att_col > from_col) ? 1 : -1;
                      for (int8_t tc = from_col + step; tc != att_col; tc += step) {
                          if (location_to_piece_[from_row][tc].Present()) {
                            occupied = true;
                            break;
                          }
                      }
                      if (occupied == true) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
                        threats += 16;
                      }
                  } else if (from_col == att_col) {
                      int8_t step = (att_row > from_row) ? 1 : -1;
                      for (int8_t tr = from_row + step; tr != att_row; tr += step) {
                          if (location_to_piece_[tr][from_col].Present()) {
                            occupied = true;
                            break;
                          }
                      }
                      if (occupied == true) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
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
                          if (location_to_piece_[tr][tc].Present()) {
                            occupied = true;
                            break;
                          }
                          tr += row_step;
                          tc += col_step;
                      }
                      if (!occupied) {
                        new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
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
                            new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
                            threats += 16;
                        }
                        break;
                    case BLUE:
                        // BLUE captures up-right (-1,+1) and down-right (+1,+1)
                        if (col_diff == 1 && (row_diff == -1 || row_diff == 1)) {
                            new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
                            threats += 16;
                        }
                        break;
                    case YELLOW:
                        // YELLOW captures down-right (+1,+1) and down-left (+1,-1)
                        if (row_diff == 1 && (col_diff == 1 || col_diff == -1)) {
                            new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
                            threats += 16;
                        }
                        break;
                    case GREEN:
                        // GREEN captures down-left (+1,-1) and up-left (-1,-1)
                        if (col_diff == -1 && (row_diff == 1 || row_diff == -1)) {
                            new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
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
                    new (current++) Move(from_row, from_col, att_row, att_col, attacking_piece.GetRaw());
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
        const Piece captured = location_to_piece_[from_row - 1][from_col - 1];
        if (captured.Missing() || captured.GetTeam() != my_team) {
            new (current++) Move(from_row, from_col, from_row -1, from_col - 1, captured.GetRaw(), castling_rights);
        }
    }

    // up-right
    if (IsLegalLocation(from_row - 1, from_col + 1)) {
        const Piece captured = location_to_piece_[from_row - 1][from_col + 1];
        if (captured.Missing() || captured.GetTeam() != my_team) {
            new (current++) Move(from_row, from_col, from_row -1, from_col + 1, captured.GetRaw(), castling_rights);
        }
    }

    // down-left
    if (IsLegalLocation(from_row + 1, from_col - 1)) {
        const Piece captured = location_to_piece_[from_row + 1][from_col - 1];
        if (captured.Missing() || captured.GetTeam() != my_team) {
            new (current++) Move(from_row, from_col, from_row + 1, from_col - 1, captured.GetRaw(), castling_rights);
        }
    }

    // down-right
    if (IsLegalLocation(from_row + 1, from_col + 1)) {
        const Piece captured = location_to_piece_[from_row + 1][from_col + 1];
        if (captured.Missing() || captured.GetTeam() != my_team) {
            new (current++) Move(from_row, from_col, from_row + 1, from_col + 1, captured.GetRaw(), castling_rights);
        }
    }

    // up
    if (IsLegalLocation(from_row - 1, from_col)) {
      const Piece captured = location_to_piece_[from_row - 1][from_col];
      if (captured.Missing()) {
        new (current++) Move(from_row, from_col, from_row - 1, from_col, 0);
      } else if (captured.GetTeam() != my_team) {
        new (current++) Move(from_row, from_col, from_row - 1, from_col, captured.GetRaw(), castling_rights);
      }
    }

    // left
    if (IsLegalLocation(from_row, from_col - 1)) {
      const Piece captured = location_to_piece_[from_row][from_col - 1];
      if (captured.Missing()) {
        new (current++) Move(from_row, from_col, from_row, from_col - 1, 0);
      } else if (captured.GetTeam() != my_team) {
        new (current++) Move(from_row, from_col, from_row, from_col - 1, captured.GetRaw(), castling_rights);
      }
    }

    // right
    if (IsLegalLocation(from_row, from_col + 1)) {
      const Piece captured = location_to_piece_[from_row][from_col + 1];
      if (captured.Missing()) {
        new (current++) Move(from_row, from_col, from_row, from_col + 1, 0);
      } else if (captured.GetTeam() != my_team) {
        new (current++) Move(from_row, from_col, from_row, from_col + 1, captured.GetRaw(), castling_rights);
      }
    }
  // down
    if (IsLegalLocation(from_row + 1, from_col)) {

      const Piece captured = location_to_piece_[from_row + 1][from_col];
      if (captured.Missing()) {
        new (current++) Move(from_row, from_col, from_row + 1, from_col, 0);
      } else if (captured.GetTeam() != my_team) {
        new (current++) Move(from_row, from_col, from_row + 1, from_col, captured.GetRaw(), castling_rights);
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

void Board::InitializeHash() {
  for (int color = 0; color < 4; color++) {
    for (const auto& placed_piece : piece_list_[color]) {
      const int8_t row = placed_piece.GetRow();
      const int8_t col = placed_piece.GetCol();
      const auto& piece = GetPiece(row, col);
      UpdatePieceHash(piece, row, col);
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

  const auto from_row = move.FromRow();
  const auto from_col = move.FromCol();
  const auto to_row = move.ToRow();
  const auto to_col = move.ToCol();
  const Piece piece = location_to_piece_[from_row][from_col];
  const PlayerColor color = piece.GetColor();
  const PieceType piece_type = piece.GetPieceType();
  const Team team = piece.GetTeam();

  // Handle en passant target for the current player
  en_passant_targets_[color] = EnPassantTarget{};
  if (piece_type == PAWN) {
    const auto row_diff = abs(from_row - to_row);
    const auto col_diff = abs(from_col - to_col);
    
    if (row_diff == 2 || col_diff == 2) {
      // Set en passant target to the square the pawn passed over
      const auto target_row = (from_row + to_row) / 2;
      const auto target_col = (from_col + to_col) / 2;
      en_passant_targets_[color] = EnPassantTarget{static_cast<int8_t>(target_row), static_cast<int8_t>(target_col)};
    }
  }

  const auto ep_capture = move.GetEnpassantCapture();
  if (ep_capture.Present()) {

    const int8_t ep_target_row = move.GetEnpassantTargetRow();
    const int8_t ep_target_col = move.GetEnpassantTargetCol();
    const auto ep_capture_color = ep_capture.GetColor();
    const auto ep_capture_team = ep_capture.GetTeam();

    //RemovePiece(move.To());
    int8_t idx = piece_list_index_[ep_target_row][ep_target_col];
    if (idx >= 0) {
      // Swap with last element to avoid O(n) erase
      int8_t last_idx = piece_list_[ep_capture_color].size() - 1;
      piece_list_[ep_capture_color][idx] = piece_list_[ep_capture_color][last_idx];
      // Update index of the moved piece
      PlacedPiece& moved = piece_list_[ep_capture_color][idx];
      piece_list_index_[moved.GetRow()][moved.GetCol()] = idx;
      piece_list_[ep_capture_color].pop_back();
      piece_list_index_[ep_target_row][ep_target_col] = -1;
    } else {
        std::cout << "MakeMove en passant: Failed to find captured piece in piece_list_" << std::endl;
        abort();
    }

    UpdatePieceHash(ep_capture, ep_target_row, ep_target_col);
    location_to_piece_[ep_target_row][ep_target_col] = Piece(Piece::kRawNoPiece);

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
    int8_t idx = piece_list_index_[to_row][to_col];
    if (idx >= 0) {
      // Swap with last element to avoid O(n) erase
      int8_t last_idx = piece_list_[capture_color].size() - 1;
      piece_list_[capture_color][idx] = piece_list_[capture_color][last_idx];
      // Update index of the moved piece
      PlacedPiece& moved = piece_list_[capture_color][idx];
      piece_list_index_[moved.GetRow()][moved.GetCol()] = idx;
      piece_list_[capture_color].pop_back();
      piece_list_index_[to_row][to_col] = -1;
    } else {
        std::cout << "MakeMove Failed to find captured piece in piece_list_" << std::endl;
        abort();
    }

    UpdatePieceHash(standard_capture, to_row, to_col);
    location_to_piece_[to_row][to_col] = Piece(Piece::kRawNoPiece);

    // Update king location
    if (capture_type == KING) {
      king_row_[capture_color] = -1;
      king_col_[capture_color] = -1;
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

  // Update the piece's location in piece_list_ using index lookup
  int8_t idx = piece_list_index_[from_row][from_col];
  if (idx >= 0) {
    piece_list_[color][idx] = PlacedPiece(to_row, to_col);
    piece_list_index_[from_row][from_col] = -1;
    piece_list_index_[to_row][to_col] = idx;
  } else {
    std::cout << "MakeMove Failed to find moving piece in piece_list_" << std::endl;
    abort();
  }

  UpdatePieceHash(piece, from_row, from_col);
  location_to_piece_[from_row][from_col] = Piece(Piece::kRawNoPiece);

  // Update king location
  if (piece_type == KING) {
    castling_rights_[color] = CastlingRights(false, false);
    king_row_[color] = -1;
    king_col_[color] = -1;
  }

  //SetPiece(to, piece);
  // Update the board
  location_to_piece_[to_row][to_col] = piece;

  UpdatePieceHash(piece, to_row, to_col);
  // Update king location
  if (piece_type == KING) {
    king_row_[color] = to_row;
    king_col_[color] = to_col;
  }
  // end set piece

  // Handle promotion: replace pawn with promoted piece
  const PieceType promotion_type = move.GetPromotionPieceType();
  if (promotion_type != NO_PIECE) {
    // Create promoted piece with same player/color (optimized with raw constructor)
    const int8_t promoted_raw = Piece::ComputeRawBits(color, promotion_type);
    const Piece promoted_piece(promoted_raw);
    
    // Replace in piece_list_ (piece stays at same position, no index change needed)
    int8_t idx = piece_list_index_[to_row][to_col];
    if (idx >= 0) {
      piece_list_[color][idx] = PlacedPiece(to_row, to_col);
    }
    
    // Replace on board
    location_to_piece_[to_row][to_col] = promoted_piece;
    
    // Update piece hash: remove pawn, add promoted piece
    UpdatePieceHash(piece, to_row, to_col);  // Remove pawn hash
    UpdatePieceHash(promoted_raw, to_row, to_col);  // Add promoted piece hash
    
    // Update evaluation: subtract pawn, add promoted piece
    const int promotion_eval = kPieceEvaluations[promotion_type] - kPieceEvaluations[PAWN];
    if (team == RED_YELLOW) {
      piece_evaluation_ += promotion_eval;
    } else {
      piece_evaluation_ -= promotion_eval;
    }
    player_piece_evaluations_[color] += promotion_eval;
  }

  if (move.RookFromRow() >= 0) {
    castling_rights_[color] = CastlingRights(false, false);

    // Handle the rook move for castling
    const int8_t rook_from_row = move.RookFromRow();
    const int8_t rook_from_col = move.RookFromCol();
    const int8_t rook_to_row = move.RookToRow();
    const int8_t rook_to_col = move.RookToCol();

    // Get the rook piece from its original position
    const auto rook_piece = location_to_piece_[rook_from_row][rook_from_col];

    // Move the rook to its new position
    location_to_piece_[rook_from_row][rook_from_col] = Piece(Piece::kRawNoPiece);
    location_to_piece_[rook_to_row][rook_to_col] = rook_piece;
    
    // Update the rook's position in the piece list
    int8_t rook_idx = piece_list_index_[rook_from_row][rook_from_col];
    if (rook_idx >= 0) {
      piece_list_[rook_piece.GetColor()][rook_idx] = PlacedPiece(rook_to_row, rook_to_col);
      piece_list_index_[rook_from_row][rook_from_col] = -1;
      piece_list_index_[rook_to_row][rook_to_col] = rook_idx;
    }
    
    // Update piece hash for the rook move
    UpdatePieceHash(rook_piece, rook_from_row, rook_from_col);
    UpdatePieceHash(rook_piece, rook_to_row, rook_to_col);
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

  const auto to_row = move.ToRow();
  const auto to_col = move.ToCol();
  const auto from_row = move.FromRow();
  const auto from_col = move.FromCol();

  const auto piece = location_to_piece_[to_row][to_col];
  
  const PlayerColor color = piece.GetColor();
                       
  // Find and update the moved piece's location in one pass
  // Update the piece's location using index lookup
  int8_t idx = piece_list_index_[to_row][to_col];
  if (idx >= 0) {
    piece_list_[color][idx] = PlacedPiece(from_row, from_col);
    piece_list_index_[to_row][to_col] = -1;
    piece_list_index_[from_row][from_col] = idx;
  } else {
      std::cout << "Failed to find moved piece in piece_list_ during UndoMove" << std::endl;
      std::abort();
  }

  UpdatePieceHash(piece, to_row, to_col);
  location_to_piece_[to_row][to_col] = Piece(Piece::kRawNoPiece);

  // end remove

  //SetPiece(from, piece);
  // Update the board
  // Handle promotion undo: restore original pawn instead of promoted piece
  const PieceType promotion_type = move.GetPromotionPieceType();
  if (promotion_type != NO_PIECE) {
    // Create original pawn piece (optimized with precomputed raw bits)
    const Piece pawn_piece(Piece::kRawPawn[color]);
    location_to_piece_[from_row][from_col] = pawn_piece;
    
    // Replace promoted piece with pawn in piece_list_ (piece stays at same position, no index change needed)
    int8_t idx = piece_list_index_[from_row][from_col];
    if (idx >= 0) {
      piece_list_[color][idx] = PlacedPiece(from_row, from_col);
    }
    
    // Update hash: remove promoted piece, add pawn
    UpdatePieceHash(piece, from_row, from_col);  // Remove promoted piece
    UpdatePieceHash(Piece::kRawPawn[color], from_row, from_col);  // Add pawn hash
    
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
    location_to_piece_[from_row][from_col] = piece;
    UpdatePieceHash(piece, from_row, from_col);
  }

  // Update king location
  if (piece.GetPieceType() == KING) {
    castling_rights_[color] = CastlingRights(false, false);
    king_row_[color] = from_row;
    king_col_[color] = from_col;
  }
  //end set piece

  const auto ep_capture = move.GetEnpassantCapture();
  if (ep_capture.Present()) {
    const int8_t ep_target_row = move.GetEnpassantTargetRow();
    const int8_t ep_target_col = move.GetEnpassantTargetCol();
    const PlayerColor ep_color = ep_capture.GetColor();
    location_to_piece_[ep_target_row][ep_target_col] = ep_capture;
    int8_t idx = piece_list_[ep_color].size();
    piece_list_[ep_color].emplace_back(ep_target_row, ep_target_col);
    piece_list_index_[ep_target_row][ep_target_col] = idx;
    UpdatePieceHash(ep_capture, ep_target_row, ep_target_col);
    
    const int piece_eval = kPieceEvaluations[PAWN];
    const int sign = (ep_capture.GetTeam() == RED_YELLOW) ? 1 : -1;
    piece_evaluation_ += sign * piece_eval;
    player_piece_evaluations_[ep_color] += piece_eval;
  }

  // Place back captured pieces
  const auto standard_capture = move.GetStandardCapture();
  if (standard_capture.Present()) {
      const PlayerColor capture_color = standard_capture.GetColor();
      const PieceType capture_type = standard_capture.GetPieceType();
      location_to_piece_[to_row][to_col] = standard_capture;
      int8_t idx = piece_list_[capture_color].size();
      piece_list_[capture_color].emplace_back(to_row, to_col);
      piece_list_index_[to_row][to_col] = idx;
      UpdatePieceHash(standard_capture, to_row, to_col);
      // Update king location if needed
      if (capture_type == KING) {
          king_row_[capture_color] = to_row;
          king_col_[capture_color] = to_col;
      }
      
      // Update piece evaluation
      const int piece_eval = kPieceEvaluations[capture_type];
      const int sign = (standard_capture.GetTeam() == RED_YELLOW) ? 1 : -1;
      piece_evaluation_ += sign * piece_eval;
      player_piece_evaluations_[capture_color] += piece_eval;
  }

  // Clear en passant target for the current player when undoing a move
  en_passant_targets_[color] = EnPassantTarget{};

  if (move.RookFromRow() >= 0) {

    castling_rights_[color] = move.GetInitialCastlingRights();

    // Undo the rook move for castling
    const int8_t rook_from_row = move.RookFromRow();
    const int8_t rook_from_col = move.RookFromCol();
    const int8_t rook_to_row = move.RookToRow();
    const int8_t rook_to_col = move.RookToCol();

    // Get the rook piece from its current position
    const auto rook_piece = location_to_piece_[rook_to_row][rook_to_col];

    // Move the rook back to its original position
    location_to_piece_[rook_to_row][rook_to_col] = Piece(Piece::kRawNoPiece);
    location_to_piece_[rook_from_row][rook_from_col] = rook_piece;

    // Update the rook's position in the piece list
    // Update the rook's position using index lookup
    int8_t rook_idx = piece_list_index_[rook_to_row][rook_to_col];
    if (rook_idx >= 0) {
      piece_list_[rook_piece.GetColor()][rook_idx] = PlacedPiece(rook_from_row, rook_from_col);
      piece_list_index_[rook_to_row][rook_to_col] = -1;
      piece_list_index_[rook_from_row][rook_from_col] = rook_idx;
    }

    // Update piece hash for the rook move
    UpdatePieceHash(rook_piece, rook_to_row, rook_to_col);
    UpdatePieceHash(rook_piece, rook_from_row, rook_from_col);
  }
  
  turn_ = (color == RED)    ? kRedPlayer :
        (color == BLUE)   ? kBluePlayer :
        (color == YELLOW) ? kYellowPlayer :
        kGreenPlayer;
  moves_.pop_back();
  int t = static_cast<int>(color);
  UpdateTurnHash(t);
  UpdateTurnHash((t+1)%4);
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
    std::unordered_map<std::pair<int8_t, int8_t>, Piece> location_to_piece,
    std::optional<std::unordered_map<Player, CastlingRights>> castling_rights,
    std::optional<EnpassantInitialization> enp)
  : turn_(std::move(turn)) {
  // Initialize en passant targets for all players
  for (int i = 0; i < 4; ++i) {
    en_passant_targets_[i] = EnPassantTarget{};
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
  for (int i = 0; i < 4; i++) {
    piece_list_.push_back(std::vector<PlacedPiece>());
    piece_list_[i].reserve(16);
    king_row_[i] = -1;
    king_col_[i] = -1;
  }

  // Initialize piece_list_index_ to -1 (no piece at any position)
  for (int row = 0; row < 14; row++) {
    for (int col = 0; col < 14; col++) {
      piece_list_index_[row][col] = -1;
    }
  }

  for (const auto& it : location_to_piece) {
    const auto& location = it.first;
    const auto& piece = it.second;
    PlayerColor color = piece.GetColor();
    location_to_piece_[location.first][location.second] = piece;
    int8_t idx = piece_list_[piece.GetColor()].size();
    piece_list_[piece.GetColor()].push_back(PlacedPiece(
          location.first, location.second));
    piece_list_index_[location.first][location.second] = idx;
    PieceType piece_type = piece.GetPieceType();
    if (piece.GetTeam() == RED_YELLOW) {
      piece_evaluation_ += kPieceEvaluations[static_cast<int>(piece_type)];
    } else {
      piece_evaluation_ -= kPieceEvaluations[static_cast<int>(piece_type)];
    }
    player_piece_evaluations_[piece.GetColor()] += kPieceEvaluations[static_cast<int>(piece_type)];
    if (piece.GetPieceType() == KING) {
      king_row_[color] = location.first;
      king_col_[color] = location.second;
    }
  }

  /*
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

      int order_a = piece_move_order_scores[a.GetPiece(*this).GetPieceType()];
      int order_b = piece_move_order_scores[b.GetPiece(*this).GetPieceType()];
      return order_a < order_b;
    }
  } customLess;

  for (auto& placed_pieces : piece_list_) {
    std::sort(placed_pieces.begin(), placed_pieces.end(), customLess);
  }
  */

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
  std::unordered_map<std::pair<int8_t, int8_t>, Piece> location_to_piece;
  std::unordered_map<Player, CastlingRights> castling_rights;

  std::vector<PieceType> piece_types = {
    ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK,
  };
  std::vector<PlayerColor> player_colors = {RED, BLUE, YELLOW, GREEN};

  for (const PlayerColor& color : player_colors) {
    Player player(color);
    castling_rights[player] = CastlingRights(true, true);

    int8_t piece_row = 0;
    int8_t piece_col = 0;
    int8_t delta_row = 0;
    int8_t delta_col = 0;
    int8_t pawn_offset_row = 0;
    int8_t pawn_offset_col = 0;

    switch (color) {
    case RED:
      piece_row = 13;
      piece_col = 3;
      delta_col = 1;
      pawn_offset_row = -1;
      break;
    case BLUE:
      piece_row = 3;
      piece_col = 0;
      delta_row = 1;
      pawn_offset_col = 1;
      break;
    case YELLOW:
      piece_row = 0;
      piece_col = 10;
      delta_col = -1;
      pawn_offset_row = 1;
      break;
    case GREEN:
      piece_row = 10;
      piece_col = 13;
      delta_row = -1;
      pawn_offset_col = -1;
      break;
    default:
      assert(false);
      break;
    }

    for (const PieceType piece_type : piece_types) {
      int8_t pawn_row = piece_row + pawn_offset_row;
      int8_t pawn_col = piece_col + pawn_offset_col;
      location_to_piece[{piece_row, piece_col}] = Piece(player.GetColor(), piece_type);
      location_to_piece[{pawn_row, pawn_col}] = Piece(player.GetColor(), PAWN);
      piece_row += delta_row;
      piece_col += delta_col;
    }
  }

  return std::make_shared<Board>(
      Player(RED), std::move(location_to_piece), std::move(castling_rights));
}

//int Move::ManhattanDistance() const {
//  return std::abs(from_.GetRow() - to_.GetRow())
//       + std::abs(from_.GetCol() - to_.GetCol());
//}

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
  os << "Piece@" << placed_piece.GetRow() << "," << placed_piece.GetCol();
  return os;
}

std::ostream& operator<<(
    std::ostream& os, const Player& player) {
  os << "Player(" << ToStr(player.GetColor()) << ")";
  return os;
}

std::ostream& operator<<(std::ostream& os, const Move& move) {
  os << "Move(" << move.FromRow() << "," << move.FromCol() << " -> " << move.ToRow() << "," << move.ToCol()<< ")";
  return os;
}

std::ostream& operator<<(
    std::ostream& os, const Board& board) {
  for (int i = 0; i < 14; i++) {
    for (int j = 0; j < 14; j++) {
      if (board.IsLegalLocation(i, j)) {
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

Team OtherTeam(Team team) {
  return team == RED_YELLOW ? BLUE_GREEN : RED_YELLOW;
}

std::string Move::PrettyStr() const {
  std::string s;
  s += ('a' + from_col_);
  s += std::to_string(14 - from_row_);  // Assuming row 0 is at top (rank 14)
  s += "-";
  s += ('a' + to_col_);
  s += std::to_string(14 - to_row_);
  if (promotion_piece_type_ != NO_PIECE) {
    s += "=" + ToStr(promotion_piece_type_);
  }
  return s;
}

uint32_t Move::Pack() const {
  uint32_t packed = 0;
  packed |= (static_cast<uint32_t>(from_row_) & 0xF);
  packed |= (static_cast<uint32_t>(from_col_) & 0xF) << 4;
  packed |= (static_cast<uint32_t>(to_row_) & 0xF) << 8;
  packed |= (static_cast<uint32_t>(to_col_) & 0xF) << 12;
  packed |= (static_cast<uint32_t>(promotion_piece_type_) & 0x7) << 16;
  if (rook_from_row_ >= 0) {
    packed |= (1u << 19);  // Is castling
  }
  if (en_passant_capture_.Present()) {
    packed |= (1u << 20);  // Is en passant
  }
  return packed;
}

Move Move::Unpack(uint32_t packed, const Board& board) {
  int8_t from_r = packed & 0xF;
  int8_t from_c = (packed >> 4) & 0xF;
  int8_t to_r = (packed >> 8) & 0xF;
  int8_t to_c = (packed >> 12) & 0xF;
  PieceType promotion = static_cast<PieceType>((packed >> 16) & 0x7);
  bool is_castling = (packed >> 19) & 1;
  bool is_en_passant = (packed >> 20) & 1;

  if (is_castling) {
    // For castling, we need to determine the rook move based on king's movement
    CastlingRights rights = board.GetCastlingRights(board.GetTurn());
    // Rook move is derived from king's from/to
    if (to_c > from_c) {  // Kingside
      return Move(from_r, from_c, to_r, to_c, from_r, 13, from_r, to_c - 1, rights);
    } else {  // Queenside
      return Move(from_r, from_c, to_r, to_c, from_r, 0, from_r, to_c + 1, rights);
    }
  }

  if (is_en_passant) {
    // En passant: capture piece is on a different square than destination
    const Piece& moving_piece = board.location_to_piece_[from_r][from_c];
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
    const Piece& captured = board.location_to_piece_[captured_row][captured_col];
    return Move(from_r, from_c, to_r, to_c, captured_row, captured_col, captured.GetRaw());
  }

  // Standard move or promotion
  // en passant promotion not implemented
  const Piece& captured = board.location_to_piece_[to_r][to_c];
  if (promotion != NO_PIECE) {
    return Move(from_r, from_c, to_r, to_c, captured.GetRaw(), promotion);
  }

  // Regular move with possible capture
  int8_t capture_raw = captured.Missing() ? Piece::kRawNoPiece : captured.GetRaw();
  return Move(from_r, from_c, to_r, to_c, capture_raw);
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

std::string Board::ToFEN() const {
  std::ostringstream fen;

  // Part 0: Current player
  char player_char;
  switch (turn_.GetColor()) {
    case RED:    player_char = 'R'; break;
    case BLUE:   player_char = 'B'; break;
    case YELLOW: player_char = 'Y'; break;
    case GREEN:  player_char = 'G'; break;
    default:     player_char = 'R'; break;
  }
  fen << player_char;

  // Part 1: Eliminated players (unused, set to 0,0,0,0)
  fen << "-0,0,0,0";

  // Part 2: Kingside castling rights
  fen << "-";
  for (int i = 0; i < 4; i++) {
    if (i > 0) fen << ",";
    Player pl(static_cast<PlayerColor>(i));
    fen << (castling_rights_[i].Kingside() ? "1" : "0");
  }

  // Part 3: Queenside castling rights
  fen << "-";
  for (int i = 0; i < 4; i++) {
    if (i > 0) fen << ",";
    Player pl(static_cast<PlayerColor>(i));
    fen << (castling_rights_[i].Queenside() ? "1" : "0");
  }

  // Part 4: Points (unused, set to 0,0,0,0)
  fen << "-0,0,0,0";

  // Part 5: Halfmove clock (unused, set to 0)
  fen << "-0";

  // Part 6: Piece placement (14 rows)
  fen << "-";
  for (int row = 0; row < 14; row++) {
    if (row > 0) fen << "/";

    int empty_count = 0;
    for (int col = 0; col < 14; col++) {
      const Piece& piece = location_to_piece_[row][col];

      if (piece.Missing()) {
        empty_count++;
      } else {
        // Output empty count if any
        if (empty_count > 0) {
          fen << empty_count;
          empty_count = 0;
        }

        // Output piece
        char color_char;
        switch (piece.GetColor()) {
          case RED:    color_char = 'r'; break;
          case BLUE:   color_char = 'b'; break;
          case YELLOW: color_char = 'y'; break;
          case GREEN:  color_char = 'g'; break;
          default:     color_char = 'r'; break;
        }

        char piece_char;
        switch (piece.GetPieceType()) {
          case PAWN:   piece_char = 'P'; break;
          case KNIGHT: piece_char = 'N'; break;
          case BISHOP: piece_char = 'B'; break;
          case ROOK:   piece_char = 'R'; break;
          case QUEEN:  piece_char = 'Q'; break;
          case KING:   piece_char = 'K'; break;
          default:     piece_char = 'P'; break;
        }

        fen << color_char << piece_char;
      }
    }

    // Output trailing empty count
    if (empty_count > 0) {
      fen << empty_count;
    }
  }

  // Part 7: En passant targets
  fen << "-";
  for (int i = 0; i < 4; i++) {
    if (i > 0) fen << ",";
    if (en_passant_targets_[i].row >= 0) {
      int8_t row = en_passant_targets_[i].row;
      int8_t col = en_passant_targets_[i].col;
      // Convert to square notation (file a-n, rank 1-14)
      char file = 'a' + col;
      int rank = 14 - row;
      fen << file << rank;
    } else {
      fen << "";
    }
  }

  return fen.str();
}

}  // namespace chess

