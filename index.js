const express = require('express');
const { MongoClient } = require('mongodb');
const app = express();
const cors = require('cors');
const admin = require("firebase-admin");
const port = process.env.PORT || 5000;
require('dotenv').config();
const ObjectId = require('mongodb').ObjectId;
const fileUpload = require('express-fileupload');

const stripe = require("stripe")(process.env.STRIPE_SECRET);

//firebase sdk file server
const serviceAccount = require('./doctors-portal-firebase-adminsdk.json');
//const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
console.log(serviceAccount);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

//middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wvpgl.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
//console.log(uri);
async function verifyToken (req, res, next){
  if(req.headers.authorization.startsWith('Bearer ')){
    const token = req.headers.authorization.split(' ')[1];
    try{
      const decodedUser = await admin.auth().verifyIdToken(token);
      req.decodedEmail = decodedUser.email;
    }
    catch{

    }
  }
  next();
}

async function run() {
  try {
    await client.connect();
    console.log('database connected');
    const database = client.db('doctors_portal');
    const appointmentCollection = database.collection('appiontments');
    const usersCollection = database.collection('users');
    const doctorsCollection = database.collection('dostors');

    app.get('/appointments',verifyToken, async(req,res)=>{
      const email = req.query.email;
      const date = new Date(req.query.date).toLocaleDateString();
      //console.log(date);
      const query = {email: email, date: date};
      //console.log(query);
      const cursor = appointmentCollection.find(query);
      const appointments = await cursor.toArray();
      res.json(appointments);
    });
    app.get('/appointments/:id',async(req,res)=>{
      const id = req.params.id;
      const query = { _id: ObjectId(id)};
      const result = await appointmentCollection.findOne(query);
      res.send(result);
    });

    app.post('/appointments', async (req, res) =>{
          const appointment = req.body;
          const result = await appointmentCollection.insertOne(appointment);
          //console.log(result);
          res.json(result)
      });

      //appointment payment update
      app.put('/appointments/:id',async(req,res)=>{
        const id = req.params.id;
        const filter = { _id: ObjectId(id) };
        const updateDoc = {$set: {
          payment: payment
        }};
        const result = await appointmentCollection.updateOne(filter, updateDoc);
        res.json(result);
      });

      //search admin
      app.get('/users/:email', async(req,res)=>{
        const email=req.params.email;
        const query = {email: email};
        const user = await usersCollection.findOne(query);
        let isAdmin = false;
        if(user.role === 'admin'){
          isAdmin= true;
        }
        res.json({admin: isAdmin});
      });

      app.post('/users', async(req,res)=>{
        const user = req.body;
        const result = await usersCollection.insertOne(user);
        //console.log(result);
        res.json(result);
      });

      //update google sign user
      app.put('/users', async(req,res)=>{
        const user = req.body;
        const filter = {email: user.email};
        const options = {upsert: true};
        const updateDoc = {$set: user};
        const result = await usersCollection.updateOne(filter, updateDoc,options);
        res.json(result);
      });

      //admin update
      app.put('/users/admin',verifyToken, async(req,res)=>{
        const user = req.body;
        console.log('put', req.headers.authorization);
        const requester = req.decodedEmail;
        if(requester){
          const requesterAccount = await usersCollection.findOne({email: requester});
          if(requesterAccount.role === 'admin'){
            const filter = {email: user.email};
            const updateDoc = {$set: {role: 'admin'}};
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.json(result);
          }
        }
        else{
          res.status(403).json({message: 'you do not have admin access'});
        }
      })
      
      //payment
      app.post('/create-payment-intent', async (req, res) => {
        const paymentInfo = req.body;
        const amount = paymentInfo.price * 100;
        const paymentIntent = await stripe.paymentIntents.create({
          currency: 'usd',
          amount: amount,
          payment_method_types: ["card",],
        });
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      });

      //image display
      app.get('/doctors', async(req,res)=>{
        const cursor = doctorsCollection.find({});
        const doctors = await cursor.toArray();
        //console.log(doctors);
        res.json(doctors);
      })

      //image add
      app.post('/doctors', async(req,res)=>{
        const name=req.body.name;
        const email=req.body.email;
        const pic=req.files.image;
        const picData = pic.data;
        const encodedPic = picData.toString('base64');
        const imageBuffer = Buffer.from(encodedPic, 'base64');
        const doctor ={
          name,
          email,
          image: imageBuffer
        };
        const result = await doctorsCollection.insertOne(doctor);
        //console.log(result);
        res.json(result);
      })


  } finally {
    //await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening at ${port}`)
})