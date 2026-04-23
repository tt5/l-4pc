#ifndef _BOARD_H_
#define _BOARD_H_

// Classes for a 4-player teams chess board (chess.com variant).

#include <functional>
#include <memory>
#include <optional>
#include <ostream>
#include <unordered_map>
#include <utility>
#include <vector>
#include <iostream>
#include <chrono>
#include <sstream>
#include <execinfo.h>  // For backtrace
#include <cstdlib>     // For free

namespace chess {

class Board;

constexpr int kNumPieceTypes = 6;

enum PieceType : int8_t {
  PAWN = 0, KNIGHT = 1, BISHOP = 2, ROOK = 3, QUEEN = 4, KING = 5,
  NO_PIECE = 6,
};

// In centipawns
constexpr int kPieceEvaluations[6] = {
  50,     // PAWN
  300,    // KNIGHT
  400,    // BISHOP
  500,    // ROOK
  1000,   // QUEEN
  10000,  // KING (unused)
};

enum PlayerColor : int8_t {
  UNINITIALIZED_PLAYER = -1,
  RED = 0, BLUE = 1, YELLOW = 2, GREEN = 3,
};

enum Team : int8_t {
  RED_YELLOW = 0, BLUE_GREEN = 1, NO_TEAM = 2, CURRENT_TEAM = 3,
};

class Player {
 public:
  Player() : color_(UNINITIALIZED_PLAYER) { }
  explicit Player(PlayerColor color) : color_(color) { }

  PlayerColor GetColor() const { return color_; }
  Team GetTeam() const {
    return (color_ == RED || color_ == YELLOW) ? RED_YELLOW : BLUE_GREEN;
  }
  bool operator==(const Player& other) const {
    return color_ == other.color_;
  }
  bool operator!=(const Player& other) const {
    return !(*this == other);
  }
  friend std::ostream& operator<<(
      std::ostream& os, const Player& player);

 private:
  PlayerColor color_;
};

}  // namespace chess


template <>
struct std::hash<chess::Player>
{
  std::size_t operator()(const chess::Player& x) const
  {
    return std::hash<int>()(x.GetColor());
  }
};


namespace chess {

class Piece {
 public:
  static int invalid_piece_count;
  
  Piece() : Piece(false, RED, NO_PIECE) { }
  
  // Raw constructor - bypasses validation for performance (caller must ensure valid)
  Piece(int8_t raw_bits) noexcept : bits_(raw_bits) { }

  Piece(bool present, PlayerColor color, PieceType piece_type) {
    // For non-present pieces, ensure clean state
    if (!present) {
      color = RED;
      piece_type = NO_PIECE;
    }

    bits_ = (((int8_t)present) << 7) |
            (((int8_t)color) << 5) |
            (((int8_t)piece_type) << 2);
  }

  Piece(PlayerColor color, PieceType piece_type)
    : Piece(true, color, piece_type) { }

  Piece(Player player, PieceType piece_type)
    : Piece(true, player.GetColor(), piece_type) { }

  bool Present() const {
    return bits_ & (1 << 7);
  }
  bool Missing() const { return !Present(); }
  PlayerColor GetColor() const {
    return static_cast<PlayerColor>((bits_ & 0b01100000) >> 5);
  }
  PieceType GetPieceType() const {
    return static_cast<PieceType>((bits_ >> 2) & 0b00000111);
  }

  bool operator==(const Piece& other) const { return bits_ == other.bits_; }
  bool operator!=(const Piece& other) const { return bits_ != other.bits_; }

  Player GetPlayer() const { return Player(GetColor()); }
  Team GetTeam() const { return GetPlayer().GetTeam(); }
  friend std::ostream& operator<<(
      std::ostream& os, const Piece& piece);

  static Piece kNoPiece;

    uint8_t GetRaw() const { return bits_; }

  // Helper to compute raw bits for a present piece (constexpr for compile-time)
  static constexpr int8_t ComputeRawBits(PlayerColor color, PieceType piece_type) {
    return (1 << 7) | (((int8_t)color) << 5) | (((int8_t)piece_type) << 2);
  }

