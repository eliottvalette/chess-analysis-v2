import React, { useState, useEffect, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);
import { Line } from 'react-chartjs-2';
import './App.css';
import { parseEvaluationResult, extractMetadata, drawBestMoveArrow } from './components/utils';



const App = () => {
  const [game, setGame] = useState(new Chess());
  const [historyIndex, setHistoryIndex] = useState(0);
  const [moveHistory, setMoveHistory] = useState([]);
  const [highlightedSquares, setHighlightedSquares] = useState({});
  const [gameMetadata, setGameMetadata] = useState(null);
  const [evaluation, setEvaluation] = useState(''); 
  const [bestMove, setBestMove] = useState(''); 
  const [isBestMoveArrowDrawn, setIsBestMoveArrowDrawn] = useState(false);
  const [arrows, setArrows] = useState([]); 
  const [whitePercentage, setWhitePercentage] = useState(50);
  const [blackPercentage, setBlackPercentage] = useState(50);
  const [fileName, setFileName] = useState('No file selected')
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [orientation, setOrientation] = useState('white');
  const [displayArrows, setDisplayArrows] = useState(true);
  const [evaluations, setEvaluations] = useState([]);

  const evaluateGame = (fen) => {
    // Send FEN to Stockfish for evaluation
    fetch('http://localhost:5001/evaluate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fen }),
    })
      .then((res) => res.json()) // JSONified response
      .then((data) => {
        const { evaluationText, numericalEvaluation } = parseEvaluationResult(data.evaluation); // see utils
        setEvaluation(evaluationText);
  
        const bestMoveMatch = data.evaluation.match(/bestmove (\w+)/);
        if (bestMoveMatch) {
          setBestMove(bestMoveMatch[1]); // extract best move that is returned by Stockfish
        }
  
        // Update the evaluation bar based on the numerical evaluation
        if (numericalEvaluation !== null) {
          if (numericalEvaluation > 0) {
            setWhitePercentage(50 + Math.min(numericalEvaluation, 50));
            setBlackPercentage(50 - Math.min(numericalEvaluation, 50));
          } else {
            setWhitePercentage(50 + Math.max(numericalEvaluation, -50));
            setBlackPercentage(50 - Math.max(numericalEvaluation, -50));
          }
        } else {
          setWhitePercentage(50);
          setBlackPercentage(50);
        }
      })
      .catch((error) => {
        console.error('Error evaluating position:', error);
      });
  };
  

  const handlePgnUpload = (event) => {
    const file = event.target.files[0]; // Get the first file selected by the user
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target.result; 
        const newGame = new Chess();
        newGame.loadPgn(content); // Load the PGN content to initialize the game
        setGame(newGame); //  The current game is now the newGame
        setMoveHistory(newGame.history());
        setHistoryIndex(newGame.history().length);

        setGameMetadata(extractMetadata(newGame));
        setIsBestMoveArrowDrawn(false);
        setArrows([]);

        evaluateGame(newGame.fen());
      };
      reader.readAsText(file);
      setFileName(event.target.files[0]?.name || 'No file selected');
    }
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

    evaluateGame(game.fen());
  };

  const redoMove = useCallback(() => {
    if (historyIndex < moveHistory.length) {
      game.move(moveHistory[historyIndex]);
      setHistoryIndex(historyIndex + 1);
      setGame(game);
      setIsBestMoveArrowDrawn(false);
      setArrows([]);
  
      evaluateGame(game.fen());
    }
  }, [historyIndex, moveHistory, game]);
  
  const undoMove = useCallback(() => {
    if (historyIndex > 0) {
      const newHistoryIndex = historyIndex - 1;
      const newGame = new Chess();
      const movesToPlay = moveHistory.slice(0, newHistoryIndex);
      movesToPlay.forEach((move) => newGame.move(move));
      setGame(newGame);
      setHistoryIndex(newHistoryIndex);
      setIsBestMoveArrowDrawn(false);
      setArrows([]);
      evaluateGame(newGame.fen());
    }
  }, [historyIndex, moveHistory]);  

  useEffect(() => {
    if (bestMove && !isBestMoveArrowDrawn) {
      drawBestMoveArrow(bestMove, setArrows, setIsBestMoveArrowDrawn, 'red', arrows);
    }
  }, [bestMove]);

  const handlePieceDrop = (sourceSquare, targetSquare) => {
    const newGame = new Chess(game.fen()); // Create a new game to not alter the current game
    const move = newGame.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q', // Always promote to a queen
    });
    setSelectedSquare(null);

    if (move) { // move is a truthy value if it's legal
      const newFen = newGame.fen(); // .fen() returns the FEN representation of the current position
  
      setMoveHistory([...moveHistory, move.san]); // Update the move history and apply the move
      setGame(newGame); // Update the game state with the move applied
      setHistoryIndex(historyIndex + 1);
      setHighlightedSquares({});
      setIsBestMoveArrowDrawn(false);
      evaluateGame(newFen);
      return true;
    } else {
      console.log('Move is illegal');
      return false;
    }
  };
  

  const handlePieceClick = (square) => {
    // Same process but for clicking on a square
    let newSelectedSquare = selectedSquare;
  
    if (selectedSquare) { // If a square with a piece (not necesseraly movable) on it is selected
      const newGame = new Chess(game.fen());
      const move = newGame.move({
        from: selectedSquare,
        to: square,
        promotion: 'q',
      });

      if (move) { // process the move from the selected square to the new one if it's legal
        setMoveHistory([...moveHistory, move.san]);
        setGame(newGame);
        setHistoryIndex(historyIndex + 1);
        setHighlightedSquares({});
        setIsBestMoveArrowDrawn(false);
        evaluateGame(newGame.fen());        
      } else {
        setHighlightedSquares({});
      }

      newSelectedSquare = null; // reset selection
      setSelectedSquare(newSelectedSquare);

      return true;

    } else {
      const piece = game.get(square);
      if (piece) {
        newSelectedSquare = square;
        setSelectedSquare(newSelectedSquare);
        getPossibleMoves(square, piece); // Display possible moves on the board for that piece
      }
    }
  };

  useEffect(() => {
    evaluateGame(game.fen());
  }, [game.fen()]); //  Always evaluate the game for the current position
  
  

  const getPossibleMoves = (square, piece) => {
    const moves = game.moves({
      square,
      verbose: true,
    });

    const squaresToHighlight = {};
    moves.forEach((move) => {
      squaresToHighlight[move.to] = {
        background: `radial-gradient(circle, ${piece.color ==='w' ? '#ffffff' : '#000000'} 20%, transparent 25%)`,
        borderRadius: '50%',
      };
    });

    setHighlightedSquares(squaresToHighlight);
  }; // Highlight the possible moves for a movable piece

  const playBestMove = () => {

    if (bestMove) {
      const from = bestMove.slice(0, 2);
      const to = bestMove.slice(2, 4);
  
      const move = game.move({ from, to });
      if (move) {
        const newFen = game.fen();
  
        setMoveHistory([...moveHistory, move.san]);
        setGame(new Chess(newFen));
        setHistoryIndex(historyIndex + 1);
        setHighlightedSquares({});
        setIsBestMoveArrowDrawn(false);
  
        evaluateGame(newFen);
      } else {
        console.log('Best move is illegal or not possible.');
      }
    }
  };

  const handleOrientationChange = () => {
    setOrientation(orientation === 'white'? 'black' : 'white');
  };

  const handleArrowToggle = () => {
    setDisplayArrows(!displayArrows);
  };

  const handleRightClick = () => {
    setSelectedSquare(null);
    setHighlightedSquares({}); // Clear the possible moves highlights
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key;
      if (key === 'ArrowRight') {
        redoMove();
      } else if (key === 'ArrowLeft') {
        undoMove();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [redoMove, undoMove]);

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
            boardOrientation={orientation}
            onPieceDrop={handlePieceDrop}
            customBoardStyle={{
              borderRadius: '5px',
              boxShadow: '0 5px 15px rgba(0, 0, 0, 0.5)',
              width: '100%',
            }}
            onSquareClick={handlePieceClick}
            onSquareRightClick={handleRightClick}
            customSquareStyles={highlightedSquares}
            customArrows={displayArrows ? arrows : []} // Ensure unique arrows are passed
            className="chessboard"
            animationDuration={150}
            showBoardNotation={true}
          />
        </div>
      </div>

      {/* Aside block on the right for player info and evaluation */}
      <aside className="side-info">
        <Line data={data} options={options} />
        {gameMetadata ? (
          <div className="metadata">
            <input
              className="upload-input"
              type="file"
              accept=".pgn"
              id="fileUpload"
              onChange={handlePgnUpload}
            />

            <label className="custom-upload-button" htmlFor="fileUpload">
              Upload PGN
            </label>
            <p id="fileNameDisplay">{fileName}</p>
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
              id="fileUpload"
              onChange={handlePgnUpload}
            />
            <label className="custom-upload-button" htmlFor="fileUpload">
              Upload PGN
            </label>
            <p id="fileNameDisplay">{fileName}</p>
          </div>
        )}
        {/* Display Move History */}
        <div className="move-history">
          <h3>Move History</h3>
          <ul>
            {moveHistory.map((move, index) => (
              <li key={index} className={`move-item ${index === historyIndex ? 'current-move' : ''} ${index % 4 <=1 ? 'even-line' : 'odd-line'}`}>
                {index % 2 === 0 ? `${index / 2 + 1}. ${move}` : `  ${move}`}
              </li>
            ))}
          </ul>
        </div>

        {/* Display AI Evaluation */}
        <div className="evaluation">
          <h3>Position Evaluation:</h3>
          {evaluation ? <p>{evaluation}</p> : <p>No evaluation yet.</p>}
          {bestMove && <p><strong>Best move: </strong>{bestMove}</p>}
        </div>

        <div className="controls">
          <button className = "reset" onClick={resetGame}>Reset</button>
          <button className = "undo" onClick={undoMove} disabled={historyIndex === 0}>Undo</button>
          <button className = "redo" onClick={redoMove} disabled={historyIndex === moveHistory.length}>Redo</button>
          <button className = "play-best" onClick={playBestMove} disabled={!bestMove}>Play Best Move</button>
          <button className = "flip" onClick={handleOrientationChange} >Flip the Board</button>
          <button className = "arrow-display" onClick={handleArrowToggle} > {displayArrows ? "Hide Arrows" : "Show arrows"} </button>
        </div>

      </aside>
    </div>
  );
};

export default App;
