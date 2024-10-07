import React, { useState, useEffect } from 'react';
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
  const [isBestMoveArrowDrawn, setIsBestMoveArrowDrawn] = useState(false); // Track arrow drawing
  const [arrows, setArrows] = useState([]); // Arrows to draw on the chessboard
  const [whitePercentage, setWhitePercentage] = useState(50);
  const [blackPercentage, setBlackPercentage] = useState(50);

  // Helper function to parse Stockfish evaluation result
  const parseEvaluationResult = (evaluationResult) => {
    const scoreMatch = evaluationResult.match(/score (\w+) (-?\d+)/);
    let evaluationText = '';
    let whiteValue = 50;
    let blackValue = 50;
    if (scoreMatch) {
      const scoreType = scoreMatch[1];
      const scoreValue = parseInt(scoreMatch[2], 10);

      if (scoreType === 'cp') {
        if (scoreValue > 0) {
          whiteValue = Math.min(100, 50 + scoreValue / 10); // Advantage for White
          blackValue = 100 - whiteValue;
        } else {
          blackValue = Math.min(100, 50 - scoreValue / 10); // Advantage for Black
          whiteValue = 100 - blackValue;
        }
        evaluationText = `${scoreValue} centipawns`;
      } else if (scoreType === 'mate') {
        if (scoreValue > 0) {
          whiteValue = 100;
          blackValue = 0;
          evaluationText = 'Mate for White';
        } else {
          whiteValue = 0;
          blackValue = 100;
          evaluationText = 'Mate for Black';
        }
      }
    }

    setWhitePercentage(whiteValue);
    setBlackPercentage(blackValue);

    return { evaluationText };
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
        setIsBestMoveArrowDrawn(false); // Reset arrow drawing when loading a new game
        setArrows([]); // Clear arrows when loading a new game
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
    setEvaluation('');
    setWhitePercentage(50);
    setBlackPercentage(50);
    setIsBestMoveArrowDrawn(false);
    setArrows([]);
  };

  const undoMove = () => {
    if (historyIndex > 0) {
      game.undo();
      setHistoryIndex(historyIndex - 1);
      setGame(game);
      setIsBestMoveArrowDrawn(false); // Reset arrow drawing when undoing
      setArrows([]);
    }
  };

  const redoMove = () => {
    if (historyIndex < moveHistory.length) {
      game.move(moveHistory[historyIndex]);
      setHistoryIndex(historyIndex + 1);
      setGame(game);
      setIsBestMoveArrowDrawn(false); // Reset arrow drawing when redoing
      setArrows([]);
    }
  };

  const drawBestMoveArrow = () => {
    // Draw the best move arrow if it hasn't been drawn yet
    if (!isBestMoveArrowDrawn && bestMove) {
      const from = bestMove.slice(0, 2); // Extract 'e2'
      const to = bestMove.slice(2, 4);   // Extract 'e4'
      setArrows([[from, to]]); // Format for react-chessboard: [['e2', 'e4']]
      setIsBestMoveArrowDrawn(true);
    }
  };  

  // Real-time evaluation
  useEffect(() => {
    if (!isBestMoveArrowDrawn) {
      // Trigger best move arrow drawing when not already drawn
      drawBestMoveArrow();
    }
  }, [bestMove]);

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
      setIsBestMoveArrowDrawn(false); // Reset arrow drawing after every move
  
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
          console.log('Evaluation result:', data); // Debug output
  
          // Use the parseEvaluationResult function to handle the evaluation result
          const { evaluationText } = parseEvaluationResult(data.evaluation);
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
  console.log(arrows);

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
              <div
                className="evaluation-bar-black"
                style={{ height: `${blackPercentage}%`, backgroundColor: 'black' }}
              />
              <div
                className="evaluation-bar-white"
                style={{ height: `${whitePercentage}%`, backgroundColor: 'white' }}
              />
            </div>
            <p>{evaluation}</p>
          </div>

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
            arrows={arrows}
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