  // Precomputed raw bits for ROOK pieces (used in castling checks)
  // Formula: (1 << 7) | (color << 5) | (ROOK << 2)
  static constexpr uint8_t kRawRedRook = 140;    // 128 | 0 | 12
  static constexpr uint8_t kRawBlueRook = 172;   // 128 | 32 | 12
  static constexpr uint8_t kRawYellowRook = 204;  // 128 | 64 | 12
  static constexpr uint8_t kRawGreenRook = 236;   // 128 | 96 | 12

  // Precomputed raw bits for PAWN (used in demotion)
  // Formula: (1 << 7) | (color << 5) | (PAWN << 2)
  static constexpr uint8_t kRawPawn[4] = {
    128,  // RED=0: 128 | 0 | 0
    160,  // BLUE=1: 128 | 32 | 0
    192,  // YELLOW=2: 128 | 64 | 0
    224   // GREEN=3: 128 | 96 | 0
  };

  // Precomputed raw bits for empty piece (present=false)
  // Formula: 0 (since present bit is 0)
  static constexpr uint8_t kRawNoPiece = 0;

  // Static helpers to extract color/piece type from raw bits (bypasses virtual calls)
  static constexpr PlayerColor ExtractColor(uint8_t raw_bits) {
    return static_cast<PlayerColor>((raw_bits & 0b01100000) >> 5);
  }

  static constexpr PieceType ExtractPieceType(uint8_t raw_bits) {
    return static_cast<PieceType>((raw_bits >> 2) & 0b00000111);
  }

 private:
  // bit 0: presence
  // bit 1-2: player
  // bit 3-5: piece type
  int8_t bits_;

  static bool IsValidPieceType(PieceType type) {
    return (type >= PAWN && type <= KING) || type == NO_PIECE;
  }
};

//extern const Piece* kPieceSet[4][6];

}  // namespace chess

template <>
struct std::hash<std::pair<int8_t, int8_t>>
{
  std::size_t operator()(const std::pair<int8_t, int8_t>& x) const
  {
    std::size_t hash = 14479 + 14593 * x.first;
    hash += 24439 * x.second;
    return hash;
  }
};

namespace chess {

  // Precomputed legal positions for 4-player chess board
  // 1 = legal, 0 = illegal
  static constexpr bool kLegalPositions[14][14] = {
      // Row 0-2: Only columns 3-10 are legal
      {0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0}, // Row 0
      {0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0}, // Row 1
      {0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0}, // Row 2
      // Rows 3-10: All columns are legal
      {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1}, // Row 3
      {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1}, // Row 4
      {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1}, // Row 5
      {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1}, // Row 6
      {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1}, // Row 7
      {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1}, // Row 8
      {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1}, // Row 9
      {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1}, // Row 10
      // Rows 11-13: Only columns 3-10 are legal
      {0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0}, // Row 11
      {0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0}, // Row 12
      {0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0}, // Row 13
  };

// Move or capture. Does not include pawn promotion, en-passant, or castling.
enum CastlingType {
  KINGSIDE = 0, QUEENSIDE = 1,
};

class CastlingRights {
 public:
  CastlingRights() = default;

  CastlingRights(bool kingside, bool queenside)
    : bits_(0b10000000 | (kingside << 6) | (queenside << 5)) { }
    //: kingside_(kingside), queenside_(queenside) { }

  bool Present() const { return bits_ & (1 << 7); }
  bool Kingside() const { return bits_ & (1 << 6); }
  bool Queenside() const { return bits_ & (1 << 5); }
  //bool Kingside() const { return kingside_; }
  //bool Queenside() const { return queenside_; }

  bool operator==(const CastlingRights& other) const {
    return bits_ == other.bits_;
    //return kingside_ == other.kingside_ && queenside_ == other.queenside_;
  }
  bool operator!=(const CastlingRights& other) const {
    return !(*this == other);
  }

  static CastlingRights kMissingRights;

 private:
  // bit 0: presence
  // bit 1: kingside
  // bit 2: queenside
  int8_t bits_ = 0;

  //bool kingside_ = true;
  //bool queenside_ = true;
};

class Move {
 public:
  Move() = default;

