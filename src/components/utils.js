// utils.js
export const parseEvaluationResult = (evaluationString) => {
  // Example: Extract numerical evaluation and formatted text
  let evaluationText = '';
  let numericalEvaluation = 0;

  if (evaluationString.includes('cp')) {
    numericalEvaluation = parseFloat(evaluationString.split('cp')[1]) / 100; // Convert centipawns to pawns
    evaluationText = `Evaluation: ${numericalEvaluation}`;
  } else if (evaluationString.includes('mate')) {
    numericalEvaluation = evaluationString.includes('mate +')
      ? 50
      : -50; // Assuming mate in few moves gives extreme positive/negative values
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

        
        setArrows(updatedArrows); 
        setIsBestMoveArrowDrawn(false);
      };
      
  