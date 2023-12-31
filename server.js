require('dotenv').config();
const MongoClient = require('mongodb').MongoClient;
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const { ObjectId } = require('mongodb');
const util = require('util');
const crypto = require('crypto');
const methodOverride = require('method-override');
const cookieParser = require('cookie-parser');
const express = require('express');
const app = express();

app.use(session({secret: process.env.SECRET_CODE, resave: true, saveUninitialized: false}));
app.use(express.urlencoded({extended: true}));
app.use(passport.initialize());
app.use(passport.session());
app.use(methodOverride('_method'));
app.use(express.static('public'));
app.use(cookieParser());
app.set('view engine', 'ejs');

const isStudentId = (v) => {
    let regex = /^\d{10}$/;
  
    return regex.test(v);
}

// function areYouIn205(req,res,next) {
//     const ip = req.connection.remoteAddress || req.headers['x-forwarded-for'];
//     const juntamsaeIp = ['61.98.214.252','61.98.214.249', '61.98.214.250'];
//     if(ip in juntamsaeIp) {
//         next();
//     }
//     else {
//         res.send("<script>alert('205호에서 퀴즈를 제출하여 주세요!!');  window.location.replace('/quiz/member'); </script>")
//     }
// }

var db;

MongoClient.connect(process.env.DB_URL, (err, client) => {
    if(err) return console.log(err);
  
    db = client.db('juntamsae');
  
    app.listen(process.env.PORT, (req, res) => {
      console.log('listening on 8080');
    })
})

const randomBytesPromise = util.promisify(crypto.randomBytes);
const pbkdf2Promise = util.promisify(crypto.pbkdf2);

const createSalt = async () => {
    const buffer = await randomBytesPromise(64);
  
    return buffer.toString("base64");
}
const createHashedPassword = async (pw) => {
    const salt = await createSalt();
    const key = await pbkdf2Promise(pw, salt, parseInt(process.env.CRYPTO_CODE), 64, "sha512");
    const hashedPassword = key.toString("base64");
  
    return { hashedPassword, salt };
}
const verifyPassword = async (pw, userSalt, userPassWord) => {
    const key = await pbkdf2Promise(pw, userSalt, parseInt(process.env.CRYPTO_CODE), 64, "sha512");
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
        db.collection('user').findOne({ name: InputName }, function (err, result) {
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

app.get('/', (req,res) => {
    res.render('main.ejs');
})

app.get('/fail', (req,res) => {
    res.render('fail.ejs');
})

app.get('/profile/:id', Logined, (req,res) => {
    db.collection('user').findOne({_id: new ObjectId(req.params.id)}, (err,result) => {
        res.render('profile.ejs', {user: result});
    })
})

app.get('/login', (req,res) => {
    res.render('login.ejs');
})

app.get('/quiz/member', Logined, (req,res) => {
    db.collection('quiz').findOne({name: 'quiz'}, (err,result) => {
        res.render('quiz_member.ejs', {result: result, user: req.user});
    })
})

app.get('/quiz/manager', ManagerLogined, (req,res) => {
    db.collection('quiz').findOne({name: 'quiz'}, (err,result) => {
        res.render('quiz_manager.ejs', {result});
    })
})

app.get('/list/:sort', ManagerLogined, (req,res) => {
    if(req.params.sort == 'register') {
        db.collection('user').find({role: 'member'}).toArray((err,result) => {
            res.render('list.ejs', {result});
        })
    } else if(req.params.sort == 'name') {
        db.collection('user').find({role: 'member'}).toArray((err,result) => {
            result = result.sort((a,b) => {return a.name - b.name});
            res.render('list.ejs', {result});
        })
    } else {
        db.collection('user').find({role: 'member'}).toArray((err,result) => {
            result = result.sort((a,b) => {return a.num - b.num});
            res.render('list.ejs', {result});
        })
    }
})

app.get('/quiz/member/modification/:id', (req,res) => {
    db.collection('user').findOne({_id: new ObjectId(req.params.id)}, (err,user) => {
        db.collection('quiz').findOne({name: 'quiz'}, (err,result) => {
            res.render('quiz_member_modification.ejs', {result, user});
        })  
    })
})

app.put('/quiz/manager/commit', ManagerLogined, (req,res) => {
    db.collection('quiz').updateOne({name: 'quiz'}, {$set: {quiz: req.body.quiz}}, (err,result) => {
        res.send("<script>alert('퀴즈가 변경되었습니다!');  window.location.replace('/quiz/manager'); </script>")
    })
})

app.put('/quiz/member/answer/:id', Logined, (req,res) => {
    const ip = req.connection.remoteAddress || req.headers['x-forwarded-for'];
    db.collection('user').updateOne({_id: new ObjectId(req.params.id)}, {$set: {answer: req.body.answer, ip: ip}}, (err,result) => {
        res.send("<script>alert('퀴즈의 정답이 제출되었습니다!');  window.location.replace('/profile/" + req.params.id + "'); </script>")
    })
})

app.put('/list/answer/true/:id', ManagerLogined, (req,res) => {
    db.collection('user').updateOne({_id: new ObjectId(req.params.id)}, {$inc: {num: 1}}, (err,result) => {
        res.status(200).send('edit attendenc num +1 success');
    })
})

app.put('/list/answer/false/:id', ManagerLogined, (req,res) => {
    db.collection('user').updateOne({_id: new ObjectId(req.params.id)}, {$inc: {num: -1}}, (err,result) => {
        res.status(200).send('edit attendenc num -1 success');
    })
})

app.delete('/list/elimination/:id', ManagerLogined, (req,res) => {
    db.collection('user').deleteOne({_id: new ObjectId(req.params.id)}, (err,result) => {
        res.status(200).send('delete member success');
    })
})

app.delete('/list/elimination/all', (req,res) => {
    db.collection('user').deleteMany({role: 'member'}, (err,result) => {
        res.status(200).send('delete all member success');
    })
})

app.post('/login',passport.authenticate('local', {failureRedirect: '/fail'}), haveClientId, function(req, res) {
    if(req.user.role === 'manager') {
        res.redirect('/quiz/manager');
    } else {
        res.cookie('clientId', req.user.name, {maxAge: 3600000});
        res.redirect('/quiz/member');
    }
});

function haveClientId(req,res,next) {
    const clientId = req.cookies.clientId;

    if(!clientId || !req.user || clientId == req.user.name) {
        next();
    } else {
        res.send('<script>alert("왜 다른 계정으로 로그인하려고 하세요? ㅎㅎㅎ"); window.location.replace("/"); </script>');
    }
}

app.post('/register', (req,res) => {
    if(!isStudentId(req.body.studentId)) {
        return res.send('<script>alert("경희대학교 학번이 아닙니다! 학번을 제대로 입력해주세요!"); window.location.replace("/login"); </script>')
    } else {
        var createdSalt, createdId;
        createHashedPassword(req.body.studentId).then((result) => {
            createdSalt = result.salt;
            createdId = result.hashedPassword;
            var date = new Date();
            date = date.toLocaleString('ko-kr');
            db.collection('user').insertOne({name: req.body.name, subject: req.body.subject, studentId: createdId, salt: createdSalt, num: 0, answer: '', role: 'member', date: date, ip: ''}, (err,result) => {
                res.send("<script>alert('회원가입에 성공하였습니다! 로그인해주세요!');  window.location.replace('/login'); </script>");
            })      
        })
    }
})

app.get('*', (req,res) => {
    res.send('404 Not Found');
})