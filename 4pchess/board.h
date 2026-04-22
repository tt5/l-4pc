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

//class Piece {
// public:
//  Piece() : piece_type_(NO_PIECE) { }
//
//  Piece(Player player, PieceType piece_type)
//    : player_(std::move(player)),
//      piece_type_(piece_type)
//  { }
//
//  const Player& GetPlayer() const { return player_; }
//  PieceType GetPieceType() const { return piece_type_; }
//  Team GetTeam() const { return GetPlayer().GetTeam(); }
//  PlayerColor GetColor() const { return GetPlayer().GetColor(); }
//  bool operator==(const Piece& other) const {
//    return player_ == other.player_ && piece_type_ == other.piece_type_;
//  }
//  bool operator!=(const Piece& other) const {
//    return !(*this == other);
//  }
//  friend std::ostream& operator<<(
//      std::ostream& os, const Piece& piece);
//
// private:
//  Player player_;
//  PieceType piece_type_;
//};

class Piece {
 public:
  static int invalid_piece_count;
  static void LogInvalidPiece(const char* context) {
    std::cerr << "INVALID PIECE in " << context 
              << " (total: " << ++invalid_piece_count << ")\n";
    if (invalid_piece_count < 10) {  // Only show first few errors to avoid spam
      std::cerr << "  Backtrace:\n";
      // This is a simple way to get a backtrace - you might need to adjust for your platform
      void* callstack[10];
      int frames = backtrace(callstack, 10);
      char** strs = backtrace_symbols(callstack, frames);
      for (int i = 1; i < frames; ++i) {
        std::cerr << "    " << strs[i] << "\n";
      }
      free(strs);
    }
  }
  
  Piece() : Piece(false, RED, NO_PIECE) { }
  
  // Raw constructor - bypasses validation for performance (caller must ensure valid)
  Piece(int8_t raw_bits, bool /*raw*/) noexcept : bits_(raw_bits) { }

  static void AbortWithMessage(const std::string& message) {
    std::cerr << "FATAL ERROR: " << message << "\n";
    std::abort();
  }

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

