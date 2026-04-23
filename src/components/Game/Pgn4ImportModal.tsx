import { createSignal, Show } from 'solid-js';
import { parsePgn4ToMoves } from '~/utils/pgn4Import';
import { updateMove } from '~/utils/boardUtils';
import { useAuth } from '~/contexts/AuthContext';

interface Pgn4ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (gameId: string) => void;
}

export default function Pgn4ImportModal(props: Pgn4ImportModalProps) {
  const { getToken } = useAuth();
  const [pgn4Text, setPgn4Text] = createSignal('');
  const [error, setError] = createSignal('');
  const [success, setSuccess] = createSignal('');
  const [isImporting, setIsImporting] = createSignal(false);
  const [newGameId, setNewGameId] = createSignal('');

  const handleImport = async () => {
    const text = pgn4Text().trim();
    if (!text) {
      setError('Please enter PGN4 text');
      return;
    }

    setError('');
    setSuccess('');
    setIsImporting(true);

    try {
      // Parse PGN4 text to get moves
      const result = parsePgn4ToMoves(text);
      const token = getToken();

      if (!token) {
        throw new Error('Not authenticated');
      }

      // Import each move sequentially
      for (const move of result.moves) {
        const response = await updateMove(
          move.pieceType as any,
          move.toX,
          move.toY,
          move.moveNumber,
          'main',
          false,
          result.gameId,
          move.fromX,
          move.fromY,
          token
        );

        if (!response.success) {
          throw new Error(response.error || 'Failed to import move');
        }
      }

      // Success
      setNewGameId(result.gameId);
      setSuccess(`Successfully imported ${result.moves.length} moves to game ${result.gameId}`);
      setPgn4Text('');
      
      // Notify parent
      props.onImportSuccess(result.gameId);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import PGN4');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setPgn4Text('');
    setError('');
    setSuccess('');
    setNewGameId('');
    props.onClose();
  };

  return (
    <Show when={props.isOpen}>
      <div style={{
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        'background-color': 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'z-index': '1000'
      }}>
        <div style={{
          'background-color': 'white',
          padding: '20px',
          'border-radius': '8px',
          'max-width': '600px',
          width: '90%',
          'max-height': '80vh',
          'overflow-y': 'auto'
        }}>
          <h2>Import PGN4 Game</h2>
          
          <textarea
            value={pgn4Text()}
            onInput={(e) => setPgn4Text(e.currentTarget.value)}
            placeholder="Paste PGN4 text here..."
            style={{
              width: '100%',
              height: '300px',
              'font-family': 'monospace',
              padding: '10px',
              'margin-bottom': '10px',
              'border': '1px solid #ccc',
              'border-radius': '4px'
            }}
            disabled={isImporting()}
          />

          <Show when={error()}>
            <div style={{
              color: 'red',
              'margin-bottom': '10px',
              padding: '10px',
              'background-color': '#fee',
              'border-radius': '4px'
            }}>
              {error()}
            </div>
          </Show>

          <Show when={success()}>
            <div style={{
              color: 'green',
              'margin-bottom': '10px',
              padding: '10px',
              'background-color': '#efe',
              'border-radius': '4px'
            }}>
              {success()}
            </div>
          </Show>

          <div style={{
            display: 'flex',
            gap: '10px',
            'justify-content': 'flex-end'
          }}>
            <button
              onClick={handleClose}
              disabled={isImporting()}
              style={{
                padding: '8px 16px',
                'border-radius': '4px',
                border: '1px solid #ccc',
                'background-color': '#f0f0f0',
                cursor: isImporting() ? 'not-allowed' : 'pointer'
              }}
            >
              {success() ? 'Close' : 'Cancel'}
            </button>
            <Show when={!success()}>
              <button
                onClick={handleImport}
                disabled={isImporting()}
                style={{
                  padding: '8px 16px',
                  'border-radius': '4px',
                  border: 'none',
                  'background-color': isImporting() ? '#ccc' : '#4CAF50',
                  color: 'white',
                  cursor: isImporting() ? 'not-allowed' : 'pointer'
                }}
              >
                {isImporting() ? 'Importing...' : 'Import'}
              </button>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
