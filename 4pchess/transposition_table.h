#ifndef _TRANSPOSITION_TABLE_H_
#define _TRANSPOSITION_TABLE_H_

#include <atomic>
#include <cstdint>
#include <memory>
#include <optional>

#include "board.h"

namespace chess {

constexpr int value_none_tt = -119988;

enum ScoreBound {
  EXACT = 0, LOWER_BOUND = 1, UPPER_BOUND = 2,
};

struct HashTableEntry {
  int64_t key;
  uint32_t packed_move;  // Packed move representation (0 = no move)
  int depth;
  int score;
  int eval;
  ScoreBound bound;
  bool is_pv;
  uint8_t generation;
};

class TranspositionTable {
 public:
   TranspositionTable(size_t table_size);

   const HashTableEntry* Get(int64_t key);
   void Save(int64_t key, int depth, std::optional<Move> move,
             int score, int eval, ScoreBound bound, bool is_pv);
   void NewSearch();

  ~TranspositionTable() {
    if (hash_table_ != nullptr) {
      free(hash_table_);
    }
  }

 private:
  HashTableEntry* hash_table_ = nullptr;
  size_t table_size_ = 0;
  uint8_t generation_ = 0;
};


}  // namespace chess

#endif  // _TRANSPOSITION_TABLE_H_