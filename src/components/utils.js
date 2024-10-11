// utils.js

export const parseEvaluationResult = (evaluationString) => {
  // evaluationString respect the following format :info depth 15 seldepth 25 multipv 1 score cp 28 nodes 82930 nps 552866 hashfull 28 tbhits 0 time 150 pv e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 d7d6 c2c4 g7g6 c1e3 f8g7 h2h3 c6d4 e3d4 e7e5 d4c3 g8f6 bestmove e2e4 ponder c7c5
  console.log(evaluationString)
  let evaluationText = '';
  let numericalEvaluation = 0;

  if (evaluationString.includes('cp')) {
    numericalEvaluation = parseFloat(evaluationString.split('cp')[1]) / 100; // Convert centipawns to pawns, which is the unit used by Stockfish for evaluation
    evaluationText = `Evaluation: ${numericalEvaluation}`;
  } else if (evaluationString.includes('mate')) {
    numericalEvaluation = evaluationString.includes('mate + ') 
      ? 20
      : -20; // Assuming mate in few moves gives extreme positive/negative values
    evaluationText = `Mate in ${Math.abs(parseInt(evaluationString.split('mate ')[1]))}`;
  }

  return { evaluationText, numericalEvaluation };
};
  
export const extractMetadata = (game) => {
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

    export const drawBestMoveArrow = (bestMove, setArrows, setIsBestMoveArrowDrawn, color, arrows) => {
        const from = bestMove.slice(0, 2);
        const to = bestMove.slice(2, 4);
        const uniqueKey = `${from}-${to}-${Date.now()}`;
      
        const updatedArrows = arrows.length === 0 
            ? [[from, to, color, uniqueKey]] // Init the first arrow
    : [[arrows.slice(-1)[0][0], arrows.slice(-1)[0][1], 'green', `${arrows.slice(-1)[0][0]}-${arrows.slice(-1)[0][1]}`], [from, to, color, uniqueKey]];
      // complex syntax just for getting a unique key for each arrow
        
        setArrows(updatedArrows); 
        setIsBestMoveArrowDrawn(false);
      };

export const graphOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      title: {
        display: true,
        text: 'Move Index',
      },
    },
    y: {
      title: {
        display: true,
        text: 'Evaluation (White Advantage)',
      },
    },
  },
};