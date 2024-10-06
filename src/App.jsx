import React, { useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import './App.css';

const App = () => {
  const [game, setGame] = useState(new Chess());
  const [historyIndex, setHistoryIndex] = useState(0);
  const [moveHistory, setMoveHistory] = useState([]);
  const [highlightedSquares, setHighlightedSquares] = useState({});
  const [gameMetadata, setGameMetadata] = useState(null);
  const [evaluation, setEvaluation] = useState(''); // Stockfish evaluation
  const [bestMove, setBestMove] = useState(''); // Stockfish best move
  const [evaluationScore, setEvaluationScore] = useState(50);

  const handlePgnUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target.result;
        const newGame = new Chess();
        newGame.loadPgn(content);
        setGame(newGame);
        setMoveHistory(newGame.history());
        setHistoryIndex(newGame.history().length);
        setGameMetadata(extractMetadata(newGame));
      };
      reader.readAsText(file);
    }
  };

  const extractMetadata = (game) => {
    const headers = game.header();
    return {
      event: headers.Event || 'Unknown',
      site: headers.Site || 'Unknown',
      date: headers.Date || 'Unknown',
      round: headers.Round || 'Unknown',
      whitePlayer: headers.White || 'Unknown',
      whiteElo: headers.WhiteElo || 'Unknown',
      blackPlayer: headers.Black || 'Unknown',
      blackElo: headers.BlackElo || 'Unknown',
      result: headers.Result || 'Unknown',
    };
  };

  const resetGame = () => {
    game.reset();
    setMoveHistory([]);
    setGame(new Chess());
    setHighlightedSquares({});
    setEvaluation(''); // Clear Stockfish evaluation
    setEvaluationScore(50);
  };

  const undoMove = () => {
    if (historyIndex > 0) {
      game.undo();
      setHistoryIndex(historyIndex - 1);
      setGame(game); // Update the state to trigger re-render
    }
  };

  const redoMove = () => {
    if (historyIndex < moveHistory.length) {
      game.move(moveHistory[historyIndex]);
      setHistoryIndex(historyIndex + 1);
      setGame(game);
    }
  };

  const handlePieceDrop = (sourceSquare, targetSquare) => {
    const move = game.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q',
    });

    if (move) {
      const newFen = game.fen(); // Correctly define the FEN here
      setGame(new Chess(newFen));
      setMoveHistory(game.history());
      setHistoryIndex(game.history().length);
      setHighlightedSquares({});

      // Send FEN to Stockfish for evaluation
      fetch('http://localhost:5001/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fen: newFen }),
      })
        .then((res) => res.json())
        .then((data) => {
          console.log('Evaluation result:', data);
          const evaluationResult = data.evaluation;

          // Extract score (cp or mate)
          const scoreMatch = evaluationResult.match(/score (\w+) (-?\d+)/);
          if (scoreMatch) {
            const scoreType = scoreMatch[1]; // 'cp' for centipawns or 'mate'
            const scoreValue = parseInt(scoreMatch[2], 10); // The actual score

            // Convert the score to a value between 0 and 100 for the evaluation bar
            let evaluationValue = 50; // Default neutral value
            if (scoreType === 'cp') {
              // Clamp the value between -500 (Black advantage) and 500 (White advantage)
              evaluationValue = Math.max(0, Math.min(100, 50 + (scoreValue / 10)));
            } else if (scoreType === 'mate') {
              // If it's a mate, show extreme advantage for one side
              evaluationValue = scoreValue > 0 ? 100 : 0; // White mates (100), Black mates (0)
            }

            setEvaluationScore(evaluationValue); // Update evaluation score for the progress bar
            setEvaluation(evaluationValue === 100 ? 'Mate for White' : evaluationValue === 0 ? 'Mate for Black' : `${scoreValue} centipawns`);
          }

          const bestMoveMatch = evaluationResult.match(/bestmove (\w+)/);
          if (bestMoveMatch) {
            setBestMove(bestMoveMatch[1]);
          }
        })
        .catch((error) => {
          console.error('Error evaluating position:', error);
        });

      return true;
    } else {
      console.log('Move is illegal');
      return false;
    }
  };

  const getPossibleMoves = (square) => {
    const moves = game.moves({
      square,
      verbose: true,
    });

    const squaresToHighlight = {};
    moves.forEach((move) => {
      squaresToHighlight[move.to] = {
        background: 'radial-gradient(circle, #ffffff 40%, transparent 50%)',
        borderRadius: '50%',
      };
    });

    setHighlightedSquares(squaresToHighlight);
  };

  const handlePieceClick = (square) => {
    getPossibleMoves(square);
  };

  return (
    <div className="container">
      <h1 className="title">Chess Game Viewer</h1>
      <input
        className="upload-input"
        type="file"
        accept=".pgn"
        onChange={handlePgnUpload}
      />

      {gameMetadata && (
        <div className="metadata">
          <p>
            <strong>Date:</strong> {gameMetadata.date}
          </p>
          <p>
            <strong>White:</strong> {gameMetadata.whitePlayer} (<strong>Elo :</strong> {gameMetadata.whiteElo})
          </p>
          <p>
            <strong>Black:</strong> {gameMetadata.blackPlayer} (<strong>Elo :</strong> {gameMetadata.blackElo})
          </p>
          <p>
            <strong>Result:</strong> {gameMetadata.result}
          </p>
        </div>
      )}
      <div className="chess-game">
        <div className="evaluation-bar-container">
          <div className="evaluation-bar">
            <div
              className="evaluation-bar-fill"
              style={{ height: `${evaluationScore}%`, backgroundColor: evaluationScore > 50 ? 'green' : 'red' }}
            />
          </div>
          <p>{evaluationScore > 50 ? 'White Advantage' : evaluationScore < 50 ? 'Black Advantage' : 'Equal'}</p>
        </div>
        {/* Chessboard */}
        <div className="board-container">
          <Chessboard
            position={game.fen()}
            width={400}
            boardOrientation="white"
            onPieceDrop={handlePieceDrop}
            customBoardStyle={{
              borderRadius: '4px',
              boxShadow: '0 5px 5px rgba(0, 0, 0, 0.5)',
            }}
            onSquareClick={(square) => handlePieceClick(square)}
            customSquareStyles={highlightedSquares}
          />
        </div>
      </div>
      

      {/* Display AI Evaluation */}
      <div className="evaluation">
        <h3>Position Evaluation:</h3>
        {evaluation ? <p>{evaluation}</p> : <p>No evaluation yet.</p>}
        {bestMove && <p><strong>Best move: </strong>{bestMove}</p>}
      </div>

      <div className="controls">
        <button onClick={resetGame}>Reset</button>
        <button onClick={undoMove} disabled={historyIndex === 0}>
          Undo
        </button>
        <button onClick={redoMove} disabled={historyIndex === moveHistory.length}>
          Redo
        </button>
      </div>
    </div>
  );
};

export default App;