import React, { useState, useEffect, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);
import { Line } from 'react-chartjs-2';
import './App.css';
import { parseEvaluationResult, extractMetadata, drawBestMoveArrow, graphOptions } from './components/utils';



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
  const [evaluationsArray, setEvaluationsArray] = useState([]);
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [
      {
        label: 'Evaluation',
        data: [],
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        backgroundColor: '#FFFFFF',
      },
    ],
  });

  const evaluateGame = async (fen) => {
    try {
      // Send FEN to Stockfish for evaluation
      const response = await fetch('http://localhost:5001/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fen }),
      })
      const data = await response.json();
      const { evaluationText, numericalEvaluation } = parseEvaluationResult(data.evaluation); // see utils
      setEvaluation(evaluationText);
      if (numericalEvaluation !== null) {
        const objectiveNumericalEvaluation = evaluationsArray.length % 2 === 0 ? numericalEvaluation : -numericalEvaluation;
        setEvaluationsArray((prevEvaluations) => {
          // Check if the current evaluation is already added to prevent double entry (which is an unexpected behavior)
          if (prevEvaluations[prevEvaluations.length - 1] === objectiveNumericalEvaluation) {
            return prevEvaluations; // Skip adding if it is the same as the last value
          }
          return [...prevEvaluations, objectiveNumericalEvaluation];
        });
      } else {
        setEvaluationsArray((prevEvaluations) => [...prevEvaluations, 0]);
      }

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
    } catch (error) {
      console.error('Error evaluating position:', error);
    };
    ;
  };

  const handlePgnUpload = async (event) => {
    const file = event.target.files[0]; // Get the first file selected by the user
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
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
        // Clear previous evaluations and evaluate the moves
        setEvaluationsArray([]);
        let gameForEvaluation = new Chess();

        for (const move of newGame.history()) {
          gameForEvaluation.move(move);
          const fen = gameForEvaluation.fen();
          evaluateGame(fen); // Wait for each evaluation to complete
        }
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

  useEffect(() => {
    if (evaluationsArray.length > 0) {
      setChartData({
        labels: evaluationsArray.map((_, index) => index + 1),
        datasets: [
          {
            label: 'Evaluation',
            data: evaluationsArray,
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 2,
            fill: false,
          },
        ],
      });
    }
    console.log(evaluationsArray)
  }, [evaluationsArray]);

  return (
    <div className="container">
    {/* Left-side block for buttons */}
    <aside className="left-side-buttons">
      <div className="controls">
        <button className="reset" onClick={resetGame}>Reset</button>
        <button className="undo" onClick={undoMove} disabled={historyIndex === 0}>Undo</button>
        <button className="redo" onClick={redoMove} disabled={historyIndex === moveHistory.length}>Redo</button>
        <button className="play-best" onClick={playBestMove} disabled={!bestMove}>Play Best Move</button>
        <button className="flip" onClick={handleOrientationChange}>Flip the Board</button>
        <button className="arrow-display" onClick={handleArrowToggle}> {displayArrows ? "Hide Arrows" : "Show Arrows"} </button>
      </div>
    </aside>

    {/* Main Content in the center */}
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

    {/* Right Aside block for player info and evaluation */}
    <aside className="right-side-info">
      <div className="chart-wrapper">
        <Line className='evaluation-graph' data={chartData} options={graphOptions} />
      </div>
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
          <p className='date'><strong>Date:</strong> {gameMetadata.date}</p>
          <p className='white'><strong>White:</strong> {gameMetadata.whitePlayer} (<strong>Elo:</strong> {gameMetadata.whiteElo})</p>
          <p className='black'><strong>Black:</strong> {gameMetadata.blackPlayer} (<strong>Elo:</strong> {gameMetadata.blackElo})</p>
          <p className='result'><strong>Result:</strong> {gameMetadata.result}</p>
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

    </aside>
  </div>
  );
};

export default App;
