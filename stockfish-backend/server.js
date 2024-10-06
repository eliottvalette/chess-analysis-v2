const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');  // Import CORS

const app = express();

// Enable CORS for all routes
app.use(cors());

// Enable parsing of JSON bodies
app.use(express.json());

// Endpoint to send FEN to Stockfish and get evaluation
app.post('/evaluate', (req, res) => {
  const { fen } = req.body;

  const stockfish = spawn('stockfish'); // Assuming stockfish is in PATH
  stockfish.stdin.write('uci\n');

  stockfish.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('uciok')) {
      stockfish.stdin.write(`position fen ${fen}\n`);
      stockfish.stdin.write('go depth 15\n');
    }

    if (output.includes('bestmove')) {
      stockfish.kill(); // Stop Stockfish after evaluation
      res.json({ evaluation: output });
    }
  });

  stockfish.stderr.on('data', (data) => {
    console.error(`Error: ${data}`);
  });
});

const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});