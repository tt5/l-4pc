https://en.wikibooks.org/wiki/Four-Player_Chess/Notation

# Long algebraic notation

In long algebraic notation both the origin and destination square are indicated, separated by a hyphen, e.g. Qn8-m9. When the move is a capture, the hyphen is replaced by an x and the letter of the captured piece is also included, e.g. Qg1xQn8+. 

# PGN4

PGN4 is a standard notation for recording a complete four-player chess game, i.e. the moves and related data. The PGN4 consists of tag pairs and movetext. 

## Tag pairs

The tag pairs indicate game related data. The tags start with a left square bracket, followed by the tag name, followed by the tag value in double quotation marks and closed by a right square bracket. At the very least, the 'Variant' tag must be included, to indicate whether the game is a Teams game or a Free-For-All (FFA) game. Common tags are the following:

-   Variant: main variant, i.e. Teams or FFA
-   RuleVariant: one of the many variants on the rules, e.g. king of the hill, N-check, 960, etc.
-   CurrentMove: ply-variation-move, e.g. 5-2-3 means fifth ply, second variation, move three
-   StartFen4: the starting position in FEN4
-   Red: red player name (similarly, Blue, Yellow and Green)
-   RedElo: red player rating (similarly, BlueElo, YellowElo and GreenElo)
-   TimeControl: e.g. 1+15D
-   Date: date and time the game was played
-   Site: location where the game was played, e.g. website, if online
-   Result: 1-0 if Red and Yellow won, 0-1 if Blue and Green won, 1/2-1/2 in case of a draw or player: points for each player, in case of FFA
-   Termination: reason the game ended (e.g. resignation, timeout or simply game over)

Other optional tags are possible.

## Movetext

After the tag pairs the movetext follows, which describes the actual moves of the game. The movetext uses long algebraic notation and includes move number indicators, i.e. the full move number (not quarter-moves) followed by a single period. Moves are separated by two periods. Variations are added in round brackets and comments are inserted in curly brackets. The reason of elimination of a player is included on the player's final turn, i.e. # for checkmate, R for resignation and T for timeout.

## Example PGN4

The following is an example of a game recorded in PGN4:

[GameNr "519084"]
[Result "0-1"]
[Termination "Checkmate. 0-1"]
[Variant "Teams"]
[Red "ClashRoyale12345"]
[RedElo "2204"]
[Blue "MANISPUGO"]
[BlueElo "1528"]
[Yellow "nutsyci"]
[YellowElo "2368"]
[Green "GDII"]
[GreenElo "1857"]
[TimeControl "1+15 delay"]
[Site "www.chess.com/4-player-chess"]
[Date "Wed Nov 28 2018 01:28:10 GMT+0000 (UTC)"]
[CurrentMove "29"]

1. d2-d4 .. b8-c8 .. k13-k11 .. m8-l8
2. d4-d5 .. b4-d4 .. k11-k10 .. Qn8-m8
3. e2-e4 .. Qa7-b8 .. g13-g12 .. Nn5-l6
4. f2-f4 .. Qb8xf4 .. Qh14-f12 .. Nl6-k4
5. i2-i4 .. Qf4xh2+ .. Qf12-b8+ .. Nk4xj2+
6. Kh1xQh2 .. Ba9xQb8+ .. Rk14-k11 .. Qm8xi4
7. g2-g3 .. Bb8xg3+ .. Rk11-j11 .. Qi4-h3+
8. #
