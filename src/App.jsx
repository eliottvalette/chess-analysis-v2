import React, { useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
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
  const [previousBestMove, setPreviousBestMove] = useState('');
  const [ispreviousBestMoveArrowDrawn, setIsPreviousBestMoveArrowDrawn] = useState(false);
  const [arrows, setArrows] = useState([]); 
  const [whitePercentage, setWhitePercentage] = useState(50);
  const [blackPercentage, setBlackPercentage] = useState(50);

  const evaluateGame = (fen) => {
    // Send FEN to Stockfish for evaluation
    fetch('http://localhost:5001/evaluate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fen }),
    })
      .then((res) => res.json())
      .then((data) => {
        const { evaluationText } = parseEvaluationResult(data.evaluation);
        setEvaluation(evaluationText);

        const bestMoveMatch = data.evaluation.match(/bestmove (\w+)/);
        if (bestMoveMatch) {
          setBestMove(bestMoveMatch[1]);
          drawBestMoveArrow(bestMoveMatch[1], setArrows, setIsBestMoveArrowDrawn, 'red', arrows);
        }
      })
      .catch((error) => {
        console.error('Error evaluating position:', error);
      });
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
        setIsBestMoveArrowDrawn(false);
        setArrows([]);

        evaluateGame(newGame.fen());
      };
      reader.readAsText(file);
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

  const undoMove = () => {
    if (historyIndex > 0) {
      game.undo();
      setHistoryIndex(historyIndex - 1);
      setGame(game);
      setIsBestMoveArrowDrawn(false);
      setIsPreviousBestMoveArrowDrawn(false);
      setArrows([]);

      evaluateGame(game.fen());
    }
  };

  const redoMove = () => {
    if (historyIndex < moveHistory.length) {
      game.move(moveHistory[historyIndex]);
      setHistoryIndex(historyIndex + 1);
      setGame(game);
      setIsBestMoveArrowDrawn(false); 
      setIsPreviousBestMoveArrowDrawn(false);
      setArrows([]);

      evaluateGame(game.fen());
    }
  };

  useEffect(() => {
    if (bestMove && !isBestMoveArrowDrawn) {
      drawBestMoveArrow(bestMove, setArrows, setIsBestMoveArrowDrawn, 'red', arrows);
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
  
      setMoveHistory([...moveHistory, move.san]);
      setGame(new Chess(newFen));
      setHistoryIndex(historyIndex + 1);
      setHighlightedSquares({});
      setIsBestMoveArrowDrawn(false);
  
      fetch('http://localhost:5001/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fen: newFen }),
      })
        .then((res) => res.json())
        .then((data) => {
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
            customArrows={arrows} // Ensure unique arrows are passed
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
          <button onClick={resetGame}>Reset</button>
          <button onClick={undoMove} disabled={historyIndex === 0}>Undo</button>
          <button onClick={redoMove} disabled={historyIndex === moveHistory.length}>Redo</button>
        </div>
      </aside>
    </div>
  );
};

export default App;
