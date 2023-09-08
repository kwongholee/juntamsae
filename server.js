require('dotenv').config();
const helmet = require('helmet');
const MongoClient = require('mongodb').MongoClient;
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const { ObjectId } = require('mongodb');
const util = require('util');
const crypto = require('crypto');
const express = require('express');
const app = express();

app.use(helmet());
app.use('view engine', 'ejs');
app.use(session({secret: process.env.SECRET_CODE, resave: true, saveUninitialized: false}));
app.use(express.urlencoded({extended: true}));
app.use(passport.initialize());
app.use(passport.session());

function areYouIn205(req,res,next) {
    const ip = req.connection.remoteAddress || req.headers['x-forwarded-for'];
    const juntamsaeIp = ['61.98.214.252','61.98.214.249']
    if(ip in juntamsaeIp) {
        next();
    }
}

const randomBytesPromise = util.promisify(crypto.randomBytes);
const pbkdf2Promise = util.promisify(crypto.pbkdf2);

const createSalt = async () => {
    const buffer = await randomBytesPromise(64);
  
    return buffer.toString("base64");
}
const createHashedPassword = async (pw) => {
    const salt = await createSalt();
    const key = await pbkdf2Promise(pw, salt, process.env.CRYPTO_CODE, 64, "sha512");
    const hashedPassword = key.toString("base64");
  
    return { hashedPassword, salt };
}
const verifyPassword = async (pw, userSalt, userPassWord) => {
    const key = await pbkdf2Promise(pw, userSalt, process.env.CRYPTO_CODE, 64, "sha512");
    const hashedPassword = key.toString("base64");
  
    return hashedPassword === userPassWord;
}

passport.use(new LocalStrategy({
    usernameField: 'name',
    passwordField: 'studentId',
    session: true,
    passReqToCallback: false,
}, async (InputName, InputStudentId, done) => {
    try {
        db.collection('login').findOne({ name: InputName }, function (err, result) {
            if (err) return done(err)
            if (!result) return done(null, false, { message: '존재하지 않는 이름이래요' })
            verifyPassword(InputStudentId, result.salt, result.studentId).then((verified) => {
                if(!verified) return done(null, false, {message: '학번 틀렸어요'})
                else return done(null, result);
            });
        })
    } catch(err) {
        console.log(err);
    }
}));
passport.serializeUser(function (user, done) {
    done(null, user.name);
});
passport.deserializeUser(function (name, done) {
   db.collection('user').findOne({name: name}, (err,result) => {
        done(null, result);
   })
}); 

function Logined(req,res,next) {
    if(req.user) {
        next()
    } else {
        res.send('You are not Logined');
    }
}

function ManagerLogined(req,res,next) {
    if(req.user && req.user.role === 'manager') {
        next()
    } else {
        res.send('You are not Manager!');
    }
}

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

app.get('/profile/:id', (req,res) => {
    db.collection('user').findOne({_id: new ObjectId(req.params.id)}, (err,result) => {
        res.render('profile.ejs', {user: result});
    })
})

app.get('/login', (req,res) => {
    res.render('login.ejs');
})

app.get('/quiz/member', (req,res) => {
    db.collection('quiz').findOne({name: 'quiz'}, (err,result) => {
        res.render('quiz_member.ejs', {result: result});
    })
})

app.get('/quiz/manager', (req,res) => {
    res.render('quiz_manager.ejs');
})

app.get('/list', (req,res) => {
    db.collection('user').find().toArray((err,result) => {
        res.render('list.ejs', {result});
    })
})

app.put('/quiz/manager/commit', (req,res) => {
    db.collection('quiz').updateOne({name: 'quiz'}, {$set: {quiz: req.body.quiz}}, (err,result) => {
        res.status(200).send('set quiz success');
    })
})

app.put('/quiz/member/answer/:id', (req,res) => {
    db.collection('user').updateOne({_id: new ObjectId(req.params.id)}, {$set: {answer: req.body.answer}}, (err,result) => {
        res.status(200).send('edit quiz answer success');
    })
})

app.put('/list/answer/true/:id', (req,res) => {
    db.collection('user').updateOne({_id: new ObjectId(req.params.id)}, {$inc: {num: 1}}, (err,result) => {
        res.status(200).send('edit attendenc num +1 success');
    })
})

app.put('/list/answer/false/:id', (req,res) => {
    db.collection('user').updateOne({_id: new ObjectId(req.params.id)}, {$inc: {num: -1}}, (err,result) => {
        res.status(200).send('edit attendenc num -1 success');
    })
})

app.post('/login',passport.authenticate('local', {failureRedirect: '/fail'}) ,function(req, res) {
    res.redirect('/quiz_member');
});

app.post('/register', (req,res) => {
    var createdSalt, createdId;
    var doublecheck = false;
    createHashedPassword(req.body.studentId).then((result) => {
        createdSalt = result.salt;
        createdId = result.hashedPassword;
        db.collection('user').find.toArray((err,result) => {
            result.map((a,i) => {
                if(result.studentId == req.body.studentId) {
                    doublecheck = true;
                    return res.send("<script>alert('이미 사용중인 학번입니다! 관리자에게 연락해주세요!');  window.location.replace('/register'); </script>");
                }
            })
            if(!doublecheck) {
                db.collection('user').insertOne({name: req.body.name, studentId: createdId, salt: createdSalt, num: 0, answer: ''}, (err,result) => {
                    res.redirect('/quiz_member');
                })
            }
        })
    })
})

app.get('*', (req,res) => {
    res.send('404 Not Found');
})