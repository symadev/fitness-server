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
    const sleepCollection = db.collection("sleeps");
    const nutritionCollection = db.collection("nutritions");




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







    // POST: Add nutrition log
app.post('/nutritions', verifyToken, async (req, res) => {
  const nutrition = req.body;

  // Force set userEmail from token
  nutrition.userEmail = req.decoded.email;

  const result = await nutritionCollection.insertOne(nutrition);
  res.send(result);
});

// GET: Get nutrition logs of logged-in user
app.get('/nutritions', verifyToken, async (req, res) => {
  const email = req.decoded.email;
  const nutritions = await nutritionCollection.find({ userEmail: email }).toArray();
  res.send(nutritions);
});

// GET: For admin to get user logs
app.get('/nutritions/:email', verifyToken, async (req, res) => {
  const email = req.params.email;
  if (req.decoded.email !== email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }
  const nutritions = await nutritionCollection.find({ userEmail: email }).toArray();
  res.send(nutritions);
});






// POST: Add sleep log
app.post("/sleeps", verifyToken, async (req, res) => {
  const sleep = req.body;
  sleep.userEmail = req.decoded.email;
 const result = await sleepCollection.insertOne(sleep);

  res.send(result);
});

// GET: Get sleep logs for logged-in user
app.get("/sleeps", verifyToken, async (req, res) => {
  const email = req.decoded.email;
  
   const sleeps = await sleepCollection.find({ userEmail: email }).toArray()
  res.send(sleeps);
});

// GET: Get sleep logs for specific email (admin view)
app.get("/sleeps/:email", verifyToken, async (req, res) => {
  const email = req.params.email;
  if (req.decoded.email !== email) {
    return res.status(403).send({ message: "Forbidden access" });
  }
  const sleeps = await sleepCollection.find({ userEmail: email }).toArray();
  res.send(sleeps);
});


    // Save workout
  // Save workout
app.post('/workouts', verifyToken, async (req, res) => {
  const workout = req.body;

  // Always take the email from decoded token
  workout.userEmail = req.decoded.email;
   // Ensure date is set correctly
  workout.date = workout.date || new Date().toISOString();

  const result = await workoutCollection.insertOne(workout);
  res.send(result);
});


    app.get('/workouts', verifyToken, async (req, res) => {
  const email = req.decoded.email;
  const workouts = await workoutCollection.find({ userEmail: email }).toArray();
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
