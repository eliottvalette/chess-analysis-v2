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
  const [evaluation, setEvaluation] = useState(''); // Stockfish evaluation text
  const [bestMove, setBestMove] = useState(''); // Stockfish best move
  const [evaluationScore, setEvaluationScore] = useState(50); // Score for evaluation bar

  // Helper function to parse Stockfish evaluation result
  const parseEvaluationResult = (evaluationResult) => {
    const scoreMatch = evaluationResult.match(/score (\w+) (-?\d+)/);
    let evaluationValue = 50; // Start with a neutral evaluation
    let evaluationText = 'Equal';

    if (scoreMatch) {
      const scoreType = scoreMatch[1];
      const scoreValue = parseInt(scoreMatch[2], 10);

      if (scoreType === 'cp') {
        // Clamp centipawn score within range for display
        evaluationValue = Math.max(0, Math.min(100, 50 + scoreValue / 10));
        evaluationText = `${scoreValue} centipawns`;
      } else if (scoreType === 'mate') {
        // Mating scenarios: 100 for white, 0 for black
        evaluationValue = scoreValue > 0 ? 100 : 0;
        evaluationText = scoreValue > 0 ? 'Mate for White' : 'Mate for Black';
      }
    }

    return { evaluationValue, evaluationText };
  };

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
    setEvaluationScore(50); // Reset the evaluation bar to neutral
  };

  const undoMove = () => {
    if (historyIndex > 0) {
      game.undo();
      setHistoryIndex(historyIndex - 1);
      setGame(game);
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
      const newFen = game.fen();
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
          const { evaluationValue, evaluationText } = parseEvaluationResult(data.evaluation);
          setEvaluationScore(evaluationValue);
          setEvaluation(evaluationText);

          const bestMoveMatch = data.evaluation.match(/bestmove (\w+)/);
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
      <div className="main-content">
        {/* Chessboard and Evaluation Bar in the middle */}
        <div className="chess-game">
          <div className="evaluation-bar-container">
            <div className="evaluation-bar">
              {/* Adjust the background dynamically */}
              <div
                className="evaluation-bar-fill"
                style={{
                  height: `${evaluationScore}%`,
                  backgroundColor: evaluationScore > 50 ? 'white' : 'black',
                  top: evaluationScore > 50 ? `${100 - evaluationScore}%` : '0',
                  bottom: evaluationScore <= 50 ? `${evaluationScore}%` : '0',
                }}
              />
            </div>
            <p>{evaluationScore > 50 ? 'White Advantage' : evaluationScore < 50 ? 'Black Advantage' : 'Equal'}</p>
          </div>

          {/* Chessboard */}
          <Chessboard
            position={game.fen()}
            width={400}
            boardOrientation="white"
            onPieceDrop={handlePieceDrop}
            customBoardStyle={{
              borderRadius: '5px',
              boxShadow: '0 5px 15px rgba(0, 0, 0, 0.5)',
              width: '100%',
            }}
            onSquareClick={handlePieceClick}
            customSquareStyles={highlightedSquares}
            className="chessboard"
          />
        </div>
      </div>

      {/* Aside block on the right for player info and evaluation */}
      <aside className="side-info">
        {gameMetadata ? (
          <div className="metadata">
            <input
              className="upload-input"
              type="file"
              accept=".pgn"
              onChange={handlePgnUpload}
            />
            <p><strong>Date:</strong> {gameMetadata.date}</p>
            <p><strong>White:</strong> {gameMetadata.whitePlayer} (<strong>Elo:</strong> {gameMetadata.whiteElo})</p>
            <p><strong>Black:</strong> {gameMetadata.blackPlayer} (<strong>Elo:</strong> {gameMetadata.blackElo})</p>
            <p><strong>Result:</strong> {gameMetadata.result}</p>
          </div>
        ) : (
          <div className="metadata">
            <input
              className="upload-input"
              type="file"
              accept=".pgn"
              onChange={handlePgnUpload}
            />
          </div>
        )}

        {/* Display AI Evaluation */}
        <div className="evaluation">
          <h3>Position Evaluation:</h3>
          {evaluation ? <p>{evaluation}</p> : <p>No evaluation yet.</p>}
          {bestMove && <p><strong>Best move: </strong>{bestMove}</p>}
        </div>

        <div className="controls">
          <button onClick={resetGame}>Reset</button>
          <button onClick={undoMove} disabled={historyIndex === 0}>Undo</button>
          <button onClick={redoMove} disabled={historyIndex === moveHistory.length}>Redo</button>
        </div>
      </aside>
    </div>
  );
};

export default App;