  // Raw constructor for castling - bypasses validation/overhead for performance (caller must ensure valid)
  Move(int8_t king_from_r, int8_t king_from_c, int8_t king_to_r, int8_t king_to_c,
       int8_t rook_from_r, int8_t rook_from_c, int8_t rook_to_r, int8_t rook_to_c,
       CastlingRights initial_castling_rights) noexcept
      : from_row_(king_from_r),
        from_col_(king_from_c),
        to_row_(king_to_r),
        to_col_(king_to_c),
        rook_from_row_(rook_from_r),
        rook_from_col_(rook_from_c),
        rook_to_row_(rook_to_r),
        rook_to_col_(rook_to_c),
        initial_castling_rights_(std::move(initial_castling_rights)) { }

  // Raw constructor - bypasses validation/overhead for performance (caller must ensure valid)
  Move(int8_t from_r, int8_t from_c, int8_t to_r, int8_t to_c,
       int8_t capture_raw) noexcept
      : from_row_(from_r),
        from_col_(from_c),
        to_row_(to_r),
        to_col_(to_c),
        standard_capture_(capture_raw),
        rook_from_row_(-1),
        rook_from_col_(-1),
        rook_to_row_(-1),
        rook_to_col_(-1) { }

  // Raw constructor with castling rights - for king moves
  Move(int8_t from_r, int8_t from_c, int8_t to_r, int8_t to_c,
       int8_t capture_raw, CastlingRights castling_rights) noexcept
      : from_row_(from_r),
        from_col_(from_c),
        to_row_(to_r),
        to_col_(to_c),
        standard_capture_(capture_raw),
        rook_from_row_(-1),
        rook_from_col_(-1),
        rook_to_row_(-1),
        rook_to_col_(-1),
        initial_castling_rights_(std::move(castling_rights)) { }

  // Raw constructor for promotion moves
  Move(int8_t from_r, int8_t from_c, int8_t to_r, int8_t to_c,
       int8_t capture_raw, PieceType promotion_type) noexcept
      : from_row_(from_r),
        from_col_(from_c),
        to_row_(to_r),
        to_col_(to_c),
        standard_capture_(capture_raw),
        promotion_piece_type_(promotion_type),
        rook_from_row_(-1),
        rook_from_col_(-1),
        rook_to_row_(-1),
        rook_to_col_(-1) { }

  // Raw constructor for en passant moves
  Move(int8_t from_r, int8_t from_c, int8_t to_r, int8_t to_c,
       int8_t ep_row, int8_t ep_col, int8_t ep_capture_raw) noexcept
      : from_row_(from_r),
        from_col_(from_c),
        to_row_(to_r),
        to_col_(to_c),
        standard_capture_(),
        en_passant_capture_(ep_capture_raw),
        ep_target_row_(ep_row),
        ep_target_col_(ep_col),
        rook_from_row_(-1),
        rook_from_col_(-1),
        rook_to_row_(-1),
        rook_to_col_(-1) { }

  int8_t FromRow() const { return from_row_; }
  int8_t FromCol() const { return from_col_; }
  int8_t ToRow() const { return to_row_; }
  int8_t ToCol() const { return to_col_; }
  Piece GetStandardCapture() const {
    return standard_capture_;
  }
  bool IsStandardCapture() const {
    return standard_capture_.Present();
  }
  PieceType GetPromotionPieceType() const {
    return promotion_piece_type_;
  }
  int8_t GetEnpassantTargetRow() const { return ep_target_row_; }
  int8_t GetEnpassantTargetCol() const { return ep_target_col_; }
  Piece GetEnpassantCapture() const {
    return en_passant_capture_;
  }
  int8_t RookFromRow() const { return rook_from_row_; }
  int8_t RookFromCol() const { return rook_from_col_; }
  int8_t RookToRow() const { return rook_to_row_; }
  int8_t RookToCol() const { return rook_to_col_; }
  CastlingRights GetInitialCastlingRights() const {
    return initial_castling_rights_;
  }

  bool IsCapture() const {
    return standard_capture_.Present() || en_passant_capture_.Present();
  }
  Piece GetCapturePiece() const {
    return standard_capture_.Present() ? standard_capture_ : en_passant_capture_;
  }

