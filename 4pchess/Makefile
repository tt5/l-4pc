# Compiler and flags
CXX := g++
CXXFLAGS := -pthread -Wall -Wextra -O3 -std=c++20

# Source files
SRC_DIR := .
SRCS := $(wildcard $(SRC_DIR)/*.cc)
OBJS := $(SRCS:.cc=.o)
TARGET := cli

# Default target
all: $(TARGET)

# Link the executable
$(TARGET): $(OBJS)
	$(CXX) $(CXXFLAGS) -o $@ $^

# Compile source files to object files
%.o: %.cc
	$(CXX) $(CXXFLAGS) -c -o $@ $<

# Clean up
clean:
	rm -f $(TARGET) $(OBJS)

.PHONY: all clean