  std::string DebugString() const {
    std::ostringstream ss;
    ss << "Piece["
        << "present=" << Present()
        << ", color=" << static_cast<int>(GetColor())
        << ", type=" << static_cast<int>(GetPieceType())
        << ", bits=0x" << std::hex << (bits_ & 0xFF) << std::dec
        << "]";
    return ss.str();
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

  bool IsValid() const {
        // Check if piece type is valid
        PieceType type = GetPieceType();
        if (!IsValidPieceType(type)) {
            std::cerr << "INVALID PIECE: Invalid type: " << static_cast<int>(type) 
                      << " (valid range: 0=PAWN to 5=KING, 6=NO_PIECE)\n"
                      << "  Full piece: " << DebugString() << std::endl;
            return false;
        }
        
        // Check if color is valid
        PlayerColor color = GetColor();
        if (color != PlayerColor::RED && 
            color != PlayerColor::YELLOW &&
            color != PlayerColor::GREEN &&
            color != PlayerColor::BLUE) {
            std::cerr << "INVALID PIECE: Invalid color: " << static_cast<int>(color) << std::endl;
            return false;
        }
        
        // Additional validation for present pieces
        if (Present()) {
            if (type == NO_PIECE) {
                std::cerr << "INVALID PIECE: Present piece has NO_PIECE type" << std::endl;
                return false;
            }
        } else {
            // For non-present pieces, type and color should be 0
            if (type != NO_PIECE || color != PlayerColor::RED) {
                std::cerr << "INVALID PIECE: Non-present piece has non-zero type/color" << std::endl;
                return false;
            }
        }
        
        return true;
    }
    
    void Validate() const {
        if (!IsValid()) {
            std::cerr << "FATAL: Invalid piece detected: " << DebugString() << std::endl;
            AbortWithMessage("Invalid piece validation failed");
        }
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


class BoardLocation {
 public:
  BoardLocation() : loc_(196) {}
  BoardLocation(int8_t row, int8_t col) {
    loc_ = (row < 0 || row >= 14 || col < 0 || col >= 14)
      ? 196 : 14 * row + col;
  }
  // Raw constructor - bypasses validation for performance (caller must ensure valid)
  BoardLocation(int8_t row, int8_t col, bool /*raw*/) noexcept
      : loc_(static_cast<uint8_t>(14 * row + col)) {}

  bool Present() const { return loc_ < 196; }
  bool Missing() const { return !Present(); }
  int8_t GetRow() const { return loc_ / 14; }
  int8_t GetCol() const { return loc_ % 14; }
  int8_t GetSquare() const { return loc_; }

  BoardLocation Relative(int8_t delta_row, int8_t delta_col) const {
    return BoardLocation(GetRow() + delta_row, GetCol() + delta_col);
  }

  bool operator==(const BoardLocation& other) const { return loc_ == other.loc_; }
  bool operator!=(const BoardLocation& other) const { return loc_ != other.loc_; }

  friend std::ostream& operator<<(
      std::ostream& os, const BoardLocation& location);
  std::string PrettyStr() const;

  static BoardLocation kNoLocation;

 private:
  // value 0-195: 1 + 14*row + col
  // value 196: not present
  uint8_t loc_;
};

}  // namespace chess

template <>
struct std::hash<chess::BoardLocation>
{
  std::size_t operator()(const chess::BoardLocation& x) const
  {
    std::size_t hash = 14479 + 14593 * x.GetRow();
    hash += 24439 * x.GetCol();
    return hash;
  }
};

namespace chess {

// Move or capture. Does not include pawn promotion, en-passant, or castling.
class SimpleMove {
 public:
  SimpleMove() = default;

  SimpleMove(BoardLocation from,
             BoardLocation to)
    : from_(std::move(from)),
      to_(std::move(to))
  { }

  bool Present() const { return from_.Present() && to_.Present(); }
  const BoardLocation& From() const { return from_; }
  const BoardLocation& To() const { return to_; }

  bool operator==(const SimpleMove& other) const {
    return from_ == other.from_
        && to_ == other.to_;
  }

  bool operator!=(const SimpleMove& other) const {
    return !(*this == other);
  }

 private:
  BoardLocation from_;
  BoardLocation to_;
};

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

  // Standard move
  Move(BoardLocation from, BoardLocation to,
       Piece standard_capture = Piece::kNoPiece,
       CastlingRights initial_castling_rights = CastlingRights::kMissingRights)
    : from_(std::move(from)),
      to_(std::move(to)),
      from_row_(from.GetRow()),
      from_col_(from.GetCol()),
      to_row_(to.GetRow()),
      to_col_(to.GetCol()),
      standard_capture_(standard_capture),
      initial_castling_rights_(std::move(initial_castling_rights))
  { }

      std::string DebugString() const {
        std::ostringstream ss;
        ss << "Move[from=" << from_.PrettyStr() 
           << ", to=" << to_.PrettyStr();
        
        if (standard_capture_.Present()) {
            ss << ", capture=" << standard_capture_.DebugString();
        }
        if (promotion_piece_type_ != NO_PIECE) {
            ss << ", promote_to=" << static_cast<int>(promotion_piece_type_);
        }
        if (en_passant_location_.Present()) {
            ss << ", ep=" << en_passant_location_.PrettyStr();
        }
        if (en_passant_capture_.Present()) {
            ss << ", ep_capture=" << en_passant_capture_.DebugString();
        }
        if (rook_move_.Present()) {
            ss << ", rook_from=" << rook_move_.From().PrettyStr()
               << ", rook_to=" << rook_move_.To().PrettyStr();
        }
        ss << "]";
        return ss.str();
    }

  // Pawn move
  Move(BoardLocation from, BoardLocation to,
       Piece standard_capture,
       BoardLocation en_passant_location,
       Piece en_passant_capture,
       PieceType promotion_piece_type = NO_PIECE)
    : from_(std::move(from)),
      to_(std::move(to)),
      from_row_(from.GetRow()),
      from_col_(from.GetCol()),
      to_row_(to.GetRow()),
      to_col_(to.GetCol()),
      standard_capture_(standard_capture),
      promotion_piece_type_(promotion_piece_type),
      en_passant_location_(en_passant_location),
      en_passant_capture_(en_passant_capture),
      ep_target_row_(en_passant_location.Present() ? en_passant_location.GetRow() : -1),
      ep_target_col_(en_passant_location.Present() ? en_passant_location.GetCol() : -1)
  { }

  // Castling
  Move(BoardLocation from, BoardLocation to,
       SimpleMove rook_move,
       CastlingRights initial_castling_rights)
    : from_(std::move(from)),
      to_(std::move(to)),
      from_row_(from.GetRow()),
      from_col_(from.GetCol()),
      to_row_(to.GetRow()),
      to_col_(to.GetCol()),
      rook_move_(rook_move),
      initial_castling_rights_(std::move(initial_castling_rights))
  { }

  // Raw constructor - bypasses validation/overhead for performance (caller must ensure valid)
  Move(int8_t from_r, int8_t from_c, int8_t to_r, int8_t to_c,
       int8_t capture_raw, bool /*raw*/) noexcept
      : from_(from_r, from_c, true),
        to_(to_r, to_c, true),
        from_row_(from_r),
        from_col_(from_c),
        to_row_(to_r),
        to_col_(to_c),
        standard_capture_(capture_raw, true) { }

  // Raw constructor with castling rights - for king moves
  Move(int8_t from_r, int8_t from_c, int8_t to_r, int8_t to_c,
       int8_t capture_raw, CastlingRights castling_rights, bool /*raw*/) noexcept
      : from_(from_r, from_c, true),
        to_(to_r, to_c, true),
        from_row_(from_r),
        from_col_(from_c),
        to_row_(to_r),
        to_col_(to_c),
        standard_capture_(capture_raw, true),
        initial_castling_rights_(std::move(castling_rights)) { }

  // Raw constructor for promotion moves
  Move(int8_t from_r, int8_t from_c, int8_t to_r, int8_t to_c,
       int8_t capture_raw, PieceType promotion_type, bool /*raw*/) noexcept
      : from_(from_r, from_c, true),
        to_(to_r, to_c, true),
        from_row_(from_r),
        from_col_(from_c),
        to_row_(to_r),
        to_col_(to_c),
        standard_capture_(capture_raw, true),
        promotion_piece_type_(promotion_type) { }

  // Raw constructor for en passant moves
  Move(int8_t from_r, int8_t from_c, int8_t to_r, int8_t to_c,
       int8_t ep_row, int8_t ep_col, int8_t ep_capture_raw, bool /*raw*/) noexcept
      : from_(from_r, from_c, true),
        to_(to_r, to_c, true),
        from_row_(from_r),
        from_col_(from_c),
        to_row_(to_r),
        to_col_(to_c),
        en_passant_location_(ep_row, ep_col, true),
        en_passant_capture_(ep_capture_raw, true),
        ep_target_row_(ep_row),
        ep_target_col_(ep_col) { }

  const BoardLocation& From() const { return from_; }
  const BoardLocation& To() const { return to_; }
  int8_t FromRow() const { return from_row_; }
  int8_t FromCol() const { return from_col_; }
  int8_t ToRow() const { return to_row_; }
  int8_t ToCol() const { return to_col_; }
  bool Present() const { return from_.Present() && to_.Present(); }
  Piece GetStandardCapture() const {
    return standard_capture_;
  }
  bool IsStandardCapture() const {
    return standard_capture_.Present();
  }
  PieceType GetPromotionPieceType() const {
    return promotion_piece_type_;
  }
  const BoardLocation GetEnpassantLocation() const {
    return en_passant_location_;
  }
  int8_t GetEnpassantTargetRow() const { return ep_target_row_; }
  int8_t GetEnpassantTargetCol() const { return ep_target_col_; }
  Piece GetEnpassantCapture() const {
    return en_passant_capture_;
  }
  SimpleMove GetRookMove() const { return rook_move_; }
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
    return from_ == other.from_
        && to_ == other.to_
        && standard_capture_ == other.standard_capture_
        && promotion_piece_type_ == other.promotion_piece_type_
        && en_passant_location_ == other.en_passant_location_
        && en_passant_capture_ == other.en_passant_capture_
        && rook_move_ == other.rook_move_
        && initial_castling_rights_ == other.initial_castling_rights_;
  }
  bool operator!=(const Move& other) const {
    return !(*this == other);
  }
  int ManhattanDistance() const;
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
  BoardLocation from_;  // 1
  BoardLocation to_;  // 1

  // Dual-format coordinates (redundant but avoids division)
  int8_t from_row_;
  int8_t from_col_;
  int8_t to_row_;
  int8_t to_col_;

  // Capture
  Piece standard_capture_; // 1

  // Promotion
  PieceType promotion_piece_type_ = NO_PIECE; // 1

  // En-passant
  BoardLocation en_passant_location_; // 1
  Piece en_passant_capture_;  // 1
  int8_t ep_target_row_ = -1;
  int8_t ep_target_col_ = -1;

  // For castling moves
  SimpleMove rook_move_; // 2

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
      std::unordered_map<BoardLocation, Piece> location_to_piece,
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
  
  // Direct buffer access move generation functions
  Move* GetPawnMovesDirect(Move* moves, const BoardLocation& from, PlayerColor color, Team my_team) const;
  Move* GetKnightMovesDirect(Move* moves, const BoardLocation& from, PlayerColor color, int& threats, Team my_team) const;
  //Move* GetBishopMovesDirect(Move* moves, const BoardLocation& from, PlayerColor color, int& threats, Team my_team) const;
  Move* GetBishopMovesDirect(Move* moves, const BoardLocation& from, const int8_t from_row, const int8_t from_col, PlayerColor color, int& threats, Team my_team) const;
  Move* GetRookMovesDirect(Move* moves, const BoardLocation& from, const int8_t from_row, const int8_t from_col, PlayerColor color, int& threats, Team my_team) const;
  Move* GetQueenMovesDirect(Move* moves, const BoardLocation& from, PlayerColor color, int& threats, Team my_team) const;
  Move* GetKingMovesDirect(Move* moves, const BoardLocation& from, PlayerColor color, Team my_team) const;

  Move* GetKingMovesCheck(Move* moves, const BoardLocation& from, PlayerColor color, Team my_team) const;
  Move* GetKingMovesNoCheck(Move* moves, const BoardLocation& from, PlayerColor color, Team my_team) const;

  bool IsKingInCheck(const Player& player) const;
  bool IsKingInCheck(Team team) const;

  GameResult CheckWasLastMoveKingCapture() const;
  GameResult GetGameResult(); // Avoid calling during search.

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

  BoardLocation GetAttacker(
      Team team,
      const BoardLocation& location) const;
  BoardLocation GetAttacker(Team team, int8_t row, int8_t col) const;

  BoardLocation GetRevAttacker(
      Team team,
      const BoardLocation& location) const;

//  std::vector<PlacedPiece> GetAttackers(
//      Team team, const BoardLocation& location,
//      bool return_early = false) const;

  size_t GetAttackers2(
      PlacedPiece* buffer, size_t limit,
      Team team, const BoardLocation& location) const;

  int8_t GetKingRow(PlayerColor color) const { return king_row_[color]; }
  int8_t GetKingCol(PlayerColor color) const { return king_col_[color]; }
  bool KingPresent(PlayerColor color) const { return king_row_[color] >= 0; }
  bool DeliversCheck(const Move& move);

  const Piece& GetPiece(int row, int col) const {
    return location_to_piece_[row][col];
  }
 
  const Piece& GetPiece(
      const BoardLocation& location) const {
    return GetPiece(location.GetRow(), location.GetCol());
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
  const Move& GetLastMove() const {
    return moves_.back();
  }
  int NumMoves() const { return moves_.size(); }
  const std::vector<Move>& Moves() { return moves_; }

  // Print the current board state to stdout
  void PrintBoard() const;

  friend std::ostream& operator<<(
      std::ostream& os, const Board& board);

  static std::chrono::nanoseconds total_time;
  static size_t call_count;

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

  bool IsLegalLocation(int row, int col) const {
    // Bounds check first (faster to fail fast for out-of-bounds)
    if (static_cast<unsigned>(row) >= 14 || static_cast<unsigned>(col) >= 14) {
      return false;
    }
    return kLegalPositions[row][col];
  }
  bool IsLegalLocation(const BoardLocation& location) const {
    return IsLegalLocation(location.GetRow(), location.GetCol());
  }
  const EnpassantInitialization& GetEnpassantInitialization() { return enp_; }
  const std::vector<std::vector<PlacedPiece>>& GetPieceList() { return piece_list_; };

 private:
  void AddMovesFromIncrMovement(
      std::vector<Move>& moves,
      const Piece& piece,
      const BoardLocation& from,
      int incr_row,
      int incr_col,
      CastlingRights initial_castling_rights = CastlingRights::kMissingRights,
      CastlingRights castling_rights = CastlingRights::kMissingRights) const;
  int GetMaxRow() const { return 13; }
  int GetMaxCol() const { return 13; }
  std::optional<CastlingType> GetRookLocationType(
      const Player& player, const BoardLocation& location) const;
  inline void SetPiece(const BoardLocation& location,
                const Piece& piece);
  inline void RemovePiece(const BoardLocation& location);
  inline bool QueenAttacks(
      const BoardLocation& queen_loc,
      const BoardLocation& other_loc) const;
  inline bool RookAttacks(
      const BoardLocation& rook_loc,
      const BoardLocation& other_loc) const;
  inline bool BishopAttacks(
      const BoardLocation& bishop_loc,
      const BoardLocation& other_loc) const;
  inline bool KingAttacks(
      const BoardLocation& king_loc,
      const BoardLocation& other_loc) const;
  inline bool KnightAttacks(
      const BoardLocation& knight_loc,
      const BoardLocation& other_loc) const;
  inline bool PawnAttacks(
      const BoardLocation& pawn_loc,
      PlayerColor pawn_color,
      const BoardLocation& other_loc) const;

  void InitializeHash();
  void UpdatePieceHash(const Piece& piece, const BoardLocation& loc) {
    UpdatePieceHash(piece, loc.GetRow(), loc.GetCol());
  }
  void UpdatePieceHash(const Piece& piece, int8_t row, int8_t col) {
    hash_key_ ^= piece_hashes_[piece.GetColor()][piece.GetPieceType()]
      [row][col];
  }
  void UpdateTurnHash(int turn) {
    hash_key_ ^= turn_hashes_[turn];
  }

  Player turn_;

  Piece location_to_piece_[14][14];
  std::vector<std::vector<PlacedPiece>> piece_list_;

  BoardLocation locations_[14][14];

  CastlingRights castling_rights_[4];
  EnpassantInitialization enp_;
  std::vector<Move> moves_; // list of moves from beginning of game
  std::vector<Move> move_buffer_;
  int piece_evaluation_ = 0;
  int player_piece_evaluations_[4] = {0, 0, 0, 0}; // one per player

  int64_t hash_key_ = 0;
  int64_t piece_hashes_[4][6][14][14];
  int64_t turn_hashes_[4];
  int8_t king_row_[4] = {-1, -1, -1, -1};
  int8_t king_col_[4] = {-1, -1, -1, -1};
  BoardLocation en_passant_targets_[4];  // One for each player color

  size_t move_buffer_size_ = 300;
  Move move_buffer_2_[300];
};

// Helper functions

Team OtherTeam(Team team);
Team GetTeam(PlayerColor color);
Player GetNextPlayer(const Player& player);
Player GetPreviousPlayer(const Player& player);
Player GetPartner(const Player& player);

// Returns the static exchange evaluation of a capture.
int StaticExchangeEvaluationCapture(
    const int piece_evaluations[6],
    Board& board,
    const Move& move);


}  // namespace chess


#endif  // _BOARD_H_