  bool operator==(const Move& other) const {
  return from_row_ == other.from_row_
      && from_col_ == other.from_col_
      && to_row_ == other.to_row_
      && to_col_ == other.to_col_
      && standard_capture_ == other.standard_capture_
      && promotion_piece_type_ == other.promotion_piece_type_
      && ep_target_row_ == other.ep_target_row_
      && ep_target_col_ == other.ep_target_col_
      && en_passant_capture_ == other.en_passant_capture_
      && rook_from_row_ == other.rook_from_row_
      && rook_from_col_ == other.rook_from_col_
      && rook_to_row_ == other.rook_to_row_
      && rook_to_col_ == other.rook_to_col_
      && initial_castling_rights_ == other.initial_castling_rights_;
  }
  bool operator!=(const Move& other) const {
    return !(*this == other);
  }
  //int ManhattanDistance() const;
  friend std::ostream& operator<<(
      std::ostream& os, const Move& move);
  std::string PrettyStr() const;

  // Packed representation for transposition table (32 bits)
  // Bits 0-7: from square (0-195, 196=invalid)
  // Bits 8-15: to square (0-195, 196=invalid)
  // Bits 16-18: promotion piece type (0-6)
  // Bit 19: is castling
  // Bit 20: is en passant
  // Bits 21-31: reserved (0)
  uint32_t Pack() const;
  static Move Unpack(uint32_t packed, const Board& board);

 private:

  int8_t from_row_;
  int8_t from_col_;
  int8_t to_row_;
  int8_t to_col_;

  // Capture
  Piece standard_capture_; // 1

  // Promotion
  PieceType promotion_piece_type_ = NO_PIECE; // 1

  // En-passant
  Piece en_passant_capture_;  // 1
  int8_t ep_target_row_ = -1;
  int8_t ep_target_col_ = -1;

  // For castling moves
  int8_t rook_from_row_ = -1;
  int8_t rook_from_col_ = -1;
  int8_t rook_to_row_ = -1;
  int8_t rook_to_col_ = -1;

  // Castling rights before the move
  CastlingRights initial_castling_rights_; // 1

};

enum GameResult {
  IN_PROGRESS = 0,
  WIN_RY = 1,
  WIN_BG = 2,
  STALEMATE = 3,
};

class PlacedPiece {
 public:
  PlacedPiece() : row_(-1), col_(-1) { }

  PlacedPiece(int8_t row, int8_t col)
    : row_(row), col_(col)
  { }

  int8_t GetRow() const { return row_; }
  int8_t GetCol() const { return col_; }
  
  const Piece& GetPiece(const Board& board) const;
  
  friend std::ostream& operator<<(
      std::ostream& os, const PlacedPiece& placed_piece);

 private:
  int8_t row_;
  int8_t col_;
};

struct EnpassantInitialization {
  // Indexed by PlayerColor
  std::optional<Move> enp_moves[4] = {std::nullopt, std::nullopt, std::nullopt, std::nullopt};
};


class Board {
 // Conventions:
 // - Red is on the bottom of the board, blue on the left, yellow on top,
 //   green on the right
 // - Rows go downward from the top
 // - Columns go rightward from the left

 public:
  Board(
      Player turn,
      std::unordered_map<std::pair<int8_t, int8_t>, Piece> location_to_piece,
      std::optional<std::unordered_map<Player, CastlingRights>>
        castling_rights = std::nullopt,
      std::optional<EnpassantInitialization> enp = std::nullopt);

  Board(const Board&) = default;

  struct MoveGenResult {
    size_t count;
    int pv_index;  // -1 if PV move not found
    int mobility_counts[4] = {0};  // One for each player color
    int threat_counts[4] = {0};    // One for each player color
    bool in_check = false;
  };
  
  MoveGenResult GetPseudoLegalMoves2(
    Move* buffer, 
    size_t limit, 
    const std::optional<Move>& pv_move = std::nullopt);
  
  Team TeamToPlay() const;
  int PieceEvaluation() const;
  int PieceEvaluation(PlayerColor color) const;
  int MobilityEvaluation();
  int MobilityEvaluation(const Player& player);
  const Player& GetTurn() const { return turn_; }
  bool IsAttackedByTeam(
      Team team,
      int8_t loc_row,
      int8_t loc_col
      ) const;

