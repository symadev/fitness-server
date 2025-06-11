// ===== IMPORTS =====
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());

// ===== MONGODB CONFIG =====
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cn4mz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ===== JWT MIDDLEWARES =====
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).send({ message: 'Unauthorized access' });

  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.status(401).send({ message: 'Unauthorized access' });
    req.decoded = decoded;
    next();
  });
};

// ===== MAIN FUNCTION =====
async function run() {
  try {
    await client.connect();
    const db = client.db("Smartfit");
    const userCollection = db.collection("user");
    const workoutCollection = db.collection("workouts");


    // ===== VERIFY ADMIN MIDDLEWARE =====
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await userCollection.findOne({ email });
      if (!user || user.role !== 'admin') {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      next();
    };

    // ===== ROUTES =====

    // JWT Token
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    });

    // Root Route
    app.get('/', (req, res) => {
      res.send('SmartFit Server Running');
    });

    // AI Chat API
    app.post('/api/ai', async (req, res) => {
      const prompt = req.body.prompt;
      if (!prompt) return res.status(400).json({ message: "Prompt is required" });

      try {
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        const generatedText = response.data.choices[0]?.message?.content || "No response from model";
        res.json({ message: generatedText });
      } catch (error) {
        res.status(500).json({ message: "Failed to get AI response" });
      }
    });

    // Create user for login/register
    app.post('/user', async (req, res) => {
      const user = req.body;
      const existingUser = await userCollection.findOne({ email: user.email });
      if (existingUser) {
        return res.send({ message: 'User already exists' });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });






    // Get all registered users (admin only)
    app.get('/user', verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

  app.patch('/user/:id/role', verifyToken, verifyAdmin, async (req, res) => {
  const userId = req.params.id;
  const { role } = req.body;

  if (!role || !['user', 'admin'].includes(role)) {
    return res.status(400).send({ message: 'Invalid role' });
  }

  const result = await userCollection.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { role } }
  );
  res.send(result);
});


    // Check if user is admin
    app.get('/user/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).send({ admin: false });
      }
      const user = await userCollection.findOne({ email });
      const isAdmin = user?.role === 'admin';
      res.send({ admin: isAdmin });
    });

    // Save workout
    app.post('/workouts', verifyToken, async (req, res) => {
      const workout = req.body;
      const result = await workoutCollection.insertOne(workout);
      res.send(result);
    });

    // Get workouts of logged-in user
    app.get('/workouts', verifyToken, async (req, res) => {
      const workouts = await workoutCollection.find({ userEmail: req.decoded.email }).toArray();
      res.send(workouts);
    });

    // Get workouts by email (for admin)
    app.get('/workouts/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const workouts = await workoutCollection.find({ userEmail: email }).toArray();
      res.send(workouts);
    });

    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

run().catch(console.dir);

// ===== START SERVER =====
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
