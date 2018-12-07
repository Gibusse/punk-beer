const express = require('express'),
    mountRoutes = require('./routes/routes'),
    axios = require('axios'),
    bodyParser = require('body-parser'),
    session = require('express-session'),
    cookieParser = require('cookie-parser'),
    { Pool } = require('pg'),
    process = require('process'),
    flash = require('connect-flash'),
    toastr = require('express-toastr'),
    paginate = require('express-paginate'),
    events = require('events');

const connectionString = 'postgres://xatgpwcgwsujic:7a0f5b673803d49b505e95d2cfa5e9402fc28cecfc78db881d0f7c37483c790a@ec2-184-72-234-230.compute-1.amazonaws.com:5432/d9h3dsdgl1f6iu';
//const connectionString = 'postgres://postgres:coolbreeze01@localhost:5432/postgres';

const app = express();
/*mountRoutes(app);*/

// Connect to DB
const pool = new Pool({
    connectionString: connectionString
});

/*const client = new Client ({
    connectionString: connectionString
});

client.connect();*/

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1)
});



let eventEmitter = new events.EventEmitter();

// Middleware
app.use(bodyParser.json(200, {'Content-Type': 'javascript/json'}))
    .use(bodyParser.urlencoded({extended: false}))
    .use(cookieParser())
    .use(session({
        secret: 'punk-beer-API',
        resave: false,
        saveUninitialized: true
    }))
    .use('/assets', express.static('public'))
    .use(flash())
    .use(toastr())
    .use(paginate.middleware(10, 50));

app.set('view engine', 'ejs');


const products = [];
let user = [];
let favorites = [];


/*
** Connection à la page d'index
 */
app.get('/index', (req, res) => {

    if(session.uniqueID === undefined || session.uniqueID === null) {

        res.redirect('/login');

    } else {

        displayFavorites(favorites, res, req)
    }

});

/*
** Déconnection
*   @Param session: undefined
 */
app.get('/logout', (req, res) => {

    res.redirect('/login');

    return session.uniqueID = undefined;
});


app.get('/about', (req, res) => {

    if(session.uniqueID === undefined || session.uniqueID === null) {
        res.redirect('/login');
    } else {

        req.toastr.clear();
        res.render('pages/about', {title: 'About', pseudo: session.uniqueID, req:req });
    }
});


/*
** Redirection vers la page de connection
 */
app.get('/', (req, res) => {
    res.redirect('/login');
});


/*
** Connection à la page d'enregistrement
 */
app.get('/login', (req, res) => {

    res.render('pages/login', {title: 'Login', req:req});
});

/*
** Requête vers l'API pour charger la page de produit
* @Return response
 */
app.post('/list', (req, res) => {

    if(session.uniqueID !== undefined) {

        displayList(products, favorites, res, req);

    } else {

        res.redirect('/login');
    }

});


/*
** Ajouter un favoris à partir de son id
 */