  // Check if scanning from piece location toward edge finds an attacker
  // Optimized version: starts scanning from from_row/from_col (now empty) rather than from king
  // This skips the known-empty squares between king and piece
  inline bool IsAttackedByTeamAligned(
      Team team,
      int8_t from_row,
      int8_t from_col,
      int8_t rd,
      int8_t cd
      ) const {
    const bool is_orthogonal = (rd == 0) || (cd == 0);
    // Start scanning from the piece's original location (now empty)
    int8_t row = from_row + rd;
    int8_t col = from_col + cd;
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

  std::pair<int8_t, int8_t> GetAttacker(Team team, int8_t row, int8_t col) const;

  std::pair<int8_t, int8_t> GetRevAttacker(Team team, int8_t row, int8_t col) const;

  int8_t GetKingRow(PlayerColor color) const { return king_row_[color]; }
  int8_t GetKingCol(PlayerColor color) const { return king_col_[color]; }
  bool KingPresent(PlayerColor color) const { return king_row_[color] >= 0; }

  const Piece& GetPiece(int row, int col) const {
    return location_to_piece_[row][col];
  }

  int64_t HashKey() const { return hash_key_; }

  static std::shared_ptr<Board> CreateStandardSetup();
//  bool operator==(const Board& other) const;
//  bool operator!=(const Board& other) const;
  const CastlingRights& GetCastlingRights(const Player& player) const;

  void MakeMove(const Move& move);
  void UndoMove();
  bool LastMoveWasCapture() const {
    return !moves_.empty() && moves_.back().GetStandardCapture().Present();
  }
  int NumMoves() const { return moves_.size(); }
  const std::vector<Move>& Moves() { return moves_; }

  // Print the current board state to stdout
  void PrintBoard() const;

  friend std::ostream& operator<<(
      std::ostream& os, const Board& board);

  static std::chrono::nanoseconds total_time;
  static size_t call_count;


  bool IsLegalLocation(int row, int col) const {
    // Bounds check first (faster to fail fast for out-of-bounds)
    if (static_cast<unsigned>(row) >= 14 || static_cast<unsigned>(col) >= 14) {
      return false;
    }
    return kLegalPositions[row][col];
  }

  const EnpassantInitialization& GetEnpassantInitialization() { return enp_; }
  const std::vector<std::vector<PlacedPiece>>& GetPieceList() { return piece_list_; };

 private:
  int GetMaxRow() const { return 13; }
  int GetMaxCol() const { return 13; }

  void InitializeHash();
  void UpdatePieceHash(const Piece& piece, int8_t row, int8_t col) {
    hash_key_ ^= piece_hashes_[piece.GetColor()][piece.GetPieceType()]
      [row][col];
  }
  void UpdatePieceHash(uint8_t raw_bits, int8_t row, int8_t col) {
    hash_key_ ^= piece_hashes_[Piece::ExtractColor(raw_bits)][Piece::ExtractPieceType(raw_bits)]
      [row][col];
  }
  void UpdateTurnHash(int turn) {
    hash_key_ ^= turn_hashes_[turn];
  }

  friend class Move;
  friend class PlacedPiece;

  Player turn_;

  Piece location_to_piece_[14][14];
  std::vector<std::vector<PlacedPiece>> piece_list_;
  int8_t piece_list_index_[14][14];  // Maps (row,col) to index in piece_list_[color], -1 if empty

  CastlingRights castling_rights_[4];
  EnpassantInitialization enp_;
  std::vector<Move> moves_; // list of moves from beginning of game
  int piece_evaluation_ = 0;
  int player_piece_evaluations_[4] = {0, 0, 0, 0}; // one per player

  int64_t hash_key_ = 0;
  int64_t piece_hashes_[4][6][14][14];
  int64_t turn_hashes_[4];
  int8_t king_row_[4] = {-1, -1, -1, -1};
  int8_t king_col_[4] = {-1, -1, -1, -1};
  struct EnPassantTarget {
    int8_t row = -1;
    int8_t col = -1;
  };
  EnPassantTarget en_passant_targets_[4];  // One for each player color
};

// Helper functions

Team OtherTeam(Team team);
Team GetTeam(PlayerColor color);
Player GetNextPlayer(const Player& player);
Player GetPreviousPlayer(const Player& player);
Player GetPartner(const Player& player);


}  // namespace chess


#endif  // _BOARD_H_

