Analyse 4 player chess games.

`npm run dev`

``` bash
cd 4pchess
make -B cli
cp cli ..
```

# Limitations

- no en passant promotion
- no en passant double capture
- can still castle if rook moved away and back to initial square
- no underpromotion
- first king capture always wins

# TODO

- [ ] client promotion
- [ ] rotate board
- [ ] promote branch
- [ ] keyboard controls