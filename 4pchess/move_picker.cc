#include "move_picker.h"

#include <algorithm>
#include <iostream>

namespace chess {

enum Stage {
  PV_MOVE = 0,
  GOOD_CAPTURE = 1,
  KILLER = 2,
  BAD_CAPTURE = 3,
  QUIET = 4,
};

}  // namespace chess