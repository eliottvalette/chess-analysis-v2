// utils.js
export const parseEvaluationResult = (evaluationResult) => {
    const scoreMatch = evaluationResult.match(/score (\w+) (-?\d+)/);
    let evaluationText = '';
    let whiteValue = 50;
    let blackValue = 50;
    
    if (scoreMatch) {
      const scoreType = scoreMatch[1];
      const scoreValue = parseInt(scoreMatch[2], 10);
  
      if (scoreType === 'cp') {
        if (scoreValue > 0) {
          whiteValue = Math.min(100, 50 + scoreValue / 10);
          blackValue = 100 - whiteValue;
        } else {
          blackValue = Math.min(100, 50 - scoreValue / 10);
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
  
    return { evaluationText, whiteValue, blackValue };
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
      
  