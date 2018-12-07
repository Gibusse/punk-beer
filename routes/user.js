const Router = require('express-promise-router');
const db = require('../db');

const router = new Router();

router.post('/signin', (req, res, next) => {
    db.query('SELECT pseudo,password FROM users WHERE pseudo=$1 AND password=$2', [pseudo, password], (err, res) => {
        if (err) {
            return next(err)
        }
        res.send(res.rows[0])
    })
});