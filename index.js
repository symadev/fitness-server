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


// ==== MAIN FUNCTION ===
async function run() {
  try {
    await client.connect();




    const db = client.db("Smartfit");
    const userCollection = db.collection("user");
    const workoutCollection = db.collection("workouts");
    const sleepCollection = db.collection("sleeps");
    const nutritionCollection = db.collection("nutritions");
    const bookingCollection = db.collection("bookings");




    // == JWT MIDDLEWARES ==
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





    // == VERIFY ADMIN MIDDLEWARE ==
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await userCollection.findOne({ email });
      if (!user || user.role !== 'admin') {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      next();
    };





    // VERIFY TRAINER MIDDLEWARE
   const verifyTrainer = async (req, res, next) => {
  const email = req.decoded.email;
  const user = await userCollection.findOne({ email });
  if (!user || user.role !== 'trainer') {
    return res.status(403).send({ message: 'Forbidden access' });
  }
  next();
};



  // ROUTES 

   // JWT Token
app.post('/jwt', async (req, res) => {
  const { email } = req.body; 
  if (!email) return res.status(400).send({ message: "Email is required" });

  try {
    const userFromDb = await userCollection.findOne({ email });
    if (!userFromDb) return res.status(404).send({ message: "User not found" });

    const token = jwt.sign(
      { email, role: userFromDb.role || "user" }, 
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "1h" }
    );

    res.send({ token });
  } catch (err) {
    console.error("JWT error:", err);
    res.status(500).send({ message: "Internal Server Error" });
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
      if (!role || !['user', 'admin', 'trainer'].includes(role)) {
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
  try {
    const email = decodeURIComponent(req.params.email);
    
    console.log("Checking admin for:", email);
    console.log("Token email:", req.decoded.email);

    if (req.decoded.email !== email) {
      return res.status(403).send({ admin: false, message: "Email mismatch" });
    }

    const user = await userCollection.findOne({ email });
    
    if (!user) {
      return res.status(404).send({ admin: false, message: "User not found" });
    }

    const isAdmin = user?.role === 'admin';
    console.log("User role:", user.role, "Is admin:", isAdmin);
    
    res.send({ admin: isAdmin });
    
  } catch (error) {
    console.error("Admin check error:", error);
    res.status(500).send({ admin: false, message: "Server error" });
  }
});



    // Get user info by email
    app.get('/user/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });
      if (!user) return res.status(404).send({ message: 'User not found' });

      res.send({
        email: user.email,
        displayName: user.displayName || "",
        photoURL: user.photoURL || "",
        role: user.role || "user" 
      });
    });


    //user bookings
    app.post('/bookings', verifyToken, async (req, res) => {
      const booking = req.body;
      booking.userEmail = req.decoded.email;
      booking.status = "pending"; //default state
      const result = await bookingCollection.insertOne(booking);
      res.send(result);
    });



    //user can see their bookings
    app.get('/bookings', verifyToken, async (req, res) => {
      const email = req.decoded.email;
      const bookings = await bookingCollection.find({ userEmail: email }).toArray();
      res.send(bookings);
    });


    //trainer see his requests

    app.get('/trainer/bookings', verifyToken, verifyTrainer, async (req, res) => {
      const email = req.decoded.email;
      const bookings = await bookingCollection.find({ trainerEmail: email }).toArray();
      res.send(bookings);
    });

    //admin can see all the bookings
    app.get('/admin/bookings', verifyToken, verifyAdmin, async (req, res) => {
      const bookings = await bookingCollection.find().toArray();
      res.send(bookings);
    });




    // Confirm booking by trainer
    app.patch('/bookings/:id/confirm', verifyToken, async (req, res) => {
      const bookingId = req.params.id;
      const trainerEmail = req.decoded.email;

      
      const booking = await bookingCollection.findOne({ _id: new ObjectId(bookingId) });

      if (!booking) return res.status(404).send({ message: "Booking not found" });
      if (booking.trainerEmail !== trainerEmail) return res.status(403).send({ message: "Forbidden" });

      const result = await bookingCollection.updateOne(
        { _id: new ObjectId(bookingId) },
        { $set: { status: "confirmed" } }
      );

      res.send(result);
    });




    //open ai api 

    app.post('/api/ai', async (req, res) => {
      const { message, context } = req.body;

      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      try {
        const systemPrompt = `You are a helpful AI assistant for resume building and career development. Context: ${context || 'general career guidance'}`;

        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: message }
            ],
            temperature: 0.7
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const reply = response.data.choices[0].message.content.trim();
        res.status(200).json({ reply });

      } catch (error) {
        console.error('OpenAI API error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to generate AI response' });
      }
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
    app.post('/workouts', verifyToken, async (req, res) => {
      const workout = req.body;

      //  take the email from decoded token
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


    // Root Route
    app.get('/', (req, res) => {
      res.send('SmartFit Server Running');
    });





    // console.log("Connected to MongoDB");
  } catch (error) {
    // console.error("Error connecting to MongoDB:", error);
  }


}



run().catch(console.dir);


app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
