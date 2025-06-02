const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const axios = require('axios');
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






// ===== VERIFY TOKEN MIDDLEWARE =====
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







// ===== MAIN RUN FUNCTION =====
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

    // Root
    app.get('/', (req, res) => {
      res.send('SmartFit Server Running ');



    });



  app.post('/api/ai', async (req, res) => {
  const prompt = req.body.prompt;
  if (!prompt) return res.status(400).json({ message: "Prompt is required" });

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo', // or 'gpt-4' if you have access
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
    console.error("Error from OpenAI API:", error.response?.data || error.message);
    res.status(500).json({ message: "Failed to get AI response" });
  }
});




    // Generate JWT token
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    });





    // Check if user is admin
    app.get('/user/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.status(403).send({ admin: false, message: 'Forbidden access' });
      }

      const user = await userCollection.findOne({ email });
      const isAdmin = user?.role === 'admin';
      res.send({ admin: isAdmin });
    });





    // Save a workout log
    app.post('/workouts', verifyToken, async (req, res) => {
      const workout = req.body;
      const result = await workoutCollection.insertOne(workout);
      res.send(result);
    });




    // ===== Optional: Get all workouts for a user (example) =====
    app.get('/workouts/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }

      const workouts = await workoutCollection.find({ email }).toArray();
      res.send(workouts);
    });

    console.log("Connected to MongoDB");
  } catch (error) {
    console.error(" Error connecting to MongoDB:", error);
  }
}

run().catch(console.dir);

// ===== START SERVER =====
app.listen(port, () => {
  console.log(` Server running at http://localhost:${port}`);
});
