require('dotenv').config();
const helmet = require('helmet');
const MongoClient = require('mongodb').MongoClient;
const express = require('express');
const app = express();

app.use(helmet());
app.use('view engine', 'ejs');
app.use((req,res,next) => {
    const ip = req.connection.remoteAddress || req.headers['x-forwarded-for'];
    if(ip === '61.98.214.252') {
        next();
    }
})

MongoClient.connect(process.env.DB_URL, function(err, client) {
    if(err) return console.log(err);
  
    db = client.db('juntamsae');
  
    app.listen(process.env.PORT, function(req, res) {
      console.log('listening on 8080');
    })
  })

app.get('/', (req,res) => {
    res.render('main.ejs');
})

app.get('*', (req,res) => {
    res.send('404 Not Found');
})