app.post('/list/:id', (req, res) => {

    /**
     * {
     * "id":"81",
     * "name":"India Session Lager - Prototype Challenge",
     * "tagline":"Refreshing Hop Fix.",
     * "description":"BrewDog’s level of dry-hop to a beer formed with a baseline of 100% pilsner malt – and at under 4.5% ABV – gives you a style that flirts at the edges of several others. Think aromas of fresh cut grass, nettle, white grape, melon, tangerine - with similar flavours leading to a dry, bitter finish.",
     * "contributed_by":"Sam Mason <samjbmason>"}
     *
     * Alter table
     * ALTER TABLE public.favorites ALTER COLUMN fav_name TYPE varchar(120) USING fav_name::varchar(120);
     */

    (async () => {

        // Connection à la bD
        const client = await pool.connect();
        try {

            // On vérifie si le produit existe dans la liste des favoris
            const favoriteExist = await client.query('SELECT favorites.id FROM favorites WHERE favorites.id = $1', [req.body.id]);

            if(favoriteExist.rowCount === 1 ) {

                // Le produit existe
                let favorites = [];
                reloadListWhenExist(products, favorites, res, req);

            } else {

                /**
                 *  le produit n'existe pas, on sélectionne l'utilisateur em cours
                 */
                const userExist = await client.query('SELECT * FROM users WHERE user_id = $1',[session.ID]);

                user = JSON.stringify(userExist.rows[0].user_id);

                // Si il existe
                if(userExist.rowCount === 1) {

                    // On enregistre son produit favori
                    const fav = await client.query('INSERT INTO favorites (fav_name, fav_tagline, fav_description, contributed_by, id) VALUES ($1, $2, $3, $4, $5) RETURNING favorite_id',
                        [req.body.name, req.body.tagline, req.body.description, req.body.contributed_by, req.body.id]);

                    /*const lastId = await client.query('SELECT currval(pg_get_serial_sequence('favorites', 'favorite_id'))');*/

                     // On vérifie que l'enregistrement sait bien passé
                    if (fav.rowCount === 1) {

                        // On fait une insertion dans la table des users_favorites
                        await client.query('INSERT INTO users_favorites(user_id, favorite_id, created_at) VALUES ($1, $2, CURRENT_DATE)',
                            [user, fav.rows[0].favorite_id]);

                        req.toastr.success('Produit ajouté', null, {closeButton: true});


                        displayList(products, favorites, res, req);


                    } else {

                        req.toastr.error('Un problème est survenu lors de l\'enregistrement', null, {closeButton: true});

                        displayList(products, favorites, res, req);


                    }


                }
            }
        } finally {
            client.release()
        }
    })().catch((e) => {
        console.log(e.stack);
    });


});



/*
** Charger la liste des produits ?page=2&per_page=80
 */

function displayList(products, favorites, res, req) {
    axios.get('https://api.punkapi.com/v2/beers?page=2&per_page=80')
        .then( (response) => {
            let results = response.data;
            const itemCount = results.count;
            const pageCount = Math.ceil(results.count / req.query.limit);

            if (response.status === 200) {

                for (let i = 0; i < results.length; i++) {
                    products.push(results[i]);
                }

                loadingFavoris(favorites);

                res.render('pages/products',{title: 'Products', products: products, pseudo: session.uniqueID,
                    favorites: favorites, req: req, pageCount: pageCount, itemCount: itemCount, pages: paginate.getArrayPages(req)(2, pageCount, req.query.page)})

            } else {

                req.toastr.clean();
                req.toastr.warning('Erreur lors du chargement de la liste des produits', null, {closeButton: true});
                res.render('pages/error', {req:req});
            }


        })
        .catch((error) => {

            req.toastr.warning('Erreur lors du chargement de la liste des produits', null, {closeButton: true});
            res.render('pages/error',{title: 'Error', req:req})
        });

}


/**
 *  Charger lorsque le produit sélectionné existe
 */
function reloadListWhenExist(products, favorites, res, req) {

    if(session.uniqueID === undefined) {

        res.redirect('/login');

    } else {

        axios.get('https://api.punkapi.com/v2/beers?page=2&per_page=80')
            .then( (response) => {
                let results = response.data;
                const itemCount = results.count;
                const pageCount = Math.ceil(results.count / req.query.limit);

                if (response.status === 200) {

                    for (let i = 0; i < results.length; i++) {
                        products.push(results[i]);
                    }

                    loadingFavoris(favorites);

                    req.toastr.info('Le produit sélectionné existe déjà dans vos favoris', null, {closeButton: true});
                    res.render('pages/products',{title: 'Products', products: products, pseudo: session.uniqueID,
                        favorites: favorites, req: req, pageCount: pageCount, itemCount: itemCount, pages: paginate.getArrayPages(req)(2, pageCount, req.query.page)});

                } else {

                    req.toastr.warning('Erreur lors du chargement de la liste des produits', null, {closeButton: true});
                    res.render('pages/error', {req:req});
                }

            })
            .catch((error) => {
                req.toastr.warning('Erreur lors du chargement de la liste des produits', null, {closeButton: true});
                res.render('pages/error',{title: 'Error', req:req})
            });
    }

}


/*
** Charger la liste des favorites
 */
