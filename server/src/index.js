import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

const app = express();
const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tetris';

app.use(cors());
app.use(express.json());

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const scoreSchema = new mongoose.Schema({
  name: { type: String, default: 'Anonymous', maxlength: 20 },
  score: { type: Number, required: true },
  level: Number,
  lines: Number,
  date: { type: Date, default: Date.now },
});

const Score = mongoose.model('Score', scoreSchema);

app.get('/api/scores', async (_req, res) => {
  try {
    const scores = await Score.find().sort({ score: -1 }).limit(10);
    res.json(scores);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scores' });
  }
});

app.post('/api/scores', async (req, res) => {
  try {
    const { name, score, level, lines } = req.body;
    const s = await Score.create({ name: name || 'Anonymous', score, level, lines });
    res.status(201).json(s);
  } catch (err) {
    res.status(400).json({ error: 'Invalid data' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
