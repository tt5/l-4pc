#include <cassert>
#include <optional>
#include <iostream>

#include "transposition_table.h"

namespace chess {

TranspositionTable::TranspositionTable(size_t table_size) {
  assert((table_size > 0) && "transposition table_size = 0");
  // Round up to next power of 2 for bitmask hashing
  table_size_ = 1;
  while (table_size_ < table_size) {
    table_size_ <<= 1;
  }
  hash_table_ = (HashTableEntry*) malloc(table_size_ * sizeof(HashTableEntry));
  assert(
      (hash_table_ != nullptr) && 
      "Can't create transposition table. Try using a smaller size.");
}

const HashTableEntry* TranspositionTable::Get(int64_t key) {
  size_t n = key & (table_size_ - 1);
  HashTableEntry* entry = hash_table_ + n;
  if (entry->key == key) {
    return entry;
  }
  return nullptr;
}

void TranspositionTable::Save(
    int64_t key, int depth, std::optional<Move> move, int score, int eval,
    ScoreBound bound, bool is_pv) {
  size_t n = key & (table_size_ - 1);
  HashTableEntry& entry = hash_table_[n];
  if (bound == EXACT
      || entry.key != key
      || entry.depth <= depth
      || entry.generation != generation_) { // Replace old generation entries
    entry.key = key;
    entry.depth = depth;
    if (move.has_value()) {
      entry.packed_move = move->Pack();
    } else {
      entry.packed_move = 0;  // 0 means no move
    }
    entry.score = score;
    entry.eval = eval;
    entry.bound = bound;
    entry.is_pv = is_pv;
    entry.generation = generation_;
  }
}

void TranspositionTable::NewSearch() {
  generation_++;
}

void TranspositionTable::Merge(const TranspositionTable& source) {
  // Iterate through all entries in source table
  for (size_t i = 0; i < source.table_size_; i++) {
    const HashTableEntry& src_entry = source.hash_table_[i];
    // Only merge valid entries (non-zero key indicates valid entry)
    if (src_entry.key != 0) {
      size_t n = src_entry.key & (table_size_ - 1);
      HashTableEntry& entry = hash_table_[n];
      // Use the same replacement logic as Save
      if (src_entry.bound == EXACT
          || entry.key != src_entry.key
          || entry.depth <= src_entry.depth
          || entry.generation != generation_) {
        entry.key = src_entry.key;
        entry.depth = src_entry.depth;
        entry.packed_move = src_entry.packed_move;
        entry.score = src_entry.score;
        entry.eval = src_entry.eval;
        entry.bound = src_entry.bound;
        entry.is_pv = src_entry.is_pv;
        entry.generation = generation_;
      }
    }
  }
}

}  // namespace chess