function displayFavorites(favorites, res, req) {

    (async () => {
        const client = await pool.connect();
        try {
            const results = await client.query('SELECT users.user_id,  favorites.favorite_id, favorites.fav_name ' +
                'FROM users INNER JOIN users_favorites ON (users.user_id = users_favorites.user_id) ' +
                'INNER JOIN favorites ON (favorites.favorite_id = users_favorites.favorite_id);');



            if(results.rowCount > 0) {

                favorites.length = 0;

                for(j = 0; j < results.rows.length; j++) {

                    if(favorites.favorite_id !== results.rows[0].favorite_id){

                        favorites.push(results.rows[j]);
                    }
                }

            }

            res.render('pages/index', {title: 'Accueil', pseudo: session.uniqueID, favorites: favorites, req:req });

        } finally {
            client.release()
        }
    })().catch((e) => {
        console.log(e.stack);
    });

}


/**
 * Loading favoris
 */
function loadingFavoris(favorites) {

    return (async () => {
        const client = await pool.connect();
        try {
            const results = await client.query('SELECT users.user_id,  favorites.favorite_id, favorites.fav_name ' +
                'FROM users INNER JOIN users_favorites ON (users.user_id = users_favorites.user_id) ' +
                'INNER JOIN favorites ON (favorites.favorite_id = users_favorites.favorite_id);');

            if(results.rowCount > 0) {

                favorites.length = 0;

                for(j = 0; j < results.rows.length; j++) {

                    favorites.push(results.rows[j]);

                }

            }

        } finally {
            client.release()
        }
    })().catch((e) => {
        console.log(e.stack);
    });
}


/**
 *  Chargement des produits
 */

function loadproducts() {
    axios.get('https://api.punkapi.com/v2/beers?page=2&per_page=80')
        .then( (response) => {
            let results = response.data;

            if (response.status === 200) {

                for (let i = 0; i < results.length; i++) {
                    products.push(results[i]);
                }

                return products;
            } else {

            }


        })
        .catch((error) => {

            console.log(error);
        });
}


/*
** Enregistrer un nouveul utilisateur
 */
app.post('/signup', (req, res) => {

    (async () => {
        const client = await pool.connect();
        try {
            const userExist = await client.query('SELECT users.pseudo, users.user_email FROM users ' +
                                                  'WHERE pseudo = $1 AND user_email = $2',
                                                [req.body.pseudo, req.body.email]);

            if(userExist.rowCount > 0){

                req.toastr.error('Erreur de création de compte', 'Le pseudo ou l\'email existe déjà', null, {closeButton: true});
                res.redirect('/login');
            } else {
                const result = await client.query('INSERT INTO users (username, pseudo, password, user_email, created_at, updated_at) VALUES ($1, $2, $3, $4, CURRENT_DATE, CURRENT_DATE )',
                    [req.body.name, req.body.pseudo, req.body.password, req.body.email]);

                if(result.rowCount === 1) {

                    session.uniqueID = req.body.pseudo;

                    req.toastr.success('Utilisateur créé avec succès', 'Bienvenue dans l\' punk beer '+ session.uniqueID+'', null, {closeButton: true});
                    res.redirect('/index');
                }


            }

        } finally {
            client.release()
        }
    })().catch((e) => {
        console.log(e.stack);
        res.redirect('/login')
    });
});


/*
** Connection d'un utilisateur
 */
app.post('/signin', (req, res) => {

    (async () => {
        const client = await pool.connect();
        try {
            const result = await client.query('SELECT user_id, pseudo, password FROM users WHERE pseudo = $1 AND password = $2 LIMIT 1', [req.body.pseudo, req.body.password]);

            if(result.rowCount === 1) {

                session.uniqueID = req.body.pseudo;
                session.ID = result.rows[0].user_id;

                req.toastr.success( 'Bienvenue dans l\'application punk beer '+ session.uniqueID+'', null, {closeButton: true});
                res.redirect('/index');

            } else {

                req.toastr.error('Erreur de connexion', 'Pseudo ou mot de passe erroné', null, {closeButton: true});
                res.redirect('/login');
            }



        } finally {
            client.release()
        }
    })().catch((e) => {


        res.redirect('/login');
    });

});



let port = process.env.PORT;
if (port === undefined || port === "") {
    port = 3000;
}
app.listen(port, () => {

    console.log('localhost:3000');
});
