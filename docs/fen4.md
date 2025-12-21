FEN4 is a standard notation for describing a particular four-player chess board position. It can be used to start a game from a specific position. The FEN4 consists of seven parts, separated by a hyphen:

    Player to move, indicated by a capital letter (R, B, Y or G)
    Player eliminated (comma-separated, 0/1)
    Castling availability kingside (comma-separated, 0/1)
    Castling availability queenside (comma-separated, 0/1)
    Points (comma-separated)
    Halfmove clock. This is the number of halfmoves since the last capture or pawn advance. This is used to determine if a draw can be claimed under the fifty-move rule
    Piece placement from Red's perspective. Starting from the 14th rank and going back to the first rank, each rank is described by a comma-separated line indicating the occupation of the squares within that rank from the a-file to the n-file. Pieces are identified using algebraic notation (with P = pawn) and the colour of the pieces is indicated by prepending a lowercase r, b, y or g, for red, blue, yellow and green, respectively. The number of empty squares between occupied squares is noted using digits 1-14. The ranks are separated by a forward slash and the 3x3 corners of the 14x14 board are counted as empty squares.

Starting position

The normal starting position in FEN4 is as follows:

R-0,0,0,0-1,1,1,1-1,1,1,1-0,0,0,0-0-
3,yR,yN,yB,yK,yQ,yB,yN,yR,3/
3,yP,yP,yP,yP,yP,yP,yP,yP,3/
14/
bR,bP,10,gP,gR/
bN,bP,10,gP,gN/
bB,bP,10,gP,gB/
bK,bP,10,gP,gQ/
bQ,bP,10,gP,gK/
bB,bP,10,gP,gB/
bN,bP,10,gP,gN/
bR,bP,10,gP,gR/
14/
3,rP,rP,rP,rP,rP,rP,rP,rP,3/
3,rR,rN,rB,rQ,rK,rB,rN,rR,3
