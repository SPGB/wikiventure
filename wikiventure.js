/*
* Wikiventure
* a crowd-funded choose your own adventure
* @AUTHOR SPGB
* @CONTRIBUTERS -
* @NOTES all choices should be edittable by almost anyone, all changes transparent
*/
var express = require('express')
  , http = require('http')
  , path = require('path')
  , bcrypt = require('bcrypt-nodejs')
  , SALT_WORK_FACTOR = 10
  , crypto = require('crypto')
  , assert = require('assert')
  , session = require('express-session')
  , MongoStore = require('connect-mongo')(session)
  , morgan = require('morgan')
  , bodyParser = require('body-parser')
  , cookieParser = require('cookie-parser');

var mongoose = require('mongoose');
var db = mongoose.connection;

var config = require('./config.js');

mongoose.connect('mongodb://' + config.db.host + ':' + config.db.port + '/' + config.db.db, { auto_reconnect: true, user: config.db.username, pass: config.db.password }, function(err) {
    if (err) throw err;
    console.log('Successfully connected to MongoDB');
});

var app = express();
// all environments
app.set('port', 80);
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 31557600000 }));
app.use(morgan('combined'));
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(bodyParser());
app.use(cookieParser())
app.use(session({ 
	secret: config.secret, 
	cookie: { maxAge: 360000000000 },
	store: new MongoStore(config.db)
}));

/*
* SCHEMA THINGS
* settings up our messgae (scene), revision, item, and user objects
*/
var messageSchema = new mongoose.Schema({
	text: { type: String, },
	last_message: { type: [String], required: true },
	action: { type: [String], required: true },
	room: { type: Number, default: 0 }, 
	updated_at: { type: Date },
	views: { type: Number, default: 0 },
	ip: { type: String },
	is_active: { type: Boolean, default: true }
});
messageSchema.pre('save', function(next) {
	this.updated_at = new Date;
	next();
});
var Message = mongoose.model('Message', messageSchema);

var revisionSchema = new mongoose.Schema({
	message_id: { type: String, required: true },
	text: { type: String },
	last_message: { type: [String], required: true },
	action: { type: [String], required: true },
	created_at: { type: Date },
	ip: { type: String }
});
revisionSchema.pre('save', function(next) {
	if (!this.created_at) this.created_at = new Date;
	next();
});
var Revision = mongoose.model('Revision', revisionSchema);
 
var itemSchema = new mongoose.Schema({
	name: { type: String, required: true },
	text: { type: String },
	from_scene: { type: [String], required: true },
	action: { type: [String] },
	ip: { type: String }
});
var Item = mongoose.model('Item', itemSchema);


var userSchema = new mongoose.Schema({
	name: { type: String, required: true , index: {unique: true}},
	level: { type: Number, default: 0 },
	password: { type: String },
	created_at: { type: Date },
	updated_at: { type: Date },
	ip: { type: String }
});
userSchema.pre('save', function(next) {
    var user = this;
	user.updated_at = new Date;
	if ( !user.created_at ) {
		user.created_at = new Date;
	}
	// only hash the password if it has been modified (or is new)
	if (!user.isModified('password')) return next();

	// generate a salt
	bcrypt.genSalt(SALT_WORK_FACTOR, function(err, salt) {
		if (err) return next(err);

		// hash the password using our new salt
		bcrypt.hash(user.password, salt, function(err, hash) {
			if (err) return next(err);

			// override the cleartext password with the hashed one
			user.password = hash;
			next();
		});
	});
});
userSchema.methods.comparePassword = function(candidatePassword, cb) {
    bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
        if (err) return cb(err);
        cb(null, isMatch);
    });
};
var User = mongoose.model('User', userSchema);

/*
* ROUTES - general
*/
app.get('/', function (req, res) {
	if (req.session.last && req.session.last instanceof Array && req.session.last.length > 0) { //has already started
		var scenes = req.session.last;
		//var query_scenes = (scenes.length > 1)? [scenes[scenes.length - 1], scenes[scenes.length - 2]] : [scenes[scenes.length - 1]];
		Message.find({ _id: {$in: scenes} }, function (err, msgs) {
			//var changes = [];
			for (var i = 0; i < msgs.length; i++) {
				if (scenes[i] != msgs[i]._id) {
					var x = 0;
					var id = msgs[i]._id;
					for (var  j = 0; j < scenes.length; j++) {
						if (scenes[j] == id) { x = j; break; }
					}
					//changes.push('swapping ' + x + '(' + msgs[i]._id + ') and ' + i);
					msgs[i] = msgs.splice(x, 1, msgs[i])[0];
				}
			}
			//return res.json({c: changes, m: msgs, s: scenes });
			if (err || !msgs) return res.send('error! ' + err); 
			Message.find({
				_id: { $nin: scenes },
				$or:[ {'last_message':msgs[msgs.length - 1]._id}, { $and: [{'last_message':'*'}, {'room': msgs[msgs.length - 1].room}, {'action': {$ne:'begin'} }] } ],
				action: /^(?!examine).*$/i
			}, function (err, suggest_msgs) {
				var s = [];
				for (var i = 0; i < suggest_msgs.length; i++) {
					var m = suggest_msgs[i];
					for (var j = 0; j < m.action.length; j++) {
						if (j > 0) {
							s.push(m.action[j]);
						} else {
							s.unshift(m.action[j]);
						}
					}
					s.push('begin');
				}
				res.render('index', { 
					msgs: msgs,
					scenes: scenes, 
					suggestions: s, 
					items: req.session.items, 
					current_user: req.session.user
				});
			});	
		});
	} else {
		res.render('index', { 
			msgs: [{
				text: '<h1 style="font-size: 30px; position: static; padding: 0;"><span>Wiki</span>venture</h1>an open choose-your-own-adventure. You can take any action, edit any result. Be your own adventurer. \n \n Type "begin" at the bottom to get started.\n \n Only the top five suggestions will show up, Explore and choose your own path by typing in the box at the bottom', 
				room: 0
			}], 
			suggestions: ['begin'], 
			current_user: req.session.user
		});
	}
});

var routes_item = require('./routes/item');
app.use('/item', routes_item);
var routes_user = require('./routes/user');
app.use('/user', routes_user);
var routes_scene = require('./routes/scene');
app.use('/scene', routes_scene);

app.get('/restart', function (req, res) {
	req.session.last = [];
	req.session.items = [];
	res.redirect('/');
});

/*
* ROUTES - misc
*/
app.get('/revisions', function (req, res) {
	Revision.find({ }, function (err, revs) {
			res.render('revisions', {revs: revs});
	});
});
app.get('*', function (req, res) {
	res.render('index', { msgs: [{text:'404! File not found'}] });
});

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));

});