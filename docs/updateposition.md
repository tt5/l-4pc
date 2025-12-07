When we are not moving from the last actual position we have to update the whole position. But that would create many move events because every basepoint update is treated as a move event

endpoint to change the whole position.

send the move number to basepoint patch endpoint. And branch number.

Make a branch number in the ui.

updateBasePoint(1, 5, 7, 3)  // Sends { x: 5, y: 7, moveNumber: 3 }

updateBasePoint(1, 5, 7)     // Sends { x: 5, y: 7 }